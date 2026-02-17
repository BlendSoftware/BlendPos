# Especificacion Formal — BlendPOS (Go)

> Este documento contiene las especificaciones formales de cada Feature del sistema,
> incluyendo criterios de aceptacion (Given/When/Then), contratos API,
> y tareas organizadas por fase.
>
> Adaptado para la implementacion en Go + Gin + GORM.

---

# Feature 01: Ventas de Alta Velocidad

## Descripcion General

El modulo de ventas permite registrar transacciones de venta de forma atomica, con latencia inferior a 100ms por item. Soporta escaneo de codigo de barras, busqueda por nombre, multiples metodos de pago y calculo automatico de vuelto. Cada venta se vincula a una sesion de caja activa y genera movimientos de caja inmutables.

## Aceptacion

### AC-01.1: Venta exitosa con barcode
> **Given** una sesion de caja abierta y un producto con stock = 10
> **When** el cajero envia `POST /v1/ventas` con 1 item (barcode: "7790001234567", cantidad: 2)
> **Then** se crea la venta, stock = 8, se registra movimiento de caja, HTTP 201

### AC-01.2: Venta sin caja abierta
> **Given** no hay sesion de caja activa para el usuario
> **When** envia `POST /v1/ventas`
> **Then** recibe HTTP 400: `{detail: "No hay sesion de caja abierta"}`

### AC-01.3: Pago mixto
> **Given** una venta con total = $2500
> **When** el cajero paga $1000 efectivo + $1500 debito
> **Then** se registran dos movimientos de caja (uno por cada metodo) y vuelto = $0

### AC-01.4: Pago insuficiente
> **Given** una venta con total = $2500
> **When** el cajero envia pagos por $2000
> **Then** recibe HTTP 400: `{detail: "El monto total de pagos es insuficiente"}`

### AC-01.5: Anulacion de venta
> **Given** una venta completada con estado = "completada"
> **When** un supervisor envia `DELETE /v1/ventas/{id}`
> **Then** el stock se restaura, se genera movimiento inverso de caja, estado = "anulada"

## Contrato API

### POST /v1/ventas

**Request:**
```json
{
  "sesion_caja_id": "UUID",
  "items": [
    {
      "producto_id": "UUID",
      "cantidad": 2,
      "descuento": 0.00
    }
  ],
  "pagos": [
    {
      "metodo": "efectivo",
      "monto": 1500.00
    },
    {
      "metodo": "debito",
      "monto": 750.00
    }
  ]
}
```

**Response 201:**
```json
{
  "id": "UUID",
  "numero_ticket": 42,
  "items": [
    {
      "producto": "Coca-Cola 354ml",
      "cantidad": 2,
      "precio_unitario": 750.00,
      "subtotal": 1500.00
    }
  ],
  "subtotal": 2250.00,
  "descuento_total": 0.00,
  "total": 2250.00,
  "pagos": [
    {"metodo": "efectivo", "monto": 1500.00},
    {"metodo": "debito", "monto": 750.00}
  ],
  "vuelto": 0.00,
  "created_at": "2026-02-11T10:30:00Z"
}
```

---

# Feature 02: Productos (CRUD)

## Descripcion General

El sistema permite crear, leer, actualizar y desactivar productos. Los productos tienen codigo de barras unico, categoria, precios de costo y venta, stock, y vinculacion opcional con proveedor.

## Aceptacion

### AC-02.1: Crear producto
> **Given** datos validos de un producto
> **When** envia `POST /v1/productos`
> **Then** se crea el producto con HTTP 201

### AC-02.2: Buscar por barcode
> **Given** un producto con barcode "7790001234567"
> **When** envia `GET /v1/productos?barcode=7790001234567`
> **Then** retorna el producto en menos de 50ms

### AC-02.3: Buscar por nombre
> **Given** 500 productos en la base de datos
> **When** envia `GET /v1/productos?nombre=coca&page=1&limit=20`
> **Then** retorna pagina 1 con max 20 resultados, filtrados por nombre

### AC-02.4: Soft-delete
> **Given** un producto con ventas asociadas
> **When** envia `DELETE /v1/productos/{id}`
> **Then** el producto se marca como activo=false, no se elimina fisicamente

## Contrato API

### POST /v1/productos

