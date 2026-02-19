"""
BlendPOS — AFIP Sidecar Schemas
Pydantic models for request/response validation
"""

from typing import Optional, List
from pydantic import BaseModel, Field, validator


class ItemFacturaRequest(BaseModel):
    """
    Representa un item dentro de una factura.
    Usado para enviar detalle de productos al WSFEV1.
    """
    codigo: str = Field(..., description="Código del producto (interno)")
    descripcion: str = Field(..., max_length=200, description="Descripción del producto")
    cantidad: float = Field(..., gt=0, description="Cantidad vendida")
    precio_unitario: float = Field(..., ge=0, description="Precio unitario sin IVA")
    importe_total: float = Field(..., ge=0, description="Cantidad × Precio unitario")
    alicuota_iva: float = Field(..., ge=0, description="% de IVA (ej: 21.0)")


class FacturarRequest(BaseModel):
    """
    Payload que recibe el sidecar desde el worker de Go.
    Contiene todos los datos necesarios para emitir una factura en AFIP.
    """
    cuit_emisor: str = Field(..., description="CUIT del emisor (sin guiones, ej: 20123456789)")
    punto_de_venta: int = Field(..., ge=1, le=9999, description="Punto de venta autorizado por AFIP")
    tipo_comprobante: int = Field(..., description="Código AFIP: 1=FacturaA, 6=FacturaB, 11=FacturaC")
    tipo_doc_receptor: int = Field(..., description="80=CUIT, 86=CUIL, 96=DNI, 99=ConsumidorFinal")
    nro_doc_receptor: str = Field(..., description="DNI/CUIT del receptor, '0' para Consumidor Final")
    nombre_receptor: Optional[str] = Field(None, max_length=200, description="Razón social o nombre del cliente")
    
    # Conceptos: 1=Productos, 2=Servicios, 3=Ambos
    concepto: int = Field(1, ge=1, le=3, description="1=Productos, 2=Servicios, 3=Ambos")
    
    # Montos
    importe_neto: float = Field(..., ge=0, description="Monto gravado (sin IVA)")
    importe_exento: float = Field(0, ge=0, description="Monto exento de IVA")
    importe_iva: float = Field(0, ge=0, description="Monto de IVA")
    importe_tributos: float = Field(0, ge=0, description="Otros tributos (IIBB, percepciones)")
    importe_total: float = Field(..., gt=0, description="Neto + IVA + Tributos")
    
    # Moneda
    moneda: str = Field("PES", description="PES=Pesos argentinos, DOL=Dólar")
    cotizacion_moneda: float = Field(1.0, gt=0, description="Cotización de la moneda (1.0 para pesos)")
    
    # Items (opcional, según requerimiento)
    items: Optional[List[ItemFacturaRequest]] = Field(None, description="Detalle de productos vendidos")
    
    @validator('cuit_emisor', 'nro_doc_receptor')
    def validar_formato_cuit(cls, v):
        """Valida que el CUIT/DNI no contenga guiones ni puntos"""
        if '-' in v or '.' in v:
            raise ValueError('El CUIT/DNI debe ser solo números, sin guiones ni puntos')
        return v
    
    @validator('importe_total')
    def validar_total(cls, v, values):
        """Valida que el total sea coherente con los componentes"""
        neto = values.get('importe_neto', 0)
        exento = values.get('importe_exento', 0)
        iva = values.get('importe_iva', 0)
        tributos = values.get('importe_tributos', 0)
        esperado = neto + exento + iva + tributos
        
        # Tolerancia de 0.01 por redondeos
        if abs(v - esperado) > 0.01:
            raise ValueError(
                f'El importe_total ({v}) no coincide con la suma de componentes ({esperado})'
            )
        return v


class ObservacionAFIP(BaseModel):
    """Representa una observación o error retornado por AFIP"""
    codigo: int = Field(..., description="Código de observación AFIP")
    mensaje: str = Field(..., description="Descripción de la observación")


class FacturarResponse(BaseModel):
    """
    Respuesta del sidecar al worker de Go.
    Contiene el CAE o los errores de AFIP.
    """
    resultado: str = Field(..., description="A=Aprobado, R=Rechazado, P=Pendiente")
    numero_comprobante: int = Field(..., ge=1, description="Número de comprobante asignado por AFIP")
    fecha_comprobante: str = Field(..., description="Fecha del comprobante (YYYYMMDD)")
    
    cae: Optional[str] = Field(None, description="Código de Autorización Electrónico (14 dígitos)")
    cae_vencimiento: Optional[str] = Field(None, description="Fecha de vencimiento del CAE (YYYYMMDD)")
    
    observaciones: Optional[List[ObservacionAFIP]] = Field(None, description="Observaciones o errores de AFIP")
    reproceso: Optional[str] = Field(None, description="Tipo de reproceso (S=Sí, N=No)")
    
    # Metadata para logging
    afip_request_id: Optional[str] = Field(None, description="ID interno de AFIP para trazabilidad")


class HealthResponse(BaseModel):
    """Response del endpoint /health"""
    ok: bool = Field(..., description="Estado general del servicio")
    service: str = Field("afip-sidecar", description="Nombre del servicio")
    mode: str = Field(..., description="homologacion o produccion")
    afip_conectado: bool = Field(..., description="Si se pudo conectar a AFIP")
    ultima_autenticacion: Optional[str] = Field(None, description="Timestamp de la última auth WSAA exitosa")
