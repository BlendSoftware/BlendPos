# Guia de Ejecucion de Correcciones — BlendPOS

> **Origen**: Documento "Correcciónes del Proyecto.pdf" (26 ítems reportados)
> **Fecha**: 2026-02-24
> **Metodología**: Spec-Driven Development (SDD) + TDD
> **Propósito**: Guía paso a paso para que el agente AI implemente cada corrección de forma automática y verificable.

---

## Lectura Obligatoria Antes de Empezar

Antes de ejecutar cualquier corrección, el agente **DEBE** leer los siguientes documentos en este orden:

```
1. CLAUDE.md          → Stack, estructura de directorios, invariantes, comandos
2. arquitectura.md    → Capas (Handler→Service→Repository), patrones, flujos de datos
3. especificacion.md  → Feature contracts, criterios de aceptación
4. ejecucion.md       → Flujo de trabajo SDD y prompts base
```

---

## Reglas de Ejecución

1. **Leer siempre** `especificacion.md` y `arquitectura.md` antes de cada tarea.
2. **TDD**: escribir el test primero (cuando aplique), verificar que falla, luego implementar.
3. **Nunca** lógica de negocio en handlers — siempre en la capa Service.
4. **Siempre** usar `db.Transaction()` cuando la operación involucre múltiples tablas.
5. **Una corrección a la vez**: marcar como completada antes de avanzar a la próxima.
6. **Verificar** con `go test ./...` y prueba manual en el frontend antes de marcar cada ítem como hecho.
7. Si una corrección depende de otra (ver sección de dependencias), ejecutarlas en el orden indicado.

---

## Orden de Ejecución Recomendado

Las correcciones están ordenadas por impacto y dependencias:

```
PRIORIDAD 1 — Bugs Críticos (bloquean operación):
  C-11, C-12, C-13, C-21, C-22, C-15, C-24, C-25, C-26

PRIORIDAD 2 — Bugs Funcionales (degradan UX):
  C-08, C-19, C-20

PRIORIDAD 3 — Features nuevas (agregan valor):
  C-14, C-18, C-07, C-09, C-16, C-17, C-23

PRIORIDAD 4 — UI/UX (mejoran experiencia):
  C-01, C-02, C-03, C-04, C-05, C-06, C-10
```

---

## PARTE 1 — BUGS CRÍTICOS (Prioridad 1)

---

### C-11: Stock no baja al realizar una venta

**Problema reportado**: *"En el apartado Productos, cuando realizamos la venta de un Producto este no baja el stock de manera real como debería ser."*

**Área afectada**: Backend → `venta_service.go`, `inventario_service.go`; Frontend → modal de venta.

**Prompt para el agente:**
```
Lee especificacion.md Feature 01 (AC-01.1) y arquitectura.md sección 7.1 (flujo de venta).
Investiga y corrige el bug de descuento de stock:

DIAGNÓSTICO:
1. Revisar internal/service/venta_service.go en la función RegistrarVenta().
   ¿Se está ejecutando la actualización de stock dentro de db.Transaction()?
   ¿Se llama a inventario_service.DescontarStock() correctamente?
2. Revisar internal/repository/producto_repo.go → función que decrementa StockActual.
   ¿Se usa UPDATE con WHERE id = ? AND stock_actual >= cantidad para evitar negativos?
3. Revisar si el frontend envía correctamente el campo "cantidad" en el payload POST /v1/ventas.
4. Buscar logs de error en el handler o servicio que puedan estar silenciando el error.

CORRECCIÓN:
- Asegurar que RegistrarVenta() realiza el descuento de stock de CADA item dentro de db.Transaction().
- Si el item tiene desarme automático (producto hijo con stock = 0 y padre disponible),
  llamar a inventario_service.DesarmeAutomatico() dentro de la MISMA transacción.
- Agregar log de error explícito si stock_actual < cantidad_solicitada.
- El endpoint POST /v1/ventas debe retornar HTTP 400 con detalle si el stock es insuficiente.

TEST:
- Crear producto con stock = 10.
- Realizar venta de cantidad = 3.
- Verificar en DB: stock_actual = 7.
- Realizar venta de cantidad = 8 → debe retornar 400 "Stock insuficiente".
```

**Criterio de completitud**: `GET /v1/productos/{id}` muestra `stock_actual` decrementado tras cada venta. Tests pasan.

---

### C-12: Movimientos de inventario no cargan

**Problema reportado**: *"En el apartado inventario no se muestran ni cargan los movimientos realizados."*

**Área afectada**: Backend → endpoint de movimientos, Frontend → página de Inventario.

**Prompt para el agente:**
```
Lee especificacion.md Feature 03 y arquitectura.md sección 5.
Investiga y corrige el bug de carga de movimientos de inventario:

DIAGNÓSTICO BACKEND:
1. Verificar que existe endpoint GET /v1/inventario/movimientos (o similar).
2. Revisar el handler y servicio correspondiente — ¿devuelve lista vacía o error 500?
3. Revisar el modelo MovimientoInventario (o equivalente) en internal/model/.
4. Verificar en la migración SQL que la tabla de movimientos de inventario existe y tiene datos.
5. Verificar que cuando se descuenta stock en C-11, se crea un registro en la tabla de movimientos.

DIAGNÓSTICO FRONTEND:
1. Abrir DevTools → Network. ¿Qué endpoint llama la página de Inventario para los movimientos?
2. ¿Retorna 200 con array vacío, o retorna error? Verificar la respuesta completa.
3. Verificar si el componente React maneja el estado de carga (loading/empty/error) correctamente.

CORRECCIÓN:
- Si falta el endpoint: crear GET /v1/inventario/movimientos con paginación
  (query params: page, limit, producto_id, tipo, desde, hasta).
- Si el modelo no registra movimientos al vender: asegurar que RegistrarVenta() y
  DesarmeAutomatico() crean un MovimientoInventario por cada alteración de stock.
- Si el frontend llama al endpoint incorrecto: corregir la URL en el servicio API.
- Si el componente React no renderiza: revisar el estado y el renderizado condicional.

TEST:
- Realizar una venta. Ir a Inventario. Los movimientos deben aparecer con tipo, cantidad y fecha.
```

**Criterio de completitud**: La página de Inventario muestra los movimientos de stock con detalle.

---

### C-13: No se puede Reimprimir/Descargar/Anular una venta en Facturación

**Problema reportado**: *"En el apartado Facturación no se puede Reimprimir-Descargar-Anular una venta realizada."*

**Área afectada**: Backend → endpoints de facturación, Frontend → página de Facturación.

**Prompt para el agente:**
```
Lee especificacion.md Feature 06 (AC-06.4, AC-01.5) y arquitectura.md sección 5.
Investiga y corrige los tres sub-problemas de la sección Facturación:

REIMPRIMIR:
1. Verificar endpoint GET /v1/facturacion/pdf/{id} → ¿retorna PDF o error?
2. Si el archivo PDF no existe en filesystem: regenerar el PDF con gofpdf usando los datos del comprobante.
3. Frontend: el botón "Reimprimir" debe enviar el PDF a la impresora ESC/POS o abrir ventana de impresión.

DESCARGAR:
1. Verificar endpoint GET /v1/facturacion/pdf/{id} — debe retornar Content-Type: application/pdf.
2. Frontend: el botón "Descargar" debe hacer un fetch del endpoint y disparar descarga del navegador.
3. Asegurar que el header Content-Disposition: attachment; filename="comprobante-{id}.pdf" está presente.

ANULAR:
1. Verificar endpoint DELETE /v1/ventas/{id} — requiere rol "supervisor" vía JWT middleware.
2. Verificar flujo de anulación en venta_service.go:
   a. Restaurar stock de TODOS los items de la venta (dentro de db.Transaction()).
   b. Crear MovimientoCaja inverso (inmutable — no modificar el original).
   c. Cambiar estado de la venta a "anulada".
3. Frontend: el botón "Anular" debe mostrar modal de confirmación con motivo, enviar Delete y refrescar la lista.

TEST:
- Crear una venta → ir a Facturación → verificar que los tres botones funcionan correctamente.
- Anular la venta → verificar stock restaurado, movimiento inverso creado, estado = "anulada".
```

