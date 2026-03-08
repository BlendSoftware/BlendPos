# 📜 Certificados AFIP para Producción

Esta carpeta está **vacía en el repositorio** por seguridad. Los certificados reales se cargan desde variables de entorno en Railway/Render.

## 🔐 Cómo configurar certificados en producción (Railway)

### 1️⃣ Convertir tus certificados a Base64

En PowerShell (Windows), ejecuta estos comandos desde la carpeta `afip-sidecar/certs/`:

```powershell
# Convertir afip.crt a base64 y copiar al portapapeles
[Convert]::ToBase64String([IO.File]::ReadAllBytes("afip.crt")) | Set-Clipboard
```

Ahora el contenido base64 de `afip.crt` está en tu portapapeles. **Guárdalo en un archivo temporal o en notas seguras.**

```powershell
# Convertir afip.key a base64 y copiar al portapapeles
[Convert]::ToBase64String([IO.File]::ReadAllBytes("afip.key")) | Set-Clipboard
```

Guarda también el contenido de `afip.key` en base64.

### 2️⃣ Agregar variables en Railway (servicio afip-sidecar)

Ve a tu proyecto en Railway → servicio **afip-sidecar** → **Variables** y agrega:

```bash
AFIP_CERT_B64=<pega_aqui_el_contenido_base64_de_afip_crt>
AFIP_KEY_B64=<pega_aqui_el_contenido_base64_de_afip_key>
```

**Importante:** Marca estas variables como **"Secret"** en Railway para que no se muestren en logs.

### 3️⃣ Verificar el despliegue

Después de agregar las variables, Railway re-desplegará automáticamente. Verifica los logs:

```
🔐 AFIP Sidecar - Inicializando certificados...
✅ Escribiendo afip.crt desde AFIP_CERT_B64...
✅ Escribiendo afip.key desde AFIP_KEY_B64...
✅ Certificados AFIP listos en /certs/
🚀 Iniciando AFIP Sidecar en puerto 8001...
```

---

## 🛠️ Desarrollo Local

En local, los certificados se cargan directamente desde esta carpeta `certs/` (que está en `.gitignore`).

Asegúrate de tener:
- `afip.crt` (certificado AFIP)
- `afip.key` (clave privada)

```bash
# Verificar que existen
ls afip-sidecar/certs/
```

---

## ⚠️ NUNCA hagas commit de certificados reales

Los archivos `.crt`, `.key`, `.csr`, `.pem`, `.p12`, `.pfx` están en `.gitignore` para evitar exponerlos.

Solo el archivo `.gitkeep` se commitea para que la carpeta exista en el repositorio.
