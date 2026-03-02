# Guia de Ejecucion para Produccion — BlendPOS

> **Origen**: Auditoría completa del proyecto (análisis de 28 archivos backend, 25 frontend, 7 tests, 5 Dockerfiles, 9 migraciones, sidecar AFIP)
> **Fecha**: 2026-03-01
> **Metodología**: Spec-Driven Development (SDD) + TDD
> **Propósito**: Guía paso a paso para que el agente AI implemente cada corrección y mejora necesaria para llevar BlendPOS a producción de forma segura.

---

## Lectura Obligatoria Antes de Empezar

Antes de ejecutar cualquier tarea, el agente **DEBE** leer los siguientes documentos en este orden:

```
1. CLAUDE.md          → Stack, estructura de directorios, invariantes, comandos
2. arquitectura.md    → Capas (Handler→Service→Repository), patrones, flujos de datos
3. especificacion.md  → Feature contracts, criterios de aceptación
4. ejecucion.md       → Flujo de trabajo SDD y prompts base
```

---

## Reglas de Ejecucion

1. **Leer siempre** `especificacion.md` y `arquitectura.md` antes de cada tarea.
2. **TDD**: escribir el test primero (cuando aplique), verificar que falla, luego implementar.
3. **Nunca** logica de negocio en handlers — siempre en la capa Service.
4. **Siempre** usar `db.Transaction()` cuando la operacion involucre multiples tablas.
5. **Una correccion a la vez**: marcar como completada antes de avanzar a la proxima.
6. **Verificar** con `go test ./...` y prueba manual en el frontend antes de marcar cada item como hecho.
7. Si una correccion depende de otra (ver seccion de dependencias), ejecutarlas en el orden indicado.

---

## Orden de Ejecucion Recomendado

Las tareas estan ordenadas por impacto y dependencias:

```
FASE 1 — Seguridad Critica (BLOQUEAN PRODUCCION):
  S-01, S-02, S-03, S-04, S-05, S-06, S-07

FASE 2 — Bugs Criticos (CORROMPEN DATOS):
  B-01, B-02, B-03, B-04, B-05

FASE 3 — Seguridad Perimetral (HARDENING):
  H-01, H-02, H-03, H-04, H-05, H-06

FASE 4 — Estabilidad y Resiliencia:
  R-01, R-02, R-03, R-04, R-05

FASE 5 — Rendimiento Frontend:
  P-01, P-02, P-03, P-04, P-05, P-06

FASE 6 — Testing y CI/CD:
  T-01, T-02, T-03

FASE 7 — Calidad y Pulido:
  Q-01, Q-02, Q-03, Q-04
```

---

## FASE 1 — SEGURIDAD CRITICA (Bloquean Produccion)

Estas tareas deben completarse **antes del primer deploy productivo**. Sin ellas, el sistema es explotable.

---

### S-01: Validar JWT_SECRET obligatorio al startup

**Problema detectado**: Si la variable de entorno `JWT_SECRET` no se configura o esta vacia, el backend arranca sin error y firma tokens con `""`. Cualquier persona puede generar tokens validos sin conocer el secret.

**Area afectada**: Backend → `internal/config/config.go`, `cmd/server/main.go`.

**Prompt para el agente:**
```
Lee arquitectura.md seccion 12 (seguridad) y CLAUDE.md (invariantes).
Corrige la validacion del JWT_SECRET al arrancar el servidor:

DIAGNOSTICO:
1. Revisar internal/config/config.go → ¿como se carga JWT_SECRET?
2. ¿Hay alguna validacion que verifique que no esta vacio?
3. Revisar cmd/server/main.go → ¿se verifica antes de iniciar el servidor?

CORRECCION:
1. En config.go o en main.go, agregar validacion al startup:
   - JWT_SECRET debe tener MINIMO 32 caracteres.
   - Si es menor a 32 chars o esta vacio: log.Fatal() con mensaje claro:
     "FATAL: JWT_SECRET must be at least 32 characters long"
   - El servidor NO debe arrancar si esta condicion no se cumple.
2. Agregar la misma validacion en la carga de config de Viper/env:
   if len(cfg.JWTSecret) < 32 {
       log.Fatal().Msg("JWT_SECRET must be at least 32 characters")
   }
3. Actualizar .env.example con un comentario:
   # IMPORTANTE: Debe tener al menos 32 caracteres. Generar con: openssl rand -hex 32
   JWT_SECRET=cambiar_por_un_secreto_seguro_de_al_menos_32_caracteres

TEST:
- Arrancar el servidor con JWT_SECRET="" → debe fallar con mensaje claro.
- Arrancar con JWT_SECRET="short" → debe fallar.
- Arrancar con JWT_SECRET="un_secreto_seguro_de_al_menos_32_caracteres_ok" → arranca normal.
```

**Criterio de completitud**: El servidor no arranca sin un JWT_SECRET de al menos 32 caracteres.

---

### S-02: Diferenciar access token de refresh token

**Problema detectado**: Los access tokens y refresh tokens tienen exactamente el mismo payload JWT. Un refresh token (que tiene mayor duracion) puede usarse como access token para acceder a endpoints protegidos, rompiendo el modelo de seguridad de tokens de corta vida.

**Area afectada**: Backend → `internal/service/auth_service.go`, `internal/middleware/auth.go`.

**Prompt para el agente:**
```
Lee arquitectura.md seccion 12 y especificacion.md Feature 05.
Diferencia los tokens de acceso y refresco:

DIAGNOSTICO:
1. Revisar auth_service.go → funcion que genera tokens (GenerarAccessToken / GenerarRefreshToken).
2. ¿Ambos tokens tienen el mismo payload/claims?
3. Revisar middleware/auth.go → ¿valida el campo "type" del token?

CORRECCION:
1. Agregar claim "type" al JWT payload:
   - Access token:  claims["type"] = "access"
   - Refresh token: claims["type"] = "refresh"

2. En auth_service.go → GenerarTokens():
   func generarToken(userID, rol, tipo string, duracion time.Duration) (string, error) {
       claims := jwt.MapClaims{
           "user_id": userID,
           "rol":     rol,
           "type":    tipo,  // "access" o "refresh"
           "exp":     time.Now().Add(duracion).Unix(),
           "iat":     time.Now().Unix(),
       }
       ...
   }

3. En middleware/auth.go → JWTMiddleware():
   - Despues de parsear el token, verificar que claims["type"] == "access".
   - Si claims["type"] == "refresh" → rechazar con HTTP 401:
     "Invalid token type: refresh tokens cannot be used for API access"

4. En el endpoint POST /v1/auth/refresh:
   - Verificar que el token enviado tiene claims["type"] == "refresh".
   - Si es un access token → rechazar con HTTP 401:
     "Invalid token type: access tokens cannot be used for refresh"

TEST:
- Generar access token → usar en endpoint protegido → funciona (200).
- Generar refresh token → usar en endpoint protegido → rechazado (401).
- Usar access token en POST /v1/auth/refresh → rechazado (401).
- Usar refresh token en POST /v1/auth/refresh → nuevo par de tokens (200).
```

**Criterio de completitud**: Access y refresh tokens son mutuamente exclusivos en su uso.

---

### S-03: Revocar refresh token anterior en rotacion

**Problema detectado**: Cuando se usa POST /v1/auth/refresh para obtener un nuevo par de tokens, el refresh token anterior sigue siendo valido. Un atacante que robe un refresh token puede usarlo indefinidamente, incluso despues de que el usuario legitimo haya refrescado sus tokens.

**Area afectada**: Backend → `internal/service/auth_service.go`, Redis.

**Prompt para el agente:**
```
Lee arquitectura.md seccion 12.
Implementa revocacion de refresh tokens en rotacion:

CORRECCION:
1. Al generar un refresh token, almacenar su JTI (JWT ID) en Redis:
   - Key: "refresh_token:{jti}" → Value: user_id → TTL: misma duracion que el refresh token.
   - Esto crea una whitelist de refresh tokens validos.

2. Al generar tokens (login o refresh), cada refresh token debe tener un claim "jti" unico:
   claims["jti"] = uuid.New().String()

3. En POST /v1/auth/refresh:
   a. Parsear el refresh token.
   b. Verificar que el JTI existe en Redis (whitelist).
   c. Si NO existe en Redis → rechazar (token ya fue usado o revocado).
   d. Si existe → ELIMINAR el JTI de Redis (invalida el token viejo).
   e. Generar nuevo par de tokens con nuevo JTI.
   f. Almacenar el nuevo JTI en Redis.

4. En POST /v1/auth/logout:
   - Eliminar el JTI del refresh token de Redis.

5. Manejar el caso de Redis caido:
   - Si Redis no responde al verificar JTI → rechazar el refresh (fail closed, no fail open).
   - Loguear el error para alertar.

TEST:
- Login → obtener refresh token A.
- Refresh con token A → obtener token B → A ya no es valido.
- Intentar refresh con token A de nuevo → rechazado (401).
- Refresh con token B → funciona → B ya no es valido.
- Logout → el refresh token activo queda invalidado.
```

**Criterio de completitud**: Cada refresh token solo puede usarse UNA vez. El anterior se invalida automaticamente.

---

### S-04: Validar path traversal en descarga de PDFs

**Problema detectado**: El endpoint de descarga de PDFs usa `c.File(pdfPath)` donde `pdfPath` viene de la base de datos. Si un atacante logra inyectar una ruta en la DB (ej: `../../../../etc/passwd`), el servidor servira cualquier archivo del filesystem.

**Area afectada**: Backend → `internal/handler/facturacion.go`.

**Prompt para el agente:**
```
Lee especificacion.md Feature 06 (AC-06.4).
Corrige la vulnerabilidad de path traversal en la descarga de PDFs:

DIAGNOSTICO:
1. Localizar el handler que sirve PDFs (probablemente GET /v1/facturacion/pdf/{id}).
2. Verificar como se construye el pdfPath que se pasa a c.File().
3. ¿Se valida que el path esta dentro del directorio permitido?

CORRECCION:
1. Obtener el directorio base de PDFs de la configuracion (ej: config.PDFStoragePath).
2. Antes de servir el archivo, validar que la ruta resuelta esta dentro del directorio permitido:

   func validarRutaPDF(basePath, pdfPath string) error {
       // Resolver la ruta absoluta para eliminar ".." y symlinks
       absBase, err := filepath.Abs(basePath)
       if err != nil {
           return err
       }
       absPath, err := filepath.Abs(pdfPath)
       if err != nil {
           return err
       }
       // Verificar que la ruta resuelta comienza con el directorio base
       if !strings.HasPrefix(absPath, absBase + string(filepath.Separator)) {
           return fmt.Errorf("path traversal detected: %s is outside %s", absPath, absBase)
       }
       return nil
   }

3. Si la validacion falla → retornar HTTP 403 "Access denied" y loguear el intento.
4. Verificar tambien que el archivo existe antes de servir (HTTP 404 si no existe).
5. No exponer la ruta del filesystem en el mensaje de error al cliente.

TEST:
- PDF valido dentro de PDFStoragePath → se descarga correctamente (200).
- Simular pdfPath con "../../../etc/passwd" en DB → rechazado (403).
- PDF que no existe en filesystem → retorna 404, no 500.
- Ruta con symlinks que salen del directorio → rechazada.
```