**Criterio de completitud**: Reimprimir envía a impresora, Descargar descarga PDF, Anular restaura stock y estado.

---

### C-21: Ventas con Débito/Crédito/Transferencia no impactan en Cierre de Caja

**Problema reportado**: *"En el apartado de Cierre de Caja, no se impactan las ventas realizadas con los métodos de 'Débito', 'Crédito', y 'Transferencia'."*

**Área afectada**: Backend → `caja_service.go`, `venta_service.go`.

**Prompt para el agente:**
```
Lee especificacion.md Feature 04 (AC-04.4, AC-04.6) y Feature 01 (AC-01.3).
Investiga y corrige el bug de métodos de pago no electrónicos en cierre de caja:

DIAGNÓSTICO:
1. En venta_service.go → RegistrarVenta(): verificar que para CADA pago (efectivo, débito,
   crédito, transferencia), se crea un MovimientoCaja con el método correcto.
2. En caja_service.go → calcularMontoEsperado(): verificar que agrupa movimientos por
   método de pago usando todos los valores del enum: "efectivo", "debito", "credito", "transferencia".
3. Revisar si el modelo VentaPago / MovimientoCaja tiene campo "metodo" correctamente tipado.
4. Verificar en DB si los MovimientoCaja para débito/crédito/transferencia existen.

CORRECCIÓN:
- Si no se crean MovimientoCaja para métodos no-efectivo: corregir RegistrarVenta()
  para crear UN MovimientoCaja por CADA pago registrado en VentaPago.
- Si caja_service no los suma: corregir la query que calcula el monto esperado para
  incluir todos los métodos → GROUP BY metodo para mostrar el desglose completo.
- El reporte de caja (GET /v1/caja/{id}/reporte) debe mostrar subtotales por método.

TEST:
- Hacer una venta pagada con tarjeta de débito $1000.
- Hacer una venta pagada con transferencia $500.
- Ir a Cierre de Caja → los montos de débito=$1000 y transferencia=$500 deben aparecer.
```

**Criterio de completitud**: El arqueo de caja desglosa correctamente los cuatro métodos de pago.

---

### C-22: Arqueo de caja no se crea

**Problema reportado**: *"En el apartado de Cierre de Caja, no se crea el arqueo de caja que realizamos."*

**Área afectada**: Backend → `caja_service.go`, `handler/caja.go`; Frontend → página Cierre de Caja.

**Prompt para el agente:**
```
Lee especificacion.md Feature 04 (AC-04.4, AC-04.5) y arquitectura.md sección 7.2.
Investiga y corrige el bug que impide que el arqueo de caja se guarde:

DIAGNÓSTICO BACKEND:
1. Verificar endpoint POST /v1/caja/arqueo — ¿retorna 200 o error?
2. Revisar caja_service.go → RealizarArqueo(): ¿inserta un registro en la tabla de arqueos?
3. Revisar si existe la tabla/modelo ArqueoCaja o si se guarda en la sesion_caja directamente.
4. Verificar que la función recibe correctamente la declaración {efectivo, debito, credito, transferencia}.
5. Revisar logs del servidor al momento del arqueo.

DIAGNÓSTICO FRONTEND:
1. DevTools → Network: ¿qué endpoint llama el botón de confirmar arqueo?
2. ¿El payload enviado tiene el formato correcto según especificacion.md Feature 04?
3. ¿Hay manejo de error en el componente si el endpoint falla?

CORRECCIÓN:
- Si el handler no llama al servicio: revisar la ruta en router.go y el handler en caja.go.
- Si el servicio no persiste: asegurar que caja_service.RealizarArqueo() usa db.Transaction()
  para: (1) calcular desvio, (2) guardar declaración del cajero, (3) cambiar estado si es cierre.
- Si el frontend no envía bien los datos: corregir el payload para matchear el contrato API.
- El response debe incluir el detalle de monto_esperado, monto_declarado y desvío (ver spec).

TEST:
- Abrir caja → hacer ventas → ir a Cierre de Caja → completar arqueo → confirmar.
- Verificar en DB que existe registro del arqueo con los montos declarados.
- Recargar la página → el arqueo debe persistir y mostrarse.
```

**Criterio de completitud**: POST /v1/caja/arqueo guarda la declaración y retorna el desvío calculado.

---

### C-15: ERR_CONNECTION_REFUSED al guardar CSV de Proveedores

**Problema reportado**: *"En el apartado Proveedores, tira Error 'Failed to load resource: net::ERR_CONNECTION_REFUSED' al querer guardar un CSV."*

**Área afectada**: Backend → `handler/proveedores.go`, router; Frontend → página Proveedores.

**Prompt para el agente:**
```
Lee especificacion.md Feature 07 (AC-07.4, AC-07.5).
Investiga y corrige el error de conexión al importar CSV de proveedores:

DIAGNÓSTICO:
1. DevTools → Network: ¿a qué URL exacta hace POST el frontend para el CSV?
2. Verificar en internal/router/router.go que la ruta POST /v1/csv/import (o equivalente) existe.
3. Verificar que el handler está registrado y el endpoint acepta multipart/form-data.
4. ¿El servidor Go está corriendo en el puerto correcto? ¿El frontend apunta al host/puerto correcto?
5. Verificar variables de entorno VITE_API_URL o equivalente en el frontend.
6. Verificar si hay un middleware CORS que esté bloqueando la solicitud.

CORRECCIÓN:
- Si la ruta no existe: agregar en router.go → proveedores.go el handler para POST /v1/csv/import.
- Si el puerto/host es incorrecto: corregir la configuración del API URL en el frontend.
- Si falta CORS para multipart: revisar el middleware cors.go para permitir Content-Type multipart/form-data.
- Verificar que el endpoint acepta el campo "file" como multipart y el campo "proveedor_id" como form value.

TEST:
- Preparar un CSV válido: codigo_barras,nombre,precio_desactualizado,precio_actualizado
- Subir el CSV en la sección Proveedores.
- Debe retornar 200 con resumen: {total_filas, procesadas, errores, creadas, actualizadas}.
```

**Criterio de completitud**: La importación de CSV de proveedores retorna un resumen sin error de conexión.

---

### C-24: Usuario inactivo desaparece (se borra de vista)

**Problema reportado**: *"En el apartado de Usuarios, cuando dejo a un usuario como inactivo, luego no se muestra más. Como que se borrara de la base de datos."*

**Área afectada**: Backend → `handler/usuarios.go`, `repository/usuario_repo.go`; Frontend → página Usuarios.