**Request:**
```json
{
  "codigo_barras": "7790001234567",
  "nombre": "Coca-Cola 354ml",
  "descripcion": "Lata individual",
  "categoria": "bebidas",
  "precio_costo": 450.00,
  "precio_venta": 750.00,
  "stock_actual": 24,
  "stock_minimo": 5,
  "unidad_medida": "unidad",
  "proveedor_id": "UUID"
}
```

### GET /v1/productos

**Query params:** `barcode`, `nombre`, `categoria`, `proveedor_id`, `page`, `limit`

---

# Feature 03: Inventario Jerarquico

## Descripcion General

El modulo de inventario gestiona la relacion padre-hijo entre productos (bultos y unidades) y el desarme automatico cuando el stock del hijo es insuficiente.

## Aceptacion

### AC-03.1: Crear vinculo padre-hijo
> **Given** un producto padre "Coca-Cola 354ml x12" y un hijo "Coca-Cola 354ml"
> **When** envia `POST /v1/inventario/vinculos` con unidades_por_padre = 12
> **Then** se crea el vinculo, el padre se marca como es_padre = true

### AC-03.2: Desarme automatico en venta
> **Given** producto hijo stock = 0, producto padre stock = 5, unidades_por_padre = 12
> **When** se vende 1 unidad del hijo
> **Then** se decrementa 1 padre (stock = 4), se acreditan 12 hijos, se vende 1 (stock = 11)

### AC-03.3: Desarme con stock padre insuficiente
> **Given** producto hijo stock = 0, producto padre stock = 0
> **When** se intenta vender 1 unidad del hijo
> **Then** recibe HTTP 400: `{detail: "Stock insuficiente para Coca-Cola 354ml"}`

### AC-03.4: Desarme manual
> **Given** un vinculo padre-hijo existente
> **When** un administrador envia `POST /v1/inventario/desarme` con padre_id y cantidad = 2
> **Then** se desarman 2 padres, se acreditan 24 hijos (dentro de transaccion ACID)

### AC-03.5: Alerta de stock minimo
> **Given** un producto con stock_actual = 4 y stock_minimo = 5
> **When** se consulta la lista de alertas
> **Then** el producto aparece en `GET /v1/inventario/alertas`

## Contrato API

### POST /v1/inventario/vinculos

**Request:**
```json
{
  "producto_padre_id": "UUID",
  "producto_hijo_id": "UUID",
  "unidades_por_padre": 12,
  "desarme_automatico": true
}
```

### POST /v1/inventario/desarme

**Request:**
```json
{
  "vinculo_id": "UUID",
  "cantidad_padres": 2
}
```

---

# Feature 04: Gestion de Caja

## Descripcion General

El modulo de caja gestiona el ciclo de vida completo: apertura, movimientos inmutables, arqueo ciego y cierre con deteccion de desvios.

## Aceptacion

### AC-04.1: Apertura de caja
> **Given** un cajero autenticado y sin caja abierta en el punto de venta 1
> **When** envia `POST /v1/caja/abrir` con monto_inicial = 5000
> **Then** se crea la sesion con estado "abierta", HTTP 201

### AC-04.2: Apertura duplicada
> **Given** ya existe una caja abierta en el punto de venta 1
> **When** intenta abrir otra caja en el mismo punto
> **Then** recibe HTTP 400: `{detail: "Ya existe una caja abierta en este punto de venta"}`

### AC-04.3: Movimiento inmutable
> **Given** una caja abierta con un ingreso de $5000
> **When** se intenta modificar el movimiento
> **Then** recibe HTTP 405: no se permite modificacion (los movimientos son eventos inmutables)

### AC-04.4: Arqueo ciego
> **Given** una caja con monto esperado calculado = $15000
> **When** el cajero envia `POST /v1/caja/arqueo` con declaracion = {efectivo: 14500, debito: 300}
> **Then** el sistema calcula desvio = declarado - esperado, SIN haber mostrado el esperado previamente

### AC-04.5: Cierre con desvio critico
> **Given** desvio > 5% del monto esperado
> **When** se cierra la caja
> **Then** el cierre requiere observaciones obligatorias del supervisor

### AC-04.6: Reporte de caja
> **Given** una caja cerrada
> **When** se consulta `GET /v1/caja/{id}/reporte`
> **Then** retorna desglose por metodo de pago, lista de movimientos, monto inicial, esperado, declarado, desvio

## Contrato API

### POST /v1/caja/abrir

**Request:**
```json
{
  "punto_de_venta": 1,
  "monto_inicial": 5000.00
}
```

