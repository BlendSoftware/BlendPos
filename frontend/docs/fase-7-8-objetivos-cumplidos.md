# Objetivos cumplidos — Fase 7 y Fase 8

Fecha: 2026-02-19

Este documento lista objetivos que están **implementados y funcionales** en el frontend actual (`PoS/frontend`), tomando como referencia las tareas por fase y los criterios de aceptación de `especificacion.md`.

---

## Fase 7 — Frontend POS (T-7.1 / Feature 09)

### POS operativo (UI)

- Pantalla POS con layout completo (header + scanner + tabla de ventas + panel de totales).
  - Evidencia: `src/pages/PosTerminal.tsx`, `src/components/pos/*`, `src/pages/PosTerminal.module.css`.

### AC-09.1 — Campo de búsqueda con foco automático

- El input principal del POS inicia con foco y se mantiene “pegado” (sticky focus) tras inactividad/cierre de modales.
  - Evidencia: `src/pages/PosTerminal.tsx`, `src/hooks/usePosFocus.ts`.

### AC-09.2 — Agregado por barcode (flujo scanner)

- Al escanear/escribir y presionar Enter, se intenta lookup por barcode exacto y se agrega al carrito.
  - Evidencia: `src/pages/PosTerminal.tsx`, `src/api/mockProducts.ts`.

### AC-09.3 — Búsqueda por nombre con selección

- Overlay de búsqueda con lista de resultados y selección por teclado/mouse.
  - Evidencia: `src/components/pos/ProductSearch.tsx`.

### Parte de AC-09.4 — Navegación rápida del carrito

- Navegación por flechas ↑↓ + ajuste de cantidad (+/-) + delete.
  - Evidencia: `src/pages/PosTerminal.tsx`, `src/components/pos/SalesTable.tsx`, `src/store/useSaleStore.ts`.

### AC-09.4 — Descuento por ítem con hotkey (F3)

- **F3** abre descuento del ítem seleccionado (y **F8** descuento global).
  - Evidencia: `src/pages/PosTerminal.tsx`, `src/components/pos/DiscountModal.tsx`, `src/store/useSaleStore.ts`.

### Parte de AC-09.5 — Cobro y vuelto en efectivo

- Modal de pago con efectivo: monto recibido y cálculo de vuelto.
  - Evidencia: `src/components/pos/PaymentModal.tsx`.

### AC-09.5 — Pago mixto con desglose

- Opción **Mixto** con importes por método, validación y vuelto solo sobre efectivo.
- Se registra desglose en historial y se imprime en ticket.
  - Evidencia: `src/components/pos/PaymentModal.tsx`, `src/components/pos/SaleHistoryModal.tsx`, `src/services/ThermalPrinterService.ts`.

### Parte de AC-09.6 — Impresión térmica directa (ESC/POS)

- Servicio de impresión por Web Serial API con envío de comandos ESC/POS y corte parcial de papel.
  - Evidencia: `src/services/ThermalPrinterService.ts`, `src/components/pos/PosHeader.tsx`.

### Persistencia local del POS

- Historial de ventas y contador de tickets persisten ante refresh.
  - Evidencia: `src/store/useSaleStore.ts`.

---

## Fase 8 — Frontend Administración (T-8.1 / Feature 10)

> Nota: las páginas están implementadas con datos mock, pero el objetivo “pantallas funcionales” está cubierto.

### AC-10.1 — Cierre de caja (arqueo ciego)

- Formulario de arqueo ciego + resultado y vista de historial.
  - Evidencia: `src/pages/admin/CierreCajaPage.tsx`.

### AC-10.2 — Productos (tabla + búsqueda + crear/editar/desactivar)

- Gestión de productos con filtros y CRUD simulado.
  - Evidencia: `src/pages/admin/GestionProductosPage.tsx`.

### AC-10.3 — Inventario (padre/hijo, desarme manual, alertas)

- Alertas de stock mínimo + relaciones caja/unidad + desarme manual + movimientos y ajustes.
  - Evidencia: `src/pages/admin/InventarioPage.tsx`.

### AC-10.4 — Proveedores (CRUD + import CSV con preview)

- CRUD de proveedores + import CSV con vista previa y validación básica.
  - Evidencia: `src/pages/admin/ProveedoresPage.tsx`.

### AC-10.5 — Facturación (historial + acciones)

- Historial con filtros y acciones simuladas (reimpresión, descarga PDF, anulación con roles).
  - Evidencia: `src/pages/admin/FacturacionPage.tsx`.

### Usuarios (parte de T-8.1)

- Pantalla de usuarios con CRUD simulado y activación/desactivación.
  - Evidencia: `src/pages/admin/UsuariosPage.tsx`.

### AC-10.6 — Consulta de precios (pública)

- Pantalla pública `/consulta` con búsqueda por barcode/nombre.
  - Evidencia: `src/pages/admin/ConsultaPreciosPage.tsx`, rutas en `src/App.tsx`.

---

## Offline / PWA (base implementada)

- PWA habilitada via `vite-plugin-pwa` (manifest + SW generado).
- DB local Dexie + `sync_queue` para encolar ventas confirmadas e intentar sync cuando vuelve la conectividad.
- Indicador mínimo de estado de sync en el header del POS.
  - Evidencia: `vite.config.ts`, `src/pwa.ts`, `src/offline/*`, `src/hooks/useSyncStatus.ts`, `src/components/pos/PosHeader.tsx`.
