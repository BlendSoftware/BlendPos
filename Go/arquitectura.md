# Arquitectura de Software — BlendPOS (Go)

> Version: 1.0.0
> Fecha: 2026-02-16
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

Estas tres fuerzas convergen en una arquitectura que privilegia la transaccionalidad estricta en la capa de datos, la separacion clara entre logica de negocio y comunicacion con servicios externos, y el procesamiento asincrono de tareas que no son criticas para el flujo del cajero (facturacion, email, reportes). Go, como lenguaje compilado con concurrencia nativa, es ideal para esta arquitectura: ofrece latencia baja sin overhead de interpretacion, goroutines para procesamiento asincrono sin dependencias externas, y compilacion a binario unico para despliegue simplificado.

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
|  Gin: Endpoints REST (handlers)                                |
|  Responsabilidad: Validacion de entrada (validator v10),       |
|  autenticacion JWT (middleware), enrutamiento, serializacion   |
|  JSON, manejo de errores HTTP                                  |
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
|  - PostgreSQL (GORM 2.0 + pgx + golang-migrate)               |
|  - Redis (go-redis: cache + job queue)                         |
|  - AFIP Sidecar Client (net/http → Python Sidecar)             |
|  - SMTP (jordan-wright/email)                                  |
|  - Worker Pool (goroutines + channels)                         |
+================================================================+
```

La capa de API nunca accede directamente a PostgreSQL o Redis; lo hace a traves de la capa de servicio, que a su vez utiliza los repositorios de infraestructura. Esta regla de dependencia garantiza que un cambio en la tecnologia de base de datos o en el proveedor fiscal no afecte a los endpoints ni a la logica de negocio.

## 2.2 Transactional Script (Operaciones de Negocio)

Las operaciones criticas del sistema (registro de venta con desarme, cierre de caja con arqueo, facturacion) siguen el patron de Transactional Script: cada operacion de negocio se ejecuta como un script que orquesta multiples pasos dentro de una transaccion de base de datos (via `db.Transaction()` de GORM). Este patron sacrifica la pureza del Domain Model en favor de la claridad transaccional, lo cual es mas apropiado para un POS donde cada operacion es una secuencia finita y predecible de pasos.

## 2.3 Combinacion Resultante

La arquitectura resultante es un hibrido que utiliza capas para la estructura vertical del sistema y transactional scripts para las operaciones atomicas de negocio. Las capas gobiernan la organizacion del codigo y las dependencias entre modulos; los scripts transaccionales gobiernan el flujo de datos dentro de cada operacion critica.

## 2.4 Arquitectura Local-First (Offline-Capable)

El sistema implementa un patron Local-First utilizando IndexedDB (via Dexie.js) en el frontend como base de datos primaria para la operacion de venta. Este patron garantiza que el punto de venta siga operando incluso ante perdida de conectividad con el backend.

### Lectura (Catalogo Local)

El catalogo de productos y precios se descarga al inicio del turno y se almacena localmente en IndexedDB. Las busquedas por codigo de barras y por nombre se realizan contra IndexedDB, eliminando la latencia de red (0ms de round-trip). El cache local se sincroniza con el servidor al abrir caja y periodicamente cada 15 minutos via un mecanismo de delta-sync.

### Escritura (SyncQueue)

Cada venta se guarda inmediatamente en IndexedDB como registro local y se encola en una **SyncQueue** persistente. Esto significa que la venta se confirma al cajero de forma instantanea, sin depender de la respuesta del backend. La SyncQueue utiliza un esquema FIFO que garantiza el orden de procesamiento.

### Sincronizacion (SyncEngine)

Un ServiceWorker o proceso en segundo plano ("SyncEngine") monitorea el estado de la red. Cuando hay conexion disponible, el SyncEngine toma las ventas pendientes de la SyncQueue y las envia al Backend API en lotes, utilizando `POST /v1/ventas/sync-batch`.

### Resolucion de Conflictos

> **⚠️ DEUDA TÉCNICA CRÍTICA — Rediseñar en Fase 8**
>
> El modelo actual de resolución de conflictos delega la reconciliación al supervisor de forma **manual**. Este enfoque no escala operativamente: en un escenario con múltiples terminales offline vendiendo simultáneamente, el volumen de conflictos puede superar la capacidad humana de resolución, generando acumulación de alertas sin resolver y pérdida de confiabilidad en el control de stock.
>
> **Solución pendiente (Fase 8):** Implementar un motor de compensación automática con reglas configurables:
> - **Límites de venta virtual**: Establecer un techo de unidades vendibles offline por producto (ej: no vender más del 50% del stock conocido al inicio del turno).
> - **Reglas de compensación automática**: Si el conflicto es menor a un umbral configurable (ej: ≤ 3 unidades), aplicar ajuste automático de stock negativo con registro en log de compensaciones.
> - **Escalamiento selectivo**: Solo escalar al supervisor los conflictos que superen el umbral automático.
> - **Alertas proactivas**: Notificar al cajero cuando el stock local de un producto está en zona de riesgo de conflicto.

El stock en el servidor es la **"Verdad Final"**. Si una venta offline vendio stock que ya no existia al momento de la sincronizacion, el backend la procesa pero la marca como **"Conflicto de Stock"** post-sincronizacion para revision del supervisor. La regla fundamental es: **nunca se bloquea la venta en el momento**.

| Escenario | Comportamiento |
|-----------|----------------|
| Venta offline, stock disponible al sincronizar | Procesada normalmente |
| Venta offline, stock insuficiente al sincronizar | Procesada + flag `conflicto_stock = true` |
| Multiples terminales offline venden el mismo stock | Ambas procesadas, supervisor resuelve **(⚠️ deuda técnica)** |
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
                   |    (Go Backend)   |
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
|  |    React Frontend     |     |      Go Backend             |   |
|  |    (SPA)              |     |      (API + Business Logic  |   |
|  |                       |     |       + Worker Pool)         |   |
|  |  - POS UI             | HTTP|  - REST Endpoints (Gin)     |   |
|  |  - Caja Management    +----->  - Service Layer            |   |
|  |  - Products Admin     | JSON|  - Auth JWT Middleware       |   |
|  |  - Price Checker      <-----+  - Validator v10            |   |
|  |  - Reports            |     |  - Goroutine Worker Pool    |   |
|  +-----------------------+     +------+------+---------------+   |
|                                       |      |                   |
|                              +--------+  +---+--------+         |
|                              |           |             |         |
|                      +-------v---+ +-----v-+           |         |
|                      |PostgreSQL | | Redis |           |         |
|                      | >= 15     | | >= 7  |           |         |
|                      | ACID      | | cache |           |         |
|                      | transact. | | jobs  |           |         |
|                      | principal | | queue |           |         |
|                      +-----------+ +-------+           |         |
|                                                        |         |
|                                        +---------------v------+  |
|                                        | Python AFIP Sidecar  |  |
|                                        | (FastAPI + pyafipws) |  |
|                                        |                      |  |
|                                        | POST /facturar       |  |
|                                        | GET /health          |  |
|                                        +----------+-----------+  |
|                                                   |              |
|                                                   | HTTPS SOAP   |
|                                                   v              |
|                                        +------------------+      |
|                                        | AFIP             |      |
|                                        | WSAA + WSFEV1    |      |
|                                        | (externo)        |      |
|                                        +------------------+      |
|                                                                  |
+------------------------------------------------------------------+
```

