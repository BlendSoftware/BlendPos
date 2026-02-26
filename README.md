# BlendPOS

Sistema de punto de venta (POS) completo con soporte offline-first, facturación AFIP, y gestión de inventario.

## 📋 Requisitos

| Software | Versión |
|----------|---------|
| Docker Desktop | ≥ 4.x |
| Git | ≥ 2.x |
| Node.js | ≥ 20 (solo para dev local sin Docker) |
| Go | ≥ 1.21 (solo para dev local sin Docker) |

## 🏁 Quick Start

```bash
# 1. Clonar el repositorio
git clone <repository-url> BlendPos
cd BlendPos

# 2. Copiar archivos de entorno
cp .env.example .env
cp frontend/.env.example frontend/.env
cp afip-sidecar/.env.example afip-sidecar/.env

# 3. Levantar servicios
docker-compose up -d

# 4. Ejecutar migraciones de base de datos
# Opción A: golang-migrate (recomendado)
migrate -path ./backend/migrations -database "postgresql://blendpos:blendpos@localhost:5432/blendpos?sslmode=disable" up

# Opción B: Docker (sin instalar nada extra)
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /docker-entrypoint-initdb.d/000001_create_tables.up.sql
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /docker-entrypoint-initdb.d/000002_historial_precios.up.sql
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /docker-entrypoint-initdb.d/000003_comprobante_retry.up.sql
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /docker-entrypoint-initdb.d/000004_fix_caja_overflow.up.sql
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /docker-entrypoint-initdb.d/000005_missing_tables.up.sql

# 5. Crear usuario admin
docker cp create_admin.sql blendpos-postgres-1:/tmp/create_admin.sql
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /tmp/create_admin.sql

# 6. Acceder
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
# Login:    admin@blendpos.com / 1234
```

## 🏗️ Arquitectura

```
┌────────────┐     ┌──────────┐     ┌──────────────┐
│  Frontend  │────▶│ Backend  │────▶│  PostgreSQL   │
│ React+Vite │     │  Go/Gin  │     │    :5432      │
│   :5173    │     │  :8000   │──┐  └──────────────┘
└────────────┘     └──────────┘  │  ┌──────────────┐
                        │        └─▶│    Redis      │
                        ▼           │    :6379      │
                   ┌──────────┐     └──────────────┘
                   │  AFIP    │
                   │ Sidecar  │
                   │  :8001   │
                   └──────────┘
```

| Servicio | Puerto | Tecnología |
|----------|--------|------------|
| Frontend | 5173 | React 18, Vite, Mantine UI, Zustand, Dexie.js (IndexedDB) |
| Backend | 8000 | Go 1.21, Gin, GORM, shopspring/decimal |
| PostgreSQL | 5432 | PostgreSQL 15 Alpine |
| Redis | 6379 | Redis 7 Alpine |
| AFIP Sidecar | 8001 | Go, facturación electrónica AFIP/ARCA |

## 📁 Estructura del Proyecto

```
BlendPos/
├── backend/
│   ├── cmd/
│   │   ├── server/          # Punto de entrada principal
│   │   ├── seeduser/        # Utilidad: crear usuarios
│   │   └── genhash/         # Utilidad: generar bcrypt hashes
│   ├── internal/
│   │   ├── handler/         # Controladores HTTP (Gin)
│   │   ├── service/         # Lógica de negocio
│   │   ├── repository/      # Acceso a datos (GORM)
│   │   ├── model/           # Modelos de BD
│   │   ├── dto/             # Data Transfer Objects
│   │   ├── worker/          # Workers async (facturación)
│   │   └── infra/           # Infra (DB, Redis, config)
│   ├── migrations/          # Migraciones SQL (golang-migrate)
│   └── Dockerfile.dev
├── frontend/
│   ├── src/
│   │   ├── pages/           # Páginas (POS, Dashboard, Admin)
│   │   ├── components/      # Componentes reutilizables
│   │   ├── services/api/    # Clientes API tipados
│   │   ├── store/           # Zustand stores
│   │   ├── offline/         # Offline-first (Dexie, sync queue)
│   │   └── api/             # API client centralizado
│   └── .env
├── afip-sidecar/            # Microservicio facturación AFIP
├── docker-compose.yml       # Dev environment
├── docker-compose.prod.yml  # Producción (con Traefik)
├── create_admin.sql         # Script SQL para crear admin
└── README.md                # ← Este archivo
```

## 🔧 Variables de Entorno

El proyecto tiene **3 archivos `.env`** independientes:

### `/.env` — Backend + Docker

