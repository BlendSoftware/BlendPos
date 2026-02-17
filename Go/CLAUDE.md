# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BlendPOS: a mission-critical Point of Sale system sold as a SaaS product, designed for the high-turnover, granular-stock environment of a Kiosk/Drugstore. Deployed on a cloud VM (Digital Ocean Droplet) with Traefik + Let's Encrypt SSL, accessed by the buyer as a PWA (Progressive Web App) that works offline via IndexedDB (Dexie.js). Built on Go >= 1.22, Gin framework, GORM + pgx, PostgreSQL, React (Vite + TypeScript), TailwindCSS and ShadcnUI. Features Hierarchical Inventory with automatic bulk-to-unit disassembly, high-speed sales (<100ms latency), offline-first operation with background sync, cash management with blind cash counts, hybrid invoicing (AFIP fiscal + internal PDF), ESC/POS thermal printing, and JWT authentication (OAuth2).

## Methodology

This project follows **Spec-Driven Development (SDD)**. Before implementing any task:
1. Read the relevant specification in `especificacion.md` (features, contracts, acceptance criteria)
2. Read the architecture in `arquitectura.md` (layers, patterns, data flows)
3. Follow TDD: write tests first, verify they fail, then implement

## Reference Documents (Read Before Implementing)

| Document | Purpose |
|----------|---------|
| `especificacion.md` | Formal SDD spec: features with Given/When/Then criteria, data contracts, tasks in phases |
| `arquitectura.md` | Software architecture: layered (Handler→Service→Repository→DB), data flows, ADRs, deployment topology |
| `requirements.md` | Functional requirements (EARS format), non-functional requirements, traceability matrix |
| `proyecto.md` | Narrative prose overview of the entire system |
| `ejecucion.md` | Step-by-step execution guide with prompts for each task |
| `habilidades.md` | Recommended AI agent skills for development |

## Stack

- **Language**: Go >= 1.22
- **HTTP Framework**: Gin >= 1.9
- **Database**: PostgreSQL >= 15, GORM >= 2.0 (ORM), pgx >= 5.0 (native driver), golang-migrate (migrations)
- **Auth**: JWT (golang-jwt/jwt v5), bcrypt (golang.org/x/crypto/bcrypt)
- **Async Tasks**: Goroutine worker pool + Redis as job queue (go-redis/redis v9)
- **PDF Generation**: jung-kurt/gofpdf or go-pdf/fpdf
- **AFIP Integration**: Custom HTTP client (net/http) for SOAP/REST WSAA + WSFEV1
- **CSV Processing**: encoding/csv (stdlib)
- **Email**: jordan-wright/email or go-mail/mail
- **Validation**: go-playground/validator v10
- **Logging**: rs/zerolog or uber-go/zap
- **Config**: spf13/viper or caarlos0/env
- **Frontend**: React >= 18, TypeScript, Vite, TailwindCSS, ShadcnUI
- **Barcode**: react-barcode-reader or Web Serial API
- **Offline DB**: Dexie.js (IndexedDB wrapper), TanStack Query Persist
- **PWA**: Vite PWA Plugin, ServiceWorker, Web App Manifest
- **Thermal Printing**: ESC/POS via Web Serial API or Print Agent (localhost:9090)
- **Reverse Proxy**: Traefik v3 + Let's Encrypt SSL
- **Hot Reload (dev)**: cosmtrek/air

## Target Directory Structure

```
blendpos/
  backend/
    cmd/
      server/
        main.go              # Application entry point
    internal/
      config/
        config.go            # Viper/env configuration
      handler/               # HTTP handlers (Gin): ventas, productos, inventario, caja, facturacion, proveedores, usuarios, consulta_precios
        auth.go
        ventas.go
        productos.go
        inventario.go
        caja.go
        facturacion.go
        proveedores.go
        consulta_precios.go
        usuarios.go
      service/               # Business logic: venta_service, inventario_service, caja_service, facturacion_service, proveedor_service
        venta_service.go
        inventario_service.go
        caja_service.go
        facturacion_service.go
        proveedor_service.go
        auth_service.go
      repository/            # Data access layer
        producto_repo.go
        venta_repo.go
        caja_repo.go
        comprobante_repo.go
        proveedor_repo.go
        usuario_repo.go
      model/                 # GORM models: Producto, ProductoHijo, Venta, VentaItem, SesionCaja, MovimientoCaja, Comprobante, Proveedor, Usuario
        producto.go
        producto_hijo.go
        venta.go
        sesion_caja.go
        comprobante.go
        proveedor.go
        usuario.go
      dto/                   # Request/Response structs with validator tags
        producto_dto.go
        venta_dto.go
        caja_dto.go
        facturacion_dto.go
        proveedor_dto.go
        auth_dto.go
      middleware/             # Gin middleware: auth JWT, CORS, error handler, request ID, rate limiter
        auth.go
        cors.go
        error_handler.go
        request_id.go
        rate_limiter.go
      infra/                 # Adapters: database, redis, afip, smtp
        database.go
        redis.go
        afip.go
        smtp.go
      worker/                # Async task processing: goroutine pool, job queue
        pool.go
        facturacion_worker.go
        email_worker.go
      router/
        router.go            # Route registration
    migrations/              # golang-migrate SQL files
    tests/
      ventas_test.go
      inventario_test.go
      caja_test.go
      facturacion_test.go
      proveedores_test.go
      auth_test.go
    go.mod
    go.sum
    .air.toml                # Hot reload config (dev)
    Dockerfile
  frontend/
    src/
      pages/                # POS, CierreCaja, Productos, Inventario, Proveedores, Facturacion, Usuarios, ConsultaPrecios
      components/            # SalePanel, ProductSearch, CartGrid, CashDrawer, InvoiceViewer, PriceChecker
      hooks/                 # useBarcode, useKeyboardShortcuts, useAuth
      services/              # api.ts, auth.ts
```

