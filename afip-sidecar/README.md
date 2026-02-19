# BlendPOS — AFIP Sidecar

Microservicio Python independiente que maneja la integración con AFIP (Administración Federal de Ingresos Públicos de Argentina) para la emisión de facturas electrónicas en BlendPOS.

## 📋 Descripción

Este sidecar encapsula la complejidad de la facturación fiscal argentina:

- **WSAA** (Web Service de Autenticación y Autorización): Autentica mediante certificados X.509 y obtiene tokens válidos por ~12h.
- **WSFEV1** (Web Service de Facturación Electrónica v1): Solicita CAE (Código de Autorización Electrónico) para comprobantes fiscales.
- **pyafipws**: Librería Python probada en producción que abstrae SOAP, XML y CMS.

El backend Go de BlendPOS llama a este sidecar vía `POST /facturar` de forma **asíncrona**, sin bloquear el punto de venta.

---

## 🏗️ Arquitectura

```
┌───────────────────┐       HTTP POST          ┌──────────────────┐
│  Backend Go       │  ──────────────────────▶ │  AFIP Sidecar    │
│  (Worker Pool)    │   /facturar (JSON)       │  (FastAPI)       │
└───────────────────┘                          └──────────────────┘
                                                        │
                                                        │ SOAP/XML
                                                        ▼
                                               ┌──────────────────┐
                                               │  AFIP/ARCA       │
                                               │  WSAA + WSFEV1   │
                                               └──────────────────┘
```

---

## 🚀 Instalación y Configuración

### 1. Requisitos

- **Python 3.11+**
- **Certificados de AFIP** (ver sección siguiente)

### 2. Obtener Certificados de Homologación

Los certificados de AFIP se obtienen mediante un proceso específico:

#### Paso 1: Generar CSR (Certificate Signing Request)

```bash
# Generar clave privada
openssl genrsa -out afip.key 2048

# Generar CSR
openssl req -new -key afip.key -out afip.csr \
  -subj "/C=AR/O=BlendPOS/CN=wsfe/serialNumber=CUIT 20123456789"
```

**Importante:** Reemplazar `20123456789` con tu CUIT real.

#### Paso 2: Solicitar Certificado en AFIP

1. Ir a: https://www.afip.gob.ar/ws/WSAA/certificado.asp
2. Seleccionar **"WSFE - Factura Electrónica"** como servicio
3. Pegar el contenido del archivo `afip.csr`
4. Descargar el certificado `afip.crt`

#### Paso 3: Guardar Certificados

```bash
mkdir -p certs
mv afip.key certs/
mv afip.crt certs/
chmod 600 certs/*  # Restringir permisos
```

**⚠️ SEGURIDAD:** Nunca commitear los certificados a Git. Están en `.gitignore`.

### 3. Configurar Variables de Entorno

```bash
cp .env.example .env
nano .env
```

Completar con:

```env
AFIP_CUIT_EMISOR=20123456789
AFIP_CERT_PATH=/app/certs/afip.crt
AFIP_KEY_PATH=/app/certs/afip.key
AFIP_HOMOLOGACION=true
AFIP_PORT=8001
```

### 4. Instalar Dependencias

```bash
pip install -r requirements.txt
```

### 5. Ejecutar el Sidecar

```bash
# Desarrollo (con reload)
uvicorn main:app --reload --host 0.0.0.0 --port 8001

# Producción
uvicorn main:app --host 0.0.0.0 --port 8001 --workers 2
```

---

## 🐳 Docker

### Build

```bash
docker build -t blendpos-afip-sidecar .
```

### Run

```bash
docker run -d \
  --name afip-sidecar \
  -p 8001:8001 \
  -v $(pwd)/certs:/certs:ro \
  -e AFIP_CUIT_EMISOR=20123456789 \
  -e AFIP_CERT_PATH=/certs/afip.crt \
  -e AFIP_KEY_PATH=/certs/afip.key \
  -e AFIP_HOMOLOGACION=true \
  blendpos-afip-sidecar
```