### POST /v1/caja/arqueo

**Request:**
```json
{
  "sesion_caja_id": "UUID",
  "declaracion": {
    "efectivo": 14500.00,
    "debito": 3200.00,
    "credito": 1800.00,
    "transferencia": 500.00
  },
  "observaciones": "Faltante de $200 en monedas"
}
```

**Response 200:**
```json
{
  "sesion_caja_id": "UUID",
  "monto_esperado": {
    "efectivo": 14700.00,
    "debito": 3200.00,
    "credito": 1800.00,
    "transferencia": 500.00,
    "total": 20200.00
  },
  "monto_declarado": {
    "efectivo": 14500.00,
    "debito": 3200.00,
    "credito": 1800.00,
    "transferencia": 500.00,
    "total": 20000.00
  },
  "desvio": {
    "monto": -200.00,
    "porcentaje": -0.99,
    "clasificacion": "normal"
  },
  "estado": "cerrada"
}
```

---

# Feature 05: Autenticacion y Roles

## Descripcion General

El sistema implementa autenticacion JWT con tres roles: cajero, supervisor y administrador. Cada endpoint declara su nivel de acceso minimo via middleware de Gin.

## Aceptacion

### AC-05.1: Login exitoso
> **Given** credenciales validas (username + password)
> **When** envia `POST /v1/auth/login`
> **Then** recibe JWT access_token (8h) y refresh_token (24h)

### AC-05.2: Login fallido
> **Given** password incorrecta
> **When** envia `POST /v1/auth/login`
> **Then** recibe HTTP 401: `{detail: "Credenciales invalidas"}`

### AC-05.3: Acceso protegido sin token
> **Given** un endpoint protegido (ej: POST /v1/ventas)
> **When** se envia request sin Authorization header
> **Then** recibe HTTP 401

### AC-05.4: Acceso con rol insuficiente
> **Given** un cajero intenta acceder a POST /v1/productos (requiere administrador)
> **When** envia request con JWT de cajero
> **Then** recibe HTTP 403

### AC-05.5: Rate limiting
> **Given** 5 intentos de login fallidos desde la misma IP en 1 minuto
> **When** se intenta un 6to login
> **Then** recibe HTTP 429

## Contrato API

### POST /v1/auth/login

**Request:**
```json
{
  "username": "admin",
  "password": "secreto123"
}
```

**Response 200:**
```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in": 28800,
  "user": {
    "id": "UUID",
    "username": "admin",
    "nombre": "Juan Perez",
    "rol": "administrador"
  }
}
```

---

# Feature 06: Facturacion Hibrida

## Descripcion General

El sistema emite comprobantes fiscales electronicos via AFIP (facturas A, B, C) de forma asincrona, y genera comprobantes PDF internos para tickets no fiscales. La integracion con AFIP se delega a un **microservicio Sidecar en Python (FastAPI + pyafipws)**: el worker de Go envia un `POST` HTTP al Sidecar con el payload de la venta en formato JSON, y el Sidecar se encarga de la autenticacion WSAA, la solicitud de CAE a WSFEV1, y retorna el resultado. El envio por email es asincrono.

## Aceptacion

### AC-06.1: Factura fiscal exitosa
> **Given** una venta completada y configuracion AFIP valida
> **When** el worker pool procesa la factura
> **Then** se obtiene CAE de AFIP, se almacena el comprobante con estado "emitido"

### AC-06.2: AFIP no disponible
> **Given** AFIP esta caido
> **When** el worker intenta facturar
> **Then** se reintenta con backoff exponencial (max 3 reintentos), comprobante queda en estado "pendiente"

### AC-06.3: Comprobante PDF interno
> **Given** una venta que requiere ticket interno
> **When** se genera el PDF con gofpdf
> **Then** el PDF incluye logo, items, totales, metodo de pago. Se almacena en filesystem.

### AC-06.4: Descarga de PDF
> **Given** un comprobante generado
> **When** envia `GET /v1/facturacion/pdf/{id}`
> **Then** retorna el archivo PDF con Content-Type application/pdf

### AC-06.5: Envio por email
> **Given** una venta con email del cliente proporcionado
> **When** el worker pool procesa la tarea de email
> **Then** envia el PDF como adjunto al email del cliente

## Contrato API

### GET /v1/facturacion/{venta_id}