**Contenedores y responsabilidades:**

| Contenedor | Tecnologia | Responsabilidad | Puerto |
|------------|-----------|-----------------|--------|
| Frontend | React >= 18 + Vite | Interfaz de usuario: POS, gestion de caja, productos, proveedores, consulta de precios | 5173 (dev) |
| Backend | Go >= 1.22 + Gin | API REST, logica de negocio, autenticacion, validacion, worker pool asincrono | 8000 |
| AFIP Sidecar | Python 3.11+ + FastAPI | Microservicio interno que encapsula la integracion con AFIP/ARCA. Expone `POST /facturar` y `GET /health`. Usa `pyafipws` para firma de certificados y consumo SOAP de WSAA/WSFEV1. | 8001 (interno) |
| PostgreSQL | PostgreSQL >= 15 | Base de datos relacional principal. Transacciones ACID. | 5432 |
| Redis | Redis >= 7.0 | Cache de productos frecuentes, job queue para tareas asincronas | 6379 |
| AFIP | Servicio externo | Web services de facturacion electronica argentina (WSAA + WSFEV1) | N/A |

> **Nota clave**: No hay contenedor Celery. Las tareas asincronas (facturacion, email, PDF) se ejecutan dentro del binario Go mediante un worker pool de goroutines, con Redis como cola de jobs. La integracion con AFIP se delega al **AFIP Sidecar (Python)** por costo de oportunidad: reimplementar `pyafipws` en Go no aporta valor de negocio y el Sidecar aísla las fallas de AFIP del core del sistema.

**Protocolos de comunicacion:**

