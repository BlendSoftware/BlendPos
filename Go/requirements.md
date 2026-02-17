# Requirements — BlendPOS (Go)

> Este documento define los requisitos funcionales y no funcionales del sistema BlendPOS,
> adaptados para la implementacion en Go.
> Formato de requisitos funcionales: EARS (Easy Approach to Requirements Syntax).

---

## Indice

1. [Historias de Usuario](#1-historias-de-usuario)
2. [Requisitos Funcionales (EARS)](#2-requisitos-funcionales-ears)
3. [Requisitos No Funcionales](#3-requisitos-no-funcionales)
4. [Dependencias y Restricciones](#4-dependencias-y-restricciones)
5. [Alcance MVP](#5-alcance-mvp)
6. [Supuestos y Preguntas Abiertas](#6-supuestos-y-preguntas-abiertas)
7. [Matriz de Trazabilidad](#7-matriz-de-trazabilidad)

---

# 1. Historias de Usuario

## US-01: Registrar venta rapida
**Como** cajero de un kiosco,
**quiero** registrar una venta escaneando codigos de barras con respuesta inmediata,
**para** atender a los clientes sin demoras en horas pico.

## US-02: Gestionar inventario jerarquico
**Como** administrador del negocio,
**quiero** que al vender la ultima lata de una caja, el sistema abra automaticamente otra caja del deposito,
**para** no tener que ajustar stocks manualmente cada vez que se abre un bulto.

## US-03: Cerrar caja con arqueo ciego
**Como** supervisor,
**quiero** que el cajero declare lo que contó sin ver el monto esperado,
**para** detectar desvios reales sin que el cajero ajuste el conteo.

## US-04: Facturar ventas con AFIP
**Como** administrador,
**quiero** que las ventas generen factura electronica automaticamente sin bloquear el punto de venta,
**para** cumplir con las obligaciones fiscales sin impactar la operacion.

## US-05: Actualizar precios masivamente
**Como** administrador,
**quiero** aplicar un porcentaje de aumento a todos los productos de un proveedor con preview,
**para** no tener que editar precios uno por uno ante cada lista de precios nueva.

## US-06: Consultar precios sin sesion
**Como** cliente final,
**quiero** escanear un producto en una terminal y ver su precio,
**para** verificar el precio antes de comprarlo.

## US-07: Operar sin internet
**Como** cajero,
**quiero** seguir vendiendo cuando se corta internet,
**para** no perder ventas por problemas de conectividad.

---

# 2. Requisitos Funcionales (EARS)

## RF-01 a RF-05: Ventas

- **RF-01**: Cuando el cajero escanea un codigo de barras, el sistema debe agregar el producto al carrito en menos de 100 milisegundos.
- **RF-02**: Cuando el cajero finaliza una venta, el sistema debe crear una transaccion atomica que incluya creacion del ticket, decremento de stock y registro del movimiento de caja.
- **RF-03**: Cuando el stock del producto hijo es insuficiente y existe un producto padre vinculado con desarme automatico habilitado, el sistema debe ejecutar el desarme dentro de la misma transaccion.
- **RF-04**: Cuando el cajero indica el metodo de pago como efectivo, el sistema debe calcular el vuelto automaticamente.
- **RF-05**: Cuando el cajero intenta registrar una venta sin sesion de caja abierta, el sistema debe rechazar la operacion con HTTP 400.

## RF-06 a RF-10: Inventario

- **RF-06**: El sistema debe permitir crear vinculos padre-hijo entre productos, definiendo la cantidad de unidades por padre.
- **RF-07**: Cuando se ejecuta un desarme manual, el sistema debe decrementar el stock del padre e incrementar el stock del hijo atomicamente.
- **RF-08**: El sistema debe permitir buscar productos por codigo de barras (exacto, < 50ms) y por nombre (parcial, con paginacion).
- **RF-09**: Cuando un producto alcanza su stock minimo, el sistema debe generar una alerta visible para el administrador.
- **RF-10**: El sistema debe soportar soft-delete de productos (campo Activo = false).

## RF-11 a RF-16: Caja

- **RF-11**: El sistema debe permitir abrir una sesion de caja con monto inicial, punto de venta y usuario responsable.
- **RF-12**: Cuando ya existe una sesion de caja abierta para el mismo punto de venta, el sistema debe rechazar la apertura.
- **RF-13**: Los movimientos de caja son inmutables; las anulaciones generan un movimiento inverso.
- **RF-14**: Cuando el cajero presenta su declaracion de arqueo, el sistema NO debe mostrar el monto esperado antes de la confirmacion (arqueo ciego).
- **RF-15**: Cuando se cierra la caja, el sistema debe clasificar el desvio: normal (≤1%), advertencia (1-5%), critico (>5%).
- **RF-16**: Si el desvio es critico, el sistema debe requerir justificacion obligatoria del supervisor.

## RF-17 a RF-21: Facturacion

- **RF-17**: Cuando se completa una venta, el sistema debe encolar la generacion del comprobante fiscal en el worker pool de goroutines.
- **RF-18**: La venta debe confirmarse al cajero inmediatamente, sin esperar la respuesta de AFIP.
- **RF-19**: Cuando AFIP falla, el sistema debe reintentar con backoff exponencial (max 3 reintentos).
- **RF-20**: El sistema debe generar PDFs internos para comprobantes no fiscales (tickets, remitos).
- **RF-21**: Cuando el cliente proporciona email, el sistema debe enviar el comprobante como adjunto de forma asincrona.

## RF-22 a RF-26: Proveedores

- **RF-22**: El sistema debe soportar CRUD completo de proveedores (razon social, CUIT, telefono, email, condicion de pago).
- **RF-23**: Cuando el administrador solicita actualizacion masiva con preview=true, el sistema debe retornar la lista de productos con precios actuales y nuevos sin aplicar cambios.
- **RF-24**: El sistema debe soportar import CSV con validacion por fila y upsert por codigo de barras.
- **RF-25**: Cuando el archivo subido no es CSV valido, el sistema debe rechazarlo con HTTP 400.
- **RF-26**: El sistema debe llevar historial de cambios de precios.

## RF-27: Consulta de Precios

- **RF-27**: El endpoint GET /v1/precio/{barcode} debe funcionar sin autenticacion y no generar ningun efecto secundario (ni movimientos, ni stock, ni registros).

## RF-28 a RF-30: Autenticacion

- **RF-28**: El sistema debe autenticar usuarios via JWT (golang-jwt) con tres roles: cajero, supervisor, administrador.
- **RF-29**: Los tokens de acceso expiran a las 8 horas.
- **RF-30**: Cada endpoint debe declarar su nivel de acceso minimo via middleware de Gin.

---

# 3. Requisitos No Funcionales

## 3.1 Rendimiento

| Metrica | Objetivo | Medicion |
|---------|----------|----------|
| Latencia de busqueda por barcode | < 50ms (p95) | Benchmark con `go test -bench` |
| Latencia de registro de item | < 100ms por item (p95) | Middleware de logging con timestamps |
| Latencia de finalizacion de venta | < 300ms (p95) | Test de integracion con timer |
| Throughput del API | >= 100 ventas/min concurrentes | Load test con k6 o vegeta |
| Tiempo de arranque del backend | < 3 segundos | Docker logs |

## 3.2 Disponibilidad

| Metrica | Objetivo |
|---------|----------|
| Uptime del backend | >= 99.5% (excluyendo mantenimiento programado) |
| Tiempo de recovery ante crash | < 30 segundos (Docker restart policy) |
| Operacion offline del frontend | Venta continua via IndexedDB durante desconexion |

## 3.3 Seguridad

| Requisito | Implementacion |
|-----------|----------------|
| Passwords nunca en texto plano | bcrypt cost 12 (golang.org/x/crypto) |
| Tokens JWT firmados | HS256, golang-jwt/jwt, secreto de 256 bits |
| Certificados AFIP protegidos | Mounted as Docker volumes o env vars |
| Validacion de entrada | go-playground/validator v10 en todos los DTOs |
| Rate limiting | Max 5 logins/min por IP via middleware |
| Sin stack traces en respuestas | Global error handler middleware en Gin |

## 3.4 Mantenibilidad

| Requisito | Implementacion |
|-----------|----------------|
| Separacion de capas | Handler → Service → Repository, sin saltar capas |
| Cobertura de tests | >= 80% en core services |
| Linting | golangci-lint con configuracion estricta |
| Formato de codigo | gofmt / goimports |
| Documentacion de API | Swagger via swaggo/swag |
| Logging estructurado | zerolog/zap con request_id |

## 3.5 Portabilidad

| Requisito | Implementacion |
|-----------|----------------|
| Despliegue containerizado | Docker multi-stage build (< 20MB) |
| Configuracion por entorno | Variables de entorno via Viper/env |
| Independencia de OS | Binario estatico compilado para linux/amd64 |
| Base de datos estandar | PostgreSQL >= 15, sin extensiones custom |

---

# 4. Dependencias y Restricciones

## Dependencias Externas

| Dependencia | Tipo | Impacto si no esta disponible |
|-------------|------|-------------------------------|
| PostgreSQL | Base de datos | Sistema no opera |
| Redis | Cache / Job Queue | Sistema opera sin cache ni async workers |
| AFIP WSAA/WSFEV1 | Facturacion fiscal | Ventas operan, facturacion se encola |
| SMTP Server | Email | Comprobantes no se envian, se almacenan localmente |

## Restricciones

1. **Go >= 1.22**: Requerido para generics y mejoras de rendimiento.
2. **PostgreSQL >= 15**: Requerido para transacciones serializables y JSONB.
3. **Navegador compatible**: Chrome >= 89 o Edge >= 89 para Web Serial API (impresion termica).
4. **Certificado AFIP vigente**: Requerido para facturacion fiscal.
5. **Dominio con DNS apuntando al Droplet**: Requerido para SSL via Let's Encrypt.

---

# 5. Alcance MVP

## Incluido en MVP

- [x] Ventas con escaneo de barcode y busqueda por nombre
- [x] Inventario jerarquico con desarme automatico
- [x] Gestion de caja con arqueo ciego
- [x] Facturacion AFIP asincrona + PDF internos
- [x] Proveedores con actualizacion masiva y CSV
- [x] Consulta de precios sin autenticacion
- [x] Autenticacion JWT con roles
- [x] Frontend POS con atajos de teclado
- [x] Frontend de administracion basica
- [x] PWA con operacion offline (IndexedDB + Service Worker)
- [x] Deploy con Docker Compose + Traefik + SSL

## Excluido del MVP

- [ ] Gestion multi-sucursal
- [ ] Integracion con e-commerce
- [ ] Dashboard de reportes avanzados
- [ ] Motor de promociones y descuentos por regla
- [ ] Programa de fidelizacion / puntos
- [ ] Backup automatizado con PITR
- [ ] Token blacklist para revocacion inmediata
- [ ] gRPC para endpoints de alto rendimiento

---

# 6. Supuestos y Preguntas Abiertas

## Supuestos

1. Cada punto de venta opera una sola sesion de caja simultanea.
2. Los precios no incluyen IVA internamente (se calcula al facturar segun tipo de contribuyente).
3. Los codigos de barras son unicos a nivel de sistema.
4. El administrador tiene acceso a todos los puntos de venta.
5. La impresora termica esta configurada previamente (USB o red local).

## Preguntas Abiertas

1. ¿Se requiere soporte para multiples monedas?
2. ¿Los descuentos son porcentuales o fijos? ¿Ambos?
3. ¿Se necesita marcar productos como "pesables" con balanza electronica?
4. ¿Hay limites de tamaño para los archivos CSV de importacion?

---

# 7. Matriz de Trazabilidad

| Req | User Story | Feature | Componente Arquitectonico |
|-----|-----------|---------|--------------------------|
| RF-01 | US-01 | F01 Ventas | handler/ventas.go → service/venta_service.go |
| RF-02 | US-01 | F01 Ventas | service/venta_service.go (db.Transaction) |
| RF-03 | US-02 | F03 Inventario | service/inventario_service.go (DescontarStock) |
| RF-06 | US-02 | F03 Inventario | handler/inventario.go → model/producto_hijo.go |
| RF-11 | US-03 | F04 Caja | handler/caja.go → service/caja_service.go |
| RF-14 | US-03 | F04 Caja | service/caja_service.go (ArqueoCiego) |
| RF-17 | US-04 | F06 Facturacion | worker/facturacion_worker.go |
| RF-23 | US-05 | F07 Proveedores | service/proveedor_service.go |
| RF-24 | US-05 | F07 Proveedores | handler/proveedores.go (CSV import) |
| RF-27 | US-06 | F08 Consulta | handler/consulta_precios.go |
| RF-28 | US-07 | F05 Auth | middleware/auth.go, service/auth_service.go |
