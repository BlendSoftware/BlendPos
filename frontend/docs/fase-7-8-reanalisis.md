# Re-análisis — Fase 7 y Fase 8 (post-implementación)

Fecha: 2026-02-19

Este documento re-evalúa el estado del frontend (`PoS/frontend`) contra los objetivos de Fase 7/8 después de cerrar los gaps priorizados.

---

## Fase 7 — POS (Feature 09)

### Hotkeys (AC-09.4)

- Se alineó el mapeo clave del spec: **F3** aplica descuento al ítem seleccionado (en vez de eliminar).
- **Delete** queda como atajo para eliminar el ítem seleccionado.

Evidencia:

- `src/pages/PosTerminal.tsx`
- `src/components/pos/HotkeysFooter.tsx`
- `src/components/pos/SalesTable.tsx`

### Descuentos por ítem vs global

- El modal de descuento ahora soporta:
  - descuento global (F8)
  - descuento por ítem (F3 sobre la fila seleccionada)

Evidencia:

- `src/components/pos/DiscountModal.tsx`
- `src/store/useSaleStore.ts`

### Pago mixto (AC-09.5)

- Se implementó el método **Mixto** con:
  - importes por método (débito/crédito/QR + efectivo)
  - validaciones
  - vuelto calculado **solo** sobre el efectivo
  - persistencia y visualización del desglose

Evidencia:

- `src/components/pos/PaymentModal.tsx`
- `src/components/pos/SaleHistoryModal.tsx`
- `src/store/useSaleStore.ts`

### Persistencia local del POS

- `historial` y `ticketCounter` persisten ante refresh (con retención limitada).

Evidencia:

- `src/store/useSaleStore.ts`

### Impresión térmica (AC-09.6)

- Se agregó impresión del desglose cuando la venta es **Mixto**.
- Aún no está completo respecto a lo pedido por la arquitectura/spec (logo, kick drawer, reconexión con puertos autorizados, etc.).

Evidencia:

- `src/services/ThermalPrinterService.ts`

---

## Fase 8 — Admin (Feature 10)

### RBAC (protección por roles)

- Se endureció el acceso a `/admin/*`: ahora requiere rol `admin` o `supervisor`.

Evidencia:

- `src/App.tsx`
- `src/components/auth/ProtectedRoute.tsx`

### API real (mocks)

- Las pantallas admin continúan usando mocks.
- Se agregó una base mínima de cliente HTTP en `src/services/api/*` (usado por la cola de sync offline), pero falta migrar los módulos admin.

Evidencia:

- `src/services/api/http.ts`

---

## Offline / PWA (arquitectura local-first)

### Estado actual (implementado)

- PWA habilitada con `vite-plugin-pwa` (manifest + Service Worker generado por build).
- Dexie/IndexedDB incorporado con tablas mínimas (`products`, `sales`, `sync_queue`).
- Al confirmar una venta:
  - se guarda localmente,
  - se encola en `sync_queue`,
  - se intenta sincronizar cuando hay conectividad.
- UX mínimo de sync: badge de pendientes/errores en el header del POS.

Evidencia:

- `vite.config.ts`
- `src/pwa.ts`, `src/vite-env.d.ts`
- `src/offline/db.ts`, `src/offline/sync.ts`
- `src/hooks/useSyncStatus.ts`
- `src/components/pos/PosHeader.tsx`

### Qué sigue faltando (para cerrar “offline real”)

- Sincronización real contra backend (endpoints + auth + errores por item).
  - Actualmente se intenta `POST /v1/ventas/sync-batch` (configurable vía `VITE_API_URL`).
- SyncEngine más robusto (backoff real, ejecución en Service Worker si se requiere background sync).
- Estrategia de conflictos (límites de venta virtual, compensaciones, escalamiento), marcada como deuda crítica en la arquitectura.
- Sincronización/caché de catálogo y stock (no solo ventas).

---

## Conclusión

- Los gaps más visibles de POS (F3 descuento por ítem, pago mixto, persistencia) quedaron implementados.
- El mayor pendiente para considerar “Fase 8 offline cerrada” sigue siendo: **sync real + conflictos + catálogo/stock offline** y, en paralelo, completar impresión térmica avanzada.
