# ✉️ Cómo Probar el Envío de Emails en BlendPOS

## Flujo Completo

1. **Abrir el POS**
   - Navega a la pantalla de ventas
   - Agrega productos al carrito

2. **Ir a Pagar**
   - Haz clic en "Pagar" o presiona F2
   - Se abrirá el modal de pago

3. **Ingresar Email del Cliente**
   - En el campo "Email del cliente (opcional)"
   - Ingresa un email válido (ej: tu propio email para probar)
   - El campo tiene validación automática

4. **Confirmar Venta**
   - Selecciona método de pago
   - Haz clic en "Confirmar Pago"

5. **Verificar el Email**
   - Revisa la bandeja de entrada del email ingresado
   - Debería llegar un email con asunto "Comprobante BlendPOS — Ticket #XXX"
   - El PDF de la factura viene adjunto

## 🔍 Verificar si el Sistema Funciona

### 1. Verificar que el Worker de Email Esté Activo

Busca en los logs del backend líneas como:
```
[INFO] worker_pool: starting 2 email workers
[INFO] email_worker: comprobante sent successfully to=cliente@ejemplo.com
```

### 2. Verificar que el Email se Encole Correctamente

Busca:
```
[INFO] facturacion_worker: email job enqueued email=cliente@ejemplo.com
```

### 3. Si No Llega el Email, Verifica:

**a) Redis está corriendo:**
```powershell
# Si usas Docker local
docker ps | findstr redis
```

**b) Las credenciales SMTP son correctas:**
```powershell
# Verifica que las variables estén seteadas
echo $env:SMTP_HOST
echo $env:SMTP_USER
# NO imprimas SMTP_PASSWORD por seguridad
```

**c) Gmail no bloqueó el envío:**
- Revisa https://myaccount.google.com/security
- Verifica que la contraseña de aplicación esté activa
- Revisa si hay alertas de seguridad

### 4. Verificar Errores en los Logs

Busca líneas con `[ERROR]` o `[WARN]` relacionadas con:
```
email_worker: failed to send email
mailer: SMTP not configured
mailer: attach PDF
```

## 🐛 Solución de Problemas Comunes

### Error: "mailer: SMTP not configured"
**Causa:** Variables SMTP no están configuradas
**Solución:** Verifica que `SMTP_HOST`, `SMTP_USER` y `SMTP_PASSWORD` estén seteadas

### Error: "535 Authentication failed"
**Causa:** Contraseña incorrecta o contraseña de aplicación inválida
**Solución:** 
1. Ve a https://myaccount.google.com/apppasswords
2. Genera una nueva contraseña de aplicación
3. Actualiza `SMTP_PASSWORD` con la nueva

### Error: "connection timeout"
**Causa:** Puerto bloqueado o host incorrecto
**Solución:**
- Verifica que el puerto 465 no esté bloqueado por firewall
- Si falla, prueba con puerto 587: `SMTP_PORT=587`

### El email no llega pero no hay errores
**Causa:** Puede estar en spam o demorado
**Solución:**
1. Revisa la carpeta de spam
2. Verifica que el email del cliente sea válido
3. Espera unos minutos (puede haber demora)

## 📊 Monitoring en Producción

Para Railway/producción, verifica los logs:
```bash
# En Railway CLI
railway logs --service backend

# Busca líneas de email
railway logs --service backend | grep -i email
```

## ✅ Checklist Rápido

- [ ] Variables SMTP configuradas
- [ ] EMAIL_WORKERS > 0 (recomendado: 2)
- [ ] Redis corriendo y accesible
- [ ] Contraseña de aplicación de Gmail válida
- [ ] Backend levantado sin errores
- [ ] Campo de email visible en el modal de pago
- [ ] Email ingresado es válido
- [ ] PDF se genera correctamente (verificar en logs)
- [ ] Sin errores en logs del email_worker
- [ ] Email llegó a la bandeja (o spam)
