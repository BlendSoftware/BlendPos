"""
BlendPOS — AFIP Client
Wrapper completo de pyafipws para WSAA (autenticación) y WSFEV1 (facturación)

Flujo:
1. WSAA: Autenticar con certificado X.509 para obtener Token y Sign
2. Cache: Token válido por ~12h, se guarda en memoria
3. WSFEV1: Solicitar CAE con Token y Sign activos
4. Retry: Si token expiró, re-autenticar automáticamente
"""

# IMPORTANTE: Importar py3_compat PRIMERO para monkey-patch hashlib
import py3_compat

import os
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from pathlib import Path

from pyafipws.wsaa import WSAA
from pyafipws.wsfev1 import WSFEv1

from schemas import FacturarRequest, FacturarResponse, ObservacionAFIP

logger = logging.getLogger("afip_client")


class AFIPClient:
    """
    Cliente AFIP que maneja autenticación (WSAA) y facturación electrónica (WSFEV1).
    
    Características:
    - Cache automático de Token y Sign (válido ~12h)
    - Re-autenticación automática si el token expiró
    - Soporte para homologación y producción
    - Manejo de errores AFIP con observaciones estructuradas
    """
    
    def __init__(
        self,
        cuit_emisor: str,
        cert_path: str,
        key_path: str,
        homologacion: bool = True,
        cache_dir: str = "/tmp/afip_cache"
    ):
        """
        Inicializa el cliente AFIP.
        
        Args:
            cuit_emisor: CUIT del emisor (sin guiones)
            cert_path: Ruta al certificado .crt de AFIP
            key_path: Ruta a la clave privada .key
            homologacion: True para testing, False para producción
            cache_dir: Directorio para cache de tokens
        """
        self.cuit_emisor = cuit_emisor
        self.cert_path = cert_path
        self.key_path = key_path
        self.homologacion = homologacion
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Subdirectorio para tickets (separado del cache WSDL)
        self.tickets_dir = self.cache_dir / "tickets"
        self.tickets_dir.mkdir(parents=True, exist_ok=True)
        
        # Subdirectorio para cache WSDL de pysimplesoap
        self.wsdl_cache_dir = self.cache_dir / "wsdl"
        self.wsdl_cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Estado interno
        self._wsaa: Optional[WSAA] = None
        self._wsfev1: Optional[WSFEv1] = None
        self._token: Optional[str] = None
        self._sign: Optional[str] = None
        self._token_expiracion: Optional[datetime] = None
        self._ultima_autenticacion: Optional[str] = None
        
        # URLs de AFIP
        if homologacion:
            self.wsaa_url = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl"
            self.wsfev1_url = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL"
        else:
            self.wsaa_url = "https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl"
            self.wsfev1_url = "https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL"
        
        logger.info(
            "AFIPClient inicializado — CUIT: %s, Modo: %s",
            cuit_emisor,
            "HOMOLOGACION" if homologacion else "PRODUCCION"
        )
    
    def _validar_certificados(self):
        """Valida que los archivos de certificado y clave existan"""
        if not os.path.exists(self.cert_path):
            raise FileNotFoundError(f"Certificado no encontrado: {self.cert_path}")
        if not os.path.exists(self.key_path):
            raise FileNotFoundError(f"Clave privada no encontrada: {self.key_path}")
    
    def _token_valido(self) -> bool:
        """Verifica si el token actual es válido (no expiró)"""
        if not self._token or not self._sign or not self._token_expiracion:
            return False
        
        # Renovar 5 minutos antes de expiración por seguridad
        return datetime.now() < (self._token_expiracion - timedelta(minutes=5))
    
    def autenticar(self, forzar: bool = False) -> Dict[str, str]:
        """
        Autentica con WSAA para obtener Token y Sign.
        
        Args:
            forzar: Si True, fuerza re-autenticación aunque el token sea válido
        
        Returns:
            Dict con 'token', 'sign' y 'expiracion'
        
        Raises:
            Exception: Si falla la autenticación con AFIP
        """
        if not forzar and self._token_valido():
            logger.debug("Token WSAA válido en cache, reutilizando")
            return {
                'token': self._token,
                'sign': self._sign,
                'expiracion': self._token_expiracion.isoformat()
            }
        
        logger.info("Autenticando con WSAA...")
        self._validar_certificados()
        
        try:
            # Inicializar cliente WSAA
            wsaa = WSAA()
            
            # Cache file para el ticket de acceso (en subdirectorio tickets/)
            ta_file = self.tickets_dir / f"ta_{self.cuit_emisor}_wsfe.xml"
            
            # Si se fuerza, borrar cache existente
            if forzar and ta_file.exists():
                ta_file.unlink()
                logger.debug("Cache de ticket eliminado para forzar re-autenticación")
            
            # Autenticar (genera firma CMS del certificado)
            # AFIP debería reconocer el certificado ya que fue emitido por su CA "Computadores"
            try:
                ta = wsaa.Autenticar(
                    "wsfe",  # service (posicional)
                    self.cert_path,  # certificate (posicional)
                    self.key_path,  # privatekey (posicional)
                    wsdl=self.wsaa_url,
                    cache=""  # Cache vacío deshabilita pickle persistence (evita problemas Python 2/3)
                )
            except Exception as inner_exc:
                import traceback
                logger.error("Excepción interna en wsaa.Autenticar():\n%s", traceback.format_exc())
                raise
            
            if not ta:
                excepcion = wsaa.Excepcion or ""
                # coe.alreadyAuthenticated: AFIP dice que ya existe un TA válido para este cert.
                # Ocurre cuando el token anterior fue emitido pero no se guardó en disco (crash).
                # El TA expira automáticamente (máx. 5hs). No es un error fatal.
                if "alreadyAuthenticated" in excepcion:
                    # No loguear como ERROR — es un estado temporal esperado
                    raise Exception(f"WSAA_ALREADY_AUTHENTICATED: {excepcion}")
                # Si wsaa capturó una excepción interna, intentar obtener más info
                if hasattr(wsaa, 'Traceback') and wsaa.Traceback:
                    logger.error("Traceback de pyafipws:\n%s", wsaa.Traceback)
                raise Exception(f"WSAA auth falló: {excepcion}")
            
            # Extraer token y sign del ticket
            self._token = wsaa.Token
            self._sign = wsaa.Sign
            
            # Calcular expiración (AFIP da ~12h)
            # pyafipws no expone la fecha directamente, asumimos 12h
            self._token_expiracion = datetime.now() + timedelta(hours=12)
            self._ultima_autenticacion = datetime.now().isoformat()
            
            logger.info(
                "Autenticación WSAA exitosa — Token válido hasta: %s",
                self._token_expiracion.strftime('%Y-%m-%d %H:%M:%S')
            )
            
            return {
                'token': self._token,
                'sign': self._sign,
                'expiracion': self._token_expiracion.isoformat()
            }
            
        except Exception as e:
            import traceback
            logger.error("Error al autenticar con WSAA: %s", e)
            logger.error("Traceback completo:\n%s", traceback.format_exc())
            raise Exception(f"WSAA authentication failed: {str(e)}")
    
    def _get_wsfev1(self) -> WSFEv1:
        """
        Obtiene instancia de WSFEv1 con token activo.
        Autentica automáticamente si es necesario.
        """
        # Asegurar token válido
        if not self._token_valido():
            self.autenticar(forzar=True)
        
        # Crear instancia WSFEv1 si no existe
        if self._wsfev1 is None:
            self._wsfev1 = WSFEv1()
            self._wsfev1.Conectar(
                wsdl=self.wsfev1_url,
                cache=str(self.wsdl_cache_dir)
            )
            logger.debug("Cliente WSFEV1 conectado")
        
        # Setear credenciales en cada llamada (por si cambió el token)
        self._wsfev1.Cuit = self.cuit_emisor
        self._wsfev1.Token = self._token
        self._wsfev1.Sign = self._sign
        
        return self._wsfev1
    
    def probar_conexion(self) -> Dict[str, Any]:
        """
        Prueba la conexión con AFIP llamando al método Dummy.
        Útil para health checks.
        
        Returns:
            Dict con estado de la conexión
        """
        try:
            self.autenticar()
            wsfe = self._get_wsfev1()
            wsfe.Dummy()
            
            return {
                'conectado': True,
                'app_server': wsfe.AppServerStatus,
                'db_server': wsfe.DbServerStatus,
                'auth_server': wsfe.AuthServerStatus,
                'ultima_autenticacion': self._ultima_autenticacion
            }
        except Exception as e:
            logger.error("Error al probar conexión AFIP: %s", e)
            return {
                'conectado': False,
                'error': str(e),
                'ultima_autenticacion': self._ultima_autenticacion
            }
    
    def obtener_ultimo_comprobante(self, punto_venta: int, tipo_cbte: int) -> int:
        """
        Obtiene el último número de comprobante emitido para un PV y tipo.
        
        Args:
            punto_venta: Punto de venta (1-9999)
            tipo_cbte: Tipo de comprobante (1=FactA, 6=FactB, 11=FactC)
        
        Returns:
            Número del último comprobante (0 si es el primero)
        """
        try:
            wsfe = self._get_wsfev1()
            ultimo = wsfe.CompUltimoAutorizado(tipo_cbte, punto_venta)
            
            if wsfe.ErrMsg:
                logger.warning(
                    "Advertencia al obtener último comprobante: %s",
                    wsfe.ErrMsg
                )
            
            return int(ultimo) if ultimo else 0
            
        except Exception as e:
            logger.error("Error al obtener último comprobante: %s", e)
            # En caso de error, devolver 0 (AFIP asignará el siguiente)
            return 0
    
    def facturar(self, req: FacturarRequest) -> FacturarResponse:
        """
        Solicita un CAE a AFIP para la factura.
        
        Args:
            req: Datos de la factura (FacturarRequest)
        
        Returns:
            FacturarResponse con el CAE o errores
        
        Raises:
            Exception: Si hay errores técnicos (no de validación AFIP)
        """
        logger.info(
            "Solicitando CAE para %s — PV: %d, Tipo: %d, Total: $%.2f",
            req.nombre_receptor or "CONSUMIDOR FINAL",
            req.punto_de_venta,
            req.tipo_comprobante,
            req.importe_total
        )
        
        try:
            # Conectar a WSFEV1
            wsfe = self._get_wsfev1()
            
            # Obtener el próximo número de comprobante
            ultimo = self.obtener_ultimo_comprobante(
                req.punto_de_venta,
                req.tipo_comprobante
            )
            numero_cbte = ultimo + 1
            
            logger.debug("Número de comprobante a emitir: %d", numero_cbte)
            
            # Fecha de hoy (YYYYMMDD)
            fecha_hoy = datetime.now().strftime('%Y%m%d')
            
            # Crear factura en pyafipws
            wsfe.CrearFactura(
                concepto=req.concepto,
                tipo_doc=req.tipo_doc_receptor,
                nro_doc=req.nro_doc_receptor,
                tipo_cbte=req.tipo_comprobante,
                punto_vta=req.punto_de_venta,
                cbt_desde=numero_cbte,
                cbt_hasta=numero_cbte,  # Un solo comprobante
                imp_total=round(req.importe_total, 2),
                imp_tot_conc=0.00,  # Monto no gravado
                imp_neto=round(req.importe_neto, 2),
                imp_iva=round(req.importe_iva, 2),
                imp_trib=round(req.importe_tributos, 2),
                imp_op_ex=round(req.importe_exento, 2),
                fecha_cbte=fecha_hoy,
                fecha_venc_pago=None,  # Solo si concepto=servicios
                fecha_serv_desde=None,
                fecha_serv_hasta=None,
                moneda_id=req.moneda,
                moneda_ctz=req.cotizacion_moneda
            )
            
            # RG 5616: Condición IVA del receptor (requerido desde 2024)
            # 5 = Consumidor Final (para tipo_doc=99)
            # El valor se toma del request; por defecto 5 para doc_tipo=99
            condicion_iva = getattr(req, 'condicion_iva_receptor_id', None)
            if condicion_iva is None:
                condicion_iva = 5 if req.tipo_doc_receptor == 99 else 1  # 1=IVA Responsable Inscripto
            wsfe.factura['condicion_iva_receptor_id'] = condicion_iva
            
            # Agregar IVA si corresponde
            if req.importe_iva > 0:
                # Alícuota 21% (código 5 en AFIP)
                # Otras alícuotas: 3=0%, 4=10.5%, 5=21%, 6=27%
                wsfe.AgregarIva(
                    iva_id=5,  # 21%
                    base_imp=round(req.importe_neto, 2),
                    importe=round(req.importe_iva, 2)
                )
            
            # Solicitar CAE
            resultado = wsfe.CAESolicitar()
            
            if not resultado:
                # Error técnico
                error_msg = f"AFIP error técnico: {wsfe.ErrMsg}"
                logger.error(error_msg)
                raise Exception(error_msg)
            
            # Extraer resultado
            cae = wsfe.CAE
            cae_vencimiento = wsfe.Vencimiento
            resultado_afip = wsfe.Resultado  # A=Aprobado, R=Rechazado
            
            # Recopilar observaciones
            observaciones = []
            if wsfe.Obs:
                obs_afip = wsfe.ObtenerTagXml('Observaciones')
                logger.warning("Observaciones AFIP: %s", obs_afip)
                
                # pyafipws devuelve observaciones como lista de diccionarios
                for obs in wsfe.Observaciones:
                    observaciones.append(ObservacionAFIP(
                        codigo=int(obs.get('Code', 0)),
                        mensaje=obs.get('Msg', 'Sin descripción')
                    ))
            
            # Construir respuesta
            response = FacturarResponse(
                resultado=resultado_afip,
                numero_comprobante=numero_cbte,
                fecha_comprobante=fecha_hoy,
                cae=cae if cae else None,
                cae_vencimiento=cae_vencimiento if cae_vencimiento else None,
                observaciones=observaciones if observaciones else None,
                reproceso=wsfe.Reproceso if hasattr(wsfe, 'Reproceso') else None,
                afip_request_id=None  # pyafipws no expone el request ID
            )
            
            if resultado_afip == 'A':
                logger.info(
                    "✓ CAE obtenido exitosamente — CAE: %s, Vto: %s",
                    cae,
                    cae_vencimiento
                )
            else:
                logger.warning(
                    "✗ Factura rechazada por AFIP — Resultado: %s, Obs: %d",
                    resultado_afip,
                    len(observaciones)
                )
            
            return response
            
        except Exception as e:
            logger.exception("Error fatal al facturar: %s", e)
            raise Exception(f"Error al solicitar CAE: {str(e)}")
    
    def consultar_comprobante(
        self,
        tipo_cbte: int,
        punto_venta: int,
        numero_cbte: int
    ) -> Optional[Dict[str, Any]]:
        """
        Consulta un comprobante ya emitido en AFIP.
        Útil para verificar si una factura se emitió correctamente.
        
        Returns:
            Dict con datos del comprobante o None si no existe
        """
        try:
            wsfe = self._get_wsfev1()
            result = wsfe.CompConsultar(tipo_cbte, punto_venta, numero_cbte)
            
            if result and wsfe.CAE:
                return {
                    'cae': wsfe.CAE,
                    'cae_vencimiento': wsfe.Vencimiento,
                    'resultado': wsfe.Resultado,
                    'fecha_emision': wsfe.FechaCbte,
                    'importe_total': wsfe.ImpTotal
                }
            
            return None
            
        except Exception as e:
            logger.error("Error al consultar comprobante: %s", e)
            return None
