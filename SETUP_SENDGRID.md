# 📧 Configuración SendGrid para BlendPOS

## Problema Actual

Railway **bloquea conexiones SMTP salientes** a Gmail (puertos 465 y 587).

```
error="mailer: dial: dial tcp 172.217.78.109:587: connect: connection timed out"
```

## ✅ Solución: SendGrid

SendGrid funciona perfectamente en Railway y es **gratis** (100 emails/día).

---

## 🚀 Setup en 5 Minutos

### Paso 1: Crear Cuenta SendGrid

1. Ve a: https://signup.sendgrid.com/
2. Usa el email de tu empresa: `blendsoftware1@gmail.com`
3. Completa el registro (gratis, sin tarjeta)

### Paso 2: Verificar Sender

1. En SendGrid Dashboard → **Settings** → **Sender Authentication**
2. Clic en **Verify a Single Sender**
3. Completa el formulario:
   - **From Name**: `BlendPOS`
   - **From Email**: `blendsoftware1@gmail.com`
   - **Reply To**: `blendsoftware1@gmail.com`
   - **Company**: `Blend Software`
   - **Address**: Tu dirección
4. Clic en **Create**
5. **Revisa tu email** (blendsoftware1@gmail.com)
6. Haz clic en el link de verificación

### Paso 3: Crear API Key

1. En SendGrid Dashboard → **Settings** → **API Keys**
2. Clic en **Create API Key**
3. Nombre: `BlendPOS Production`
4. Permisos: **Full Access** (o solo Mail Send)
5. Clic en **Create & View**
6. **COPIA LA API KEY** (solo se muestra una vez)
   - Ejemplo: `SG.Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0...`

### Paso 4: Configurar Railway

Ve a Railway → Tu Proyecto → **Variables** y actualiza:

```bash
# Cambiar estas 4 variables:
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG.tu_api_key_completa_aqui
```

**⚠️ IMPORTANTE**: 
- `SMTP_USER` debe ser exactamente `apikey` (literal, no cambiar)
- `SMTP_PASSWORD` es tu API Key completa de SendGrid

### Paso 5: Guardar y Esperar Deploy

1. Haz clic en **Save** en Railway
2. Espera ~2 minutos (redeploy automático)
3. ✅ Listo

---

## 🧪 Probar

### Test 1: Health Check

```bash
curl https://tu-url-railway.app/health
```

Debería mostrar:
```json
{
  "smtp": true,
  "smtp_host": "smtp.sendgrid.net",
  "smtp_port": 587
}
```

### Test 2: Enviar Email Real

1. Abre tu app BlendPOS
2. Haz una venta con tu email: `juanisarmientoomartinez@gmail.com`
3. Espera 10 segundos
4. **Revisa tu email** (y carpeta spam)

### Test 3: Ver Logs Railway

Railway → Deployments → View Logs

Busca:
```
✅ "email_worker: comprobante sent successfully"
```

Si hay error:
```
❌ "mailer: auth: 535"  → API Key incorrecta
❌ "mailer: auth: 550"  → Sender no verificado
```

---

## 📊 Ventajas de SendGrid

| Feature | Gmail SMTP | SendGrid |
|---------|------------|----------|
| Funciona en Railway | ❌ Bloqueado | ✅ Si |
| Límite diario | 500 | 100 (gratis) / ilimitado (pago) |
| Deliverability | Media | ⭐ Excelente |
| Dashboard | ❌ No | ✅ Si (ver emails enviados) |
| Soporte | ❌ No | ✅ Si |
| Costo | Gratis | Gratis (100/día) |

---

## 📈 Plan Gratuito SendGrid

**100 emails/día gratis para siempre**

- Suficiente para ~95% de negocios pequeños
- Si necesitas más: $19.95/mes por 50,000 emails

---

## 🔐 Seguridad

### Mantener API Key Segura

- ✅ Solo en Railway variables (nunca en código)
- ✅ No compartir en screenshots
- ✅ Si se filtra, regenerar en SendGrid

### Regenerar API Key

1. SendGrid → Settings → API Keys
2. Encuentra tu key → Delete
3. Create API Key nueva
4. Actualizar en Railway

---

## 🆘 Troubleshooting

### Error: "Invalid API Key"

```
mailer: auth: 535 Authentication failed
```

**Solución**:
- Verifica que `SMTP_USER=apikey` (literal)
- Verifica que copiaste la API Key completa (empieza con `SG.`)
- Regenera la API Key si es necesario

### Error: "Sender not verified"

```
mailer: 550 The from address does not match a verified Sender Identity
```

**Solución**:
- Ve a SendGrid → Sender Authentication
- Verifica que el email esté con ✅ verde
- Revisa tu email y confirma verificación

### Email no llega

**Checklist**:
- [ ] Sender verificado en SendGrid (✅ verde)
- [ ] API Key correcta en Railway `SMTP_PASSWORD`
- [ ] `SMTP_USER=apikey` (literal)
- [ ] Logs muestran `"comprobante sent successfully"`
- [ ] Revisar carpeta spam
- [ ] Revisar SendGrid Dashboard → Activity

---

## 📱 Dashboard SendGrid

Después de configurar, puedes ver:
- Emails enviados
- Tasa de apertura
- Bounces
- Spam reports

**URL**: https://app.sendgrid.com/email_activity

---

## ✅ Checklist de Setup

- [ ] Cuenta SendGrid creada
- [ ] Sender verificado (blendsoftware1@gmail.com)
- [ ] API Key generada
- [ ] `SMTP_HOST=smtp.sendgrid.net` en Railway
- [ ] `SMTP_PORT=587` en Railway
- [ ] `SMTP_USER=apikey` en Railway
- [ ] `SMTP_PASSWORD=SG.xxx...` en Railway
- [ ] Deploy completado
- [ ] Test de email exitoso

---

## 🎯 Resultado Final

Una vez configurado:
- ✅ Emails llegan en segundos
- ✅ No más timeouts
- ✅ Dashboard para monitorear
- ✅ Mejor deliverability que Gmail
- ✅ 100% funcional en Railway

---

## 💡 Alternativas

Si por alguna razón no quieres usar SendGrid:

### Resend (Similar, más moderno)
```bash
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=re_tu_api_key
```
Límite: 100 emails/día gratis

### Mailgun (Más features)
```bash
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@tu-dominio.mailgun.org
SMTP_PASSWORD=tu_password
```
Límite: 100 emails/día gratis (primeros 3 meses)

---

## 🚀 ¡Empezá Ya!

1. Abrí: https://signup.sendgrid.com/
2. Creá tu cuenta
3. Seguí los 5 pasos arriba
4. En 5 minutos estás enviando emails 📧

**El código de BlendPOS ya está listo, solo necesita las nuevas credenciales en Railway.**
