# Guia de Ejecucion — RAG Multi-Dominio con SDD

> Este documento explica como utilizar los archivos de especificacion del proyecto para que un agente IA (como Claude Code) implemente el sistema paso a paso.

---

## Que es esto?

El proyecto RAG Multi-Dominio esta documentado en varios archivos que funcionan como instrucciones precisas para un agente IA. En lugar de escribir codigo manualmente, le das al agente estos documentos como contexto y el genera el codigo siguiendo las reglas, contratos y criterios de aceptacion que ya estan definidos.

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

Crea un archivo llamado `CLAUDE.md` en la raiz del proyecto (`c:\Users\Admin\Desktop\rag\CLAUDE.md`). Claude Code lee este archivo automaticamente cada vez que inicias una sesion, asi no tenes que repetir el contexto.

Contenido sugerido:

```markdown
# RAG Multi-Dominio — Contexto del Proyecto

## Documentos de referencia
Antes de implementar cualquier tarea, lee estos archivos:
- especificacion.md — Especificacion formal (contratos, criterios, tareas)
- arquitectura.md — Arquitectura de software (capas, patrones, decisiones)
- requirements.md — Requisitos del sistema
- proyecto.md — Vision general

## Reglas
- Seguir la estructura de directorios de especificacion.md seccion 1.5
- Respetar los contratos JSON/YAML de cada Feature
- Cumplir los criterios de aceptacion Given/When/Then
- No inventar funcionalidad que no este en la especificacion
- Ejecutar las tareas en orden de fase (1 -> 2 -> 3 -> 4 -> 5)
```

---

## Paso 1: Ejecutar tarea por tarea

La especificacion define 13 tareas organizadas en 5 fases. La forma mas efectiva de trabajar es ejecutar una tarea a la vez, verificar que funcione, y luego pasar a la siguiente.

### Fase 1 — Infraestructura y Configuracion

**Tarea 1.1** — Scaffold del proyecto backend:
```
Lee especificacion.md. Ejecuta la Tarea 1.1 — Scaffold del proyecto backend.
Crea la estructura de directorios, pyproject.toml, settings.py y main.py.
Verifica que uvicorn arranca sin error y que GET /health retorna {"ok": true}.
```

**Tarea 1.2** — Clientes de infraestructura:
```
Ejecuta la Tarea 1.2 — Clientes de infraestructura (Chroma, Redis, Ollama).
Sigue los contratos definidos en especificacion.md.
Verifica los criterios de completitud.
```

**Tarea 1.3** — Registro de dominios:
```
Ejecuta la Tarea 1.3 — Registro de dominios y archivos YAML.
Crea domain_registry.py, restaurant.yaml y hair_salon.yaml.
Verifica que load_domains() retorna un dict con 2 claves.
```

### Fase 2 — Esquemas, Chunking e Ingesta

**Tarea 2.1** — Esquemas Pydantic:
```
Ejecuta la Tarea 2.1 — Esquemas Pydantic canonicos.
Implementa DishCanonical, HairProductCanonical y todos los sub-modelos.
Verifica que se instancian con datos de ejemplo sin error.
```

**Tarea 2.2** — Motor de chunking:
```
Ejecuta la Tarea 2.2 — Motor de chunking semantico.
Implementa chunks_from_dish() y chunks_from_hair_product().
Verifica que un DishCanonical completo genera al menos 4 chunks.
```

**Tarea 2.3** — Ingesta JSON:
```
Ejecuta la Tarea 2.3 — Endpoint de ingesta JSON.
Implementa POST /v1/ingest/json siguiendo el contrato de la Feature 02.
Verifica con los criterios de aceptacion de la especificacion.
```

**Tarea 2.4** — Parser PDF e ingesta PDF:
```
Ejecuta la Tarea 2.4 — Parser de PDF y endpoint de ingesta PDF.
Implementa pdf_menu_parser.py y POST /v1/ingest/pdf.
Sigue el flujo de procesamiento de la Feature 03.
```

### Fase 3 — Pipeline RAG

**Tarea 3.1** — Retrieval:
```
Ejecuta la Tarea 3.1 — Modulo de retrieval.
Implementa retrieve(domain_id, query, top_k) con similarity search en ChromaDB.
```

**Tarea 3.2** — Prompts y politicas:
```
Ejecuta la Tarea 3.2 — Construccion de prompts y politicas.
Implementa build_user_prompt() y las funciones de disclaimer en policies.py.
Sigue las reglas de la Feature 06 para los triggers de salud.
```

**Tarea 3.3** — Grafo LangGraph:
```
Ejecuta la Tarea 3.3 — Grafo LangGraph completo.
Implementa los 4 nodos (Retrieve, Generate, Validate, Format) y RAGState.
Sigue el flujo de la Feature 04 y la arquitectura del grafo en arquitectura.md.
```

**Tarea 3.4** — Chat sincrono:
```
Ejecuta la Tarea 3.4 — Endpoint de chat sincrono.
Implementa POST /v1/chat. Verifica con los escenarios de la Feature 04.
```

**Tarea 3.5** — Chat streaming:
```
Ejecuta la Tarea 3.5 — Endpoint de chat con streaming SSE.
Implementa POST /v1/chat/stream con el protocolo SSE de la Feature 05.
Verifica el orden de eventos: meta -> sources -> warnings -> start -> token* -> done.
```

### Fase 4 — Frontend

**Tarea 4.1** — Cliente SSE y React base:
```
Ejecuta la Tarea 4.1 — Cliente SSE y estructura base React.
Implementa api.ts con chatStream() y el scaffolding de la app.
```

**Tarea 4.2** — Chat con streaming:
```
Ejecuta la Tarea 4.2 — Componente de chat con streaming.
Implementa Chat.tsx, SourcesPanel.tsx, WarningsPanel.tsx y ChatPage.tsx.
Sigue la maquina de estados de la Feature 07.
```

**Tarea 4.3** — Panel de administracion:
```
Ejecuta la Tarea 4.3 — Panel de administracion.
Implementa AdminIngest.tsx con subida de PDF, JSON y smoke test.
```

### Fase 5 — Validacion

**Test E2E**:
```
Ejecuta la Tarea 5.1 — Test de integracion end-to-end.
Verifica el flujo completo: ingesta -> chat -> streaming -> warnings.
```

**Clonado de dominio**:
```
Ejecuta la Tarea 5.2 — Agregar segundo dominio sin tocar codigo.
Verifica que hair_salon funciona solo con YAML y datos, sin modificar codigo.
```

---

## Prompt alternativo: ejecutar una fase completa

Si preferis avanzar mas rapido, podes pedir una fase entera:

```
Lee especificacion.md y arquitectura.md.
Implementa la Fase 2 completa (Tareas 2.1, 2.2, 2.3 y 2.4).
Sigue los contratos de las Features 02 y 03.
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

4. **El orden importa**: Las fases estan disenadas para ejecutarse en secuencia. La Fase 2 depende de la Fase 1, la Fase 3 depende de la 2, etc.

5. **Revisar el codigo generado**: Aunque el agente sigue la especificacion, siempre conviene revisar que el codigo cumpla con los contratos definidos.

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
- Docker (para Redis)
- Ollama (con modelos `llama3.1:8b` y `nomic-embed-text` descargados)
- Claude Code (este CLI)

Comandos de preparacion:

```bash
# Descargar modelos de Ollama
ollama pull llama3.1:8b
ollama pull nomic-embed-text

# Levantar Redis
docker run -d -p 6379:6379 redis:7

# Iniciar Ollama
ollama serve
```
