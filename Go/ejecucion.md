# Guia de Ejecucion — BlendPOS (Go)

> Este documento guia paso a paso la implementacion de BlendPOS usando un agente AI.
> Antes de ejecutar cualquier tarea, el agente debe haber leido TODOS los documentos de referencia.

---

## Documentos de Referencia

Antes de comenzar cualquier implementacion, el agente AI debe leer y comprender los siguientes documentos en este orden:

| Orden | Documento | Contenido | Cuando Leerlo |
|-------|-----------|-----------|---------------|
| 1 | `proyecto.md` | Vision narrativa del sistema completo | Al inicio, para contexto general |
| 2 | `arquitectura.md` | Capas, patrones, flujos de datos, ADRs | Al inicio, para decisiones tecnicas |
| 3 | `requirements.md` | Requisitos funcionales/no funcionales, trazabilidad | Al inicio, para criterios de aceptacion |
| 4 | `especificacion.md` | Features con Given/When/Then, contratos API, tareas por fase | Antes de cada tarea, como referencia de implementacion |
| 5 | `CLAUDE.md` | Stack, estructura de directorios, invariantes, comandos | Siempre abierto como referencia rapida |
| 6 | `ejecucion.md` | Este documento: como ejecutar fase por fase | Como guia de flujo de trabajo |
| 7 | `habilidades.md` | Skills del agente recomendadas para Go | Para resolver tareas especificas |

---

## Metodologia de Ejecucion

BlendPOS sigue **Spec-Driven Development (SDD)**. El flujo para cada tarea es:

1. **Leer la Especificacion**: Abrir `especificacion.md`, ir a la Feature y Tarea correspondiente. Leer los criterios de aceptacion (Given/When/Then) y los contratos API.
2. **Diseñar**: Planificar la implementacion siguiendo los patrones de `arquitectura.md` (Handler → Service → Repository).
3. **TDD**: Escribir tests primero (`tests/xxx_test.go`), verificar que fallan, luego implementar.
4. **Implementar**: Crear/modificar archivos siguiendo la estructura de `CLAUDE.md`.
5. **Verificar**: Ejecutar tests (`go test ./...`), verificar que la tarea cumple los criterios de aceptacion.

---

## Fase 1: Infraestructura, Auth y Configuracion

### T-1.1: Scaffold del proyecto backend

**Objetivo**: Crear la estructura base del proyecto Go con Gin. El backend compila y arranca correctamente. `GET /health` retorna `{"ok": true}`.

**Prompt sugerido para el agente:**
```
Lee especificacion.md T-1.1 y arquitectura.md seccion 6. Crea la estructura completa
del proyecto Go siguiendo CLAUDE.md:
- Inicializa el modulo Go con `go mod init blendpos`
- Crea cmd/server/main.go con Gin
- Crea internal/config/config.go con Viper/env
- Crea internal/router/router.go con el endpoint GET /health
- Crea internal/middleware/ con request_id.go, cors.go, error_handler.go
- Crea internal/infra/database.go con GORM + pgx
- Crea internal/infra/redis.go con go-redis
- Crea Dockerfile multi-stage (builder + alpine)
- Crea docker-compose.yml de desarrollo con backend, postgres y redis
- Crea .air.toml para hot reload
Verifica: go build cmd/server/main.go compila. docker compose up levanta todo.
GET /health retorna {"ok": true, "db": "connected", "redis": "connected"}.
```

### T-1.2: Modelos GORM y migraciones

**Objetivo**: Definir todos los modelos GORM y las migraciones SQL. Las tablas existen en PostgreSQL.

**Prompt sugerido:**
```
Lee especificacion.md seccion 9 (modelo de datos) y arquitectura.md seccion 6.
Crea todos los modelos GORM en internal/model/:
- producto.go, producto_hijo.go, venta.go, sesion_caja.go, comprobante.go,
  proveedor.go, usuario.go
Crea migraciones SQL en migrations/ usando golang-migrate:
- 000001_create_tables.up.sql / down.sql
Incluye los indices criticos de arquitectura.md seccion 9.1.
Verifica: migrate up aplica sin errores. Las tablas existen en PostgreSQL.
```

### T-1.3: Autenticacion JWT

**Objetivo**: Login retorna JWT. Endpoints protegidos rechazan sin token. Roles (cajero, supervisor, administrador) se aplican correctamente.

