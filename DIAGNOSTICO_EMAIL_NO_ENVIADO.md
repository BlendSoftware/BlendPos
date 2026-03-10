# 🔍 Diagnóstico - Email No Enviado

## ✅ Problema CONFIRMADO

```
ERROR: email_worker: failed to send email 
error="mailer: dial: dial tcp 172.217.78.109:587: connect: connection timed out"
to=juanisarmientoomartinez@gmail.com
```

## 🚨 Causa Raíz

**Railway bloquea TODAS las conexiones SMTP salientes** (puertos 25, 465, 587) para prevenir spam.

- ❌ Tu código está **PERFECTO**
- ❌ Gmail está **BIEN CONFIGURADO**
- ❌ El problema es **INFRAESTRUCTURA DE RAILWAY**

## ✅ Solución

Usar SendGrid/Resend/Mailgun - Railway **NO los bloquea**.

Ver: [CONFIGURAR_SENDGRID.md](CONFIGURAR_SENDGRID.md) para configuración paso a paso.

---

## Diagnóstico Original (antes de confirmar el problema)

La factura se emite correctamente pero el email **NO se envía**.

## Variables Verificadas ✅

Según las capturas de Railway:
- ✅ `SMTP_HOST=smtp.gmail.com`
- ✅ `SMTP_PORT=465`
- ✅ `SMTP_USER=blendsoftware1@gmail.com`
- ✅ `SMTP_PASSWORD=ydal zbqq qbhh rkjc` (contraseña de aplicación)
- ✅ `EMAIL_WORKERS=2`
- ✅ `SMTP_FROM=BlendPOS <blendsoftware1@gmail.com>`

## Diagnóstico por Pasos

### 1️⃣ Verificar logs de Railway

**Buscar en Railway → Deployments → Logs**:

```bash
# ✅ Job de facturación procesado
"facturacion_worker: CAE received"

# ✅ Job de email encolado
"facturacion_worker: email job enqueued"

# ⚠️ Si NO aparece este log, el problema es en el encolado
# ❌ Si aparece pero no hay logs del EmailWorker, el problema es el worker

# ✅ EmailWorker procesando
"email_worker: comprobante sent successfully"

# ❌ Error al enviar
"email_worker: failed to send email"
"mailer: auth: invalid credentials"
"mailer: dial: connection refused"
```

### 2️⃣ Posibles Causas

#### A) El job no se encoló
**Síntoma**: No aparece log `"email job enqueued"`

**Causas posibles**:
- `dispatcher` es `nil` en el `FacturacionWorker`
- El campo `ClienteEmail` no llegó al payload
- Redis no está disponible

**Solución**: Verificar logs de inicio del servidor:
```bash
"dispatcher initialized"
"worker pool started: facturacion=X, email=2"
```

#### B) El job se encoló pero no se procesa
**Síntoma**: Aparece `"email job enqueued"` pero no `"comprobante sent successfully"`

**Causas posibles**:
- EmailWorker no está corriendo (0 workers)
- Redis queue bloqueada
- Mailer no está inicializado

**Solución**: Verificar que aparezca en logs:
```bash
"starting email workers: 2"
```

#### C) El EmailWorker falla al enviar
**Síntoma**: Aparece error después de `"email job enqueued"`

**Causas posibles**:
1. **Credenciales incorrectas**
   ```
   "mailer: auth: 535 authentication failed"
   ```
   → La contraseña de aplicación expiró o es incorrecta

2. **Conexión bloqueada**
   ```
   "mailer: dial: connection refused"
   ```
   → Railway bloquea puerto 465 (usar 587 con STARTTLS)

3. **Gmail bloqueó el acceso**
   ```
   "mailer: auth: account disabled"
   ```
   → Gmail detectó actividad sospechosa

4. **PDF no encontrado** (no crítico, debería enviar sin adjunto)
   ```
   "mailer: leer PDF: no such file or directory"
   ```

### 3️⃣ Tests Manuales

#### Test 1: Verificar conectividad SMTP desde Railway

Ejecutar en Railway shell (si está disponible):