**Response 200:**
```json
{
  "id": "UUID",
  "tipo": "factura_b",
  "numero": 42,
  "punto_de_venta": 1,
  "cae": "71234567890123",
  "cae_vencimiento": "2026-02-21",
  "receptor_cuit": "20-12345678-9",
  "receptor_nombre": "CONSUMIDOR FINAL",
  "monto_neto": 1859.50,
  "monto_iva": 390.50,
  "monto_total": 2250.00,
  "estado": "emitido",
  "pdf_url": "/v1/facturacion/pdf/UUID",
  "created_at": "2026-02-11T10:31:00Z"
}
```

### Configuracion Fiscal (config.go)

```go
type AFIPConfig struct {
    CertPath          string `env:"AFIP_CERT_PATH" validate:"required"`
    KeyPath           string `env:"AFIP_KEY_PATH" validate:"required"`
    CUIT              string `env:"AFIP_CUIT" validate:"required"`
    PuntoVenta        int    `env:"AFIP_PUNTO_VENTA" validate:"required"`
    TipoContribuyente string `env:"AFIP_TIPO_CONTRIBUYENTE" validate:"required"`
    InicioActividades string `env:"AFIP_INICIO_ACTIVIDADES" validate:"required"`
    CondicionIVA      string `env:"AFIP_CONDICION_IVA" validate:"required"`
    Production        bool   `env:"AFIP_PRODUCTION" envDefault:"false"`
}
```

---

# Feature 07: Proveedores y Costos

## Descripcion General

El sistema permite gestionar proveedores con sus datos comerciales, vincular productos a proveedores, actualizar precios de costo de forma individual o masiva (por porcentaje), e importar catalogos de productos desde archivos CSV.

## Aceptacion

### AC-07.1: CRUD de proveedores
> **Given** datos validos de un proveedor
> **When** envia `POST /v1/proveedores`
> **Then** se crea el proveedor con HTTP 201

### AC-07.2: Actualizacion masiva de precios
> **Given** un proveedor con 50 productos asociados
> **When** envia `POST /v1/proveedores/{id}/precios/masivo` con porcentaje = 15
> **Then** todos los precios de costo se incrementan 15%, se muestra preview antes de confirmar

### AC-07.3: Preview de actualizacion
> **Given** un request de actualizacion masiva con `preview = true`
> **When** se procesa
> **Then** retorna lista de productos con precio actual, precio nuevo y diferencia, SIN aplicar cambios

### AC-07.4: Import CSV exitoso
> **Given** un archivo CSV valido con 100 filas
> **When** envia `POST /v1/csv/import`
> **Then** se procesan por upsert, se retorna resumen: 95 exitosas, 5 errores con detalle

### AC-07.5: Import CSV archivo invalido
> **Given** un archivo .xlsx renombrado a .csv
> **When** envia `POST /v1/csv/import`
> **Then** recibe HTTP 400: `{detail: "Formato de archivo invalido. Se esperaba CSV."}`

## Contrato API

### POST /v1/proveedores

**Request:**
```json
{
  "razon_social": "Distribuidora Norte S.A.",
  "cuit": "30-71234567-8",
  "telefono": "011-4555-1234",
  "email": "ventas@distnorte.com",
  "direccion": "Av. Corrientes 1234, CABA",
  "condicion_pago": "30 dias"
}
```

### POST /v1/proveedores/{id}/precios/masivo

**Request:**
```json
{
  "porcentaje": 15.0,
  "recalcular_venta": true,
  "margen_default": 40.0,
  "preview": false
}
```

**Response 200 (preview = true):**
```json
{
  "proveedor": "Distribuidora Norte S.A.",
  "porcentaje": 15.0,
  "productos_afectados": 50,
  "preview": [
    {
      "producto_id": "UUID",
      "nombre": "Coca-Cola 354ml",
      "precio_costo_actual": 450.00,
      "precio_costo_nuevo": 517.50,
      "precio_venta_actual": 750.00,
      "precio_venta_nuevo": 724.50,
      "diferencia_costo": 67.50
    }
  ]
}
```

### POST /v1/csv/import

**Request:** `multipart/form-data`
- `proveedor_id`: UUID
- `file`: CSV file

**Formato CSV esperado:**
```csv
codigo_barras,nombre,precio_costo,precio_venta,unidades_por_bulto,categoria
7790001234567,Coca-Cola 354ml,450.00,750.00,12,bebidas
7790009876543,Alfajor Triple,600.00,800.00,24,golosinas
```