**Criterio de completitud**: Solo se pueden descargar PDFs dentro del directorio configurado.

---

### S-05: Eliminar infraestructura duplicada en main.go vs router.New()

**Problema detectado**: Se instancian servicios e infraestructura tanto en `cmd/server/main.go` como en `internal/router/router.go`. Esto puede causar que los workers de facturacion/email usen instancias de servicio diferentes a las que usan los handlers HTTP, generando inconsistencias silenciosas.

**Area afectada**: Backend → `cmd/server/main.go`, `internal/router/router.go`.

**Prompt para el agente:**
```
Lee arquitectura.md seccion 6 (vista de codigo) y CLAUDE.md (key patterns).
Elimina la duplicacion de infraestructura entre main.go y router.go:

DIAGNOSTICO:
1. Leer cmd/server/main.go completo — ¿que servicios instancia?
2. Leer internal/router/router.go completo — ¿que servicios instancia?
3. Comparar: ¿hay servicios, repositorios o conexiones creados en ambos archivos?
4. Verificar que los workers (facturacion, email) usan las MISMAS instancias que los handlers.

CORRECCION:
1. REGLA: main.go es el unico composition root. Crea TODAS las dependencias.
2. main.go debe:
   a. Crear conexion a DB (infra.NewDatabase).
   b. Crear conexion a Redis (infra.NewRedis).
   c. Crear TODOS los repositorios.
   d. Crear TODOS los servicios, inyectando los repositorios.
   e. Crear TODOS los workers, inyectando los servicios.
   f. Pasar los servicios ya creados a router.New().

3. router.New() debe:
   a. Recibir los servicios como parametros (DI via constructor).
   b. Crear SOLO los handlers HTTP, pasandoles los servicios.
   c. Registrar las rutas.
   d. NO crear ninguna conexion, repositorio ni servicio.

4. Estructura simplificada:
   // main.go
   db := infra.NewDatabase(cfg)
   redis := infra.NewRedis(cfg)
   // repos
   productoRepo := repository.NewProductoRepo(db)
   ventaRepo := repository.NewVentaRepo(db)
   // ... todos los repos
   // services
   ventaService := service.NewVentaService(productoRepo, ventaRepo, cajaRepo, ...)
   // ... todos los services
   // workers
   factWorker := worker.NewFacturacionWorker(facturacionService, redis)
   go factWorker.Start(ctx)
   // router
   r := router.New(cfg, ventaService, cajaService, productoService, ...)
   r.Run(":8080")

   // router.go
   func New(cfg *config.Config, ventaSvc service.VentaService, ...) *gin.Engine {
       handler := handler.NewVentasHandler(ventaSvc)
       // solo rutas, no infraestructura
   }

TEST:
- Verificar que no hay ninguna llamada a infra.New*, repository.New*, ni service.New* dentro de router.go.
- go test ./... pasa sin errores.
- El servidor arranca y todos los endpoints funcionan.
- Los workers procesan jobs correctamente (probar facturacion manual).
```

**Criterio de completitud**: main.go es el unico composition root. router.go solo registra rutas.

---

### S-06: Agregar Content-Security-Policy y HSTS a nginx

**Problema detectado**: El frontend nginx no envia headers `Content-Security-Policy` ni `Strict-Transport-Security`. Sin CSP, ataques XSS pueden cargar scripts externos arbitrarios. Sin HSTS, conexiones HTTP pueden ser interceptadas (downgrade attack).

**Area afectada**: Frontend → `frontend/nginx.conf`.

**Prompt para el agente:**
```
Lee arquitectura.md seccion 12 (seguridad).
Agrega headers de seguridad criticos a nginx.conf:

CORRECCION:
1. Abrir frontend/nginx.conf.
2. Dentro del bloque server { }, agregar los siguientes headers:

   # HSTS - fuerza HTTPS por 1 año, incluye subdominios
   add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

   # CSP - previene XSS cargando solo recursos propios
   add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.blendpos.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" always;

   # Permissions-Policy - deshabilita APIs de hardware no usadas
   add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

3. NOTA sobre CSP:
   - 'unsafe-inline' en style-src es necesario para Mantine UI (inyecta estilos inline).
   - connect-src debe incluir el dominio del API backend.
   - Si se usa un CDN o Google Fonts, agregar esos dominios a la directiva correspondiente.
   - Ajustar connect-src segun la URL del backend en produccion.

4. Verificar que los headers existentes (X-Frame-Options, X-Content-Type-Options, etc.)
   no entran en conflicto con los nuevos.

TEST:
- docker build del frontend → nginx arranca sin errores de configuracion.
- Abrir la app en el navegador → DevTools → Network → verificar que los response headers incluyen:
  * Strict-Transport-Security
  * Content-Security-Policy
  * Los headers existentes siguen presentes.
- La app funciona correctamente sin errores de CSP en la consola.
```

**Criterio de completitud**: Los headers CSP y HSTS estan presentes en todas las respuestas del frontend.

---

### S-07: Limitar tamaño del body de requests

**Problema detectado**: No hay limite de tamaño en el body de los requests HTTP al backend. Un atacante puede enviar un body de varios GB, agotando la memoria del servidor (ataque DoS).

**Area afectada**: Backend → `internal/middleware/` o `internal/router/router.go`.

**Prompt para el agente:**
```
Lee CLAUDE.md (middleware) y arquitectura.md seccion 5.
Agrega limite de tamaño al body de los requests HTTP:

CORRECCION:
1. Crear middleware o configurar Gin para limitar el body size:

   Opcion A — Middleware custom:
   func MaxBodySize(maxBytes int64) gin.HandlerFunc {
       return func(c *gin.Context) {
           c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
           c.Next()
       }
   }

   Opcion B — Gin built-in (si disponible):
   r.MaxMultipartMemory = 10 << 20  // 10 MB

2. Registrar el middleware globalmente en router.go:
   r.Use(middleware.MaxBodySize(10 << 20))  // 10 MB por defecto

3. Para el endpoint de CSV import que acepta archivos, considerar un limite mayor
   o aplicar el limite por ruta:
   csvGroup.Use(middleware.MaxBodySize(50 << 20))  // 50 MB para CSV

4. Cuando se excede el limite, retornar HTTP 413 Request Entity Too Large con mensaje:
   {"error": "El tamaño del request excede el limite permitido (10 MB)"}

5. Verificar que Gin maneja correctamente el error de MaxBytesReader sin panic.

TEST:
- Request con body de 1 MB → funciona normalmente.
- Request con body de 100 MB → retorna HTTP 413.
- CSV import con archivo de 30 MB → funciona (tiene limite mayor).
- CSV import con archivo de 100 MB → retorna HTTP 413.
```

**Criterio de completitud**: Todos los endpoints tienen limite de body size. Requests excesivos retornan 413.

---

## FASE 2 — BUGS CRITICOS (Corrompen Datos)

Estos bugs pueden causar corrupcion de datos financieros o inconsistencias de estado.

---

### B-01: Evitar comprobante fiscal duplicado en retry

**Problema detectado**: Cuando el worker de facturacion (Redis job queue) reintenta un job que fallo parcialmente, puede crear un segundo comprobante fiscal para la misma venta. Esto genera registros fiscales duplicados ante AFIP.

**Area afectada**: Backend → `internal/worker/facturacion_worker.go`, `internal/service/facturacion_service.go`.

**Prompt para el agente:**
```
Lee especificacion.md Feature 06 (AC-06.1, AC-06.2) y arquitectura.md seccion 8.
Corrige la idempotencia del worker de facturacion:

DIAGNOSTICO:
1. Revisar facturacion_worker.go → ¿que pasa si el job se reintenta?
2. ¿Se verifica si ya existe un comprobante para la venta antes de crear uno nuevo?
3. ¿Que pasa si el CAE de AFIP se recibio exitosamente pero el worker fallo al guardar?

CORRECCION:
1. Antes de solicitar CAE a AFIP, verificar si ya existe un comprobante para la venta:
   comprobante, err := comprobanteRepo.GetByVentaID(ventaID)
   if comprobante != nil && comprobante.CAE != "" {
       // Ya tiene CAE — el job anterior tuvo exito, este retry es duplicado
       log.Info().Str("venta_id", ventaID).Msg("Comprobante ya existe, skip")
       return nil  // Marcar job como exitoso sin hacer nada
   }

2. Si el comprobante existe pero SIN CAE (fallo anterior al solicitar AFIP):
   - Usar el comprobante existente para reintentar con AFIP.
   - NO crear un comprobante nuevo.

3. Si no existe comprobante:
   - Crear comprobante en estado "pendiente" ANTES de solicitar CAE.
   - Solicitar CAE a AFIP.
   - Actualizar el comprobante con el CAE (o con el error).

4. Usar el venta_id como clave de idempotencia:
   - Agregar UNIQUE constraint en la tabla comprobantes: (venta_id) debe ser unico.
   - Esto previene duplicados a nivel de DB como ultima linea de defensa.

5. Agregar migracion SQL:
   ALTER TABLE comprobantes ADD CONSTRAINT uq_comprobante_venta
     UNIQUE (venta_id);

TEST:
- Venta → worker genera comprobante → verificar solo 1 comprobante en DB.
- Simular fallo del worker despues de recibir CAE → reintentar → NO se crea duplicado.
- Simular fallo del worker antes de solicitar CAE → reintentar → se crea UN solo comprobante.
```

**Criterio de completitud**: Por cada venta existe como maximo UN comprobante fiscal, independientemente de cuantas veces se reintente el job.

---

### B-02: handleAnular no debe marcar venta localmente si el backend falla

**Problema detectado**: En el frontend, la funcion `handleAnular` de FacturacionPage.tsx marca la venta como "anulada" en el estado local (UI) incluso cuando el backend responde con error (500, 403, etc.). Esto causa que el usuario vea la venta como anulada cuando en realidad no lo esta.

**Area afectada**: Frontend → `frontend/src/pages/admin/FacturacionPage.tsx`.

