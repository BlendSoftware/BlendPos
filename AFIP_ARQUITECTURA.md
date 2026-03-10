# Arquitectura AFIP - BlendPOS

## 📋 Información Completa de Facturación Electrónica

**Autor**: Análisis completo del sistema  
**Fecha**: 9 de marzo de 2026  
**Propósito**: Documentar toda la arquitectura AFIP para futura resolución de problemas

---

## 🏗️ ARQUITECTURA GENERAL

### Diseño: Sidecar Pattern

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Frontend      │         │   Backend Go    │         │  AFIP Sidecar   │
│   (React)       │────────▶│   (BlendPOS)    │────────▶│   (Python)      │
│                 │   JWT   │                 │  Auth   │                 │
└─────────────────┘         └─────────────────┘  Token  └─────────────────┘
                                                              │
                                                              │ HTTPS
                                                              ▼
                                                    ┌─────────────────┐
                                                    │   AFIP Servers  │
                                                    │   (Argentina)   │
                                                    └─────────────────┘
```

### Ventajas del Sidecar
1. **Aislamiento**: Python con pyafipws separado del backend Go
2. **Escalabilidad**: Se puede escalar independientemente
3. **Mantenimiento**: Actualizaciones de AFIP sin tocar backend
4. **Seguridad**: Certificados aislados en un contenedor
5. **Circuit Breaker**: Fallos de AFIP no tumban el backend

---

## 📁 ESTRUCTURA DE ARCHIVOS

### Directorio: `afip-sidecar/`

```
afip-sidecar/
├── main.py                      # FastAPI server principal
├── afip_client.py              # Wrapper de pyafipws (WSAA + WSFEV1)
├── schemas.py                  # Pydantic models para API
├── py3_compat.py              # Monkey patches Python 2→3
├── requirements.txt            # Dependencias Python
├── Dockerfile                  # Imagen Docker optimizada
├── entrypoint.sh              # Script de inicio con patches
│
├── certs/                      # Certificados AFIP
│   ├── afip.crt               # Certificado X.509 oficial
│   ├── afip.key               # Clave privada RSA
│   ├── cert_base64.txt        # Workaround Railway (base64)
│   ├── key_base64.txt         # Workaround Railway (base64)
│   └── README.md              # Guía generación certificados
│
├── patches/                    # Patches de pyafipws
│   ├── patch_wsfev1_final.py  # Patch consolidado WSFEV1
│   ├── patch_wsaa.py          # Patch WSAA
│   └── (otros patches legacy)
│
└── docs/
    ├── QUICKSTART.md          # Guía inicio rápido
    ├── IMPLEMENTATION.md      # Detalles de implementación
    └── INSTRUCCIONES_RAILWAY.md  # Deploy en Railway
```

---

## 🔐 AUTENTICACIÓN AFIP (WSAA)

### Flujo de Autenticación

```
┌──────────────┐     1. Solicitar TA     ┌──────────────┐
│  Sidecar     │────────────────────────▶│   AFIP WSAA  │
│              │                          │   (LoginCms) │
│              │◀────────────────────────│              │
└──────────────┘   2. TA firmado (XML)   └──────────────┘
       │
       │ 3. Extraer Token + Sign
       ▼
  ┌─────────────┐
  │ Redis Cache │ (12h TTL)
  └─────────────┘
