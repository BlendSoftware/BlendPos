"""
BlendPOS — AFIP Python Sidecar
FastAPI microservice that wraps pyafipws to handle:
  - WSAA (token/sign authentication)
  - WSFEV1 (electronic invoicing — CAE issuance)

Internal service only — NOT exposed externally.
Go backend calls POST /facturar with invoice data.
"""

# IMPORTANTE: Importar py3_compat PRIMERO para monkey-patch hashlib
import py3_compat

from contextlib import asynccontextmanager
import logging
import os
import sys
from typing import Dict, Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

# Import local modules
from schemas import FacturarRequest, FacturarResponse, HealthResponse
from afip_client import AFIPClient

# ── Logging setup ─────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("afip-sidecar")

# ── Global AFIP client ────────────────────────────────────────────────────────

afip_client: AFIPClient = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager para FastAPI.
    Inicializa el cliente AFIP al startup.
    """
    global afip_client
    
    logger.info("=" * 60)
    logger.info("Iniciando BlendPOS AFIP Sidecar...")
    logger.info("=" * 60)
    
    # Leer configuración desde env vars
    cuit_emisor = os.getenv("AFIP_CUIT_EMISOR", "")
    cert_path = os.getenv("AFIP_CERT_PATH", "/certs/afip.crt")
    key_path = os.getenv("AFIP_KEY_PATH", "/certs/afip.key")
    homologacion = os.getenv("AFIP_HOMOLOGACION", "true").lower() == "true"
    cache_dir = os.getenv("AFIP_CACHE_DIR", "/tmp/afip_cache")
    
    # Validar configuración requerida
    if not cuit_emisor:
        logger.error("ERROR: Variable AFIP_CUIT_EMISOR no configurada")
        raise ValueError("AFIP_CUIT_EMISOR es requerido")
    
    # Inicializar cliente
    try:
        afip_client = AFIPClient(
            cuit_emisor=cuit_emisor,
            cert_path=cert_path,
            key_path=key_path,
            homologacion=homologacion,
            cache_dir=cache_dir
        )
        
        logger.info("✓ Cliente AFIP inicializado correctamente")
        logger.info(f"  - CUIT Emisor: {cuit_emisor}")
        logger.info(f"  - Modo: {'HOMOLOGACIÓN' if homologacion else 'PRODUCCIÓN'}")
        logger.info(f"  - Certificado: {cert_path}")
        
        # Autenticar proactivamente al iniciar
        try:
            auth_result = afip_client.autenticar()
            logger.info(f"✓ Autenticación WSAA exitosa — Token válido hasta: {auth_result['expiracion']}")
        except Exception as e:
            logger.warning(f"⚠ No se pudo autenticar en startup (se reintentará en primera factura): {e}")
        
    except Exception as e:
        logger.error(f"✗ Error fatal al inicializar cliente AFIP: {e}")
        raise
    
    logger.info("=" * 60)
    logger.info("Sidecar listo — Escuchando en puerto 8001")
    logger.info("=" * 60)
    
    yield
    
    # Cleanup (si fuera necesario)
    logger.info("Deteniendo AFIP Sidecar...")


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="BlendPOS AFIP Sidecar",
    version="1.0.0",
    description="Microservicio interno de integración AFIP (WSAA + WSFEV1)",
    lifespan=lifespan,
    # Swagger solo en homologación
    docs_url="/docs" if os.getenv("AFIP_HOMOLOGACION", "true").lower() == "true" else None,
    redoc_url="/redoc" if os.getenv("AFIP_HOMOLOGACION", "true").lower() == "true" else None
)

# CORS para requests del backend Go (aunque es red interna)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción restringir al host del backend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Exception handlers ────────────────────────────────────────────────────────

@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    """Handler para errores de validación de Pydantic"""
    logger.warning(f"Error de validación: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "detail": exc.errors(),
            "message": "Los datos enviados no cumplen con el contrato esperado"
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handler global para excepciones no capturadas"""
    logger.exception(f"Excepción no capturada en {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "detail": str(exc),
            "message": "Error interno del servidor"
        }
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """
    Health check del servicio.
    Verifica conectividad con AFIP y estado del token.
    """
    homologacion = os.getenv("AFIP_HOMOLOGACION", "true").lower() == "true"
    mode = "homologacion" if homologacion else "produccion"
    
    # Probar conexión AFIP
    afip_status = afip_client.probar_conexion() if afip_client else {}
    
    return HealthResponse(
        ok=True,
        service="afip-sidecar",
        mode=mode,
        afip_conectado=afip_status.get('conectado', False),
        ultima_autenticacion=afip_status.get('ultima_autenticacion')
    )


@app.post("/facturar", response_model=FacturarResponse)
def facturar(req: FacturarRequest) -> FacturarResponse:
    """
    Emite una factura electrónica en AFIP via WSFEV1.
    
    Este endpoint es llamado exclusivamente por el worker de Go
    cuando una venta necesita ser facturada.
    
    Flujo:
    1. Valida el payload (Pydantic)
    2. Autentica con WSAA si el token expiró
    3. Solicita CAE a WSFEV1
    4. Retorna el CAE o los errores de AFIP
    
    Raises:
        HTTPException 400: Datos inválidos
        HTTPException 502: Error comunicación con AFIP
        HTTPException 503: AFIP no disponible
    """
    if not afip_client:
        logger.error("Cliente AFIP no inicializado")
        raise HTTPException(
            status_code=503,
            detail="Cliente AFIP no disponible"
        )
    
    logger.info(
        f"→ Solicitud de factura recibida — PV: {req.punto_de_venta}, "
        f"Tipo: {req.tipo_comprobante}, Total: ${req.importe_total:.2f}"
    )
    
    try:
        # Llamar al cliente AFIP
        result = afip_client.facturar(req)
        
        # Log del resultado
        if result.resultado == 'A':
            logger.info(
                f"✓ Factura aprobada — CAE: {result.cae}, "
                f"Nro: {result.numero_comprobante}"
            )
        else:
            logger.warning(
                f"✗ Factura rechazada — Resultado: {result.resultado}, "
                f"Obs: {len(result.observaciones or [])}"
            )
        
        return result
        
    except FileNotFoundError as e:
        # Certificados no encontrados
        logger.error(f"Error de certificados: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Configuración de certificados inválida: {str(e)}"
        )
        
    except ValueError as e:
        # Error de validación
        logger.error(f"Error de validación: {e}")
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
        
    except Exception as e:
        # Error general de comunicación con AFIP
        logger.exception(f"Error al facturar: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Error comunicación con AFIP: {str(e)}"
        )


@app.get("/")
def root() -> Dict[str, str]:
    """Endpoint root con información básica"""
    return {
        "service": "BlendPOS AFIP Sidecar",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "GET /health",
            "facturar": "POST /facturar"
        }
    }


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("AFIP_PORT", "8001"))
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        access_log=True,
        reload=False  # No reload en producción
    )