**Prompt para el agente:**
```
Lee especificacion.md Feature 01 (AC-01.5) y Feature 06.
Corrige el flujo de anulacion en FacturacionPage:

DIAGNOSTICO:
1. Localizar la funcion handleAnular en FacturacionPage.tsx.
2. ¿Se actualiza el estado local ANTES o DESPUES de confirmar la respuesta del backend?
3. ¿Hay manejo de error que revierta el estado local si el backend falla?

CORRECCION:
1. El flujo correcto debe ser:
   a. Mostrar modal de confirmacion al usuario.
   b. Al confirmar → llamar al backend DELETE /v1/ventas/{id}.
   c. SOLO si el backend responde 200 → actualizar el estado local (marcar como anulada).
   d. Si el backend responde con error → mostrar notificacion de error al usuario,
      NO modificar el estado local.

2. Patron correcto:
   const handleAnular = async (ventaId: string) => {
     try {
       setLoading(true);
       await apiClient.delete(`/v1/ventas/${ventaId}`);
       // Solo si llega aqui (sin throw) actualizar el estado:
       setVentas(prev => prev.map(v =>
         v.id === ventaId ? { ...v, estado: 'anulada' } : v
       ));
       notifications.show({ title: 'Venta anulada', color: 'green', ... });
     } catch (error) {
       // NO tocar el estado local
       notifications.show({ title: 'Error al anular', message: error.message, color: 'red' });
     } finally {
       setLoading(false);
     }
   };

3. Agregar estado de loading al boton de anular para evitar doble click.

TEST:
- Anular venta con backend funcionando → se marca como anulada (UI + DB).
- Anular venta con backend caido (simular 500) → la UI NO cambia, muestra error.
- Doble click rapido en anular → solo se envia UNA request.
```

**Criterio de completitud**: La UI solo refleja la anulacion si el backend confirmo exitosamente.

---

### B-03: Implementar auto-refresh de tokens JWT

**Problema detectado**: No hay timer ni interceptor que refresque automaticamente el access token antes de que expire. Cuando el token expira, el siguiente request falla con 401 y redirige al login, haciendo que el usuario pierda todo el carrito y trabajo en curso.

**Area afectada**: Frontend → `frontend/src/lib/client.ts` o `frontend/src/lib/http.ts`, store de auth.

**Prompt para el agente:**
```
Lee especificacion.md Feature 05 y arquitectura.md seccion 12.
Implementa auto-refresh de tokens JWT en el frontend:

CORRECCION:
1. En el interceptor HTTP (axios/fetch wrapper), agregar logica de refresh automatico:

   Opcion A — Interceptor de respuesta (reactivo):
   - Si una respuesta retorna 401 → intentar refresh automaticamente.
   - Usar el refresh token para llamar a POST /v1/auth/refresh.
   - Si el refresh tiene exito → reintentar la request original con el nuevo access token.
   - Si el refresh falla → ahora si redirigir al login.
   - Usar un flag/promise compartido para evitar multiples refreshes simultaneos.

   Opcion B — Timer proactivo (recomendado, combinado con A):
   - Al recibir tokens, decodificar el access token y leer el claim "exp".
   - Programar un setTimeout para refrescar cuando falten 60 segundos para expirar.
   - Si el refresh tiene exito → reprogramar el timer con el nuevo token.
   - Si falla → mostrar notificacion "Sesion por expirar" y redirigir al login.

2. Implementacion del interceptor (pseudo-codigo):
   let isRefreshing = false;
   let refreshPromise: Promise<string> | null = null;

   async function handleUnauthorized(originalRequest) {
     if (!isRefreshing) {
       isRefreshing = true;
       refreshPromise = refreshTokens();
     }
     try {
       const newToken = await refreshPromise;
       // Reintentar con nuevo token
       return retry(originalRequest, newToken);
     } catch {
       // Refresh fallo — sesion expirada realmente
       logout();
     } finally {
       isRefreshing = false;
       refreshPromise = null;
     }
   }

3. Almacenar el refresh token de forma separada al access token.
4. No perder el carrito ni el estado de trabajo ante un refresh exitoso.

TEST:
- Login → esperar a que el access token este por expirar → se refresca automaticamente.
- Request con token expirado → se refresca automaticamente → request se reintenta → funciona.
- Refresh token tambien expirado → redirige al login con mensaje.
- Multiples requests con token expirado → solo UN refresh, todas esperan y se reintentan.
```

**Criterio de completitud**: El usuario nunca pierde su sesion/trabajo por expiracion de access token si tiene refresh token valido.

---

### B-04: Eliminar modal bulkDeleteOpen duplicado

**Problema detectado**: En `GestionProductosPage.tsx` hay una declaracion duplicada del estado `bulkDeleteOpen` para el modal de eliminacion masiva. Esto puede causar que el modal se ejecute dos veces o tenga comportamiento inconsistente.

**Area afectada**: Frontend → `frontend/src/pages/admin/GestionProductosPage.tsx`.

**Prompt para el agente:**
```
Corrige la declaracion duplicada del modal de eliminacion masiva:

DIAGNOSTICO:
1. Buscar en GestionProductosPage.tsx todas las ocurrencias de "bulkDeleteOpen",
   "bulkDelete", "BulkDelete" o similar.
2. Verificar si hay dos useState o dos handlers para la misma funcionalidad.
3. Verificar si hay dos modales renderizados en el JSX.

CORRECCION:
1. Eliminar la declaracion duplicada del estado — dejar solo UNA:
   const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

2. Verificar que solo hay UN modal de bulk delete en el JSX.
3. Si hay dos handlers (ej: handleBulkDelete y handleBulkDeleteConfirm),
   unificar en un solo flujo claro:
   - setBulkDeleteOpen(true) → abre el modal de confirmacion.
   - handleBulkDeleteConfirm() → ejecuta la eliminacion y cierra el modal.
   - setBulkDeleteOpen(false) → cierra el modal sin hacer nada.

4. Verificar que no hay otros estados duplicados en el mismo componente.

TEST:
- Seleccionar multiples productos → click en "Eliminar seleccionados" → modal aparece UNA vez.
- Confirmar → productos eliminados correctamente.
- Cancelar → modal se cierra, productos siguen intactos.
- No hay warnings de React en la consola por estados duplicados.
```

**Criterio de completitud**: Solo existe UNA declaracion del estado del modal y se ejecuta una unica vez.

---

### B-05: Implementar retry automatico para sync offline

**Problema detectado**: Cuando las ventas se registran offline (en IndexedDB via SyncQueue), no hay ningun timer ni trigger del Service Worker que reintente la sincronizacion automaticamente. Las ventas quedan atrapadas en la cola hasta que el usuario realice una accion manual.

**Area afectada**: Frontend → `frontend/src/lib/syncEngine.ts` o equivalente, Service Worker.

**Prompt para el agente:**
```
Lee arquitectura.md seccion 2.4 (Local-First) y especificacion.md Feature 09.
Implementa retry automatico para la cola de sincronizacion offline:

CORRECCION:
1. Crear o modificar el SyncEngine para incluir un retry timer:
   - Al detectar que hay ventas pendientes en la cola Y hay conexion a internet:
     intentar sincronizar cada 30 segundos.
   - Si la sincronizacion falla → backoff exponencial: 30s → 60s → 120s → max 5 min.
   - Si la sincronizacion tiene exito → resetear el intervalo a 30s.

2. Deteccion de conectividad:
   - Escuchar eventos navigator.onLine / navigator.offLine.
   - Cuando se recupera la conexion → intentar sincronizar inmediatamente.

3. Indicador visual en la UI:
   - Mostrar badge/chip en el header del POS con el numero de ventas pendientes:
     "3 ventas pendientes de sync" (amarillo).
   - Cuando todo esta sincronizado: "Sincronizado" (verde) o no mostrar nada.
   - Cuando hay error de sync: "Error de sincronizacion — reintentando..." (rojo).

4. Limite de cola:
   - Si hay mas de 100 ventas pendientes en la cola, mostrar alerta al cajero.
   - Esto previene que un problema silencioso acumule cientos de ventas sin sincronizar.

5. Registrar en el Service Worker la estrategia de Background Sync (si el navegador lo soporta):
   self.addEventListener('sync', event => {
     if (event.tag === 'sync-ventas') {
       event.waitUntil(sincronizarVentas());
     }
   });

TEST:
- Desconectar internet → realizar 3 ventas → reconectar → las 3 ventas se sincronizan automaticamente.
- Verificar que el badge muestra "3 pendientes" mientras esta offline.
- Simular error de backend al sincronizar → el timer reintenta con backoff.
- Verificar que las ventas se sincronizan en el orden correcto (FIFO).
```

**Criterio de completitud**: Las ventas offline se reintentan automaticamente con backoff, indicador visual de estado.

---

## FASE 3 — SEGURIDAD PERIMETRAL (Hardening)

Estas tareas endurecen el sistema contra ataques comunes sin ser bloqueantes.

---

### H-01: Corregir race condition en apertura de caja

**Problema detectado**: Si dos usuarios hacen POST /v1/caja/abrir al mismo tiempo para el mismo punto de venta, ambos pueden pasar la validacion "no hay caja abierta" y crear dos sesiones abiertas simultaneas, corrompiendo los totales de caja.

**Area afectada**: Backend → `internal/service/caja_service.go`.

**Prompt para el agente:**
```
Lee especificacion.md Feature 04 (AC-04.1) y arquitectura.md seccion 7.2.
Corrige la race condition en la apertura de caja:

CORRECCION:
1. Usar advisory lock de PostgreSQL dentro de la transaccion:
   - Antes de verificar si hay caja abierta, adquirir un lock:
     SELECT pg_advisory_xact_lock(hashtext('caja_open_' || punto_de_venta))
   - Esto serializa las aperturas para el mismo punto de venta.
   - El lock se libera automaticamente al finalizar la transaccion.

2. Implementacion en GORM:
   err := db.Transaction(func(tx *gorm.DB) error {
       // Advisory lock para serializar aperturas del mismo punto de venta
       tx.Exec("SELECT pg_advisory_xact_lock(hashtext(?))",
           fmt.Sprintf("caja_open_%d", puntoDeVenta))

       // Verificar que no hay caja abierta
       var count int64
       tx.Model(&SesionCaja{}).Where("punto_de_venta = ? AND estado = 'abierta'", puntoDeVenta).Count(&count)
       if count > 0 {
           return errors.New("ya existe una caja abierta para este punto de venta")
       }

       // Crear la sesion
       return tx.Create(&sesion).Error
   })

3. Alternativa sin advisory lock: usar UNIQUE partial index:
   CREATE UNIQUE INDEX uq_caja_abierta_por_punto
     ON sesion_cajas (punto_de_venta)
     WHERE estado = 'abierta';
   - Esto impide a nivel de DB que existan dos cajas abiertas en el mismo punto.
   - La apertura que pierda la carrera recibira un error de constraint violation.
   - Manejar ese error en el servicio y retornar 409 Conflict.

TEST:
- 2 requests simultaneos de apertura para POS #1 → solo UNA tiene exito, la otra recibe 409.
- Abrir caja exitosamente en POS #1 → intentar abrir otra en POS #1 → rechazada.
- Abrir en POS #1 y POS #2 simultaneamente → ambas tienen exito (diferentes puntos de venta).
```

**Criterio de completitud**: Es imposible tener dos cajas abiertas para el mismo punto de venta.

---

### H-02: Rate limiter resiliente ante caida de Redis