| Origen | Destino | Protocolo | Formato |
|--------|---------|-----------|---------|
| Frontend | Backend | HTTP REST | JSON |
| Backend | PostgreSQL | pgx (TCP) | SQL via GORM/pgx |
| Backend | Redis | go-redis (TCP) | Comandos Redis |
| Worker Pool (Go) | AFIP Sidecar | HTTP POST interno | JSON |
| AFIP Sidecar | AFIP (WSAA+WSFEV1) | HTTPS SOAP | XML |
| Worker Pool | SMTP | SMTP/TLS | Email con adjuntos PDF |

---

# 5. Vista de Componentes

La vista de componentes descompone el contenedor Backend en sus modulos internos.

```
+------------------------------------------------------------------+
|                        Go Backend (Gin)                           |
|                                                                  |
|  +------------------------------------------------------------+  |
|  |                    CAPA HANDLER (HTTP)                      |  |
|  |                                                             |  |
|  |  +-------------+  +---------------+  +-----------------+   |  |
|  |  | ventas.go   |  | productos.go  |  | caja.go         |   |  |
|  |  | POST /v1/   |  | CRUD /v1/     |  | POST /v1/       |   |  |
|  |  | ventas      |  | productos     |  | caja/abrir      |   |  |
|  |  +------+------+  +-------+-------+  | caja/cerrar     |   |  |
|  |         |                  |          | caja/arqueo     |   |  |
|  |  +------+------+  +-------+-------+  +--------+--------+   |  |
|  |  | inventario  |  | facturacion   |           |             |  |
|  |  | .go         |  | .go           |           |             |  |
|  |  +------+------+  +-------+-------+           |             |  |
|  |         |          +------+------+    +-------+-------+     |  |
|  |         |          | proveedores |    | consulta_     |     |  |
|  |         |          | .go         |    | precios.go    |     |  |
|  |         |          +------+------+    +-------+-------+     |  |
|  |  +------+------+         |            +-------+-------+     |  |
|  |  | usuarios.go |         |            | auth.go       |     |  |
|  |  +------+------+         |            +-------+-------+     |  |
|  +---------|-----------------|--------------------|-----------+  |
|            |                 |                    |              |
|  +---------|-----------------|--------------------|-----------+  |
|  |         v    CAPA SERVICE (NEGOCIO)            v           |  |
|  |                                                             |  |
|  |  +---------------+  +----------------+  +--------------+   |  |
|  |  | venta_        |  | inventario_    |  | caja_        |   |  |
|  |  | service.go    |  | service.go     |  | service.go   |   |  |
|  |  +---+----+------+  +--------+-------+  +--------------+   |  |
|  |  +---+----+------+  +-------+--------+  +--------------+   |  |
|  |  | facturacion_  |  | proveedor_     |  | auth_        |   |  |
|  |  | service.go    |  | service.go     |  | service.go   |   |  |
|  |  +---------------+  +----------------+  +--------------+   |  |
|  +------------------------------------------------------------+  |
|            |          |           |                               |
|  +---------|----------|-----------|---------------------------+   |
|  |         v    CAPA REPOSITORY + INFRAESTRUCTURA             |   |
|  |                                                             |  |
|  |  +-----------+    +----------+    +------------------+     |  |
|  |  |database.go|    | redis.go |    | afip_client.go   |     |  |
|  |  |GORM conn  |    | go-redis |    | HTTP client →    |     |  |
|  |  |pgx pool   |    | cache    |    | Python Sidecar   |     |  |
|  |  +-----------+    +----------+    +------------------+     |  |
|  |                                                             |  |
|  |  +-----------+    +------------------+                     |  |
|  |  | worker/   |    | smtp.go          |                     |  |
|  |  | pool.go   |    | enviar_email()   |                     |  |
|  |  | goroutines|    +------------------+                     |  |
|  |  +-----------+                                             |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+

+------------------------------------------------------------------+
|                    Python AFIP Sidecar (FastAPI)                   |
|                                                                  |
|  +------------------------------------------------------------+  |
|  |  POST /facturar                                             |  |
|  |  Recibe: payload JSON con datos de la venta                 |  |
|  |  Proceso: firma certificado (WSAA) → solicita CAE (WSFEV1)  |  |
|  |  Retorna: { cae, cae_vencimiento, resultado }               |  |
|  +------------------------------------------------------------+  |
|  |  Dependencias: pyafipws, FastAPI, uvicorn                   |  |
|  |  Puerto interno: 8001 (no expuesto a internet)              |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

### Inventario de Componentes

| Componente | Capa | Responsabilidad | Dependencias Internas |
|------------|------|-----------------|----------------------|
| `main.go` | Entry | Entry point, inicializa Gin, registra rutas, conecta DB, inicia workers | Todos los paquetes |
| `config.go` | Config | Variables de entorno via Viper/env | Ninguna |
| `ventas.go` | Handler | Endpoints POST /v1/ventas, DELETE /v1/ventas/{id} | venta_service, auth middleware |
| `productos.go` | Handler | Endpoints CRUD /v1/productos | repository, auth middleware |
| `inventario.go` | Handler | Endpoints de ajuste de stock, desarme manual, alertas | inventario_service, auth middleware |
| `caja.go` | Handler | Endpoints de apertura, movimientos, arqueo, cierre | caja_service, auth middleware |
| `facturacion.go` | Handler | Endpoints de comprobantes, historial | facturacion_service, auth middleware |
| `proveedores.go` | Handler | Endpoints CRUD, actualizacion masiva, import CSV | proveedor_service, auth middleware |
| `consulta_precios.go` | Handler | Endpoint GET /v1/precio/{barcode} (sin auth) | repository |
| `auth.go` | Handler | Endpoints login, refresh, registro | auth_service |
| `usuarios.go` | Handler | Endpoints CRUD de usuarios con roles | auth_service, auth middleware |
| `venta_service.go` | Service | Logica de registro de venta con transaccionalidad ACID | inventario_service, caja_service, repository |
| `inventario_service.go` | Service | Logica de desarme automatico, ajustes de stock | repository |
| `caja_service.go` | Service | Ciclo de vida de caja, arqueo ciego, desvios | repository |
| `facturacion_service.go` | Service | Generacion de comprobantes, coordinacion con AFIP Sidecar | worker pool, afip_client |
| `proveedor_service.go` | Service | CRUD proveedores, actualizacion masiva, CSV import | repository |
| `auth_service.go` | Service | Login, creacion/validacion JWT, hash de passwords | repository |
| `database.go` | Infra | GORM connection, pgx pool, migration runner | config |
| `redis.go` | Infra | go-redis connection, cache de productos | config |
| `afip_client.go` | Infra | Cliente HTTP que envía POST JSON al AFIP Sidecar (Python) para obtener CAE | config |
| `smtp.go` | Infra | Cliente SMTP para envio de emails | config |
| `pool.go` | Worker | Worker pool de goroutines, dequeue de Redis | redis, services |

---

# 6. Vista de Codigo

## 6.1 Modelo Producto (GORM)

```go
// model/producto.go
type Producto struct {
    ID             uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    CodigoBarras   string          `gorm:"uniqueIndex;not null"`
    Nombre         string          `gorm:"index;not null"`
    Descripcion    *string
    Categoria      string          `gorm:"not null"`
    PrecioCosto    decimal.Decimal `gorm:"type:decimal(10,2);not null"`
    PrecioVenta    decimal.Decimal `gorm:"type:decimal(10,2);not null"`
    MargenPct      decimal.Decimal `gorm:"type:decimal(5,2)"`
    StockActual    int             `gorm:"not null;default:0"`
    StockMinimo    int             `gorm:"not null;default:5"`
    UnidadMedida   string          `gorm:"not null;default:'unidad'"`
    EsPadre        bool            `gorm:"not null;default:false"`
    ProveedorID    *uuid.UUID      `gorm:"type:uuid;index"`
    Activo         bool            `gorm:"not null;default:true"`
    CreatedAt      time.Time
    UpdatedAt      time.Time
}

