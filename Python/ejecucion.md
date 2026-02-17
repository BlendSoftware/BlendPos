# Guia de Ejecucion — BlendPOS con SDD

> Este documento explica como utilizar los archivos de especificacion del proyecto para que un agente IA (como Claude Code) implemente el sistema paso a paso.

---

## Que es esto?

El proyecto BlendPOS esta documentado en varios archivos que funcionan como instrucciones precisas para un agente IA. En lugar de escribir codigo manualmente, le das al agente estos documentos como contexto y el genera el codigo siguiendo las reglas, contratos y criterios de aceptacion que ya estan definidos.

Pensalo asi: los archivos `.md` son el plano del edificio, y el agente IA es el constructor que los lee y ejecuta.

---

## Archivos del proyecto y su rol

| Archivo | Que contiene | Para que sirve |
|---------|-------------|----------------|
| `proyecto.md` | Vision general del sistema en prosa narrativa | Entender el proyecto completo de un vistazo |
| `especificacion.md` | Especificacion formal SDD con features, contratos y tareas | Guia paso a paso para la implementacion |
| `arquitectura.md` | Arquitectura de software con diagramas y decisiones | Que el agente respete la estructura del sistema |
| `requirements.md` | Requisitos funcionales y no funcionales en formato EARS | Validar que nada se omita |
| `habilidades.md` | Skills de IA recomendadas para el proyecto | Potenciar al agente con habilidades especializadas |

---

## Paso 0: Configurar el contexto persistente

Crea un archivo llamado `CLAUDE.md` en la raiz del proyecto. Claude Code lee este archivo automaticamente cada vez que inicias una sesion, asi no tenes que repetir el contexto.

Contenido sugerido:

```markdown
# BlendPOS — Contexto del Proyecto

## Documentos de referencia
Antes de implementar cualquier tarea, lee estos archivos:
- especificacion.md — Especificacion formal (contratos, criterios, tareas)
- arquitectura.md — Arquitectura de software (capas, patrones, decisiones)
- requirements.md — Requisitos del sistema
- proyecto.md — Vision general

## Reglas
- Seguir la estructura de directorios de especificacion.md
- Respetar los contratos JSON/SQL de cada Feature
- Cumplir los criterios de aceptacion Given/When/Then
- No inventar funcionalidad que no este en la especificacion
- Ejecutar las tareas en orden de fase (1 -> 2 -> ... -> 9)
- Toda operacion critica debe estar dentro de una transaccion PostgreSQL
- Nunca bloquear una venta por fallo de AFIP
```

---

## Paso 1: Ejecutar tarea por tarea

La especificacion define tareas organizadas en 9 fases. La forma mas efectiva de trabajar es ejecutar una tarea a la vez, verificar que funcione, y luego pasar a la siguiente.

### Fase 1 — Infraestructura, Auth y Configuracion

**Tarea 1.1** — Scaffold del proyecto backend:
```
Lee especificacion.md. Ejecuta la Tarea 1.1 — Scaffold del proyecto backend.
Crea la estructura de directorios, pyproject.toml, settings.py y main.py.
Configura la conexion a PostgreSQL con SQLAlchemy 2.0 y Alembic.
Verifica que uvicorn arranca sin error y que GET /health retorna {"ok": true}.
```

**Tarea 1.2** — Modelos de base de datos:
```
Ejecuta la Tarea 1.2 — Modelos SQLAlchemy y migraciones.
Crea los modelos: Producto, ProductoHijo, Venta, VentaItem, SesionCaja, MovimientoCaja, Comprobante, Proveedor, Usuario.
Genera la migracion inicial con Alembic y aplica en PostgreSQL.
```

**Tarea 1.3** — Autenticacion JWT:
```
Ejecuta la Tarea 1.3 — Autenticacion y autorizacion.
Implementa registro de usuarios, login con JWT, roles (cajero, supervisor, administrador).
Verifica que endpoints protegidos rechazan requests sin token.
```

### Fase 2 — Productos e Inventario Jerarquico

**Tarea 2.1** — CRUD de Productos:
```
Ejecuta la Tarea 2.1 — CRUD completo de productos.
Implementa endpoints para crear, leer, actualizar y eliminar productos.
Incluye busqueda por codigo de barras y por nombre con paginacion.
```

**Tarea 2.2** — Inventario jerarquico:
```
Ejecuta la Tarea 2.2 — Relacion Padre/Hijo y desarme automatico.
Implementa la logica de vinculacion entre producto padre (bulto) y producto hijo (unidad).
Verifica que el desarme automatico funciona dentro de una transaccion ACID.
```

### Fase 3 — Modulo de Ventas

**Tarea 3.1** — Logica de ventas:
```
Ejecuta la Tarea 3.1 — Servicio de ventas con transaccionalidad ACID.
Implementa registro de venta atomica: items, stock decrement, movimiento de caja.
Verifica latencia <100ms en registro de items.
```

**Tarea 3.2** — Metodos de pago:
```
Ejecuta la Tarea 3.2 — Soporte multi-metodo de pago.
Implementa efectivo (con vuelto), debito, credito, transferencia y pagos mixtos.
```

### Fase 4 — Caja y Tesoreria

