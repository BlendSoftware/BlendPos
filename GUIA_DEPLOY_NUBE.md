# ☁️ Guía de Deploy de BlendPOS en la Nube

Guía paso a paso para subir BlendPOS (backend Go + frontend React + PostgreSQL + Redis) a servicios cloud.

---

## 📋 Índice

1. [Arquitectura del proyecto](#arquitectura-del-proyecto)
2. [Opción A — Railway (Recomendada)](#opción-a--railway-recomendada)
3. [Opción B — Render](#opción-b--render)
4. [Opción C — Railway (Backend) + Netlify/Vercel (Frontend)](#opción-c--railway-backend--netlifyvercel-frontend)
5. [Opción D — VPS con Docker Compose](#opción-d--vps-con-docker-compose)
6. [Variables de entorno (referencia)](#variables-de-entorno-referencia)
7. [Post-deploy: Verificación](#post-deploy-verificación)
8. [Troubleshooting](#troubleshooting)

---

## Arquitectura del proyecto

```
BlendPOS/
├── backend/          ← Go API (Gin) — Puerto 8000
│   ├── Dockerfile    ← Multi-stage build, incluye migrate CLI
│   ├── entrypoint.sh ← Ejecuta migraciones + arranca el server
│   └── migrations/   ← SQL migraciones (golang-migrate)
├── frontend/         ← React + Vite (SPA) — Build estático
│   ├── Dockerfile    ← Build Vite → nginx
│   └── nginx.conf    ← SPA fallback, gzip, cache headers
├── afip-sidecar/     ← Python(FastAPI) — Facturación AFIP (opcional)
├── railway.json      ← Config Railway para el backend
├── netlify.toml      ← Config Netlify para el frontend
└── docker-compose.prod.yml ← Deploy con Docker Compose (VPS)
```

**Servicios necesarios:**

| Servicio | Uso | Obligatorio |
|---|---|---|
| PostgreSQL 15+ | Base de datos relacional | ✅ Sí |
| Redis 7+ | Cola de workers (facturación, email) | ✅ Sí |
| Backend (Go) | API REST `/v1/*` | ✅ Sí |
| Frontend (React) | SPA estática (HTML/JS/CSS) | ✅ Sí |
| AFIP Sidecar (Python) | Facturación electrónica AFIP | ❌ Opcional |

---

## Opción A — Railway (Recomendada)

Railway permite deployar todo (backend, PostgreSQL, Redis) desde un solo dashboard con soporte nativo de Docker.

### Requisitos previos

- Cuenta en [railway.app](https://railway.app) (tiene free tier)
- Repositorio en GitHub (público o privado)

### Paso 1: Subir el código a GitHub

```powershell
# Desde la raíz del proyecto
cd "c:\Users\Usuario\Desktop\BLEND SOFTWARE\BlendPos"

# Si no tenés un repo remoto aún:
git remote add origin https://github.com/TU_USUARIO/blendpos.git

# Push
git add .
git commit -m "feat: preparar para deploy en la nube"
git push -u origin master
```

### Paso 2: Crear proyecto en Railway

1. Ir a [railway.app/new](https://railway.app/new)
2. Click **"Deploy from GitHub Repo"**
3. Seleccionar el repo de BlendPOS
4. Railway detectará el `Dockerfile` y `railway.json`

### Paso 3: Agregar PostgreSQL

1. En el dashboard del proyecto, click **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Railway crea una instancia PostgreSQL automáticamente
3. Copiar la variable `DATABASE_URL` que Railway genera (formato: `postgresql://user:pass@host:port/dbname`)

### Paso 4: Agregar Redis

1. Click **"+ New"** → **"Database"** → **"Redis"**
2. Copiar la variable `REDIS_URL` generada

### Paso 5: Configurar el servicio Backend

1. En el servicio del backend, ir a **Settings** → **General**:
   - **Root Directory**: `backend`
   - **Builder**: `Dockerfile`
   - **Start Command**: `/entrypoint.sh`

2. Ir a la pestaña **Variables** y agregar:

```env
# Railway inyecta DATABASE_URL y REDIS_URL automáticamente si los vinculás
# Si no, cargalos manualmente:
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# Obligatorias
ENV=production
PORT=8000
JWT_SECRET=un_string_aleatorio_de_al_menos_32_caracteres_cambiar_esto

# Opcionales
JWT_EXPIRATION_HOURS=8
JWT_REFRESH_HOURS=24
WORKER_POOL_SIZE=3
PDF_STORAGE_PATH=/tmp/blendpos/pdfs
AFIP_SIDECAR_URL=http://afip-sidecar:8001
AFIP_CUIT_EMISOR=20442477060
AFIP_HOMOLOGACION=true

# SMTP (si querés enviar emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_email@gmail.com
SMTP_PASSWORD=tu_app_password
SMTP_FROM=BlendPOS <tu_email@gmail.com>
```

3. Ir a **Settings** → **Networking** → **Generate Domain** para obtener una URL pública (ej: `blendpos-backend-production.up.railway.app`)

### Paso 6: Deploy del Frontend

**Opción A — Frontend también en Railway:**

1. En el proyecto, click **"+ New"** → **"GitHub Repo"** → seleccionar el mismo repo
2. En **Settings**:
   - **Root Directory**: `frontend`
   - **Builder**: `Dockerfile`
3. En **Variables**, agregar las build args:
   ```env
   VITE_API_URL=https://blendpos-backend-production.up.railway.app
   VITE_API_BASE=https://blendpos-backend-production.up.railway.app
   ```
4. En **Settings** → **Networking** → **Generate Domain**

**Opción B — Frontend en Netlify (gratis, más rápido):**

Ver [Opción C](#opción-c--railway-backend--netlifyvercel-frontend) más abajo.

### Paso 7: Crear usuario admin

Una vez que el backend esté corriendo y las migraciones se hayan aplicado, necesitás crear el usuario administrador. Conectate a la base de datos de Railway:

```powershell
# Desde Railway Dashboard → PostgreSQL → Connect → copiar la connection string
psql "postgresql://user:pass@host:port/dbname"
```

```sql
-- Crear el usuario admin (password: blendpos2026)
INSERT INTO usuarios (id, nombre, username, password_hash, rol, activo, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'Administrador',
    'admin',
    '$2a$10$6K1LZLbqKz3rVF1MJcEWKu2mFB4o6XzBZJ1yXsW9RdeNc0tYMPaZK',
    'administrador',
    true,
    NOW(),
    NOW()
);
```

> **Nota:** Cambiá la contraseña desde el panel de admin después del primer login.

---

## Opción B — Render

Render ofrece un modelo similar a Railway con soporte para Docker y free tier.

### Paso 1: Crear servicios en Render

1. Ir a [dashboard.render.com](https://dashboard.render.com)
2. **Crear PostgreSQL**: New → PostgreSQL → Free tier
3. **Crear Redis**: New → Redis → Free tier
4. **Crear Web Service (Backend)**:
   - Source: GitHub repo
   - Root Directory: `backend`
   - Runtime: Docker
   - Docker Command: `/entrypoint.sh`
   - Environment Variables: (mismas que Railway, ver arriba)
   - Agregar `DATABASE_URL` y `REDIS_URL` con los valores de los servicios creados

5. **Crear Static Site (Frontend)**:
   - Source: GitHub repo
   - Root Directory: `frontend`
   - Build Command: `npm ci && npm run build`
   - Publish Directory: `dist`
   - Environment Variables:
     ```
     VITE_API_URL=https://tu-backend.onrender.com
     VITE_API_BASE=https://tu-backend.onrender.com
     NODE_VERSION=20
     ```
   - Agregar _Rewrite Rule_: `/*` → `/index.html` (status 200)

### Consideraciones de Render

- El **free tier** apaga el servicio tras 15 min de inactividad (primer request tarda ~30s)
- Para producción real, usar el plan **Starter** ($7/mes por servicio)
- Los static sites son siempre gratis e ilimitados

---

## Opción C — Railway (Backend) + Netlify/Vercel (Frontend)

Esta es la opción más económica y performante: el backend corre en Railway y el frontend (archivos estáticos) se sirve desde Netlify o Vercel (CDN global, gratis ilimitado).

### Netlify

1. Ir a [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
2. Seleccionar el repo de BlendPOS
3. Configurar:
   - **Base directory**: `frontend`
   - **Build command**: `npm ci && npm run build`
   - **Publish directory**: `frontend/dist`
4. En **Site settings** → **Environment variables**, agregar:
   ```
   VITE_API_URL=https://tu-backend-railway.up.railway.app
   VITE_API_BASE=https://tu-backend-railway.up.railway.app
   ```
5. Netlify usará el archivo `netlify.toml` de la raíz que ya incluye:
   - SPA redirect (`/*` → `/index.html`)
   - Cache headers para assets estáticos
   - No-cache para el Service Worker

### Vercel

1. Ir a [vercel.com/new](https://vercel.com/new) → Importar repo
2. Configurar:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
3. Environment variables: iguales que Netlify
4. Crear archivo `vercel.json` en `frontend/`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    },
    {
      "source": "/sw.js",
      "headers": [{ "key": "Cache-Control", "value": "no-store" }]
    }
  ]
}
```

---

## Opción D — VPS con Docker Compose

Para tener control total, deployá en un VPS (DigitalOcean, Hetzner, Contabo, Linode).

### Requisitos

- VPS con Ubuntu 22.04+, mínimo 1GB RAM
- Docker y Docker Compose instalados
- Dominio apuntando al servidor (para SSL)

### Paso 1: Preparar el servidor

```bash
# Instalar Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Instalar Docker Compose plugin
sudo apt install docker-compose-plugin

# Clonar el repo
git clone https://github.com/TU_USUARIO/blendpos.git /opt/blendpos
cd /opt/blendpos
```

### Paso 2: Configurar variables de entorno

```bash
# Copiar el ejemplo y editar
cp .env.example .env
nano .env
```

Editar `.env` con valores de producción:

```env
ENV=production
PORT=8000
DOMAIN=pos.tudominio.com

# Database — cambiar contraseña!
POSTGRES_DB=blendpos
POSTGRES_USER=blendpos
POSTGRES_PASSWORD=UnaContraseñaSegura123!
DATABASE_URL=postgres://blendpos:UnaContraseñaSegura123!@postgres:5432/blendpos?sslmode=disable

# Redis — cambiar contraseña!
REDIS_PASSWORD=OtraContraseñaSegura456!
REDIS_URL=redis://:OtraContraseñaSegura456!@redis:6379/0

# JWT — generar con: openssl rand -base64 32
JWT_SECRET=CAMBIAR_ESTO_POR_UN_STRING_ALEATORIO_DE_32_CHARS_MINIMO

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@tudominio.com
SMTP_PASSWORD=app_password_de_gmail
SMTP_FROM=BlendPOS <noreply@tudominio.com>

# AFIP Sidecar — OBLIGATORIO para facturación fiscal
AFIP_CUIT_EMISOR=20471955575
AFIP_HOMOLOGACION=false
INTERNAL_API_TOKEN=GENERAR_CON_openssl_rand_hex_32

# Let's Encrypt
ACME_EMAIL=admin@tudominio.com
```

### Paso 3: Build y deploy

```bash
# Build con la URL del backend inyectada en el frontend
docker compose -f docker-compose.prod.yml build \
  --build-arg VITE_API_URL=https://pos.tudominio.com \
  --build-arg VITE_API_BASE=https://pos.tudominio.com

# Levantar todo
docker compose -f docker-compose.prod.yml up -d

# Ver logs
docker compose -f docker-compose.prod.yml logs -f
```

### Paso 4: Ejecutar migraciones

```bash
# El entrypoint.sh las ejecuta automáticamente, pero si necesitás forzar:
docker compose -f docker-compose.prod.yml exec backend \
  migrate -path /migrations -database "$DATABASE_URL" up
```

### Paso 5: Crear usuario admin

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U blendpos -d blendpos -c "
    INSERT INTO usuarios (id, nombre, username, password_hash, rol, activo, created_at, updated_at)
    VALUES (
      gen_random_uuid(), 'Administrador', 'admin',
      '\$2a\$10\$6K1LZLbqKz3rVF1MJcEWKu2mFB4o6XzBZJ1yXsW9RdeNc0tYMPaZK',
      'administrador', true, NOW(), NOW()
    );
  "
```

### Paso 6: Verificar SSL

```bash
# Debería devolver certificado válido
curl -I https://pos.tudominio.com
```

---

## Variables de entorno (referencia)

### Backend

| Variable | Descripción | Ejemplo | Obligatoria |
|---|---|---|---|
| `ENV` | Entorno de ejecución | `production` | ✅ |
| `PORT` | Puerto del servidor | `8000` | ✅ |
| `DATABASE_URL` | Connection string PostgreSQL | `postgres://user:pass@host:5432/db?sslmode=disable` | ✅ |
| `REDIS_URL` | Connection string Redis | `redis://:pass@host:6379/0` | ✅ |
| `JWT_SECRET` | Secreto para firmar tokens (mínimo 32 chars) | `openssl rand -base64 32` | ✅ |
| `JWT_EXPIRATION_HOURS` | Duración del token de acceso | `8` | ❌ (default: 8) |
| `JWT_REFRESH_HOURS` | Duración del refresh token | `24` | ❌ (default: 24) |
| `WORKER_POOL_SIZE` | Workers para tareas async | `5` | ❌ (default: 5) |
| `AFIP_SIDECAR_URL` | URL del sidecar AFIP | `http://afip-sidecar:8001` | ❌ |
| `INTERNAL_API_TOKEN` | Token compartido backend-sidecar | `openssl rand -hex 32` | ❌ |
| `SMTP_HOST` | Servidor SMTP | `smtp.gmail.com` | ❌ |
| `SMTP_PORT` | Puerto SMTP | `587` | ❌ |
| `SMTP_USER` | Usuario SMTP | `noreply@empresa.com` | ❌ |
| `SMTP_PASSWORD` | Contraseña SMTP | `app_password` | ❌ |
| `SMTP_FROM` | Remitente de emails | `BlendPOS <noreply@empresa.com>` | ❌ |
| `PDF_STORAGE_PATH` | Ruta para PDFs generados | `/tmp/blendpos/pdfs` | ❌ |

### AFIP Sidecar (Python)

> **IMPORTANTE:** El AFIP Sidecar es OBLIGATORIO para emitir facturas fiscales. Sin él, el sistema solo genera tickets internos.

| Variable | Descripción | Ejemplo | Obligatoria |
|---|---|---|---|
| `AFIP_CUIT_EMISOR` | CUIT del emisor (sin guiones) | `20471955575` | ✅ |
| `AFIP_HOMOLOGACION` | Modo de testing AFIP | `true` o `false` | ✅ |
| `AFIP_CERT_PATH` | Ruta al certificado X.509 | `/certs/afip.crt` | ✅ |
| `AFIP_KEY_PATH` | Ruta a la clave privada | `/certs/afip.key` | ✅ |
| `AFIP_CACHE_DIR` | Directorio para cache tokens | `/tmp/afip_cache` | ❌ (default: `/tmp/afip_cache`) |
| `INTERNAL_API_TOKEN` | Token compartido con backend | `openssl rand -hex 32` | ✅ en producción |
| `REDIS_URL` | Redis para cache de tokens WSAA | `redis://:pass@redis:6379/0` | ❌ |

**Notas importantes:**
- El certificado X.509 debe estar generado desde AFIP y vinculado al CUIT emisor
- En homologación: usar certificado de testing de AFIP
- En producción: `AFIP_HOMOLOGACION=false` y certificado real
- El volumen `./afip-sidecar/certs:/certs:ro` debe contener `afip.crt` y `afip.key`
- Sin certificado válido, el sidecar no arranca

### Frontend (build time)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `VITE_API_URL` | URL base del backend | `https://api.blendpos.com` |
| `VITE_API_BASE` | URL base del backend (alias) | `https://api.blendpos.com` |
| `VITE_PRINTER_BAUD_RATE` | Baud rate impresora térmica | `9600` |

> **Importante:** Las variables `VITE_*` se inyectan en tiempo de **build**, no en runtime. Si cambiás la URL del backend, tenés que hacer un nuevo build del frontend.

---

## Post-deploy: Verificación

### 1. Health check del backend

```bash
curl https://TU_URL_BACKEND/health
# Respuesta esperada: {"status":"ok","database":"ok","redis":"ok",...}
```

### 2. Login

```bash
curl -X POST https://TU_URL_BACKEND/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"blendpos2026"}'
# Respuesta esperada: {"token":"eyJhbG...","refresh_token":"...","user":{...}}
```

### 3. Frontend

1. Abrir `https://TU_URL_FRONTEND` en el navegador
2. Debería cargar la pantalla de login
3. Login con `admin` / `blendpos2026`
4. Verificar que el POS carga productos del backend

### 4. Checklist final

- [ ] Backend responde en `/health`
- [ ] Login funciona
- [ ] Frontend carga sin errores en consola
- [ ] POS muestra productos
- [ ] Se pueden registrar ventas
- [ ] Cierre de caja funciona
- [ ] La PWA se puede instalar (candado HTTPS)

---

## Troubleshooting

### "CORS error" en el navegador

El backend ya permite `Access-Control-Allow-Origin: *`. Si necesitás restringirlo, editar `backend/internal/middleware/cors.go` y cambiar `*` por la URL del frontend.

### "Migration failed" en los logs del backend

```bash
# Verificar el estado de las migraciones
docker compose exec backend migrate -path /migrations -database "$DATABASE_URL" version

# Forzar una versión si está "dirty"
docker compose exec backend migrate -path /migrations -database "$DATABASE_URL" force 6
docker compose exec backend migrate -path /migrations -database "$DATABASE_URL" up
```

### Frontend muestra "CONECTANDO..." o no carga productos

1. Verificar que `VITE_API_URL` / `VITE_API_BASE` apunten al backend correcto
2. Abrir DevTools (F12) → Network → verificar que los requests van a la URL correcta
3. Si cambiaste la URL, re-buildeá el frontend (las `VITE_*` son build-time)

### Railway: "Build failed"

- Verificar que el **Root Directory** esté configurado como `backend` o `frontend`
- En Railway, si usás monorepo, cada servicio necesita su propio Root Directory

### El backend no arranca: "failed to connect to postgres"

- Verificar que `DATABASE_URL` tiene el formato correcto
- En Railway: usar reference variables `${{Postgres.DATABASE_URL}}`
- Verificar que PostgreSQL esté corriendo y healthcheck pasando

### Redis: "failed to connect"

- Railway/Render: verificar que la variable `REDIS_URL` incluya la contraseña
- Formato: `redis://:PASSWORD@hostname:port/0`

### AFIP Sidecar no funciona / Solo genera tickets

**Síntoma:** El sistema genera tickets internos en lugar de facturas fiscales AFIP.

**Causas comunes:**

1. **Variable `AFIP_CUIT_EMISOR` faltante** (problema más común):
   ```bash
   # Verificar logs del sidecar
   docker compose logs afip-sidecar
   
   # Si ves: "ERROR: Variable AFIP_CUIT_EMISOR no configurada"
   # Agregar en el .env:
   AFIP_CUIT_EMISOR=20471955575
   
   # Reiniciar
   docker compose restart afip-sidecar
   ```

2. **Certificados faltantes o inválidos:**
   ```bash
   # Verificar que existan los archivos
   ls -la ./afip-sidecar/certs/
   # Debe mostrar: afip.crt y afip.key
   
   # Verificar permisos
   chmod 644 ./afip-sidecar/certs/afip.crt
   chmod 600 ./afip-sidecar/certs/afip.key
   ```

3. **Backend no puede conectar al sidecar:**
   ```bash
   # Verificar que el sidecar esté corriendo
   docker compose ps afip-sidecar
   
   # Verificar health
   curl http://localhost:8001/health
   
   # Si no responde, revisar logs
   docker compose logs afip-sidecar
   ```

4. **`INTERNAL_API_TOKEN` no coincide:**
   ```bash
   # Debe ser el mismo en backend y sidecar
   # Si cambiaste uno, cambiar el otro también
   docker compose restart backend afip-sidecar
   ```

5. **En cloud (Railway/Render):**
   - Asegurate de montar los certificados como secrets o volumes
   - Verificar que `AFIP_SIDECAR_URL` apunte correctamente al servicio interno
   - El sidecar debe estar en la misma red privada que el backend

**Verificación:**
```bash
# 1. Verificar configuración en BD
docker compose exec postgres psql -U blendpos -d blendpos -c \
  "SELECT punto_de_venta, condicion_fiscal, cuit FROM configuracion_fiscal LIMIT 1;"

# 2. Probar endpoint directo del sidecar (requiere token)
curl -X POST http://localhost:8001/facturar \
  -H "X-Internal-Token: TU_INTERNAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

> **Nota:** Si no necesitás facturación electrónica, podés omitir el sidecar. El backend funciona sin él (las facturas quedan en estado "pendiente").

---

## Costos estimados (USD/mes)

| Proveedor | Plan | Backend | PostgreSQL | Redis | Frontend | Total |
|---|---|---|---|---|---|---|
| **Railway** | Hobby ($5 base) | ~$3 | ~$3 | ~$1 | ~$1 | **~$8-13** |
| **Render** | Free | $0 | $0 | $0 | $0 | **$0** (con limitaciones) |
| **Render** | Starter | $7 | $7 | $0 | $0 | **~$14** |
| **Railway + Netlify** | Hobby + Free | ~$3 | ~$3 | ~$1 | $0 | **~$7-12** |
| **VPS (Hetzner)** | CX22 | Todo incluido | — | — | — | **~$4-5** |
| **VPS (DigitalOcean)** | Basic | Todo incluido | — | — | — | **~$6** |

> Railway cobra por uso (CPU + memoria + storage). Los costos pueden variar según el tráfico.

---

## Resumen: ¿Qué opción elegir?

| Criterio | Railway | Render | Railway+Netlify | VPS |
|---|---|---|---|---|
| **Facilidad de setup** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Costo mínimo** | ~$5/mes | $0 (free) | ~$5/mes | ~$4/mes |
| **Performance** | Buena | Regular (free) | Buena | Excelente |
| **SSL automático** | ✅ | ✅ | ✅ | ✅ (Traefik) |
| **CI/CD automático** | ✅ | ✅ | ✅ | ❌ (manual) |
| **Escalabilidad** | Alta | Media | Alta | Manual |
| **Control total** | Bajo | Bajo | Bajo | Total |

**Recomendación:**
- **Para empezar rápido**: Railway (todo en uno)
- **Para producción económica**: Railway (backend) + Netlify (frontend)
- **Para máximo control**: VPS con Docker Compose