**Prompt para el agente:**
```
Lee especificacion.md Feature 05 y arquitectura.md sección 9 (modelo Usuario).
Investiga y corrige el soft-delete de usuarios:

DIAGNÓSTICO BACKEND:
1. Verificar modelo Usuario en internal/model/usuario.go → ¿tiene campo Activo bool?
2. En usuario_repo.go → GetAll(): ¿incluye cláusula WHERE activo = true que filtra los inactivos?
3. En usuario_repo.go → Desactivar(): ¿hace UPDATE SET activo = false o DELETE físico?

DIAGNÓSTICO FRONTEND:
1. La página de Usuarios, ¿tiene un toggle o filtro para mostrar "inactivos"?
2. ¿Hace la query con algún parámetro de filtro al backend?

CORRECCIÓN BACKEND:
- Asegurar que Desactivar() solo hace UPDATE usuarios SET activo = false WHERE id = ?.
- Modificar GetAll() para aceptar query param "incluir_inactivos=true" (default: false).
- Agregar endpoint GET /v1/usuarios?incluir_inactivos=true para mostrar todos.
- Nunca DELETE físico en esta operación.

CORRECCIÓN FRONTEND:
- Agregar toggle "Mostrar inactivos" en la página de Usuarios.
- Cuando el toggle está activo, llamar a la API con ?incluir_inactivos=true.
- Usuarios inactivos deben mostrarse con visual diferenciada (ej: gris o badge "Inactivo").
- Agregar botón "Reactivar" para usuarios inactivos.

TEST:
- Crear usuario → desactivar → verificar que sigue en DB con activo=false.
- En la UI: activar toggle "Mostrar inactivos" → el usuario debe aparecer.
- Reactivar → el usuario vuelve a aparecer en la lista normal.
```

**Criterio de completitud**: Los usuarios inactivos persisten en DB y son recuperables desde la UI.

---

### C-25: Contraseña no se guarda al crear usuario

**Problema reportado**: *"En el apartado de Usuarios, cuando creo un usuario y me pide ingresar una contraseña quiero que se impacte el cambio de la contraseña, y que esta muestre bien el manejo de errores."*

**Área afectada**: Backend → `auth_service.go`, `handler/usuarios.go`; Frontend → formulario de creación de usuario.

**Prompt para el agente:**
```
Lee especificacion.md Feature 05 y arquitectura.md sección 12 (seguridad).
Investiga y corrige la creación de contraseñas de usuario:

DIAGNÓSTICO BACKEND:
1. En handler/usuarios.go → crear usuario: ¿se recibe el campo "password" del body?
2. En auth_service.go o usuario handler: ¿se hashea con bcrypt.GenerateFromPassword([]byte(pwd), 12)?
3. ¿Se guarda el hash en la columna "password_hash" del modelo Usuario?
4. Al intentar login con ese usuario: ¿falla la comparación bcrypt?

DIAGNÓSTICO FRONTEND:
1. El formulario de creación de usuario: ¿incluye input de "contraseña" y "confirmar contraseña"?
2. ¿Se envía el campo "password" en el payload POST?
3. ¿Hay validación en el frontend antes de enviar?

CORRECCIÓN BACKEND:
- Asegurar que POST /v1/usuarios acepta campo "password" en el DTO con validate:"required,min=8".
- El handler debe: (1) recibir el DTO, (2) llamar a auth_service.HashPassword(dto.Password),
  (3) guardar el hash en usuario.PasswordHash.
- Retornar HTTP 400 si la contraseña tiene menos de 8 caracteres, con mensaje descriptivo.
- Retornar HTTP 400 si el formato no cumple los requisitos (opcional: 1 mayúscula, 1 número).

CORRECCIÓN FRONTEND:
- Validar antes de enviar: mínimo 8 caracteres → mostrar mensaje "La contraseña debe tener al menos 8 caracteres".
- Campo "confirmar contraseña" → validar que coinciden → mostrar "Las contraseñas no coinciden".
- Mostrar errores del backend bajo el campo correspondiente.

TEST:
- Crear usuario con contraseña "abc" → debe rechazar con mensaje de validación.
- Crear usuario con contraseña "SecurePass123" → debe crearse.
- Intentar login con las credenciales → debe funcionar.
```

**Criterio de completitud**: La contraseña se guarda correctamente con hash bcrypt y el login funciona.

---

### C-26: Edición de usuario no guarda email ni contraseña

**Problema reportado**: *"En el apartado de Usuarios, cuando quiero editar un usuario, no se realiza el cambio de mail, ni de contraseña cuando quiero realizarlos."*

**Área afectada**: Backend → `handler/usuarios.go`, `repository/usuario_repo.go`.

**Prompt para el agente:**
```
Investiga y corrige el bug de edición de usuario (email y contraseña):

DIAGNÓSTICO BACKEND:
1. Endpoint PUT /v1/usuarios/{id}: ¿recibe los campos "email" y "password" en el body?
2. En usuario_repo.go → Actualizar(): ¿incluye el campo Email en el UPDATE?
3. Si se envía "password" nuevo: ¿se rehashea con bcrypt antes de guardar?
4. ¿Se están usando campos "omitempty" en el GORM update que puedan ignorar el valor?

CORRECCIÓN:
- El DTO de edición debe tener campos opcionales: Email *string, Password *string, Nombre *string, Rol *string.
- El handler debe construir el mapa de campos a actualizar solo con los no-nil.
- Si Password no es nil: hashear con bcrypt y actualizar PasswordHash.
- Si Email no es nil: validar formato email y actualizar.
- Usar db.Model(&usuario).Updates(map[string]interface{}{...}) para actualizar solo los campos enviados.
- Retornar HTTP 400 si el email ya existe en otro usuario.

FRONTEND:
- El formulario de edición debe pre-rellenar los campos actuales.
- El campo "contraseña" debe estar vacío (no mostrar el hash) y ser opcional en edición.
- Mostrar mensaje de éxito o error según la respuesta del backend.

TEST:
- Editar email de un usuario → recargar → el email nuevo debe aparecer.
- Editar contraseña → intentar login con la nueva contraseña → debe funcionar.
- Editar email a uno ya existente → debe retornar error "Email ya en uso".
```

**Criterio de completitud**: PUT /v1/usuarios/{id} actualiza email y contraseña correctamente.

---

## PARTE 2 — BUGS FUNCIONALES (Prioridad 2)

---

### C-08: Filtro de productos inactivos no los muestra

**Problema reportado**: *"En el apartado de Productos, cuando quiero ver si tengo productos inactivos a través del filtro de productos inactivos quiero que se muestren los inactivos."*

**Área afectada**: Backend → query de productos; Frontend → página Productos.

**Prompt para el agente:**
```
Lee especificacion.md Feature 02 (AC-02.4).
Investiga y corrige el filtro de productos inactivos:

DIAGNÓSTICO:
1. Backend: GET /v1/productos con query param "activo=false" → ¿filtra correctamente?
2. ¿La query por defecto excluye activo=false? (ej: WHERE activo = true hardcodeado)
3. Frontend: ¿el selector/filtro "inactivos" envía el parámetro correcto a la API?

CORRECCIÓN BACKEND:
- Modificar el handler/service de productos para aceptar query param "activo" (true/false/all).
- Por defecto (sin parámetro): retornar solo activos.
- Con activo=false: retornar solo inactivos.
- Con activo=all: retornar todos.

CORRECCIÓN FRONTEND:
- El filtro de "Inactivos" debe llamar a GET /v1/productos?activo=false.
- Los productos inactivos deben mostrarse con badge o estilo visual diferente.
- Agregar botón "Reactivar" en cada fila de producto inactivo.

TEST:
- Desactivar un producto → seleccionar filtro "Inactivos" → el producto debe aparecer.
- Reactivar el producto → desaparece del filtro de inactivos → aparece en activos.
```