**Problema detectado**: El rate limiter usa Redis para contabilizar requests. Si Redis se cae, el rate limiter falla silenciosamente y deja pasar TODOS los requests sin limite, permitiendo ataques de fuerza bruta contra el login.

**Area afectada**: Backend → `internal/middleware/rate_limiter.go`.

**Prompt para el agente:**
```
Lee CLAUDE.md (middleware) y arquitectura.md seccion 12.
Corrige el rate limiter para que no falle abierto:

CORRECCION:
1. Cuando Redis no responda, el rate limiter debe DENEGAR el request (fail closed):
   func RateLimiter(redisClient *redis.Client, limit int, window time.Duration) gin.HandlerFunc {
       return func(c *gin.Context) {
           key := "rate:" + c.ClientIP()
           count, err := redisClient.Incr(ctx, key).Result()
           if err != nil {
               // Redis caido — DENEGAR por seguridad
               log.Error().Err(err).Msg("Rate limiter: Redis unavailable, denying request")
               c.AbortWithStatusJSON(503, gin.H{"error": "Service temporarily unavailable"})
               return
           }
           if count == 1 {
               redisClient.Expire(ctx, key, window)
           }
           if count > int64(limit) {
               c.AbortWithStatusJSON(429, gin.H{"error": "Too many requests"})
               return
           }
           c.Next()
       }
   }

2. Aplicar el rate limiter SOLO a endpoints sensibles (no a todos):
   - POST /v1/auth/login — 5 intentos por minuto por IP
   - POST /v1/auth/refresh — 10 intentos por minuto por IP
   - Los endpoints internos de negocio ya estan protegidos por JWT.

3. Agregar header Retry-After en la respuesta 429:
   c.Header("Retry-After", strconv.Itoa(int(window.Seconds())))

4. Considerar un fallback in-memory (sync.Map) para cuando Redis no esta disponible,
   con un limite mas conservador (ej: 3 intentos por minuto).

TEST:
- 5 requests de login desde la misma IP → los primeros 5 pasan, el 6to recibe 429.
- Apagar Redis → intentar login → recibe 503 (no pasa sin limite).
- Encender Redis → los requests vuelven a funcionar normalmente.
```

**Criterio de completitud**: El rate limiter nunca falla abierto. Redis caido → requests denegados o fallback in-memory.

---

### H-03: Logger estructurado para produccion

**Problema detectado**: `zerolog.ConsoleWriter` se usa incondicionalmente. En produccion, esto genera logs legibles para humanos pero incompatibles con herramientas de log aggregation (Datadog, Grafana Loki, CloudWatch). Los logs de produccion deben ser JSON estructurado.

**Area afectada**: Backend → `cmd/server/main.go` o donde se configura zerolog.

**Prompt para el agente:**
```
Lee CLAUDE.md (stack: rs/zerolog) y arquitectura.md seccion 13 (observabilidad).
Configura el logger para diferenciar dev y produccion:

CORRECCION:
1. Leer una variable de entorno para determinar el ambiente:
   APP_ENV=development|production (default: production)

2. Configurar zerolog segun el ambiente:
   if cfg.AppEnv == "development" {
       // Logs bonitos para terminal
       log.Logger = zerolog.New(zerolog.ConsoleWriter{
           Out: os.Stderr,
           TimeFormat: time.Kitchen,
       }).With().Timestamp().Caller().Logger()
   } else {
       // Logs JSON para produccion (compatible con log aggregation)
       log.Logger = zerolog.New(os.Stderr).
           With().
           Timestamp().
           Str("service", "blendpos-backend").
           Str("version", cfg.AppVersion).
           Logger()
   }

3. Agregar APP_ENV a config.go y a .env.example:
   APP_ENV=development  # development | production

4. Agregar APP_VERSION a config.go:
   APP_VERSION=1.0.0  # Se puede inyectar via ldflags en build

5. Asegurar que zerolog.SetGlobalLevel() se configura:
   - development: zerolog.DebugLevel
   - production: zerolog.InfoLevel

TEST:
- APP_ENV=development → logs con colores, timestamps legibles, caller info.
- APP_ENV=production → logs JSON en una linea, sin colores.
- APP_ENV no seteado → default a production (JSON).
```

**Criterio de completitud**: Produccion emite logs JSON estructurados. Dev emite logs legibles.

---

### H-04: Restringir CORS del sidecar AFIP

**Problema detectado**: El sidecar AFIP tiene `allow_origins=["*"]` en su configuracion CORS de FastAPI. Si bien el sidecar solo deberia ser accesible desde la red interna de Docker, un CORS abierto es una mala practica que podria ser explotada si se expone accidentalmente.

**Area afectada**: AFIP Sidecar → `afip-sidecar/main.py`.

**Prompt para el agente:**
```
Corrige la configuracion CORS del sidecar AFIP:

CORRECCION:
1. En afip-sidecar/main.py, localizar la configuracion de CORSMiddleware.
2. Cambiar allow_origins de ["*"] a los origenes especificos necesarios:
   - Solo deberia ser accesible desde el backend Go, que lo llama via HTTP interno.
   - El sidecar no necesita CORS en absoluto porque no recibe requests desde el navegador.

3. Opcion recomendada — ELIMINAR el middleware CORS completamente:
   # No hay razon para CORS en un servicio interno que solo recibe requests del backend
   # ELIMINAR estas lineas:
   # app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)

4. Si se necesita CORS por alguna razon de desarrollo:
   app.add_middleware(
       CORSMiddleware,
       allow_origins=["http://localhost:8080"],  # Solo el backend en dev
       allow_methods=["POST"],
       allow_headers=["X-Internal-Token", "Content-Type"],
   )

5. Verificar que docker-compose.prod.yml NO expone el puerto del sidecar (8001) externamente.
   El sidecar solo debe ser accesible via la red interna de Docker:
   afip-sidecar:
     # NO debe tener "ports:" expuesto al host
     networks:
       - internal

TEST:
- El backend puede llamar al sidecar via HTTP interno → funciona.
- Request directo al sidecar desde fuera de Docker → no deberia ser accesible.
- docker-compose.prod.yml no tiene "ports:" para el afip-sidecar.
```

**Criterio de completitud**: El sidecar AFIP no tiene CORS abierto y no es accesible externamente.

---

### H-05: Unificar HTTP clients del frontend

**Problema detectado**: El frontend tiene dos abstracciones HTTP diferentes: `http.ts` que usa `VITE_API_URL` y `client.ts` que usa `VITE_API_BASE`. Algunos modulos usan uno y otros usan el otro, causando que la variable de entorno incorrecta pueda dejar endpoints sin funcionar.

**Area afectada**: Frontend → `frontend/src/lib/http.ts`, `frontend/src/lib/client.ts`.

**Prompt para el agente:**
```
Unifica las abstracciones HTTP del frontend:

DIAGNOSTICO:
1. Leer frontend/src/lib/http.ts — ¿que exporta? ¿que variable de entorno usa?
2. Leer frontend/src/lib/client.ts — ¿que exporta? ¿que variable de entorno usa?
3. Buscar en todo el frontend (grep) quien importa de http.ts y quien de client.ts.
4. ¿Cual de los dos tiene manejo de errores, interceptores y auth header?

CORRECCION:
1. Decidir cual mantener (el que tenga mejor implementacion) y eliminar el otro.
2. El cliente unificado debe:
   - Usar UNA sola variable de entorno: VITE_API_URL.
   - Agregar automaticamente el header Authorization: Bearer {token}.
   - Manejar errores de red con mensajes claros.
   - Implementar el interceptor de refresh automatico (B-03).
   - Exportar funciones tipadas: get<T>, post<T>, put<T>, delete<T>.

3. Actualizar TODOS los imports del archivo eliminado para que apunten al unificado.
4. Eliminar el archivo deprecado.
5. Actualizar .env.example para que solo tenga VITE_API_URL (eliminar VITE_API_BASE si existe).

6. Caso especial — categorias.ts:
   - Verificar que categorias.ts usa el cliente unificado en vez de fetch directo.
   - Corregir el bug donde envia "Bearer null" cuando no hay token.

TEST:
- Todos los endpoints del frontend funcionan correctamente con el cliente unificado.
- No quedan imports del archivo eliminado.
- grep -r "VITE_API_BASE" en frontend → 0 resultados (a menos que sea la misma var).
- Login → navegar por todas las paginas → ninguna falla con error de URL o auth.
```

**Criterio de completitud**: UN solo HTTP client, UNA sola variable de entorno, todos los modulos lo usan.

---

### H-06: Corregir lectura de stock fuera de transaccion en AnularVenta

**Problema detectado**: En `venta_service.go`, la funcion `AnularVenta` lee el `stockAntes` del producto fuera de la transaccion principal. Si otra venta concurrente modifica el stock entre la lectura y la escritura, el valor `stockAntes` registrado en la auditoria sera incorrecto.

**Area afectada**: Backend → `internal/service/venta_service.go`.

**Prompt para el agente:**
```
Lee especificacion.md Feature 01 (AC-01.5) y arquitectura.md seccion 7.1.
Corrige la lectura de stock en la anulacion de ventas:

DIAGNOSTICO:
1. En venta_service.go → AnularVenta(): ¿donde se lee el stock actual del producto?
2. ¿Esa lectura esta dentro del db.Transaction()?
3. ¿Se registra stockAntes / stockDespues en algun log o tabla de auditoria?

CORRECCION:
1. Mover TODA la logica de anulacion dentro de db.Transaction():
   err := db.Transaction(func(tx *gorm.DB) error {
       // 1. Obtener la venta con sus items (dentro de TX)
       // 2. Verificar que no esta ya anulada
       // 3. Para cada item:
       //    a. Leer stock actual DENTRO de la TX (FOR UPDATE si es posible)
       //    b. Restaurar stock
       //    c. Registrar stockAntes y stockDespues
       // 4. Crear movimiento de caja inverso
       // 5. Marcar venta como anulada
       return nil
   })

2. Usar SELECT FOR UPDATE para evitar lecturas fantasma:
   tx.Clauses(clause.Locking{Strength: "UPDATE"}).
     Where("id = ?", productoID).First(&producto)

3. Registrar los valores de stock correctamente:
   stockAntes := producto.StockActual  // Valor dentro de TX con lock
   producto.StockActual += item.Cantidad
   stockDespues := producto.StockActual

TEST:
- Anular venta → stockAntes y stockDespues son correctos en la DB.
- Anular venta concurrente con otra venta del mismo producto → ambas operaciones son consistentes.
- Doble anulacion de la misma venta → rechazada (ya esta anulada).
```

**Criterio de completitud**: Toda la lectura y escritura de stock en anulacion esta dentro de la misma transaccion con locks apropiados.

---

## FASE 4 — ESTABILIDAD Y RESILIENCIA

---

### R-01: Shutdown graceful de workers

**Problema detectado**: Los workers de facturacion y email no tienen mecanismo de drain. Cuando el servidor se detiene (`SIGTERM`), los goroutines se matan inmediatamente, perdiendo jobs en vuelo (ej: un comprobante a mitad de procesamiento).

