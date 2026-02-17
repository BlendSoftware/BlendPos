# Habilidades del Agente — RAG Multi-Dominio

> Skills de skills.sh seleccionadas para el desarrollo del proyecto
> Fecha de relevamiento: 2026-02-09

---

## Contexto y Criterio de Seleccion

El proyecto RAG Multi-Dominio, segun se describe en los documentos proyecto.md y especificacion.md, es un sistema que combina un backend Python con FastAPI, orquestacion de flujos RAG mediante LangChain y LangGraph, almacenamiento vectorial en ChromaDB, gestion de sesiones con Redis, inferencia local con Ollama, y un frontend React con streaming SSE. Ademas, el desarrollo se rige por la metodologia Spec-Driven Development (SDD), que exige especificaciones formales antes de escribir codigo.

Este perfil tecnologico atraviesa al menos siete dominios de competencia: desarrollo Python moderno, construccion de APIs asincronas, patrones de frontend React, integracion con bases de datos vectoriales y Redis, testing riguroso, seguridad aplicada y operaciones de despliegue con contenedores. Para cada uno de estos dominios, el ecosistema abierto de skills.sh ofrece habilidades especializadas que un agente de IA puede incorporar para producir codigo alineado con las mejores practicas de la industria.

A continuacion se presenta el catalogo completo de skills identificadas, organizadas por el area del proyecto que refuerzan, con su comando de instalacion y una descripcion de lo que aportan al desarrollo del sistema.

---

## 1. Metodologia y Gobernanza del Proyecto

### cc-sdd (Spec-Driven Development)

```
npx cc-sdd@latest --claude
```

Esta skill implementa la metodologia Spec-Driven Development directamente en el flujo de trabajo del agente. Introduce comandos estructurados que fuerzan un ciclo de requirements, design y tasks antes de que se escriba una sola linea de codigo. El flujo va de la especificacion al plan tecnico y de ahi a tareas atomicas, exactamente como esta organizado el documento especificacion.md del proyecto. Soporta Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI y Windsurf, lo que la convierte en una herramienta transversal al equipo independientemente del agente que cada miembro utilice. Para este proyecto, cc-sdd garantiza que cada feature del RAG (ingesta, chat, streaming, politicas de seguridad) pase por el ciclo formal de especificacion antes de implementarse.