```

### Componentes

#### 1. Certificado X.509
- **Obtenido de**: AFIP → Administrador de Relaciones → WSFE
- **Validez**: 2 años
- **Formato**: PEM (Base64 encoded)
- **Ubicación**: `afip-sidecar/certs/afip.crt`

**Generar CSR**:
```bash
cd afip-sidecar
./generate_certs.sh
```

Esto genera `afip.csr` que se sube a AFIP para obtener el `.crt` oficial.

#### 2. WSAA Token
- **Duración**: ~12 horas
- **Incluye**: Token (JWT-like), Sign (firma digital), Expiration
- **Cache**: Redis con clave `afip:wsaa:token`
- **Retry**: Auto re-auth si expiró

**Archivo**: `afip-sidecar/afip_client.py:102-165`

```python
# Fragmento relevante
_REDIS_TOKEN_KEY = "afip:wsaa:token"
_REDIS_SIGN_KEY  = "afip:wsaa:sign"
_REDIS_EXP_KEY   = "afip:wsaa:expiracion"
_REDIS_TTL_SEC   = 43200  # 12 hours
```

---

## 📄 FACTURACIÓN ELECTRÓNICA (WSFEV1)

### Tipos de Comprobantes

| Código | Tipo | Descripción | IVA |
|--------|------|-------------|-----|
| 1 | Factura A | Responsable Inscripto → Responsable Inscripto | Discriminado |
| 6 | Factura B | Responsable Inscripto → Consumidor Final/Monotributista | No discriminado |
| 11 | Factura C | Monotributista → Cualquiera | Sin IVA |
| 99 | Ticket Interno | No fiscal | N/A |

**Archivo**: `backend/internal/service/facturacion_service.go:50-80`

### Flujo de Facturación

```
1. Venta en POS
   └─▶ backend.RegistrarVenta()
        └─▶ Guardar en DB (estado: pagado)
             └─▶ Encolar job de facturación
                  │
                  │ 2. Worker toma el job
                  ▼
             facturacion_worker.go
                  │
                  │ 3. POST /facturar
                  ▼
             AFIP Sidecar (main.py)
                  │
                  │ 4. WSAA auth (if needed)
                  │ 5. WSFEV1.FECAESolicitar()
                  ▼
             AFIP Servers
                  │
                  │ 6. Responde con CAE o error
                  ▼
             Backend actualiza comprobante
                  │
                  ├─▶ Si OK: genera PDF, envía email
                  └─▶ Si error: guarda observaciones, retry automático
```

### Request de Facturación

**Endpoint**: `POST http://afip-sidecar:8001/facturar`

**Auth**: Header `X-Internal-API-Token` (secret compartido)

**Body**:
```json
{
  "cuit_emisor": "20123456789",
  "punto_de_venta": 1,
  "tipo_comprobante": 6,    // Factura B
  "tipo_doc_receptor": 96,  // DNI = 96, CUIT = 80, Sin doc = 99
  "nro_doc_receptor": "12345678",
  "nombre_receptor": "JUAN PEREZ",
  "domicilio_receptor": "AV CORRIENTES 1234",
  "concepto": 1,            // 1=Productos, 2=Servicios, 3=Mixto
  "importe_neto": 1000.00,
  "importe_exento": 0.00,
  "importe_iva": 210.00,    // 21% IVA
  "importe_tributos": 0.00,
  "importe_total": 1210.00,
  "moneda": "PES",          // Pesos argentinos
  "cotizacion_moneda": 1.0,
  "iva": [
    {
      "id": 5,              // 5 = 21%, 4 = 10.5%, 3 = 0%
      "base_imponible": 1000.00,
      "importe": 210.00
    }
  ]
}
```

**Response exitosa**:
```json
{
  "resultado": "A",         // A = Aprobado, R = Rechazado
  "numero_comprobante": 123,
  "fecha_comprobante": "20260309",
  "cae": "71234567890123",  // CAE de 14 dígitos
  "cae_vencimiento": "20260319",  // 10 días validez
  "observaciones": null
}
```

**Response con error**:
```json
{
  "resultado": "R",
  "observaciones": [
    {
      "code": 10016,
      "msg": "El CUIT del receptor no existe en los registros de AFIP"
    }
  ]
}
```

### Códigos de Error AFIP Comunes

| Código | Descripción | Solución |
|--------|-------------|----------|
| 10016 | CUIT receptor inválido | Validar que el CUIT existe en AFIP |
| 10071 | Total no coincide con neto + IVA | Revisar cálculos de IVA |
| 10024 | Campos obligatorios faltantes | Ver schema completo, todos los campos requeridos |
| 600 | Token WSAA expirado | Auto-retry con re-auth (ya implementado) |
| 601 | CUIT no autorizado | Verificar en AFIP web que CUIT tiene permisos WSFE |

**Archivo**: `afip-sidecar/schemas.py:60-72`

---

## 🗄️ MODELO DE DATOS

### Tabla: `comprobantes`