// model/producto_hijo.go
type ProductoHijo struct {
    ID                uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    ProductoPadreID   uuid.UUID  `gorm:"type:uuid;uniqueIndex:idx_padre_hijo;not null"`
    ProductoHijoID    uuid.UUID  `gorm:"type:uuid;uniqueIndex:idx_padre_hijo;not null"`
    UnidadesPorPadre  int        `gorm:"not null"`
    DesarmeAuto       bool       `gorm:"not null;default:true"`
}
```

## 6.2 Modelo Venta (GORM)

```go
// model/venta.go
type Venta struct {
    ID              uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    NumeroTicket    int             `gorm:"uniqueIndex;not null"`
    SesionCajaID    uuid.UUID       `gorm:"type:uuid;index;not null"`
    UsuarioID       uuid.UUID       `gorm:"type:uuid;not null"`
    Subtotal        decimal.Decimal `gorm:"type:decimal(12,2);not null"`
    DescuentoTotal  decimal.Decimal `gorm:"type:decimal(12,2);not null;default:0"`
    Total           decimal.Decimal `gorm:"type:decimal(12,2);not null"`
    Estado          string          `gorm:"type:varchar(20);not null;default:'completada'"` // completada, anulada
    ComprobanteID   *uuid.UUID      `gorm:"type:uuid"`
    CreatedAt       time.Time

    Items []VentaItem `gorm:"foreignKey:VentaID"`
    Pagos []VentaPago `gorm:"foreignKey:VentaID"`
}

