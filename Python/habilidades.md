# Habilidades del Agente — BlendPOS

> Skills de skills.sh seleccionadas para el desarrollo del proyecto
> Fecha de relevamiento: 2026-02-11

---

## Contexto y Criterio de Seleccion

El proyecto BlendPOS, segun se describe en los documentos proyecto.md y especificacion.md, es un sistema POS de mision critica que combina un backend Python con FastAPI, persistencia transaccional en PostgreSQL con SQLAlchemy 2.0, autenticacion JWT/OAuth2, tareas asincronas con Celery/Redis, generacion de PDFs con ReportLab, integracion fiscal con AFIP, y un frontend React con Vite, TypeScript, TailwindCSS y ShadcnUI. Ademas, el desarrollo se rige por la metodologia Spec-Driven Development (SDD), que exige especificaciones formales antes de escribir codigo.

Este perfil tecnologico atraviesa al menos ocho dominios de competencia: desarrollo Python moderno, construccion de APIs asincronas, modelado relacional con PostgreSQL, autenticacion y seguridad, patrones de frontend React, integracion con servicios externos (AFIP, SMTP), testing riguroso y operaciones de despliegue con contenedores. Para cada uno de estos dominios, el ecosistema abierto de skills.sh ofrece habilidades especializadas que un agente de IA puede incorporar para producir codigo alineado con las mejores practicas de la industria.

A continuacion se presenta el catalogo completo de skills identificadas, organizadas por el area del proyecto que refuerzan, con su comando de instalacion y una descripcion de lo que aportan al desarrollo del sistema.

---

## 1. Metodologia y Gobernanza del Proyecto

### cc-sdd (Spec-Driven Development)

```
npx cc-sdd@latest --claude
```

Esta skill implementa la metodologia Spec-Driven Development directamente en el flujo de trabajo del agente. Introduce comandos estructurados que fuerzan un ciclo de requirements, design y tasks antes de que se escriba una sola linea de codigo. Para BlendPOS, cc-sdd garantiza que cada feature (ventas, inventario jerarquico, caja, facturacion) pase por el ciclo formal de especificacion antes de implementarse. El flujo va de la especificacion al plan tecnico y de ahi a tareas atomicas, exactamente como esta organizado el documento especificacion.md del proyecto.