**Response 200:**
```json
{
  "total_filas": 100,
  "procesadas": 95,
  "errores": 5,
  "creadas": 30,
  "actualizadas": 65,
  "detalle_errores": [
    {"fila": 15, "motivo": "codigo_barras vacio"},
    {"fila": 42, "motivo": "precio_costo debe ser mayor a 0"}
  ]
}
```

---

# Feature 08: Consulta de Precios

## Descripcion General

El sistema ofrece un modo de consulta de precios aislado que no requiere sesion de caja activa, no registra movimientos, no modifica stock y no requiere autenticacion.

## Aceptacion

### AC-08.1: Consulta por barcode
> **Given** un producto existente con barcode "7790001234567"
> **When** envia `GET /v1/precio/7790001234567` sin autenticacion
> **Then** recibe nombre, precio de venta y stock disponible

### AC-08.2: Producto no encontrado
> **Given** un barcode que no existe
> **When** envia `GET /v1/precio/0000000000000`
> **Then** recibe HTTP 404: `{detail: "Producto no encontrado"}`

### AC-08.3: Sin efectos secundarios
> **Given** una consulta de precios
> **When** se procesa
> **Then** no se generan movimientos de caja, no se modifica stock, no se crea ningun registro

## Contrato API

### GET /v1/precio/{barcode}

**Response 200:**
```json
{
  "nombre": "Coca-Cola 354ml",
  "precio_venta": 750.00,
  "stock_disponible": 24,
  "categoria": "bebidas",
  "promocion": null
}
```

---

# Feature 09: Frontend POS

## Descripcion General

La interfaz POS esta optimizada para velocidad de operacion, con foco en escaneo de codigos de barras, atajos de teclado y finalizacion rapida de ventas.

## Aceptacion

### AC-09.1: Campo de busqueda con foco automatico
> **Given** la pantalla POS cargada
> **When** se visualiza
> **Then** el campo de busqueda tiene foco automatico y acepta barcode y escritura manual

### AC-09.2: Agregado inmediato por barcode
> **Given** el campo de busqueda tiene foco
> **When** el lector escanea el codigo "7790001234567"
> **Then** el producto se agrega al carrito inmediatamente y el campo se limpia

### AC-09.3: Busqueda por nombre con autocompletado
> **Given** el cajero escribe "coca"
> **When** se muestra la lista de sugerencias
> **Then** al seleccionar una sugerencia, el producto se agrega al carrito

### AC-09.4: Atajos de teclado

| Tecla | Accion |
|-------|--------|
| F2 | Foco en busqueda por nombre |
| F3 | Aplicar descuento al item seleccionado |
| F10 | Finalizar venta |
| Escape | Cancelar venta actual |
| ↑↓ | Navegar items del carrito |
| + / - | Incrementar / decrementar cantidad |
| Delete | Eliminar item del carrito |

### AC-09.5: Finalizacion con metodo de pago
> **Given** un carrito con items y total calculado
> **When** presiona F10
> **Then** se muestra el panel de pago con campos para cada metodo y calculo de vuelto en tiempo real

### AC-09.6: Impresion Termica Directa (ESC/POS)
> **Given** una venta finalizada y una impresora termica configurada
> **When** el sistema imprime el ticket
> **Then** NO se abre el dialogo de impresion del SO, se envian comandos ESC/POS crudos para formateo, logotipo, apertura de cajon y corte de papel

---

# Feature 10: Frontend Administracion

## Aceptacion

### AC-10.1: Pagina de Cierre de Caja
> **Given** un cajero con caja abierta
> **When** accede a la pagina de cierre
> **Then** ve formulario de arqueo ciego y al confirmar ve el desvio

### AC-10.2: Pagina de Productos
> **Given** un administrador autenticado
> **When** accede a productos
> **Then** ve tabla con busqueda, filtros, crear/editar/desactivar

### AC-10.3: Pagina de Inventario
> **Given** un administrador autenticado
> **When** accede a inventario
> **Then** ve relaciones padre/hijo, desarmes manuales, alertas de stock

### AC-10.4: Pagina de Proveedores
> **Given** un administrador autenticado
> **When** accede a proveedores
> **Then** CRUD, actualizacion masiva con preview, import CSV

### AC-10.5: Pagina de Facturacion
> **Given** un administrador autenticado
> **When** accede a facturacion
> **Then** historial de comprobantes con filtros, descarga PDF