type VentaItem struct {
    ID              uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    VentaID         uuid.UUID       `gorm:"type:uuid;not null"`
    ProductoID      uuid.UUID       `gorm:"type:uuid;not null"`
    Cantidad        int             `gorm:"not null"`
    PrecioUnitario  decimal.Decimal `gorm:"type:decimal(10,2);not null"`
    DescuentoItem   decimal.Decimal `gorm:"type:decimal(10,2);not null;default:0"`
    Subtotal        decimal.Decimal `gorm:"type:decimal(12,2);not null"`
}

type VentaPago struct {
    ID      uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    VentaID uuid.UUID       `gorm:"type:uuid;not null"`
    Metodo  string          `gorm:"type:varchar(20);not null"` // efectivo, debito, credito, transferencia
    Monto   decimal.Decimal `gorm:"type:decimal(12,2);not null"`
}
```

## 6.3 Modelo Caja (GORM)

```go
// model/sesion_caja.go
type SesionCaja struct {
    ID              uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    PuntoDeVenta    int              `gorm:"not null"`
    UsuarioID       uuid.UUID        `gorm:"type:uuid;not null"`
    MontoInicial    decimal.Decimal  `gorm:"type:decimal(12,2);not null"`
    MontoEsperado   *decimal.Decimal `gorm:"type:decimal(12,2)"`
    MontoDeclarado  *decimal.Decimal `gorm:"type:decimal(12,2)"`
    Desvio          *decimal.Decimal `gorm:"type:decimal(12,2)"`
    DesvioPct       *decimal.Decimal `gorm:"type:decimal(5,2)"`
    Estado          string           `gorm:"type:varchar(20);not null;default:'abierta'"` // abierta, cerrada
    Observaciones   *string
    OpenedAt        time.Time
    ClosedAt        *time.Time
}

type MovimientoCaja struct {
    ID             uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    SesionCajaID   uuid.UUID       `gorm:"type:uuid;index;not null"`
    Tipo           string          `gorm:"type:varchar(20);not null"` // venta, ingreso_manual, egreso_manual, anulacion
    MetodoPago     *string         `gorm:"type:varchar(20)"`
    Monto          decimal.Decimal `gorm:"type:decimal(12,2);not null"`
    Descripcion    string          `gorm:"not null"`
    ReferenciaID   *uuid.UUID      `gorm:"type:uuid"`
    CreatedAt      time.Time
}
```

## 6.4 Logica de Desarme (Go)

```go
// service/inventario_service.go
func (s *InventarioService) DescontarStock(tx *gorm.DB, productoID uuid.UUID, cantidad int) error {
    var producto model.Producto
    if err := tx.First(&producto, productoID).Error; err != nil {
        return err
    }

    if producto.StockActual >= cantidad {
        return tx.Model(&producto).Update("stock_actual", gorm.Expr("stock_actual - ?", cantidad)).Error
    }

    // Intentar desarme automatico
    var vinculo model.ProductoHijo
    err := tx.Where("producto_hijo_id = ? AND desarme_auto = true", productoID).First(&vinculo).Error
    if err != nil {
        return fmt.Errorf("stock insuficiente para %s", producto.Nombre)
    }

    var padre model.Producto
    if err := tx.First(&padre, vinculo.ProductoPadreID).Error; err != nil {
        return err
    }

    faltante := cantidad - producto.StockActual
    padresNecesarios := int(math.Ceil(float64(faltante) / float64(vinculo.UnidadesPorPadre)))

    if padre.StockActual < padresNecesarios {
        return fmt.Errorf("stock insuficiente para %s", producto.Nombre)
    }

    // Desarme atomico dentro de la transaccion
    tx.Model(&padre).Update("stock_actual", gorm.Expr("stock_actual - ?", padresNecesarios))
    unidadesGeneradas := padresNecesarios * vinculo.UnidadesPorPadre
    tx.Model(&producto).Update("stock_actual", gorm.Expr("stock_actual + ? - ?", unidadesGeneradas, cantidad))

    return nil
}
```

---

# 7. Flujos de Datos

## 7.1 Flujo de Registro de Venta (con Desarme Automatico)

```
Cajero
     |
     | POST /v1/ventas
     | { sesion_caja_id, items, pagos }
     v