```sql
CREATE TABLE comprobantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
    
    -- Request enviado a AFIP
    request_afip JSONB NOT NULL,
    
    -- Response de AFIP
    response_afip JSONB,
    
    -- Datos del comprobante
    tipo_comprobante VARCHAR(20) NOT NULL,  -- 'factura_a', 'factura_b', etc
    punto_de_venta INTEGER NOT NULL,
    numero_comprobante INTEGER,
    fecha_comprobante DATE,
    
    -- CAE (Código de Autorización Electrónica)
    cae VARCHAR(14),
    cae_vencimiento DATE,
    
    -- Estado y retry
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',  -- pendiente | emitido | error
    intentos_fallidos INTEGER DEFAULT 0,
    ultimo_intento TIMESTAMP,
    proximo_intento TIMESTAMP,
    
    -- Observaciones de error
    error_code VARCHAR(10),
    error_msg TEXT,
    observaciones JSONB,
    
    -- Storage
    pdf_path TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_comprobantes_venta ON comprobantes(venta_id);
CREATE INDEX idx_comprobantes_estado ON comprobantes(estado, proximo_intento);
CREATE INDEX idx_comprobantes_cae ON comprobantes(cae);
```

**Archivo**: `backend/migrations/000001_create_tables.up.sql:150-180`

### Modelo Go: `Comprobante`

```go
type Comprobante struct {
    ID                 uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    VentaID            uuid.UUID      `gorm:"type:uuid;not null"`
    RequestAFIP        datatypes.JSON `gorm:"type:jsonb;not null"`
    ResponseAFIP       datatypes.JSON `gorm:"type:jsonb"`
    TipoComprobante    string         `gorm:"size:20;not null"`
    PuntoDeVenta       int            `gorm:"not null"`
    NumeroComprobante  *int
    FechaComprobante   *time.Time
    CAE                *string        `gorm:"size:14"`
    CAEVencimiento     *time.Time
    Estado             string         `gorm:"size:20;not null;default:'pendiente'"`
    IntentosFallidos   int            `gorm:"default:0"`
    UltimoIntento      *time.Time
    ProximoIntento     *time.Time
    ErrorCode          *string        `gorm:"size:10"`
    ErrorMsg           *string
    Observaciones      datatypes.JSON `gorm:"type:jsonb"`
    PDFPath            *string
    CreatedAt          time.Time      `gorm:"autoCreateTime"`
    UpdatedAt          time.Time      `gorm:"autoUpdateTime"`
    
    // Relaciones
    Venta              *Venta         `gorm:"foreignKey:VentaID"`
}
```

**Archivo**: `backend/internal/model/comprobante.go`

---

## ⚙️ BACKEND GO - FACTURACIÓN

### Service: `FacturacionService`

**Ubicación**: `backend/internal/service/facturacion_service.go`

**Responsabilidades**:
1. Mapear venta → request AFIP
2. Calcular IVA según tipo de comprobante
3. Validar datos antes de enviar
4. Llamar al sidecar vía HTTP
5. Procesar response y actualizar DB

**Métodos principales**:

```go
// Emite un comprobante para una venta
func (s *facturacionService) EmitirComprobante(ctx, ventaID) (*Comprobante, error)

// Reintenta un comprobante fallido
func (s *facturacionService) ReintentarComprobante(ctx, comprobanteID) error

// Anula un comprobante (no cancela en AFIP, solo marca como anulado)
func (s *facturacionService) AnularComprobante(ctx, comprobanteID) error

// Genera PDF del comprobante
func (s *facturacionService) GenerarPDF(ctx, comprobanteID) (string, error)
```

### Worker: Procesamiento Asíncrono

**Ubicación**: `backend/internal/worker/facturacion_worker.go`

**Características**:
- Pool de workers concurrentes (default: 2)
- Retry exponencial (2s, 4s, 8s, 16s, 32s)
- Límite de 5 intentos
- Timeout de 30s por request
- Circuit breaker para AFIP

**Configuración**:
```bash
# .env
FACTURACION_WORKERS=2  # Número de workers concurrentes
```

