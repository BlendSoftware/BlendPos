# Requirements — BlendPOS

> Documento de requisitos completo del sistema BlendPOS
> Formato: EARS (Easy Approach to Requirements Syntax) para requisitos funcionales
> Version: 1.0.0 | Fecha: 2026-02-11

---

## Indice

1. [Historias de Usuario](#1-historias-de-usuario)
2. [Requisitos Funcionales (EARS)](#2-requisitos-funcionales-ears)
3. [Requisitos No Funcionales](#3-requisitos-no-funcionales)
4. [Dependencias](#4-dependencias)
5. [Restricciones](#5-restricciones)
6. [Alcance del MVP](#6-alcance-del-mvp)
7. [Supuestos](#7-supuestos)
8. [Preguntas Abiertas](#8-preguntas-abiertas)
9. [Matriz de Trazabilidad](#9-matriz-de-trazabilidad)

---

# 1. Historias de Usuario

## HU-01: Cajero registra venta de alta velocidad

**Como** cajero del kiosco, 
**quiero** escanear productos con el lector de codigos de barras y registrar la venta en menos de 100ms por item, 
**para** despachar clientes rapidamente en horas de alta demanda.

**Criterios de aceptacion:**
- El sistema reconoce el producto por codigo de barras y lo agrega al carrito inmediatamente.
- El cajero puede modificar la cantidad con atajos de teclado.
- El sistema calcula el total en tiempo real.
- La venta se confirma con F10 y registra el movimiento de caja automaticamente.
- Si el stock es insuficiente, el sistema ejecuta desarme automatico de bultos.

## HU-02: Cajero realiza cierre de caja con arqueo ciego

**Como** cajero al finalizar mi turno,
**quiero** declarar lo que contó en caja sin ver el monto esperado por el sistema,
**para** que el sistema detecte desvios reales sin que yo pueda ajustar mi conteo.

**Criterios de aceptacion:**
- El formulario de cierre NO muestra el monto esperado durante el arqueo.
- El cajero declara monto por cada metodo de pago (efectivo, debito, credito, transferencia).
- Al confirmar, el sistema calcula la diferencia y muestra el desvio.
- Desvios mayores al 5% requieren justificacion del supervisor.

## HU-03: Administrador actualiza precios masivamente

**Como** administrador del negocio,
**quiero** seleccionar un proveedor y aplicar un incremento porcentual a todos sus productos,
**para** actualizar precios rapidamente cuando llega una lista de precios nueva.

**Criterios de aceptacion:**
- El sistema muestra una vista previa con precios actuales vs nuevos precios antes de confirmar.
- La actualizacion se aplica en una sola operacion para todos los productos del proveedor.
- El sistema registra la fecha, el porcentaje y el usuario que realizo la actualizacion.

## HU-04: Administrador importa catalogo CSV

**Como** administrador del negocio,
**quiero** cargar un archivo CSV con el catalogo de productos de un proveedor,
**para** dar de alta o actualizar multiples productos en una sola operacion.

**Criterios de aceptacion:**
- El sistema valida cada fila del CSV (formato, campos obligatorios, coherencia de datos).
- Las filas validas se procesan mediante upsert (crear si no existe, actualizar si existe por barcode).
- Las filas invalidas se reportan con numero de fila y motivo del error.
- El sistema muestra un resumen: total de filas, procesadas exitosamente, errores.

## HU-05: Cajero consulta precios rapidamente

**Como** cajero o como terminal de autoconsulta,
**quiero** escanear un producto y ver solo su precio y stock disponible,
**para** responder consultas de clientes sin afectar el flujo de ventas.

**Criterios de aceptacion:**
- El modo de consulta no requiere sesion de caja activa.
- No se registran movimientos ni se modifica stock.
- Se muestra nombre, precio de venta y stock disponible.

## HU-06: Sistema genera facturacion fiscal automatica

**Como** dueño del negocio,
**quiero** que las ventas generen comprobantes fiscales automaticamente via AFIP,
**para** cumplir con las obligaciones tributarias sin demoras en la operacion.

**Criterios de aceptacion:**
- La venta se confirma inmediatamente, sin esperar respuesta de AFIP.
- La facturacion se procesa asincronamente en segundo plano.
- Si AFIP no responde, el sistema reintenta automaticamente con backoff.
- El comprobante emitido incluye CAE, vencimiento y datos fiscales completos.

## HU-07: Administrador gestiona inventario jerarquico

**Como** administrador del negocio,
**quiero** definir que una caja de 12 unidades (producto padre) se desglose automaticamente en unidades individuales (producto hijo),
**para** que el stock de unidades se actualice automaticamente al vender.

**Criterios de aceptacion:**
- Puedo vincular un producto padre con un producto hijo indicando cuantas unidades contiene.
- Cuando el stock del hijo se agota, el sistema automaticamente abre un padre.
- El desarme decrementa 1 padre y acredita N unidades al hijo en una sola transaccion.
- La operacion es atomica: si falla, no se modifica ningun stock.

---

# 2. Requisitos Funcionales (EARS)

> Formato EARS:
> - **Ubiquitous**: "The system shall [accion]"
> - **Event-driven**: "When [evento], the system shall [accion]"
> - **State-driven**: "While [estado], the system shall [accion]"
> - **Optional**: "Where [condicion], the system shall [accion]"

## RF-GEN: Generales

**RF-GEN-01** (Ubiquitous): The system shall expose a REST API with JSON responses, validated by Pydantic V2 schemas for both request and response bodies.

**RF-GEN-02** (Ubiquitous): The system shall implement a global exception handler that returns consistent error responses with `{detail, code, timestamp}` and never exposes internal stack traces.

**RF-GEN-03** (Ubiquitous): The system shall provide a health check endpoint at `GET /health` that verifies connectivity with PostgreSQL and Redis.

## RF-AUTH: Autenticacion y Autorizacion

**RF-AUTH-01** (Event-driven): When a user submits valid credentials to `POST /v1/auth/login`, the system shall return a JWT access token (8h expiration) and a refresh token (24h expiration).

**RF-AUTH-02** (Event-driven): When a request arrives with an expired or invalid JWT, the system shall return HTTP 401 with `{detail: "Token invalido o expirado"}`.

**RF-AUTH-03** (State-driven): While a user is authenticated, the system shall include `user_id`, `rol`, and `punto_de_venta` in the JWT payload.

**RF-AUTH-04** (Event-driven): When a user with insufficient role attempts a protected operation, the system shall return HTTP 403 with `{detail: "Permisos insuficientes"}`.

**RF-AUTH-05** (Event-driven): When a user submits `POST /v1/auth/refresh` with a valid refresh token, the system shall return a new access token.

**RF-AUTH-06** (Ubiquitous): The system shall hash all passwords with bcrypt (cost factor 12) before storing.

## RF-PROD: Productos

**RF-PROD-01** (Event-driven): When a `POST /v1/productos` request is received with valid product data, the system shall create the product and return it with HTTP 201.

**RF-PROD-02** (Event-driven): When a `GET /v1/productos?barcode={code}` request is received, the system shall return the product matching the barcode in less than 50ms.

**RF-PROD-03** (Event-driven): When a `GET /v1/productos?q={term}` request is received, the system shall return products whose name matches the search term using trigram similarity, with pagination.

**RF-PROD-04** (Event-driven): When a `PUT /v1/productos/{id}` request is received, the system shall update the product fields and recalculate the margin percentage.

**RF-PROD-05** (Event-driven): When a `DELETE /v1/productos/{id}` request is received, the system shall soft-delete the product (set `activo = false`), never hard-delete.

**RF-PROD-06** (Ubiquitous): The system shall calculate `margen_pct` as `((precio_venta - precio_costo) / precio_costo) * 100` on every update.

## RF-INV: Inventario Jerarquico

**RF-INV-01** (Event-driven): When a `POST /v1/inventario/vincular` request is received with parent_id, child_id and units_per_parent, the system shall create the parent-child relationship.

**RF-INV-02** (Event-driven): When child stock is insufficient for a sale AND the parent has stock > 0 AND automatic disassembly is enabled, the system shall deduct 1 from parent stock and add `units_per_parent` to child stock within the same database transaction.

**RF-INV-03** (Event-driven): When child stock is insufficient AND parent stock is 0, the system shall reject the sale with HTTP 400 and `{detail: "Stock insuficiente para {producto}"}`.

**RF-INV-04** (Ubiquitous): The system shall guarantee that disassembly operations are ACID-compliant — either all stock changes succeed or none are applied.

**RF-INV-05** (State-driven): While a product's stock_actual falls below its stock_minimo, the system shall flag the product with a low-stock alert in queries.

## RF-VEN: Ventas

**RF-VEN-01** (Event-driven): When a `POST /v1/ventas` request is received with a valid list of items and payments, the system shall atomically: create the sale record, decrement stock for each item (with automatic disassembly if needed), and register cash movements for each payment method.

**RF-VEN-02** (Ubiquitous): The system shall complete item registration (barcode lookup + stock validation) in less than 100ms.

**RF-VEN-03** (Event-driven): When a sale includes an `efectivo` payment method, the system shall calculate change as `monto_pagado - total`.

**RF-VEN-04** (Event-driven): When a sale includes multiple payment methods, the system shall validate that the sum of payments equals or exceeds the sale total.

**RF-VEN-05** (Event-driven): When a `DELETE /v1/ventas/{id}` request is received by a supervisor, the system shall mark the sale as `anulada`, restore stock for each item, and create inverse cash movements.

**RF-VEN-06** (State-driven): While no cash session is active for the point of sale, the system shall reject sale requests with HTTP 400 and `{detail: "No hay caja abierta"}`.

**RF-VEN-07** (Event-driven): When a sale is completed successfully, the system shall enqueue a Celery task for invoice generation.

## RF-CAJA: Caja y Tesoreria

**RF-CAJA-01** (Event-driven): When a `POST /v1/caja/abrir` request is received with `punto_de_venta` and `monto_inicial`, the system shall create a new cash session in state `abierta`.

**RF-CAJA-02** (State-driven): While a cash session is open, every sale, manual income, manual expense, and cancellation shall create an immutable `MovimientoCaja` record.

**RF-CAJA-03** (Event-driven): When a `POST /v1/caja/arqueo` request is received with the cashier's declared amounts, the system shall: store the declaration, calculate expected amounts from cash movements, compute the deviation, classify by threshold (<=1% normal, 1-5% warning, >5% critical), and set the session state to `cerrada`.

**RF-CAJA-04** (Optional): Where the deviation exceeds 5%, the system shall require a supervisor justification before closing the session.

**RF-CAJA-05** (Ubiquitous): The system shall NEVER delete or modify a MovimientoCaja record. Cancellations create inverse movements.

**RF-CAJA-06** (Event-driven): When a `GET /v1/caja/{id}/reporte` request is received, the system shall return a complete report with: opening amount, breakdown by payment method, all movements, expected amount, declared amount, deviation, and observations.

## RF-FAC: Facturacion

**RF-FAC-01** (Event-driven): When the invoice Celery task runs for a sale that requires a fiscal invoice, the system shall: authenticate with AFIP WSAA, request a CAE from WSFEV1, store the CAE and expiration, update the invoice status to `emitido`.

**RF-FAC-02** (Event-driven): When the AFIP request fails, the system shall retry with exponential backoff (max 3 retries) and set status to `error` if all retries fail.

**RF-FAC-03** (Event-driven): When the invoice Celery task runs for a sale that requires an internal ticket, the system shall generate a PDF with ReportLab including: business header, items detail, totals, payment method, and optionally a QR code.

**RF-FAC-04** (Optional): Where the customer provided an email, the system shall enqueue an email task to send the PDF as attachment via SMTP.

**RF-FAC-05** (Ubiquitous): The system shall NEVER block a sale waiting for AFIP response. Invoice generation is always asynchronous.

## RF-PROV: Proveedores y Costos

**RF-PROV-01** (Event-driven): When a `POST /v1/proveedores` request is received, the system shall create the supplier record.

**RF-PROV-02** (Event-driven): When a `POST /v1/proveedores/{id}/precios/masivo` request is received with a percentage, the system shall update the cost price of all associated products and optionally recalculate sale prices using the configured margin.

**RF-PROV-03** (Event-driven): When a `POST /v1/csv/import` request is received with a valid CSV file and supplier_id, the system shall: validate MIME type, parse each row, validate data, upsert valid products by barcode, and return a summary with total, successful, and error counts.

**RF-PROV-04** (Ubiquitous): The CSV format shall include columns: `codigo_barras, nombre, precio_costo, precio_venta, unidades_por_bulto, categoria`.

## RF-CON: Consulta de Precios

**RF-CON-01** (Event-driven): When a `GET /v1/precio/{barcode}` request is received, the system shall return `{nombre, precio_venta, stock_disponible, promocion}` without requiring authentication.

**RF-CON-02** (Ubiquitous): The price check endpoint shall NOT register any cash movement, stock change, or audit event.

## RF-USR: Usuarios

**RF-USR-01** (Event-driven): When a `POST /v1/usuarios` request is received by an admin, the system shall create the user with the specified role and optional point of sale assignment.

**RF-USR-02** (Ubiquitous): The system shall enforce three roles: `cajero` (sales, own cash session), `supervisor` (cajero + authorize cancellations, close others' sessions, justify deviations), `administrador` (all operations).

---

# 3. Requisitos No Funcionales

## RNF-REND: Rendimiento

**RNF-REND-01**: Product lookup by barcode shall complete in < 50ms (P95).

**RNF-REND-02**: Complete item registration (lookup + stock validation + cart update) shall complete in < 100ms (P95).

**RNF-REND-03**: Cash session closing (deviation calculation) shall complete in < 2 seconds.

**RNF-REND-04**: CSV import of 1000 rows shall complete in < 30 seconds.

**RNF-REND-05**: AFIP invoice generation (asynchronous) shall complete in < 10 seconds (P95).

## RNF-DISP: Disponibilidad

**RNF-DISP-01**: The POS system (backend + database) shall maintain 99.5% uptime during business hours.

**RNF-DISP-02**: The sales module shall remain functional even if Redis, Celery, or AFIP are unavailable. Degraded mode shall queue invoices for later processing and disable caching without affecting core sales.

**RNF-DISP-03**: Database backups shall be performed daily with a retention of 30 days.

**RNF-DISP-04**: The POS frontend shall remain fully operational during internet outages. Sales shall be stored locally in IndexedDB and synchronized automatically when connectivity is restored.

**RNF-DISP-05**: The PWA shall be installable from Chrome/Edge and shall load without network connectivity after initial installation.

## RNF-SEG: Seguridad

**RNF-SEG-01**: All passwords shall be hashed with bcrypt cost factor >= 12.

**RNF-SEG-02**: JWT tokens shall expire after 8 hours (access) and 24 hours (refresh).

**RNF-SEG-03**: Login attempts shall be rate-limited to 5 per minute per IP.

**RNF-SEG-04**: AFIP certificates and private keys shall be stored as environment variables or mounted secrets, never in version control.

**RNF-SEG-05**: API error responses shall never expose stack traces, file paths, or SQL queries.

**RNF-SEG-06**: File uploads (CSV) shall validate MIME type and reject non-CSV files.

**RNF-SEG-07**: The system shall use parameterized queries exclusively — no raw SQL string interpolation.

## RNF-ESC: Escalabilidad

**RNF-ESC-01**: The system shall support at least 5 concurrent cash sessions (points of sale) without performance degradation.

**RNF-ESC-02**: The product catalog shall support at least 50,000 active products with search latency < 200ms.

**RNF-ESC-03**: Celery workers shall be horizontally scalable to process invoicing spikes.

## RNF-MAN: Mantenibilidad

**RNF-MAN-01**: Database schema changes shall be managed exclusively through Alembic migrations with descriptive names.

**RNF-MAN-02**: Code shall pass Ruff linting and formatting checks before merge.

**RNF-MAN-03**: All business logic services shall have > 80% test coverage.

**RNF-MAN-04**: Configuration shall be managed exclusively through environment variables, never hard-coded.

## RNF-OBS: Observabilidad

**RNF-OBS-01**: Each HTTP request shall generate a unique `request_id` propagated to all log entries.

**RNF-OBS-02**: Critical operations (sales, disassembly, cash closing, AFIP requests) shall log start and completion events.

**RNF-OBS-03**: The health check endpoint shall report database and Redis connectivity status.

## RNF-PORT: Portabilidad

**RNF-PORT-01**: The production system shall be deployable via `docker compose -f docker-compose.prod.yml up -d` on a cloud VM (Digital Ocean Droplet or equivalent).

**RNF-PORT-02**: All environment-specific configuration shall be externalized to `.env` files, including the client's domain, AFIP certificates, and business data.

**RNF-PORT-03**: The backend shall not depend on OS-specific libraries or paths.

**RNF-PORT-04**: The reverse proxy (Traefik) shall automatically provision and renew SSL certificates via Let's Encrypt. HTTPS is mandatory for PWA offline functionality.

**RNF-PORT-05**: The frontend shall be served as a Progressive Web App (PWA) with a valid web manifest and ServiceWorker for offline caching of assets.

---

# 4. Dependencias

## Dependencias Externas

| Servicio | Proposito | Criticidad | Fallback |
|----------|-----------|------------|----------|
| PostgreSQL >= 15 | Base de datos principal | Critica (sin DB no hay sistema) | Ninguno |
| Redis >= 7.0 | Cache + broker Celery | Alta (ventas funcionan sin cache, con mayor latencia) | Modo degradado: sin cache, sin async tasks |
| AFIP WSAA + WSFEV1 | Facturacion electronica | Media (ventas no dependen de AFIP) | Facturacion se encola y reintenta |
| SMTP (Gmail/custom) | Envio de emails | Baja (no afecta operacion) | Emails se encolan y reintentan |

## Dependencias de Librerias

| Libreria | Version | Proposito |
|----------|---------|-----------|
| fastapi | >= 0.110 | Framework API REST |
| pydantic | >= 2.6 | Validacion de datos |
| sqlalchemy | >= 2.0 | ORM y queries |
| alembic | >= 1.13 | Migraciones de BD |
| asyncpg | >= 0.29 | Driver PostgreSQL async |
| celery | >= 5.3 | Tareas asincronas |
| redis | >= 5.0 | Cliente Redis |
| python-jose | >= 3.3 | JWT encoding/decoding |
| passlib[bcrypt] | >= 1.7 | Hashing de passwords |
| reportlab | >= 4.0 | Generacion PDF |
| pyafipws | >= 3.0 | Integracion AFIP |
| pandas | >= 2.0 | Procesamiento CSV |
| aiosmtplib | >= 3.0 | Email asincrono |
| uvicorn | >= 0.27 | Servidor ASGI |
| ruff | >= 0.3 | Linting y formatting |
| pytest | >= 8.0 | Testing |
| httpx | >= 0.27 | Testing de API |

---

# 5. Restricciones

## Restricciones de Negocio

- **RE-01**: El sistema debe cumplir con las regulaciones fiscales de AFIP para emision de comprobantes electronicos (Facturas A, B, C; Notas de Credito).
- **RE-02**: El arqueo de caja debe ser ciego (el cajero no ve el esperado al declarar).
- **RE-03**: Los movimientos de caja son inmutables — no se pueden eliminar ni modificar.
- **RE-04**: Las anulaciones de venta solo pueden ser autorizadas por usuarios con rol supervisor o administrador.

## Restricciones Tecnicas

- **RE-05**: El backend debe ejecutarse en Python >= 3.11.
- **RE-06**: La base de datos debe ser PostgreSQL >= 15.
- **RE-07**: Todas las operaciones criticas (ventas, desarme, cierre de caja) deben ejecutarse dentro de transacciones PostgreSQL.
- **RE-08**: El despliegue debe ser reproducible via Docker Compose.
- **RE-09**: No se permite SQL crudo fuera de SQLAlchemy — todos los queries deben ser parametrizados.

---

# 6. Alcance del MVP

## Incluido en el MVP

- CRUD completo de productos con busqueda por barcode y nombre
- Inventario jerarquico con relacion padre/hijo y desarme automatico
- Modulo de ventas de alta velocidad con multiples metodos de pago
- Ciclo de vida completo de caja con arqueo ciego
- Generacion de tickets PDF internos
- Integracion asincrona con AFIP (factura electronica)
- CRUD de proveedores con actualizacion masiva de precios
- Carga masiva de productos via CSV
- Autenticacion JWT con tres roles
- Frontend POS con atajos de teclado y lectura de barcode
- Frontend de gestion (caja, productos, proveedores)
- Modo de consulta de precios aislado
- PWA con instalacion desde navegador y operacion offline (Dexie.js + ServiceWorker)
- Impresion termica ESC/POS (Web Serial API + Print Agent fallback)
- Despliegue cloud SaaS con Docker Compose + Traefik + Let's Encrypt SSL

## Excluido del MVP (Evoluciones Futuras)

- Soporte multi-sucursal
- Integracion con e-commerce
- Dashboard de reporteria avanzada (ventas por periodo, ABC de productos, margenes)
- Motor de promociones y descuentos configurables
- Programa de fidelizacion con puntos
- Pantalla digital de turno para clientes
- Integracion con balanza electronica
- App movil de gestion

---

# 7. Supuestos

- **SU-01**: El comprador accede al sistema desde un navegador moderno (Chrome >= 90 o Edge >= 90) que soporta PWA, IndexedDB y Web Serial API.
- **SU-02**: El negocio cuenta con certificado digital de AFIP vigente.
- **SU-03**: Los productos tienen codigos de barras estandar (EAN-13 o similar).
- **SU-04**: Cada cliente opera sobre un Digital Ocean Droplet (o VM equivalente) con al menos 2GB de RAM y 1 vCPU.
- **SU-05**: El dominio personalizado del cliente (ej: app.tukiosco.com) esta configurado con DNS apuntando al Droplet.
- **SU-06**: Los archivos CSV de proveedores siguen el formato estandarizado definido en RF-PROV-04.
- **SU-07**: La operacion maxima es de 5 cajas concurrentes en un unico punto de venta fisico.
- **SU-08**: El catalogo del kiosco no supera 50,000 productos (limite practico para IndexedDB en el navegador, ~50MB).

---

# 8. Preguntas Abiertas

| ID | Pregunta | Impacto | Estado |
|----|----------|---------|--------|
| PA-01 | Se requiere soporte para multiples monedas (USD/ARS)? | Afecta modelo de precios y contabilidad | Pendiente |
| PA-02 | ~~El sistema debe soportar operacion offline?~~ | ~~Requiere cache local y sincronizacion~~ | **Resuelta: SI** — Implementado via PWA + IndexedDB (Dexie.js) + SyncEngine. Ver arquitectura.md seccion 2.4. |
| PA-03 | Se integra con algun sistema contable externo? | Afecta exportacion de datos | Pendiente |
| PA-04 | Que politica de retencion de datos se aplica a ventas historicas? | Afecta modelo de datos y backups | Pendiente |
| PA-05 | ~~Se necesita soporte para impresoras termicas?~~ | ~~Requiere driver de hardware~~ | **Resuelta: SI** — ESC/POS via Web Serial API + Print Agent fallback. Ver especificacion.md AC-09.7. |
| PA-06 | Cual es el volumen diario esperado de ventas? | Dimensionamiento de infraestructura | Pendiente |
| PA-07 | Se requiere soporte para notas de credito tipo B y C ademas de tipo A? | Afecta modulo de facturacion | Pendiente |

---

# 9. Matriz de Trazabilidad

| Requisito | Historia de Usuario | Feature (Espec.) | Componente (Arq.) |
|-----------|--------------------|--------------------|---------------------|
| RF-AUTH-01 | — | F01: Auth JWT | auth_service, auth.py |
| RF-AUTH-02 | — | F01: Auth JWT | auth.py (dependency) |
| RF-PROD-01..05 | HU-03, HU-04 | F02: Productos | productos.py, modelos |
| RF-INV-01..05 | HU-07 | F03: Inventario | inventario_service.py |
| RF-VEN-01..07 | HU-01 | F04: Ventas | venta_service.py, ventas.py |
| RF-CAJA-01..06 | HU-02 | F05: Caja | caja_service.py, caja.py |
| RF-FAC-01..05 | HU-06 | F06: Facturacion | facturacion_service.py, celery tasks |
| RF-PROV-01..04 | HU-03, HU-04 | F07: Proveedores | proveedor_service.py, proveedores.py |
| RF-CON-01..02 | HU-05 | F08: Consulta Precios | consulta_precios.py |
| RF-USR-01..02 | — | F01: Auth JWT | usuarios.py, auth_service.py |
| RNF-REND-01..02 | HU-01 | F04: Ventas | Redis cache, indices BD |
| RNF-SEG-01..07 | — | F01: Auth JWT, Transversal | auth_service, global handler |
| RNF-DISP-01..03 | — | Transversal | Docker, backups |
| RNF-PORT-01..03 | — | Transversal | Docker Compose, .env |