**Area afectada**: Backend → `internal/worker/`, `cmd/server/main.go`.

**Prompt para el agente:**
```
Lee arquitectura.md seccion 8 (patrones) y CLAUDE.md (worker pool).
Implementa shutdown graceful para los workers:

CORRECCION:
1. En el worker pool, agregar sync.WaitGroup para trackear jobs en vuelo:
   type WorkerPool struct {
       wg     sync.WaitGroup
       ctx    context.Context
       cancel context.CancelFunc
       // ...
   }

2. Cada vez que un worker toma un job:
   w.wg.Add(1)
   defer w.wg.Done()

3. En main.go, manejar señales de OS para shutdown graceful:
   quit := make(chan os.Signal, 1)
   signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
   <-quit

   log.Info().Msg("Shutting down...")

   // 1. Cancelar el contexto (notifica a los workers que paren de tomar nuevos jobs)
   cancel()

   // 2. Esperar a que los jobs en vuelo terminen (con timeout)
   done := make(chan struct{})
   go func() {
       workerPool.wg.Wait()
       close(done)
   }()

   select {
   case <-done:
       log.Info().Msg("All workers finished gracefully")
   case <-time.After(30 * time.Second):
       log.Warn().Msg("Timeout waiting for workers, forcing shutdown")
   }

   // 3. Cerrar servidor HTTP
   srv.Shutdown(shutdownCtx)

   // 4. Cerrar conexiones de DB y Redis
   db.Close()
   redis.Close()

4. En el bucle del worker, verificar ctx.Done() antes de tomar un nuevo job:
   for {
       select {
       case <-ctx.Done():
           return  // No tomar mas jobs
       case job := <-jobChannel:
           w.wg.Add(1)
           processJob(job)
           w.wg.Done()
       }
   }

TEST:
- Iniciar el servidor → enviar SIGTERM → los workers terminen sus jobs actuales antes de salir.
- Verificar en logs: "All workers finished gracefully".
- Si un worker tarda mas de 30s → el servidor se cierra igualmente con advertencia.
```

**Criterio de completitud**: `SIGTERM` espera a que los workers terminen jobs en vuelo (max 30s) antes de cerrar.

---

### R-02: Retry de conexion a DB al startup

**Problema detectado**: Si PostgreSQL no esta listo cuando el backend arranca (comun en Docker), el servidor falla inmediatamente y se reinicia en loop (restart storms) hasta que la DB este disponible. Deberia hacer retry con backoff.

**Area afectada**: Backend → `internal/infra/database.go`.

**Prompt para el agente:**
```
Implementa retry de conexion a la base de datos:

CORRECCION:
1. En infra/database.go → NewDatabase(), agregar logica de retry:
   func NewDatabase(cfg *config.Config) (*gorm.DB, error) {
       var db *gorm.DB
       var err error

       maxRetries := 10
       for i := 0; i < maxRetries; i++ {
           db, err = gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{...})
           if err == nil {
               sqlDB, _ := db.DB()
               if pingErr := sqlDB.Ping(); pingErr == nil {
                   log.Info().Int("attempt", i+1).Msg("Database connected")
                   return db, nil
               }
           }
           wait := time.Duration(i+1) * 2 * time.Second  // 2s, 4s, 6s, ... 20s
           log.Warn().Int("attempt", i+1).Dur("retry_in", wait).Msg("Database not ready, retrying...")
           time.Sleep(wait)
       }

       return nil, fmt.Errorf("failed to connect to database after %d attempts: %w", maxRetries, err)
   }

2. Lo mismo para Redis en infra/redis.go:
   func NewRedis(cfg *config.Config) (*redis.Client, error) {
       // Retry similar con max 10 intentos
   }

3. Los logs de retry deben incluir el numero de intento y el tiempo de espera.
4. Si todos los intentos fallan → log.Fatal() con mensaje claro.

TEST:
- Arrancar el backend con PostgreSQL apagado → ver logs de retry.
- Encender PostgreSQL despues de 5 segundos → el backend se conecta sin reinicio.
- PostgreSQL nunca arranca → el backend falla despues de 10 intentos con error claro.
```

**Criterio de completitud**: El backend tolera que la DB tarde hasta ~2 minutos en estar lista sin necesitar restart.

---

### R-03: Agregar resource limits a docker-compose.prod.yml

**Problema detectado**: Ningun servicio en docker-compose.prod.yml tiene limites de CPU o memoria. Un servicio con memory leak puede consumir toda la RAM del servidor y tirar abajo los demas servicios.

**Area afectada**: `docker-compose.prod.yml`.

**Prompt para el agente:**
```
Agrega limites de recursos a los servicios de produccion:

CORRECCION:
1. En docker-compose.prod.yml, agregar deploy.resources a cada servicio:

   backend:
     deploy:
       resources:
         limits:
           cpus: '1.0'
           memory: 512M
         reservations:
           cpus: '0.25'
           memory: 128M

   frontend:
     deploy:
       resources:
         limits:
           cpus: '0.5'
           memory: 256M
         reservations:
           cpus: '0.1'
           memory: 64M

   postgres:
     deploy:
       resources:
         limits:
           cpus: '1.0'
           memory: 1G
         reservations:
           cpus: '0.25'
           memory: 256M

   redis:
     deploy:
       resources:
         limits:
           cpus: '0.5'
           memory: 256M
         reservations:
           cpus: '0.1'
           memory: 64M

   afip-sidecar:
     deploy:
       resources:
         limits:
           cpus: '0.5'
           memory: 256M
         reservations:
           cpus: '0.1'
           memory: 64M

2. NOTA: Estos limites son para un servidor con 4GB RAM / 2 CPU (tipico droplet).
   Ajustar segun el hardware real.

3. Agregar tambien logging driver para evitar que logs llenen el disco:
   logging:
     driver: "json-file"
     options:
       max-size: "10m"
       max-file: "3"

TEST:
- docker compose -f docker-compose.prod.yml config → no hay errores de sintaxis.
- docker compose up → todos los servicios arrancan con los limites aplicados.
- docker stats → muestra los limites de memoria configurados.
```

**Criterio de completitud**: Todos los servicios tienen limites de CPU, memoria y logging.

---

### R-04: Documentar estrategia de backup de PostgreSQL

**Problema detectado**: No hay ningun script, cron job ni documentacion sobre como hacer backup de la base de datos PostgreSQL. En caso de falla de disco o corrupcion, se perderian todos los datos.

**Area afectada**: Infraestructura, documentacion.

**Prompt para el agente:**
```
Crea un script de backup y documenta la estrategia:

CORRECCION:
1. Crear scripts/backup.sh:
   #!/bin/bash
   # BlendPOS — Backup de PostgreSQL
   set -euo pipefail

   TIMESTAMP=$(date +%Y%m%d_%H%M%S)
   BACKUP_DIR="/backups/blendpos"
   BACKUP_FILE="${BACKUP_DIR}/blendpos_${TIMESTAMP}.sql.gz"
   RETENTION_DAYS=30

   mkdir -p "$BACKUP_DIR"

   # Dump comprimido
   docker compose exec -T postgres pg_dump -U blendpos blendpos | gzip > "$BACKUP_FILE"

   # Verificar que el archivo no esta vacio
   if [ ! -s "$BACKUP_FILE" ]; then
     echo "ERROR: Backup file is empty!" >&2
     exit 1
   fi

   echo "Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

   # Limpiar backups viejos
   find "$BACKUP_DIR" -name "blendpos_*.sql.gz" -mtime +$RETENTION_DAYS -delete
   echo "Old backups cleaned (retention: ${RETENTION_DAYS} days)"

2. Crear scripts/restore.sh:
   #!/bin/bash
   # BlendPOS — Restore de PostgreSQL
   set -euo pipefail

   BACKUP_FILE="$1"
   if [ -z "$BACKUP_FILE" ]; then
     echo "Usage: ./restore.sh <backup_file.sql.gz>"
     exit 1
   fi

   echo "WARNING: This will overwrite the current database!"
   read -p "Continue? (y/N) " -r
   [[ $REPLY =~ ^[Yy]$ ]] || exit 0

   gunzip -c "$BACKUP_FILE" | docker compose exec -T postgres psql -U blendpos blendpos

   echo "Restore completed from: $BACKUP_FILE"

3. Documentar la configuracion de cron en el README o GUIA_DEPLOY:
   # Backup diario a las 3 AM
   0 3 * * * /opt/blendpos/scripts/backup.sh >> /var/log/blendpos-backup.log 2>&1

TEST:
- Ejecutar ./scripts/backup.sh → se genera un archivo .sql.gz no vacio.
- Ejecutar ./scripts/restore.sh <backup> → la DB se restaura correctamente.
- El cron job se ejecuta diariamente y limpia backups > 30 dias.
```

**Criterio de completitud**: Scripts de backup/restore funcionales con retencion de 30 dias.

---

### R-05: Healthcheck del afip-sidecar como dependencia

**Problema detectado**: En docker-compose.yml (dev), el `afip-sidecar` no tiene healthcheck como dependencia. Si el sidecar tarda en arrancar, el backend puede enviar requests de facturacion antes de que este listo, causando errores silenciosos.

**Area afectada**: `docker-compose.yml`, `docker-compose.prod.yml`.

**Prompt para el agente:**
```
Agrega healthcheck y dependencia del afip-sidecar:

CORRECCION:
1. En docker-compose.yml Y docker-compose.prod.yml, agregar healthcheck al afip-sidecar:
   afip-sidecar:
     healthcheck:
       test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"]
       interval: 15s
       timeout: 5s
       retries: 3
       start_period: 30s

2. Agregar dependencia en el servicio backend:
   backend:
     depends_on:
       postgres:
         condition: service_healthy
       redis:
         condition: service_healthy
       afip-sidecar:
         condition: service_healthy

3. NOTA: Esto no significa que el backend falle si el sidecar esta caido.
   La dependencia solo aplica al startup. En runtime, el backend ya maneja
   errores del sidecar con circuit breaker y retry.

TEST:
- docker compose up → el backend espera a que el sidecar este healthy antes de arrancar.
- Apagar el sidecar despues del startup → el backend sigue funcionando (circuit breaker).
```

**Criterio de completitud**: El backend no arranca hasta que el sidecar AFIP pase su healthcheck.

---

## FASE 5 — RENDIMIENTO FRONTEND

---

### P-01: Implementar lazy loading de rutas

**Problema detectado**: Todas las paginas del admin (Productos, Inventario, Proveedores, Facturacion, Usuarios, etc.) se cargan en el bundle inicial. Un cajero que solo usa la terminal POS descarga codigo que nunca va a usar, aumentando el tiempo de carga inicial.

**Area afectada**: Frontend → `frontend/src/App.tsx` o archivo de rutas.

