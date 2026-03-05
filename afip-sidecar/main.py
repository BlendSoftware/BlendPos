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

import redis as redis_sync

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

# Import local modules
from schemas import FacturarRequest, FacturarResponse, HealthResponse, ConfigurarRequest
from afip_client import AFIPClient

# ── Authentication (P1-008) ───────────────────────────────────────────────────
# The sidecar is an internal service and should only be reachable from the Go
# backend. The INTERNAL_API_TOKEN env var adds a shared-secret layer so that
# even if the sidecar port is accidentally exposed it cannot be abused.

INTERNAL_API_TOKEN: str = os.getenv("INTERNAL_API_TOKEN", "")

# SEC-05: In production mode, INTERNAL_API_TOKEN is mandatory.
# Fail fast at import time so the sidecar never starts unprotected.
_is_production = os.getenv("AFIP_HOMOLOGACION", "true").lower() != "true"
if _is_production and not INTERNAL_API_TOKEN:
    raise RuntimeError(
        "FATAL: INTERNAL_API_TOKEN is required in production mode "
        "(AFIP_HOMOLOGACION != 'true'). Generate one with: "
        "python -c \"import secrets; print(secrets.token_hex(32))\""
    )


async def verify_internal_token(
    x_internal_token: str = Header(..., alias="X-Internal-Token"),
) -> None:
    """
    FastAPI dependency that enforces X-Internal-Token authentication.
    If INTERNAL_API_TOKEN is not set (dev mode only), the check is skipped.
    """
    if INTERNAL_API_TOKEN and x_internal_token != INTERNAL_API_TOKEN:
        raise HTTPException(status_code=403, detail="Acceso denegado: token interno inválido")

# ── Logging setup ─────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("afip-sidecar")

# ── Global AFIP client ────────────────────────────────────────────────────────

afip_client: AFIPClient = None
_retry_task = None