**Código relevante**:
```go
// backend/internal/worker/facturacion_worker.go:45-120

func (w *FacturacionWorker) procesarComprobantesPendientes() {
    for {
        select {
        case <-w.ctx.Done():
            return
        case <-time.After(5 * time.Second):
            // Buscar comprobantes pendientes o con retry programado
            comprobantes := w.buscarPendientes()
            
            for _, comp := range comprobantes {
                // Circuit breaker check
                if !w.circuitBreaker.Allow() {
                    log.Warn().Msg("AFIP circuit breaker abierto, esperando...")
                    break
                }
                
                // Enviar a pool de workers
                w.jobChan <- comp
            }
        }
    }
}

func (w *FacturacionWorker) worker(id int) {
    for job := range w.jobChan {
        err := w.facturacionSvc.EmitirComprobante(w.ctx, job.VentaID)
        if err != nil {
            w.handleError(job, err)
        } else {
            w.handleSuccess(job)
        }
    }
}
```

### Circuit Breaker

**Ubicación**: `backend/internal/infra/circuit_breaker.go`

**Configuración**:
- **Threshold**: 5 fallos consecutivos
- **Timeout**: 30 segundos abierto
- **Reset**: Automático tras timeout

**Estados**:
```
Closed (normal) → Open (bloqueado) → Half-Open (testing) → Closed
       ↑                ↓                     ↓
       └─────────────── success ─────────────┘
```

---

## 🌐 FRONTEND - INTEGRACIÓN

### Configuración Fiscal

**Página**: `frontend/src/pages/admin/ConfiguracionFiscalPage.tsx`

**Campos**:
```typescript
{
  condicion_fiscal: 'Responsable Inscripto' | 'Monotributo',
  razon_social: string,
  cuit: string,         // Con validación formato XX-XXXXXXXX-X
  domicilio_fiscal: string,
  punto_de_venta: number,
  inicio_actividades: Date,
  ingresos_brutos: string,
  iibb_alicuota: number,
  afip_certificado_vencimiento: Date
}
```

**Validación de CUIT**:
```typescript
// frontend/src/pages/admin/ConfiguracionFiscalPage.tsx:80-100
const validarCUIT = (cuit: string) => {
  const cleanCuit = cuit.replace(/\D/g, '');
  if (cleanCuit.length !== 11) return false;
  
  // Algoritmo verificador de CUIT
  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = cleanCuit
    .slice(0, 10)
    .split('')
    .reduce((acc, digit, i) => acc + parseInt(digit) * multiplicadores[i], 0);
  
  const resto = suma % 11;
  const digitoVerificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  
  return digitoVerificador === parseInt(cleanCuit[10]);
};
```

### Modal de Pago (Tipo de Comprobante)

**Componente**: `frontend/src/components/pos/PaymentModal.tsx`

**Lógica de selección**:
```typescript
// Líneas 90-120
const opcionesComprobante = useMemo(() => {
  const baseOptions = [
    { value: 'auto', label: 'Automatico' },
    { value: 'ticket_interno', label: 'Ticket' },
    { value: 'factura_c', label: 'Factura C' },
  ];

  // Monotributista: Solo ticket y Factura C
  if (!config || config.condicion_fiscal === 'Monotributo') {
    return baseOptions;
  }

  // Responsable Inscripto: Todos los tipos
  if (config.condicion_fiscal === 'Responsable Inscripto') {
    return [
      ...baseOptions,
      { value: 'factura_b', label: 'Factura B' },
      { value: 'factura_a', label: 'Factura A' },
    ];
  }

  return baseOptions;
}, [config]);
```

**Modo "Auto"**:
- Si hay email: intenta factura electrónica
- Sin email o error: fallback a ticket interno
- Factura A requiere CUIT obligatorio

### API Facturación

**Service**: `frontend/src/services/api/facturacion.ts`

**Endpoints**:
```typescript
// Obtener comprobante de una venta
GET /v1/facturacion/:venta_id

// Descargar PDF
GET /v1/facturacion/pdf/:comprobante_id

// Ver HTML (preview)
GET /v1/facturacion/html/:comprobante_id

// Anular comprobante (admin/supervisor)
DELETE /v1/facturacion/:comprobante_id

// Reintentar emisión fallida
POST /v1/facturacion/:comprobante_id/reintentar

// Regenerar PDF (si se perdió)
POST /v1/facturacion/:comprobante_id/regen-pdf
```

---

## 🐛 PROBLEMAS CONOCIDOS

### 1. ⚠️ Certificados Hardcoded

**Problema**: Los certificados están en base64 en el repo para Railway

