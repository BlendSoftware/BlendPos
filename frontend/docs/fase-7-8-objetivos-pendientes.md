# Objetivos pendientes — Fase 7 y Fase 8

Fecha: 2026-02-19

Este documento lista objetivos **faltantes o incompletos** respecto a `especificacion.md` (Fases 7/8, Features 09/10) y `arquitectura.md` (Local-First / Offline).

---

## Fase 7 — Frontend POS (T-7.1 / Feature 09)

### AC-09.4 — Hotkeys según mapeo del spec (resuelto)

- **F3** aplica descuento al ítem seleccionado (y **Delete** elimina).
  - Evidencia: `src/pages/PosTerminal.tsx`, `src/components/pos/HotkeysFooter.tsx`.

### AC-09.5 — Pago “por método” / pago mixto (resuelto)

- Se agregó opción **Mixto** con desglose (débito/crédito/QR + efectivo), validación y vuelto solo sobre efectivo.
- Se persiste y se muestra el desglose en historial (y se imprime en ticket).
  - Evidencia: `src/components/pos/PaymentModal.tsx`, `src/store/useSaleStore.ts`, `src/components/pos/SaleHistoryModal.tsx`, `src/services/ThermalPrinterService.ts`.

### AC-09.6 — Impresión térmica completa (pendiente parcial)

- Hoy se implementa ESC/POS binario + corte parcial.
- Se agregó impresión del desglose de pagos para **Mixto**.
- Falta (si se considera parte del DoD del spec):
  - impresión de logotipo,
  - apertura de cajón (kick drawer),
  - parametrización de ancho/encoding por modelo de impresora,
  - manejo de reconexión/puertos previamente autorizados (`navigator.serial.getPorts`).
  - Evidencia: `src/services/ThermalPrinterService.ts`.

### Persistencia local del POS (resuelto)

- Historial de ventas y contador de tickets ahora persisten al refrescar (con retención limitada).
  - Evidencia: `src/store/useSaleStore.ts`.

---

## Fase 8 — Frontend Administración (T-8.1 / Feature 10)

### Protección por roles (pendiente parcial)

- El layout `/admin/*` está protegido solo por autenticación; la mayoría de páginas no exigen rol.
- Falta:
  - definir roles mínimos por página (ej: productos/inventario/proveedores/facturación/admin-only, etc.),
  - proteger rutas (no solo ocultar en menú).
  - Evidencia: `src/App.tsx`, `src/components/auth/ProtectedRoute.tsx`, `src/layouts/AdminLayout.tsx`.

Estado actual:

- Se endureció RBAC a nivel de rutas: `/admin/*` requiere rol `admin` o `supervisor`.
  - Evidencia: `src/App.tsx`, `src/components/auth/ProtectedRoute.tsx`.

### Reemplazo de mocks por API real (pendiente)

- Hoy las páginas operan con `MOCK_*`.
- Falta integrar:
  - capa `services/api` (clientes, interceptores, manejo de token),
  - DTOs y contratos alineados a backend (`/v1/...`),
  - estados de loading/error/retry.

Estado actual:

- Se agregó una base mínima `src/services/api/http.ts` y `src/services/api/sales.ts` para sync offline.
- Aún falta migrar páginas admin (productos/proveedores/etc.) a una API real.

---

## Offline / PWA (pendiente crítico según arquitectura)

La arquitectura define como objetivo central:

- IndexedDB como base local (Dexie.js)
- SyncQueue persistente
- SyncEngine (ServiceWorker) que sincroniza ventas cuando vuelve la conectividad
- Estrategia explícita de conflictos (con rediseño en Fase 8)

### Estado actual

- Existe PWA (manifest + SW generado) via `vite-plugin-pwa`.
- Existe DB local (Dexie) con tablas mínimas: `products`, `sales`, `sync_queue`.
- Se encolan ventas confirmadas en `sync_queue` y se intenta sincronizar al volver `online`.
- Hay UX mínimo de estado de sync (badge con pendientes/errores) sin bloquear ventas.

Evidencia:

- `vite.config.ts`, `src/pwa.ts`, `src/offline/db.ts`, `src/offline/sync.ts`, `src/hooks/useSyncStatus.ts`, `src/components/pos/PosHeader.tsx`.

### Objetivos concretos faltantes

1. Completar estrategia de cache (catálogo/productos) y sincronización real bidireccional.
2. Endurecer SyncEngine:
  - backoff real,
  - manejo de fallos por item (parcial),
  - ejecución en Service Worker si se requiere “background sync”.
3. Implementar reglas de mitigación de conflictos (arquitectura lo marca como deuda crítica):
  - “límites de venta virtual” por producto,
  - compensación automática por umbral,
  - escalamiento selectivo al supervisor.

---

## Riesgos si no se cierra Fase 8 offline

- No se cumple el requisito de negocio “operar sin internet” (ver historia US-07 / requisitos).
- Riesgo de pérdida de ventas ante cortes de red.
- Riesgo de inconsistencias de stock si se implementa offline sin estrategia de conflicto.