**Tarea 4.1** — Ciclo de vida de caja:
```
Ejecuta la Tarea 4.1 — Apertura, operacion y cierre de caja.
Implementa apertura con monto inicial, registro de movimientos inmutables,
arqueo ciego y deteccion de desvios.
```

### Fase 5 — Facturacion

**Tarea 5.1** — Comprobantes internos PDF:
```
Ejecuta la Tarea 5.1 — Generacion de tickets y comprobantes PDF.
Implementa generacion PDF con ReportLab y envio asincrono por email.
```

**Tarea 5.2** — Integracion AFIP:
```
Ejecuta la Tarea 5.2 — Facturacion electronica via AFIP.
Implementa comunicacion con WSAA y WSFEV1 de forma asincrona via Celery.
Verifica que la venta no se bloquea si AFIP no responde.
```

### Fase 6 — Proveedores y Costos

**Tarea 6.1** — Gestion de proveedores:
```
Ejecuta la Tarea 6.1 — CRUD de proveedores y vinculacion con productos.
Implementa actualizacion masiva de precios por porcentaje.
```

**Tarea 6.2** — Carga masiva CSV:
```
Ejecuta la Tarea 6.2 — Importacion de catalogos CSV.
Implementa validacion, preview y upsert de productos desde CSV.
```

### Fase 7 — Frontend: POS

**Tarea 7.1** — Interfaz de ventas:
```
Ejecuta la Tarea 7.1 — Pantalla POS con busqueda, carrito y pago.
Implementa atajos de teclado, lectura de codigos de barras y finalizacion.
```

### Fase 8 — Frontend: Administracion

**Tarea 8.1** — Paginas de administracion:
```
Ejecuta la Tarea 8.1 — Paginas de caja, productos, proveedores y consulta de precios.
Implementa todas las pantallas de gestion y el modo de consulta aislado.
```

### Fase 9 — Validacion

**Test E2E**:
```
Ejecuta la Tarea 9.1 — Test de integracion end-to-end.
Verifica el flujo completo: crear producto -> vincular padre/hijo -> venta con desarme -> cierre de caja -> facturacion.
```

**Docker Deploy**:
```
Ejecuta la Tarea 9.2 — Despliegue cloud SaaS.
Crea docker-compose.prod.yml con Traefik (SSL automatico), backend, frontend (Nginx), PostgreSQL, Redis, Celery.
Configura el frontend como PWA con manifest, ServiceWorker y Dexie.js.
Verifica que el sistema arranca con docker compose -f docker-compose.prod.yml up -d.
Verifica que HTTPS funciona con certificado Let's Encrypt.
Verifica que la PWA se puede instalar desde Chrome y funciona offline.
```

---

## Prompt alternativo: ejecutar una fase completa

Si preferis avanzar mas rapido, podes pedir una fase entera:

```
Lee especificacion.md y arquitectura.md.
Implementa la Fase 2 completa (Tareas 2.1 y 2.2).
Sigue los contratos de las Features de Productos e Inventario.
Verifica cada criterio de completitud antes de pasar a la siguiente tarea.
```

---

## Prompt alternativo: con skills instaladas

Si instalaste las skills de `habilidades.md`, podes potenciar los prompts:

```
Usa las skills cc-sdd, fastapi-templates y modern-python.
Lee especificacion.md y ejecuta la Tarea 1.1.
Aplica las mejores practicas de las skills instaladas.
```

---

## Consejos practicos

1. **Una tarea a la vez**: Es mejor ejecutar tarea por tarea que pedir todo junto. Asi podes revisar cada entregable antes de avanzar.

2. **Verificar antes de continuar**: Cada tarea tiene criterios de completitud. Pedi al agente que los verifique antes de pasar a la siguiente.

3. **Si algo falla, dar contexto**: Si una tarea produce un error, mostra el error al agente y pedile que lo corrija referenciando la especificacion.

4. **El orden importa**: Las fases estan diseñadas para ejecutarse en secuencia. La Fase 2 depende de la Fase 1, la Fase 3 depende de la 2, etc.

5. **Revisar el codigo generado**: Aunque el agente sigue la especificacion, siempre conviene revisar que el codigo cumpla con los contratos definidos.

6. **Transacciones ACID**: Verificar siempre que las operaciones criticas (ventas, desarme, cierre de caja) estan dentro de transacciones PostgreSQL.

---

## Resumen visual del flujo

```
CLAUDE.md (contexto persistente)
     |
     v
especificacion.md + arquitectura.md (referencia)
     |
     v
Prompt: "Ejecuta la Tarea X.Y"
     |
     v
El agente lee la tarea, sus contratos y criterios
     |
     v
Genera el codigo siguiendo la especificacion
     |
     v
Verifica los criterios de completitud
     |
     v
Siguiente tarea -->
```

---

## Requisitos previos

Antes de empezar la ejecucion, asegurate de tener instalado:

- Python >= 3.11
- Node.js >= 18
- Docker y Docker Compose (para PostgreSQL y Redis)
- Git

Comandos de preparacion:

```bash
# Levantar servicios de infraestructura
docker compose up -d postgres redis

# Crear entorno virtual Python
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -e ".[dev]"

# Aplicar migraciones
cd backend && alembic upgrade head

# Instalar dependencias frontend
cd frontend && npm install
```
