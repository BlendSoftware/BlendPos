# 🤖 PROMPT PARA AGENTE CON ACCESO A PANTALLA

Copia y pega este prompt completo en tu agente con acceso a pantalla (ej: Claude Desktop, Anthropic Workbench, etc.).

---

## 🎯 OBJETIVO PRINCIPAL

Configurar el servicio **afip-sidecar** en Railway para que el backend de BlendPOS pueda emitir facturas fiscales con CAE. El sidecar actualmente falla porque no tiene los certificados AFIP necesarios. Debes:

1. Hacer commit/push de los cambios ya preparados
2. Generar certificados en formato base64
3. Configurar variables de entorno en Railway
4. Verificar logs y probar emisión de facturas

---

## ⚠️ IMPORTANTE: SEGURIDAD

- **NUNCA** muestres el contenido de `INTERNAL_API_TOKEN`, `AFIP_CERT_B64` o `AFIP_KEY_B64` en pantalla, logs o chat público
- Marca todas las variables sensibles como **"Secret"** en Railway
- Los archivos `*_base64.txt` son temporales - deben eliminarse después de configurar Railway

---

## 📋 PASOS A EJECUTAR (EN ORDEN)

### PASO 1: Verificar ubicación y archivos

```powershell
# Verificar que estamos en el directorio correcto
cd C:\Users\juani\Desktop\BlendPos
Get-Location

# Verificar archivos creados (deben existir)
Test-Path afip-sidecar\certs\.gitkeep
Test-Path afip-sidecar\entrypoint.sh
Test-Path afip-sidecar\INSTRUCCIONES_RAILWAY.md
Test-Path afip-sidecar\certs\generar_base64.ps1
```

**Resultado esperado:** Todos deben retornar `True`

---

### PASO 2: Agregar archivos al repositorio Git

```powershell
# Agregar archivos nuevos y modificados
git add afip-sidecar/certs/.gitkeep
git add afip-sidecar/certs/README.md
git add afip-sidecar/certs/generar_base64.ps1
git add afip-sidecar/.gitignore
git add afip-sidecar/Dockerfile
git add afip-sidecar/entrypoint.sh
git add afip-sidecar/INSTRUCCIONES_RAILWAY.md

# Ver estado
git status
```

**Resultado esperado:** Debe mostrar los 7 archivos listos para commit (Changes to be committed).

---

### PASO 3: Hacer commit y push

```powershell
git commit -m "fix(afip): configurar certificados desde env vars para Railway"
git push origin main
```

**Resultado esperado:** 
- Commit exitoso con mensaje "7 files changed"
- Push exitoso a GitHub
- Railway detectará el push y comenzará a re-desplegar el servicio afip-sidecar

**⏳ ESPERAR:** Railway tardará ~2-5 minutos en hacer el rebuild. Monitorea los logs del servicio **afip-sidecar** en Railway.

**Logs esperados durante el build:**
```
Building Dockerfile...
Step 9/15 : RUN mkdir -p /certs
Successfully built...
Deploying...
```

**Logs esperados al arrancar (FALLARÁ porque aún faltan las variables):**
```
🔐 AFIP Sidecar - Inicializando certificados...
⚠️  AFIP_CERT_B64 no está definida. Verificando si /certs/afip.crt existe...
❌ ERROR: /certs/afip.crt no existe y AFIP_CERT_B64 no está definida.
```

**Esto es NORMAL y esperado.** Continúa con el siguiente paso.

---

### PASO 4: Generar certificados en Base64

```powershell
# Ir a la carpeta de certificados
cd C:\Users\juani\Desktop\BlendPos\afip-sidecar\certs

# Ejecutar script de generación
.\generar_base64.ps1
```

**El script hará:**
1. Verificar que `afip.crt` y `afip.key` existen
2. Convertir ambos archivos a base64
3. Guardar en `cert_base64.txt` y `key_base64.txt`
4. Ofrecer copiar al portapapeles