**Archivos**:
- `afip-sidecar/certs/cert_base64.txt`
- `afip-sidecar/certs/key_base64.txt`

**Razón**: Railway no permite subir archivos arbitrarios, solo variables de entorno

**Solución actual**: `entrypoint.sh` decodifica los base64 al iniciar

**Riesgo**: 
- Certificados en git (aunque privado)
- Renovación requiere nuevo commit

**Solución ideal**:
```bash
# Usar Railway volumes o secrets manager
railway volumes create afip-certs
railway volumes attach afip-certs /app/certs
```

---

### 2. 🔴 Problemas Reportados por Usuario

**Síntoma**: "Estoy teniendo problemas con la factura de la AFIP"

**Posibles causas** (investigar con logs):

#### A. WSAA Authentication Failed
```
Error: WSAA authentication failed
```

**Diagnóstico**:
```bash
# Ver logs del sidecar
railway logs --service afip-sidecar --tail 100

# Buscar líneas con "WSAA" o "auth"
```

**Causas comunes**:
1. Certificado expirado (validez: 2 años)
2. Certificado autofirmado (no oficial de AFIP)
3. CUIT no registrado en AFIP para WSFE
4. Timezone del servidor incorrecto (TA generado con fecha futura/pasada)

**Solución**:
```bash
# 1. Verificar vigencia del certificado
openssl x509 -in afip-sidecar/certs/afip.crt -noout -dates

# 2. Verificar que es oficial (no autofirmado)
openssl x509 -in afip-sidecar/certs/afip.crt -noout -issuer

# 3. Regenerar certificado en AFIP si expiró
cd afip-sidecar
./generate_certs.sh
# Subir CSR a AFIP web, descargar nuevo CRT
```

#### B. Error 10071: Total no coincide
```
{"code": 10071, "msg": "El importe total no coincide con la sumatoria"}
```

**Causa**: Cálculo incorrecto de IVA o subtotal

**Diagnóstico**:
```go
// backend/internal/service/facturacion_service.go:200-250
// Revisar función calcularImpuestos()

// Fórmula correcta Factura B:
neto = total / 1.21
iva = neto * 0.21
total = neto + iva

// Redondeo: SIEMPRE 2 decimales
```

**Agregar log temporal**:
```go
log.Debug().
    Float64("neto", neto).
    Float64("iva", iva).
    Float64("total", total).
    Msg("Cálculo IVA para AFIP")
```

#### C. Error 10016: CUIT receptor inválido
```
{"code": 10016, "msg": "El CUIT ingresado no existe en el padrón de AFIP"}
```

**Causa**: CUIT inexistente o con formato incorrecto

**Validación frontend**:
```typescript
// Ya implementada en PaymentModal.tsx
const isDocumentoValid = 
  /^\d{11}$/.test(normalizedDocumento)  // CUIT: 11 dígitos
  || /^\d{7,8}$/.test(normalizedDocumento);  // DNI: 7-8 dígitos
```

**Solución**:
1. Validar CUIT con algoritmo verificador
2. Para Factura C sin CUIT: usar tipo_doc=99, nro_doc="0"

#### D. Circuit Breaker Abierto
```
WARN: AFIP circuit breaker abierto, esperando...
```

**Causa**: 5+ fallos consecutivos a AFIP

**Solución**:
1. Verificar conectividad: `curl https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL`
2. Revisar timeout (30s puede ser poco en red lenta)
3. Esperar 30s para auto-reset del circuit breaker

#### E. Redis Token Persistence
```
DEBUG: No se pudo guardar token WSAA en Redis
```

**Causa**: Redis no disponible o timeout

**Impacto**: No crítico, fallback a memoria funciona

**Solución**:
```bash
# Verificar Redis
railway variables | grep REDIS_URL
redis-cli -u $REDIS_URL ping
```

---

### 3. ⚠️ Rate Limiting AFIP

**Límites conocidos**:
- WSAA: ~10 autenticaciones/hora por CUIT
- WSFEV1: ~300 req/min (no oficial, empírico)

**Estrategia actual**:
- Token cached 12h en Redis ✅
- Re-auth solo si expiró ✅
- Circuit breaker tras 5 fallos ✅

