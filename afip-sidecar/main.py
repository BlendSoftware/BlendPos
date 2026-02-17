"""
BlendPOS — AFIP Python Sidecar
FastAPI microservice that wraps pyafipws to handle:
  - WSAA (token/sign authentication)
  - WSFEV1 (electronic invoicing — CAE issuance)

Internal service only — NOT exposed externally.
Go backend calls POST /facturar with invoice data.
"""

from contextlib import asynccontextmanager
from typing import Optional
import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("afip-sidecar")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

# ── Pydantic schemas ──────────────────────────────────────────────────────────

class FacturarRequest(BaseModel):
    cuit_emisor: str = Field(..., description="CUIT del emisor (sin guiones)")
    punto_de_venta: int = Field(..., ge=1)
    tipo_comprobante: int = Field(6, description="6=Factura B, 11=Factura C, 1=Factura A")
    tipo_doc_receptor: int = Field(99, description="99=Consumidor final, 80=CUIT")
    nro_doc_receptor: str = Field("0", description="CUIT del receptor o 0 para CF")
    nombre_receptor: Optional[str] = None
    concepto: int = Field(1, description="1=Productos, 2=Servicios, 3=Ambos")
    importe_sin_iva: float = Field(..., ge=0)
    importe_iva: float = Field(0, ge=0)
    importe_total: float = Field(..., ge=0)
    moneda: str = Field("PES", description="PES=Pesos argentinos")
    cot_moneda: float = Field(1.0)


class FacturarResponse(BaseModel):
    cae: str
    cae_vencimiento: str  # YYYYMMDD
    resultado: str        # "A" = aprobado, "R" = rechazado
    numero_comprobante: int
    observaciones: Optional[str] = None


# ── AFIP client wrapper ───────────────────────────────────────────────────────

class AFIPClient:
    """
    Wraps pyafipws WSAA + WSFEV1.
    Instantiated once at startup; token cached and auto-renewed.
    """

    def __init__(self):
        self.homologacion = os.getenv("AFIP_HOMOLOGACION", "true").lower() == "true"
        self.cert_path = os.getenv("AFIP_CERT_PATH", "/certs/afip.crt")
        self.key_path = os.getenv("AFIP_KEY_PATH", "/certs/afip.key")
        self._wsfev1 = None
        logger.info("AFIPClient initialized — homologacion=%s", self.homologacion)

    def _get_wsfev1(self):
        """
        TODO Phase 5: Initialize pyafipws WSFEV1 with active WSAA token.
        Pattern:
            from pyafipws.wsfev1 import WSFEv1
            from pyafipws.wsaa import WSAA
            wsaa = WSAA()
            ta = wsaa.Autenticar("wsfe", self.cert_path, self.key_path, wsdl=...)
            wsfe = WSFEv1()
            wsfe.Conectar(wsdl=..., ta=ta)
            return wsfe
        """
        raise NotImplementedError("Phase 5: pyafipws integration pending")

    def facturar(self, req: FacturarRequest) -> FacturarResponse:
        """TODO Phase 5: Call WSFEV1.CAESolicitar and return CAE."""
        raise NotImplementedError("Phase 5: facturación pending")


afip_client: AFIPClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    global afip_client
    afip_client = AFIPClient()
    yield


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="BlendPOS AFIP Sidecar",
    version="0.1.0",
    description="Internal AFIP WSAA+WSFEV1 microservice",
    lifespan=lifespan,
    docs_url="/docs" if os.getenv("AFIP_HOMOLOGACION", "true") == "true" else None
)


@app.get("/health")
def health():
    return {"ok": True, "service": "afip-sidecar", "homologacion": os.getenv("AFIP_HOMOLOGACION", "true")}


@app.post("/facturar", response_model=FacturarResponse)
def facturar(req: FacturarRequest):
    """
    Issue an electronic invoice via AFIP WSFEV1.
    Called exclusively by the Go backend worker.
    """
    try:
        result = afip_client.facturar(req)
        return result
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        logger.exception("Error al facturar: %s", e)
        raise HTTPException(status_code=502, detail=f"AFIP error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=False)