### AC-10.6: Pagina de Consulta de Precios
> **Given** cualquier usuario o terminal sin autenticacion
> **When** accede al modo consulta
> **Then** interfaz minimalista con campo de escaneo y display de precio/stock

---

# Tareas por Fase

## Fase 1: Infraestructura, Auth y Configuracion

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-1.1 | Scaffold del proyecto Go | Estructura de directorios, go.mod, config.go, main.go con Gin. `GET /health` retorna `{"ok": true}`. `go run cmd/server/main.go` arranca sin error. |
| T-1.2 | Modelos GORM y migraciones | Todos los modelos creados en internal/model/. Migracion inicial con golang-migrate aplicada. Tablas existen en PostgreSQL. |
| T-1.3 | Autenticacion JWT | Login retorna tokens (golang-jwt). Endpoints protegidos rechazan sin token. Roles aplicados via middleware Gin. |

## Fase 2: Productos e Inventario

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-2.1 | CRUD completo de productos | Endpoints CRUD funcionando. Busqueda por barcode < 50ms. Busqueda por nombre con paginacion. Soft-delete. |
| T-2.2 | Relacion Padre/Hijo y desarme | Vinculacion funciona. Desarme automatico opera dentro de db.Transaction(). Test con stock agotado pasa. |

## Fase 3: Ventas

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-3.1 | Servicio de ventas ACID | Venta atomica: items + stock + caja en una transaccion. Latencia < 100ms. Sin caja => error 400. |
| T-3.2 | Multi-metodo de pago | Efectivo con vuelto, debito, credito, transferencia, mixto. Validacion de suma >= total. |

## Fase 4: Caja

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-4.1 | Ciclo de vida de caja | Apertura, movimientos inmutables, arqueo ciego, clasificacion de desvio. Reporte completo. |

## Fase 5: Facturacion

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-5.1 | Comprobantes internos PDF | PDF generado con gofpdf. Layout con logo, items, totales. Envio email asincrono via worker pool. |
| T-5.2 | Integracion AFIP (via Sidecar Python) | El worker de Go envia `POST http://afip-sidecar:8001/facturar` con el payload JSON de la venta. El Sidecar (FastAPI + pyafipws) autentica con WSAA, solicita CAE a WSFEV1, y retorna `{ cae, cae_vencimiento, resultado }`. CAE almacenado en DB. Retry con backoff exponencial. Venta no bloqueada. |

## Fase 6: Proveedores

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-6.1 | CRUD y actualizacion masiva | Proveedores con CRUD. Actualizacion masiva con preview. Historial de cambios. |
| T-6.2 | Import CSV | Upload CSV, validacion por fila (encoding/csv), upsert por barcode, resumen con errores detallados. |

## Fase 7: Frontend POS

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-7.1 | Pantalla POS | Busqueda por barcode y nombre. Carrito interactivo. Atajos de teclado. Panel de pago con vuelto. ESC/POS thermal printing. |

## Fase 8: Frontend Administracion

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-8.1 | Paginas de gestion | Cierre de caja, productos, inventario, proveedores, facturacion, usuarios, consulta de precios. Proteccion por roles. |

## Fase 9: Validacion y Deploy

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-9.1 | Tests E2E | Flujo completo: producto → padre/hijo → venta con desarme → cierre caja → facturacion. Todos los tests pasan. |
| T-9.2 | Docker deploy | docker-compose.prod.yml con traefik, frontend, backend (Go binary), postgres, redis. `docker compose up` levanta todo. |

---

## Casos de Borde Criticos

1. **Venta con cantidad mayor al stock hijo + desarme posible**: Rechazar si no hay suficientes padres para cubrir la diferencia.
2. **Cierre de caja con 0 ventas**: Se permite, el desvio se calcula sobre el monto inicial.
3. **CSV con barcode duplicado en el mismo archivo**: Procesar solo la ultima ocurrencia.
4. **Anulacion de venta con producto ya agotado nuevamente**: Restaurar stock (incluso si genera stock negativo en padre, marcar para revision).
5. **Login concurrente desde dos terminales**: Ambos tokens son validos simultaneamente.
6. **Apertura de caja cuando existe una anterior no cerrada**: Rechazar hasta que se cierre la anterior.
7. **Venta con descuento mayor al subtotal**: Rechazar.
8. **AFIP rate limiting**: Respetar limites de AFIP (60 requests/minuto) mediante rate limiting en el worker pool.
