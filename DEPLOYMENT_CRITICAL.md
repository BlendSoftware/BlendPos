# 🚨 Configuración CRÍTICA para Producción

## Problema: Solo genera tickets, no facturas fiscales

### Síntoma
Cuando desplegás el proyecto en la nube (Railway, Render, VPS), el sistema solo genera tickets internos en lugar de facturas fiscales AFIP, aunque en desarrollo local funciona correctamente.

### Causa raíz
El afip-sidecar no arranca correctamente porque **falta la variable de entorno `AFIP_CUIT_EMISOR`**, que es OBLIGATORIA.

---

## ✅ Solución

### 1. Variables obligatorias en producción

Asegurate de configurar estas variables en tu servicio de despliegue:

```env
# AFIP Sidecar — CRÍTICAS
AFIP_CUIT_EMISOR=20471955575                    # ⚠ TU CUIT REAL SIN GUIONES
AFIP_HOMOLOGACION=false                         # false para producción, true para testing
INTERNAL_API_TOKEN=GENERAR_CON_openssl_rand_hex_32   # Obligatorio en producción

# Backend
AFIP_SIDECAR_URL=http://afip-sidecar:8001      # URL interna del sidecar
```

### 2. Generar el INTERNAL_API_TOKEN

```bash
# En Linux/Mac/WSL:
openssl rand -hex 32

# En PowerShell:
python -c "import secrets; print(secrets.token_hex(32))"
```

**Importante:** El mismo token debe estar configurado en:
- Backend (`INTERNAL_API_TOKEN`)
- AFIP Sidecar (`INTERNAL_API_TOKEN`)

---

## 📝 Configuración por plataforma

### Railway

1. Crear el servicio **afip-sidecar** desde el repo
2. En **Variables**, agregar:
   ```env
   AFIP_CUIT_EMISOR=20471955575
   AFIP_HOMOLOGACION=false
   INTERNAL_API_TOKEN=xxx
   REDIS_URL=${{Redis.REDIS_URL}}
   AFIP_CERT_PATH=/certs/afip.crt
   AFIP_KEY_PATH=/certs/afip.key
   ```
3. Montar los certificados como **volume** o **secret**
4. En el servicio **backend**, agregar:
   ```env
   AFIP_SIDECAR_URL=http://afip-sidecar.railway.internal:8001
   INTERNAL_API_TOKEN=xxx  # El mismo que el sidecar
   ```

### Docker Compose (VPS)

El archivo `docker-compose.prod.yml` ya está corregido. Solo necesitás crear un archivo `.env` en la raíz del proyecto:

```bash
# Copiar el ejemplo
cp .env.example .env

# Editar con tus valores
nano .env
```

Asegurate de configurar:
```env
AFIP_CUIT_EMISOR=20471955575
AFIP_HOMOLOGACION=false
INTERNAL_API_TOKEN=xxx
REDIS_PASSWORD=xxx
POSTGRES_PASSWORD=xxx
```

Luego:
```bash
docker compose -f docker-compose.prod.yml up -d
```

### Render

Similar a Railway, pero en Render cada variable se configura en:
1. Dashboard → Service → Environment → Add Environment Variable
2. Configurar las mismas variables que Railway
3. El sidecar debe estar en el mismo proyecto para que se comuniquen internamente

---

## 🔍 Verificación

### 1. Verificar que el sidecar arrancó correctamente

```bash
# Docker Compose
docker compose logs afip-sidecar | grep "Sidecar listo"

# Railway
# Ver logs en el dashboard del servicio afip-sidecar

# Deberías ver:
# ✓ Cliente AFIP inicializado correctamente
#   - CUIT Emisor: 20471955575
#   - Modo: PRODUCCIÓN
# ✓ Autenticación WSAA exitosa
# Sidecar listo — Escuchando en puerto 8001
```

### 2. Verificar conectividad backend → sidecar

```bash
# Desde el contenedor del backend
docker compose exec backend wget -qO- http://afip-sidecar:8001/health

# Respuesta esperada:
# {"status":"ok","wsaa":"authenticated","token_expiracion":"2026-03-09T..."}
```

### 3. Probar facturación

1. Ir al POS
2. Crear una venta
3. Seleccionar tipo de comprobante: **Factura B** o **Factura C**
4. Completar la venta
5. En el modal post-venta, esperar a que aparezca "Descargar Factura Fiscal PDF"
6. Verificar que el PDF tenga:
   - CAE (Código de Autorización Electrónica)
   - Código de barras
   - Datos fiscales completos

---

## ❌ Errores comunes

### Error: "AFIP_CUIT_EMISOR es requerido"

**Causa:** La variable no está configurada.

**Solución:** Agregar `AFIP_CUIT_EMISOR=20471955575` en las variables de entorno del servicio afip-sidecar.

### Error: "Acceso denegado: token interno inválido"

**Causa:** `INTERNAL_API_TOKEN` no coincide entre backend y sidecar, o está vacío en producción.

**Solución:**
1. Generar un token: `openssl rand -hex 32`
2. Configurar el MISMO token en ambos servicios
3. Reiniciar ambos servicios

### Error: "Certificate verify failed"

**Causa:** Los certificados AFIP no están montados correctamente.

**Solución:**
1. Verificar que `afip.crt` y `afip.key` existan en `./afip-sidecar/certs/`
2. En cloud, montar como volume o incluir en la imagen Docker
3. Permisos: `chmod 644 afip.crt && chmod 600 afip.key`

### Solo genera tickets internos

**Causa:** Una de estas:
1. El sidecar no arrancó (falta `AFIP_CUIT_EMISOR`)
2. Backend no puede comunicarse con el sidecar (URL incorrecta, red diferente)
3. `INTERNAL_API_TOKEN` incorrecto

**Solución:**
1. Verificar logs del sidecar
2. Ver logs del backend cuando intentás facturar: `docker compose logs backend | grep afip`
3. Verificar que ambos servicios estén en la misma red Docker
4. Probar conectividad: `docker compose exec backend ping afip-sidecar`

---

## 📚 Referencias

- [GUIA_DEPLOY_NUBE.md](./GUIA_DEPLOY_NUBE.md) - Guía completa de despliegue
- [afip-sidecar/README.md](./afip-sidecar/README.md) - Documentación del sidecar AFIP
- [afip-sidecar/QUICKSTART.md](./afip-sidecar/QUICKSTART.md) - Inicio rápido AFIP

---

## 🔐 Seguridad

**NUNCA commitear al repositorio:**
- `.env` con valores reales
- Certificados AFIP (`afip.crt`, `afip.key`)
- `INTERNAL_API_TOKEN` en código

**Usar:**
- Variables de entorno del servicio cloud
- Secrets/Vaults para certificados
- `.gitignore` configurado correctamente (ya incluido)

---

## ✅ Checklist de deployment

Antes de considerar el deployment completo, verificar:

- [ ] `AFIP_CUIT_EMISOR` configurado en afip-sidecar
- [ ] `AFIP_HOMOLOGACION=false` en producción
- [ ] `INTERNAL_API_TOKEN` generado y configurado en ambos servicios
- [ ] Certificados AFIP montados correctamente
- [ ] Sidecar arranca sin errores (ver logs)
- [ ] Backend puede hacer ping a `afip-sidecar` o URL interna
- [ ] Health check del sidecar responde: `curl http://afip-sidecar:8001/health`
- [ ] Configuración fiscal creada en BD (desde frontend en Configuración Fiscal)
- [ ] Prueba de facturación exitosa con CAE generado
- [ ] PDF fiscal descargado con código de barras CAE

---

**Última actualización:** 2026-03-08  
**Versión:** 1.0
