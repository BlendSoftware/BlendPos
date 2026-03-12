# 📧 Configurar SendGrid para BlendPOS en Railway

## ⚠️ Problema

Railway **bloquea conexiones SMTP directas** a Gmail (tanto puerto 465 como 587).

Error actual:
```
email_worker: failed to send email 
error="mailer: dial: connect: connection timed out"
```

## ✅ Solución: SendGrid (5 minutos)

SendGrid funciona porque **Railway no bloquea smtp.sendgrid.net**.

Tu código SMTP actual **NO necesita cambios**, solo cambiamos las variables de entorno.

---

## 📋 Paso 1: Crear Cuenta SendGrid

1. **Ve a**: https://signup.sendgrid.com/
2. **Completa el formulario**:
   - Email: blendsoftware1@gmail.com (o el que uses)
   - Password: (crea una contraseña)
   - ✅ Acepta términos

3. **Verifica tu email** (revisa bandeja de entrada)

4. **Completa el onboarding**:
   - Selecciona: "I'm a Developer"
   - Language: Node.js (o cualquiera, no importa)
   - Skip la integración

---

## 🔑 Paso 2: Generar API Key

1. **En el dashboard de SendGrid**, ve a:
   ```
   Settings → API Keys
   ```

2. **Clic en "Create API Key"**

3. **Nombre la key**: `BlendPOS-Production`

4. **Permisos**: 
   - Selecciona: **"Full Access"**
   - O al menos: **"Mail Send"** → "Full Access"

5. **Clic en "Create & View"**

6. **COPIA LA KEY** (solo se muestra una vez):
   ```
   SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   
   ⚠️ **MUY IMPORTANTE**: Guárdala en un lugar seguro, no se vuelve a mostrar.

---

## ✉️ Paso 3: Verificar Sender (Remitente)

SendGrid requiere verificar el email desde el que enviarás.

1. **Ve a**: Settings → Sender Authentication

2. **Opción A: Single Sender Verification** (Rápido, recomendado)
   - Clic en "Get Started"
   - From Email: `blendsoftware1@gmail.com`
   - From Name: `BlendPOS`
   - Reply To: `blendsoftware1@gmail.com`
   - Company Address: (completa con datos reales o de prueba)
   - Clic en "Create"
   - **Verifica el email** que te llega a blendsoftware1@gmail.com

3. **Opción B: Domain Authentication** (Avanzado, opcional)
   - Solo si tienes un dominio propio
   - Requiere configurar DNS records

**Importante**: Usa la Opción A para empezar rápido.

---

## 🔧 Paso 4: Actualizar Variables en Railway

1. **Ve a Railway Dashboard**:
   ```
   https://railway.app/dashboard
   ```

2. **Abre tu proyecto BlendPOS**

3. **Selecciona el servicio "backend"**

4. **Ve a la pestaña "Variables"**

5. **Actualiza estas 4 variables**:

   ```bash
   # Antes (Gmail - NO funciona en Railway):
   SMTP_HOST = smtp.gmail.com
   SMTP_PORT = 465
   SMTP_USER = blendsoftware1@gmail.com
   SMTP_PASSWORD = ydal zbqq qbhh rkjc
   
   # Ahora (SendGrid - SÍ funciona):
   SMTP_HOST = smtp.sendgrid.net
   SMTP_PORT = 587
   SMTP_USER = apikey
   SMTP_PASSWORD = SG.xxxxxxxxxxxxxxxxxxxxxxxxxx  ← Tu API Key de SendGrid
   ```

   **Importante**:
   - `SMTP_USER` debe ser **literalmente** la palabra `apikey`
   - `SMTP_PASSWORD` es tu API Key completa (comienza con `SG.`)

6. **NO cambies estas variables** (déjalas como están):
   ```bash
   SMTP_FROM = BlendPOS <blendsoftware1@gmail.com>
   EMAIL_WORKERS = 2
   ```

7. **Guarda los cambios**

---

## 🚀 Paso 5: Redesplegar

1. Railway hará **redeploy automático** al cambiar las variables
2. Espera ~2 minutos hasta que termine
3. Verás el estado: ✅ **Active**

---

## 🧪 Paso 6: Probar

1. **Haz una venta en tu app** con un email de prueba
2. **Verifica los logs** en Railway:
   ```
   Railway Dashboard → Deployments → View Logs
   ```
   
3. **Busca estos mensajes**:
   ```
   ✅ "facturacion_worker: email job enqueued"
   ✅ "email_worker: comprobante sent successfully"
   ```

4. **Revisa tu email** (puede tardar ~30 segundos)
   - Revisa también la carpeta de **spam** la primera vez

---

## ✅ Verificar Configuración

Después del redeploy, verifica el health check:

```bash
# Desde tu navegador:
https://tu-url-railway.app/health