**Agregar si hay problemas**:
```python
# afip-sidecar/afip_client.py
import time
from ratelimit import limits, sleep_and_retry

@sleep_and_retry
@limits(calls=250, period=60)  # 250 req/min
def _call_afip_with_ratelimit(self):
    return self._wsfev1.FECAESolicitar(...)
```

---

## 📊 MONITOREO Y DEBUG

### Logs Críticos

#### Backend
```bash
# Logs de facturación worker
railway logs --service backend | grep "facturacion"

# Logs de circuit breaker
railway logs --service backend | grep "circuit"

# Logs de AFIP sidecar calls
railway logs --service backend | grep "afip-sidecar"
```

#### AFIP Sidecar
```bash
# Logs de autenticación
railway logs --service afip-sidecar | grep "WSAA"

# Logs de facturación
railway logs --service afip-sidecar | grep "FECAESolicitar"

# Logs de errores
railway logs --service afip-sidecar | grep "ERROR"
```

### Métricas Importantes

**Dashboard a crear** (Grafana o similar):

1. **Tasa de éxito facturación**
   - Métrica: `comprobantes.estado = 'emitido' / total`
   - Alerta: < 95%

2. **Tiempo promedio emisión**
   - Métrica: `updated_at - created_at` en comprobantes
   - Alerta: > 10s

3. **Circuit breaker abierto**
   - Métrica: Estado del circuit breaker
   - Alerta: Cualquier apertura

4. **Intentos fallidos acumulados**
   - Métrica: `SUM(intentos_fallidos)` por día
   - Alerta: > 20

### Queries de Debug

```sql
-- Comprobantes pendientes hace más de 1 hora
SELECT id, venta_id, estado, created_at, error_msg
FROM comprobantes
WHERE estado = 'pendiente'
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Comprobantes fallidos repetidamente
SELECT id, venta_id, intentos_fallidos, error_code, error_msg
FROM comprobantes
WHERE intentos_fallidos >= 3
ORDER BY intentos_fallidos DESC, created_at DESC;

-- Errores más comunes
SELECT error_code, error_msg, COUNT(*) as cantidad
FROM comprobantes
WHERE error_code IS NOT NULL
GROUP BY error_code, error_msg
ORDER BY cantidad DESC;

-- Ventas sin comprobante emitido
SELECT v.id, v.fecha, v.total, v.cliente_email
FROM ventas v
LEFT JOIN comprobantes c ON v.id = c.venta_id
WHERE c.id IS NULL
  AND v.anulada = false
  AND v.fecha > NOW() - INTERVAL '7 days'
ORDER BY v.fecha DESC;
```

---

## 🔧 TROUBLESHOOTING GUIDE

### Flowchart de Diagnóstico

```
Factura falla
      │
      ├─ ¿Logs muestran "WSAA auth failed"?
      │   YES → Verificar certificado
      │        → Verificar CUIT registrado en AFIP
      │        → Verificar fechas/timezone
      │   NO  → Continuar
      │
      ├─ ¿Error 10071 (totales no coinciden)?
      │   YES → Revisar cálculo IVA en backend
      │        → Agregar logs de debug
      │        → Verificar redondeo (2 decimales)
      │   NO  → Continuar
      │
      ├─ ¿Error 10016 (CUIT inválido)?
      │   YES → Validar CUIT con algoritmo verificador
      │        → Si es Factura C sin doc: usar tipo 99, nro "0"
      │   NO  → Continuar
      │
      ├─ ¿Circuit breaker abierto?
      │   YES → Verificar conectividad AFIP
      │        → Esperar 30s para auto-reset
      │        → Aumentar timeout si red lenta
      │   NO  → Continuar
      │
      └─ ¿Timeout o network error?
          YES → Verificar DNS/firewall
               → Revisar proxy si existe
               → Aumentar timeout en worker
          NO  → Revisar logs completos AFIP sidecar
```

### Comandos de Diagnóstico

