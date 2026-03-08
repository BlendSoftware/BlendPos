# 🚀 INSTRUCCIONES PARA RAILWAY - Fix Certificados AFIP

## ✅ Cambios implementados

1. ✅ Carpeta `certs/` ahora existe en el repo (vacía, con `.gitkeep`)
2. ✅ Dockerfile modificado para no fallar si `certs/` está vacía
3. ✅ Script `entrypoint.sh` que carga certificados desde variables de entorno
4. ✅ `.gitignore` actualizado para permitir `.gitkeep` pero bloquear certificados reales

---

## 📋 Pasos a seguir

### 1️⃣ Hacer commit y push de los cambios

```powershell
cd C:\Users\juani\Desktop\BlendPos

git add afip-sidecar/certs/.gitkeep
git add afip-sidecar/certs/README.md
git add afip-sidecar/.gitignore
git add afip-sidecar/Dockerfile
git add afip-sidecar/entrypoint.sh
git add afip-sidecar/INSTRUCCIONES_RAILWAY.md

git commit -m "fix: configurar certificados AFIP desde env vars para Railway"
git push origin main
```

### 2️⃣ Convertir certificados a Base64

Desde PowerShell, en la carpeta `afip-sidecar/certs/`:

```powershell
cd C:\Users\juani\Desktop\BlendPos\afip-sidecar\certs

# Convertir afip.crt
[Convert]::ToBase64String([IO.File]::ReadAllBytes("afip.crt")) > cert_base64.txt

# Convertir afip.key
[Convert]::ToBase64String([IO.File]::ReadAllBytes("afip.key")) > key_base64.txt
```

Ahora tienes dos archivos:
- `cert_base64.txt` → contenido base64 de tu certificado
- `key_base64.txt` → contenido base64 de tu clave privada

### 3️⃣ Agregar variables en Railway

**Servicio: afip-sidecar**

Ve a Railway → Tu Proyecto → Servicio **afip-sidecar** → **Variables** → **+ New Variable**

Agrega estas 2 variables nuevas:

```
Variable: AFIP_CERT_B64
Valor: [pega todo el contenido de cert_base64.txt sin saltos de línea]
Tipo: Secret ✅
```

```
Variable: AFIP_KEY_B64
Valor: [pega todo el contenido de key_base64.txt sin saltos de línea]
Tipo: Secret ✅
```

### 4️⃣ Variables completas del Afip Sidecar (verificar)

Tu servicio **afip-sidecar** debe tener:

```bash
AFIP_CUIT_EMISOR=20XXXXXXXXXX
AFIP_HOMOLOGACION=false
AFIP_CERT_B64=<base64_del_certificado>      # ← NUEVO
AFIP_KEY_B64=<base64_de_la_clave>             # ← NUEVO
INTERNAL_API_TOKEN=<token_compartido>
REDIS_URL=${{Redis.REDIS_URL}}
```

### 5️⃣ Reiniciar el servicio

Después de agregar las variables, Railway reiniciará automáticamente. Monitorea los logs:

**Logs esperados (éxito):**

```
🔐 AFIP Sidecar - Inicializando certificados...
✅ Escribiendo afip.crt desde AFIP_CERT_B64...
✅ Escribiendo afip.key desde AFIP_KEY_B64...
✅ Certificados AFIP listos en /certs/
-rw-r--r-- 1 root root 1234 Mar  8 20:00 /certs/afip.crt
-rw-r--r-- 1 root root 5678 Mar  8 20:00 /certs/afip.key
🧹 Limpiando caché stale de pyafipws...
🚀 Iniciando AFIP Sidecar en puerto 8001...
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8001 (Press CTRL+C to quit)
```

**Logs de error (falta variable):**

```
❌ ERROR: /certs/afip.crt no existe y AFIP_CERT_B64 no está definida.
   Por favor configura AFIP_CERT_B64 o monta /certs con los certificados.
```

### 6️⃣ Verificar conectividad desde el Backend

En los logs del **backend**, deberías ver:

**ANTES (error):**
```
ERR facturacion_worker.go:270 > AFIP call failed 
error="Post \"http://localhost:8001/facturar\": dial tcp [::1]:8001: connect: connection refused"
```

**DESPUÉS (éxito):**
```
INF facturacion_worker.go:XXX > AFIP factura emitida successfully
CAE=XXXXXXXXXXXX venta_id=...
```

### 7️⃣ Probar facturación

1. Abre tu app BlendPOS en producción
2. Crea una venta de prueba
3. Selecciona **Factura B** o **Factura C**
4. Completa la venta
5. Verifica:
   - Estado: **Emitido** ✅
   - CAE: número de 14 dígitos
   - Botón "Descargar Factura Fiscal PDF" funciona

---

## 🔍 Troubleshooting

### Error: `base64: invalid input`

**Causa:** El contenido tiene saltos de línea o espacios.

**Solución:** Asegúrate de pegar TODO el contenido de `cert_base64.txt` en una sola línea, sin espacios ni enters.

En PowerShell, puedes hacer:

```powershell
# Generar base64 en una sola línea
[Convert]::ToBase64String([IO.File]::ReadAllBytes("afip.crt")) -replace "`r`n|`n", ""
```

### Error: `Permission denied` en `/certs/`

**Causa:** El contenedor intenta escribir pero no tiene permisos.

**Solución:** El `entrypoint.sh` ya hace `chmod 644`. Verifica que el usuario del contenedor sea root o afipsidecar.

---

## 📞 Soporte

Si después de seguir todos estos pasos el error persiste:

1. Copia los logs completos del **afip-sidecar** (últimas 50 líneas)
2. Copia los logs del **backend** relacionados con facturación
3. Verifica que `INTERNAL_API_TOKEN` sea idéntico en ambos servicios
4. Verifica que `AFIP_SIDECAR_URL` en el backend apunte a la URL privada correcta

---

✅ **Una vez que esto funcione, las facturas se emitirán con CAE en producción.**