+-----------+     +--------------------+     +-------------------+
| Handler:  |     | Service:           |     | Service:          |
| ventas.go | --> | venta_service.go   | --> | inventario_       |
| Validate  |     | RegistrarVenta()   |     | service.go        |
| JWT mid.  |     | db.Transaction()   |     | DescontarStock()  |
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
                                    | Decrementar|  | DesarmeAuto()    |
                                    | stock hijo |  | stock_padre -= 1 |
                                    |            |  | stock_hijo +=    |
                                    |            |  |   units_per_p    |
                                    |            |  | Decrementar      |
                                    +-----------+  +------------------+
                                            |              |
                                            +------+-------+
                                                   |
                                                   v
                                    +-----------------------------+
                                    | Service: caja_service.go    |
                                    | RegistrarMovimiento()       |
                                    +-------------+---------------+
                                                  |
                                                  v
                                    +-----------------------------+
                                    | tx.Commit()                 |
                                    | (todo o nada)               |
                                    +-------------+---------------+
                                                  |
                                                  v
                                    +-----------------------------+
                                    | Worker Pool (goroutine)     |
                                    | generar_comprobante()       |
                                    | (no bloquea al cajero)      |
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
| Handler:  |     | Service:           |
| caja.go   | --> | caja_service.go    |
| JWT mid.  |     | ArqueoCiego()      |
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
```

## 7.3 Flujo de Facturacion Asincrona (via AFIP Sidecar)

La facturacion electronica se procesa de forma asincrona para no bloquear la operacion del cajero. El Worker Pool de Go delega la comunicacion con AFIP al Sidecar de Python.

```
Venta confirmada (tx.Commit)
     |
     v
+-----------------------------+
| Worker Pool (goroutine)     |
| 1. Dequeue job de Redis     |
| 2. Construir payload JSON   |
|    con datos de la venta    |
+-------------+---------------+
              |
              | POST http://afip-sidecar:8001/facturar
              | Content-Type: application/json
              | { tipo_cbte, punto_vta, cuit,
              |   monto_neto, monto_iva, monto_total,
              |   items: [...] }
              v
+-----------------------------+
| Python AFIP Sidecar         |
| (FastAPI + pyafipws)        |
| 1. Autenticar con WSAA      |
|    (firma CMS del cert)     |
| 2. Solicitar CAE a WSFEV1   |
| 3. Retornar respuesta JSON  |
+-------------+---------------+
              |
              | Response 200:
              | { cae, cae_vencimiento,
              |   resultado: "A"/"R",
              |   observaciones: [...] }
              v
+-----------------------------+
| Worker Pool (goroutine)     |
| 3. Guardar CAE en DB        |
| 4. Actualizar comprobante   |
|    estado = "emitido"       |
| 5. Generar PDF con gofpdf   |
| 6. Encolar envio email      |
+-----------------------------+