| Variable | Default Dev | Descripción |
|----------|-------------|-------------|
| `ENV` | `development` | `development` o `production` |
| `PORT` | `8000` | Puerto del backend API |
| `DATABASE_URL` | `postgres://blendpos:blendpos@localhost:5432/blendpos?sslmode=disable` | Conexión PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379/0` | Conexión Redis |
| `JWT_SECRET` | `dev_secret_change_in_production` | Secreto JWT (⚠ cambiar en prod) |
| `AFIP_SIDECAR_URL` | `http://localhost:8001` | URL del sidecar AFIP |
| `AFIP_CUIT_EMISOR` | `20442477060` | CUIT emisor comprobantes |

### `/frontend/.env` — Frontend (Vite)

| Variable | Default Dev | Descripción |
|----------|-------------|-------------|
| `VITE_API_BASE` | `http://localhost:8000` | Usado por `apiClient` (auth, productos, caja) |
| `VITE_API_URL` | `http://localhost:8000` | Usado por sync, ventas, facturación |
| `VITE_PRINTER_BAUD_RATE` | `9600` | Baud rate impresora térmica (opcional) |

> ⚠️ **IMPORTANTE**: `VITE_API_BASE` y `VITE_API_URL` deben apuntar al mismo backend. Ambas son necesarias.

### `/afip-sidecar/.env` — AFIP Sidecar

| Variable | Default Dev | Descripción |
|----------|-------------|-------------|
| `AFIP_CUIT_EMISOR` | `20442477060` | CUIT del emisor |
| `AFIP_CERT_PATH` | `/certs/afip.crt` | Ruta certificado AFIP |
| `AFIP_KEY_PATH` | `/certs/afip.key` | Ruta clave privada |
| `AFIP_HOMOLOGACION` | `true` | `true`=testing, `false`=producción |
| `AFIP_PORT` | `8001` | Puerto del sidecar |

## 🗄️ Base de Datos

### Migraciones

GORM AutoMigrate está **DESACTIVADO**. El esquema se maneja con migraciones SQL en `backend/migrations/`:

| Migración | Descripción |
|-----------|-------------|
| `000001_create_tables` | Tablas principales: usuarios, productos, ventas, sesion_cajas, etc. |
| `000002_historial_precios` | Tabla historial_precios para auditoría de cambios |
| `000003_comprobante_retry` | Retry y campos adicionales para comprobantes AFIP |
| `000004_fix_caja_overflow` | Fix decimal overflow: campos NUMERIC(12,2) → NUMERIC(15,2) |
| `000005_missing_tables` | Tablas faltantes: categorias, contacto_proveedors, movimientos_stock |

### Tablas esperadas después de migrar

```
categorias, comprobantes, contacto_proveedors, historial_precios,
movimiento_cajas, movimientos_stock, producto_hijos, productos,
proveedores, sesion_cajas, usuarios, venta_items, venta_pagos,
ventas, schema_migrations
```

### Verificar tablas

```bash
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -c "\dt"
```

## 👤 Credenciales

| Rol | Email | Contraseña |
|-----|-------|------------|
| Administrador | `admin@blendpos.com` | `1234` |

Para crear el admin si no existe:
```bash
docker cp create_admin.sql blendpos-postgres-1:/tmp/create_admin.sql
docker exec blendpos-postgres-1 psql -U blendpos -d blendpos -f /tmp/create_admin.sql
```

## 🧪 Desarrollo Local (sin Docker)

```bash
# Terminal 1: PostgreSQL + Redis (con Docker)
docker-compose up -d postgres redis

# Terminal 2: Backend
cd backend
go run cmd/server/main.go

# Terminal 3: Frontend
cd frontend
npm install
npm run dev
```

## 🛠️ Comandos Útiles

```bash
# Levantar todo
docker-compose up -d

# Ver logs
docker-compose logs -f                    # todos
docker logs blendpos-backend-1 -f         # solo backend

# Reiniciar
docker-compose restart                    # todos
docker restart blendpos-backend-1         # solo backend

# Reset total (⚠ BORRA TODO)
docker-compose down -v
docker-compose up -d
# → volver a migrar y crear admin

# Acceder a psql
docker exec -it blendpos-postgres-1 psql -U blendpos -d blendpos

# Health check
curl http://localhost:8000/health          # → {"status":"ok"}
```

## ⚠️ Notas Importantes

1. **`shopspring/decimal`** — El backend serializa montos como strings JSON (`"650.00"` no `650.00`). El frontend debe usar `parseFloat()` al procesar respuestas numéricas.

2. **Offline-first** — Las ventas se persisten localmente en IndexedDB y se sincronizan via `/v1/ventas/sync-batch`. El POS funciona sin conexión pero necesita backend para sincronizar.

3. **Cambios de esquema** — Crear nuevas migraciones en `backend/migrations/`. No modificar tablas directamente.

4. **Producción** — Cambiar `JWT_SECRET`, `POSTGRES_PASSWORD`, y `AFIP_HOMOLOGACION=false`.