async def _retry_auth_background():
    """Tarea background: reintenta autenticación WSAA cada 5 min hasta lograrla."""
    import asyncio
    retry_intervals = [60, 120, 300, 300, 300]  # 1m, 2m, 5m, 5m, 5m...
    idx = 0
    while True:
        wait = retry_intervals[min(idx, len(retry_intervals) - 1)]
        await asyncio.sleep(wait)
        if afip_client is None:
            continue
        if afip_client._token_valido():
            logger.info("✓ Token WSAA válido — deteniendo retry background")
            return
        try:
            result = afip_client.autenticar(forzar=True)
            logger.info(f"✓ Retry auth exitoso — Token válido hasta: {result['expiracion']}")
            return  # Éxito — detener el loop
        except Exception as e:
            msg = str(e)
            if "WSAA_ALREADY_AUTHENTICATED" in msg:
                logger.info(f"⏳ Retry auth: TA previo aún activo en AFIP, esperando {wait}s más...")
            else:
                logger.warning(f"⚠ Retry auth falló: {e}")
        idx += 1


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager para FastAPI.
    Inicializa el cliente AFIP al startup.
    """
    global afip_client, _retry_task
    import asyncio

    logger.info("=" * 60)
    logger.info("Iniciando BlendPOS AFIP Sidecar...")
    logger.info("=" * 60)

    # Leer configuración desde env vars
    cuit_emisor = os.getenv("AFIP_CUIT_EMISOR", "")
    cert_path = os.getenv("AFIP_CERT_PATH", "/certs/afip.crt")
    key_path = os.getenv("AFIP_KEY_PATH", "/certs/afip.key")
    homologacion = os.getenv("AFIP_HOMOLOGACION", "true").lower() == "true"
    cache_dir = os.getenv("AFIP_CACHE_DIR", "/tmp/afip_cache")
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")

    # Validar configuración requerida
    if not cuit_emisor:
        logger.error("ERROR: Variable AFIP_CUIT_EMISOR no configurada")
        raise ValueError("AFIP_CUIT_EMISOR es requerido")

    # Conectar a Redis para cache de token WSAA (P2-010)
    rdb = None
    try:
        rdb = redis_sync.from_url(redis_url, decode_responses=False, socket_timeout=3)
        rdb.ping()
        logger.info("✓ Conectado a Redis — WSAA token cache habilitado (%s)", redis_url)
    except Exception as e:
        logger.warning("⚠ No se pudo conectar a Redis (%s): %s — continuando sin cache persistente", redis_url, e)
        rdb = None

    # Inicializar cliente
    try:
        afip_client = AFIPClient(
            cuit_emisor=cuit_emisor,
            cert_path=cert_path,
            key_path=key_path,
            homologacion=homologacion,
            cache_dir=cache_dir,
            rdb=rdb,
        )

        logger.info("✓ Cliente AFIP inicializado correctamente")
        logger.info(f"  - CUIT Emisor: {cuit_emisor}")
        logger.info(f"  - Modo: {'HOMOLOGACIÓN' if homologacion else 'PRODUCCIÓN'}")
        logger.info(f"  - Certificado: {cert_path}")

        # Intentar autenticar en startup
        try:
            auth_result = afip_client.autenticar()
            logger.info(f"✓ Autenticación WSAA exitosa — Token válido hasta: {auth_result['expiracion']}")
        except Exception as e:
            msg = str(e)
            if "WSAA_ALREADY_AUTHENTICATED" in msg:
                logger.warning(
                    "⏳ AFIP ya posee un TA activo para este certificado (emitido en sesión anterior). "
                    "El retry automático obtendrá un nuevo token cuando expire (~cada 5 min)."
                )
            else:
                logger.warning(f"⚠ No se pudo autenticar en startup: {e}")
            # Lanzar retry background
            _retry_task = asyncio.create_task(_retry_auth_background())
            logger.info("🔄 Tarea de retry WSAA iniciada en background")

    except Exception as e:
        logger.error(f"✗ Error fatal al inicializar cliente AFIP: {e}")
        raise

    logger.info("=" * 60)
    logger.info("Sidecar listo — Escuchando en puerto 8001")
    logger.info("=" * 60)

    yield

    # Cleanup
    if _retry_task and not _retry_task.done():
        _retry_task.cancel()
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

# H-04: CORS middleware removed — this is an internal service that only receives
# requests from the Go backend via Docker internal network. No browser ever
# calls this service directly, so CORS is unnecessary and was a security risk.


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


@app.post("/configurar", dependencies=[Depends(verify_internal_token)])
def configurar(req: "ConfigurarRequest") -> dict:
    """
    Reconfigura el sidecar con nuevos certificados AFIP en caliente.
    Llamado por el backend Go cuando el dueño sube certificados desde la UI de admin.
    
    Los certificados llegan en base64 porque son binarios y el transporte es JSON.
    Se escriben a disco en /certs/ y se reinicia el AFIPClient para re-autenticar con WSAA.
    """
    import base64
    global afip_client

    certs_dir = "/certs"
    os.makedirs(certs_dir, exist_ok=True)

    try:
        crt_bytes = base64.b64decode(req.crt_base64)
        key_bytes = base64.b64decode(req.key_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error decodificando certificados (base64 inválido): {e}")

    crt_path = os.path.join(certs_dir, "afip.crt")
    key_path = os.path.join(certs_dir, "afip.key")
    
    with open(crt_path, "wb") as f:
        f.write(crt_bytes)
    with open(key_path, "wb") as f:
        f.write(key_bytes)
    
    logger.info(f"✓ Certificados guardados en {certs_dir} para CUIT {req.cuit_emisor}")

    # Reconstruir el cliente con la nueva configuración
    homologacion = req.modo.lower() != "produccion"
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    cache_dir  = os.getenv("AFIP_CACHE_DIR", "/tmp/afip_cache")

    try:
        rdb = redis_sync.from_url(redis_url, socket_connect_timeout=2) if redis_url else None
    except Exception:
        rdb = None

    nuevo_client = AFIPClient(
        cuit_emisor=req.cuit_emisor,
        cert_path=crt_path,
        key_path=key_path,
        homologacion=homologacion,
        cache_dir=cache_dir,
        rdb=rdb,
    )

    # Intentar autenticación inmediata para validar el certificado
    try:
        result = nuevo_client.autenticar(forzar=True)
        afip_client = nuevo_client
        logger.info(f"✓ Nuevo cliente AFIP configurado y autenticado. Token válido hasta: {result.get('expiracion', 'N/A')}")
        return {"ok": True, "message": "Certificados actualizados y autenticación WSAA exitosa"}
    except Exception as e:
        # El cliente anterior sigue activo — no rompemos el servicio si el nuevo cert falla
        error_str = str(e)
        logger.warning(f"⚠ Nuevo cert guardado pero WSAA rechazó: {error_str}")
        # Si es el error conocido de cert no confiable, aún reemplazamos el client
        # para que cuando AFIP homologue el cert funcione en el próximo request
        afip_client = nuevo_client
        return {
            "ok": False,
            "message": "Certificados guardados, pero AFIP/WSAA devolvió error de autenticación.",
            "afip_error": error_str,
            "hint": "Verificá que el certificado esté registrado y asociado al servicio 'wsfe' en AFIP."
        }


@app.post("/facturar", response_model=FacturarResponse, dependencies=[Depends(verify_internal_token)])
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