**Prompt para el agente:**
```
Implementa code splitting con lazy loading para las rutas del admin:

CORRECCION:
1. En el archivo de rutas (App.tsx o router config), cambiar los imports estaticos por lazy:

   // ANTES (todo en el bundle inicial):
   import DashboardPage from './pages/admin/DashboardPage';
   import GestionProductosPage from './pages/admin/GestionProductosPage';
   ...

   // DESPUES (cada pagina es un chunk separado):
   const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
   const GestionProductosPage = lazy(() => import('./pages/admin/GestionProductosPage'));
   const InventarioPage = lazy(() => import('./pages/admin/InventarioPage'));
   const ProveedoresPage = lazy(() => import('./pages/admin/ProveedoresPage'));
   const FacturacionPage = lazy(() => import('./pages/admin/FacturacionPage'));
   const UsuariosPage = lazy(() => import('./pages/admin/UsuariosPage'));
   const CategoriasPage = lazy(() => import('./pages/admin/CategoriasPage'));
   const CierreCajaPage = lazy(() => import('./pages/admin/CierreCajaPage'));

2. Envolver las rutas lazy en Suspense con fallback:
   <Suspense fallback={<LoadingSpinner />}>
     <Route path="/admin/productos" element={<GestionProductosPage />} />
     ...
   </Suspense>

3. La pagina POS (PosTerminal.tsx) y LoginPage deben seguir siendo imports estaticos
   (se usan siempre y son criticas).

4. Crear un componente LoadingSpinner simple para el fallback:
   function LoadingSpinner() {
     return <Center h="100vh"><Loader size="xl" /></Center>;
   }

TEST:
- npm run build → verificar que se generan multiples chunks (no un solo bundle).
- Abrir la app → solo se carga el chunk del POS inicialmente.
- Navegar a /admin/productos → se carga el chunk de productos on-demand.
- Verificar que no hay flash of unstyled content ni delays perceptibles.
```

**Criterio de completitud**: Cada pagina admin es un chunk separado cargado on-demand.

---

### P-02: Optimizar busqueda de productos en catalogo offline

**Problema detectado**: `searchCatalogProducts()` ejecuta `db.products.toArray()` en cada keystroke, cargando TODOS los productos de IndexedDB a memoria para luego filtrarlos con `.filter()`. Con 500+ productos, esto causa lag perceptible.

**Area afectada**: Frontend → `frontend/src/lib/db.ts` o archivo de busqueda de catalogo.

**Prompt para el agente:**
```
Optimiza la busqueda del catalogo local:

CORRECCION:
1. Usar los indices de Dexie.js en vez de toArray() + filter():

   // ANTES (lento — carga todo a memoria):
   const all = await db.products.toArray();
   return all.filter(p => p.nombre.includes(query) || p.codigoBarras === query);

   // DESPUES (rapido — usa indice de Dexie):
   // Busqueda exacta por barcode (usa indice):
   if (looksLikeBarcode(query)) {
     return db.products.where('codigoBarras').equals(query).toArray();
   }
   // Busqueda por nombre (usa indice con startsWith o equalsIgnoreCase):
   return db.products
     .where('nombre')
     .startsWithIgnoreCase(query)
     .or('nombre')
     .filter(p => p.nombre.toLowerCase().includes(query.toLowerCase()))
     .limit(50)  // No devolver mas de 50 resultados
     .toArray();

2. Asegurar que los indices estan definidos en el schema de Dexie:
   db.version(X).stores({
     products: '++id, codigoBarras, nombre, categoriaId, activo',
   });

3. Agregar debounce de 200ms al input de busqueda para no disparar queries en cada keystroke:
   const debouncedSearch = useDebouncedCallback((query) => {
     searchCatalogProducts(query).then(setResults);
   }, 200);

4. Limitar resultados a 50 para evitar renderizar listas enormes.

TEST:
- Escribir "coca" en la busqueda → resultados aparecen sin lag perceptible.
- Base de datos con 1000 productos → la busqueda sigue fluida.
- Busqueda por barcode exacto → resultado instantaneo (indice).
```

**Criterio de completitud**: La busqueda usa indices de Dexie y debounce, sin cargar todos los productos a memoria.

---

### P-03: Optimizar re-renders del reloj en PosHeader

**Problema detectado**: PosHeader tiene un `setInterval` de 1 segundo que actualiza la hora, causando que TODO el componente header (y potencialmente sus hijos) se re-renderice cada segundo.

**Area afectada**: Frontend → `frontend/src/components/PosHeader.tsx` o similar.

**Prompt para el agente:**
```
Aisla el re-render del reloj para que no afecte al resto del header:

CORRECCION:
1. Extraer el reloj a su propio componente memoizado:
   function Clock() {
     const [time, setTime] = useState(new Date());

     useEffect(() => {
       const timer = setInterval(() => setTime(new Date()), 1000);
       return () => clearInterval(timer);
     }, []);

     return <Text size="sm">{time.toLocaleTimeString()}</Text>;
   }

   // En PosHeader:
   function PosHeader({ ... }) {
     return (
       <Header>
         <Logo />
         <TerminalNumber />
         <Clock />  {/* Solo este componente re-renderiza cada segundo */}
         <UserMenu />
       </Header>
     );
   }

2. Si PosHeader recibe props que cambian frecuentemente, envolverlo en React.memo():
   export const PosHeader = React.memo(function PosHeader({ ... }) { ... });

3. Aumentar el intervalo a 60 segundos si solo se muestra la hora (sin segundos):
   - Si se muestra "14:30" → intervalo de 60s es suficiente.
   - Si se muestra "14:30:45" → mantener 1s pero solo en el componente Clock.

TEST:
- React DevTools Profiler → solo el componente Clock re-renderiza cada segundo.
- PosHeader y sus otros hijos NO re-renderizan por el reloj.
```

**Criterio de completitud**: El reloj no causa re-renders innecesarios fuera de su propio componente.

---

### P-04: Eliminar forceRefreshCatalog despues de cada venta

**Problema detectado**: Despues de cada venta exitosa, el frontend llama a `forceRefreshCatalog()` que descarga TODOS los productos del backend. Esto es innecesario y genera trafico de red excesivo, especialmente con muchas ventas rapidas.

**Area afectada**: Frontend → logica post-venta en POS.

**Prompt para el agente:**
```
Optimiza la actualizacion del catalogo despues de una venta:

CORRECCION:
1. Eliminar la llamada a forceRefreshCatalog() despues de cada venta.

2. En su lugar, actualizar SOLO el stock de los productos vendidos en IndexedDB:
   async function actualizarStockLocal(items: VentaItem[]) {
     await db.transaction('rw', db.products, async () => {
       for (const item of items) {
         await db.products.update(item.productoId, {
           stockActual: (prev) => prev - item.cantidad
         });
       }
     });
   }

3. Mantener el refresh periodico del catalogo completo (cada 15 minutos) como ya existe.

4. Mantener el forceRefreshCatalog() al abrir caja (inicio de turno).

5. Si el backend retorna el stock actualizado en la respuesta de POST /v1/ventas,
   usar ese valor directamente:
   const response = await apiClient.post('/v1/ventas', ventaData);
   for (const item of response.data.items) {
     await db.products.update(item.producto_id, { stockActual: item.stock_actualizado });
   }

TEST:
- Realizar 5 ventas rapidas → no se dispara ninguna llamada a GET /v1/productos.
- El stock local se actualiza correctamente despues de cada venta.
- El catalogo completo se refresca cada 15 minutos (timer existente).
```

**Criterio de completitud**: No hay refresh completo del catalogo despues de cada venta. Solo actualizacion puntual de stock.

---

### P-05: Agregar virtualizacion a listas de productos

**Problema detectado**: Las tablas de productos en el admin renderizan TODAS las filas al DOM. Con 500+ productos, esto causa lag al scrollear y alto uso de memoria por nodos DOM innecesarios.

**Area afectada**: Frontend → `frontend/src/pages/admin/GestionProductosPage.tsx`.

**Prompt para el agente:**
```
Implementa virtualizacion para la tabla de productos:

CORRECCION:
1. Instalar la libreria de virtualizacion:
   npm install @tanstack/react-virtual
   (o react-window si ya esta en el proyecto)

2. Reemplazar el renderizado completo de la tabla por una lista virtualizada:
   - Solo renderizar las filas visibles en el viewport + un buffer de ~10 filas.
   - Estimar la altura de cada fila (ej: 52px) para calcular el scroll total.

3. Alternativa mas simple si la tabla usa Mantine DataTable:
   - Usar paginacion del lado del servidor con limite de 50 filas por pagina.
   - Agregar controles de paginacion (anterior, siguiente, pagina X de Y).

4. RECOMENDADO — Paginacion server-side (mas simple y efectiva):
   - GET /v1/productos?page=1&limit=50 → retorna 50 productos + total count.
   - Mostrar controles de paginacion en la UI.
   - Esto ya esta parcialmente implementado en el backend — verificar y conectar.

TEST:
- Tabla con 500+ productos → scroll fluido sin lag.
- O con paginacion: 50 productos por pagina, navegacion entre paginas.
- Verificar que los datos al cambiar de pagina son correctos.
```

**Criterio de completitud**: Las listas largas de productos no renderizan todos los elementos al DOM.

---

### P-06: Error boundaries por ruta

**Problema detectado**: No hay error boundaries a nivel de ruta. Si un componente de una pagina lanza un error de renderizado (ej: propiedad undefined), toda la aplicacion se cae con pantalla blanca en vez de solo la pagina afectada.

**Area afectada**: Frontend → rutas / layout.

**Prompt para el agente:**
```
Implementa error boundaries por ruta:

CORRECCION:
1. Crear un componente ErrorBoundary reutilizable:
   class RouteErrorBoundary extends React.Component {
     state = { hasError: false, error: null };

     static getDerivedStateFromError(error) {
       return { hasError: true, error };
     }

     componentDidCatch(error, errorInfo) {
       console.error('Route error:', error, errorInfo);
       // Opcional: enviar al backend para logging
     }

     render() {
       if (this.state.hasError) {
         return (
           <Center h="100%">
             <Stack align="center">
               <Title order={3}>Algo salio mal</Title>
               <Text c="dimmed">{this.state.error?.message}</Text>
               <Button onClick={() => this.setState({ hasError: false })}>
                 Reintentar
               </Button>
               <Button variant="subtle" onClick={() => window.location.href = '/'}>
                 Volver al inicio
               </Button>
             </Stack>
           </Center>
         );
       }
       return this.props.children;
     }
   }

2. Envolver cada ruta (o grupo de rutas) con el ErrorBoundary:
   <Route path="/admin/productos" element={
     <RouteErrorBoundary>
       <Suspense fallback={<LoadingSpinner />}>
         <GestionProductosPage />
       </Suspense>
     </RouteErrorBoundary>
   } />

3. Alternativamente, si se usa react-router v6.4+, usar el prop errorElement:
   <Route path="/admin/productos"
     element={<GestionProductosPage />}
     errorElement={<RouteErrorFallback />}
   />

TEST:
- Simular un error en GestionProductosPage → la pagina muestra "Algo salio mal" con boton de reintentar.
- Las demas paginas (POS, Dashboard) siguen funcionando normalmente.
- Click en "Reintentar" → intenta renderizar de nuevo.
```

