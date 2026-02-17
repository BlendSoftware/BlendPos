# Habilidades Recomendadas — BlendPOS (Go)

> Este documento detalla las herramientas, librerias y habilidades tecnicas recomendadas
> para el desarrollo de BlendPOS en Go, organizadas por area del proyecto.

---

## 1. Lenguaje y Framework

### Go >= 1.22
- **Uso**: Lenguaje principal del backend.
- **Por que**: Compilacion a binario estatico, concurrencia nativa con goroutines, rendimiento predecible sin GIL, tipado fuerte, excelente ecosistema para servicios HTTP.
- **Recursos**: [go.dev](https://go.dev), [Effective Go](https://go.dev/doc/effective_go).

### Gin >= 1.9
- **Uso**: Framework HTTP para la API REST.
- **Por que**: Rendimiento top-tier entre frameworks Go, middleware chain composable, binding/validacion integrada, comunidad activa.
- **Instalacion**: `go get -u github.com/gin-gonic/gin`
- **Alternativa**: Echo (similar rendimiento, diferente API), Fiber (basado en fasthttp, no compatible net/http).

---

## 2. Base de Datos

### GORM >= 2.0
- **Uso**: ORM para operaciones CRUD, definicion de modelos, relaciones y hooks.
- **Por que**: ORM mas popular de Go, soporte completo para PostgreSQL, transacciones, migraciones automaticas, preload de relaciones.
- **Instalacion**: `go get -u gorm.io/gorm gorm.io/driver/postgres`
- **Patron clave**: `db.Transaction(func(tx *gorm.DB) error { ... })` para operaciones ACID.

### pgx >= 5.0
- **Uso**: Driver nativo PostgreSQL para queries de alto rendimiento.
- **Por que**: Rendimiento superior al driver database/sql estandar, connection pooling nativo (pgxpool), soporte para tipos PostgreSQL nativos (UUID, JSONB, arrays).
- **Instalacion**: `go get -u github.com/jackc/pgx/v5`
- **Uso**: Queries criticas de rendimiento (busqueda por barcode < 50ms) que necesitan control fino.

### golang-migrate
- **Uso**: Migraciones de esquema SQL versionadas.
- **Por que**: Migraciones SQL puras (no ORM-generated), versionado numerico, soporte para up/down, compatible con CI/CD.
- **Instalacion**: `go install -tags postgres github.com/golang-migrate/migrate/v4/cmd/migrate@latest`
- **Comandos**:
  - `migrate create -ext sql -dir migrations -seq nombre_migracion`
  - `migrate -path migrations -database "$DATABASE_URL" up`
  - `migrate -path migrations -database "$DATABASE_URL" down 1`

---

## 3. Autenticacion y Seguridad

### golang-jwt/jwt v5
- **Uso**: Creacion y validacion de tokens JWT.
- **Por que**: Libreria oficial de JWT para Go, soporte completo para HS256/RS256, claims tipados.
- **Instalacion**: `go get -u github.com/golang-jwt/jwt/v5`
- **Patron**: Middleware de Gin que extrae y valida el token del header `Authorization: Bearer <token>`.

### golang.org/x/crypto/bcrypt
- **Uso**: Hasheo de contraseñas.
- **Por que**: Implementacion stdlib de bcrypt con cost factor configurable.
- **Instalacion**: `go get -u golang.org/x/crypto`
- **Uso**: `bcrypt.GenerateFromPassword([]byte(password), 12)` para cost factor 12.

---

## 4. Validacion

### go-playground/validator v10
- **Uso**: Validacion de structs de request con tags declarativos.
- **Por que**: El validador mas popular de Go, integrado con Gin, soporta validaciones custom, mensajes de error traducibles.
- **Instalacion**: `go get -u github.com/go-playground/validator/v10`
- **Ejemplo**: `json:"email" validate:"required,email"` en campos de DTOs.

### shopspring/decimal
- **Uso**: Aritmetica decimal precisa para montos monetarios.
- **Por que**: Evita errores de punto flotante en operaciones financieras. Soporte para PostgreSQL DECIMAL.
- **Instalacion**: `go get -u github.com/shopspring/decimal`

---

## 5. Configuracion

### spf13/viper (o caarlos0/env)
- **Uso**: Carga de configuracion desde variables de entorno, archivos .env, YAML.
- **Por que**: Viper es el gestor de configuracion mas popular de Go. Alternativa mas simple: caarlos0/env para bind directo a structs.
- **Instalacion**: `go get -u github.com/spf13/viper` o `go get -u github.com/caarlos0/env/v11`

---

## 6. Cache y Cola de Mensajes

### go-redis/redis v9
- **Uso**: Cache de productos frecuentes + cola de jobs para tareas asincronas.
- **Por que**: Cliente Redis mas popular de Go, soporte completo para Streams, Pub/Sub, Lists (LPUSH/BRPOP), pipelining.
- **Instalacion**: `go get -u github.com/redis/go-redis/v9`
- **Patrones**:
  - Cache: `SET/GET` con TTL para productos frecuentes.
  - Job Queue: `LPUSH` para encolar, `BRPOP` para dequeue bloqueante en workers.

---

## 7. Tareas Asincronas (Worker Pool)

### Goroutines + Channels + Redis
- **Uso**: Reemplazo de Celery. Procesamiento asincrono de facturacion AFIP, email, PDF.
- **Por que**: Go tiene concurrencia de primera clase. Un worker pool de goroutines con Redis como backing store es mas simple, eficiente y operacionalmente liviano que Celery.
- **Patron**:
  ```go
  // worker/pool.go
  func StartWorkerPool(ctx context.Context, rdb *redis.Client, numWorkers int) {
      for i := 0; i < numWorkers; i++ {
          go func(id int) {
              for {
                  result, err := rdb.BRPop(ctx, 0, "jobs:facturacion").Result()
                  if err != nil { return }
                  processJob(result[1])
              }
          }(i)
      }
  }
  ```
- **Alternativa**: [asynq](https://github.com/hibiken/asynq) — un framework tipo Celery para Go con Redis, si se prefiere mas estructura.

---

## 8. Generacion de PDF

### jung-kurt/gofpdf (o go-pdf/fpdf)
- **Uso**: Generacion de comprobantes PDF (tickets, facturas internas).
- **Por que**: Libreria madura para generacion de PDF en Go, soporte para imagenes, tablas, fuentes custom.
- **Instalacion**: `go get -u github.com/jung-kurt/gofpdf`
- **Alternativa**: `go get -u github.com/go-pdf/fpdf` (fork mantenido).

---

## 9. Email

### jordan-wright/email
- **Uso**: Envio de emails con adjuntos PDF.
- **Por que**: API simple y directa para SMTP con soporte para TLS y adjuntos.
- **Instalacion**: `go get -u github.com/jordan-wright/email`
- **Alternativa**: `go get -u github.com/wneessen/go-mail` (mas moderno, mas features).

---

## 10. Logging

### rs/zerolog (o uber-go/zap)
- **Uso**: Logging estructurado de alto rendimiento.
- **Por que**: zerolog es zero-allocation, ideal para servicios de baja latencia. zap es la alternativa de Uber con API mas rica.
- **Instalacion**: `go get -u github.com/rs/zerolog` o `go get -u go.uber.org/zap`
- **Patron**: Middleware de Gin que inyecta request_id en cada log entry.

---

## 11. UUID

### google/uuid
- **Uso**: Generacion de UUIDs para IDs de entidades.
- **Instalacion**: `go get -u github.com/google/uuid`

---

## 12. Testing

### testing (stdlib) + testify
- **Uso**: Tests unitarios e integracion.
- **Por que**: `testing` es stdlib. `testify` agrega asserts, mocks y suites para tests mas expresivos.
- **Instalacion**: `go get -u github.com/stretchr/testify`
- **Patron**:
  ```go
  func TestRegistrarVenta_ConDesarme(t *testing.T) {
      assert := assert.New(t)
      // setup...
      venta, err := service.RegistrarVenta(ctx, request)
      assert.NoError(err)
      assert.Equal("completada", venta.Estado)
  }
  ```

### dockertest (o testcontainers-go)
- **Uso**: Tests de integracion con PostgreSQL y Redis reales en Docker.
- **Instalacion**: `go get -u github.com/ory/dockertest/v3` o `go get -u github.com/testcontainers/testcontainers-go`

---

## 13. Linting y Formato

### golangci-lint
- **Uso**: Linter agregador que ejecuta multiples linters en paralelo.
- **Instalacion**: `go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest`
- **Configuracion**: `.golangci.yml` en la raiz del proyecto.
- **Comando**: `golangci-lint run ./...`

### gofmt / goimports
- **Uso**: Formateo automatico de codigo Go.
- **gofmt**: Incluido con Go.
- **goimports**: `go install golang.org/x/tools/cmd/goimports@latest`

---

## 14. Hot Reload (Desarrollo)

### cosmtrek/air
- **Uso**: Hot reload para desarrollo. Reinicia el servidor Go al detectar cambios en archivos.
- **Instalacion**: `go install github.com/air-verse/air@latest`
- **Configuracion**: `.air.toml` en la raiz del backend.
- **Comando**: `air` (en lugar de `go run cmd/server/main.go`).

---

## 15. Microservicio AFIP (Sidecar Python)

La integracion con AFIP/ARCA se delega a un microservicio Sidecar en Python que se comunica con el backend Go via HTTP interno. Esta decision se toma por costo de oportunidad: reimplementar `pyafipws` en Go no aporta valor de negocio.

### Python >= 3.11
- **Uso**: Runtime del microservicio AFIP Sidecar.
- **Por que**: Version LTS con soporte para `asyncio` y tipado moderno. Requerida por `pyafipws`.

### FastAPI
- **Uso**: Framework HTTP para exponer el endpoint interno `POST /facturar` y `GET /health`.
- **Instalacion**: `pip install fastapi uvicorn`
- **Por que**: API minima, alto rendimiento (async), documentacion automatica OpenAPI, validacion con Pydantic.

### pyafipws
- **Uso**: Libreria para la firma de certificados X.509 (WSAA) y consumo SOAP de WSFEV1 (solicitud de CAE).
- **Instalacion**: `pip install pyafipws`
- **Por que**: Libreria probada en produccion por miles de contribuyentes argentinos. Abstrae completamente la complejidad de CMS, tokens WSAA y XML SOAP de AFIP.
- **Repositorio**: [github.com/reingart/pyafipws](https://github.com/reingart/pyafipws)

### uvicorn
- **Uso**: Servidor ASGI para ejecutar el Sidecar FastAPI.
- **Instalacion**: `pip install uvicorn[standard]`

### Comunicacion con Go
- El backend Go envia un `POST` HTTP a `http://afip-sidecar:8001/facturar` con el payload JSON de la venta.
- El Sidecar retorna `{ cae, cae_vencimiento, resultado, observaciones }`.
- Desde Go, solo se necesita `net/http` (stdlib) para hacer el POST al Sidecar. No se requiere manejo de SOAP/XML/CMS en Go.

---

## 16. Frontend (React)

Las herramientas de frontend son identicas a la version Python, ya que el frontend es independiente del backend:

| Herramienta | Uso |
|-------------|-----|
| React >= 18 | Framework UI |
| Vite | Build tool |
| TypeScript | Tipado estatico |
| TailwindCSS | Estilos utilitarios |
| ShadcnUI | Componentes UI |
| Dexie.js | IndexedDB wrapper (offline) |
| TanStack Query | Fetching + cache + offline persist |
| react-router-dom | Routing |
| axios / fetch | HTTP client |
| Vite PWA Plugin | Progressive Web App |

---

## Resumen de Dependencias Go

```bash
# Core
go get -u github.com/gin-gonic/gin
go get -u gorm.io/gorm gorm.io/driver/postgres
go get -u github.com/jackc/pgx/v5
go get -u github.com/redis/go-redis/v9

# Auth & Security
go get -u github.com/golang-jwt/jwt/v5
go get -u golang.org/x/crypto

# Validation & Types
go get -u github.com/go-playground/validator/v10
go get -u github.com/shopspring/decimal
go get -u github.com/google/uuid

# Config
go get -u github.com/spf13/viper

# PDF & Email
go get -u github.com/jung-kurt/gofpdf
go get -u github.com/jordan-wright/email

# Logging
go get -u github.com/rs/zerolog

# Testing
go get -u github.com/stretchr/testify
go get -u github.com/ory/dockertest/v3

# Dev tools
go install github.com/air-verse/air@latest
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
go install -tags postgres github.com/golang-migrate/migrate/v4/cmd/migrate@latest
```