**Fuente**: [gotalab/cc-sdd en GitHub](https://github.com/gotalab/cc-sdd)

---

## 2. Backend Python — Scaffolding y Patrones Modernos

### fastapi-templates

```
npx skills add https://github.com/wshobson/agents --skill fastapi-templates
```

Esta skill provee estructuras de proyecto FastAPI listas para produccion. Incluye patrones de inyeccion de dependencias con el sistema nativo `Depends` de FastAPI, el patron Repository para operaciones CRUD con tipado generico, separacion en capas de servicio para logica de negocio, configuracion mediante Pydantic Settings, setup de CORS middleware, y esquemas de autenticacion con JWT y OAuth2. Para el proyecto RAG, esta skill alinea directamente con la estructura de directorios definida en la especificacion: el area de API con sus endpoints de chat, ingesta y dominios, el area de core con los esquemas Pydantic canonicos, y el area de infra con los clientes de ChromaDB, Redis y Ollama. El patron de Dependency Injection es critico para inyectar los clientes de infraestructura en los endpoints de forma testeable.

**Fuente**: [skills.sh/wshobson/agents/fastapi-templates](https://skills.sh/wshobson/agents/fastapi-templates)

---

### python-development-python-scaffold

```
npx skills add https://github.com/sickn33/antigravity-awesome-skills --skill python-development-python-scaffold
```

Esta skill complementa a fastapi-templates cubriendo el scaffolding general de proyectos Python modernos. Configura el gestor de paquetes `uv`, genera pyproject.toml con dependencias correctamente declaradas, establece Ruff como linter y formateador, configura pytest con soporte asyncio, y genera templates de .env y Makefile. Para el proyecto RAG, donde el pyproject.toml ya define dependencias como FastAPI, LangChain, LangGraph, ChromaDB y Redis, esta skill asegura que la configuracion del entorno de desarrollo siga las convenciones actuales de la comunidad Python, incluyendo tipado estricto y automatizacion de tareas recurrentes.

**Fuente**: [skills.sh/sickn33/antigravity-awesome-skills/python-development-python-scaffold](https://skills.sh/sickn33/antigravity-awesome-skills/python-development-python-scaffold)

---

### modern-python

```
npx skills add https://github.com/trailofbits/skills --skill modern-python
```

Desarrollada por Trail of Bits, una firma reconocida en seguridad informatica, esta skill define el estado del arte del tooling Python moderno. Promueve el uso de `uv` como gestor unificado de paquetes y entornos virtuales, Ruff para linting y formateo, `ty` para chequeo de tipos, y `prek` para hooks de pre-commit en Rust. Establece que los proyectos deben usar layout `src/`, requieren Python 3.11+, y exigen cobertura de tests minima del 80%. Para un proyecto que maneja datos de salud (alergenos, contraindicaciones quimicas), la rigurosidad en tipado y seguridad que promueve esta skill es particularmente relevante. Ademas, incluye integracion con detect-secrets y pip-audit, herramientas que previenen la exposicion accidental de credenciales y vulnerabilidades en dependencias.

**Fuente**: [skills.sh/trailofbits/skills/modern-python](https://skills.sh/trailofbits/skills/modern-python)

---

### async-python-patterns

```
npx skills add https://github.com/wshobson/agents --skill async-python-patterns
```

El proyecto RAG utiliza FastAPI en modo asincrono y Ollama como LLM local con streaming de tokens. Esta skill proporciona guia exhaustiva sobre programacion asincrona en Python: event loops, coroutines, tasks, futures, context managers asinconos, el patron productor-consumidor, semaforos y primitivas de sincronizacion. Cubre casos reales como operaciones de base de datos asincronas, servidores WebSocket, y optimizaciones de performance mediante connection pooling y operaciones en batch. Para el endpoint de streaming SSE del proyecto, donde el backend genera tokens de Ollama y los transmite al frontend en tiempo real, los patrones de esta skill son directamente aplicables a la implementacion del generador asincrono que alimenta la StreamingResponse de FastAPI.

**Fuente**: [skills.sh/wshobson/agents/async-python-patterns](https://skills.sh/wshobson/agents/async-python-patterns)

---

## 3. Infraestructura de Datos — Redis

### redis-development

```
npx skills add https://github.com/redis/agent-skills --skill redis-development
```

Esta es la skill oficial de Redis, mantenida por el propio equipo de Redis. Contiene 29 reglas organizadas en 11 categorias, priorizadas por impacto. Para el proyecto RAG, las categorias mas relevantes son: estructuras de datos y claves (para disenar correctamente las claves de sesion `chat:{domain_id}:{session_id}`), memoria y expiracion (para definir politicas de TTL que en el MVP no tienen expiracion pero en produccion la necesitaran), conexion y performance (para implementar pooling y evitar comandos lentos), y especialmente vector search y semantic caching. Esta ultima categoria cubre patrones de RAG con Redis, incluyendo LangCache para cache de respuestas de LLM, que es exactamente la funcionalidad de cache liviano descrita en la especificacion del proyecto. Cada regla incluye ejemplos de codigo incorrecto y correcto, lo que permite al agente generar implementaciones alineadas desde el primer intento.

**Fuente**: [skills.sh/redis/agent-skills/redis-development](https://skills.sh/redis/agent-skills/redis-development)

---

## 4. Frontend React

### frontend-react-best-practices

```
npx skills add https://github.com/sergiodxa/agent-skills --skill frontend-react-best-practices
```

Con 33 reglas distribuidas en 6 categorias, esta skill cubre optimizacion de bundle, reduccion de re-renders, patrones de rendering, patrones de cliente, hooks y composicion de componentes. Para el frontend del proyecto RAG, donde el componente Chat.tsx debe manejar streaming de tokens con actualizacion reactiva del DOM en cada token recibido, las reglas de re-render optimization (functional setState, derived state, lazy initialization) y rendering performance (content-visibility para listas largas de mensajes, prevencion de hydration flicker) son directamente aplicables. El patron de compound components con contexto compartido es relevante para la relacion entre Chat.tsx, SourcesPanel.tsx y WarningsPanel.tsx, que comparten el estado de una misma respuesta.

**Fuente**: [skills.sh/sergiodxa/agent-skills/frontend-react-best-practices](https://skills.sh/sergiodxa/agent-skills/frontend-react-best-practices)

---

### react-best-practices

```
npx skills add https://github.com/gohypergiant/agent-skills --skill react-best-practices
```

Esta skill complementa a la anterior con enfasis en escenarios avanzados: migracion a React 19, resolucion de hydration mismatches, closures obsoletos, loops de re-render infinitos y memory leaks. Para el cliente SSE del proyecto, donde un ReadableStream se consume en un loop asincrono y cada token actualiza el estado del componente, los patrones de store-event-handlers-refs y uselatest-stable-callbacks previenen exactamente los bugs de closures obsoletos que aparecen cuando se actualiza estado dentro de callbacks de streaming de larga duracion.

**Fuente**: [skills.sh/gohypergiant/agent-skills/react-best-practices](https://skills.sh/gohypergiant/agent-skills/react-best-practices)

---

### frontend-design

```
npx skills add https://github.com/anthropics/skills --skill frontend-design
```

Skill oficial de Anthropic para diseno de interfaces frontend. Proporciona directrices de tipografia (seleccion de fuentes con caracter, pairing de display y body), color y temas (paletas cohesivas con variables CSS), motion (animaciones CSS y efectos scroll-triggered), composicion espacial (asimetria, overlap, flujos diagonales) y fondos y detalles (gradientes, texturas, transparencias). Para la interfaz del IA-Mozo, donde la experiencia del usuario final debe transmitir confianza y profesionalismo (burbujas de chat, paneles de advertencias con iconografia clara, panel de fuentes desplegable), esta skill guia al agente a producir una UI con identidad visual definida en lugar de una interfaz generica.

**Fuente**: [skills.sh/anthropics/skills/frontend-design](https://skills.sh/anthropics/skills/frontend-design)

---

## 5. Testing

### pytest-patterns

```
npx skills add https://github.com/manutej/luxor-claude-marketplace --skill pytest-patterns
```

Skill integral para testing con pytest que cubre desde la estructura basica de tests hasta patrones avanzados. Incluye fixtures con diferentes scopes (function, class, module, session), parametrizacion para ejecutar el mismo test con multiples inputs, mocking con monkeypatch y unittest.mock, organizacion de suites con conftest.py y markers, analisis de cobertura con thresholds, e integracion CI/CD. Para el proyecto RAG, donde se necesitan tests para el chunking semantico (verificar que un DishCanonical genera los chunks correctos), para las politicas de seguridad (verificar que los triggers de salud activan disclaimers), para el grafo LangGraph (verificar la transicion de estados), y para los endpoints de API (verificar contratos de entrada/salida), esta skill proporciona los patrones exactos para cada tipo de test. La parametrizacion es especialmente util para probar multiples combinaciones de domain_id, chunk_type y triggers de salud.

**Fuente**: [skills.sh/manutej/luxor-claude-marketplace/pytest-patterns](https://skills.sh/manutej/luxor-claude-marketplace/pytest-patterns)

---

### test-driven-development

```
npx skills add https://github.com/obra/superpowers --skill test-driven-development
```

Con 6,700 instalaciones semanales, esta es una de las skills mas adoptadas del ecosistema. Implementa la disciplina TDD estricta: escribir el test primero, verificar que falla, escribir el codigo minimo para que pase, verificar que pasa, y refactorizar manteniendo verde. Establece como ley de hierro que no se escribe codigo de produccion sin un test fallido previo. Para un proyecto SDD como el RAG Multi-Dominio, donde cada feature tiene criterios de aceptacion en formato Given/When/Then, la combinacion de SDD + TDD crea un pipeline donde la especificacion define el "que" y el test define el "como se verifica", antes de que el agente escriba la implementacion. Esta skill asegura que el agente no salte directamente a la implementacion ignorando los criterios de aceptacion de la especificacion.

**Fuente**: [skills.sh/obra/superpowers/test-driven-development](https://skills.sh/obra/superpowers/test-driven-development)

---

### webapp-testing

```
npx skills add https://github.com/anthropics/skills --skill webapp-testing
```

Skill oficial de Anthropic para testing de aplicaciones web con Playwright en Python. Automatiza la gestion del ciclo de vida del servidor (backend + frontend), maneja aplicaciones JavaScript-heavy mediante espera de network-idle e inspeccion del DOM, y sigue un patron de reconocimiento antes de accion (navegar, esperar, inspeccionar selectores, luego ejecutar). Para la validacion end-to-end del proyecto RAG (Tarea 5.1 de la especificacion), donde se necesita verificar que el frontend muestra correctamente los tokens en streaming, las advertencias y las fuentes, esta skill permite automatizar el flujo completo: levantar backend + frontend, enviar una pregunta via la UI, y verificar que los paneles de warnings y sources se renderizan con el contenido esperado.

**Fuente**: [skills.sh/anthropics/skills/webapp-testing](https://skills.sh/anthropics/skills/webapp-testing)

---

## 6. Seguridad

### code-review-security

```
npx skills add https://github.com/hieutrtr/ai1-skills --skill code-review-security
```

Esta skill realiza analisis de seguridad integral contra el OWASP Top 10 (edicion 2021). Genera un reporte `security-review.md` con hallazgos clasificados por severidad (Critical, High, Medium, Low, Info), ubicacion en el codigo, descripcion y remediacion. Para el backend Python/FastAPI del proyecto, verifica patrones especificos como uso de `eval()`, `exec()` y `compile()`, inyeccion via `subprocess`, deserializacion insegura con `pickle.loads()`, construccion de SQL crudo, `yaml.load()` sin safe loader (relevante porque el proyecto carga configuraciones YAML de dominios), hashing criptografico debil, y bypass de verificacion JWT. Para el frontend React, verifica `dangerouslySetInnerHTML`, inyeccion de URLs `javascript:`, open redirects y almacenamiento inseguro de tokens. Esta cobertura dual Python + React la hace ideal para auditar ambas capas del proyecto RAG.

**Fuente**: [skills.sh/hieutrtr/ai1-skills/code-review-security](https://skills.sh/hieutrtr/ai1-skills/code-review-security)

---

### security-scanning-security-sast

```
npx skills add https://github.com/sickn33/antigravity-awesome-skills --skill security-scanning-security-sast
```

Complemento de la skill anterior, esta herramienta de SAST (Static Application Security Testing) soporta escaneo multi-lenguaje (Python, JavaScript/TypeScript, Java, Go, entre otros) y se integra con herramientas especializadas como Bandit para Python, Semgrep para patrones custom y ESLint Security para JavaScript. Detecta inyeccion SQL, inyeccion de comandos, XSS, secretos hardcodeados, path traversal, deserializacion insegura, IDOR y CSRF. Incluye capacidad de crear reglas Semgrep custom para politicas de seguridad especificas de la organizacion, y mapea hallazgos contra estandares de compliance como OWASP, PCI-DSS y SOC2. Para el proyecto RAG, donde los endpoints de ingesta reciben archivos PDF y payloads JSON desde el exterior, el escaneo SAST es critico para detectar vulnerabilidades de inyeccion en la capa de API antes de llegar a produccion.

**Fuente**: [skills.sh/sickn33/antigravity-awesome-skills/security-scanning-security-sast](https://skills.sh/sickn33/antigravity-awesome-skills/security-scanning-security-sast)

---

## 7. DevOps y Despliegue

### devops-engineer

```
npx skills add https://github.com/jeffallan/claude-skills --skill devops-engineer
```

Esta skill simula un ingeniero DevOps senior con tres perspectivas operativas: Build (automatizacion de build, test y packaging), Deploy (orquestacion de despliegues entre entornos) y Ops (confiabilidad, monitoreo y respuesta a incidentes). Cubre CI/CD con GitHub Actions, GitLab CI y Jenkins; contenedorizacion con Docker y Docker Compose; despliegues en Kubernetes con Helm; infraestructura como codigo con Terraform; y estrategias de deployment blue-green, canary y rolling. Para el proyecto RAG, donde el despliegue requiere orquestar tres servicios (Redis via Docker, Ollama como servicio local, y FastAPI con uvicorn), esta skill guia la creacion de un docker-compose.yml que levante el stack completo, Dockerfiles optimizados para el backend Python, health checks automatizados, y procedimientos de rollback documentados. Sus restricciones explicitas (nunca almacenar secretos en codigo, nunca usar tags `latest` en produccion, nunca desplegar sin aprobacion) alinean con las invariantes de seguridad del proyecto.

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
```

---

## Mapa de Skills por Fase del Proyecto

| Fase de la Especificacion | Skills Aplicables |
|---------------------------|-------------------|
| Fase 1: Infraestructura y Configuracion | cc-sdd, fastapi-templates, python-development-python-scaffold, modern-python, redis-development |
| Fase 2: Esquemas, Chunking e Ingesta | fastapi-templates, modern-python, pytest-patterns, test-driven-development |
| Fase 3: Pipeline RAG | async-python-patterns, redis-development, pytest-patterns, test-driven-development |
| Fase 4: Frontend | frontend-react-best-practices, react-best-practices, frontend-design |
| Fase 5: Integracion y Validacion E2E | webapp-testing, code-review-security, security-scanning-security-sast, devops-engineer |
| Transversal (todo el proyecto) | cc-sdd, modern-python, test-driven-development, code-review-security |

---

## Nota sobre Skills No Encontradas

Al momento de este relevamiento, el ecosistema skills.sh no ofrece skills dedicadas para LangChain, LangGraph, ChromaDB ni Ollama. Estas tecnologias son suficientemente especificas del dominio de IA generativa como para que sus mejores practicas se deriven directamente de la documentacion oficial y de los patrones establecidos en la especificacion del proyecto (chunking semantico, grafo de estados tipado, similarity search con filtros de metadata). Las skills de Python asincrono y FastAPI cubren los patrones de infraestructura que rodean a estas librerias, pero la logica de orquestacion RAG en si misma depende del conocimiento intrinseco del agente sobre LangChain/LangGraph, no de una skill externa.