**Criterio de completitud**: Un error en una pagina no afecta a las demas. Cada ruta tiene su fallback.

---

## FASE 6 — TESTING Y CI/CD

---

### T-01: Crear pipeline CI/CD con GitHub Actions

**Problema detectado**: No existe ningun pipeline de CI/CD. Los tests nunca se ejecutan automaticamente, lo que permite que regressions se desplieguen sin ser detectadas.

**Area afectada**: Nuevo archivo `.github/workflows/ci.yml`.

**Prompt para el agente:**
```
Crea un pipeline de CI/CD con GitHub Actions:

CORRECCION:
1. Crear .github/workflows/ci.yml:

   name: BlendPOS CI
   on:
     push:
       branches: [master, main]
     pull_request:
       branches: [master, main]

   jobs:
     backend-test:
       runs-on: ubuntu-latest
       services:
         postgres:
           image: postgres:15
           env:
             POSTGRES_USER: test
             POSTGRES_PASSWORD: test
             POSTGRES_DB: blendpos_test
           ports: ['5432:5432']
           options: >-
             --health-cmd pg_isready
             --health-interval 10s
             --health-timeout 5s
             --health-retries 5
         redis:
           image: redis:7
           ports: ['6379:6379']
           options: >-
             --health-cmd "redis-cli ping"
             --health-interval 10s
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-go@v5
           with:
             go-version: '1.24'
         - name: Run tests
           working-directory: backend
           run: go test ./tests/... -v -cover -coverprofile=coverage.out
           env:
             DATABASE_URL: postgres://test:test@localhost:5432/blendpos_test?sslmode=disable
             REDIS_URL: redis://localhost:6379
             JWT_SECRET: test_secret_that_is_at_least_32_characters_long
         - name: Upload coverage
           uses: actions/upload-artifact@v4
           with:
             name: coverage
             path: backend/coverage.out

     frontend-lint:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: '20'
             cache: 'npm'
             cache-dependency-path: frontend/package-lock.json
         - working-directory: frontend
           run: npm ci
         - working-directory: frontend
           run: npm run lint
         - working-directory: frontend
           run: npm run build
           env:
             VITE_API_URL: http://localhost:8080

     docker-build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - name: Build backend image
           run: docker build -t blendpos-backend ./backend
         - name: Build frontend image
           run: docker build -t blendpos-frontend ./frontend --build-arg VITE_API_URL=http://localhost:8080

2. Asegurar que el pipeline corre en cada push a master y en PRs.

TEST:
- Push a master → el pipeline se ejecuta automaticamente.
- Tests fallan → el pipeline falla y notifica.
- Tests pasan + build OK → pipeline verde.
```

**Criterio de completitud**: GitHub Actions ejecuta tests, lint y build en cada push/PR.

---

### T-02: Agregar tests de handlers HTTP backend

**Problema detectado**: Los tests backend cubren bien la capa de servicio pero no tienen tests de los handlers HTTP (excepto auth). Bugs en validacion de DTOs, parsing de parametros o formato de respuesta no se detectan.

**Area afectada**: Backend → `backend/tests/`.

**Prompt para el agente:**
```
Lee CLAUDE.md (estructura de tests) y especificacion.md (contratos API).
Agrega tests HTTP para los handlers principales:

CORRECCION:
Crear tests que verifican los contratos API de cada handler:

1. tests/handler_ventas_test.go:
   - POST /v1/ventas con body valido → 201, verifica estructura del response.
   - POST /v1/ventas con body incompleto → 400 con mensaje de validacion.
   - POST /v1/ventas sin JWT → 401.
   - POST /v1/ventas con rol "administrador" sin tener caja abierta → 400.

2. tests/handler_productos_test.go:
   - GET /v1/productos → 200, retorna array con paginacion.
   - GET /v1/productos?barcode=123 → 200 si existe, 404 si no.
   - POST /v1/productos sin rol admin → 403.
   - PUT /v1/productos/{id} con id inexistente → 404.
   - DELETE /v1/productos/{id} → soft delete (activo=false).

3. tests/handler_caja_test.go:
   - POST /v1/caja/abrir → 201, retorna sesion_id.
   - POST /v1/caja/abrir con caja ya abierta → 409.
   - POST /v1/caja/arqueo sin caja abierta → 400.

4. Usar httptest.NewRecorder() con un router Gin de test:
   func setupTestRouter(service MockService) *gin.Engine {
       gin.SetMode(gin.TestMode)
       r := gin.New()
       handler := handler.NewVentasHandler(service)
       // Registrar rutas con middleware de test
       return r
   }

5. Cada test debe verificar:
   - Status code correcto.
   - Content-Type: application/json.
   - Estructura del body de respuesta.
   - Headers relevantes (ej: X-Request-ID).

TEST:
- go test ./tests/handler_*_test.go -v → todos pasan.
- Cubrir al menos los paths criticos (happy path + principales errores).
```

**Criterio de completitud**: Tests HTTP para ventas, productos y caja con happy path y error cases.

---

### T-03: Agregar tests basicos de frontend

**Problema detectado**: El frontend tiene 0 tests. Ninguna logica de UI, hooks, servicios ni componentes esta testeada. Esto es el gap mas grande de calidad del proyecto.

**Area afectada**: Frontend → nuevos archivos de test.

**Prompt para el agente:**
```
Agrega tests unitarios para los modulos criticos del frontend:

CORRECCION:
1. Verificar que Vitest esta configurado en el proyecto. Si no:
   npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom

2. Configurar vitest.config.ts:
   export default defineConfig({
     test: {
       environment: 'jsdom',
       globals: true,
       setupFiles: './src/test/setup.ts',
     },
   });

3. Tests prioritarios a crear:

   a. src/lib/__tests__/syncQueue.test.ts:
      - Encolar venta → esta en la cola con estado "pending".
      - Sincronizar venta exitosa → se elimina de la cola.
      - Sincronizar venta fallida → permanece en la cola con retry count incrementado.

   b. src/lib/__tests__/auth.test.ts:
      - Login exitoso → guarda tokens.
      - getToken() → retorna token valido.
      - isAuthenticated() → true cuando hay token no expirado.
      - isAuthenticated() → false cuando token expiro.

   c. src/lib/__tests__/client.test.ts:
      - Request con token → agrega header Authorization.
      - Request sin token → no agrega header.
      - Response 401 → intenta refresh.
      - Response 500 → lanza error con mensaje descriptivo.

   d. src/pages/__tests__/PosTerminal.test.tsx:
      - Renderiza sin errores.
      - Buscar producto por barcode → agrega al carrito.
      - Incrementar/decrementar cantidad en carrito.

4. Agregar script en package.json:
   "test": "vitest run",
   "test:watch": "vitest"

TEST:
- npm test → todos los tests pasan.
- npm run test -- --coverage → cobertura visible.
```

**Criterio de completitud**: Al menos 10 tests unitarios cubriendo sync queue, auth y HTTP client.

---

## FASE 7 — CALIDAD Y PULIDO

---

### Q-01: Iconos PWA correctos

**Problema detectado**: La PWA usa `vite.svg` como icono por defecto. Cuando se instala como app en el dispositivo, muestra el icono generico de Vite en vez del logo de BlendPOS.

**Area afectada**: Frontend → `frontend/public/`, PWA manifest.

**Prompt para el agente:**
```
Configura iconos PWA correctos para BlendPOS:

CORRECCION:
1. Generar iconos en los tamaños requeridos:
   - 192x192 (android/homescreen)
   - 512x512 (android/splash)
   - 180x180 (apple-touch-icon)
   - 32x32 y 16x16 (favicon)

2. Si no hay un logo de BlendPOS, crear un icono placeholder profesional:
   - Fondo de color primario del tema (azul o el color de la marca).
   - Iniciales "BP" en blanco, tipografia bold.

3. Colocar los iconos en frontend/public/:
   public/
     icons/
       icon-192x192.png
       icon-512x512.png
       apple-touch-icon.png
     favicon.ico

4. Actualizar la configuracion PWA en vite.config.ts:
   VitePWA({
     manifest: {
       name: 'BlendPOS',
       short_name: 'BlendPOS',
       theme_color: '#228be6',
       background_color: '#ffffff',
       icons: [
         { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
         { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
       ],
     },
   })

5. Actualizar index.html:
   <link rel="icon" type="image/x-icon" href="/favicon.ico">
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
   <meta name="theme-color" content="#228be6">

TEST:
- npm run build → el manifest.webmanifest contiene los iconos correctos.
- Abrir en Chrome → Application tab → Manifest → iconos visibles.
- Instalar como PWA → el icono de BlendPOS aparece en el homescreen (no vite.svg).
```

**Criterio de completitud**: La PWA instalada muestra iconos de BlendPOS, no el logo generico de Vite.

---

### Q-02: Auto-refresh del Dashboard

**Problema detectado**: El Dashboard muestra datos de ventas, caja y stock pero no se refresca automaticamente. Los datos se vuelven stale rapidamente en un entorno de POS activo.

**Area afectada**: Frontend → `frontend/src/pages/admin/DashboardPage.tsx`.

**Prompt para el agente:**
```
Implementa auto-refresh periodico del Dashboard:

CORRECCION:
1. Agregar un intervalo de refresco cada 60 segundos:
   useEffect(() => {
     fetchDashboardData();  // Carga inicial
     const interval = setInterval(fetchDashboardData, 60_000);  // Cada 60s
     return () => clearInterval(interval);
   }, []);

2. Mostrar indicador de ultimo refresco:
   <Text size="xs" c="dimmed">
     Actualizado: {lastRefresh.toLocaleTimeString()}
   </Text>

3. Agregar boton de refresh manual:
   <ActionIcon onClick={fetchDashboardData} loading={isRefreshing}>
     <IconRefresh />
   </ActionIcon>

4. No mostrar spinner/loading en el auto-refresh para no interrumpir la lectura.
   Solo mostrar spinner en el refresh manual o en la carga inicial.

TEST:
- Abrir Dashboard → datos se cargan.
- Esperar 60 segundos → datos se actualizan automaticamente sin spinner visible.
- Click en boton de refresh → datos se actualizan con spinner.
- Navegar fuera del Dashboard → el interval se limpia (no hay memory leaks).
```

**Criterio de completitud**: El Dashboard se auto-refresca cada 60 segundos con indicador de ultima actualizacion.

---

### Q-03: Tabla de auditoria de cambios

**Problema detectado**: No existe una tabla que registre quien cambio que y cuando. Si un precio se modifica incorrectamente o un producto se elimina, no hay forma de saber quien lo hizo.

**Area afectada**: Backend → migracion nueva, middleware o servicio.

