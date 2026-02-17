# Arquitectura de Software — BlendPOS

> Version: 1.0.0
> Fecha: 2026-02-11
> Estado: Propuesta para revision
> Documentos de referencia: proyecto.md, especificacion.md

---

## Indice

1. [Vision Arquitectonica](#1-vision-arquitectonica)
2. [Estilo Arquitectonico](#2-estilo-arquitectonico)
3. [Vista de Contexto](#3-vista-de-contexto)
4. [Vista de Contenedores](#4-vista-de-contenedores)
5. [Vista de Componentes](#5-vista-de-componentes)
6. [Vista de Codigo](#6-vista-de-codigo)
7. [Flujos de Datos](#7-flujos-de-datos)
8. [Patrones de Diseño Aplicados](#8-patrones-de-diseño-aplicados)
9. [Modelo de Datos](#9-modelo-de-datos)
10. [Decisiones Arquitectonicas](#10-decisiones-arquitectonicas)
11. [Infraestructura y Despliegue](#11-infraestructura-y-despliegue)
12. [Seguridad](#12-seguridad)
13. [Observabilidad](#13-observabilidad)
14. [Escalabilidad y Evolucion](#14-escalabilidad-y-evolucion)

---

# 1. Vision Arquitectonica

La arquitectura de BlendPOS responde a un conjunto de fuerzas que moldean cada decision estructural. En primer lugar, la mision critica del sistema impone que todas las operaciones monetarias y de inventario sean transaccionales con garantia ACID, ya que un error de stock o un desvio contable tiene impacto directo en el negocio. En segundo lugar, la velocidad de operacion exige que el registro de items de venta se complete en menos de 100 milisegundos, lo cual requiere indices optimizados, cache de productos frecuentes y queries minimas. En tercer lugar, la integridad fiscal requiere integracion con AFIP para emision de comprobantes electronicos sin que una falla del servicio externo bloquee la operacion del punto de venta.

Estas tres fuerzas convergen en una arquitectura que privilegia la transaccionalidad estricta en la capa de datos, la separacion clara entre logica de negocio y comunicacion con servicios externos, y el procesamiento asincrono de tareas que no son criticas para el flujo del cajero (facturacion, email, reportes).

---

# 2. Estilo Arquitectonico

El sistema adopta una combinacion de dos estilos arquitectonicos complementarios.

## 2.1 Arquitectura en Capas (Layered Architecture)

La estructura vertical del sistema se organiza en cuatro capas con dependencias unidireccionales estrictas. Cada capa solo conoce a la capa inmediatamente inferior y nunca a la superior.

```
+================================================================+
|                     CAPA DE PRESENTACION                       |
|  React Frontend (Vite + TypeScript + TailwindCSS + ShadcnUI)   |
|  Protocolo: HTTP REST (JSON)                                   |
+================================================================+
                              |
                     fetch / axios
                              |
+================================================================+
|                     CAPA DE API (Gateway)                      |
|  FastAPI: Endpoints REST                                       |
|  Responsabilidad: Validacion de entrada (Pydantic V2),         |
|  autenticacion JWT, enrutamiento, serializacion de respuesta,  |
|  manejo de errores HTTP                                        |
+================================================================+
                              |
                    invocacion directa
                              |
+================================================================+
|                     CAPA DE SERVICIO (Core)                    |
|  Logica de negocio pura:                                       |
|  - VentaService (registro, anulacion, metodos de pago)         |
|  - InventarioService (stock, desarme automatico, alertas)      |
|  - CajaService (apertura, movimientos, arqueo, cierre)         |
|  - FacturacionService (comprobantes, AFIP, PDF)                |
|  - ProveedorService (CRUD, precios masivos, CSV)               |
|  - AuthService (login, tokens, roles)                          |
+================================================================+
                              |
                    interfaces de repositorio
                              |
+================================================================+
|                     CAPA DE INFRAESTRUCTURA                    |
|  Adaptadores a servicios externos:                             |
|  - PostgreSQL (SQLAlchemy 2.0 + Alembic)                       |
|  - Redis (cache + broker Celery)                               |
|  - AFIP (WSAA + WSFEV1 via pyafipws)                           |
|  - SMTP (envio de emails)                                      |
|  - Celery (tareas asincronas)                                  |
+================================================================+
```

La capa de API nunca accede directamente a PostgreSQL o Redis; lo hace a traves de la capa de servicio, que a su vez utiliza los repositorios de infraestructura. Esta regla de dependencia garantiza que un cambio en la tecnologia de base de datos o en el proveedor fiscal no afecte a los endpoints ni a la logica de negocio.

## 2.2 Transactional Script (Operaciones de Negocio)

Las operaciones criticas del sistema (registro de venta con desarme, cierre de caja con arqueo, facturacion) siguen el patron de Transactional Script: cada operacion de negocio se ejecuta como un script que orquesta multiples pasos dentro de una transaccion de base de datos. Este patron sacrifica la pureza del Domain Model en favor de la claridad transaccional, lo cual es mas apropiado para un POS donde cada operacion es una secuencia finita y predecible de pasos.

## 2.3 Combinacion Resultante

La arquitectura resultante es un hibrido que utiliza capas para la estructura vertical del sistema y transactional scripts para las operaciones atomicas de negocio. Las capas gobiernan la organizacion del codigo y las dependencias entre modulos; los scripts transaccionales gobiernan el flujo de datos dentro de cada operacion critica.

## 2.4 Arquitectura Local-First (Offline-Capable)

El sistema implementa un patron Local-First utilizando IndexedDB (via Dexie.js) en el frontend como base de datos primaria para la operacion de venta. Este patron garantiza que el punto de venta siga operando incluso ante perdida de conectividad con el backend.

### Lectura (Catalogo Local)

El catalogo de productos y precios se descarga al inicio del turno y se almacena localmente en IndexedDB. Las busquedas por codigo de barras y por nombre se realizan contra IndexedDB, eliminando la latencia de red (0ms de round-trip). El cache local se sincroniza con el servidor al abrir caja y periodicamente cada 15 minutos via un mecanismo de delta-sync.

### Escritura (SyncQueue)

Cada venta se guarda inmediatamente en IndexedDB como registro local y se encola en una **SyncQueue** persistente. Esto significa que la venta se confirma al cajero de forma instantanea, sin depender de la respuesta del backend. La SyncQueue utiliza un esquema FIFO que garantiza el orden de procesamiento.

### Sincronizacion (SyncEngine)

Un ServiceWorker o proceso en segundo plano ("SyncEngine") monitorea el estado de la red. Cuando hay conexion disponible, el SyncEngine toma las ventas pendientes de la SyncQueue y las envia al Backend API en lotes, utilizando `POST /v1/ventas/sync-batch`. El procesamiento en lotes reduce el overhead de conexiones HTTP y optimiza el throughput.

```
+------------------+     +-----------------+     +------------------+
|  POS UI          |     | IndexedDB       |     | SyncEngine       |
|  (React)         |     | (Dexie.js)      |     | (ServiceWorker)  |
|                  |     |                 |     |                  |
| 1. Venta         |     | 2. Guardar      |     | 4. Detectar      |
|    confirmada    +---->+    localmente   |     |    conexion      |
|    al cajero     |     | 3. Encolar en   |     | 5. Enviar lote   |
|                  |     |    SyncQueue    +---->+    al Backend    |
|                  |     |                 |     | 6. Marcar como   |
|                  |     |                 |     |    sincronizado  |
+------------------+     +-----------------+     +--------+---------+
                                                          |
                                                   +------v---------+
                                                   | Backend API    |
                                                   | POST /v1/      |
                                                   | ventas/        |
                                                   | sync-batch     |
                                                   +----------------+
```

### Resolucion de Conflictos

El stock en el servidor es la **"Verdad Final"**. Si una venta offline vendio stock que ya no existia al momento de la sincronizacion, el backend la procesa pero la marca como **"Conflicto de Stock"** post-sincronizacion para revision del supervisor. La regla fundamental es: **nunca se bloquea la venta en el momento**. El negocio prefiere vender y resolver discrepancias despues, antes que perder una venta por un problema de conectividad.

| Escenario | Comportamiento |
|-----------|----------------|
| Venta offline, stock disponible al sincronizar | Procesada normalmente |
| Venta offline, stock insuficiente al sincronizar | Procesada + flag `conflicto_stock = true` |
| Multiples terminales offline venden el mismo stock | Ambas procesadas, supervisor resuelve |
| Precio cambio entre venta offline y sync | Se respeta el precio al momento de la venta offline |

---

# 3. Vista de Contexto

La vista de contexto muestra el sistema como una caja negra y las entidades externas con las que interactua.

```
                   +-------------------+
                   |  Cajero           |
                   |  (Operador del    |
                   |   punto de venta) |
                   +--------+----------+
                            |
                   Escanear productos, cobrar,
                   abrir/cerrar caja
                            |
                   +--------v----------+
                   |                   |
                   |    BlendPOS       |
                   |    Platform       |
                   |                   |
                   +---+-------+---+---+
                       |       |   |
          +------------+   +---+   +------------+
          |                |                    |
+---------v----+   +-------v------+   +---------v--------+
| Administrador|   | Supervisor   |   | AFIP             |
| del Sistema  |   | (autoriza    |   | (Facturacion     |
| (productos,  |   |  anulaciones,|   |  electronica)    |
|  proveedores,|   |  cierra cajas|   | WSAA + WSFEV1    |
|  config AFIP)|   |  ajenas)     |   |                  |
+--------------+   +--------------+   +------------------+

                   +-------------------+
                   |  Cliente Final    |
                   |  (Consulta de     |
                   |   precios)        |
                   +-------------------+
```

**Actores:**

- **Cajero**: Opera el punto de venta. Escanea productos, registra ventas, cobra en efectivo o tarjeta, abre y cierra su caja con arqueo ciego.
- **Supervisor**: Autoriza operaciones especiales como anulaciones de ventas, justificacion de desvios de caja y cierre de cajas de otros usuarios.
- **Administrador**: Gestiona productos, proveedores, precios, carga masiva CSV, configuracion fiscal AFIP y usuarios del sistema.
- **Cliente Final**: Utiliza el modo de consulta de precios para verificar el precio de un producto escaneando su codigo de barras.
- **AFIP**: Servicio externo del gobierno argentino para emision de comprobantes fiscales electronicos. La comunicacion es asincrona.

---

# 4. Vista de Contenedores

La vista de contenedores descompone el sistema en sus unidades desplegables independientes y los protocolos de comunicacion entre ellas.

```
+------------------------------------------------------------------+
|                     ENTORNO DE DESPLIEGUE                        |
|                                                                  |
|  +-----------------------+     +-----------------------------+   |
|  |    React Frontend     |     |      FastAPI Backend        |   |
|  |    (SPA)              |     |      (API + Business Logic) |   |
|  |                       |     |                             |   |
|  |  - POS UI             | HTTP|  - REST Endpoints           |   |
|  |  - Caja Management    +----->  - Service Layer            |   |
|  |  - Products Admin     | JSON|  - Auth JWT/OAuth2          |   |
|  |  - Price Checker      <-----+  - Pydantic V2 Validation   |   |
|  |  - Reports            |     |  - Global Exception Handler |   |
|  +-----------------------+     +------+------+------+--------+   |
|                                       |      |      |            |
|                              +--------+  +---+  +---+--------+  |
|                              |           |      |             |  |
|                      +-------v---+ +-----v-+ +--v----------+ |  |
|                      |PostgreSQL | | Redis | | Celery       | |  |
|                      | >= 15     | | >= 7  | | Worker       | |  |
|                      | ACID      | | cache | | facturacion  | |  |
|                      | transact. | | broker| | email        | |  |
|                      | principal | | tasks | | reportes     | |  |
|                      +-----------+ +-------+ +------+------+ |  |
|                                                      |        |  |
|                                              +-------v------+ |  |
|                                              | AFIP         | |  |
|                                              | WSAA+WSFEV1  | |  |
|                                              | (externo)    | |  |
|                                              +--------------+ |  |
|                                                                  |
+------------------------------------------------------------------+
```

**Contenedores y responsabilidades:**

| Contenedor | Tecnologia | Responsabilidad | Puerto |
|------------|-----------|-----------------|--------|
| Frontend | React >= 18 + Vite | Interfaz de usuario: POS, gestion de caja, productos, proveedores, consulta de precios | 5173 (dev) |
| Backend | FastAPI >= 0.110 | API REST, logica de negocio, autenticacion, validacion, orquestacion | 8000 |
| PostgreSQL | PostgreSQL >= 15 | Base de datos relacional principal. Transacciones ACID. Datos de productos, ventas, cajas, comprobantes | 5432 |
| Redis | Redis >= 7.0 | Cache de productos frecuentes, broker de tareas Celery, sessions | 6379 |
| Celery | Celery >= 5.3 | Workers para tareas asincronas: facturacion AFIP, generacion PDF, envio email | N/A |
| AFIP | Servicio externo | Web services de facturacion electronica argentina (WSAA autenticacion, WSFEV1 facturacion) | N/A |

**Protocolos de comunicacion:**

| Origen | Destino | Protocolo | Formato |
|--------|---------|-----------|---------|
| Frontend | Backend | HTTP REST | JSON |
| Backend | PostgreSQL | asyncpg / psycopg | SQL via SQLAlchemy |
| Backend | Redis | redis-py | Comandos Redis |
| Backend | Celery | AMQP via Redis | JSON serializado |
| Celery Worker | AFIP | HTTPS SOAP/REST | XML / JSON |
| Celery Worker | SMTP | SMTP/TLS | Email con adjuntos PDF |

---

# 5. Vista de Componentes

La vista de componentes descompone el contenedor Backend en sus modulos internos, mostrando las responsabilidades y dependencias de cada uno.

```
+------------------------------------------------------------------+
|                        FastAPI Backend                            |
|                                                                  |
|  +------------------------------------------------------------+  |
|  |                    CAPA API                                 |  |
|  |                                                             |  |
|  |  +-------------+  +---------------+  +-----------------+   |  |
|  |  | ventas.py   |  | productos.py  |  | caja.py         |   |  |
|  |  | POST /v1/   |  | CRUD /v1/     |  | POST /v1/       |   |  |
|  |  | ventas      |  | productos     |  | caja/abrir      |   |  |
|  |  +------+------+  +-------+-------+  | caja/cerrar     |   |  |
|  |         |                  |          | caja/arqueo     |   |  |
|  |  +------+------+  +-------+-------+  +--------+--------+   |  |
|  |  | inventario  |  | facturacion   |           |             |  |
|  |  | .py         |  | .py           |           |             |  |
|  |  | GET/POST    |  | POST /v1/     |           |             |  |
|  |  | /v1/        |  | facturas      |           |             |  |
|  |  | inventario  |  +-------+-------+           |             |  |
|  |  +------+------+         |                    |             |  |
|  |         |          +------+------+    +-------+-------+     |  |
|  |         |          | proveedores |    | consulta_     |     |  |
|  |         |          | .py         |    | precios.py    |     |  |
|  |         |          | CRUD /v1/   |    | GET /v1/      |     |  |
|  |         |          | proveedores |    | precio/{code} |     |  |
|  |         |          | POST /v1/   |    +-------+-------+     |  |
|  |         |          | csv/import  |            |             |  |
|  |         |          +------+------+            |             |  |
|  |  +------+------+         |            +-------+-------+     |  |
|  |  | usuarios.py |         |            | auth.py       |     |  |
|  |  | CRUD /v1/   |         |            | POST /v1/     |     |  |
|  |  | usuarios    |         |            | auth/login    |     |  |
|  |  +------+------+         |            | auth/refresh  |     |  |
|  |         |                 |            +-------+-------+     |  |
|  +---------|-----------------|--------------------|-----------+  |
|            |                 |                    |              |
|  +---------|-----------------|--------------------|-----------+  |
|  |         v    CAPA CORE (SERVICIOS)             v           |  |
|  |                                                             |  |
|  |  +---------------+  +----------------+  +--------------+   |  |
|  |  | venta_        |  | inventario_    |  | caja_        |   |  |
|  |  | service.py    |  | service.py     |  | service.py   |   |  |
|  |  | registrar_    |  | desarme_       |  | abrir_caja() |   |  |
|  |  |   venta()     |  |   automatico() |  | registrar_   |   |  |
|  |  | anular_       |  | ajustar_       |  |   movimiento |   |  |
|  |  |   venta()     |  |   stock()      |  | arqueo_      |   |  |
|  |  | calcular_     |  | alertas_       |  |   ciego()    |   |  |
|  |  |   vuelto()    |  |   reposicion() |  | cerrar_      |   |  |
|  |  +---+----+------+  +--------+-------+  |   caja()     |   |  |
|  |      |    |                  |           +--------------+   |  |
|  |      |    |                  |                              |  |
|  |  +---+----+------+  +-------+--------+  +--------------+   |  |
|  |  | facturacion_  |  | proveedor_     |  | auth_        |   |  |
|  |  | service.py    |  | service.py     |  | service.py   |   |  |
|  |  | generar_      |  | actualizar_    |  | login()      |   |  |
|  |  |   comprobante |  |   precios_     |  | crear_token()|   |  |
|  |  | emitir_       |  |   masivo()     |  | validar_     |   |  |
|  |  |   factura_    |  | importar_      |  |   token()    |   |  |
|  |  |   afip()      |  |   csv()        |  | refresh()    |   |  |
|  |  +---------------+  +----------------+  +--------------+   |  |
|  +------------------------------------------------------------+  |
|            |          |           |                               |
|  +---------|----------|-----------|---------------------------+   |
|  |         v    CAPA INFRAESTRUCTURA                          |   |
|  |                                                             |  |
|  |  +-----------+    +----------+    +------------------+     |  |
|  |  |database.py|    | redis.py |    | afip.py          |     |  |
|  |  |get_db()   |    | get_     |    | obtener_CAE()    |     |  |
|  |  |Session    |    | redis()  |    | get_afip_client()|     |  |
|  |  |Factory    |    | cache    |    +------------------+     |  |
|  |  +-----------+    +----------+                             |  |
|  |                                   +------------------+     |  |
|  |  +-----------+                    | smtp.py          |     |  |
|  |  | celery.py |                    | enviar_email()   |     |  |
|  |  | app config|                    | adjuntar_pdf()   |     |  |
|  |  | task queue|                    +------------------+     |  |
|  |  +-----------+                                             |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

### Inventario de Componentes

| Componente | Capa | Responsabilidad | Dependencias Internas |
|------------|------|-----------------|----------------------|
| `main.py` | API | Entry point FastAPI, registro de routers, startup/shutdown events | Todos los routers API |
| `settings.py` | Config | Variables de entorno via Pydantic BaseSettings | Ninguna |
| `ventas.py` | API | Endpoints POST /v1/ventas, DELETE /v1/ventas/{id} | venta_service, auth |
| `productos.py` | API | Endpoints CRUD /v1/productos, busqueda por barcode/nombre | productos (modelos), auth |
| `inventario.py` | API | Endpoints de ajuste de stock, desarme manual, alertas | inventario_service, auth |
| `caja.py` | API | Endpoints de apertura, movimientos, arqueo, cierre | caja_service, auth |
| `facturacion.py` | API | Endpoints de generacion de comprobantes, historial | facturacion_service, auth |
| `proveedores.py` | API | Endpoints CRUD, actualizacion masiva, importacion CSV | proveedor_service, auth |
| `consulta_precios.py` | API | Endpoint GET /v1/precio/{barcode} (sin auth) | database |
| `auth.py` | API | Endpoints login, refresh, registro | auth_service |
| `usuarios.py` | API | Endpoints CRUD de usuarios con roles | auth_service, auth |
| `venta_service.py` | Core | Logica de registro de venta con transaccionalidad ACID | inventario_service, caja_service, database |
| `inventario_service.py` | Core | Logica de desarme automatico, ajustes de stock | database |
| `caja_service.py` | Core | Ciclo de vida de caja, arqueo ciego, desvios | database |
| `facturacion_service.py` | Core | Generacion de comprobantes, coordinacion con AFIP | celery tasks, afip |
| `proveedor_service.py` | Core | CRUD proveedores, actualizacion masiva, CSV import | database |
| `auth_service.py` | Core | Login, creacion/validacion JWT, hash de passwords | database |
| `database.py` | Infra | Factory de sesion SQLAlchemy, engine, pool de conexiones | settings |
| `redis.py` | Infra | Factory de conexion Redis, cache de productos | settings |
| `afip.py` | Infra | Cliente pyafipws para WSAA y WSFEV1 | settings |
| `smtp.py` | Infra | Cliente SMTP asincrono para envio de emails | settings |
| `celery.py` | Infra | Configuracion de app Celery, broker Redis | settings |

---

# 6. Vista de Codigo

La vista de codigo detalla las estructuras de datos principales, las interfaces clave y la organizacion interna de los modulos mas criticos.

## 6.1 Modelo Producto (SQLAlchemy)

```
Producto (Table: productos)
+---------------------------------------------------+
| id              : UUID (PK)                        |
| codigo_barras   : str (UNIQUE, INDEXED)            |
| nombre          : str (INDEXED)                    |
| descripcion     : str | None                       |
| categoria       : str                              |
| precio_costo    : Decimal(10,2)                    |
| precio_venta    : Decimal(10,2)                    |
| margen_pct      : Decimal(5,2) (computed)          |
| stock_actual    : int                              |
| stock_minimo    : int (default: 5)                 |
| unidad_medida   : str (default: "unidad")          |
| es_padre        : bool (default: false)            |
| proveedor_id    : UUID (FK -> proveedores.id)      |
| activo          : bool (default: true)             |
| created_at      : datetime                         |
| updated_at      : datetime                         |
+---------------------------------------------------+

ProductoHijo (Table: productos_hijos)
+---------------------------------------------------+
| id                : UUID (PK)                      |
| producto_padre_id : UUID (FK -> productos.id)      |
| producto_hijo_id  : UUID (FK -> productos.id)      |
| unidades_por_padre: int                            |
| desarme_auto      : bool (default: true)           |
| UNIQUE(producto_padre_id, producto_hijo_id)        |
+---------------------------------------------------+
```

## 6.2 Modelo Venta (SQLAlchemy)

```
Venta (Table: ventas)
+---------------------------------------------------+
| id              : UUID (PK)                        |
| numero_ticket   : int (UNIQUE, auto-increment)     |
| sesion_caja_id  : UUID (FK -> sesiones_caja.id)    |
| usuario_id      : UUID (FK -> usuarios.id)         |
| subtotal        : Decimal(12,2)                    |
| descuento_total : Decimal(12,2) (default: 0)      |
| total           : Decimal(12,2)                    |
| estado          : Enum(completada, anulada)        |
| comprobante_id  : UUID (FK -> comprobantes.id)     |
| created_at      : datetime                         |
+---------------------------------------------------+

VentaItem (Table: venta_items)
+---------------------------------------------------+
| id              : UUID (PK)                        |
| venta_id        : UUID (FK -> ventas.id)           |
| producto_id     : UUID (FK -> productos.id)        |
| cantidad        : int                              |
| precio_unitario : Decimal(10,2)                    |
| descuento_item  : Decimal(10,2) (default: 0)      |
| subtotal        : Decimal(12,2)                    |
+---------------------------------------------------+

VentaPago (Table: venta_pagos)
+---------------------------------------------------+
| id              : UUID (PK)                        |
| venta_id        : UUID (FK -> ventas.id)           |
| metodo          : Enum(efectivo, debito, credito,  |
|                         transferencia)             |
| monto           : Decimal(12,2)                    |
+---------------------------------------------------+
```

## 6.3 Modelo Caja (SQLAlchemy)

```
SesionCaja (Table: sesiones_caja)
+---------------------------------------------------+
| id              : UUID (PK)                        |
| punto_de_venta  : int                              |
| usuario_id      : UUID (FK -> usuarios.id)         |
| monto_inicial   : Decimal(12,2)                    |
| monto_esperado  : Decimal(12,2) | None             |
| monto_declarado : Decimal(12,2) | None             |
| desvio          : Decimal(12,2) | None             |
| desvio_pct      : Decimal(5,2) | None              |
| estado          : Enum(abierta, cerrada)           |
| observaciones   : str | None                       |
| opened_at       : datetime                         |
| closed_at       : datetime | None                  |
+---------------------------------------------------+

MovimientoCaja (Table: movimientos_caja)
+---------------------------------------------------+
| id              : UUID (PK)                        |
| sesion_caja_id  : UUID (FK -> sesiones_caja.id)    |
| tipo            : Enum(venta, ingreso_manual,      |
|                        egreso_manual, anulacion)   |
| metodo_pago     : Enum(efectivo, debito, credito,  |
|                        transferencia) | None       |
| monto           : Decimal(12,2)                    |
| descripcion     : str                              |
| referencia_id   : UUID | None (FK -> ventas.id)    |
| created_at      : datetime                         |
+---------------------------------------------------+
```

## 6.4 Modelo Comprobante (SQLAlchemy)

```
Comprobante (Table: comprobantes)
+---------------------------------------------------+
| id              : UUID (PK)                        |
| tipo            : Enum(factura_a, factura_b,       |
|                        factura_c, nota_credito_a,  |
|                        nota_credito_b, ticket)     |
| numero          : int                              |
| punto_de_venta  : int                              |
| cae             : str | None                       |
| cae_vencimiento : date | None                      |
| receptor_cuit   : str | None                       |
| receptor_nombre : str | None                       |
| detalle         : JSONB                            |
| monto_neto      : Decimal(12,2)                    |
| monto_iva       : Decimal(12,2)                    |
| monto_total     : Decimal(12,2)                    |
| estado          : Enum(pendiente, emitido, error)  |
| pdf_path        : str | None                       |
| venta_id        : UUID (FK -> ventas.id)           |
| created_at      : datetime                         |
+---------------------------------------------------+
```

## 6.5 Modelo Usuario y Proveedor

```
Usuario (Table: usuarios)
+---------------------------------------------------+
| id              : UUID (PK)                        |
| username        : str (UNIQUE)                     |
| email           : str (UNIQUE)                     |
| hashed_password : str                              |
| nombre_completo : str                              |
| rol             : Enum(cajero, supervisor, admin)   |
| punto_de_venta  : int | None                       |
| activo          : bool (default: true)             |
| created_at      : datetime                         |
+---------------------------------------------------+

Proveedor (Table: proveedores)
+---------------------------------------------------+
| id              : UUID (PK)                        |
| razon_social    : str                              |
| cuit            : str (UNIQUE)                     |
| telefono        : str | None                       |
| email           : str | None                       |
| direccion       : str | None                       |
| condicion_pago  : str | None                       |
| activo          : bool (default: true)             |
| created_at      : datetime                         |
| updated_at      : datetime                         |
+---------------------------------------------------+
```

---

# 7. Flujos de Datos

## 7.1 Flujo de Registro de Venta (con Desarme Automatico)

Este flujo muestra la operacion mas critica del sistema: el registro de una venta que requiere desarme automatico de un bulto.

```
Cajero
     |
     | POST /v1/ventas
     | { sesion_caja_id, items: [{barcode, cantidad}], pagos: [{metodo, monto}] }
     v
+-----------+     +--------------------+     +-------------------+
| API:      |     | Core:              |     | Core:             |
| ventas.py | --> | venta_service.py   | --> | inventario_       |
| Validar   |     | registrar_venta()  |     | service.py        |
| auth JWT  |     | BEGIN TRANSACTION  |     | descontar_stock() |
+-----------+     +--------------------+     +--------+----------+
                                                      |
                                         stock_hijo >= cantidad?
                                                      |
                                            +----+----+----+
                                            |              |
                                           SI             NO
                                            |              |
                                            v              v
                                    +-----------+  +------------------+
                                    | Decrementar|  | desarme_         |
                                    | stock hijo |  | automatico()     |
                                    |            |  | stock_padre -= 1 |
                                    |            |  | stock_hijo +=    |
                                    |            |  |   units_per_parent|
                                    |            |  | Decrementar      |
                                    |            |  | stock hijo       |
                                    +-----------+  +------------------+
                                            |              |
                                            +------+-------+
                                                   |
                                                   v
                                    +-----------------------------+
                                    | Core: caja_service.py       |
                                    | registrar_movimiento()      |
                                    | Por cada metodo de pago:    |
                                    |   crear MovimientoCaja      |
                                    +-------------+---------------+
                                                  |
                                                  v
                                    +-----------------------------+
                                    | COMMIT TRANSACTION          |
                                    | (todo o nada)               |
                                    +-------------+---------------+
                                                  |
                                                  v
                                    +-----------------------------+
                                    | Async: Celery task          |
                                    | generar_comprobante()       |
                                    | (PDF o AFIP, no bloquea)    |
                                    +-----------------------------+
```

## 7.2 Flujo de Cierre de Caja (Arqueo Ciego)

```
Cajero
     |
     | POST /v1/caja/arqueo
     | { sesion_caja_id, declaracion: {efectivo, debito, credito, transferencia} }
     v
+-----------+     +--------------------+
| API:      |     | Core:              |
| caja.py   | --> | caja_service.py    |
| Validar   |     | arqueo_ciego()     |
| auth JWT  |     |                    |
+-----------+     +--------+-----------+
                           |
              1. Guardar declaracion del cajero
              2. Calcular monto esperado (SUM movimientos)
              3. Calcular desvio = declarado - esperado
              4. Clasificar desvio:
                 |
          +------+------+------+
          |             |      |
    <= 1%         1%-5%     > 5%
    NORMAL      WARNING    CRITICO
          |             |      |
          v             v      v
  Registrar      Registrar   Registrar +
  y cerrar       y cerrar    REQUIERE
                             justificacion
                             supervisor
```

## 7.3 Flujo de Facturacion Asincrona (AFIP)

```
Venta completada
     |
     | Celery task: emitir_factura_afip
     v
+-----------+     +--------------------+     +-------------------+
| Infra:    |     | Infra:             |     | Infra:            |
| celery.py | --> | afip.py            | --> | smtp.py           |
| dequeue   |     | 1. WSAA: obtener   |     | Enviar email      |
| task      |     |    token_auth      |     | con PDF adjunto   |
+-----------+     | 2. WSFEV1: emitir  |     +-------------------+
                  |    comprobante     |
                  | 3. Obtener CAE     |
                  | 4. Generar PDF     |
                  | 5. Actualizar      |
                  |    comprobante     |
                  |    en DB           |
                  +--------------------+
                           |
                      OK o Error?
                           |
                  +--------+--------+
                  |                 |
                 OK              Error
                  |                 |
                  v                 v
           Estado:            Estado: error
           emitido            (retry con backoff)
           CAE guardado       Notificar admin
```

## 7.4 Flujo de Carga Masiva CSV

```
Administrador
     |
     | POST /v1/csv/import (multipart/form-data)
     | proveedor_id + archivo.csv
     v
+-----------+     +--------------------+     +-------------------+
| API:      |     | Core:              |     | Validacion        |
| proveed.py| --> | proveedor_         | --> | por fila:         |
| Validar   |     | service.py         |     | - barcode format  |
| MIME type |     | importar_csv()     |     | - precio > 0      |
+-----------+     +--------------------+     | - nombre no vacio |
                                             | - units_per > 0   |
                                             +--------+----------+
                                                      |
                                         +------------+------------+
                                         |                         |
                                    Filas validas           Filas invalidas
                                         |                         |
                                         v                         v
                                  +-----------+            +-------------+
                                  | Upsert en |            | Lista de    |
                                  | productos |            | errores con |
                                  | (por      |            | nro de fila |
                                  | barcode)  |            | y motivo    |
                                  +-----------+            +-------------+
                                         |                         |
                                         +------------+------------+
                                                      |
                                                      v
                                              +---------------+
                                              | Response:     |
                                              | total, ok,    |
                                              | errores,      |
                                              | preview       |
                                              +---------------+
```

---

# 8. Patrones de Diseño Aplicados

## 8.1 Service Layer Pattern

Toda la logica de negocio reside en servicios con responsabilidad unica: `venta_service`, `inventario_service`, `caja_service`, `facturacion_service`, `proveedor_service`. Los endpoints de la API solo validan datos de entrada, invocan al servicio correspondiente y formatean la respuesta. Esta separacion permite testear la logica de negocio sin levantar el servidor HTTP.

## 8.2 Repository Pattern (via SQLAlchemy)

El acceso a datos se abstrae mediante sesiones de SQLAlchemy inyectadas via `Depends(get_db)`. Los servicios trabajan con modelos SQLAlchemy sin construir SQL crudo. Esto facilita el testing con transacciones rollback y la migracion a otras bases de datos si fuera necesario.

## 8.3 Unit of Work Pattern

Cada request HTTP recibe su propia sesion de base de datos que actua como Unit of Work. Al finalizar el request, se hace commit si no hubo errores o rollback si hubo excepciones. Las operaciones criticas como `registrar_venta()` ejecutan todo dentro de una transaccion explicita.

## 8.4 Factory Pattern

Las conexiones a servicios externos (PostgreSQL, Redis, AFIP, SMTP) se crean mediante funciones factory (`get_db()`, `get_redis()`, `get_afip_client()`) que encapsulan la configuracion y el pooling. Esto permite inyectar mocks en testing y cambiar proveedores sin afectar la logica de negocio.

## 8.5 Strategy Pattern

El procesamiento de pagos utiliza un Strategy Pattern implicito: cada metodo de pago (efectivo, debito, credito, transferencia) tiene su propia logica de validacion y registro, seleccionada dinamicamente por el campo `metodo`. La generacion de comprobantes tambien usa este patron: factura A, B, C o ticket interno se procesan con logica diferente.

## 8.6 Observer Pattern (Celery Signals)

La emision de facturacion y el envio de emails se desacoplan mediante Celery. Cuando una venta se completa exitosamente, se encolan tareas asincronas que observan el evento de "venta completada" y ejecutan las acciones correspondientes sin bloquear al cajero.

## 8.7 Decorator Pattern (Auth Dependencies)

La autenticacion y autorizacion se implementan como dependencies de FastAPI que decoran los endpoints. `Depends(get_current_user)` valida el JWT, `Depends(require_role("admin"))` verifica el rol. Los endpoints se declaran con sus requisitos de seguridad de forma declarativa.

---

# 9. Modelo de Datos

## 9.1 Diagrama Relacional

```
+------------------+       +--------------------+
|   proveedores    |       |     usuarios       |
+------------------+       +--------------------+
| id          (PK) |       | id           (PK)  |
| razon_social     |       | username           |
| cuit             |       | hashed_password    |
| ...              |       | rol                |
+--------+---------+       +--------+-----------+
         |                          |
         | 1:N                      | 1:N
         |                          |
+--------v---------+       +-------v-----------+
|    productos     |       |  sesiones_caja    |
+------------------+       +-------------------+
| id          (PK) |       | id          (PK)  |
| codigo_barras    |       | punto_de_venta    |
| nombre           |       | usuario_id  (FK)  |
| precio_costo     |       | monto_inicial     |
| precio_venta     |       | monto_esperado    |
| stock_actual     |       | monto_declarado   |
| es_padre         |       | desvio            |
| proveedor_id(FK) |       | estado            |
+--------+---------+       +--------+----------+
         |                          |
    +----+----+                     | 1:N
    |         |                     |
    | 1:N     | M:N         +------v----------+
    |         |             | movimientos_caja|
+---v---------v---+         +-----------------+
| productos_hijos |         | id         (PK) |
+-----------------+         | sesion_id  (FK) |
| id         (PK) |         | tipo             |
| padre_id   (FK) |         | metodo_pago      |
| hijo_id    (FK) |         | monto            |
| units_per_padre |         | referencia_id    |
+-----------------+         +-----------------+
                                    ^
         +--------+--------+       |
         |   ventas         |       |
         +-----------------+       |
         | id         (PK) |-------+
         | numero_ticket   |
         | sesion_id  (FK) |
         | usuario_id (FK) |
         | total           |
         | estado          |
         +--------+--------+
                  |
         +--------+--------+    +------------------+
         | 1:N    |    1:N |    |   comprobantes   |
    +----v----+  +v--------+   +------------------+
    |venta_   |  |venta_   |   | id          (PK) |
    |items    |  |pagos    |   | tipo              |
    +---------+  +---------+   | numero            |
    |venta_id |  |venta_id |   | cae               |
    |producto |  |metodo   |   | venta_id    (FK)  |
    |cantidad |  |monto    |   | monto_total       |
    |precio   |  +---------+   | estado            |
    +---------+                +------------------+
```

## 9.2 Indices Criticos

| Tabla | Columna(s) | Tipo | Justificacion |
|-------|-----------|------|---------------|
| productos | codigo_barras | UNIQUE B-Tree | Busqueda <100ms por escaneo |
| productos | nombre | GIN (trigram) | Busqueda por nombre con autocompletado |
| productos | proveedor_id | B-Tree | Filtro por proveedor en actualizacion masiva |
| ventas | sesion_caja_id | B-Tree | Sumatoria de movimientos para cierre de caja |
| ventas | created_at | B-Tree | Reportes por rango de fecha |
| movimientos_caja | sesion_caja_id | B-Tree | Calculo de monto esperado en cierre |
| comprobantes | venta_id | B-Tree | Vinculacion venta-comprobante |

---

# 10. Decisiones Arquitectonicas

## ADR-001: PostgreSQL como base de datos principal

**Contexto**: El sistema requiere transacciones ACID para operaciones monetarias y de inventario.

**Decision**: Usar PostgreSQL como unica base de datos relacional.

**Justificacion**: PostgreSQL ofrece transacciones serializables, JSONB para datos flexibles (detalle de comprobantes), indices GIN para busqueda por nombre, y soporte maduro para pool de conexiones via asyncpg. Alternativas como MySQL no ofrecen el mismo nivel de aislamiento transaccional, y bases NoSQL como MongoDB no garantizan ACID a nivel de documento compuesto.

**Consecuencias**: Requiere Alembic para migraciones. El despliegue necesita un contenedor PostgreSQL. La escalabilidad horizontal se limita a read replicas.

## ADR-002: Facturacion asincrona via Celery

**Contexto**: La integracion con AFIP es lenta (2-5 segundos por request) y puede fallar por timeout.

**Decision**: La emision de comprobantes fiscales se procesa de forma asincrona via workers Celery.

**Justificacion**: El cajero no debe esperar a que AFIP responda para completar una venta. El desacople asincrono permite confirmar la venta inmediatamente y procesar la facturacion en segundo plano con retry automatico ante fallas.

**Consecuencias**: Requiere Redis como broker, workers Celery separados, y un mecanismo de notificacion cuando la facturacion falla permanentemente. El estado del comprobante tiene tres estados: pendiente, emitido, error.

## ADR-003: Arqueo ciego como default

**Contexto**: El cierre de caja necesita detectar desvios de forma confiable.

**Decision**: El cajero declara lo que contó sin ver el monto esperado por el sistema.

**Justificacion**: Si el cajero ve el monto esperado, tiende a ajustar su conteo para que coincida, ocultando desvios reales. El arqueo ciego fuerza al cajero a contar sin sesgo y luego el sistema calcula la diferencia real.

**Consecuencias**: La UI de cierre no puede mostrar subtotales esperados durante el arqueo. El desvio se calcula y muestra post-declaracion.

## ADR-004: Movimientos de caja inmutables

**Contexto**: Las modificaciones de registros monetarios abren la puerta a fraudes contables.

**Decision**: Los movimientos de caja son eventos inmutables. Las anulaciones crean movimientos inversos, nunca eliminan ni modifican el original.

**Justificacion**: El registro inmutable crea una pista de auditoria completa que permite reconstruir el estado de la caja en cualquier momento. Es un principio fundamental de contabilidad de partida simple.

**Consecuencias**: El calculo del saldo actual requiere sumar todos los movimientos, no consultar un saldo almacenado. Esto se mitiga con indices en sesion_caja_id.

## ADR-005: JWT con roles para autenticacion

**Contexto**: Multiples usuarios con diferentes permisos operan el sistema simultaneamente.

**Decision**: Autenticacion via JWT con roles (cajero, supervisor, administrador) codificados en el token.

**Justificacion**: JWT permite autenticacion stateless, lo cual simplifica el escalado horizontal. Los roles codificados en el token evitan consultas a la DB en cada request. OAuth2 es el estandar de la industria.

**Consecuencias**: El token expira a las 8 horas (un turno). Si se revoca un usuario, su token sigue valido hasta que expire. Para revocar inmediatamente, se necesita una blacklist en Redis (implementable pero fuera del MVP).

---

# 11. Infraestructura y Despliegue

## 11.1 Modelo de Despliegue: SaaS en la Nube

BlendPOS se empaqueta como un producto SaaS: cada cliente (kiosco/drugstore) opera contra una instancia desplegada en un **Digital Ocean Droplet** (o similar). El comprador accede via navegador como una **Progressive Web App (PWA)** que funciona con o sin internet.

```
+------------------------------------------------------------------+
|                    DIGITAL OCEAN DROPLET                           |
|                    (Ubuntu + Docker)                               |
|                                                                    |
|  +-----------------------------------------------------------+    |
|  | Traefik (Reverse Proxy)                                    |    |
|  | - Dominio: app.tukiosco.com                                |    |
|  | - SSL: Let's Encrypt (auto-renewal)                        |    |
|  | - Ruteo: /api/* -> backend:8000, /* -> frontend:80         |    |
|  +---+---------------------------+---------------------------+    |
|      |                           |                                 |
|  +---v-----------+   +-----------v-----------+                     |
|  | Nginx         |   | FastAPI Backend       |                     |
|  | (Frontend)    |   | (API + Business Logic) |                     |
|  | Sirve:        |   | - REST Endpoints       |                     |
|  | - React SPA   |   | - Service Layer        |                     |
|  | - PWA manifest|   | - Auth JWT             |                     |
|  | - SW.js       |   | - Pydantic V2          |                     |
|  | Puerto: 80    |   | Puerto: 8000           |                     |
|  +---------------+   +------+------+----------+                    |
|                              |      |                              |
|                     +--------+  +---+--------+                     |
|                     |           |             |                     |
|              +------v---+ +----v----+ +------v------+              |
|              |PostgreSQL| | Redis   | | Celery      |              |
|              | >= 15    | | >= 7    | | Worker      |              |
|              | ACID     | | cache   | | facturacion |              |
|              | verdad   | | broker  | | email, PDF  |              |
|              | final    | | tasks   | +------+------+              |
|              +----------+ +---------+        |                     |
|                                       +------v------+              |
|                                       | AFIP        |              |
|                                       | WSAA+WSFEV1 |              |
|                                       | (externo)   |              |
|                                       +-------------+              |
+------------------------------------------------------------------+

                          INTERNET
                             |
                    HTTPS (Let's Encrypt)
                             |
+----------------------------v---------------------------------+
|                     PC DEL KIOSCO                             |
|                                                               |
|  +----------------------------+   +------------------------+  |
|  | Chrome / Edge              |   | IndexedDB (Dexie.js)   |  |
|  | PWA Instalada              |   | - Catalogo productos   |  |
|  | app.tukiosco.com           |   | - SyncQueue ventas     |  |
|  |                            |   | - Cache precios        |  |
|  | ServiceWorker:             |   +------------------------+  |
|  | - Cache assets (offline)   |                               |
|  | - SyncEngine (batch sync)  |   +------------------------+  |
|  | - Background Sync          |   | Impresora Termica      |  |
|  +----------------------------+   | ESC/POS (USB/Red)      |  |
|                                   +------------------------+  |
+---------------------------------------------------------------+
```

## 11.2 Docker Compose Produccion

```yaml
# docker-compose.prod.yml
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}"
      - "--certificatesresolvers.letsencrypt.acme.storage=/certs/acme.json"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - certs:/certs

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(`${DOMAIN}`)"
      - "traefik.http.routers.frontend.entrypoints=websecure"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"

  backend:
    build: ./backend
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.backend.rule=Host(`${DOMAIN}`) && PathPrefix(`/api`, `/v1`)"
      - "traefik.http.routers.backend.entrypoints=websecure"
      - "traefik.http.routers.backend.tls.certresolver=letsencrypt"
    depends_on: [postgres, redis]
    env_file: .env

  celery-worker:
    build: ./backend
    command: celery -A app.tasks.worker worker
    depends_on: [postgres, redis]
    env_file: .env

  postgres:
    image: postgres:15
    volumes: [pgdata:/var/lib/postgresql/data]
    env_file: .env

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
  certs:
```

## 11.3 Docker Compose Desarrollo

```yaml
# docker-compose.yml (dev)
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    command: uvicorn app.main:app --reload --host 0.0.0.0
    depends_on: [postgres, redis]
    env_file: .env
    volumes: ["./backend:/app"]

  celery-worker:
    build: ./backend
    command: celery -A app.tasks.worker worker --loglevel=info
    depends_on: [postgres, redis]
    env_file: .env

  postgres:
    image: postgres:15
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: blendpos
      POSTGRES_USER: blendpos
      POSTGRES_PASSWORD: blendpos

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  pgdata:
```

## 11.4 Variables de Entorno Criticas

| Variable | Descripcion | Ejemplo |
|----------|-------------|---------|
| DOMAIN | Dominio del cliente | app.tukiosco.com |
| ACME_EMAIL | Email para Let's Encrypt | admin@tukiosco.com |
| DATABASE_URL | Conexion PostgreSQL | postgresql+asyncpg://user:pass@postgres:5432/blendpos |
| REDIS_URL | Conexion Redis | redis://redis:6379/0 |
| JWT_SECRET | Secreto para firma JWT | (generado, 256 bits) |
| JWT_EXPIRATION_HOURS | Duracion del token | 8 |
| AFIP_CERT_PATH | Certificado AFIP | /certs/afip.crt |
| AFIP_KEY_PATH | Clave privada AFIP | /certs/afip.key |
| AFIP_CUIT | CUIT del contribuyente | 20123456789 |
| SMTP_HOST | Servidor SMTP | smtp.gmail.com |
| SMTP_PORT | Puerto SMTP | 587 |
| SMTP_USER | Usuario SMTP | blendpos@example.com |
| SMTP_PASSWORD | Password SMTP | (secreto) |

## 11.5 Flujo de Despliegue de un Nuevo Cliente

```
1. Crear Droplet (Ubuntu 22.04, 2GB RAM minimo)
2. Instalar Docker + Docker Compose
3. Clonar repositorio BlendPOS
4. Configurar .env con dominio, CUIT, AFIP certs del cliente
5. docker compose -f docker-compose.prod.yml up -d
6. Traefik genera SSL automaticamente
7. Cliente accede a https://app.tukiosco.com
8. Instala la PWA desde el navegador
9. Catalogo se descarga a IndexedDB
10. Listo para vender
```

---

# 12. Seguridad

## 12.1 Autenticacion y Autorizacion

- Todas las contraseñas se hashean con bcrypt (cost factor 12).
- Los tokens JWT se firman con HS256 y un secreto de 256 bits.
- Cada endpoint declara su nivel de acceso minimo via dependency injection.
- El endpoint de consulta de precios es el unico sin autenticacion.

## 12.2 Proteccion de Datos

- Los certificados AFIP se montan como volumenes Docker, nunca se incluyen en el codigo.
- Las credenciales de base de datos, SMTP y JWT se cargan exclusivamente desde variables de entorno.
- Las respuestas de error nunca exponen stack traces ni rutas de archivo del servidor.
- Los logs registran errores con contexto pero sin datos sensibles (passwords, tokens).

## 12.3 Validacion de Entrada

- Todos los payloads JSON se validan con Pydantic V2 antes de procesarse.
- Los archivos CSV se validan por MIME type antes de parsearse.
- Los codigos de barras se sanitizan (solo digitos, longitud valida).
- Los montos monetarios se validan como Decimal positivos con maximo 2 decimales.

---

# 13. Observabilidad

## 13.1 Logging

Cada request genera un `request_id` (UUID) que se propaga a todos los logs de la operacion. Los servicios registran:

- Inicio y fin de transacciones criticas (ventas, desarmes, cierres de caja).
- Errores con contexto completo (sin datos sensibles).
- Operaciones de facturacion AFIP (request enviado, respuesta recibida, CAE obtenido o error).
- Alertas de stock minimo.

## 13.2 Health Checks

```
GET /health -> { "ok": true, "db": "connected", "redis": "connected" }
```

El endpoint de health verifica conectividad con PostgreSQL y Redis. Es consumido por Docker health checks y monitores externos.

---

# 14. Escalabilidad y Evolucion

## 14.1 Escalabilidad Inmediata

- **Multiples cajas**: El sistema soporta multiples sesiones de caja concurrentes gracias a las transacciones serializables de PostgreSQL.
- **Multiples workers**: Los workers Celery pueden escalarse horizontalmente para procesar facturacion en paralelo.
- **Cache de productos**: Redis cache los productos frecuentes para mantener la latencia sub-100ms incluso con tablas grandes.

## 14.2 Evoluciones Futuras

- **Sucursales**: Soporte multi-sucursal con base de datos compartida o federada.
- **E-commerce**: Integracion con canal de venta online que comparte inventario en tiempo real.
- **Reporteria avanzada**: Dashboard con metricas de ventas, margenes, rotacion de stock, ABC de productos.
- **Promociones**: Motor de reglas para descuentos por cantidad, combos, horario, medio de pago.
- **Fidelizacion**: Programa de puntos asociado al cliente registrado.
- **Backup automatizado**: Snapshots de PostgreSQL programados con PITR (Point-in-Time Recovery).