Manejo de errores:
- Sidecar no disponible → Retry con backoff exponencial (max 3 reintentos)
- AFIP rechaza (resultado="R") → Comprobante estado="rechazado", log de observaciones
- Timeout → Reencolar job en Redis para reintento posterior
```

---

# 8. Patrones de Diseño Aplicados

## 8.1 Handler / Service / Repository

Toda la logica de negocio reside en servicios con responsabilidad unica. Los handlers de Gin solo validan datos de entrada, invocan al servicio y formatean la respuesta. Los repositorios encapsulan el acceso a datos. Esta triple separacion permite testear la logica de negocio sin levantar el servidor HTTP, inyectando mocks de repositorios.

## 8.2 Repository Pattern (via GORM)

El acceso a datos se abstrae mediante repositorios con interfaces Go. Los servicios trabajan con interfaces de repositorio, no con GORM directamente. Esto facilita el testing con mocks y la migracion a otras bases de datos si fuera necesario.

## 8.3 Dependency Injection (Constructor Functions)

Go utiliza inyeccion de dependencias explícita mediante constructores. Cada servicio recibe sus dependencias como interfaces en su constructor `NewXxxService(repo XxxRepository)`. Esto elimina la necesidad de containers DI y permite compilacion estatica de todas las dependencias.

## 8.4 Interface-Driven Design

Cada capa define interfaces que la capa superior implementa. Los repositorios exponen interfaces (`ProductoRepository`, `VentaRepository`), los servicios exponen interfaces (`VentaService`, `CajaService`). Esto es idiomatico en Go y facilita testing y sustitucion.

## 8.5 Worker Pool Pattern (reemplaza Celery)

Las tareas asincronas se procesan mediante un worker pool de goroutines que leen jobs de Redis. Los jobs se serializan como JSON y se encolan en Redis lists. Los workers dequeue y procesan en paralelo. Este patron reemplaza completamente a Celery, aprovechando la concurrencia nativa de Go.

## 8.6 Middleware Chain (Gin)

La autenticacion, CORS, error handling, request ID y rate limiting se implementan como middleware de Gin. Los handlers se declaran con sus requisitos de seguridad de forma declarativa en el router.

---

# 9. Modelo de Datos

## 9.1 Indices Criticos

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

## ADR-001: Go como core del sistema + Sidecar Python para AFIP

**Contexto**: El sistema requiere latencia sub-100ms, alta concurrencia y despliegue simplificado. La integracion con AFIP/ARCA requiere firma de certificados X.509, autenticacion WSAA y consumo de SOAP WSFEV1.

**Decision**: Usar Go como lenguaje principal del core del sistema (API, logica de negocio, worker pool). Adoptar un **patron Sidecar en Python (FastAPI + pyafipws)** exclusivamente para la integracion con AFIP.

**Justificacion**: Go ofrece compilacion a binario estatico (deploys simples, imagenes Docker < 20MB), concurrencia nativa con goroutines (elimina la necesidad de Celery/workers separados), rendimiento predecible sin GIL ni garbage collector pausante, y un ecosistema maduro para HTTP, SQL y redis. Para un POS de mision critica, la predictibilidad del rendimiento de Go supera las ventajas de desarrollo rapido de Python.

Sin embargo, reimplementar `pyafipws` en Go (parseo de certificados CMS, autenticacion WSAA, consumo SOAP WSFEV1) tiene un **costo de oportunidad prohibitivo**: es trabajo de bajo valor de negocio, altamente propenso a errores, y la libreria Python ya esta probada en produccion por miles de contribuyentes argentinos. El patron Sidecar permite:

- **Aislamiento de fallas**: un error en la comunicacion con AFIP no crashea el core Go.
- **Independencia de deploy**: el Sidecar puede actualizarse sin tocar el backend.
- **Reutilizacion**: se aprovecha `pyafipws` directamente, sin traduccion.
- **Latencia aceptable**: la comunicacion interna Go→Sidecar via HTTP localhost agrega < 5ms, despreciable frente a los 500ms-2s de AFIP.

**Consecuencias**: Se agrega un contenedor Docker adicional (Python). La comunicacion Go→Sidecar es por HTTP interno (no expuesto a internet). La generacion de PDF sigue en Go con gofpdf.

## ADR-002: Gin como framework HTTP

**Contexto**: Se necesita un framework HTTP de alto rendimiento con middleware chain.

**Decision**: Usar Gin como framework HTTP.

**Justificacion**: Gin es el framework HTTP mas popular de Go, con rendimiento top-tier (benchmarks), middleware chain composable, binding y validacion integrados, y comunidad activa. Alternativas como Fiber (fasthttp) ofrecen mayor rendimiento crudo pero menor compatibilidad con el ecosistema net/http.

## ADR-003: Worker pool con goroutines (reemplaza Celery)

**Contexto**: La facturacion AFIP y el envio de emails deben ser asincronos.

**Decision**: Usar un worker pool de goroutines con Redis como job queue, en lugar de Celery.

**Justificacion**: Go tiene concurrencia nativa. Un pool de goroutines leyendo de Redis LPUSH/BRPOP ofrece la misma funcionalidad que Celery pero sin un servicio separado, sin Python, y con menor overhead. Esto reduce la complejidad operacional de 6 a 5 contenedores Docker.

## ADR-004: PostgreSQL como base de datos principal

**Contexto**: El sistema requiere transacciones ACID para operaciones monetarias y de inventario.

**Decision**: Usar PostgreSQL como unica base de datos relacional.

**Justificacion**: Misma justificacion que la version Python. PostgreSQL con pgx es el driver nativo mas eficiente para Go.

## ADR-005: GORM + pgx para acceso a datos

**Contexto**: Se necesita un ORM para productividad en CRUD y acceso nativo para queries criticas.

**Decision**: GORM como ORM principal, con pgx disponible para queries de alto rendimiento.

**Justificacion**: GORM provee hooks, migraciones automaticas, relaciones y transacciones de forma idiomatica. Para queries criticas de rendimiento (busqueda por barcode con latencia < 50ms), se puede usar pgx directamente.

---

# 11. Infraestructura y Despliegue

## 11.1 Docker Compose Produccion

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
    depends_on: [postgres, redis, afip-sidecar]
    env_file: .env

  afip-sidecar:
    build: ./afip-sidecar
    expose:
      - "8001"
    env_file: .env
    volumes:
      - afip-certs:/certs:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    restart: unless-stopped

  postgres:
    image: postgres:15
    volumes: [pgdata:/var/lib/postgresql/data]
    env_file: .env

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
  certs:
  afip-certs:
```

> **Sin contenedor Celery**: el backend Go ejecuta workers internos. El contenedor `afip-sidecar` (Python) es el unico componente no-Go y se comunica exclusivamente via HTTP interno (puerto 8001, no expuesto a internet).