**Prompt sugerido:**
```
Lee especificacion.md Feature 05 y arquitectura.md seccion 12. Implementa:
- internal/service/auth_service.go con Login(), hasheo bcrypt
- internal/handler/auth.go con POST /v1/auth/login
- internal/middleware/auth.go con JWT validation middleware
- internal/dto/auth_dto.go con LoginRequest, LoginResponse
- Crea un usuario admin seed en la migracion
Tests: login exitoso retorna JWT, login fallido retorna 401, endpoint protegido
sin token retorna 401, endpoint protegido con rol incorrecto retorna 403.
```

---

## Fase 2: Productos e Inventario

### T-2.1: CRUD completo de productos

**Prompt sugerido:**
```
Lee especificacion.md Feature 02 (AC-02.1 a AC-02.4) y contratos API.
Implementa el CRUD de productos:
- internal/repository/producto_repo.go (interfaz + implementacion GORM)
- internal/service/producto_service.go (logica de negocio)  
- internal/handler/productos.go (endpoints REST)
- internal/dto/producto_dto.go (request/response con validator tags)
Incluye busqueda por barcode (<50ms), busqueda por nombre con paginacion,
y soft-delete (campo Activo). Tests para cada endpoint.
```

### T-2.2: Relacion Padre/Hijo y desarme

**Prompt sugerido:**
```
Lee especificacion.md Feature 03 (AC-03.1 a AC-03.5) y arquitectura.md seccion 6.4
(logica de desarme). Implementa:
- Endpoints para crear/listar vinculos padre-hijo
- Desarme automatico en internal/service/inventario_service.go
- Todo el desarme dentro de db.Transaction()
- Tests: desarme exitoso, stock padre insuficiente, producto sin vinculo
```

---

## Fase 3: Ventas

### T-3.1: Servicio de ventas ACID

**Prompt sugerido:**
```
Lee especificacion.md Feature 01 (AC-01.1 a AC-01.4) y arquitectura.md flujo 7.1.
Implementa:
- internal/service/venta_service.go con RegistrarVenta()
- Transaccion atomica: items + stock + caja en una sola transaccion
- Validar que existe sesion de caja abierta
- internal/handler/ventas.go con POST /v1/ventas
- Latencia objetivo: < 100ms
Tests E2E: venta con desarme, venta sin caja abierta, venta con stock insuficiente.
```

### T-3.2: Multi-metodo de pago

**Prompt sugerido:**
```
Lee especificacion.md Feature 01 (AC-01.3). Implementa soporte para:
- Efectivo (con calculo de vuelto), debito, credito, transferencia, mixto
- Validacion: suma de pagos >= total de la venta
- Cada pago se registra como VentaPago y como MovimientoCaja
Tests: pago mixto, pago insuficiente rechazado, vuelto calculado correctamente.
```

---

## Fase 4: Caja

### T-4.1: Ciclo de vida de caja

**Prompt sugerido:**
```
Lee especificacion.md Feature 04 (AC-04.1 a AC-04.6) y arquitectura.md flujo 7.2.
Implementa el ciclo completo:
- Apertura: POST /v1/caja/abrir (monto_inicial, punto_de_venta)
- Movimientos: inmutables, anulaciones generan movimiento inverso
- Arqueo ciego: POST /v1/caja/arqueo (declaracion sin ver esperado)
- Cierre: clasificacion de desvio (normal <= 1%, warning 1-5%, critico > 5%)
- Reporte: desglose por metodo de pago
Tests: apertura exitosa, cierre con desvio, arqueo ciego, movimiento inmutable.
```

---

## Fase 5: Facturacion

### T-5.1: Comprobantes internos PDF

**Prompt sugerido:**
```
Lee especificacion.md Feature 06 (AC-06.3 a AC-06.5). Implementa:
- Generacion de PDF con gofpdf (logo, items, totales)
- Almacenamiento del PDF en filesystem
- Envio por email asincrono via worker pool
- internal/worker/email_worker.go
Tests: PDF generado correctamente, endpoint de descarga funciona.
```

### T-5.2: Integracion AFIP

