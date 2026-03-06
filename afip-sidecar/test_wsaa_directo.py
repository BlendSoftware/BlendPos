"""
Test directo de firma CMS y llamada WSAA para diagnosticar el error bad.base64.
"""
import sys
import subprocess
import tempfile
import os
from datetime import datetime, timedelta
from base64 import b64encode
import xml.etree.ElementTree as ET

CUIT = os.getenv("AFIP_CUIT_EMISOR", "20471955575")
CERT = os.getenv("AFIP_CERT_PATH", "/certs/afip.crt")
KEY  = os.getenv("AFIP_KEY_PATH",  "/certs/afip.key")
WSAA_URL = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms"

def build_tra() -> str:
    now = datetime.utcnow()
    gen = (now - timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%S")
    exp = (now + timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%S")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>{int(now.timestamp())}</uniqueId>
    <generationTime>{gen}</generationTime>
    <expirationTime>{exp}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>"""

def sign_tra(tra_xml: str) -> str:
    """Firma el TRA usando openssl cms (DER) y devuelve base64 limpio."""
    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False, mode="w") as tf:
        tf.write(tra_xml)
        tra_file = tf.name

    try:
        # Generar firma CMS en formato DER (binario)
        cmd = [
            "openssl", "cms", "-sign",
            "-in",     tra_file,
            "-signer", CERT,
            "-inkey",  KEY,
            "-nodetach",
            "-outform", "DER",
        ]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(f"openssl cms failed: {result.stderr.decode()}")
        
        # Base64 sin saltos de línea (AFIP requiere base64 estándar, sin whitespace)
        b64 = b64encode(result.stdout).decode("ascii")
        print(f"[OK] Firma generada. Longitud base64: {len(b64)}")
        print(f"     Primeros 60 chars: {b64[:60]}...")
        return b64
    finally:
        os.unlink(tra_file)


def call_wsaa(cms_b64: str) -> str:
    """Llama directamente al endpoint SOAP de WSAA."""
    soap_body = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:log="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <log:loginCms>
      <log:in0>{cms_b64}</log:in0>
    </log:loginCms>
  </soapenv:Body>
</soapenv:Envelope>"""

    import urllib.request
    req = urllib.request.Request(
        url=WSAA_URL,
        data=soap_body.encode("utf-8"),
        headers={
            "Content-Type": "text/xml; charset=UTF-8",
            "SOAPAction": '""',
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body}")


def parse_ta(soap_response: str) -> dict:
    """Parsea el Ticket de Acceso (TA) de la respuesta SOAP."""
    # Extraer el XML del loginTicketResponse
    start = soap_response.find("<loginTicketResponse")
    end   = soap_response.rfind("</loginTicketResponse>") + len("</loginTicketResponse>")
    if start == -1 or end == -1:
        raise ValueError("No se encontró loginTicketResponse en la respuesta")
    
    ta_xml = soap_response[start:end]
    root = ET.fromstring(ta_xml)
    
    token = root.findtext(".//token")
    sign  = root.findtext(".//sign")
    generation = root.findtext(".//generationTime")
    expiration = root.findtext(".//expirationTime")
    
    return {
        "token": token,
        "sign": sign,
        "generationTime": generation,
        "expirationTime": expiration,
    }


if __name__ == "__main__":
    print("=" * 60)
    print(f"Test WSAA directo — CUIT: {CUIT}")
    print(f"Cert: {CERT}")
    print(f"Key:  {KEY}")
    print("=" * 60)

    # Verificar archivos
    if not os.path.exists(CERT):
        print(f"[ERROR] Certificado no encontrado: {CERT}")
        sys.exit(1)
    if not os.path.exists(KEY):
        print(f"[ERROR] Clave privada no encontrada: {KEY}")
        sys.exit(1)

    # Verificar formato de clave
    with open(KEY) as kf:
        key_header = kf.readline().strip()
    print(f"[INFO] Formato de clave: {key_header}")
    if "RSA PRIVATE KEY" not in key_header:
        print("[WARN] La clave no está en formato RSA PKCS#1. pyafipws puede fallar.")
    
    # Construir y firmar TRA
    print("\n[1] Construyendo TRA...")
    tra = build_tra()
    
    print("[2] Firmando TRA con openssl cms...")
    try:
        b64 = sign_tra(tra)
    except Exception as e:
        print(f"[ERROR] Fallo en firma: {e}")
        sys.exit(1)
    
    print("[3] Llamando a WSAA...")
    try:
        response = call_wsaa(b64)
    except Exception as e:
        print(f"[ERROR] WSAA rechazó la solicitud: {e}")
        sys.exit(1)
    
    print("[4] Parseando TA...")
    try:
        ta = parse_ta(response)
        print(f"[SUCCESS] Token obtenido!")
        print(f"  Token (primeros 40): {ta['token'][:40]}...")
        print(f"  Sign  (primeros 40): {ta['sign'][:40]}...")
        print(f"  Vence: {ta['expirationTime']}")
    except Exception as e:
        print(f"[ERROR] No se pudo parsear la respuesta: {e}")
        print(f"Respuesta completa:\n{response[:2000]}")
        sys.exit(1)