## 11.2 Dockerfile Backend (Multi-stage)

```dockerfile
# Build stage
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /blendpos cmd/server/main.go

# Runtime stage
FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
COPY --from=builder /blendpos /blendpos
COPY migrations /migrations
EXPOSE 8000
CMD ["/blendpos"]
```

> Imagen final: ~15-20MB vs ~200-400MB de una imagen Python.

## 11.3 Variables de Entorno Criticas

| Variable | Descripcion | Ejemplo |
|----------|-------------|---------|
| DOMAIN | Dominio del cliente | app.tukiosco.com |
| ACME_EMAIL | Email para Let's Encrypt | admin@tukiosco.com |
| DATABASE_URL | Conexion PostgreSQL | postgres://user:pass@postgres:5432/blendpos?sslmode=disable |
| REDIS_URL | Conexion Redis | redis://redis:6379/0 |
| JWT_SECRET | Secreto para firma JWT | (generado, 256 bits) |
| JWT_EXPIRATION_HOURS | Duracion del token | 8 |
| AFIP_SIDECAR_URL | URL interna del Sidecar AFIP | http://afip-sidecar:8001 |
| AFIP_CERT_PATH | Certificado AFIP (montado en Sidecar) | /certs/afip.crt |
| AFIP_KEY_PATH | Clave privada AFIP (montado en Sidecar) | /certs/afip.key |
| AFIP_CUIT | CUIT del contribuyente | 20123456789 |
| AFIP_PRODUCTION | Modo produccion AFIP | false |
| SMTP_HOST | Servidor SMTP | smtp.gmail.com |
| SMTP_PORT | Puerto SMTP | 587 |
| SMTP_USER | Usuario SMTP | blendpos@example.com |
| SMTP_PASSWORD | Password SMTP | (secreto) |

---

# 12. Seguridad

## 12.1 Autenticacion y Autorizacion

- Todas las contraseñas se hashean con bcrypt (cost factor 12) via `golang.org/x/crypto/bcrypt`.
- Los tokens JWT se firman con HS256 via `golang-jwt/jwt` y un secreto de 256 bits.
- Cada endpoint declara su nivel de acceso minimo via middleware de Gin.
- El endpoint de consulta de precios es el unico sin autenticacion.

## 12.2 Proteccion de Datos

- Los certificados AFIP se montan como volumenes Docker, nunca se incluyen en el codigo.
- Las credenciales se cargan exclusivamente desde variables de entorno.
- Las respuestas de error nunca exponen stack traces.
- Los logs (zerolog/zap) registran errores con contexto pero sin datos sensibles.

## 12.3 Validacion de Entrada

- Todos los payloads JSON se validan con `go-playground/validator` antes de procesarse.
- Los archivos CSV se validan por MIME type antes de parsearse.
- Los codigos de barras se sanitizan (solo digitos, longitud valida).
- Los montos monetarios se validan como `shopspring/decimal` positivos con maximo 2 decimales.

---

# 13. Observabilidad

## 13.1 Logging

Cada request genera un `request_id` (UUID) via middleware que se propaga a todos los logs de la operacion mediante `zerolog` o `zap`. Los servicios registran:

- Inicio y fin de transacciones criticas (ventas, desarmes, cierres de caja).
- Errores con contexto completo (sin datos sensibles).
- Operaciones de facturacion AFIP (request enviado, respuesta recibida, CAE obtenido o error).
- Alertas de stock minimo.

## 13.2 Health Checks

```
GET /health -> { "ok": true, "db": "connected", "redis": "connected" }
```

---

# 14. Escalabilidad y Evolucion

## 14.1 Escalabilidad Inmediata

- **Multiples cajas**: El sistema soporta multiples sesiones de caja concurrentes gracias a las transacciones serializables de PostgreSQL.
- **Workers escalables**: El worker pool de goroutines puede escalarse ajustando el numero de workers en la configuracion.
- **Cache de productos**: Redis cache los productos frecuentes para mantener la latencia sub-100ms.
- **Binario unico**: El backend Go es un unico binario que puede escalarse horizontalmente detras de un load balancer.

## 14.2 Evoluciones Futuras

- **Sucursales**: Soporte multi-sucursal con base de datos compartida o federada.
- **E-commerce**: Integracion con canal de venta online que comparte inventario en tiempo real.
- **Reporteria avanzada**: Dashboard con metricas de ventas, margenes, rotacion de stock.
- **gRPC**: Migracion gradual de endpoints criticos a gRPC para aun menor latencia.
- **Prometheus + Grafana**: Metricas de rendimiento, latencia, throughput.