## Architecture Invariants

1. **ACID transactions** — every sale, stock movement, and cash operation is wrapped in a PostgreSQL transaction via GORM's `db.Transaction()` or pgx transactions. Never use application-level locking.
2. **Automatic disassembly** — when child product stock is insufficient, the system automatically disassembles one parent unit within the same transaction. Never leave stock in an inconsistent state.
3. **Immutable cash events** — cash movements are NEVER deleted or modified. Cancellations create inverse movements.
4. **Blind cash count** — the cashier declares amounts WITHOUT seeing the expected total. The system computes the difference post-declaration.
5. **Async invoicing** — sales confirm instantly; fiscal invoices (AFIP) are generated asynchronously via goroutine workers. A connectivity failure with AFIP must NEVER block a sale.
6. **Role-based access** — every endpoint is protected by JWT with role validation (cajero, supervisor, administrador) via Gin middleware.
7. **Sub-100ms sales** — product lookup and cart operations must complete in under 100ms. Use indexed barcode queries and Redis caching.

## Key Patterns

- **Handler Layer**: all HTTP concerns in `handler/`, no business logic
- **Service Layer**: all business logic in `service/`, never in handlers
- **Repository Pattern**: data access via repository layer with typed queries, injected into services
- **Dependency Injection**: via constructor functions, interfaces for testability
- **Worker Pool**: goroutine-based async task processing (replaces Celery)
- **Middleware Chain**: Gin middleware for auth, CORS, error handling, request ID, rate limiting
- **Interface-driven Design**: services depend on repository interfaces, not concrete types

## Implementation Phases

Execute tasks sequentially by phase. Each task has acceptance criteria in `especificacion.md`.

1. **Phase 1**: Scaffold, database models, migrations, auth (JWT/OAuth2), health check
2. **Phase 2**: Product CRUD, hierarchical inventory (parent/child), automatic disassembly
3. **Phase 3**: Sales module (high-speed POS), payment methods, cart logic
4. **Phase 4**: Cash management (open, close, blind count, deviation detection)
5. **Phase 5**: Invoicing (internal PDF + AFIP fiscal), async email sending
6. **Phase 6**: Supplier management, cost updates, bulk CSV import
7. **Phase 7**: Frontend — POS interface, keyboard shortcuts, barcode scanning, ESC/POS thermal printing
8. **Phase 8**: Frontend — Cash management, products, suppliers, price checker, PWA offline (Dexie.js + ServiceWorker)
9. **Phase 9**: Integration tests, cloud deployment (Traefik + SSL + Docker), E2E validation

## Commands (Once Backend Exists)

```bash
# Prerequisites (dev)
docker compose up -d postgres redis

# Backend (dev with hot reload)
cd backend && air

# Backend (manual)
cd backend && go run cmd/server/main.go

# Frontend
cd frontend && npm install && npm run dev

# Tests
cd backend && go test ./...
cd backend && go test ./tests/ventas_test.go -v       # single test file
cd backend && go test ./tests/ -run TestName -v        # single test

# Migrations
cd backend && migrate -path migrations -database "$DATABASE_URL" up
cd backend && migrate -path migrations -database "$DATABASE_URL" down 1
cd backend && migrate create -ext sql -dir migrations -seq description

# Lint & Format
cd backend && golangci-lint run ./...
cd backend && gofmt -w .

# Build
cd backend && go build -o blendpos cmd/server/main.go

# Production deploy (cloud VM)
docker compose -f docker-compose.prod.yml up -d

# Production logs
docker compose -f docker-compose.prod.yml logs -f backend
```

## Security Rules

- Use `bcrypt` for password hashing (cost 12) via `golang.org/x/crypto/bcrypt` — never store plaintext
- Validate JWT on every request via Gin middleware — check expiration, role, and point-of-sale
- No `reflect`-based deserialization of untrusted data, no `os/exec` with user input
- Validate MIME type on CSV upload — reject non-CSV files
- Use parameterized queries via GORM/pgx — never raw SQL string interpolation
- AFIP certificates stored as environment variables or mounted secrets, never in code
- Never expose stack traces in API responses — use global error handler middleware
- CSRF protection on frontend — SameSite cookies for session tokens
- Rate-limit login attempts — max 5 per minute per IP via middleware