---

## 📡 API Endpoints

### `GET /health`

Health check del servicio.

**Response:**
```json
{
  "ok": true,
  "service": "afip-sidecar",
  "mode": "homologacion",
  "afip_conectado": true,
  "ultima_autenticacion": "2026-02-18T10:30:00"
}
```

### `POST /facturar`

Emite una factura electrónica en AFIP.

**Request:**
```json
{
  "cuit_emisor": "20123456789",
  "punto_de_venta": 1,
  "tipo_comprobante": 6,
  "tipo_doc_receptor": 99,
  "nro_doc_receptor": "0",
  "nombre_receptor": "CONSUMIDOR FINAL",
  "concepto": 1,
  "importe_neto": 1859.50,
  "importe_exento": 0,
  "importe_iva": 390.50,
  "importe_tributos": 0,
  "importe_total": 2250.00,
  "moneda": "PES",
  "cotizacion_moneda": 1.0,
  "items": [
    {
      "codigo": "7790001234567",
      "descripcion": "Coca-Cola 354ml",
      "cantidad": 10,
      "precio_unitario": 185.95,
      "importe_total": 1859.50,
      "alicuota_iva": 21.0
    }
  ]
}
```

**Response (Exitosa):**
```json
{
  "resultado": "A",
  "numero_comprobante": 42,
  "fecha_comprobante": "20260218",
  "cae": "71234567890123",
  "cae_vencimiento": "20260228",
  "observaciones": null,
  "reproceso": "N",
  "afip_request_id": null
}
```

**Response (Rechazada):**
```json
{
  "resultado": "R",
  "numero_comprobante": 43,
  "fecha_comprobante": "20260218",
  "cae": null,
  "cae_vencimiento": null,
  "observaciones": [
    {
      "codigo": 10048,
      "mensaje": "CUIT no registrado en AFIP"
    }
  ],
  "reproceso": "S",
  "afip_request_id": null
}
```

---

## 🧪 Testing con Scripts

### 1. Test de Health

```bash
curl http://localhost:8001/health | jq
```

### 2. Test de Facturación (Consumidor Final)

```bash
curl -X POST http://localhost:8001/facturar \
  -H "Content-Type: application/json" \
  -d '{
    "cuit_emisor": "20123456789",
    "punto_de_venta": 1,
    "tipo_comprobante": 6,
    "tipo_doc_receptor": 99,
    "nro_doc_receptor": "0",
    "nombre_receptor": "CONSUMIDOR FINAL",
    "concepto": 1,
    "importe_neto": 1000.00,
    "importe_exento": 0,
    "importe_iva": 210.00,
    "importe_tributos": 0,
    "importe_total": 1210.00,
    "moneda": "PES",
    "cotizacion_moneda": 1.0
  }' | jq
```

### 3. Test con Python

```python
import requests

response = requests.post(
    "http://localhost:8001/facturar",
    json={
        "cuit_emisor": "20123456789",
        "punto_de_venta": 1,
        "tipo_comprobante": 6,
        "tipo_doc_receptor": 99,
        "nro_doc_receptor": "0",
        "concepto": 1,
        "importe_neto": 1000.00,
        "importe_iva": 210.00,
        "importe_total": 1210.00,
        "moneda": "PES",
        "cotizacion_moneda": 1.0
    }
)

print(response.json())
```

---

## 📚 Tipos de Comprobantes AFIP

| Código | Descripción | Uso |
|--------|-------------|-----|
| 1 | Factura A | Venta a responsable inscripto |
| 6 | Factura B | Venta a consumidor final o monotributista |
| 11 | Factura C | Venta a exento o no categorizado |
| 3 | Nota de Crédito A | Anulación de Factura A |
| 8 | Nota de Crédito B | Anulación de Factura B |
| 13 | Nota de Crédito C | Anulación de Factura C |

**Más común en kioscos:** Tipo 6 (Factura B) para consumidor final.

---

## 🔍 Troubleshooting

### Error: "Certificado no encontrado"

