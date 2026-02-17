# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BlendPOS: a mission-critical Point of Sale system sold as a SaaS product, designed for the high-turnover, granular-stock environment of a Kiosk/Drugstore. Deployed on a cloud VM (Digital Ocean Droplet) with Traefik + Let's Encrypt SSL, accessed by the buyer as a PWA (Progressive Web App) that works offline via IndexedDB (Dexie.js). Built on FastAPI (Python 3.11), Pydantic V2, PostgreSQL, React (Vite + TypeScript), TailwindCSS and ShadcnUI. Features Hierarchical Inventory with automatic bulk-to-unit disassembly, high-speed sales (<100ms latency), offline-first operation with background sync, cash management with blind cash counts, hybrid invoicing (AFIP fiscal + internal PDF), ESC/POS thermal printing, and JWT authentication (OAuth2).

## Methodology

This project follows **Spec-Driven Development (SDD)**. Before implementing any task:
1. Read the relevant specification in `especificacion.md` (features, contracts, acceptance criteria)
2. Read the architecture in `arquitectura.md` (layers, patterns, data flows)
3. Follow TDD: write tests first, verify they fail, then implement

## Reference Documents (Read Before Implementing)

| Document | Purpose |
|----------|---------|
| `especificacion.md` | Formal SDD spec: features with Given/When/Then criteria, data contracts, tasks in phases |
| `arquitectura.md` | Software architecture: layered (API→Service→Repository→DB), data flows, ADRs, deployment topology |
| `requirements.md` | Functional requirements (EARS format), non-functional requirements, traceability matrix |
| `proyecto.md` | Narrative prose overview of the entire system |
| `ejecucion.md` | Step-by-step execution guide with prompts for each task |
| `habilidades.md` | Recommended AI agent skills for development |

## Stack

- **Backend**: FastAPI >= 0.110, Python >= 3.11, Pydantic >= 2.6
- **Database**: PostgreSQL >= 15, SQLAlchemy >= 2.0, Alembic for migrations
- **Auth**: JWT (OAuth2), python-jose, passlib[bcrypt]
- **Async Tasks**: Celery >= 5.3, Redis >= 7.0 as broker
- **PDF Generation**: ReportLab >= 4.0
- **AFIP Integration**: pyafipws (WSAA + WSFEV1)
- **CSV Processing**: pandas >= 2.0
- **Email**: aiosmtplib for async SMTP
- **Frontend**: React >= 18, TypeScript, Vite, TailwindCSS, ShadcnUI
- **Barcode**: react-barcode-reader or Web Serial API
- **Offline DB**: Dexie.js (IndexedDB wrapper), TanStack Query Persist
- **PWA**: Vite PWA Plugin, ServiceWorker, Web App Manifest
- **Thermal Printing**: ESC/POS via Web Serial API or Print Agent (localhost:9090)
- **Reverse Proxy**: Traefik v3 + Let's Encrypt SSL

## Target Directory Structure

```
blendpos/
  backend/
    app/
      main.py                # FastAPI entry point
      settings.py            # Pydantic BaseSettings (env vars)
      api/                   # Endpoints: ventas, productos, inventario, caja, facturacion, proveedores, usuarios, consulta_precios
      core/                  # Business logic: venta_service, inventario_service, caja_service, facturacion_service, proveedor_service
      models/                # SQLAlchemy: Producto, ProductoHijo, Venta, VentaItem, SesionCaja, MovimientoCaja, Comprobante, Proveedor, Usuario
      schemas/               # Pydantic V2: request/response schemas per domain
      infra/                 # Adapters: database.py, redis.py, afip.py, smtp.py
      tasks/                 # Celery tasks: facturacion_tasks, email_tasks
    alembic/                 # Database migrations
    tests/
  frontend/
    src/
      pages/                # POS, CierreCaja, Productos, Inventario, Proveedores, Facturacion, Usuarios, ConsultaPrecios
      components/            # SalePanel, ProductSearch, CartGrid, CashDrawer, InvoiceViewer, PriceChecker
      hooks/                 # useBarcode, useKeyboardShortcuts, useAuth
      services/              # api.ts, auth.ts
```

## Architecture Invariants

1. **ACID transactions** — every sale, stock movement, and cash operation is wrapped in a PostgreSQL transaction. Never use application-level locking.
2. **Automatic disassembly** — when child product stock is insufficient, the system automatically disassembles one parent unit within the same transaction. Never leave stock in an inconsistent state.
3. **Immutable cash events** — cash movements are NEVER deleted or modified. Cancellations create inverse movements.
4. **Blind cash count** — the cashier declares amounts WITHOUT seeing the expected total. The system computes the difference post-declaration.
5. **Async invoicing** — sales confirm instantly; fiscal invoices (AFIP) are generated asynchronously via Celery. A connectivity failure with AFIP must NEVER block a sale.
6. **Role-based access** — every endpoint is protected by JWT with role validation (cajero, supervisor, administrador).
7. **Sub-100ms sales** — product lookup and cart operations must complete in under 100ms. Use indexed barcode queries and Redis caching.

## Key Patterns

- **Service Layer**: all business logic in `core/` services, never in API endpoints
- **Repository Pattern**: data access via SQLAlchemy repositories with typed queries
- **Unit of Work**: database sessions managed per-request with dependency injection
- **Factory Pattern**: Celery task creation, PDF generation, AFIP client instantiation
- **Observer Pattern**: Celery signals for post-sale events (invoice, email, stock alerts)
- **Strategy Pattern**: payment method processing, invoice type selection

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

# Backend
cd backend && uvicorn app.main:app --reload --port 8000

# Celery Worker
cd backend && celery -A app.tasks.worker worker --loglevel=info

# Frontend
cd frontend && npm install && npm run dev

# Tests
cd backend && pytest
cd backend && pytest tests/test_ventas.py -v          # single test file
cd backend && pytest tests/test_inventario.py::test_name  # single test

# Migrations
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"

# Lint
cd backend && ruff check . && ruff format --check .

# Production deploy (cloud VM)
docker compose -f docker-compose.prod.yml up -d

# Production logs
docker compose -f docker-compose.prod.yml logs -f backend
```

## Security Rules

- Use `bcrypt` for password hashing — never store plaintext
- Validate JWT on every request — check expiration, role, and point-of-sale
- No `eval()`, `exec()`, `pickle.loads()` anywhere
- Validate MIME type on CSV upload — reject non-CSV files
- Use parameterized queries via SQLAlchemy — never raw SQL strings
- AFIP certificates stored as environment variables or mounted secrets, never in code
- Never expose stack traces in API responses — use global exception handler
- CSRF protection on frontend — SameSite cookies for session tokens
- Rate-limit login attempts — max 5 per minute per IP