**Fuente**: [gotalab/cc-sdd en GitHub](https://github.com/gotalab/cc-sdd)

---

## 2. Backend Python — Scaffolding y Patrones Modernos

### fastapi-templates

```
npx skills add https://github.com/wshobson/agents --skill fastapi-templates
```

Esta skill provee estructuras de proyecto FastAPI listas para produccion. Incluye patrones de inyeccion de dependencias con el sistema nativo `Depends` de FastAPI, el patron Repository para operaciones CRUD con tipado generico, separacion en capas de servicio para logica de negocio, configuracion mediante Pydantic Settings, setup de CORS middleware, y esquemas de autenticacion con JWT y OAuth2. Para BlendPOS, esta skill alinea directamente con la arquitectura en capas: el area de API con sus endpoints de ventas, productos, caja y facturacion, el area de core con los servicios de negocio, y el area de infra con los adaptadores de base de datos y servicios externos. El patron de Dependency Injection es critico para inyectar sesiones de base de datos, el usuario autenticado y los servicios en los endpoints de forma testeable.

**Fuente**: [skills.sh/wshobson/agents/fastapi-templates](https://skills.sh/wshobson/agents/fastapi-templates)

---

### python-development-python-scaffold

```
npx skills add https://github.com/sickn33/antigravity-awesome-skills --skill python-development-python-scaffold
```

Esta skill complementa a fastapi-templates cubriendo el scaffolding general de proyectos Python modernos. Configura el gestor de paquetes `uv`, genera pyproject.toml con dependencias correctamente declaradas, establece Ruff como linter y formateador, configura pytest con soporte asyncio, y genera templates de .env y Makefile. Para BlendPOS, donde el pyproject.toml define dependencias como FastAPI, SQLAlchemy, Celery, ReportLab y pyafipws, esta skill asegura que la configuracion del entorno de desarrollo siga las convenciones actuales de la comunidad Python.

**Fuente**: [skills.sh/sickn33/antigravity-awesome-skills/python-development-python-scaffold](https://skills.sh/sickn33/antigravity-awesome-skills/python-development-python-scaffold)

---

### modern-python

```
npx skills add https://github.com/trailofbits/skills --skill modern-python
```

Desarrollada por Trail of Bits, esta skill define el estado del arte del tooling Python moderno. Promueve el uso de `uv` como gestor unificado, Ruff para linting y formateo, `ty` para chequeo de tipos, y `prek` para hooks de pre-commit. Establece que los proyectos deben usar layout `src/`, requieren Python 3.11+, y exigen cobertura de tests minima del 80%. Para un proyecto de mision critica como BlendPOS, donde la integridad transaccional y la precision contable son fundamentales, la rigurosidad en tipado y seguridad que promueve esta skill es particularmente relevante. Ademas, incluye integracion con detect-secrets y pip-audit, herramientas que previenen la exposicion accidental de credenciales AFIP y vulnerabilidades en dependencias.

**Fuente**: [skills.sh/trailofbits/skills/modern-python](https://skills.sh/trailofbits/skills/modern-python)

---

### async-python-patterns

```
npx skills add https://github.com/wshobson/agents --skill async-python-patterns
```

BlendPOS utiliza FastAPI en modo asincrono, Celery para tareas en segundo plano y comunicacion asincrona con AFIP. Esta skill proporciona guia exhaustiva sobre programacion asincrona en Python: event loops, coroutines, tasks, futures, context managers asincronos, semaforos y primitivas de sincronizacion. Para los workers de Celery que procesan facturacion AFIP y envio de emails en paralelo, y para los endpoints de alta velocidad que requieren latencia sub-100ms, los patrones de esta skill son directamente aplicables.

**Fuente**: [skills.sh/wshobson/agents/async-python-patterns](https://skills.sh/wshobson/agents/async-python-patterns)

---

## 3. Base de Datos — PostgreSQL y SQLAlchemy

### sqlalchemy-patterns (via fastapi-templates)

La skill fastapi-templates incluye patrones de SQLAlchemy 2.0 con el nuevo estilo declarativo, relaciones tipadas, queries con select(), y manejo de sesiones con async sessions. Para BlendPOS, donde el modelo de datos incluye relaciones complejas (Producto -> ProductoHijo, Venta -> VentaItem, SesionCaja -> MovimientoCaja) y transacciones serializables para el desarme automatico de inventario, estos patrones son esenciales.

---

### redis-development

```
npx skills add https://github.com/redis/agent-skills --skill redis-development
```

Skill oficial de Redis con 29 reglas en 11 categorias. Para BlendPOS, las categorias mas relevantes son: estructuras de datos y claves (para diseñar correctamente las claves de cache de productos frecuentes), conexion y performance (para implementar pooling y evitar comandos lentos), y la integracion con Celery como broker de mensajeria. Los patrones de cache de esta skill son directamente aplicables al cache de productos para lograr la latencia sub-100ms en el registro de items de venta.

**Fuente**: [skills.sh/redis/agent-skills/redis-development](https://skills.sh/redis/agent-skills/redis-development)

---

## 4. Frontend React + TailwindCSS + ShadcnUI

### frontend-react-best-practices

```
npx skills add https://github.com/sergiodxa/agent-skills --skill frontend-react-best-practices
```

Con 33 reglas en 6 categorias, esta skill cubre optimizacion de bundle, reduccion de re-renders, patrones de rendering, hooks y composicion de componentes. Para el frontend de BlendPOS, donde la pantalla POS debe responder instantaneamente a escaneos de codigos de barras y atajos de teclado sin lag perceptible, las reglas de re-render optimization son criticas. Los patrones de compound components son relevantes para la relacion entre SalePanel, CartGrid y PaymentPanel, que comparten el estado de una misma transaccion de venta.

**Fuente**: [skills.sh/sergiodxa/agent-skills/frontend-react-best-practices](https://skills.sh/sergiodxa/agent-skills/frontend-react-best-practices)

---

### react-best-practices

```
npx skills add https://github.com/gohypergiant/agent-skills --skill react-best-practices
```

Complementa la skill anterior con enfasis en escenarios avanzados: closures obsoletos, loops de re-render infinitos y memory leaks. Para el modulo POS de BlendPOS, donde hooks como `useKeyboardShortcuts` y `useBarcode` registran event listeners globales de larga duracion, los patrones de cleanup y prevencion de memory leaks son directamente aplicables.

**Fuente**: [skills.sh/gohypergiant/agent-skills/react-best-practices](https://skills.sh/gohypergiant/agent-skills/react-best-practices)

---

### frontend-design

```
npx skills add https://github.com/anthropics/skills --skill frontend-design
```

Skill oficial de Anthropic para diseño de interfaces frontend. Para BlendPOS, donde la interfaz POS debe ser funcional, rapida y visualmente clara para cajeros que operan bajo presion, esta skill guia la seleccion de tipografia legible, paletas de colores con alto contraste para diferenciara estados (venta activa, caja cerrada, alerta de stock), y composicion espacial que priorice la informacion critica.

**Fuente**: [skills.sh/anthropics/skills/frontend-design](https://skills.sh/anthropics/skills/frontend-design)

---

## 5. Testing

### pytest-patterns

```
npx skills add https://github.com/manutej/luxor-claude-marketplace --skill pytest-patterns
```

Skill integral para testing con pytest. Para BlendPOS, se necesitan tests para el desarme automatico de inventario (verificar transaccionalidad ACID), para el ciclo de vida de caja (apertura, movimientos, arqueo ciego, cierre), para la logica de facturacion (tipos de comprobante, CAE), para la carga masiva CSV (validacion, upsert), y para los endpoints de API (contratos de entrada/salida). La parametrizacion es especialmente util para probar multiples combinaciones de metodos de pago, tipos de productos y escenarios de desarme.

**Fuente**: [skills.sh/manutej/luxor-claude-marketplace/pytest-patterns](https://skills.sh/manutej/luxor-claude-marketplace/pytest-patterns)

---

### test-driven-development

```
npx skills add https://github.com/obra/superpowers --skill test-driven-development
```

Con 6,700 instalaciones semanales, esta skill implementa la disciplina TDD estricta. Para un proyecto SDD como BlendPOS, donde cada feature tiene criterios de aceptacion en formato Given/When/Then, la combinacion de SDD + TDD crea un pipeline donde la especificacion define el "que" y el test define el "como se verifica", antes de que el agente escriba la implementacion.

**Fuente**: [skills.sh/obra/superpowers/test-driven-development](https://skills.sh/obra/superpowers/test-driven-development)

---

### webapp-testing

```
npx skills add https://github.com/anthropics/skills --skill webapp-testing
```

Skill oficial de Anthropic para testing de aplicaciones web con Playwright en Python. Para la validacion end-to-end de BlendPOS (Fase 9), donde se necesita verificar que el frontend POS procesa correctamente un flujo de venta completo (buscar producto, agregar al carrito, seleccionar pago, confirmar), que el cierre de caja muestra el desvio correcto, y que el modo consulta de precios funciona de forma aislada.

**Fuente**: [skills.sh/anthropics/skills/webapp-testing](https://skills.sh/anthropics/skills/webapp-testing)

---

## 6. Seguridad

### code-review-security

```
npx skills add https://github.com/hieutrtr/ai1-skills --skill code-review-security
```

Esta skill realiza analisis de seguridad integral contra el OWASP Top 10. Para el backend Python/FastAPI de BlendPOS, verifica patrones como inyeccion SQL (critico dado que el sistema maneja transacciones monetarias), deserializacion insegura, bypass de verificacion JWT, y exposicion de credenciales AFIP. Para el frontend React, verifica XSS, open redirects y almacenamiento inseguro de tokens.

**Fuente**: [skills.sh/hieutrtr/ai1-skills/code-review-security](https://skills.sh/hieutrtr/ai1-skills/code-review-security)

---

### security-scanning-security-sast

```
npx skills add https://github.com/sickn33/antigravity-awesome-skills --skill security-scanning-security-sast
```

Herramienta de SAST (Static Application Security Testing) multi-lenguaje. Para BlendPOS, donde los endpoints reciben archivos CSV, datos de pago y credenciales fiscales, el escaneo SAST es critico para detectar vulnerabilidades de inyeccion, secretos hardcodeados (certificados AFIP, JWT secrets) y path traversal en la carga de archivos.

**Fuente**: [skills.sh/sickn33/antigravity-awesome-skills/security-scanning-security-sast](https://skills.sh/sickn33/antigravity-awesome-skills/security-scanning-security-sast)

---

## 7. DevOps y Despliegue

### devops-engineer

```
npx skills add https://github.com/jeffallan/claude-skills --skill devops-engineer
```

Esta skill simula un ingeniero DevOps senior. Para BlendPOS, donde el despliegue requiere orquestar cinco servicios (PostgreSQL, Redis, FastAPI, Celery worker, Nginx), esta skill guia la creacion de un docker-compose.yml que levante el stack completo, Dockerfiles optimizados para el backend Python con multi-stage builds, health checks automatizados para PostgreSQL y Redis, y procedimientos de backup de la base de datos. Sus restricciones explicitas (nunca almacenar secretos en codigo, nunca usar tags `latest` en produccion) alinean con la necesidad de proteger certificados AFIP y credenciales de base de datos.

**Fuente**: [skills.sh/jeffallan/claude-skills/devops-engineer](https://skills.sh/jeffallan/claude-skills/devops-engineer)

---

## Resumen de Instalacion

La siguiente secuencia instala todas las skills identificadas para el proyecto:

```bash
# 1. Metodologia SDD
npx cc-sdd@latest --claude

# 2. Backend Python
npx skills add https://github.com/wshobson/agents --skill fastapi-templates
npx skills add https://github.com/sickn33/antigravity-awesome-skills --skill python-development-python-scaffold
npx skills add https://github.com/trailofbits/skills --skill modern-python
npx skills add https://github.com/wshobson/agents --skill async-python-patterns

# 3. Redis
npx skills add https://github.com/redis/agent-skills --skill redis-development

# 4. Frontend React
npx skills add https://github.com/sergiodxa/agent-skills --skill frontend-react-best-practices
npx skills add https://github.com/gohypergiant/agent-skills --skill react-best-practices
npx skills add https://github.com/anthropics/skills --skill frontend-design

# 5. Testing
npx skills add https://github.com/manutej/luxor-claude-marketplace --skill pytest-patterns
npx skills add https://github.com/obra/superpowers --skill test-driven-development
npx skills add https://github.com/anthropics/skills --skill webapp-testing

# 6. Seguridad
npx skills add https://github.com/hieutrtr/ai1-skills --skill code-review-security
npx skills add https://github.com/sickn33/antigravity-awesome-skills --skill security-scanning-security-sast

# 7. DevOps
npx skills add https://github.com/jeffallan/claude-skills --skill devops-engineer

# 8. Frontend Offline y PWA
npx skills add https://github.com/anthropics/skills --skill frontend-offline-storage
npx skills add https://github.com/anthropics/skills --skill pwa-service-workers
```

---

## Mapa de Skills por Fase del Proyecto

| Fase de la Especificacion | Skills Aplicables |
|---------------------------|-------------------|
| Fase 1: Infraestructura, Auth y Config | cc-sdd, fastapi-templates, python-development-python-scaffold, modern-python |
| Fase 2: Productos e Inventario Jerarquico | fastapi-templates, modern-python, pytest-patterns, test-driven-development |
| Fase 3: Modulo de Ventas | async-python-patterns, redis-development, pytest-patterns, test-driven-development |
| Fase 4: Caja y Tesoreria | fastapi-templates, modern-python, pytest-patterns |
| Fase 5: Facturacion | async-python-patterns, modern-python, pytest-patterns |
| Fase 6: Proveedores y Costos | fastapi-templates, pytest-patterns |
| Fase 7-8: Frontend | frontend-react-best-practices, react-best-practices, frontend-design, frontend-offline-storage, pwa-service-workers |
| Fase 9: Validacion y Deploy | webapp-testing, code-review-security, security-scanning-security-sast, devops-engineer |
| Transversal (todo el proyecto) | cc-sdd, modern-python, test-driven-development, code-review-security |

---

## 8. Frontend Offline y PWA

### frontend-offline-storage

```
npx skills add https://github.com/anthropics/skills --skill frontend-offline-storage
```

Skill para implementar Dexie.js (wrapper de IndexedDB) y estrategias de cacheo con TanStack Query (Persist). Manejo de almacenamiento local de hasta 50MB para catalogos grandes. Para BlendPOS, esta skill es critica para la arquitectura Local-First descrita en arquitectura.md seccion 2.4: el catalogo de productos se descarga al inicio del turno a IndexedDB, las busquedas por barcode se ejecutan localmente con 0ms de latencia de red, y cada venta se guarda inmediatamente en IndexedDB antes de sincronizarse con el backend. Los patrones de Dexie.js para transacciones locales, indices compuestos y migraciones de esquema son directamente aplicables al almacenamiento offline del carrito de venta, la SyncQueue de ventas pendientes y el cache de precios.

**Fuente**: [skills.sh/anthropics/skills/frontend-offline-storage](https://skills.sh/anthropics/skills/frontend-offline-storage)

---

### pwa-service-workers

```
npx skills add https://github.com/anthropics/skills --skill pwa-service-workers
```

Skill para configurar Vite PWA Plugin. Permite que la aplicacion cargue sin internet, cacheando assets (JS, CSS) y gestionando la sincronizacion de datos en background via PeriodicSync. Para BlendPOS, esta skill habilita el SyncEngine: un ServiceWorker que monitorea el estado de la red, despacha lotes de ventas offline al backend cuando hay conexion, y mantiene la aplicacion funcional incluso ante cortes de internet en el local. La configuracion de estrategias de cache (Cache First para assets estaticos, Network First para datos de catalogo) y la gestion del ciclo de vida del ServiceWorker (install, activate, fetch) son fundamentales para la operacion ininterrumpida del punto de venta.

**Fuente**: [skills.sh/anthropics/skills/pwa-service-workers](https://skills.sh/anthropics/skills/pwa-service-workers)

---

## Nota sobre Skills No Encontradas

Al momento de este relevamiento, el ecosistema skills.sh no ofrece skills dedicadas para pyafipws, ReportLab, ShadcnUI ni para logica POS especifica. Estas tecnologias son suficientemente especializadas como para que sus mejores practicas se deriven directamente de la documentacion oficial y de los patrones establecidos en la especificacion del proyecto (transaccionalidad ACID, desarme automatico, arqueo ciego). Las skills de Python asincrono, FastAPI y PostgreSQL cubren los patrones de infraestructura que rodean a estas librerias, pero la logica de negocio POS en si misma depende del conocimiento intrinseco del agente sobre sistemas transaccionales y contables.
