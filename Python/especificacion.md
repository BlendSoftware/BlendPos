# Especificacion SDD — BlendPOS

> Specification-Driven Development (SDD)
> Version: 1.0.0 | Fecha: 2026-02-11
> Documentos complementarios: arquitectura.md, requirements.md, proyecto.md

---

## Indice General

1. [Constitucion del Proyecto](#1-constitucion-del-proyecto)
2. [Feature 01: Autenticacion JWT y Roles](#feature-01-autenticacion-jwt-y-roles)
3. [Feature 02: Productos — CRUD y Busqueda](#feature-02-productos--crud-y-busqueda)
4. [Feature 03: Inventario Jerarquico y Desarme Automatico](#feature-03-inventario-jerarquico-y-desarme-automatico)
5. [Feature 04: Modulo de Ventas de Alta Velocidad](#feature-04-modulo-de-ventas-de-alta-velocidad)
6. [Feature 05: Caja y Tesoreria](#feature-05-caja-y-tesoreria)
7. [Feature 06: Facturacion Hibrida](#feature-06-facturacion-hibrida)
8. [Feature 07: Proveedores y Costos](#feature-07-proveedores-y-costos)
9. [Feature 08: Consulta de Precios](#feature-08-consulta-de-precios)
10. [Feature 09: Frontend POS](#feature-09-frontend-pos)
11. [Feature 10: Frontend Administracion](#feature-10-frontend-administracion)
12. [Tareas por Fase](#tareas-por-fase)

---

# 1. Constitucion del Proyecto

## Nombre del Proyecto
BlendPOS — Sistema de Punto de Venta para Kioscos y Drugstores

## Declaracion del Problema
Los kioscos y drugstores de alta rotacion necesitan un sistema POS que maneje la particularidad de vender unidades individuales provenientes de bultos cerrados, con la velocidad necesaria para despachar en horas pico, la exactitud contable para detectar desvios de caja, y el cumplimiento fiscal argentino para emitir comprobantes electronicos via AFIP.

## Solucion Propuesta
Un sistema POS de mision critica con arquitectura cliente-servidor que integra inventario jerarquico con desarme automatico (padre/hijo), ventas de alta velocidad (<100ms), gestion de caja con arqueo ciego, facturacion hibrida (AFIP fiscal + PDF interno), administracion de proveedores con carga masiva, y autenticacion basada en roles.

## Stack Tecnologico

| Capa | Tecnologia | Version |
|------|-----------|---------|
| API REST | FastAPI | >= 0.110 |
| Validacion | Pydantic V2 | >= 2.6 |
| ORM | SQLAlchemy 2.0 | >= 2.0 |
| Migraciones | Alembic | >= 1.13 |
| Base de datos | PostgreSQL | >= 15 |
| Cache + Broker | Redis | >= 7.0 |
| Tareas asincronas | Celery | >= 5.3 |
| PDF | ReportLab | >= 4.0 |
| AFIP | pyafipws | >= 3.0 |
| Auth | JWT (python-jose) + bcrypt | — |
| Frontend | React + Vite + TypeScript | >= 18 |
| Estilos | TailwindCSS + ShadcnUI | — |

## Estructura de Directorios Objetivo

```
blendpos/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── settings.py
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── ventas.py
│   │   │   ├── productos.py
│   │   │   ├── inventario.py
│   │   │   ├── caja.py
│   │   │   ├── facturacion.py
│   │   │   ├── proveedores.py
│   │   │   ├── consulta_precios.py
│   │   │   └── usuarios.py
│   │   ├── core/
│   │   │   ├── venta_service.py
│   │   │   ├── inventario_service.py
│   │   │   ├── caja_service.py
│   │   │   ├── facturacion_service.py
│   │   │   ├── proveedor_service.py
│   │   │   └── auth_service.py
│   │   ├── models/
│   │   │   ├── producto.py
│   │   │   ├── producto_hijo.py
│   │   │   ├── venta.py
│   │   │   ├── sesion_caja.py
│   │   │   ├── comprobante.py
│   │   │   ├── proveedor.py
│   │   │   └── usuario.py
│   │   ├── schemas/
│   │   │   ├── producto_schemas.py
│   │   │   ├── venta_schemas.py
│   │   │   ├── caja_schemas.py
│   │   │   ├── facturacion_schemas.py
│   │   │   ├── proveedor_schemas.py
│   │   │   └── auth_schemas.py
│   │   ├── infra/
│   │   │   ├── database.py
│   │   │   ├── redis.py
│   │   │   ├── afip.py
│   │   │   ├── smtp.py
│   │   │   └── celery.py
│   │   └── tasks/
│   │       ├── facturacion_tasks.py
│   │       └── email_tasks.py
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── tests/
│   │   ├── test_ventas.py
│   │   ├── test_inventario.py
│   │   ├── test_caja.py
│   │   ├── test_facturacion.py
│   │   ├── test_proveedores.py
│   │   └── test_auth.py
│   ├── pyproject.toml
│   └── alembic.ini
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── POS.tsx
│   │   │   ├── CierreCaja.tsx
│   │   │   ├── Productos.tsx
│   │   │   ├── Inventario.tsx
│   │   │   ├── Proveedores.tsx
│   │   │   ├── Facturacion.tsx
│   │   │   ├── Usuarios.tsx
│   │   │   └── ConsultaPrecios.tsx
│   │   ├── components/
│   │   │   ├── SalePanel.tsx
│   │   │   ├── ProductSearch.tsx
│   │   │   ├── CartGrid.tsx
│   │   │   ├── PaymentPanel.tsx
│   │   │   ├── CashDrawer.tsx
│   │   │   ├── InvoiceViewer.tsx
│   │   │   └── PriceChecker.tsx
│   │   ├── hooks/
│   │   │   ├── useBarcode.ts
│   │   │   ├── useKeyboardShortcuts.ts
│   │   │   └── useAuth.ts
│   │   └── services/
│   │       ├── api.ts
│   │       └── auth.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── docker-compose.yml
├── .env.example
└── docs/
    ├── proyecto.md
    ├── especificacion.md
    ├── arquitectura.md
    ├── requirements.md
    ├── CLAUDE.md
    ├── ejecucion.md
    └── habilidades.md
```

---

# Feature 01: Autenticacion JWT y Roles

## Descripcion General

El sistema implementa autenticacion basada en JWT siguiendo el estandar OAuth2, con tres roles (cajero, supervisor, administrador) que determinan el acceso a cada endpoint. Los tokens de acceso expiran a las 8 horas (un turno de trabajo) y los tokens de refresco a las 24 horas.

## Aceptacion

### AC-01.1: Login exitoso
> **Given** un usuario registrado con username "cajero1" y password "abc123"
> **When** envia `POST /v1/auth/login` con esas credenciales
> **Then** recibe HTTP 200 con `{access_token, refresh_token, token_type: "bearer", rol, expires_in}`

### AC-01.2: Login fallido
> **Given** credenciales incorrectas
> **When** envia `POST /v1/auth/login`
> **Then** recibe HTTP 401 con `{detail: "Credenciales invalidas"}`

### AC-01.3: Acceso protegido sin token
> **Given** un request sin header Authorization
> **When** envia cualquier request a un endpoint protegido
> **Then** recibe HTTP 401 con `{detail: "Token invalido o expirado"}`

### AC-01.4: Acceso con rol insuficiente
> **Given** un cajero autenticado
> **When** intenta `POST /v1/usuarios` (solo admin)
> **Then** recibe HTTP 403 con `{detail: "Permisos insuficientes"}`

### AC-01.5: Refresh token
> **Given** un refresh token valido
> **When** envia `POST /v1/auth/refresh`
> **Then** recibe un nuevo access token

## Contrato API

### POST /v1/auth/login

**Request:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response 200:**
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "token_type": "bearer",
  "rol": "cajero | supervisor | administrador",
  "expires_in": 28800
}
```

### POST /v1/auth/refresh

**Request:**
```json
{
  "refresh_token": "eyJhbG..."
}
```

**Response 200:**
```json
{
  "access_token": "eyJhbG...",
  "token_type": "bearer",
  "expires_in": 28800
}
```

## JWT Payload

```json
{
  "sub": "user_id (UUID)",
  "rol": "cajero | supervisor | administrador",
  "pdv": 1,
  "exp": 1700000000,
  "iat": 1699971200
}
```

## Registro de Usuarios (solo admin)

### POST /v1/usuarios

**Request:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "nombre_completo": "string",
  "rol": "cajero | supervisor | administrador",
  "punto_de_venta": 1
}
```

**Response 201:**
```json
{
  "id": "UUID",
  "username": "string",
  "email": "string",
  "nombre_completo": "string",
  "rol": "cajero",
  "punto_de_venta": 1,
  "activo": true
}
```

---

# Feature 02: Productos — CRUD y Busqueda

## Descripcion General

El sistema permite crear, leer, actualizar y eliminar (soft-delete) productos. Cada producto tiene un codigo de barras unico, precio de costo, precio de venta, stock actual, stock minimo para alertas de reposicion, y opcionalmente un proveedor asociado. La busqueda por codigo de barras debe resolverse en menos de 50ms y la busqueda por nombre soporta autocompletado con trigram similarity.

## Aceptacion

### AC-02.1: Crear producto
> **Given** datos validos de un producto nuevo
> **When** envia `POST /v1/productos`
> **Then** el producto se crea con HTTP 201, el margen se calcula automaticamente

### AC-02.2: Busqueda por barcode
> **Given** el codigo de barras "7790001234567" existe en la base de datos
> **When** envia `GET /v1/productos?barcode=7790001234567`
> **Then** recibe el producto en menos de 50ms

### AC-02.3: Busqueda por nombre
> **Given** existen productos con "Coca" en el nombre
> **When** envia `GET /v1/productos?q=coca&limit=10`
> **Then** recibe una lista paginada de productos que matchean por trigram similarity

### AC-02.4: Soft-delete
> **Given** un producto existente
> **When** envia `DELETE /v1/productos/{id}`
> **Then** el producto se marca como `activo = false`, no se elimina de la base

### AC-02.5: Producto con stock bajo
> **Given** un producto con `stock_actual = 3` y `stock_minimo = 5`
> **When** se consulta via API
> **Then** el response incluye un campo `alerta_stock: true`

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
  "es_padre": false,
  "proveedor_id": "UUID | null"
}
```

**Response 201:**
```json
{
  "id": "UUID",
  "codigo_barras": "7790001234567",
  "nombre": "Coca-Cola 354ml",
  "descripcion": "Lata individual",
  "categoria": "bebidas",
  "precio_costo": 450.00,
  "precio_venta": 750.00,
  "margen_pct": 66.67,
  "stock_actual": 24,
  "stock_minimo": 5,
  "unidad_medida": "unidad",
  "es_padre": false,
  "proveedor_id": "UUID",
  "activo": true,
  "alerta_stock": false,
  "created_at": "2026-02-11T10:00:00Z",
  "updated_at": "2026-02-11T10:00:00Z"
}
```

### GET /v1/productos

**Query params:** `barcode`, `q` (nombre), `categoria`, `proveedor_id`, `alerta_stock`, `page`, `limit`

**Response 200:**
```json
{
  "items": ["...array of Producto"],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

---

# Feature 03: Inventario Jerarquico y Desarme Automatico

## Descripcion General

El sistema permite vincular un producto padre (bulto) con un producto hijo (unidad individual) indicando cuantas unidades contiene. Cuando el stock del producto hijo es insuficiente para una venta y el producto padre tiene stock disponible, el sistema ejecuta un desarme automatico: decrementa una unidad del padre y acredita `units_per_parent` unidades al hijo, todo dentro de una transaccion ACID.

## Aceptacion

### AC-03.1: Vincular padre/hijo
> **Given** un producto padre "Caja Coca-Cola x12" y un producto hijo "Coca-Cola 354ml"
> **When** envia `POST /v1/inventario/vincular` con `units_per_parent: 12`
> **Then** se crea la relacion y ambos productos quedan vinculados

### AC-03.2: Desarme automatico en venta
> **Given** stock del hijo = 0, stock del padre = 3, units_per_parent = 12
> **When** se vende 1 unidad del hijo
> **Then** al finalizar: stock padre = 2, stock hijo = 11 (12 desarmados - 1 vendida)

### AC-03.3: Desarme falla por stock padre agotado
> **Given** stock del hijo = 0, stock del padre = 0
> **When** se intenta vender 1 unidad del hijo
> **Then** la venta se rechaza con HTTP 400: `{detail: "Stock insuficiente para Coca-Cola 354ml"}`

### AC-03.4: Atomicidad del desarme
> **Given** una operacion de desarme en progreso
> **When** ocurre un error durante la transaccion
> **Then** ningun stock se modifica (rollback completo)

### AC-03.5: Desarme multiple en una misma venta
> **Given** stock del hijo = 5, se venden 20 unidades, units_per_parent = 12, stock padre = 3
> **When** se registra la venta
> **Then** el sistema desarma 2 padres (24 unidades), stock final hijo = 5 + 24 - 20 = 9, stock padre = 1

## Contrato API

### POST /v1/inventario/vincular

**Request:**
```json
{
  "producto_padre_id": "UUID",
  "producto_hijo_id": "UUID",
  "unidades_por_padre": 12,
  "desarme_automatico": true
}
```

**Response 201:**
```json
{
  "id": "UUID",
  "producto_padre_id": "UUID",
  "producto_hijo_id": "UUID",
  "unidades_por_padre": 12,
  "desarme_automatico": true,
  "producto_padre_nombre": "Caja Coca-Cola x12",
  "producto_hijo_nombre": "Coca-Cola 354ml"
}
```

### POST /v1/inventario/desarme-manual

**Request:**
```json
{
  "producto_padre_id": "UUID",
  "cantidad_padres": 1
}
```

**Response 200:**
```json
{
  "unidades_generadas": 12,
  "stock_padre_anterior": 3,
  "stock_padre_actual": 2,
  "stock_hijo_anterior": 0,
  "stock_hijo_actual": 12
}
```

## Logica de Desarme (Pseudocodigo)

```python
def descontar_stock(producto_id, cantidad, session):
    producto = session.get(Producto, producto_id)
    
    if producto.stock_actual >= cantidad:
        producto.stock_actual -= cantidad
        return
    
    # Intentar desarme automatico
    vinculo = session.query(ProductoHijo).filter_by(
        producto_hijo_id=producto_id,
        desarme_auto=True
    ).first()
    
    if not vinculo:
        raise HTTPException(400, f"Stock insuficiente para {producto.nombre}")
    
    padre = session.get(Producto, vinculo.producto_padre_id)
    faltante = cantidad - producto.stock_actual
    padres_necesarios = ceil(faltante / vinculo.unidades_por_padre)
    
    if padre.stock_actual < padres_necesarios:
        raise HTTPException(400, f"Stock insuficiente para {producto.nombre}")
    
    # Desarme atomico
    padre.stock_actual -= padres_necesarios
    producto.stock_actual += padres_necesarios * vinculo.unidades_por_padre
    producto.stock_actual -= cantidad
```

---

# Feature 04: Modulo de Ventas de Alta Velocidad

## Descripcion General

El modulo de ventas permite registrar transacciones de forma atomica con latencia inferior a 100ms por item. Cada venta incluye una lista de items con cantidades, una lista de pagos que pueden combinar multiples metodos, y genera automaticamente los movimientos de caja correspondientes. Las ventas solo pueden registrarse con una sesion de caja activa.

## Aceptacion

### AC-04.1: Venta simple con pago en efectivo
> **Given** una caja abierta y un producto con stock suficiente
> **When** envia `POST /v1/ventas` con 1 item y pago en efectivo
> **Then** se crea la venta, se decrementa el stock, se registra el movimiento de caja, se retorna el ticket con vuelto calculado

### AC-04.2: Venta con pago mixto
> **Given** una venta de $1500 total
> **When** se paga $1000 en efectivo y $500 en debito
> **Then** se registran 2 movimientos de caja (uno por cada metodo) y la venta se confirma

### AC-04.3: Venta sin caja abierta
> **Given** no hay sesion de caja activa para el punto de venta
> **When** intenta registrar una venta
> **Then** recibe HTTP 400: `{detail: "No hay caja abierta"}`

### AC-04.4: Venta con desarme automatico
> **Given** stock del producto hijo = 0, padre tiene stock
> **When** se vende el producto hijo
> **Then** el desarme automatico se ejecuta dentro de la misma transaccion de la venta

### AC-04.5: Anulacion de venta
> **Given** una venta completada, usuario con rol supervisor
> **When** envia `DELETE /v1/ventas/{id}`
> **Then** la venta se marca como `anulada`, se restaura el stock, se crean movimientos inversos

### AC-04.6: Anulacion sin permisos
> **Given** un cajero (no supervisor)
> **When** intenta anular una venta
> **Then** recibe HTTP 403: `{detail: "Permisos insuficientes"}`

### AC-04.7: Pago insuficiente
> **Given** una venta de $1500 total
> **When** la suma de pagos es $1200
> **Then** recibe HTTP 400: `{detail: "El monto pagado ($1200.00) es inferior al total ($1500.00)"}`

## Contrato API

### POST /v1/ventas

**Request:**
```json
{
  "sesion_caja_id": "UUID",
  "items": [
    {
      "barcode": "7790001234567",
      "cantidad": 2,
      "descuento_item": 0.00
    },
    {
      "barcode": "7790009876543",
      "cantidad": 1,
      "descuento_item": 50.00
    }
  ],
  "pagos": [
    {
      "metodo": "efectivo",
      "monto": 2000.00
    }
  ],
  "descuento_total": 0.00,
  "cliente_email": "cliente@example.com"
}
```

**Response 201:**
```json
{
  "id": "UUID",
  "numero_ticket": 1042,
  "items": [
    {
      "producto_id": "UUID",
      "nombre": "Coca-Cola 354ml",
      "cantidad": 2,
      "precio_unitario": 750.00,
      "descuento_item": 0.00,
      "subtotal": 1500.00
    },
    {
      "producto_id": "UUID",
      "nombre": "Alfajor Triple",
      "cantidad": 1,
      "precio_unitario": 800.00,
      "descuento_item": 50.00,
      "subtotal": 750.00
    }
  ],
  "subtotal": 2300.00,
  "descuento_total": 0.00,
  "total": 2250.00,
  "pagos": [
    {
      "metodo": "efectivo",
      "monto": 2000.00
    }
  ],
  "vuelto": 0.00,
  "estado": "completada",
  "cajero": "cajero1",
  "created_at": "2026-02-11T10:30:00Z"
}
```

**Response 400 (stock insuficiente):**
```json
{
  "detail": "Stock insuficiente para Coca-Cola 354ml",
  "code": "STOCK_INSUFICIENTE"
}
```

---

# Feature 05: Caja y Tesoreria

## Descripcion General

El modulo de caja gestiona el ciclo de vida completo de una sesion de caja: apertura con monto inicial, registro de movimientos inmutables durante la operacion (ventas, ingresos manuales, egresos manuales, anulaciones), arqueo ciego al cierre y deteccion automatica de desvios con clasificacion por umbral.

## Aceptacion

### AC-05.1: Apertura de caja
> **Given** un cajero autenticado sin caja abierta en su punto de venta
> **When** envia `POST /v1/caja/abrir` con monto_inicial = 5000
> **Then** se crea una sesion de caja en estado `abierta`

### AC-05.2: Apertura duplicada
> **Given** ya existe una caja abierta para el punto de venta
> **When** intenta abrir otra caja
> **Then** recibe HTTP 400: `{detail: "Ya existe una caja abierta para el punto de venta 1"}`

### AC-05.3: Movimientos inmutables
> **Given** una caja abierta con movimientos registrados
> **When** se intenta eliminar o modificar un movimiento
> **Then** la operacion es rechazada (no existe endpoint para editar movimientos)

### AC-05.4: Arqueo ciego exitoso
> **Given** una caja con movimientos que suman $50,000 esperados
> **When** el cajero declara $50,200
> **Then** desvio = +$200, porcentaje = 0.4%, clasificacion = NORMAL, caja se cierra

### AC-05.5: Arqueo con desvio critico
> **Given** una caja con movimientos que suman $50,000 esperados
> **When** el cajero declara $46,000
> **Then** desvio = -$4,000, porcentaje = 8%, clasificacion = CRITICO, se requiere justificacion del supervisor

### AC-05.6: Ingreso manual
> **Given** una caja abierta
> **When** envia `POST /v1/caja/movimiento` con tipo "ingreso_manual"
> **Then** se registra el movimiento y se suma al esperado

### AC-05.7: Egreso manual
> **Given** una caja abierta
> **When** envia `POST /v1/caja/movimiento` con tipo "egreso_manual"
> **Then** se registra el movimiento y se resta del esperado

## Contrato API

### POST /v1/caja/abrir

**Request:**
```json
{
  "punto_de_venta": 1,
  "monto_inicial": 5000.00
}
```

**Response 201:**
```json
{
  "id": "UUID",
  "punto_de_venta": 1,
  "usuario": "cajero1",
  "monto_inicial": 5000.00,
  "estado": "abierta",
  "opened_at": "2026-02-11T08:00:00Z"
}
```

### POST /v1/caja/movimiento

**Request:**
```json
{
  "sesion_caja_id": "UUID",
  "tipo": "ingreso_manual | egreso_manual",
  "metodo_pago": "efectivo",
  "monto": 500.00,
  "descripcion": "Cambio recibido de sucursal 2"
}
```

### POST /v1/caja/arqueo

**Request (declaracion ciega):**
```json
{
  "sesion_caja_id": "UUID",
  "declaracion": {
    "efectivo": 35000.00,
    "debito": 12000.00,
    "credito": 8000.00,
    "transferencia": 3000.00
  }
}
```

**Response 200:**
```json
{
  "sesion_caja_id": "UUID",
  "monto_inicial": 5000.00,
  "esperado": {
    "efectivo": 34500.00,
    "debito": 12000.00,
    "credito": 7800.00,
    "transferencia": 3200.00,
    "total": 57500.00
  },
  "declarado": {
    "efectivo": 35000.00,
    "debito": 12000.00,
    "credito": 8000.00,
    "transferencia": 3000.00,
    "total": 58000.00
  },
  "desvio": {
    "monto": 500.00,
    "porcentaje": 0.87,
    "clasificacion": "NORMAL"
  },
  "estado": "cerrada",
  "closed_at": "2026-02-11T20:00:00Z"
}
```

### GET /v1/caja/{id}/reporte

**Response 200:**
```json
{
  "sesion_caja_id": "UUID",
  "punto_de_venta": 1,
  "cajero": "cajero1",
  "monto_inicial": 5000.00,
  "movimientos": [
    {
      "tipo": "venta",
      "metodo_pago": "efectivo",
      "monto": 1500.00,
      "descripcion": "Ticket #1042",
      "created_at": "2026-02-11T10:30:00Z"
    }
  ],
  "total_movimientos": 45,
  "esperado": 57500.00,
  "declarado": 58000.00,
  "desvio": 500.00,
  "desvio_pct": 0.87,
  "clasificacion": "NORMAL",
  "observaciones": null,
  "opened_at": "2026-02-11T08:00:00Z",
  "closed_at": "2026-02-11T20:00:00Z"
}
```

### Clasificacion de Desvios

| Rango | Clasificacion | Accion |
|-------|---------------|--------|
| <= 1% | NORMAL | Cierre automatico |
| 1% - 5% | WARNING | Cierre con advertencia |
| > 5% | CRITICO | Requiere justificacion del supervisor |

---

# Feature 06: Facturacion Hibrida

## Descripcion General

El sistema genera comprobantes en dos modos: fiscal (via AFIP) e interno (PDF). La emision fiscal se procesa asincronamente via Celery para no bloquear la venta. Los comprobantes internos se generan con ReportLab. Ambos modos soportan envio por email.

## Aceptacion

### AC-06.1: Comprobante interno PDF
> **Given** una venta completada sin requerimiento fiscal
> **When** Celery procesa la tarea de facturacion
> **Then** se genera un PDF con logo, datos del negocio, detalle de items, totales y metodo de pago

### AC-06.2: Factura electronica AFIP
> **Given** una venta completada que requiere factura fiscal tipo B
> **When** Celery procesa la tarea de facturacion
> **Then** se autentica con WSAA, solicita CAE a WSFEV1, almacena CAE y vencimiento, genera PDF con QR fiscal

### AC-06.3: AFIP no disponible
> **Given** una venta completada y AFIP fuera de servicio
> **When** Celery intenta emitir la factura
> **Then** reintenta con backoff exponencial (3 reintentos), si falla marca estado `error`

### AC-06.4: La venta no se bloquea
> **Given** el proceso de facturacion tarda o falla
> **When** el cajero registra la venta
> **Then** la venta se confirma inmediatamente, la facturacion se procesa en segundo plano

### AC-06.5: Envio por email
> **Given** un comprobante generado y el cliente proporciono email
> **When** Celery procesa la tarea de email
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

### Configuracion Fiscal (settings.py)

```python
class Settings(BaseSettings):
    # AFIP
    AFIP_CERT_PATH: str
    AFIP_KEY_PATH: str
    AFIP_CUIT: str
    AFIP_PUNTO_VENTA: int
    AFIP_TIPO_CONTRIBUYENTE: str  # "monotributista" | "responsable_inscripto"
    AFIP_INICIO_ACTIVIDADES: str  # "2020-01-01"
    AFIP_CONDICION_IVA: str       # "IVA Responsable Inscripto"
    AFIP_PRODUCTION: bool = False  # True for production, False for testing (homologacion)
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
    {
      "fila": 15,
      "motivo": "codigo_barras vacio"
    },
    {
      "fila": 42,
      "motivo": "precio_costo debe ser mayor a 0"
    }
  ]
}
```

---

# Feature 08: Consulta de Precios

## Descripcion General

El sistema ofrece un modo de consulta de precios aislado que no requiere sesion de caja activa, no registra movimientos, no modifica stock y no requiere autenticacion. Diseñado para terminales de autoconsulta o uso rapido del cajero.

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
> **Then** no se generan movimientos de caja, no se modifica stock, no se crea ningun registro en la base de datos

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

La interfaz POS esta optimizada para velocidad de operacion, con foco en escaneo de codigos de barras, atajos de teclado y finalizacion rapida de ventas. Diseñada para pantallas de 14" o superior, con layout fijo que muestra simultneamente el campo de busqueda, el carrito de items y el panel de pago.

## Aceptacion

### AC-09.1: Campo de busqueda con foco automatico
> **Given** la pantalla POS cargada
> **When** se visualiza
> **Then** el campo de busqueda tiene foco automatico y acepta tanto escaneo de barcode como escritura manual

### AC-09.2: Agregado inmediato por barcode
> **Given** el campo de busqueda tiene foco
> **When** el lector escanea el codigo "7790001234567"
> **Then** el producto se agrega al carrito inmediatamente y el campo se limpia

### AC-09.3: Busqueda por nombre con autocompletado
> **Given** el cajero escribe "coca"
> **When** se muestra la lista de sugerencias
> **Then** al seleccionar una sugerencia, el producto se agrega al carrito

### AC-09.4: Atajos de teclado
> **Given** la pantalla POS activa
> **When** el cajero presiona las siguientes teclas
> **Then** se ejecutan las acciones correspondientes:
>
> | Tecla | Accion |
> |-------|--------|
> | F2 | Foco en busqueda por nombre |
> | F3 | Aplicar descuento al item seleccionado |
> | F10 | Finalizar venta |
> | Escape | Cancelar venta actual |
> | ↑↓ | Navegar items del carrito |
> | + / - | Incrementar / decrementar cantidad |
> | Delete | Eliminar item del carrito |

### AC-09.5: Finalizacion con metodo de pago
> **Given** un carrito con items y total calculado
> **When** presiona F10
> **Then** se muestra el panel de pago con campos para cada metodo y calculo de vuelto en tiempo real

### AC-09.6: Streaming de venta
> **Given** el cajero confirma el pago
> **When** la venta se procesa
> **Then** la interfaz muestra feedback inmediato (exito/error) y limpia el carrito para la siguiente venta

### AC-09.7: Impresion Termica Directa (ESC/POS)
> **Given** una venta finalizada y una impresora termica configurada (USB o Red)
> **When** el sistema imprime el ticket
> **Then** NO se abre el dialogo de impresion del sistema operativo
> **And** se envian comandos ESC/POS crudos (Raw Bytes) para:
> - Formatear texto (Negrita, Doble Altura para total)
> - Imprimir logotipo bitmappeado
> - Abrir cajon de dinero (Comando `ESC p`)
> - Cortar papel (Comando `GS V`)

#### Estrategia Tecnica de Impresion

La impresion termica utiliza una estrategia de fallback con dos niveles:

**Intento 1 — Web Serial API**: Conexion directa desde Chrome al puerto COM/USB de la impresora. El frontend solicita acceso al puerto serial via `navigator.serial.requestPort()`, establece una conexion con la impresora y envia los bytes ESC/POS directamente. Esta es la opcion preferida por no requerir software adicional en la PC del cajero.

**Intento 2 — Print Agent**: Si Web Serial no esta disponible (navegador no compatible o impresora de red), el frontend hace un `POST http://localhost:9090/print` a un micro-agente Python instalado en la PC del cajero que actua como puente con la impresora. El Print Agent recibe los bytes ESC/POS via HTTP y los reenvía al dispositivo configurado.

```
Venta finalizada
     |
     v
+--------------------+
| Generar payload    |
| ESC/POS (bytes)    |
+--------+-----------+
         |
    Web Serial API
    disponible?
         |
    +----+----+
    |         |
   SI        NO
    |         |
    v         v
+--------+ +------------------+
| Serial | | POST localhost   |
| port   | | :9090/print      |
| .write | | (Print Agent     |
| (bytes)| |  Python)         |
+--------+ +------------------+
    |         |
    +----+----+
         |
         v
  Impresora termica:
  - Ticket formateado
  - Cajon abierto
  - Papel cortado
```

#### Comandos ESC/POS Clave

| Comando | Hex | Funcion |
|---------|-----|---------|
| ESC @ | `1B 40` | Inicializar impresora |
| ESC E n | `1B 45 01` | Activar negrita |
| GS ! n | `1D 21 11` | Doble altura + doble ancho |
| ESC a n | `1B 61 01` | Centrar texto |
| GS v 0 | `1D 76 30` | Imprimir imagen raster |
| ESC p m t1 t2 | `1B 70 00 19 FA` | Abrir cajon de dinero |
| GS V m | `1D 56 00` | Corte total de papel |

---

# Feature 10: Frontend Administracion

## Descripcion General

El frontend incluye paginas de administracion para caja, productos, inventario, proveedores, facturacion, usuarios y consulta de precios. Cada pagina esta protegida por roles.

## Aceptacion

### AC-10.1: Pagina de Cierre de Caja
> **Given** un cajero con caja abierta
> **When** accede a la pagina de cierre
> **Then** ve un formulario de arqueo ciego (campos por metodo de pago) y al confirmar ve el desvio calculado

### AC-10.2: Pagina de Productos
> **Given** un administrador autenticado
> **When** accede a la pagina de productos
> **Then** ve una tabla con busqueda, filtros, y botones para crear, editar y desactivar productos

### AC-10.3: Pagina de Inventario
> **Given** un administrador autenticado
> **When** accede a la pagina de inventario
> **Then** ve relaciones padre/hijo, puede crear vinculos, ejecutar desarmes manuales y ver alertas de stock bajo

### AC-10.4: Pagina de Proveedores
> **Given** un administrador autenticado
> **When** accede a la pagina de proveedores
> **Then** puede crear/editar proveedores, ejecutar actualizacion masiva con preview, e importar CSV

### AC-10.5: Pagina de Facturacion
> **Given** un administrador autenticado
> **When** accede a la pagina de facturacion
> **Then** ve el historial de comprobantes con filtros por tipo y estado, puede descargar PDFs

### AC-10.6: Pagina de Consulta de Precios
> **Given** cualquier usuario o terminal sin autenticacion
> **When** accede al modo consulta
> **Then** ve una interfaz minimalista con campo de escaneo y display de precio/stock

---

# Tareas por Fase

## Fase 1: Infraestructura, Auth y Configuracion

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-1.1 | Scaffold del proyecto backend | Estructura de directorios, pyproject.toml, settings.py, main.py. `GET /health` retorna `{"ok": true}`. Uvicorn arranca sin error. |
| T-1.2 | Modelos SQLAlchemy y migraciones | Todos los modelos creados. Migracion inicial aplicada. Tablas existen en PostgreSQL. |
| T-1.3 | Autenticacion JWT | Login retorna tokens. Endpoints protegidos rechazan sin token. Roles aplicados. |

## Fase 2: Productos e Inventario

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-2.1 | CRUD completo de productos | Endpoints CRUD funcionando. Busqueda por barcode < 50ms. Busqueda por nombre con paginacion. Soft-delete implementado. |
| T-2.2 | Relacion Padre/Hijo y desarme | Vinculacion funciona. Desarme automatico opera dentro de transaccion ACID. Test con stock agotado pasa. |

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
| T-5.1 | Comprobantes internos PDF | PDF generado con ReportLab. Layout con logo, items, totales. Envio email asincrono. |
| T-5.2 | Integracion AFIP | WSAA + WSFEV1 via Celery. CAE almacenado. Retry con backoff. Venta no bloqueada. |

## Fase 6: Proveedores

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-6.1 | CRUD y actualizacion masiva | Proveedores con CRUD. Actualizacion masiva con preview. Historial de cambios. |
| T-6.2 | Import CSV | Upload CSV, validacion por fila, upsert por barcode, resumen con errores detallados. |

## Fase 7: Frontend POS

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-7.1 | Pantalla POS | Busqueda por barcode y nombre. Carrito interactivo. Atajos de teclado. Panel de pago con vuelto. |

## Fase 8: Frontend Administracion

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-8.1 | Paginas de gestion | Cierre de caja, productos, inventario, proveedores, facturacion, usuarios, consulta de precios. Proteccion por roles. |

## Fase 9: Validacion y Deploy

| ID | Tarea | Criterio de Completitud |
|----|-------|------------------------|
| T-9.1 | Tests E2E | Flujo completo: producto → padre/hijo → venta con desarme → cierre caja → facturacion. Todos los tests pasan. |
| T-9.2 | Docker deploy | docker-compose.yml con todos los servicios. `docker compose up` levanta el sistema funcional. |

---

## Casos de Borde Criticos

1. **Venta con cantidad mayor al stock hijo + desarme posible**: Rechazar si no hay suficientes padres para cubrir la diferencia.
2. **Cierre de caja con 0 ventas**: Se permite, el desvio se calcula sobre el monto inicial.
3. **CSV con barcode duplicado en el mismo archivo**: Procesar solo la ultima ocurrencia.
4. **Anulacion de venta con producto ya agotado nuevamente**: Restaurar stock (incluso si genera stock negativo en padre, marcar para revision).
5. **Login concurrente desde dos terminales**: Ambos tokens son validos simultaneamente.
6. **Apertura de caja cuando existe una anterior no cerrada**: Rechazar hasta que se cierre la anterior.
7. **Venta con descuento mayor al subtotal**: Rechazar.
8. **AFIP rate limiting**: Respetar limites de AFIP (60 requests/minuto) mediante cola Celery con rate limiting.