**Causa:** Ruta de certificados incorrecta.

**Solución:**
```bash
# Verificar rutas
ls -la certs/
# Ajustar .env
AFIP_CERT_PATH=/ruta/correcta/afip.crt
AFIP_KEY_PATH=/ruta/correcta/afip.key
```

### Error: "WSAA authentication failed"

**Causa:** Certificado expirado o inválido.

**Solución:**
1. Verificar vigencia del certificado:
   ```bash
   openssl x509 -in certs/afip.crt -noout -dates
   ```
2. Regenerar certificado si expiró (ver sección de certificados).

### Error: "Token expirado"

**Causa:** Token WSAA expira cada ~12h.

**Solución:**
- El sidecar se re-autentica automáticamente.
- Si persiste, revisar conectividad con AFIP.

### Error: "CUIT no registrado en AFIP"

**Causa:** El CUIT del emisor no tiene permiso para facturar electrónicamente.

**Solución:**
1. **Homologación:** Usar CUIT de testing `20409378472`.
2. **Producción:** Tramitar adhesión a Factura Electrónica en AFIP.

### Error: "Número de comprobante duplicado"

**Causa:** Se intentó emitir un comprobante con número ya usado.

**Solución:**
- El sidecar obtiene automáticamente el último número de AFIP.
- Si persiste, verificar sincronización con AFIP.

---

## 🔐 Seguridad

### Certificados

- ✅ **Guardar en secrets manager** (AWS Secrets, Vault, etc.)
- ✅ **Montar como volúmenes read-only en Docker**
- ✅ **Rotar anualmente** según vencimiento de AFIP
- ❌ **Nunca commitear a Git**
- ❌ **Nunca exponer en variables de entorno públicas**

### Red

- ✅ **Exponer solo en red interna** (Docker network)
- ✅ **No exponer puerto 8001 públicamente**
- ✅ **Usar HTTPS en producción** (Traefik/nginx como proxy)

### Logs

- ✅ **Evitar loguear datos sensibles** (CUIT, montos)
- ✅ **Utilizar IDs de request** para trazabilidad
- ✅ **Rotar logs automáticamente**

---

## 📊 Monitoreo

### Métricas Sugeridas

- **Latencia de facturación:** Tiempo de respuesta de `/facturar`
- **Tasa de aprobación:** % de facturas con resultado "A"
- **Errores AFIP:** Count de rechazos por código de error
- **Renovaciones de token:** Frecuencia de autenticación WSAA

### Alertas

```yaml
# Ejemplo para Prometheus
- alert: AFIPSidecarDown
  expr: up{job="afip-sidecar"} == 0
  for: 1m
  annotations:
    summary: "AFIP Sidecar no disponible"

- alert: AFIPHighRejectionRate
  expr: rate(afip_rechazos_total[5m]) > 0.1
  for: 5m
  annotations:
    summary: "Alta tasa de rechazos en AFIP"
```

---

## 🛠️ Desarrollo

### Estructura de Archivos

```
afip-sidecar/
├── main.py              # Entry point FastAPI
├── afip_client.py       # Cliente WSAA + WSFEV1
├── schemas.py           # Modelos Pydantic
├── requirements.txt     # Dependencias Python
├── Dockerfile           # Build de Docker
├── .env.example         # Variables de entorno (template)
├── .gitignore           # Excluye .env y certificados
└── README.md            # Esta documentación
```

### Agregar Nueva Funcionalidad

1. **Crear schema en `schemas.py`**
2. **Agregar método en `AFIPClient`**
3. **Exponer endpoint en `main.py`**
4. **Escribir test**
5. **Actualizar este README**

---

## 📞 Soporte

- **Documentación AFIP:** https://www.afip.gob.ar/fe/
- **pyafipws:** https://github.com/reingart/pyafipws
- **WSFEV1 Spec:** https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp

---

## 📄 Licencia

Este código es parte de BlendPOS y sigue la misma licencia del proyecto principal.

---

**Implementado con ❤️ para BlendPOS**