**Criterio de completitud**: El filtro de inactivos muestra productos con activo=false. Reactivación funciona.

---

### C-19: Filtros de fecha adicionales en Facturación

**Problema reportado**: *"En el apartado Facturación, en la parte de los filtros, además de los actuales quiero poder filtrar por Último Mes, ó también por un período de fechas (ejemplo, desde el 05/06/2025 hasta 23/08/2025)."*

**Área afectada**: Backend → endpoint de facturación; Frontend → página Facturación.

**Prompt para el agente:**
```
Lee especificacion.md Feature 06.
Agrega filtros de fecha adicionales en la sección Facturación:

BACKEND:
1. El endpoint GET /v1/facturacion o GET /v1/ventas debe aceptar los params:
   - periodo=hoy | ayer | ultima_semana | ultimo_mes | personalizado
   - desde=YYYY-MM-DD (requerido cuando periodo=personalizado)
   - hasta=YYYY-MM-DD (requerido cuando periodo=personalizado)
2. Agregar validación: si periodo=personalizado y falta desde/hasta → HTTP 400.
3. La query SQL debe usar WHERE created_at BETWEEN desde AND hasta + 1 día (inclusive).

FRONTEND:
1. Agregar en la barra de filtros los nuevos botones: "Último Mes" y "Personalizado".
2. Cuando se selecciona "Personalizado", mostrar dos date pickers (Desde / Hasta).
3. El picker de "Hasta" no puede ser menor que "Desde".
4. Al confirmar el rango: llamar a la API con los parámetros correctos y actualizar la tabla.
5. El filtro activo debe mostrarse con estilo destacado (botón activo/selected).

TEST:
- Filtrar por "Último Mes" → deben aparecer solo ventas del mes actual.
- Ingresar rango 01/01/2026 − 31/01/2026 → deben aparecer solo ventas de enero.
- Si desde > hasta → mostrar error en el picker.
```

**Criterio de completitud**: Los filtros de Último Mes y rango personalizado devuelven resultados correctos.

---

### C-20: Ordenamiento y filtro por método de pago en Facturación

**Problema reportado**: *"En el apartado Facturación, en las columnas de Ticket, Fecha, Cajero, Método, y Total, quiero que se pueda ordenar por orden ascendente o descendente. Y también quiero que se pueda filtrar según el método de pago."*

**Área afectada**: Backend → query de facturación; Frontend → tabla de Facturación.

**Prompt para el agente:**
```
Lee especificacion.md Feature 06.
Implementa ordenamiento de columnas y filtro por método de pago en Facturación:

BACKEND:
1. El endpoint GET /v1/ventas (o /v1/facturacion) debe aceptar:
   - sort_by=numero_ticket | created_at | cajero | metodo_pago | total (default: created_at)
   - sort_dir=asc | desc (default: desc)
   - metodo_pago=efectivo | debito | credito | transferencia | qr (filtro)
2. El sort se aplica con ORDER BY {campo} {dirección} en la query SQL.
3. El filtro por método: JOIN con ventas_pagos WHERE metodo = ?.

FRONTEND:
1. Hacer que los headers de columna (Ticket, Fecha, Cajero, Método, Total) sean clickeables.
2. Primer click → orden ascendente, segundo click → descendente, tercer click → sin orden.
3. Mostrar flecha ↑↓ junto al header de la columna activa.
4. Agregar un dropdown o chips de filtro para "Método de Pago" con options:
   Todos | Efectivo | Débito | Crédito | Transferencia | QR
5. Al cambiar el filtro, refrescar la tabla manteniendo la paginación.
6. El estado de ordenamiento y filtros debe ser parte de la URL (query params) para que sea compartible.

TEST:
- Click en "Total" → ordena de mayor a menor. Click de nuevo → menor a mayor.
- Seleccionar filtro "Efectivo" → solo aparecen ventas pagadas en efectivo.
- Ordenar por Fecha descendente + filtrar por Débito → ventas de débito del más nuevo al más viejo.
```

**Criterio de completitud**: Columnas ordenables, filtro por método de pago funcional, URL con estado.

---

## PARTE 3 — FEATURES NUEVAS (Prioridad 3)

---

### C-14: Pestaña "Categorías" en el Panel Admin

**Problema reportado**: *"En el panel de admin quiero tener una pestaña llamada 'Categorías', para poder generar categorías a los distintos productos."*

**Área afectada**: Backend → nuevo módulo de categorías; Frontend → nueva página Categorías.

**Prompt para el agente:**
```
Lee especificacion.md Feature 02 y arquitectura.md sección 6 (estructura de código).
Implementa el módulo de Categorías como feature nueva:

BACKEND:
1. Crear migración SQL: migrations/XXXXXX_create_categorias.up.sql
   CREATE TABLE categorias (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     nombre VARCHAR(100) NOT NULL UNIQUE,
     descripcion TEXT,
     activo BOOLEAN NOT NULL DEFAULT true,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
2. Crear model: internal/model/categoria.go con struct Categoria.
3. Crear repository: internal/repository/categoria_repo.go con interfaz y GORM impl.
4. Crear service: internal/service/categoria_service.go con lógica CRUD.
5. Crear handler: internal/handler/categorias.go con endpoints:
   - GET    /v1/categorias           → listar todas activas (con query param activo=all para ver inactivas)
   - POST   /v1/categorias           → crear (require rol: administrador)
   - PUT    /v1/categorias/{id}      → editar nombre/descripcion (require rol: administrador)
   - DELETE /v1/categorias/{id}      → soft-delete activo=false (require rol: administrador)
6. Crear DTO: internal/dto/categoria_dto.go con validaciones.
7. Registrar las rutas en internal/router/router.go.
8. Actualizar el modelo Producto para que categoria sea una FK a categorias.id (migración adicional).
   - Mantener compatibilidad: si el producto tenía categoria como string, migrar los datos.

FRONTEND:
1. Crear página src/pages/Categorias.tsx con tabla de categorías (nombre, descripción, estado).
2. Formulario de creación/edición en un modal: nombre (required), descripción (optional).
3. Botones de acción por fila: Editar, Desactivar/Activar.
4. En el formulario de creación/edición de productos, cambiar el campo "categoría" de
   text input a dropdown que cargue desde GET /v1/categorias.
5. Agregar la ruta "Categorías" en el menú lateral del admin (después de Productos).

TEST:
- Crear categoría "Bebidas" → aparece en la lista y en el dropdown de productos.
- Editar categoría → cambio reflejado en todos los productos con esa categoría.
- Desactivar categoría → no aparece en el dropdown de nuevos productos.
```

**Criterio de completitud**: CRUD de categorías funcional, integrado en el formulario de productos.

---

### C-18: Múltiples contactos por proveedor

**Problema reportado**: *"En el apartado Proveedores, cuando quiero crear o editar un proveedor quiero poder ingresar 1 o más contactos por cada Razón Social."*

**Área afectada**: Backend → modelo Proveedor; Frontend → formulario de Proveedores.