```bash
# 1. Health check completo
curl https://your-backend.railway.app/health | jq

# 2. Test directo al sidecar (desde backend container)
railway run --service backend -- \
  curl -X GET http://afip-sidecar:8001/health

# 3. Ver estado de Redis token
railway run --service backend -- \
  redis-cli -u $REDIS_URL GET "afip:wsaa:token"

# 4. Test manual de facturación
curl -X POST http://localhost:8001/facturar \
  -H "Content-Type: application/json" \
  -H "X-Internal-API-Token: $INTERNAL_API_TOKEN" \
  -d @test_factura.json | jq

# 5. Verificar conectividad AFIP
curl -I https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL

# 6. Ver último comprobante fallido
psql $DATABASE_URL -c "
  SELECT id, error_code, error_msg, observaciones
  FROM comprobantes
  WHERE estado = 'error'
  ORDER BY created_at DESC
  LIMIT 1;
"
```

---

## 📚 RECURSOS ADICIONALES

### Documentación Oficial AFIP
- **WSFE Manual**: http://www.afip.gob.ar/fe/documentos/manual_desarrollador_COMPG_v2_10.pdf
- **RG 5616**: Régimen de factura electrónica
- **Homologación**: https://www.afip.gob.ar/ws/
- **Certificados**: https://www.afip.gob.ar/ws/WSAA/certificado.asp

### Códigos y Tablas AFIP
- **Tipos de documento**: 80=CUIT, 96=DNI, 99=Sin identificar
- **Tipos de IVA**: 3=0%, 4=10.5%, 5=21%, 6=27%
- **Conceptos**: 1=Productos, 2=Servicios, 3=Productos y Servicios
- **Monedas**: PES=Pesos, DOL=Dólares

### pyafipws
- **GitHub**: https://github.com/PyAFIPWS/pyafipws
- **Docs**: https://github.com/PyAFIPWS/pyafipws/wiki
- **Issues conocidos Python 3**: Varios parches aplicados en BlendPOS

---

## 🎯 PRÓXIMOS PASOS PARA RESOLVER FACTURACIÓN

### Paso 1: Identificar el Error Exacto
```bash
# Ejecutar desde local o Railway CLI
railway logs --service afip-sidecar --tail 200 > afip_logs.txt
railway logs --service backend --tail 200 > backend_logs.txt

# Buscar patrones de error
grep -i "error\|fail\|exception" afip_logs.txt
grep -i "afip\|factur" backend_logs.txt
```

### Paso 2: Test Aislado del Sidecar
```bash
cd afip-sidecar

# Levantar localmente con certificados de homologación
docker compose up

# Test manual (ver test_client.py)
python test_client.py
```

### Paso 3: Validar Certificados
```bash
# Verificar vigencia
openssl x509 -in certs/afip.crt -noout -dates

# Verificar emisor (debe ser AFIP, no autofirmado)
openssl x509 -in certs/afip.crt -noout -issuer

# Verificar CUIT en el certificado
openssl x509 -in certs/afip.crt -noout -subject
```

### Paso 4: Test de Conectividad
```bash
# AFIP Homologación
curl -I https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl
curl -I https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL

# AFIP Producción (si aplica)
curl -I https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl
curl -I https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL
```

### Paso 5: Revisar Última Request/Response
```sql
-- En la DB de producción
SELECT 
  id,
  venta_id,
  request_afip::text,
  response_afip::text,
  error_code,
  error_msg,
  observaciones::text
FROM comprobantes
WHERE estado = 'error'
  OR intentos_fallidos > 0
ORDER BY created_at DESC
LIMIT 1;
```

### Paso 6: Compartir Info para Debug
Cuando contactes al equipo o revises logs, incluir:
1. ✅ Logs completos del sidecar (`afip_logs.txt`)
2. ✅ Última entrada de `comprobantes` con error
3. ✅ Vigencia del certificado
4. ✅ CUIT emisor y modo (homologación/producción)
5. ✅ Tipo de comprobante que falla (A, B, C, ticket)

---

## ✅ CHECKLIST DE RESOLUCIÓN

- [ ] Logs del sidecar revisados
- [ ] Logs del backend revisados
- [ ] Certificado vigente verificado
- [ ] CUIT registrado en AFIP para WSFE
- [ ] Test directo al sidecar exitoso
- [ ] Conectividad a AFIP confirmada
- [ ] Request/response de error identificado
- [ ] Cálculos de IVA validados manualmente
- [ ] Circuit breaker estado normal
- [ ] Redis token cache funcionando

---

**Fin del documento**. Con esta información deberías poder diagnosticar y resolver cualquier problema de facturación AFIP en BlendPOS.