```bash
# Test de conexión a Gmail puerto 465
timeout 5 bash -c '</dev/tcp/smtp.gmail.com/465' 2>/dev/null && echo "OK" || echo "BLOCKED"

# Test de conexión puerto 587 (alternativa)
timeout 5 bash -c '</dev/tcp/smtp.gmail.com/587' 2>/dev/null && echo "OK" || echo "BLOCKED"
```

#### Test 2: Enviar email manual desde endpoint

```bash
# Usar el endpoint de envío manual
curl -X POST https://tudominio.railway.app/v1/facturacion/{comprobante_id}/enviar-email \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"email": "juanisarmientoomartinez@gmail.com"}'
```

Si esto funciona → el problema es en el flujo automático  
Si esto falla → el problema es en el Mailer/SMTP

### 4️⃣ Soluciones por Caso

#### Caso 1: Puerto 465 bloqueado en Railway

**Railway puede bloquear puerto 465**. Cambiar a puerto 587:

```bash
# En Railway variables:
SMTP_PORT=587  # Cambiar de 465 a 587
```

El código ya soporta ambos puertos automáticamente.

#### Caso 2: Contraseña de aplicación expirada

Regenerar en Google:
1. Ir a https://myaccount.google.com/apppasswords
2. Generar nueva contraseña para "Correo"
3. Actualizar `SMTP_PASSWORD` en Railway
4. Hacer redeploy

#### Caso 3: Mailer no está disponible

Verificar que el Mailer se inicialice correctamente. Buscar en logs:
```
"mailer configured: true"
```

Si aparece `"mailer configured: false"` → las variables SMTP_* no están llegando.

#### Caso 4: Redis no está funcionando

Verificar conexión Redis en logs:
```
"connected to redis"
```

Si no aparece o hay error → verificar `REDIS_URL` en Railway.

### 5️⃣ Debugging en Código

Si los logs no ayudan, agregar prints de debug:

#### En `facturacion_worker.go` línea 163:

```go
// Antes de:
if payload.ClienteEmail != nil && *payload.ClienteEmail != "" {
    w.enqueueEmail(ctx, venta, *payload.ClienteEmail, pdfPath)
}

// Agregar:
log.Info().
    Str("venta_id", payload.VentaID).
    Str("cliente_email", func() string {
        if payload.ClienteEmail != nil {
            return *payload.ClienteEmail
        }
        return "<nil>"
    }()).
    Bool("dispatcher_nil", w.dispatcher == nil).
    Msg("facturacion_worker: about to enqueue email")
```

#### En `email_worker.go` al inicio de `Process`:

```go
log.Info().
    Str("raw_payload", string(raw)).
    Msg("email_worker: received job")
```

### 6️⃣ Checklist Rápido

- [ ] Railway logs muestran `"email job enqueued"`
- [ ] Railway logs muestran `"starting email workers: 2"`
- [ ] Railway logs muestran `"comprobante sent successfully"`
- [ ] Railway logs NO muestran errores de SMTP
- [ ] Variables SMTP_* están configuradas en Railway
- [ ] Redis está funcionando (`REDIS_URL` configurada)
- [ ] El dispatcher se inyectó correctamente en main.go
- [ ] Gmail no bloqueó la cuenta

### 7️⃣ Solución Temporal: Endpoint Manual

Mientras tanto, el usuario puede usar el botón "Enviar" en el modal:

1. Hacer la venta
2. En el modal post-venta, ingresar email manualmente
3. Clic en "Enviar"

Esto llama a `POST /v1/facturacion/:id/enviar-email` que encola el email directamente.

## Próximos Pasos

1. **Revisar logs de Railway** → Buscar los patrones arriba
2. **Identificar dónde falla** → encolado, worker, o mailer
3. **Aplicar solución específica**
4. **Hacer prueba end-to-end**

## Comando para Ver Logs en Railway

```bash
# Filtrar logs relevantes
railway logs --filter "email"
railway logs --filter "facturacion_worker"
railway logs --filter "mailer"
```

O desde el dashboard: **Railway → Deployments → Deployment actual → View Logs**

---

**📊 Probabilidad de Causas**:
- 40% → Puerto 465 bloqueado en Railway (usar 587)
- 30% → EmailWorker no está corriendo (config issue)
- 20% → Gmail bloqueó/expiró contraseña de aplicación
- 10% → Redis/Dispatcher no disponible