**Prompt para el agente:**
```
Lee especificacion.md Feature 07.
Implementa múltiples contactos por proveedor:

BACKEND:
1. Crear migración SQL: migrations/XXXXXX_create_contactos_proveedor.up.sql
   CREATE TABLE contactos_proveedor (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     proveedor_id UUID NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
     nombre VARCHAR(200) NOT NULL,
     telefono VARCHAR(50),
     email VARCHAR(200),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
2. Crear model: internal/model/contacto_proveedor.go
3. Agregar relación en model/proveedor.go:
   Contactos []ContactoProveedor `gorm:"foreignKey:ProveedorID"`
4. En proveedor_service.go y proveedor_repo.go actualizar:
   - CreateProveedor(): crear el proveedor y sus contactos en db.Transaction().
   - UpdateProveedor(): upsert de contactos (crear nuevos, actualizar existentes, eliminar los removidos).
   - GetProveedor(): usar Preload("Contactos").
5. DTOs: ProveedorCreateDTO y ProveedorUpdateDTO deben incluir:
   Contactos []ContactoDTO `json:"contactos" validate:"dive"`
   donde ContactoDTO = {Nombre string, Telefono *string, Email *string}
6. Endpoints ya existentes deben funcionar con la nueva estructura.

FRONTEND:
1. En el formulario de creación/edición de proveedor: agregar sección "Contactos".
2. Mostrar lista de contactos actual con campos: Nombre, Teléfono, Mail.
3. Botón "+ Agregar Contacto" → añade una nueva fila de formulario.
4. Botón "✕" en cada fila → elimina ese contacto del formulario.
5. Al guardar: enviar todos los contactos en el array "contactos" del payload.
6. En la tabla de proveedores: mostrar el primer contacto (nombre + teléfono) como preview.

TEST:
- Crear proveedor "Arcor" con 2 contactos → guardar → reabrir el proveedor → los 2 contactos deben aparecer.
- Editar un proveedor: agregar un contacto nuevo, eliminar uno existente → cambios deben persistir.
```

**Criterio de completitud**: CRUD de proveedores con múltiples contactos anidados funciona correctamente.

---

### C-07: Productos inactivos no aparecen en búsqueda de venta

**Problema reportado**: *"En el apartado de Productos, cuando pongo un producto en estado de inactivo quiero que este no se elimine de la base de datos y que se quede en estado de inactivo. Cuando está inactivo este producto no va a aparecer cuando queremos realizar una venta."*

**Área afectada**: Backend → query de búsqueda de productos; Frontend → modal de búsqueda en POS.

**Prompt para el agente:**
```
Lee especificacion.md Feature 02 (AC-02.4) y Feature 01.
Verifica e implementa que los productos inactivos no aparezcan en el modal de venta:

BACKEND:
1. Verificar GET /v1/productos → la query debe incluir WHERE activo = true por default.
2. Verificar GET /v1/productos?barcode=XXXX → también debe filtrar activo = true.
3. Verificar que el endpoint de desactivar hace UPDATE SET activo = false (no DELETE).

FRONTEND:
1. En el modal/panel de búsqueda de la pantalla POS:
   - Las búsquedas (por barcode y por nombre) deben mostrar SOLO productos activos.
   - Si se escanea el barcode de un producto inactivo: mostrar mensaje "Producto no disponible".
2. En la página de administración de Productos:
   - La lista principal muestra solo activos.
   - Filtro "Ver inactivos" muestra los desactivados (con botón "Reactivar").
   - El soft-delete debe marcar activo=false sin eliminar de la DB.

TEST:
- Desactivar un producto.
- Buscar ese producto en el POS (por nombre y por barcode) → no debe aparecer.
- Buscar en admin → no aparece en la lista normal.
- Activar filtro de inactivos → sí aparece.
- Reactivar → vuelve a aparecer en el POS.
```

**Criterio de completitud**: Productos inactivos invisibles en POS, visibles con filtro en admin.

---

### C-09: Ordenamiento por columnas en Productos

**Problema reportado**: *"En el apartado de Productos, quiero poder ordenar por filtros (Categoría, Costo, Venta, Margen, y Stock)."*

**Área afectada**: Backend → query de productos; Frontend → tabla de Productos.

**Prompt para el agente:**
```
Implementa ordenamiento de columnas en la tabla de Productos del panel admin:

BACKEND:
1. GET /v1/productos debe aceptar query params:
   - sort_by=nombre | categoria | precio_costo | precio_venta | margen_pct | stock_actual
   - sort_dir=asc | desc (default: asc)
2. Agregar ORDER BY {campo} {dirección} en la query SQL base de productos.
3. Validar que sort_by solo acepta los valores permitidos (evitar SQL injection).

FRONTEND:
1. Hacer clickeables los headers: Nombre, Categoría, Costo, Venta, Margen, Stock.
2. Primer click → asc, segundo click → desc, tercer click → sin orden (default).
3. Mostrar indicador visual ↑ o ↓ en la columna activa.
4. El estado de ordenamiento se mantiene al cambiar de página (paginación).
5. Combinar con filtros existentes (activo, categoría, proveedor) sin conflicto.

TEST:
- Click en "Stock" → productos ordenados de menor a mayor stock.
- Click en "Costo" → ordenados por precio_costo ascendente.
- Click de nuevo en "Costo" → descendente.
```

**Criterio de completitud**: Todas las columnas indicadas son ordenables en ambas direcciones.

---

### C-16: Cambiar formato CSV de Proveedores

**Problema reportado**: *"En el apartado Proveedores, al cargar un CSV excel tiene que tener los campos codigo_barras,nombre,precio_desactualizado,precio_actualizado."*

**Área afectada**: Backend → handler CSV import; Frontend → instrucciones/plantilla de CSV.

**Prompt para el agente:**
```
Lee especificacion.md Feature 07 (AC-07.4, AC-07.5) — actualizar el contrato del CSV.
Modifica el formato y procesamiento del CSV de Proveedores:

BACKEND:
1. En el handler de POST /v1/csv/import, actualizar los headers esperados:
   DE: codigo_barras,nombre,precio_costo,precio_venta,unidades_por_bulto,categoria
   A:  codigo_barras,nombre,precio_desactualizado,precio_actualizado

2. Mapeo de campos:
   - precio_desactualizado → precio_costo (precio anterior)
   - precio_actualizado    → precio_venta (precio nuevo para venta)
3. Los campos unidades_por_bulto y categoria pasan a ser OPCIONALES.
4. Eliminar toda referencia a "formato de venta simplificada".
5. Actualizar la validación por fila para los nuevos nombres de columnas.

FRONTEND:
1. Actualizar la descripción del formato esperado que se muestra al usuario.
2. Mostrar la plantilla de ejemplo con los nuevos headers:
   codigo_barras,nombre,precio_desactualizado,precio_actualizado
3. Actualizar el tooltip o modal de ayuda con el nuevo formato.
4. Si se ofrece descarga de plantilla CSV: actualizar el archivo generado.
5. Eliminar referencias a "venta simplificada" en la UI.

TEST:
- Preparar CSV: "7790001234567,Coca-Cola 354ml,450.00,750.00"
- Importar → debe procesarse sin error; el producto debe tener precio_costo=450 y precio_venta=750.
- CSV con headers viejos (precio_costo,precio_venta) → mostrar error claro de formato.
```

