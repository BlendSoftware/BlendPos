# Análisis Fase 7 y Fase 8 — Estado actual vs Especificación

Fecha: 2026-02-19

## Fuentes (documentos base)

- `BlendPos/Go/especificacion.md`
  - **Fase 7**: T-7.1 (Frontend POS)
  - **Fase 8**: T-8.1 (Frontend Administración)
  - **Feature 09**: Frontend POS (AC-09.1 a AC-09.6)
  - **Feature 10**: Frontend Administración (AC-10.1 a AC-10.6)
- `BlendPos/Go/arquitectura.md`
  - Sección **2.4 Arquitectura Local-First (Offline-Capable)**: IndexedDB/Dexie + SyncQueue + SyncEngine (ServiceWorker)
  - Nota de **deuda técnica crítica**: rediseñar resolución de conflictos en **Fase 8**.

## Contexto del repositorio auditado

Este análisis se basa en el frontend ubicado en:

- `PoS/frontend/` (React + Vite + TypeScript)

### Observación de divergencia de stack

Los docs de arquitectura mencionan **TailwindCSS + ShadcnUI** para frontend, pero este repo usa **Mantine** (core/modals/notifications/charts). Esto no es “malo”, pero sí es una **desviación** respecto a los documentos, y debe quedar explicitado porque impacta consistencia, componentes y guías de UI.

---

# Fase 7 — Frontend POS (T-7.1 / Feature 09)

## Qué pide la especificación (resumen operativo)

- Campo de búsqueda con foco automático.
- Agregado inmediato por barcode (flujo “scanner”).
- Búsqueda por nombre con autocompletado.
- Atajos de teclado (F2, F3, F10, Escape, ↑↓, +/-, Delete).
- Panel de pago con cálculo de vuelto en tiempo real.
- Impresión térmica directa **ESC/POS** (sin diálogo del sistema), con formateo y corte (y menciona logo/apertura de cajón como parte del criterio).

## Estado actual en el código (evidencia)

### POS core (pantalla + carrito)

- Implementado un terminal POS completo con:
  - input “scanner” (barcode/nombre),
  - carrito con tabla editable,
  - panel de totales,
  - modales de cobro, descuento, consulta de precio y historial.

Archivos principales:

- `src/pages/PosTerminal.tsx`
- `src/store/useSaleStore.ts`
- `src/components/pos/SalesTable.tsx`
- `src/components/pos/TotalPanel.tsx`

### Foco automático / “sticky focus”

- Implementado con `usePosFocus` (recupera foco al scanner luego de inactividad y al cerrar modales).

Evidencia:

- `src/hooks/usePosFocus.ts`

### Búsqueda por nombre con autocompletado

- Existe overlay de búsqueda con navegación por teclado y selección.

Evidencia:

- `src/components/pos/ProductSearch.tsx`

### Atajos de teclado

- Existe un listener global (`window`) para hotkeys.
- Incluye: F2 (buscar), F10 (cobrar), Escape (cerrar/cancelar), ↑↓ (navegar items), Delete (eliminar), +/- (cantidad).
- También hay hotkeys adicionales (F5, F7, F8) que no están en la tabla de AC-09.4.

Evidencia:

- `src/pages/PosTerminal.tsx`

**Gap importante:**
- La especificación indica **F3 = aplicar descuento al ítem seleccionado**, pero el comportamiento actual asigna **F3 a eliminar ítem** (y el descuento global se abre con **F8**). Esto deja AC-09.4 **parcial** (cumple hotkeys, pero no el mapeo exacto del spec).

### Pago + vuelto

- Hay `PaymentModal` con selección de método y, si es efectivo, monto recibido y cálculo de vuelto.

Evidencia:

- `src/components/pos/PaymentModal.tsx`

**Gap importante:**
- AC-09.5 habla de “campos para cada método” (interpretación típica: soportar varios campos/métodos, y/o pago mixto). Actualmente el modal funciona por **un método a la vez** (select). Si el alcance real incluye pago mixto, esto queda **pendiente**.

### Impresión térmica ESC/POS

- Existe `ThermalPrinterService` con:
  - conexión por Web Serial API,
  - construcción de buffer ESC/POS binario,
  - envío de bytes sin abrir diálogo del SO,
  - corte parcial (`GS V 1`),
  - fallback a consola.

Evidencia:

- `src/services/ThermalPrinterService.ts`
- Conexión desde UI: `src/components/pos/PosHeader.tsx`

**Gap / parcial:**
- La especificación menciona logo + apertura de cajón + corte. Hoy se implementa **corte** y el formateo, pero no se evidencia apertura de cajón ni impresión de logo.

### Persistencia y operación offline (Fase 7)

- No hay IndexedDB/Dexie ni cola de sync para ventas.
- El estado del POS (carrito/historial) está en memoria (Zustand sin persist), por lo que un refresh pierde el contexto.

---

# Fase 8 — Frontend Administración (T-8.1 / Feature 10)

## Qué pide la especificación (resumen operativo)

- Páginas:
  - Cierre de caja (arqueo ciego)
  - Productos
  - Inventario (padre/hijo, desarmes manuales, alertas)
  - Proveedores (CRUD, masivo con preview, import CSV)
  - Facturación (historial, filtros, descarga PDF)
  - Usuarios
  - Consulta de precios (modo público sin autenticación)
- Protección por roles.

## Estado actual en el código (evidencia)

### Routing + Layout

- Admin layout con sidebar + outlet.
- Rutas admin creadas.

Evidencia:

- `src/App.tsx`
- `src/layouts/AdminLayout.tsx`

### Login / auth

- Auth implementada como **mock** (usuarios demo) con persist en localStorage.

Evidencia:

- `src/store/useAuthStore.ts`
- `src/components/auth/ProtectedRoute.tsx`

### Páginas admin existentes

- Dashboard con KPIs + charts: `src/pages/admin/DashboardPage.tsx`
- Productos: `src/pages/admin/GestionProductosPage.tsx`
- Inventario (alertas + desarme + movimientos + ajustes): `src/pages/admin/InventarioPage.tsx`
- Proveedores (CRUD + preview CSV): `src/pages/admin/ProveedoresPage.tsx`
- Facturación (historial + filtros + acciones simuladas): `src/pages/admin/FacturacionPage.tsx`
- Cierre de Caja (arqueo ciego + historial): `src/pages/admin/CierreCajaPage.tsx`
- Usuarios: `src/pages/admin/UsuariosPage.tsx`
- Consulta de Precios (pública): `src/pages/admin/ConsultaPreciosPage.tsx`

**Conclusión:** la parte “pantallas” de T-8.1 está, en gran medida, implementada a nivel UI.

### Protección por roles

- `ProtectedRoute` soporta `roles`, pero en `App.tsx`:
  - el `/admin/*` base está protegido solo por autenticación (no por rol),
  - solo la ruta `/admin/usuarios` exige roles `admin|supervisor`.

Esto implica que un usuario con rol `cajero` puede navegar manualmente a varias rutas admin (aunque el menú las oculte). Según Feature 10 / T-8.1, la “protección por roles” queda **parcial**.

---

# Offline / PWA (deuda explícita para Fase 8 en arquitectura)

La arquitectura define un enfoque **Local-First**:

- Catálogo local en IndexedDB (Dexie.js)
- Ventas guardadas localmente + SyncQueue persistente
- SyncEngine (ServiceWorker/background) que sincroniza `POST /v1/ventas/sync-batch`
- Manejo de conflictos (actualmente manual; en Fase 8 se pide rediseño con reglas/umbrales)

## Estado actual

- No hay evidencias de PWA:
  - `vite.config.ts` sin plugin PWA
  - `index.html` sin `manifest` ni registro de SW
- No hay Dexie/IndexedDB en dependencias.
- Hay solo un indicador de conectividad (badge Conectado/Sin conexión).

Evidencia:

- `vite.config.ts`
- `index.html`
- `src/components/pos/PosHeader.tsx`

**Conclusión:** el “offline real” (PWA + IndexedDB + sync) sigue **pendiente**.

---

# Recomendación de cierre de Fase 7/8 (orden de trabajo)

1. Alinear “Definition of Done” de Fase 7 con spec: hotkeys (F3 descuento), pago (¿mixto?), impresión (cajón/logo si aplica).
2. Endurecer RBAC en rutas admin (no solo en el menú).
3. Implementar PWA + Dexie + SyncQueue (offline-first) como entrega principal de Fase 8 según arquitectura.
4. Reemplazar mocks por API real (cuando exista backend) usando un `services/api.ts` y manejo de errores consistente.