# Deberías ver:
{
  "smtp": true,
  "smtp_host": "smtp.sendgrid.net",
  "smtp_port": 587
}
```

---

## 📊 Monitorear Emails en SendGrid

1. **Ve a**: Activity → Email Activity

2. **Aquí verás**:
   - 📧 Emails enviados
   - ✅ Delivered (entregados)
   - 📬 Opened (abiertos)
   - ⚠️ Bounce (rebotados)
   - 🚫 Spam (marcados como spam)

Es útil para debug y saber si los emails llegaron.

---

## 🎁 Plan Gratuito de SendGrid

- ✅ **100 emails por día** (gratis forever)
- ✅ Sin tarjeta de crédito requerida
- ✅ Suficiente para la mayoría de negocios pequeños

Si necesitas más:
- **Essentials Plan**: $19.95/mes → 50,000 emails/mes
- **Pro Plan**: $89.95/mes → 100,000 emails/mes

---

## 🔐 Seguridad

**Nunca compartas tu API Key de SendGrid**:
- ❌ No la subas a GitHub
- ❌ No la pongas en el código
- ✅ Solo en variables de entorno de Railway

Si la expones accidentalmente:
1. Ve a SendGrid → API Keys
2. Elimina la key comprometida
3. Genera una nueva
4. Actualiza Railway

---

## 🆘 Troubleshooting

### Error: "API key does not have sufficient permissions"

**Solución**: Regenera la API Key con permisos "Full Access" en Mail Send.

### Error: "Sender unverified"

**Solución**: 
1. Ve a Settings → Sender Authentication
2. Clic en el email de verificación que te enviaron
3. Espera 5 minutos y prueba de nuevo

### Los emails van a spam

**Solución**:
1. Primera vez es normal, márcalo como "No es spam"
2. Considera configurar Domain Authentication (SPF/DKIM)

### Error: "Connection refused"

**Solución**: Verifica que `SMTP_PORT = 587` (no 465, no 25)

---

## 📝 Resumen

| Variable | Valor Correcto |
|----------|---------------|
| SMTP_HOST | smtp.sendgrid.net |
| SMTP_PORT | 587 |
| SMTP_USER | apikey |
| SMTP_PASSWORD | SG.xxxx... (tu API Key) |
| SMTP_FROM | BlendPOS <blendsoftware1@gmail.com> |

**Tu código NO necesita cambios** - ya funciona con SendGrid.

---

## ⏱️ Tiempo Total

- ⏰ Crear cuenta: 2 minutos
- 🔑 Generar API Key: 1 minuto
- ✉️ Verificar sender: 2 minutos (revisar email)
- 🔧 Actualizar Railway: 1 minuto
- 🚀 Deploy automático: 2 minutos

**Total: ~8 minutos**

---

## ✅ Checklist Final

- [ ] Cuenta SendGrid creada
- [ ] Email verificado en SendGrid
- [ ] API Key generada y guardada
- [ ] Sender verificado (email de verificación confirmado)
- [ ] Variables actualizadas en Railway
- [ ] Redeploy completado
- [ ] Health check muestra `smtp.sendgrid.net`
- [ ] Venta de prueba con email enviada
- [ ] Email recibido (revisar spam si no llega)

---

## 🎉 Resultado Final

Después de esto:
✅ Los emails se enviarán correctamente  
✅ Sin timeouts  
✅ Sin bloqueos de Railway  
✅ Dashboard para monitorear entregas  
✅ Mejor deliverability que Gmail

---

## 💡 Alternativas

Si SendGrid no te gusta, estas también funcionan en Railway:

1. **Resend** (https://resend.com) - Más moderno, misma config SMTP
2. **Mailgun** (https://mailgun.com) - Más técnico
3. **Postmark** (https://postmarkapp.com) - Premium, excelente deliverability

Todos usan SMTP estándar, tu código funciona sin cambios.

Prueba para ver si lo pusheo yo se rompe