**Prompt sugerido:**
```
Lee especificacion.md Feature 06 (AC-06.1 a AC-06.2). Implementa:
- internal/infra/afip.go: cliente HTTP para WSAA + WSFEV1
- internal/worker/facturacion_worker.go: procesa facturacion asincrona
- Retry con backoff exponencial ante fallas de AFIP
- La venta NUNCA se bloquea por AFIP
- Rate limiting: max 60 requests/minuto
Tests: mock de AFIP, facturacion exitosa, retry ante fallo.
```

---

## Fase 6: Proveedores

### T-6.1: CRUD y actualizacion masiva

**Prompt sugerido:**
```
Lee especificacion.md Feature 07 (AC-07.1 a AC-07.3). Implementa:
- CRUD de proveedores (razon_social, cuit, telefono, email, condicion_pago)
- POST /v1/proveedores/{id}/precios/masivo con preview
- Historial de cambios de precios
Tests: CRUD basico, actualizacion masiva con preview, confirmacion.
```

### T-6.2: Import CSV

**Prompt sugerido:**
```
Lee especificacion.md Feature 07 (AC-07.4 a AC-07.5). Implementa:
- POST /v1/csv/import (multipart/form-data)
- Validacion MIME type, parseo con encoding/csv
- Upsert por codigo de barras
- Resumen con detalle de errores por fila
Tests: CSV exitoso, CSV con errores, archivo no-CSV rechazado.
```

---

## Fase 7: Frontend POS

### T-7.1: Pantalla POS

**Prompt sugerido:**
```
Lee especificacion.md Feature 09. Implementa la interfaz POS:
- Campo de busqueda con foco automatico (barcode + nombre)
- Carrito interactivo con +/- cantidad y eliminacion
- Atajos de teclado (F2, F3, F10, Escape, flechas, +/-, Delete)
- Panel de pago con metodos y calculo de vuelto en tiempo real
- Impresion termica ESC/POS (Web Serial API con fallback a Print Agent)
- Conectar con API Go: POST /v1/ventas
```

---

## Fase 8: Frontend Administracion

### T-8.1: Paginas de gestion

**Prompt sugerido:**
```
Lee especificacion.md Feature 10. Implementa las paginas de administracion:
- Cierre de Caja (arqueo ciego)
- Productos (CRUD, busqueda, filtros)
- Inventario (relaciones padre/hijo, desarme manual, alertas)
- Proveedores (CRUD, actualizacion masiva, import CSV)
- Facturacion (historial, filtros, descarga PDF)
- Usuarios (gestion de roles)
- Consulta de Precios (modo aislado sin auth)
Proteccion por roles via JWT en cada pagina.
```

---

## Fase 9: Validacion y Deploy

### T-9.1: Tests E2E

**Prompt sugerido:**
```
Ejecuta el flujo completo end-to-end:
producto → padre/hijo → venta con desarme → cierre caja → facturacion
Todos los tests deben pasar. Verifica latencia < 100ms en busqueda de productos.
```

### T-9.2: Docker deploy

**Prompt sugerido:**
```
Verifica docker-compose.prod.yml con todos los servicios:
traefik (SSL), frontend (nginx), backend (Go binary), postgres, redis.
docker compose -f docker-compose.prod.yml up -d levanta el sistema.
```

---

## Tips para el Agente

1. **Siempre lee la especificacion antes de implementar**. Los contratos API estan definidos en `especificacion.md`.
2. **Sigue TDD**: escribe el test primero, verifica que falla, luego implementa.
3. **Usa `db.Transaction()`** para toda operacion que involucre venta, stock o caja.
4. **Nunca pongas logica de negocio en handlers**. Los handlers solo validan y delegan.
5. **Usa interfaces** para repositorios, facilitando mocks en tests.
6. **Go format**: mantén el codigo formateado con `gofmt` o `goimports`.
7. **Error handling**: Go no tiene excepciones. Retorna `error` y manejalo explicitamente.
8. **Context propagation**: usa `context.Context` en todas las funciones de servicio y repositorio.

---

## Ejecucion Rapida por Fase

Si prefieres ejecutar una fase completa en un solo prompt:

```
Lee toda la documentacion del proyecto: proyecto.md, arquitectura.md, especificacion.md,
requirements.md, CLAUDE.md. Luego ejecuta la Fase [N] completa segun ejecucion.md,
implementando todas las tareas T-N.x con TDD. Verifica que todos los tests pasan
antes de avanzar.
```