**Criterio de completitud**: El CSV con los nuevos headers se importa correctamente.

---

### C-17: Manejo de errores en CSV con íconos descriptivos

**Problema reportado**: *"Cuando cargo una lista CSV con formatos inválidos quiero que maneje los errores de manera correcta y que se muestre en el costado del estado un ícono correspondiente al error."*

**Área afectada**: Backend → validación de CSV; Frontend → vista de resultado de importación.

**Prompt para el agente:**
```
Lee especificacion.md Feature 07 (AC-07.4, AC-07.5).
Implementa manejo de errores enriquecido en la importación de CSV:

BACKEND:
Tipos de error a detectar por fila y su código:
  - "BARCODE_MISSING"   → codigo_barras vacío o nulo
  - "BARCODE_DUPLICATE" → mismo codigo_barras aparece 2 veces en el CSV
  - "PRICE_NOT_NUMBER"  → precio_desactualizado o precio_actualizado no es número
  - "PRICE_NEGATIVE"    → precio es número pero <= 0
  - "NAME_MISSING"      → nombre vacío

La respuesta del endpoint debe incluir por cada fila con error:
{
  "fila": 15,
  "codigo_barras": "779...",
  "nombre": "...",
  "error_code": "PRICE_NEGATIVE",
  "error_message": "El precio no puede ser negativo o cero"
}

FRONTEND:
1. Tabla de resultado de importación: columnas [N°Fila, Código, Nombre, Estado, Detalle].
2. En la columna "Estado":
   - OK → ícono ✓ verde
   - ERROR → ícono correspondiente al tipo de error según error_code:
     * BARCODE_MISSING   → ícono de código de barras 🔲 (o SVG barcode icon)
     * BARCODE_DUPLICATE → ícono de duplicado ⧉
     * PRICE_NOT_NUMBER  → ícono de número inválido ⚠️
     * PRICE_NEGATIVE    → ícono de precio negativo 📉
     * NAME_MISSING      → ícono de nombre faltante 📝
3. Al hacer hover sobre el ícono de error → mostrar tooltip con el mensaje de error.
4. El contador de errores debe actualizarse en tiempo real al procesar el CSV.

TEST:
- CSV con fila sin barcode → fila muestra ícono barcode + tooltip "Falta el código de barras".
- CSV con precio "abc" → ícono número inválido + tooltip.
- CSV con misma barcode en dos filas → ícono duplicado en ambas filas.
```

**Criterio de completitud**: Cada tipo de error muestra el ícono y tooltip descriptivo correspondiente.

---

### C-23: Columna email y filtro por email en Usuarios

**Problema reportado**: *"En el apartado de Usuarios, quiero que se muestre una columna con el mail registrado de cada usuario. Y que también se pueda filtrar por el mail de cada uno."*

**Área afectada**: Backend → endpoint de usuarios; Frontend → tabla de Usuarios.

**Prompt para el agente:**
```
Implementa la columna email y filtro en la tabla de Usuarios del panel admin:

BACKEND:
1. GET /v1/usuarios: asegurar que la respuesta incluye el campo "email" en el JSON de cada usuario.
2. Agregar soporte para query param: email=texto → filtra usuarios cuyo email contiene "texto" (ILIKE).
3. Combinar con filtros existentes (?activo, ?rol).

FRONTEND:
1. En la tabla de Usuarios, agregar columna "Email" entre las columnas de Nombre y Rol.
2. Agregar campo de búsqueda "Filtrar por email" (input text) sobre la tabla.
3. El filtro aplica un debounce de 300ms antes de llamar a la API.
4. Combinar con el filtro de "Mostrar inactivos" (C-24) sin conflicto.

TEST:
- La tabla de Usuarios muestra el email de cada usuario.
- Escribir "gmail" en el filtro → solo aparecen usuarios con gmail en su email.
- Escribir email completo → aparece exactamente 1 resultado.
```

**Criterio de completitud**: Columna email visible, filtro por email funcional.

---

## PARTE 4 — MEJORAS UI/UX (Prioridad 4)

---

### C-01: Auto-asignación de punto de venta al login y apertura de caja simplificada

**Problema reportado**: *"Cuando inicie sesión un usuario que se le asigne automáticamente un punto de venta. Y que solo aparezca el monto inicial en efectivo con el que va a abrir la caja para el día de trabajo."*

**Área afectada**: Backend → modelo Usuario, apertura de caja; Frontend → flujo de login y apertura de caja.

**Prompt para el agente:**
```
Lee especificacion.md Feature 04 (AC-04.1) y Feature 05.
Implementa auto-asignación de punto de venta y simplificación del formulario de apertura de caja:

BACKEND:
1. Agregar campo punto_de_venta INT en el modelo Usuario (migration required).
2. En POST /v1/auth/login: la respuesta del token (o el payload decodificado) debe incluir
   "punto_de_venta": X asignado al usuario.
3. En POST /v1/caja/abrir: el campo "punto_de_venta" debe tomarse automáticamente del usuario JWT,
   no debe ser enviado por el frontend. Si el usuario no tiene punto asignado: HTTP 400 con mensaje claro.

FRONTEND:
1. Al hacer login: guardar el punto_de_venta del token en el state de autenticación (zustand / context).
2. La pantalla de apertura de caja debe mostrar SOLO el campo "Monto inicial en efectivo" (un único input).
3. El punto de venta se toma automáticamente del estado del usuario y se muestra informativamente (no editable por el cajero).
4. Formulario mínimo: "¿Con cuánto efectivo iniciás el día?" → input número → botón "Abrir Caja".
5. Si el usuario no tiene punto de venta asignado: mostrar mensaje de error y redirigir al admin.

ADMIN:
- En el formulario de edición de Usuario (C-26): agregar campo "Punto de Venta" (número entero).

TEST:
- Crear usuario con punto_de_venta = 2 → al logearse, la apertura de caja se registra en POS #2 automáticamente.
- Ver la pantalla de apertura de caja → solo muestra un campo "Monto inicial".
```

**Criterio de completitud**: La apertura de caja toma el POS del usuario, formulario con solo un campo.

---

### C-02: Terminal muestra número dinámico según POS asignado

**Problema reportado**: *"Cuando estoy en la pantalla de la terminal quiero que en la parte superior donde dice 'Terminal #01' quiero que se cambie automáticamente con respecto a la terminal que estoy usando."*

**Área afectada**: Frontend → header de la pantalla POS Terminal.

**Prompt para el agente:**
```
Actualiza el header de la Terminal POS para mostrar el número dinámico:

FRONTEND:
1. En el componente del header de la pantalla POS Terminal, leer el punto_de_venta del estado de auth.
2. Formatear como "Terminal #0X" donde X es el número de punto_de_venta del usuario:
   - punto_de_venta = 1 → "Terminal #01"
   - punto_de_venta = 2 → "Terminal #02"
   - punto_de_venta = null/undefined → "Terminal POS" (fallback)
3. El número debe actualizarse sin necesidad de reload cuando cambia el usuario logueado.
4. Usar el valor del JWT parseado (campo punto_de_venta) — no llamar a la API para esto.

TEST:
- Login con usuario con punto_de_venta = 3 → header muestra "Terminal #03".
- Login con usuario diferente con punto_de_venta = 1 → header muestra "Terminal #01".
```

**Criterio de completitud**: El header muestra el número de POS del usuario logueado dinámicamente.

---

### C-03: Solicitar datos de facturación antes del cobro