**Interacción con el script:**
- Cuando pregunte "¿Quieres copiar AFIP_CERT_B64 al portapapeles ahora?", responde: `s`
- El certificado se copiará al portapapeles
- **INMEDIATAMENTE** ve al navegador y pégalo en Railway (siguiente paso)

---

### PASO 5: Configurar variables en Railway - Servicio afip-sidecar

**Abrir Railway en el navegador:**
1. Ve a [railway.app](https://railway.app)
2. Abre tu proyecto (BlendPOS)
3. Clic en el servicio **afip-sidecar**
4. Clic en la pestaña **"Variables"**

**Agregar Variable 1: AFIP_CERT_B64**
1. Clic en **"+ New Variable"**
2. En "Variable name" escribe: `AFIP_CERT_B64`
3. En "Value" pega el contenido del portapapeles (debe ser una cadena larga de caracteres alfanuméricos)
4. ✅ Marca la casilla **"Secret"**
5. Clic en **"Add"**

**Agregar Variable 2: AFIP_KEY_B64**
1. Vuelve a PowerShell
2. El script preguntará "¿Copiar AFIP_KEY_B64 al portapapeles ahora?", responde: `s`
3. Vuelve a Railway
4. Clic en **"+ New Variable"**
5. En "Variable name" escribe: `AFIP_KEY_B64`
6. En "Value" pega el contenido del portapapeles
7. ✅ Marca la casilla **"Secret"**
8. Clic en **"Add"**

**⚠️ VERIFICAR VARIABLES COMPLETAS DEL AFIP-SIDECAR:**

El servicio **afip-sidecar** debe tener estas 6 variables:
```
✅ AFIP_CUIT_EMISOR        (ya existía)
✅ AFIP_HOMOLOGACION       (ya existía)
✅ AFIP_CERT_B64           (recién agregada) 🔒 Secret
✅ AFIP_KEY_B64            (recién agregada) 🔒 Secret
✅ INTERNAL_API_TOKEN      (ya existía) 🔒 Secret
✅ REDIS_URL               (ya existía)
```

---

### PASO 6: Esperar redeploy y verificar logs del Afip Sidecar

**Railway reiniciará automáticamente el servicio** al agregar las variables.

**En Railway:**
1. Ve al servicio **afip-sidecar**
2. Clic en la pestaña **"Deployments"**
3. Clic en el deployment más reciente (estado "Building" o "Deploying")
4. Clic en **"View Logs"**

**Logs esperados (ÉXITO):**
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
INFO:     Uvicorn running on http://0.0.0.0:8001
```

**Si ves estos logs, el afip-sidecar está funcionando correctamente. ✅**

**Logs de ERROR (si algo falló):**
```
❌ ERROR: /certs/afip.crt no existe y AFIP_CERT_B64 no está definida.
```
→ Significa que la variable no se configuró o tiene formato incorrecto.

**Si hay error:**
1. Verifica que las variables `AFIP_CERT_B64` y `AFIP_KEY_B64` existen
2. Verifica que no tengan espacios, saltos de línea o caracteres especiales
3. Re-genera los base64 con el script y reemplaza las variables

---

### PASO 7: Verificar logs del Backend (conexión al sidecar)

**En Railway:**
1. Ve al servicio **blendpos-production.up.railway.app** (o el nombre que tenga tu backend)
2. Clic en **"Deployments"** → deployment más reciente → **"View Logs"**
3. Busca líneas relacionadas con AFIP

**Logs ANTES (ERROR - ya no debería aparecer):**
```
ERR facturacion_worker.go:270 > AFIP call failed 
error="Post \"http://localhost:8001/facturar\": dial tcp [::1]:8001: connect: connection refused"
```

**Logs DESPUÉS (ÉXITO - debería aparecer cuando se intente facturar):**
```
INF facturacion_worker.go:XXX > processing job queue=jobs:facturacion type=facturacion
INF facturacion_worker.go:XXX > AFIP sidecar response received
INF facturacion_worker.go:XXX > PDF generated pdf=/tmp/blendpos/pdfs/factura_123.pdf tipo=factura_c
```

**Si aún ves `connection refused`:**
- Verifica que el servicio afip-sidecar esté "Running" (verde) en Railway
- Verifica que la variable `AFIP_SIDECAR_URL` en el backend apunte a la URL privada correcta
- Debe ser algo como: `http://afip-sidecar.railway.internal:8001`

---

### PASO 8: Probar emisión de factura desde la UI

**Abrir la aplicación BlendPOS en producción:**
1. Abre tu dominio de BlendPOS en el navegador (ej: `https://tudominio.com`)
2. Inicia sesión
3. Ve al módulo **POS** (punto de venta)

**Crear una venta de prueba:**
1. Agrega un producto al carrito
2. Clic en **"Cobrar"**
3. En el modal de pago, selecciona **"Factura B"** o **"Factura C"** (según tu configuración fiscal)
4. Completa el pago
5. Clic en **"Confirmar Venta"**

**Verificar resultado:**
1. Debe aparecer el modal **"Venta Exitosa"**
2. Espera 2-3 segundos (mientras se procesa AFIP)
3. Debe mostrar:
   - Estado: **"Emitido"** ✅
   - **CAE:** `XXXXXXXXXXXX` (número de 14 dígitos)
   - Fecha de vencimiento del CAE
   - Botón **"Descargar Factura Fiscal PDF"**

**Descargar y verificar el PDF:**
1. Clic en **"Descargar Factura Fiscal PDF"**
2. Abre el archivo PDF descargado
3. Verifica que contenga:
   - Encabezado con datos del emisor (CUIT, razón social)
   - Tipo de factura (A, B o C) en un recuadro grande
   - Número de comprobante
   - Datos del receptor (si es Factura A/B)
   - Tabla de items con precios e IVA
   - Totales desglosados
   - **Código de barras** con el CAE
   - Texto del CAE y fecha de vencimiento

**Si todo esto aparece correctamente, ¡el sistema está funcionando al 100%! 🎉**

---

### PASO 9: Limpieza y seguridad

**Eliminar archivos temporales:**
```powershell
cd C:\Users\juani\Desktop\BlendPos\afip-sidecar\certs

# Eliminar archivos de base64 (ya no son necesarios)
Remove-Item cert_base64.txt -ErrorAction SilentlyContinue
Remove-Item key_base64.txt -ErrorAction SilentlyContinue

# Verificar que se eliminaron
Get-ChildItem *_base64.txt
```

**Resultado esperado:** "Cannot find path" (archivos eliminados correctamente)

**Verificar que los certificados reales están en .gitignore:**
```powershell
git status
```

**Resultado esperado:** NO deben aparecer `afip.crt`, `afip.key` ni `*_base64.txt` en la lista de cambios.

---

## 🔍 TROUBLESHOOTING

### Error: "base64: invalid input" en logs del sidecar

**Causa:** El contenido de `AFIP_CERT_B64` o `AFIP_KEY_B64` tiene formato incorrecto.

**Solución:**
1. Re-ejecuta el script `generar_base64.ps1`
2. Copia el contenido completo SIN espacios ni saltos de línea
3. Reemplaza las variables en Railway
4. Reinicia el servicio

### Error: "Permission denied" en /certs/

**Causa:** Permisos del contenedor.

**Solución:** El `entrypoint.sh` maneja los permisos automáticamente. Si persiste:
1. Verifica logs completos del sidecar
2. Busca líneas con "chmod" o "Permission"
3. Reporta el error completo

### Error: "INTERNAL_API_TOKEN mismatch" en logs

**Causa:** El token no coincide entre backend y sidecar.

**Solución:**
1. Ve a Railway → servicio **afip-sidecar** → Variables
2. Copia el valor de `INTERNAL_API_TOKEN` (no lo muestres en pantalla)
3. Ve a Railway → servicio **backend** → Variables
4. Verifica que `INTERNAL_API_TOKEN` tenga el **mismo** valor exacto
5. Si no coinciden, corrígelo y reinicia ambos servicios

### El PDF se genera pero sin CAE (estado "pendiente" o "error")

**Causa:** El sidecar está funcionando pero AFIP rechaza la solicitud.

**Solución:**
1. Verifica logs del **afip-sidecar** para ver el error de AFIP
2. Errores comunes:
   - **"CUIT no autorizado"** → revisar certificado y CUIT en variable
   - **"Punto de venta no autorizado"** → revisar configuración fiscal en DB
   - **"Error de fecha"** → revisar reloj del servidor (debe estar en hora exacta)
   - **"Certificado vencido"** → renovar certificado AFIP

---

## ✅ CHECKLIST FINAL

Marca cada item cuando lo completes:

- [ ] ✅ Archivos commiteados y pusheados a GitHub
- [ ] ✅ Railway rebuild exitoso (sin errores de build)
- [ ] ✅ Variables `AFIP_CERT_B64` y `AFIP_KEY_B64` agregadas en Railway (marcadas como Secret)
- [ ] ✅ Logs del afip-sidecar muestran "Certificados AFIP listos en /certs/"
- [ ] ✅ Logs del afip-sidecar muestran "Uvicorn running on http://0.0.0.0:8001"
- [ ] ✅ Logs del backend NO muestran "connection refused" a puerto 8001
- [ ] ✅ Factura de prueba emitida con estado "Emitido"
- [ ] ✅ CAE generado (14 dígitos)
- [ ] ✅ PDF descargado y verificado (con código de barras CAE)
- [ ] ✅ Archivos temporales `*_base64.txt` eliminados
- [ ] ✅ Git status limpio (sin certificados reales en staging)

---

## 🎯 RESUMEN EJECUTIVO PARA REPORTAR

Cuando todo esté funcionando, genera este reporte:

```
✅ AFIP Sidecar configurado exitosamente en Railway

Cambios implementados:
- Dockerfile modificado para cargar certificados desde env vars
- Script entrypoint.sh para escribir certificados en /certs/ al arranque
- Variables AFIP_CERT_B64 y AFIP_KEY_B64 configuradas como secretos

Validaciones completadas:
✅ Servicio afip-sidecar running (puerto 8001)
✅ Certificados cargados correctamente desde env vars
✅ Backend conectado al sidecar (sin connection refused)
✅ Factura de prueba emitida con CAE: [número de CAE]
✅ PDF descargado con código de barras y datos fiscales completos

Estado final: Sistema BlendPOS 100% operativo para facturación AFIP en producción

Fecha: [fecha actual]
Comprobante de prueba ID: [ID del comprobante]
```

---

## 🚨 SI ALGO FALLA Y NECESITAS AYUDA

**Información a recopilar:**

1. **Logs del afip-sidecar** (últimas 50 líneas):
   ```
   Railway → afip-sidecar → Deployments → View Logs → copiar últimas 50 líneas
   ```

2. **Logs del backend** (líneas relacionadas con AFIP):
   ```
   Railway → backend → Deployments → View Logs → buscar "facturacion_worker" o "AFIP"
   ```

3. **Variables configuradas** (sin mostrar valores):
   ```
   afip-sidecar variables: [lista de nombres de variables, NO valores]
   backend variables: [lista de nombres de variables, NO valores]
   ```

4. **Estado de los servicios:**
   ```
   afip-sidecar: [Running/Crashed/Building]
   backend: [Running/Crashed/Building]
   ```

Con esta información se puede diagnosticar cualquier problema.

---

## 📞 FIN DEL PROMPT

**Este es el único documento que necesitas seguir paso a paso.**

Ejecuta cada comando en orden, verifica cada resultado esperado, y reporta cualquier desviación o error antes de continuar al siguiente paso.

¡Éxito! 🚀
