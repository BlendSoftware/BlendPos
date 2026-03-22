# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BlendPOS is a SaaS Point of Sale system for kiosks and pharmacies in Argentina. Offline-first PWA with AFIP fiscal invoicing, hierarchical inventory (parent/child products with automatic disassembly), blind cash counts, and ESC/POS thermal printing.

## Architecture

Three-service architecture:

- **Backend** (`backend/`): Go 1.24 + Gin REST API, layered architecture (Handler → Service → Repository → DB). GORM + pgx for PostgreSQL, Redis for job queue.
- **Frontend** (`frontend/`): React 19 + Vite + TypeScript + Mantine 8. Zustand 5 for state management. Offline-first via Dexie.js (IndexedDB). PWA with service worker.
- **AFIP Sidecar** (`afip-sidecar/`): Python FastAPI microservice for Argentine fiscal invoicing (WSAA + WSFEV1 via pyafipws). Communicates with backend via internal HTTP + shared token.

### Backend Layers

```
handler/ (HTTP, Gin)  →  service/ (business logic)  →  repository/ (GORM data access)
                                                              ↓
middleware/ (JWT, CORS, errors)    infra/ (DB, Redis, AFIP client, mailer)
                                  worker/ (goroutine pool: invoicing, email)
```

All dependencies are injected in `cmd/server/main.go` (composition root). Services depend on repository interfaces.

### Key Architectural Invariants

- **ACID transactions**: Every sale, stock movement, and cash operation uses `db.Transaction()`. No application-level locking.
- **Automatic disassembly**: When child product stock is insufficient, parent is disassembled within the same transaction.
- **Immutable cash events**: Cash movements are never deleted — cancellations create inverse movements.
- **Async invoicing**: Sales confirm instantly. AFIP invoicing happens async via worker pool → sidecar POST. AFIP failures must NEVER block sales.
- **Schema migrations only**: Never use GORM AutoMigrate. All schema changes via golang-migrate SQL files in `backend/migrations/`.

### Frontend Architecture

- Zustand stores in `src/store/`: auth, cart, sale, caja, UI, printer
- Offline DB in `src/offline/`: Dexie.js with sync queue for pending sales
- API client in `src/services/api/`
- Amounts come from backend as strings (`shopspring/decimal`) — frontend must `parseFloat()`

## Commands

### Development (Docker — recommended)

```bash
docker-compose up -d                    # All services (postgres, redis, backend, frontend, afip-sidecar)
```

### Development (local)

```bash
docker compose up -d postgres redis     # DB services only

cd backend && air                       # Backend with hot reload
cd backend && go run cmd/server/main.go # Backend manual

cd frontend && npm install && npm run dev  # Frontend (Vite HMR on :5173)
```

### Backend

```bash
cd backend
go test ./tests/... -v -cover              # All tests
go test ./tests/ventas_test.go -v          # Single test file
go test ./tests/ -run TestName -v          # Single test by name
go build -o blendpos cmd/server/main.go    # Build binary
golangci-lint run ./...                    # Lint
gofmt -w .                                # Format
```

### Frontend

```bash
cd frontend
npm run dev            # Dev server (:5173)
npm run build          # Production build
npm run lint           # ESLint + TypeScript
npm run test           # Vitest
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```

### Migrations

```bash
cd backend
migrate -path migrations -database "$DATABASE_URL" up          # Apply all
migrate -path migrations -database "$DATABASE_URL" down 1      # Rollback one
migrate create -ext sql -dir migrations -seq description       # Create new
```

### Production

```bash
docker compose -f docker-compose.prod.yml up -d    # Prod with Traefik + SSL
docker compose -f docker-compose.vps.yml up -d      # VPS deployment
```

## Environment

Three `.env` files required (see `.env.example` in each directory):
- `/.env` — Backend + Docker (DATABASE_URL, REDIS_URL, JWT_SECRET, AFIP config, SMTP)
- `/frontend/.env` — Vite (VITE_API_BASE, VITE_API_URL)
- `/afip-sidecar/.env` — Python sidecar (AFIP certs, CUIT, tokens)

Backend serves on `:8000`, frontend on `:5173`, AFIP sidecar on `:8001`.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`): test backend → lint frontend → build Docker images to GHCR → deploy to VPS via SSH. Triggers on push to master/main.

## SDD Reference Documents

Planning specs live in `Go/`:
- `especificacion.md` — Features with Given/When/Then acceptance criteria
- `arquitectura.md` — Architecture decisions (ADRs), patterns, data flows
- `requirements.md` — Functional + non-functional requirements
- `ejecucion.md` — Step-by-step execution guide