**Problema reportado**: *"Cuando realizo una venta quiero poder generar una factura al momento de realizar la venta. Antes de realizar el cobro me pide los datos del cliente si es que quiere recibir una factura electrónica o en papel. O si el cliente solo quiere recibir un ticket o remito (para vender en negro)."*

**Área afectada**: Frontend → modal de finalización de venta POS; Backend → soporte para tipo de comprobante en POST /v1/ventas.

**Prompt para el agente:**
```
Lee especificacion.md Feature 06 (AC-06.1 a AC-06.5) y Feature 01.
Implementa el modal de selección de tipo de comprobante antes del cobro:

FRONTEND:
1. Al presionar F10 (o el botón "Cobrar"), ANTES de mostrar el panel de métodos de pago,
   mostrar un modal de "Tipo de comprobante":
   
   ┌─────────────────────────────────────────────┐
   │  ¿Qué tipo de comprobante desea?            │
   │  ○ Factura electrónica (AFIP)               │
   │    [CUIT del cliente] ________________       │
   │    [Nombre/Razón Social] _____________       │
   │    [Email para envío] _______________        │
   │  ○ Ticket fiscal (solo ticket impreso)       │
   │  ○ Remito (sin comprobante)                 │
   │                          [Continuar] [Cancelar] │
   └─────────────────────────────────────────────┘
   
2. Si selecciona "Factura electrónica": validar que CUIT tiene formato válido (XX-XXXXXXXX-X).
3. Si selecciona "Ticket fiscal": no requiere datos adicionales.
4. Si selecciona "Remito": no requiere datos adicionales.
5. Al presionar "Continuar": pasar al panel de métodos de pago con el tipo de comprobante ya seleccionado.

BACKEND:
1. Agregar campo tipo_comprobante en el DTO de POST /v1/ventas:
   tipo_comprobante: "factura" | "ticket" | "remito"
2. Cuando tipo_comprobante = "factura": agregar campos opcionales receptor_cuit, receptor_nombre, receptor_email.
3. Encolar la tarea de facturación AFIP en el worker pool solo si tipo_comprobante = "factura".
4. El tipo se guarda en el comprobante generado.

TEST:
- Presionar F10 → aparece el modal de tipo de comprobante.
- Seleccionar "Factura electrónica" + CUIT inválido → bloquea avanzar con mensaje de error.
- Seleccionar "Ticket" → avanza directamente al cobro.
- Seleccionar "Remito" → la venta se registra sin generar comprobante fiscal.
```

**Criterio de completitud**: Modal de tipo de comprobante aparece antes del cobro y condiciona la facturación.

---

### C-04: Verificar función "Abrir cajón portamonedas al imprimir"

**Problema reportado**: *"Verificar si la función de 'Abrir cajón portamonedas al imprimir' de la Configuración de impresora funciona o solo está de decoración."*

**Área afectada**: Frontend → configuración de impresora, impresión ESC/POS.

**Prompt para el agente:**
```
Lee especificacion.md Feature 09 (AC-09.6).
Verifica e implementa el comando ESC/POS de apertura de cajón portamonedas:

INVESTIGACIÓN:
1. Localizar en el frontend el servicio de impresión ESC/POS (Web Serial API o Print Agent).
2. Buscar la función que envía los comandos al imprimir un ticket.
3. Verificar si la función de "Abrir cajón portamonedas" está implementada o es un placeholder.

IMPLEMENTACIÓN (si es placeholder):
1. El comando ESC/POS para abrir cajón es: ESC p m t1 t2
   En bytes: [0x1B, 0x70, 0x00, 0x19, 0xFA] (o [0x1B, 0x70, 0x01, 0x19, 0xFA])
2. En la función de impresión del ticket, DESPUÉS de imprimir los datos y ANTES del corte de papel:
   - Si la opción "Abrir cajón portamonedas al imprimir" está activada en Config → enviar el comando.
3. En la pantalla de Configuración de Impresora: el toggle debe leer/escribir desde localStorage o
   una configuración persistente del usuario.
4. Agregar botón "Probar apertura de cajón" en la configuración para testear sin imprimir un ticket.

TEST:
- Activar "Abrir cajón portamonedas al imprimir" en Configuración.
- Realizar una venta e imprimir ticket → el cajón debe abrirse.
- Desactivar la opción → imprimir ticket → el cajón NO debe abrirse.
- Botón "Probar apertura" → abre el cajón inmediatamente.
```

**Criterio de completitud**: El cajón portamonedas se abre al imprimir cuando la opción está activada.

---

### C-05: Botón "Cerrar Sesión" alejado de otros botones en el POS

**Problema reportado**: *"En la parte superior derecha de la Terminal quiero que el botón de cerrar sesión esté alejado de los otros botones ya que es muy fácil cerrar sesión de manera involuntaria."*

**Área afectada**: Frontend → header del POS Terminal.

**Prompt para el agente:**
```
Ajusta el layout del header del POS Terminal para separar el botón de Cerrar Sesión:

FRONTEND:
1. Localizar el componente de header de la Terminal POS.
2. Aislar el botón "Cerrar Sesión" del grupo de botones de acciones.
3. Aplicar las siguientes medidas de protección contra missclick:
   a. Añadir un separador visual (línea vertical o espacio de al menos 32px) entre el último
      botón de acción y el botón de Cerrar Sesión.
   b. Cambiar el estilo del botón de Cerrar Sesión a color rojo/naranja con borde para que
      se distinga claramente de los botones de acción.
   c. Al hacer click en "Cerrar Sesión": mostrar un modal de confirmación:
      "¿Estás seguro que querés cerrar sesión?" con botones [Sí, cerrar sesión] [Cancelar].
      El foco por defecto debe estar en "Cancelar" para evitar confirmación accidental.

TEST:
- Verificar que el botón de Cerrar Sesión tiene separación visual de los otros botones.
- Click en Cerrar Sesión → aparece modal de confirmación.
- Presionar Escape o click en Cancelar → no cierra sesión.
- Confirmar → cierra sesión correctamente.
```

**Criterio de completitud**: El botón de Cerrar Sesión tiene separación visual y confirmación obligatoria.

---

### C-06: Renombrar navegación en Panel Admin

**Problema reportado**: *"En el panel de admin, en el menú donde dice Dashboard, Producto, Proveedores, etc. Quiero que elimines el botón de 'Terminal POS' y que le pongas ese nombre al botón que está arriba de cerrar sesión que se llama 'Volver al POS'."*

**Área afectada**: Frontend → sidebar del panel admin.

**Prompt para el agente:**
```
Actualiza la navegación del panel admin:

FRONTEND:
1. Localizar el componente del sidebar/menú lateral del panel admin.
2. ELIMINAR la entrada "Terminal POS" del menú lateral (lista de secciones del admin).
3. RENOMBRAR el botón "Volver al POS" (que lleva de vuelta a la pantalla de caja) a "Terminal POS".
4. Mantener la funcionalidad: el botón renombrado "Terminal POS" debe seguir navegando a la pantalla POS.
5. Verificar que el botón "Terminal POS" (el nuevo nombre del antiguo "Volver al POS") esté ubicado
   justo arriba del botón "Cerrar Sesión", separado de las secciones del menú.

TEST:
- El menú lateral del admin NO tiene la opción "Terminal POS" entre las secciones (Dashboard, Productos, etc.).
- El botón que lleva al POS ahora se llama "Terminal POS" y funciona correctamente.
- UI sin regresiones en la navegación del panel admin.
```