**Prompt para el agente:**
```
Implementa un sistema basico de auditoria:

CORRECCION:
1. Crear migracion SQL para la tabla de auditoria:
   CREATE TABLE audit_log (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL,
     user_name VARCHAR(200) NOT NULL,
     action VARCHAR(50) NOT NULL,        -- 'create', 'update', 'delete', 'login', 'anular'
     entity_type VARCHAR(100) NOT NULL,   -- 'producto', 'venta', 'usuario', 'proveedor', etc.
     entity_id UUID,
     details JSONB,                       -- Campos modificados: {"field": {"old": X, "new": Y}}
     ip_address VARCHAR(45),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
   CREATE INDEX idx_audit_log_user ON audit_log (user_id);
   CREATE INDEX idx_audit_log_created ON audit_log (created_at);

2. Crear repository/audit_repo.go:
   type AuditRepo interface {
       Log(ctx context.Context, entry AuditEntry) error
   }

3. Inyectar el AuditRepo en los servicios criticos y registrar eventos:
   - Producto creado / modificado / eliminado
   - Venta registrada / anulada
   - Caja abierta / cerrada
   - Usuario creado / modificado / desactivado
   - Proveedor creado / modificado
   - Actualizacion masiva de precios

4. NOTA: La auditoria es fire-and-forget. Si falla el log de auditoria,
   la operacion principal NO debe fallar. Loguear el error del audit con zerolog.

5. Crear endpoint GET /v1/audit (solo rol administrador) con filtros:
   - entity_type, entity_id, user_id, desde, hasta, page, limit

TEST:
- Crear un producto → existe un registro en audit_log con action="create".
- Anular una venta → registro con action="anular" y details con datos de la venta.
- GET /v1/audit?entity_type=producto → retorna todos los cambios de productos.
```

**Criterio de completitud**: Las operaciones criticas registran quien, que y cuando en la tabla de auditoria.

---

### Q-04: Eliminar credenciales demo del source

**Problema detectado**: Hay credenciales de demo (usuario y contraseña en texto plano) compiladas en el bundle del frontend. Estas son accesibles inspeccionando el JavaScript del bundle en produccion.

**Area afectada**: Frontend → archivos con credenciales hardcodeadas.

**Prompt para el agente:**
```
Elimina las credenciales demo del codigo fuente del frontend:

DIAGNOSTICO:
1. Buscar en todo el frontend (grep) cadenas como:
   - "admin", "password", "demo", "test123", "cajero", "supervisor"
   - Credenciales en paginas de login, componentes de ayuda, tooltips, etc.
2. Verificar si hay algun archivo de configuracion con usuarios/passwords de ejemplo.

CORRECCION:
1. Eliminar cualquier credencial hardcodeada del codigo fuente.
2. Si hay un boton "Demo" o "Auto-fill" en el login:
   - En produccion (NODE_ENV === 'production'): NO mostrar el boton.
   - En desarrollo: mantenerlo si es util, pero que lea las credenciales de .env:
     VITE_DEMO_USER=admin (sin default)
     VITE_DEMO_PASSWORD= (sin default)

3. Si hay un componente de "Instrucciones de login" con credenciales:
   - Condicionarlo a import.meta.env.DEV:
     {import.meta.env.DEV && <DemoCredentials />}

4. Verificar build de produccion:
   - npm run build → grep en dist/ por las credenciales → 0 resultados.

TEST:
- npm run build → inspeccionar los archivos JS del bundle → no hay contraseñas.
- En dev → las credenciales demo siguen disponibles (si se desea mantener funcionalidad).
- En production → no hay referencias a credenciales demo.
```

**Criterio de completitud**: El bundle de produccion no contiene credenciales de ningun tipo.

---

## Verificacion Final

Despues de implementar todas las tareas, ejecutar el siguiente flujo de validacion:

**Prompt de validacion final:**
```
Ejecuta la bateria de pruebas de produccion:

1. SEGURIDAD:
   - Arrancar backend sin JWT_SECRET → falla con error claro (S-01).
   - Usar refresh token como access → rechazado 401 (S-02).
   - Refresh token ya usado → rechazado 401 (S-03).
   - Path traversal en PDF → rechazado 403 (S-04).
   - Verificar que main.go es el unico composition root (S-05).
   - Curl al frontend → headers CSP y HSTS presentes (S-06).
   - Body de 100MB al backend → rechazado 413 (S-07).

2. INTEGRIDAD DE DATOS:
   - Worker de facturacion retries → maximo 1 comprobante por venta (B-01).
   - Anular venta con backend caido → UI no cambia (B-02).
   - Token expira → se refresca automaticamente sin perder carrito (B-03).
   - Modal de eliminacion masiva → un solo disparo (B-04).
   - Ventas offline → se sincronizan automaticamente al reconectar (B-05).

3. RESILIENCIA:
   - SIGTERM → workers terminan gracefully (R-01).
   - Backend arranca antes que Postgres → retry exitoso (R-02).
   - docker stats → limites de memoria visibles (R-03).
   - ./scripts/backup.sh → backup no vacio (R-04).

4. RENDIMIENTO:
   - npm run build → multiples chunks de paginas admin (P-01).
   - Busqueda de productos → sin lag con 500+ productos (P-02).
   - React Profiler → Clock no re-renderiza Header (P-03).
   - Post-venta → no hay GET /v1/productos en Network (P-04).

5. CI/CD:
   - Push a master → GitHub Actions ejecuta tests + lint + build (T-01).
   - go test ./... → 100% de tests pasan (T-02).
   - npm test → tests frontend pasan (T-03).

Ejecutar: cd backend && go test ./... && cd ../frontend && npm test
```

---

## Registro de Tareas

| ID   | Descripcion Corta                         | Fase | Estado    |
|------|-------------------------------------------|------|-----------|
| S-01 | Validar JWT_SECRET al startup             | F1   | ⬜ Pendiente |
| S-02 | Diferenciar access/refresh tokens         | F1   | ⬜ Pendiente |
| S-03 | Revocar refresh token en rotacion         | F1   | ⬜ Pendiente |
| S-04 | Validar path traversal en PDFs            | F1   | ⬜ Pendiente |
| S-05 | Eliminar infra duplicada main/router      | F1   | ⬜ Pendiente |
| S-06 | Agregar CSP + HSTS a nginx               | F1   | ⬜ Pendiente |
| S-07 | Limitar body size de requests             | F1   | ⬜ Pendiente |
| B-01 | Evitar comprobante fiscal duplicado       | F2   | ⬜ Pendiente |
| B-02 | handleAnular no marcar si backend falla   | F2   | ⬜ Pendiente |
| B-03 | Auto-refresh de tokens JWT                | F2   | ⬜ Pendiente |
| B-04 | Eliminar modal bulkDelete duplicado       | F2   | ⬜ Pendiente |
| B-05 | Retry automatico de sync offline          | F2   | ⬜ Pendiente |
| H-01 | Race condition apertura de caja           | F3   | ⬜ Pendiente |
| H-02 | Rate limiter resiliente (fail closed)     | F3   | ⬜ Pendiente |
| H-03 | Logger estructurado para produccion       | F3   | ⬜ Pendiente |
| H-04 | Restringir CORS del sidecar AFIP          | F3   | ⬜ Pendiente |
| H-05 | Unificar HTTP clients frontend            | F3   | ⬜ Pendiente |
| H-06 | Stock fuera de TX en AnularVenta          | F3   | ⬜ Pendiente |
| R-01 | Shutdown graceful de workers              | F4   | ⬜ Pendiente |
| R-02 | Retry de conexion DB al startup           | F4   | ⬜ Pendiente |
| R-03 | Resource limits en docker-compose.prod    | F4   | ⬜ Pendiente |
| R-04 | Scripts de backup/restore PostgreSQL      | F4   | ⬜ Pendiente |
| R-05 | Healthcheck afip-sidecar como dependencia | F4   | ⬜ Pendiente |
| P-01 | Lazy loading de rutas admin               | F5   | ⬜ Pendiente |
| P-02 | Optimizar busqueda catalogo offline       | F5   | ⬜ Pendiente |
| P-03 | Aislar re-render del reloj PosHeader      | F5   | ⬜ Pendiente |
| P-04 | Eliminar forceRefreshCatalog post-venta   | F5   | ⬜ Pendiente |
| P-05 | Virtualizacion/paginacion de productos    | F5   | ⬜ Pendiente |
| P-06 | Error boundaries por ruta                 | F5   | ⬜ Pendiente |
| T-01 | Pipeline CI/CD con GitHub Actions         | F6   | ⬜ Pendiente |
| T-02 | Tests de handlers HTTP backend            | F6   | ⬜ Pendiente |
| T-03 | Tests basicos de frontend                 | F6   | ⬜ Pendiente |
| Q-01 | Iconos PWA correctos                      | F7   | ⬜ Pendiente |
| Q-02 | Auto-refresh del Dashboard                | F7   | ⬜ Pendiente |
| Q-03 | Tabla de auditoria de cambios             | F7   | ⬜ Pendiente |
| Q-04 | Eliminar credenciales demo del source     | F7   | ⬜ Pendiente |

**Leyenda**: ⬜ Pendiente | 🔄 En progreso | ✅ Completado | ❌ Bloqueado

---

## Dependencias entre Tareas

```
S-02 (tipos de token) ──antes que──▶ S-03 (revocar refresh en rotacion)
S-03 (revocar refresh) ──antes que──▶ B-03 (auto-refresh frontend)
S-05 (eliminar infra dup) ──antes que──▶ R-01 (shutdown graceful workers)
H-05 (unificar HTTP clients) ──antes que──▶ B-03 (auto-refresh frontend)
H-05 (unificar HTTP clients) ──resuelve──▶ H-04 (categorias Bearer null)
B-01 (idempotencia comprobante) ──antes que──▶ R-01 (graceful shutdown)
P-01 (lazy loading) ──combina con──▶ P-06 (error boundaries)
T-01 (CI/CD pipeline) ──requiere──▶ T-02 (handler tests) + T-03 (frontend tests)
R-02 (retry DB) ──antes que──▶ R-05 (healthcheck sidecar)
```

---

## Estimacion de Esfuerzo

| Fase | Tareas | Esfuerzo Estimado | Impacto |
|------|--------|-------------------|---------|
| F1 — Seguridad Critica | 7 | 2-3 dias | Bloquea produccion |
| F2 — Bugs Criticos | 5 | 2-3 dias | Corrupcion de datos |
| F3 — Hardening | 6 | 1-2 dias | Seguridad perimetral |
| F4 — Resiliencia | 5 | 1-2 dias | Estabilidad operativa |
| F5 — Rendimiento | 6 | 2-3 dias | UX en produccion |
| F6 — Testing/CI | 3 | 2-3 dias | Calidad a largo plazo |
| F7 — Pulido | 4 | 1-2 dias | Profesionalismo |
| **Total** | **36** | **~12-18 dias** | **Produccion segura** |