**Criterio de completitud**: La navegación del admin refleja los cambios de nombres sin afectar la funcionalidad.

---

### C-10: Eliminar "Consulta de Precios" del menú lateral del admin

**Problema reportado**: *"En el panel de admin, en el menú del lado izquierdo quiero que elimines el apartado de 'Consulta de Precios'."*

**Área afectada**: Frontend → sidebar del panel admin.

**Prompt para el agente:**
```
Elimina la entrada "Consulta de Precios" del menú lateral del panel admin:

FRONTEND:
1. Localizar el componente del sidebar del admin.
2. Remover el ítem "Consulta de Precios" de la lista de navegación del menú.
3. NOTA: El endpoint GET /v1/precio/{barcode} del backend DEBE mantenerse activo
   (es parte de la especificación y puede seguir usándose por otras vías).
   Solo se elimina el acceso desde el menú del admin.
4. Si existe una ruta protegida /admin/consulta-precios: dejarla accesible via URL directa
   pero sin mostrarse en el menú (solo para uso interno si fuera necesario).

TEST:
- El menú lateral del admin no muestra "Consulta de Precios".
- El endpoint GET /v1/precio/{barcode} sigue funcionando si se llama directamente.
- No hay rutas rotas ni errores de compilación.
```

**Criterio de completitud**: "Consulta de Precios" no aparece en el menú del admin.

---

## Verificación Final

Después de implementar todas las correcciones, ejecutar el siguiente flujo de validación integral:

**Prompt de validación final:**
```
Ejecuta la siguiente batería de pruebas para confirmar que todas las correcciones fueron implementadas:

1. FLUJO COMPLETO DE VENTA:
   - Login de cajero con punto_de_venta = 1 → header muestra "Terminal #01".
   - Apertura de caja con solo campo de monto inicial → se abre caja en POS #1.
   - Buscar producto activo → agrega al carrito.
   - Buscar producto inactivo → no aparece.
   - Presionar F10 → aparece modal de tipo de comprobante.
   - Seleccionar "Ticket" → panel de pago.
   - Pagar con tarjeta de débito → venta registrada.
   - Stock bajó correctamente (C-11).
   - Movimiento de inventario registrado y visible (C-12).

2. CIERRE DE CAJA:
   - Ir a Cierre de Caja → el monto de débito debe aparecer (C-21).
   - Realizar arqueo → el arqueo se guarda (C-22).

3. FACTURACIÓN:
   - Ir a Facturación → la venta del paso 1 aparece.
   - Filtrar por "Último Mes" → aparece (C-19).
   - Ordenar por "Total" ascendente (C-20).
   - Reimprimir el ticket (C-13).
   - Descargar PDF (C-13).
   - Anular la venta → stock restaurado (C-13).

4. PROVEEDORES:
   - Importar CSV con campos: codigo_barras,nombre,precio_desactualizado,precio_actualizado (C-16).
   - Importar CSV con errores → ver íconos descriptivos en hovering (C-17).
   - Crear proveedor con 2 contactos (C-18).

5. ADMIN NAVEGACIÓN:
   - Menú lateral no tiene "Terminal POS" ni "Consulta de Precios" (C-06, C-10).
   - Menú tiene "Categorías" (C-14).
   - Botón "Terminal POS" lleva al POS.

6. USUARIOS:
   - Tabla muestra columna email (C-23).
   - Filtrar por email funciona (C-23).
   - Desactivar usuario → sigue en DB como inactivo (C-24).
   - Toggle "Mostrar inactivos" → aparece (C-24).
   - Crear usuario con contraseña → login funciona (C-25).
   - Editar email de usuario → persiste (C-26).

Ejecutar: cd backend && go test ./... → todos los tests deben pasar.
```

---

## Registro de Correcciones

Usar esta tabla para trackear el progreso:

| ID   | Descripción Corta                        | Prioridad | Estado       |
|------|------------------------------------------|-----------|----------------|
| C-11 | Stock no baja al vender                 | P1 Crítico | ✅ Completado |
| C-12 | Movimientos de inventario no cargan     | P1 Crítico | ✅ Completado |
| C-13 | Reimprimir/Descargar/Anular venta       | P1 Crítico | ✅ Completado |
| C-21 | Débito/Crédito/Transferencia no en caja | P1 Crítico | ✅ Completado |
| C-22 | Arqueo de caja no se guarda             | P1 Crítico | ✅ Completado |
| C-15 | ERR_CONNECTION_REFUSED en CSV           | P1 Crítico | ✅ Completado |
| C-24 | Usuario inactivo desaparece             | P1 Crítico | ✅ Completado |
| C-25 | Contraseña no se guarda al crear usuario| P1 Crítico | ✅ Completado |
| C-26 | Edición de email/contraseña no guarda   | P1 Crítico | ✅ Completado |
| C-08 | Filtro de productos inactivos           | P2 Funcional | ✅ Completado |
| C-19 | Filtros de fecha adicionales            | P2 Funcional | ✅ Completado |
| C-20 | Ordenamiento y filtro mp en Facturación | P2 Funcional | ✅ Completado |
| C-14 | Pestaña Categorías                      | P3 Feature | ✅ Completado |
| C-18 | Múltiples contactos por proveedor       | P3 Feature | ✅ Completado |
| C-07 | Inactivos invisibles en POS             | P3 Feature | ✅ Completado |
| C-09 | Ordenamiento en tabla Productos         | P3 Feature | ✅ Completado |
| C-16 | Nuevo formato CSV proveedores           | P3 Feature | ✅ Completado |
| C-17 | Íconos de error en CSV                  | P3 Feature | ✅ Completado |
| C-23 | Columna email y filtro en Usuarios      | P3 Feature | ✅ Completado |
| C-01 | Auto-asignación POS al login            | P4 UI/UX | ✅ Completado |
| C-02 | Terminal # dinámico                     | P4 UI/UX | ✅ Completado |
| C-03 | Modal tipo comprobante antes del cobro  | P4 UI/UX | ✅ Completado |
| C-04 | Apertura de cajón portamonedas          | P4 UI/UX | ✅ Completado |
| C-05 | Separar botón Cerrar Sesión             | P4 UI/UX | ✅ Completado |
| C-06 | Renombrar navegación admin              | P4 UI/UX | ✅ Completado |
| C-10 | Eliminar Consulta de Precios del menú   | P4 UI/UX | ✅ Completado |

**Leyenda**: ⬜ Pendiente | 🔄 En progreso | ✅ Completado | ❌ Bloqueado

---

## Dependencias entre Correcciones

```
C-01 (POS auto-asignado) ──requiere──▶ C-02 (Terminal # dinámico)
C-07 (inactivos invisible POS) ──related to──▶ C-08 (filtro inactivos admin)
C-11 (stock baja) ──genera──▶ C-12 (movimientos inventario)
C-21 (métodos en caja) ──related to──▶ C-22 (arqueo se guarda)
C-24 (inactivo persiste) ──same pattern as──▶ C-07 (productos inactivos)
C-25 (crear contraseña) ──related to──▶ C-26 (editar contraseña)
C-16 (formato CSV) ──antes que──▶ C-17 (iconos error CSV)
C-14 (categorías) ──antes que──▶ C-09 (ordenar por categoría en productos)
```
