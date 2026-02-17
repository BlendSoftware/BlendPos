# Arquitectura de Software — RAG Multi-Dominio

> Version: 1.0.0
> Fecha: 2026-02-09
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
8. [Patrones de Diseno Aplicados](#8-patrones-de-diseno-aplicados)
9. [Modelo de Datos](#9-modelo-de-datos)
10. [Decisiones Arquitectonicas](#10-decisiones-arquitectonicas)
11. [Infraestructura y Despliegue](#11-infraestructura-y-despliegue)
12. [Seguridad](#12-seguridad)
13. [Observabilidad](#13-observabilidad)
14. [Escalabilidad y Evolucion](#14-escalabilidad-y-evolucion)

---

# 1. Vision Arquitectonica

La arquitectura del sistema RAG Multi-Dominio responde a un conjunto de fuerzas que moldean cada decision estructural. En primer lugar, la necesidad de privacidad absoluta impone que todo el procesamiento, desde la generacion de embeddings hasta la inferencia del modelo de lenguaje, se ejecute de forma local sin dependencia de servicios en la nube. En segundo lugar, la genericidad multi-dominio exige que el nucleo del sistema sea completamente agnostico a cualquier vertical de negocio, delegando toda la especializacion a configuracion declarativa. En tercer lugar, la seguridad del usuario final requiere que el sistema nunca invente informacion, cite siempre sus fuentes y emita advertencias proactivas cuando la naturaleza de la consulta lo demande.

Estas tres fuerzas convergen en una arquitectura que privilegia la separacion estricta de responsabilidades, la configurabilidad sobre la codificacion, y la composicion de componentes independientes conectados por contratos explicitos. El sistema no es un monolito opaco ni un conjunto de microservicios distribuidos; es una aplicacion modular desplegada como un unico proceso backend que orquesta componentes locales a traves de interfaces bien definidas.

---

# 2. Estilo Arquitectonico

El sistema adopta una combinacion de dos estilos arquitectonicos complementarios.

## 2.1 Arquitectura en Capas (Layered Architecture)

La estructura vertical del sistema se organiza en cuatro capas con dependencias unidireccionales estrictas. Cada capa solo conoce a la capa inmediatamente inferior y nunca a la superior.

```
+================================================================+
|                     CAPA DE PRESENTACION                       |
|  React Frontend (Chat + Admin)                                 |
|  Protocolo: HTTP REST + SSE over POST                          |
+================================================================+
                              |
                     fetch / SSE POST
                              |
+================================================================+
|                     CAPA DE API (Gateway)                      |
|  FastAPI: Endpoints REST                                       |
|  Responsabilidad: Validacion de entrada, enrutamiento,         |
|  serializacion de respuesta, manejo de errores HTTP            |
+================================================================+
                              |
                    invocacion directa
                              |
+================================================================+
|                     CAPA DE DOMINIO (Core + RAG)               |
|  Logica de negocio pura:                                       |
|  - Grafo LangGraph (orquestacion RAG)                          |
|  - Chunking semantico                                          |
|  - Politicas de seguridad                                      |
|  - Registro de dominios                                        |
|  - Esquemas canonicos (Pydantic)                               |
+================================================================+
                              |
                    interfaces abstractas
                              |
+================================================================+
|                     CAPA DE INFRAESTRUCTURA                    |
|  Adaptadores a servicios externos:                             |
|  - ChromaDB (almacen vectorial)                                |
|  - Redis (cache + sesiones)                                    |
|  - Ollama (LLM + embeddings)                                   |
+================================================================+
```

La capa de API nunca accede directamente a ChromaDB o Redis; lo hace a traves de la capa de dominio, que a su vez utiliza los adaptadores de infraestructura. Esta regla de dependencia garantiza que un cambio en la tecnologia de almacenamiento vectorial (por ejemplo, migrar de ChromaDB a Qdrant) no afecte a los endpoints ni a la logica de negocio.

## 2.2 Pipes and Filters (Flujo RAG)

El procesamiento de cada consulta sigue el patron de Pipes and Filters, implementado como un grafo dirigido aciclico mediante LangGraph. Cada nodo del grafo es un filtro independiente con una responsabilidad unica, y el estado tipado que fluye entre nodos actua como la tuberia.

```
[Retrieve] --> [Generate] --> [Validate] --> [Format] --> END
     |               |              |              |
     v               v              v              v
  ChromaDB        Ollama LLM     Policies      JSON output
  (similarity     (inference)    (disclaimers,  (answer,
   search)                       triggers)      warnings,
                                                sources)
```

La ventaja de este estilo es que cada filtro puede probarse de forma aislada, y el grafo puede extenderse con nuevos nodos (como RewriteQuery, ReRank o DetectDomain) sin alterar los existentes.

## 2.3 Combinacion Resultante

La arquitectura resultante es un hibrido que utiliza capas para la estructura vertical del sistema y pipes-and-filters para el flujo horizontal de procesamiento de consultas. Las capas gobiernan la organizacion del codigo y las dependencias entre modulos; el grafo gobierna el flujo de datos dentro de cada request.

---

# 3. Vista de Contexto

La vista de contexto muestra el sistema como una caja negra y las entidades externas con las que interactua.

```
                   +-------------------+
                   |  Usuario Final    |
                   |  (Cliente del     |
                   |   restaurante /   |
                   |   peluqueria)     |
                   +--------+----------+
                            |
                   Preguntas en lenguaje natural
                   Respuestas con fuentes y warnings
                            |
                   +--------v----------+
                   |                   |
                   |   RAG Multi-      |
                   |   Dominio         |
                   |   Platform        |
                   |                   |
                   +---+-------+---+---+
                       |       |   |
          +------------+   +---+   +------------+
          |                |                    |
+---------v----+   +-------v------+   +---------v--------+
| Administrador|   | Documentos   |   | Modelos de IA    |
| del Sistema  |   | de Negocio   |   | Locales (Ollama) |
| (carga docs, |   | (PDFs, JSON, |   | llama3.1:8b      |
|  config YAML)|   |  fichas)     |   | nomic-embed-text |
+--------------+   +--------------+   +------------------+
```

**Actores:**

- **Usuario final**: Consume el asistente a traves de la interfaz de chat. Envia preguntas en lenguaje natural y recibe respuestas estructuradas con advertencias y fuentes.
- **Administrador del sistema**: Configura dominios mediante archivos YAML, carga documentos via el panel de administracion y verifica el funcionamiento del asistente.
- **Documentos de negocio**: Fuentes de verdad del dominio (menus PDF, fichas tecnicas JSON, fichas de productos capilares). Constituyen la base de conocimiento.
- **Modelos de IA locales**: Ollama sirve tanto el modelo de lenguaje para generacion de respuestas como el modelo de embeddings para busqueda vectorial. Se ejecutan integramente en el entorno local.

---

# 4. Vista de Contenedores

La vista de contenedores descompone el sistema en sus unidades desplegables independientes y los protocolos de comunicacion entre ellas.

```
+------------------------------------------------------------------+
|                     ENTORNO LOCAL DEL USUARIO                    |
|                                                                  |
|  +-----------------------+     +-----------------------------+   |
|  |    React Frontend     |     |      FastAPI Backend        |   |
|  |    (SPA)              |     |      (API + RAG Engine)     |   |
|  |                       |     |                             |   |
|  |  - Chat UI            | HTTP|  - REST Endpoints           |   |
|  |  - Admin Panel        +----->  - LangGraph Pipeline       |   |
|  |  - SSE Client         | SSE |  - Chunking Engine          |   |
|  |  - Domain Selector    <-----+  - Policy Engine            |   |
|  |                       |     |  - Domain Registry          |   |
|  +-----------------------+     +------+------+------+--------+   |
|                                       |      |      |            |
|                              +--------+  +---+  +---+--------+  |
|                              |           |      |             |  |
|                      +-------v---+ +-----v-+ +--v----------+ |  |
|                      | ChromaDB  | | Redis | | Ollama       | |  |
|                      | (persist) | | 7.x   | | (local LLM) | |  |
|                      | coleccion | | cache  | | llama3.1:8b | |  |
|                      | por       | | sesion | | nomic-embed | |  |
|                      | dominio   | |        | |             | |  |
|                      +-----------+ +--------+ +-------------+ |  |
|                                                                  |
+------------------------------------------------------------------+
```

**Contenedores y responsabilidades:**

| Contenedor | Tecnologia | Responsabilidad | Puerto |
|------------|-----------|-----------------|--------|
| Frontend | React >= 18 | Interfaz de usuario: chat con streaming, panel de administracion, selector de dominio | 5173 (dev) |
| Backend | FastAPI >= 0.110 | API REST, orquestacion RAG, ingesta, validacion, formateo | 8000 |
| ChromaDB | ChromaDB >= 0.5 | Almacenamiento y busqueda vectorial. Una coleccion `kb_{domain_id}` por dominio | Embebido / 8100 |
| Redis | Redis >= 7.0 | Cache de respuestas frecuentes, historial de sesiones de chat, rate-limiting futuro | 6379 |
| Ollama | Ollama latest | Inferencia local de LLM (llama3.1:8b) y generacion de embeddings (nomic-embed-text) | 11434 |

**Protocolos de comunicacion:**

| Origen | Destino | Protocolo | Formato |
|--------|---------|-----------|---------|
| Frontend | Backend | HTTP POST | JSON (REST) |
| Frontend | Backend | HTTP POST + SSE | JSON event stream |
| Backend | ChromaDB | Python SDK | Objetos nativos |
| Backend | Redis | redis-py | Comandos Redis |
| Backend | Ollama | HTTP REST | JSON (API Ollama) |

---

# 5. Vista de Componentes

La vista de componentes descompone el contenedor Backend en sus modulos internos, mostrando las responsabilidades y dependencias de cada uno.

```
+------------------------------------------------------------------+
|                        FastAPI Backend                            |
|                                                                  |
|  +------------------------------------------------------------+  |
|  |                    CAPA API                                 |  |
|  |                                                             |  |
|  |  +-------------+  +---------------+  +-----------------+   |  |
|  |  | chat.py     |  | ingest.py     |  | domains.py      |   |  |
|  |  | POST /v1/   |  | POST /v1/     |  | GET/POST /v1/   |   |  |
|  |  | chat        |  | ingest/json   |  | domains         |   |  |
|  |  +------+------+  | ingest/pdf    |  +--------+--------+   |  |
|  |         |         +-------+-------+           |             |  |
|  |  +------+------+         |                    |             |  |
|  |  | chat_       |         |                    |             |  |
|  |  | stream.py   |         |                    |             |  |
|  |  | POST /v1/   |         |                    |             |  |
|  |  | chat/stream |         |                    |             |  |
|  |  +------+------+         |                    |             |  |
|  +---------|----------------|--------------------|-----------+   |
|            |                |                    |               |
|  +---------|----------------|--------------------|-----------+   |
|  |         v    CAPA CORE + RAG                  v            |  |
|  |                                                             |  |
|  |  +---------------+  +----------------+  +--------------+   |  |
|  |  | graph.py      |  | chunking.py    |  | domain_      |   |  |
|  |  | (LangGraph)   |  | (semantico)    |  | registry.py  |   |  |
|  |  | 4 nodos:      |  |                |  | (carga YAML) |   |  |
|  |  | Retrieve      |  | chunks_from_   |  |              |   |  |
|  |  | Generate      |  |   dish()       |  | load_        |   |  |
|  |  | Validate      |  | chunks_from_   |  |   domains()  |   |  |
|  |  | Format        |  |   hair_prod()  |  |              |   |  |
|  |  +---+----+------+  +--------+-------+  +--------------+   |  |
|  |      |    |                  |                              |  |
|  |      |    |          +-------+--------+                     |  |
|  |      |    |          |                |                     |  |
|  |  +---v--+ +--v----+  +--v---------+  +--v-----------+      |  |
|  |  |retri-| |prompts|  | schemas.py |  | policies.py  |      |  |
|  |  |eval. | |.py    |  | Pydantic:  |  | disclaimers, |      |  |
|  |  |py    | |       |  | Dish       |  | health       |      |  |
|  |  |      | |       |  | Canonical  |  | triggers     |      |  |
|  |  |      | |       |  | HairProd   |  |              |      |  |
|  |  |      | |       |  | Canonical  |  |              |      |  |
|  |  +---+--+ +-------+  +--+----+----+  +--------------+      |  |
|  |      |                   |    |                             |  |
|  |      |         +---------+    |                             |  |
|  |      |         |              |                             |  |
|  |  +---v---------v-+   +-------v----------+                  |  |
|  |  | pdf_menu_     |   | formatters.py    |                  |  |
|  |  | parser.py     |   | (salida JSON)    |                  |  |
|  |  | (heuristico)  |   |                  |                  |  |
|  |  +---------------+   +------------------+                  |  |
|  +------------------------------------------------------------+  |
|            |          |           |                               |
|  +---------|----------|-----------|---------------------------+   |
|  |         v    CAPA INFRAESTRUCTURA                          |  |
|  |                                                             |  |
|  |  +-----------+    +----------+    +------------------+     |  |
|  |  | chroma.py |    | redis.py |    | ollama.py        |     |  |
|  |  | get_      |    | get_     |    | get_llm()        |     |  |
|  |  | chroma_   |    | redis()  |    | get_embeddings() |     |  |
|  |  | client()  |    |          |    |                  |     |  |
|  |  | get_or_   |    |          |    |                  |     |  |
|  |  | create_   |    |          |    |                  |     |  |
|  |  | collection|    |          |    |                  |     |  |
|  |  +-----------+    +----------+    +------------------+     |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

### Inventario de Componentes

| Componente | Capa | Responsabilidad | Dependencias Internas |
|------------|------|-----------------|----------------------|
| `main.py` | API | Entry point FastAPI, registro de routers, startup event | Todos los routers API |
| `settings.py` | Config | Variables de entorno via Pydantic BaseSettings | Ninguna |
| `chat.py` | API | Endpoint POST /v1/chat (sincrono) | graph.py, domain_registry.py, redis.py |
| `chat_stream.py` | API | Endpoint POST /v1/chat/stream (SSE) | retrieval.py, prompts.py, policies.py, ollama.py, domain_registry.py |
| `ingest.py` | API | Endpoints POST /v1/ingest/json y /v1/ingest/pdf | schemas.py, chunking.py, pdf_menu_parser.py, chroma.py, ollama.py |
| `domains.py` | API | Endpoints GET/POST /v1/domains | domain_registry.py |
| `graph.py` | RAG | Grafo LangGraph con 4 nodos y estado tipado RAGState | retrieval.py, prompts.py, policies.py, ollama.py |
| `retrieval.py` | RAG | Busqueda vectorial por similitud con filtros de dominio | chroma.py, ollama.py |
| `prompts.py` | RAG | Construccion del prompt con contexto numerado y metadatos | Ninguna |
| `formatters.py` | RAG | Estructuracion de la respuesta final en formato answer/warnings/sources | Ninguna |
| `domain_registry.py` | Core | Carga de archivos YAML, diccionario global de DomainConfig | Ninguna (solo archivos YAML) |
| `schemas.py` | Core | Modelos Pydantic: DishCanonical, HairProductCanonical y sub-modelos | Ninguna |
| `chunking.py` | Core | Transformacion de estructuras canonicas en fragmentos semanticos | schemas.py |
| `policies.py` | Core | Triggers de salud, generacion de disclaimers, reglas por dominio | Ninguna |
| `pdf_menu_parser.py` | Core | Parser heuristico de PDFs de restaurante por secciones | schemas.py |
| `chroma.py` | Infra | Factory de cliente ChromaDB y gestion de colecciones | settings.py |
| `redis.py` | Infra | Factory de conexion Redis | settings.py |
| `ollama.py` | Infra | Factory de ChatOllama (LLM) y OllamaEmbeddings | settings.py |

---

# 6. Vista de Codigo

La vista de codigo detalla las estructuras de datos principales, las interfaces clave y la organizacion interna de los modulos mas criticos.

## 6.1 Estado del Grafo RAG (RAGState)

El estado tipado que fluye entre los nodos del grafo LangGraph es la estructura central del procesamiento de consultas.

```
RAGState (TypedDict)
+---------------------------------------------------+
| domain_id    : str            # Dominio activo     |
| question     : str            # Pregunta del user  |
| top_k        : int            # Fragments a buscar |
| context      : list[dict]     # Chunks recuperados |
|   -> text    : str                                 |
|   -> metadata: dict                                |
|   -> distance: float                               |
| draft        : str            # Respuesta borrador |
| warnings     : list[str]      # Advertencias       |
| sources      : list[dict]     # Fuentes citadas    |
|   -> source  : str                                 |
|   -> chunk_id: str                                 |
|   -> chunk_type: str                               |
| final        : dict           # Respuesta final    |
|   -> answer  : str                                 |
|   -> warnings: list[str]                           |
|   -> sources : list[dict]                          |
+---------------------------------------------------+
```

## 6.2 DomainConfig (Modelo de Configuracion)

Estructura resultante de cargar un archivo YAML de dominio.

```
DomainConfig
+---------------------------------------------------+
| domain_id          : str                           |
| display_name       : str                           |
| tone               : str                           |
| policies:                                          |
|   must_disclaimer_on_health : bool                 |
|   must_cite_sources         : bool                 |
|   do_not_invent             : bool                 |
|   cross_contamination_always_if_present : bool     |
| retrieval:                                         |
|   top_k : int                                      |
| system_prompt      : str                           |
| output_format      : str                           |
+---------------------------------------------------+
```

## 6.3 Esquemas Canonicos (Jerarquia Pydantic)

```
DishCanonical
  +-- domain_id: Literal["restaurant"]
  +-- dish_id: str
  +-- name: str
  +-- category: str
  +-- tags: list[str]
  +-- short_description: str | None
  +-- menu_description: str | None
  +-- ingredients: list[str]
  +-- allergens: list[DishAllergen]
  |     +-- name: str
  |     +-- severity: Literal["info", "warning", "critical"]
  |     +-- notes: str | None
  +-- cross_contamination: DishCrossContamination | None
  |     +-- statement: str
  |     +-- traces_possible: list[str]
  |     +-- kitchen_notes: str | None
  +-- nutrition: dict | None
  +-- notes: list[str]
  +-- sources: list[str]

HairProductCanonical
  +-- domain_id: Literal["hair_salon"]
  +-- product_id: str
  +-- name: str
  +-- product_type: str
  +-- tags: list[str]
  +-- description: str | None
  +-- usage: str | None
  +-- chemicals: list[HairChemical]
  |     +-- inci_name: str
  |     +-- common_name: str | None
  |     +-- role: str | None
  |     +-- notes: str | None
  +-- contraindications: list[HairContraindication]
  |     +-- condition: str
  |     +-- guidance: str
  |     +-- evidence: str | None
  +-- notes: list[str]
  +-- sources: list[str]
```

## 6.4 Chunk (Unidad de Conocimiento)

```
Chunk (dict producido por chunking.py)
+---------------------------------------------------+
| text       : str       # Contenido textual         |
| metadata   : dict                                  |
|   domain_id  : str     # Dominio de origen         |
|   dish_id |                                        |
|   product_id : str     # ID del item canonico      |
|   name       : str     # Nombre del item           |
|   chunk_type : str     # description, ingredients,  |
|                        # allergens, cross_contam.,  |
|                        # chemicals, contraind., etc |
|   source     : str     # Documento de origen        |
|   chunk_id   : str     # ID unico (source:index)   |
+---------------------------------------------------+
```

---

# 7. Flujos de Datos

## 7.1 Flujo de Ingesta (JSON)

Este flujo transforma un documento JSON estructurado en fragmentos semanticos indexados en el almacen vectorial.

```
Administrador
     |
     | POST /v1/ingest/json
     | { domain_id, dish_id, name, ingredients, allergens, ... }
     v
+-----------+     +----------------+     +---------------+
| API:      |     | Core:          |     | Core:         |
| ingest.py | --> | schemas.py     | --> | chunking.py   |
| Validar   |     | Pydantic       |     | Fragmentar    |
| domain_id |     | DishCanonical  |     | por estructura|
+-----------+     | .model_validate|     | semantica     |
                  +----------------+     +-------+-------+
                                                 |
                                    Lista de Chunks con
                                    texto + metadata
                                                 |
                                         +-------v-------+
                                         | Infra:        |
                                         | ollama.py     |
                                         | Generar       |
                                         | embeddings    |
                                         +-------+-------+
                                                 |
                                            Vectores
                                                 |
                                         +-------v-------+
                                         | Infra:        |
                                         | chroma.py     |
                                         | Upsert en     |
                                         | kb_{domain_id}|
                                         +---------------+
```

## 7.2 Flujo de Ingesta (PDF)

```
Administrador
     |
     | POST /v1/ingest/pdf (multipart/form-data)
     | domain_id + archivo.pdf
     v
+-----------+     +------------------+
| API:      |     | pypdf            |
| ingest.py | --> | Extraer texto    |
| Validar   |     | plano del PDF    |
| domain_id |     +--------+---------+
| y tipo    |              |
+-----------+              v
                  +------------------+
                  | domain_id ==     |
                  | "restaurant"?    |
                  +---+---------+----+
                      |         |
                     SI        NO
                      |         |
                      v         v
               +----------+  +-----------+
               | Core:    |  | Chunk     |
               | pdf_menu |  | unico     |
               | _parser  |  | tipo      |
               | .py      |  | "raw_pdf" |
               +----+-----+  +-----+-----+
                    |               |
                    v               |
               +----------+        |
               | Lista de |        |
               | Dish     |        |
               | Canonical|        |
               +----+-----+        |
                    |               |
                    v               v
               +-------------------------+
               | Core: chunking.py       |
               | Generar chunks          |
               | semanticos              |
               +------------+------------+
                            |
                            v
               +-------------------------+
               | Infra: ollama.py        |
               | Generar embeddings      |
               +------------+------------+
                            |
                            v
               +-------------------------+
               | Infra: chroma.py        |
               | Upsert en coleccion     |
               +-------------------------+
```

## 7.3 Flujo de Consulta RAG (Sincrono)

```
Usuario Final
     |
     | POST /v1/chat
     | { domain_id, session_id, message }
     v
+-----------+     +---------------------+
| API:      |     | Core:               |
| chat.py   | --> | domain_registry.py  |
| Validar   |     | Cargar DomainConfig |
+-----------+     +---------+-----------+
                            |
                            v
                  +---------------------+
                  | RAG: graph.py       |
                  | Compilar y ejecutar |
                  | grafo LangGraph     |
                  +---------+-----------+
                            |
              +-------------+-------------+
              |                           |
              v                           |
     +-----------------+                  |
     | NODO: Retrieve  |                  |
     | retrieval.py    |                  |
     | similarity_     |                  |
     | search en       |                  |
     | ChromaDB        |                  |
     | (kb_{domain_id})|                  |
     +--------+--------+                  |
              |                           |
         context[]                        |
              |                           |
              v                           |
     +-----------------+                  |
     | NODO: Generate  |                  |
     | prompts.py +    |                  |
     | ollama.py       |                  |
     | Construir prompt|                  |
     | con contexto +  |                  |
     | system_prompt   |                  |
     | Invocar LLM     |                  |
     +--------+--------+                  |
              |                           |
           draft                          |
              |                           |
              v                           |
     +-----------------+                  |
     | NODO: Validate  |                  |
     | policies.py     |                  |
     | Verificar:      |                  |
     | - contexto vacio|                  |
     | - cross_contam. |                  |
     | - triggers salud|                  |
     | Agregar warnings|                  |
     +--------+--------+                  |
              |                           |
         warnings[]                       |
              |                           |
              v                           |
     +-----------------+                  |
     | NODO: Format    |                  |
     | formatters.py   |                  |
     | Estructurar:    |                  |
     | { answer,       |                  |
     |   warnings,     |                  |
     |   sources }     |                  |
     +--------+--------+                  |
              |                           |
              +---------------------------+
              |
              v
     +-----------------+     +-----------+
     | API: chat.py    |     | Infra:    |
     | Retornar JSON   | --> | redis.py  |
     | al usuario      |     | Guardar   |
     |                 |     | sesion    |
     +-----------------+     +-----------+
```

## 7.4 Flujo de Consulta RAG (Streaming SSE)

El flujo de streaming difiere del sincrono en que no ejecuta el grafo como unidad atomica. En su lugar, el endpoint orquesta los pasos manualmente para poder emitir eventos SSE en cada etapa.

```
Usuario Final
     |
     | POST /v1/chat/stream
     | { domain_id, message }
     v
+-------------------+
| API:              |
| chat_stream.py    |
| StreamingResponse |
| (text/event-      |
|  stream)          |
+--------+----------+
         |
         |  1. Cargar DomainConfig
         |     -> emit: event: meta { domain_id }
         |
         |  2. Ejecutar similarity_search
         |     -> emit: event: sources { sources[] }
         |
         |  3. Evaluar politicas de seguridad
         |     -> emit: event: warnings { warnings[] }  (si aplica)
         |
         |  4. Construir prompt completo
         |     -> emit: event: start { ok: true }
         |
         |  5. Invocar LLM con streaming
         |     -> emit: event: token { t }  (N veces)
         |
         |  6. Finalizar
         |     -> emit: event: done { ok: true }
         |
         v
      Conexion SSE cerrada
```

**Orden garantizado de eventos SSE:**

```
meta --> sources --> warnings? --> start --> token* --> done | error
```

La clave de este diseno es que sources y warnings se emiten ANTES de los tokens de respuesta. Esto permite que el frontend renderice las fuentes y advertencias inmediatamente, mientras la respuesta del LLM se va generando token por token.

---

# 8. Patrones de Diseno Aplicados

## 8.1 Registry Pattern (Registro de Dominios)

El componente `domain_registry.py` implementa un registro global que carga las configuraciones de dominio desde archivos YAML al iniciar la aplicacion. Cada componente del sistema consulta este registro para obtener la configuracion del dominio activo, evitando la dispersion de parametros de configuracion.

```
           YAML Files                     Registro Global
  +---------------------+           +------------------------+
  | restaurant.yaml     |           | DOMAINS: dict          |
  | hair_salon.yaml     |  --load-> |   "restaurant" -> cfg  |
  | (futuro dominio...) |           |   "hair_salon" -> cfg  |
  +---------------------+           +------------------------+
                                              ^
                                    consultan |
                                    todos los |
                                    modulos   |
```

**Ventaja**: Agregar un nuevo dominio consiste unicamente en crear un archivo YAML. No se modifica codigo fuente.

## 8.2 Strategy Pattern (Chunking Semantico)

El motor de chunking aplica una estrategia de fragmentacion diferente segun el tipo de estructura canonica. La funcion de chunking se selecciona dinamicamente en funcion del `domain_id`:

- `domain_id == "restaurant"` -> `chunks_from_dish(DishCanonical)`
- `domain_id == "hair_salon"` -> `chunks_from_hair_product(HairProductCanonical)`

Cada estrategia conoce la estructura interna de su modelo canonico y sabe como generar fragmentos atomicos con los metadatos correctos.

## 8.3 Pipeline Pattern (Grafo LangGraph)

El procesamiento de consultas sigue un pipeline de cuatro etapas con estado compartido. Cada nodo del grafo es una funcion pura que recibe el estado, lo transforma y lo retorna. LangGraph se encarga de la orquestacion, la gestion del estado y la secuenciacion.

## 8.4 Factory Pattern (Clientes de Infraestructura)

Los modulos de infraestructura (`chroma.py`, `redis.py`, `ollama.py`) exponen funciones factory (`get_chroma_client()`, `get_redis()`, `get_llm()`, `get_embeddings()`) que encapsulan la creacion y configuracion de los clientes. Esto permite:

- Centralizar la configuracion de conexion.
- Facilitar el testing mediante inyeccion de mocks.
- Cambiar la implementacion del cliente sin afectar al codigo consumidor.

## 8.5 Adapter Pattern (Capa de Infraestructura)

La capa de infraestructura completa actua como un conjunto de adaptadores que traducen las interfaces internas del sistema a las APIs especificas de los servicios externos. Si se decidiera migrar de ChromaDB a Qdrant, solo se modificaria `chroma.py` sin tocar ningun modulo de la capa de dominio.

## 8.6 Observer Pattern (SSE Streaming)

El endpoint de streaming utiliza un patron de observador simplificado donde el cliente (frontend) se suscribe a un flujo de eventos y reacciona a cada tipo de evento (meta, sources, warnings, token, done, error) mediante callbacks tipados. El servidor emite eventos a medida que se producen, sin esperar una solicitud por cada uno.

---

# 9. Modelo de Datos

## 9.1 ChromaDB — Almacen Vectorial

ChromaDB organiza los datos en colecciones. Cada dominio tiene una coleccion independiente con el nombre `kb_{domain_id}`.

```
+--------------------------------------------------------------------+
|  Coleccion: kb_restaurant                                          |
+--------------------------------------------------------------------+
| id          | document (texto)              | metadata              |
|-------------|-------------------------------|-----------------------|
| menu:0      | "Trucha grillada servida con  | domain_id: restaurant |
|             |  crema suave de nabo..."      | dish_id: trucha_grill |
|             |                               | name: Trucha grillada |
|             |                               | chunk_type: descript. |
|             |                               | source: menu_2026.pdf |
|             |                               | chunk_id: menu:0     |
|-------------|-------------------------------|-----------------------|
| menu:1      | "Ingredientes: trucha, crema  | chunk_type: ingredien |
|             |  de leche, nabo, naranja..."  | ...                   |
|-------------|-------------------------------|-----------------------|
| menu:2      | "Alergenos: pescado (critical)| chunk_type: allergens |
|             |  lacteos (warning)"           | ...                   |
|-------------|-------------------------------|-----------------------|
| menu:3      | "Contaminacion cruzada: Se    | chunk_type: cross_con |
|             |  elabora en cocina con gluten"| ...                   |
+--------------------------------------------------------------------+

+--------------------------------------------------------------------+
|  Coleccion: kb_hair_salon                                          |
+--------------------------------------------------------------------+
| id          | document (texto)              | metadata              |
|-------------|-------------------------------|-----------------------|
| ficha:0     | "Shampoo de limpieza suave    | domain_id: hair_salon |
|             |  para uso diario."            | product_id: shampoo_01|
|             |                               | chunk_type: descript. |
|-------------|-------------------------------|-----------------------|
| ficha:1     | "Quimicos/INCI: Aqua, Sodium  | chunk_type: chemicals |
|             |  Laureth Sulfate, ..."        | ...                   |
+--------------------------------------------------------------------+
```

**Invariantes del modelo vectorial:**
- El `id` es unico dentro de cada coleccion y sigue el formato `{source}:{index}`.
- Cada documento tiene un vector de embedding generado por `nomic-embed-text`.
- Los metadatos siempre incluyen `domain_id`, `chunk_type`, `source` y `chunk_id`.
- La operacion de escritura es siempre `upsert`, lo que garantiza idempotencia.

## 9.2 Redis — Cache y Sesiones

```
+--------------------------------------------------------------------+
|  ESTRUCTURA DE CLAVES REDIS                                        |
+--------------------------------------------------------------------+
|                                                                    |
|  Sesiones de Chat:                                                 |
|  Patron: chat:{domain_id}:{session_id}                             |
|  Tipo:   List (LPUSH + LTRIM 10)                                   |
|  Valor:  Ultimas 10 preguntas del usuario (strings)                |
|  TTL:    Sin expiracion en MVP                                     |
|                                                                    |
|  Ejemplo:                                                          |
|  chat:restaurant:mesa_12 = [                                       |
|    "Este plato es apto para celiacos?",                            |
|    "Que ingredientes tiene la trucha?",                            |
|    "Tienen postres sin lacteos?"                                   |
|  ]                                                                 |
|                                                                    |
+--------------------------------------------------------------------+
|                                                                    |
|  Cache de Respuestas (Futuro):                                     |
|  Patron: cache:{domain_id}:{hash(question)}                       |
|  Tipo:   String (JSON serializado)                                 |
|  Valor:  { answer, warnings, sources }                             |
|  TTL:    Configurable por dominio                                  |
|                                                                    |
+--------------------------------------------------------------------+
```

## 9.3 Sistema de Archivos — Configuracion YAML

```
backend/app/data/domains/
  |
  +-- restaurant.yaml
  |     domain_id: "restaurant"
  |     display_name: "IA-Mozo"
  |     tone: "cordial, claro, profesional"
  |     policies: { must_disclaimer_on_health: true, ... }
  |     retrieval: { top_k: 6 }
  |     system_prompt: "Sos un asistente virtual..."
  |
  +-- hair_salon.yaml
        domain_id: "hair_salon"
        display_name: "Asistente Peluqueria"
        tone: "amable, tecnico, prudente"
        policies: { must_disclaimer_on_health: true, ... }
        retrieval: { top_k: 6 }
        system_prompt: "Sos un asistente de peluqueria..."
```

---

# 10. Decisiones Arquitectonicas

Cada decision arquitectonica se documenta con su contexto, opciones evaluadas, decision tomada y justificacion.

## ADR-01: Ejecucion 100% local con Ollama

**Contexto**: El sistema maneja datos potencialmente sensibles (fichas medicas de alergenos, composicion quimica de productos). Los clientes objetivo valoran la privacidad y la independencia de servicios en la nube.

**Opciones evaluadas**:
1. API de OpenAI o Anthropic (nube) — Mayor calidad de respuesta, dependencia de terceros, datos salen del entorno local, costo por token.
2. Ollama local — Privacidad total, sin costo por uso, latencia predecible, calidad inferior pero suficiente para el caso de uso.
3. Hibrido (local por defecto, nube opcional) — Complejidad adicional, confusa para el MVP.

**Decision**: Ollama local como unica opcion para el MVP.

**Justificacion**: La privacidad es un invariante del sistema. Los datos de alergenos y composiciones quimicas no deben salir del entorno del cliente. La calidad de `llama3.1:8b` es adecuada para respuestas basadas en contexto donde el modelo no necesita inventar sino reformular informacion provista.

**Consecuencias**: El servidor debe tener suficiente RAM/VRAM para ejecutar el modelo. La calidad de la respuesta dependera de la calidad del contexto recuperado, no de la potencia del modelo.

---

## ADR-02: ChromaDB como almacen vectorial

**Contexto**: El sistema necesita un almacen vectorial para indexar y buscar fragmentos de texto por similitud semantica.

**Opciones evaluadas**:
1. ChromaDB — Embebible, sin servidor separado, API sencilla, persistencia local.
2. Qdrant — Mas features (filtrado avanzado, gRPC), requiere servidor separado.
3. FAISS — Alto rendimiento, sin persistencia nativa, API de bajo nivel.
4. pgvector — Requiere PostgreSQL, mas complejo de desplegar localmente.

**Decision**: ChromaDB embebido con persistencia local.

**Justificacion**: Para el MVP, la simplicidad de despliegue es prioritaria. ChromaDB se embebe en el proceso Python sin necesidad de un servidor separado, soporta persistencia en disco y filtrado por metadatos. El volumen de datos esperado (cientos a miles de fragmentos) esta dentro de su rango optimo de rendimiento.

**Consecuencias**: Si el volumen crece significativamente (decenas de miles de fragmentos o multiples instancias concurrentes), se debera migrar a un almacen vectorial dedicado como Qdrant. La capa de adaptadores facilita esta migracion.

---

## ADR-03: Chunking semantico sobre chunking por tamano

**Contexto**: Los documentos del dominio tienen estructura interna rica (ingredientes, alergenos, contraindicaciones, etc.). La calidad de la recuperacion impacta directamente en la calidad de la respuesta.

**Opciones evaluadas**:
1. Chunking por tamano fijo (500, 1000 caracteres) — Simple, generico, pierde contexto semantico.
2. Chunking por estructura semantica — Complejo pero preciso, genera fragmentos con significado atomico completo.
3. Chunking por oraciones/parrafos — Intermedio, no aprovecha la estructura del dominio.

**Decision**: Chunking semantico por campo de la estructura canonica.

**Justificacion**: Un fragmento que contiene exactamente la lista de alergenos de un plato es infinitamente mas util para responder "es apto para celiacos?" que un fragmento de 500 caracteres que podria cortar la lista por la mitad. Los metadatos de `chunk_type` permiten que el motor de politicas identifique la presencia de informacion de contaminacion cruzada sin analizar el texto.

**Consecuencias**: Cada nuevo dominio requiere definir su estructura canonica y su estrategia de chunking. El esfuerzo adicional se compensa con una mejora sustancial en la relevancia de las respuestas.

---

## ADR-04: Configuracion declarativa via YAML

**Contexto**: El sistema debe soportar multiples dominios sin modificar codigo fuente.

**Opciones evaluadas**:
1. YAML por archivo — Simple, versionable en git, legible por humanos.
2. Base de datos relacional — Permite UI de administracion completa, mas complejo.
3. Variables de entorno — Insuficiente para la complejidad de la configuracion de un dominio.
4. JSON — Menos legible que YAML para textos multilinea (system_prompt).

**Decision**: Un archivo YAML por dominio, cargado al inicio del backend.

**Justificacion**: YAML soporta textos multilinea de forma natural (esencial para system_prompt), es legible y editable sin herramientas especiales, y se versiona facilmente en un repositorio git. El endpoint POST /v1/domains permite crear dominios dinamicamente para el futuro.

**Consecuencias**: Los cambios de configuracion requieren reiniciar el backend (aceptable para MVP). El endpoint POST /v1/domains puede eventualmente persistir la configuracion en Redis o disco para hot-reload.

---

## ADR-05: SSE sobre POST en lugar de WebSocket

**Contexto**: El frontend necesita recibir tokens de respuesta en tiempo real mientras el modelo genera la respuesta.

**Opciones evaluadas**:
1. WebSocket — Bidireccional, complejo de implementar y mantener, requiere gestion de conexion persistente.
2. SSE nativo (EventSource API) — Simple pero solo soporta GET (no puede enviar body JSON).
3. SSE sobre POST (fetch + ReadableStream) — Soporta body JSON, streaming unidireccional, compatible con la API de fetch moderna.

**Decision**: SSE sobre POST usando `fetch()` con `ReadableStream` en el frontend y `StreamingResponse` en FastAPI.

**Justificacion**: La comunicacion es estrictamente unidireccional (servidor a cliente) durante la generacion de una respuesta. SSE sobre POST permite enviar el payload de la pregunta como JSON mientras se recibe la respuesta como stream. No se necesita la bidireccionalidad de WebSocket. La implementacion es mas simple y robusta.

**Consecuencias**: El cliente no puede usar la API nativa `EventSource` y debe parsear los eventos SSE manualmente. Esto se resuelve con un modulo dedicado (`api.ts`) que encapsula la logica de parsing.

---

## ADR-06: LangGraph para orquestacion del flujo RAG

**Contexto**: El flujo RAG tiene una secuencia de pasos con estado compartido que debe propagarse entre ellos.

**Opciones evaluadas**:
1. Funciones encadenadas manualmente — Simple pero fragil, dificil de extender, no ofrece observabilidad del flujo.
2. LangGraph — Grafo dirigido con estado tipado, extensible, ofrece trazabilidad por nodo.
3. LangChain LCEL — Funcional pero menos expresivo para flujos con logica condicional.

**Decision**: LangGraph con estado tipado `RAGState` y cuatro nodos fijos.

**Justificacion**: LangGraph permite modelar el flujo como un grafo explicito donde cada nodo es una funcion aislada. El estado tipado (`TypedDict`) garantiza que cada nodo recibe y produce los campos esperados. La extension futura con nodos como `RewriteQuery` o `ReRank` se reduce a agregar un nodo y una arista al grafo sin modificar los nodos existentes.

**Consecuencias**: LangGraph introduce una dependencia adicional. La curva de aprendizaje es moderada pero la flexibilidad para evolucionar el pipeline lo justifica.

---

## ADR-07: Redis para sesiones y cache, no para vector store

**Contexto**: Redis puede funcionar como almacen vectorial (Redis Stack con modulo de busqueda vectorial), como cache y como almacen de sesiones.

**Opciones evaluadas**:
1. Redis solo para cache + sesiones, ChromaDB para vectores — Cada herramienta en su fortaleza.
2. Redis para todo (vectores + cache + sesiones) — Menos componentes, mas carga sobre Redis.

**Decision**: Redis exclusivamente para cache y sesiones. ChromaDB para vectores.

**Justificacion**: ChromaDB esta optimizado para busqueda vectorial con filtrado por metadatos, que es el caso de uso central del sistema. Redis se usa donde brilla: almacenamiento en memoria de acceso rapido para sesiones efimeras y cache de respuestas. Separar responsabilidades evita que un pico de consultas vectoriales degrade la latencia del cache de sesiones.

---

## ADR-08: Pydantic como unica capa de validacion

**Contexto**: Los datos entran al sistema desde multiples origenes: JSON via API, texto extraido de PDFs, configuracion YAML. Cada origen requiere validacion.

**Decision**: Pydantic BaseModel como barrera de validacion en todos los puntos de entrada de datos.

**Justificacion**: Pydantic provee validacion declarativa, serializacion automatica, mensajes de error descriptivos y tipado estatico. FastAPI lo integra nativamente para la validacion de request bodies. Los esquemas canonicos (`DishCanonical`, `HairProductCanonical`) actuan como contratos que garantizan la integridad de los datos antes de que lleguen al motor de chunking.

---

# 11. Infraestructura y Despliegue

## 11.1 Topologia de Despliegue MVP

```
+--------------------------------------------------------------------+
|                    MAQUINA LOCAL                                    |
|                                                                    |
|  +----------------------+                                          |
|  | Terminal 1           |                                          |
|  | $ docker run         |                                          |
|  |   -p 6379:6379       |    +---------------------------------+   |
|  |   redis:7            |--->| Redis Container                 |   |
|  +----------------------+    | Puerto: 6379                    |   |
|                              +---------------------------------+   |
|                                                                    |
|  +----------------------+                                          |
|  | Terminal 2           |                                          |
|  | $ ollama serve       |    +---------------------------------+   |
|  |                      |--->| Ollama Daemon                   |   |
|  +----------------------+    | Puerto: 11434                   |   |
|                              | Modelos:                        |   |
|                              |   llama3.1:8b (~4.7 GB)        |   |
|                              |   nomic-embed-text (~274 MB)   |   |
|                              +---------------------------------+   |
|                                                                    |
|  +----------------------+                                          |
|  | Terminal 3           |    +---------------------------------+   |
|  | $ cd backend         |--->| FastAPI (uvicorn)               |   |
|  | $ uvicorn            |    | Puerto: 8000                    |   |
|  |   app.main:app       |    | ChromaDB embebido               |   |
|  |   --reload           |    | (persistencia: ./chroma_data/)  |   |
|  |   --port 8000        |    +---------------------------------+   |
|  +----------------------+                                          |
|                                                                    |
|  +----------------------+                                          |
|  | Terminal 4           |    +---------------------------------+   |
|  | $ cd frontend        |--->| Vite Dev Server (React)         |   |
|  | $ npm run dev        |    | Puerto: 5173                    |   |
|  +----------------------+    +---------------------------------+   |
|                                                                    |
+--------------------------------------------------------------------+
```

## 11.2 Requisitos de Hardware (MVP)

| Recurso | Minimo | Recomendado | Notas |
|---------|--------|-------------|-------|
| RAM | 8 GB | 16 GB | llama3.1:8b consume ~5 GB |
| CPU | 4 cores | 8 cores | La inferencia sin GPU es viable pero lenta |
| GPU | No requerida | NVIDIA con >= 6 GB VRAM | Acelera drasticamente la inferencia |
| Disco | 10 GB libres | 20 GB libres | Modelos + datos ChromaDB + Redis |

## 11.3 Variables de Entorno

```
APP_NAME=RAG Multi-domain MVP
CHROMA_PATH=./chroma_data
REDIS_URL=redis://localhost:6379/0
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_LLM_MODEL=llama3.1:8b
OLLAMA_EMBED_MODEL=nomic-embed-text
```

## 11.4 Evolucion del Despliegue (Post-MVP)

Para una fase posterior al MVP, se propone la containerizacion completa con Docker Compose:

```yaml
# docker-compose.yml (propuesta post-MVP)
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - REDIS_URL=redis://redis:6379/0
      - OLLAMA_BASE_URL=http://ollama:11434
    depends_on: [redis, ollama]
    volumes:
      - chroma_data:/app/chroma_data
      - ./backend/app/data:/app/data

  frontend:
    build: ./frontend
    ports: ["80:80"]
    depends_on: [backend]

  redis:
    image: redis:7
    ports: ["6379:6379"]

  ollama:
    image: ollama/ollama
    ports: ["11434:11434"]
    volumes:
      - ollama_models:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

volumes:
  chroma_data:
  ollama_models:
```

---

# 12. Seguridad

## 12.1 Modelo de Amenazas

La arquitectura del sistema identifica las siguientes superficies de ataque y las mitigaciones correspondientes.

```
+--------------------------------------------------------------------+
|  SUPERFICIE DE ATAQUE          | MITIGACION                        |
+--------------------------------------------------------------------+
|                                |                                    |
|  Inyeccion de prompt           |  El sistema responde SOLO con      |
|  (usuario intenta manipular    |  informacion del contexto. El      |
|  al LLM para inventar datos)   |  system_prompt refuerza esta       |
|                                |  restriccion. El nodo Validate     |
|                                |  verifica la presencia de fuentes. |
|                                |                                    |
|  Upload de archivos maliciosos |  Validacion de tipo MIME para PDF. |
|  (PDF con payload, XSS)        |  pypdf extrae solo texto plano.    |
|                                |  No se ejecuta JavaScript del PDF. |
|                                |                                    |
|  Abuso de API (DoS, spam)      |  Rate-limiting via Redis (futuro). |
|                                |  MVP: sin autenticacion.           |
|                                |                                    |
|  Acceso no autorizado a datos  |  ChromaDB con colecciones aisladas |
|  de otro dominio               |  por domain_id. Cada consulta      |
|                                |  filtra por dominio explicito.     |
|                                |                                    |
|  Fuga de datos sensibles       |  Ejecucion 100% local. Ningun     |
|  (alergenos, quimicos)         |  dato sale del entorno. Sin        |
|                                |  telemetria externa.               |
|                                |                                    |
+--------------------------------------------------------------------+
```

## 12.2 Aislamiento de Dominios

Cada dominio opera con su propio espacio de datos y configuracion. El aislamiento se implementa en tres niveles:

1. **ChromaDB**: Colecciones independientes (`kb_restaurant`, `kb_hair_salon`). Una busqueda vectorial solo opera dentro de la coleccion del dominio solicitado.
2. **Redis**: Claves con prefijo `chat:{domain_id}:`. No hay cruce de sesiones entre dominios.
3. **Configuracion**: Cada DomainConfig tiene su propio system_prompt, politicas y parametros de recuperacion.

## 12.3 Politicas de Seguridad de Contenido

Las politicas de seguridad constituyen un componente arquitectonico de primer orden, no un complemento. Se implementan como un nodo obligatorio del grafo (Validate) que se ejecuta siempre, sin excepcion.

```
Pregunta del usuario
        |
        v
+------------------+
| Deteccion de     |
| triggers de      |      HEALTH_TRIGGERS:
| salud            |      alerg, celiac, intoler, embaraz,
| (policies.py)    |      asma, dermat, urtic, anafil,
+--------+---------+      hipert, diabet
         |
    SI   |   NO
    |    |    |
    v    |    v
+-------+|  (sin disclaimer)
|Agregar ||
|disclaim||
|er del  ||
|dominio ||
+--------+|
         |
         v
+------------------+
| Verificacion de  |
| cross_contam.    |      Solo restaurant:
| en contexto      |      Si hay chunks tipo
| (policies.py)    |      "cross_contamination"
+--------+---------+      -> warning obligatorio
         |
         v
+------------------+
| Verificacion de  |
| contexto vacio   |      Si context == [] ->
| (policies.py)    |      warning "sin fuentes"
+--------+---------+
         |
         v
   warnings[] (unique, order preserved)
```

---

# 13. Observabilidad

## 13.1 Estrategia de Trazabilidad

Cada request genera un `trace_id` unico que se propaga a traves de todo el pipeline de procesamiento. Esto permite reconstruir el camino completo de una consulta: desde el endpoint de entrada, pasando por los nodos del grafo, hasta la respuesta final.

```
trace_id: "req_abc123"
  |
  +-- [API] POST /v1/chat  domain=restaurant  session=mesa_12
  +-- [RETRIEVE] query="celiacos"  top_k=6  results=4  time=120ms
  +-- [GENERATE] prompt_tokens=850  response_tokens=95  time=3200ms
  +-- [VALIDATE] warnings_added=2  triggers=["celiac"]  time=5ms
  +-- [FORMAT] sources=3  time=1ms
  +-- [RESPONSE] total_time=3326ms  status=200
```

## 13.2 Logging Estructurado

El sistema utiliza logging estructurado en formato JSON para facilitar la agregacion y busqueda de logs.

```json
{
  "timestamp": "2026-02-09T14:30:00Z",
  "level": "INFO",
  "trace_id": "req_abc123",
  "component": "rag.retrieval",
  "event": "similarity_search_complete",
  "domain_id": "restaurant",
  "query_length": 35,
  "results_count": 4,
  "duration_ms": 120
}
```

## 13.3 Health Check

El endpoint `GET /health` verifica la conectividad con todos los servicios externos y reporta el estado de cada uno.

```json
{
  "ok": true,
  "services": {
    "chromadb": "connected",
    "redis": "connected",
    "ollama": "connected",
    "ollama_models": {
      "llama3.1:8b": "available",
      "nomic-embed-text": "available"
    }
  },
  "domains_loaded": 2,
  "version": "1.0.0"
}
```

---

# 14. Escalabilidad y Evolucion

## 14.1 Vectores de Crecimiento

La arquitectura esta disenada para evolucionar a lo largo de cuatro ejes principales sin requerir cambios estructurales.

### Eje 1: Nuevos Dominios

Agregar un dominio nuevo no requiere modificar codigo. Se crea un archivo YAML con la configuracion, se define el esquema canonico Pydantic (si es un nuevo tipo de entidad), se implementa la funcion de chunking correspondiente y se cargan los documentos. El nucleo del sistema permanece intacto.

```
Esfuerzo por nuevo dominio:
  1. restaurant.yaml        -> 0 lineas de codigo
  2. HairProductCanonical   -> ~30 lineas (nuevo esquema)
  3. chunks_from_hair_prod  -> ~25 lineas (nueva estrategia de chunking)
  4. Documentos del dominio -> 0 lineas de codigo
  Total: ~55 lineas para un dominio completamente nuevo
```

### Eje 2: Extension del Grafo RAG

El grafo de LangGraph puede crecer con nuevos nodos sin alterar los existentes.

```
Grafo MVP:
  RETRIEVE -> GENERATE -> VALIDATE -> FORMAT

Grafo evolucionado (ejemplo):
  REWRITE_QUERY -> RETRIEVE -> RERANK -> GENERATE -> VALIDATE -> FORMAT
        ^                                                  |
        +-- DETECT_DOMAIN (si domain_id no viene) --------+
```

Nodos futuros candidatos:
- **RewriteQuery**: Mejora la formulacion de la consulta antes de la busqueda vectorial.
- **ReRank**: Reordena los fragmentos recuperados usando un modelo de reranking.
- **DetectDomain**: Infiere el dominio cuando el frontend no lo especifica.
- **CacheCheck**: Consulta Redis antes de ejecutar el grafo completo.

### Eje 3: Mejora de la Calidad de Respuesta

Sin cambios arquitectonicos, se puede mejorar la calidad mediante:
- Modelos mas potentes en Ollama (llama3.1:70b, mistral, etc.).
- Modelos de embedding mas especializados.
- Parsers de PDF especializados para cada dominio.
- Enriquecimiento de metadatos en los chunks.

### Eje 4: Escalamiento Horizontal

La arquitectura actual es de un solo proceso. Para escalar horizontalmente:

```
Fase 1 (MVP):
  1 backend + ChromaDB embebido + 1 Redis + 1 Ollama

Fase 2 (Multi-instancia):
  N backends (stateless) + ChromaDB servidor + Redis cluster + Ollama con GPU

Fase 3 (Produccion):
  N backends + Qdrant (cluster) + Redis Sentinel + Ollama pool + Load Balancer
```

La transicion entre fases se facilita porque:
- El backend es stateless (sesiones en Redis, vectores en ChromaDB).
- Los adaptadores de infraestructura encapsulan los clientes.
- Las colecciones de ChromaDB son independientes por dominio.

## 14.2 Limitaciones Conocidas del MVP

| Limitacion | Impacto | Mitigacion Post-MVP |
|------------|---------|---------------------|
| Sin autenticacion | Cualquiera puede ingestar documentos o hacer consultas | JWT o API keys |
| Sin rate-limiting | Posible abuso | Redis-based rate limiter |
| ChromaDB embebido | Un solo proceso puede acceder a los datos | Migrar a ChromaDB server o Qdrant |
| Sin OCR | PDFs escaneados no se procesan | Integrar Tesseract o servicio OCR |
| Cache manual | No se cachean respuestas automaticamente | Implementar nodo CacheCheck en el grafo |
| Sin multi-idioma | Solo espanol | Parametro `language` en DomainConfig |
| TTL de sesion indefinido | Acumulacion de datos en Redis | TTL configurable por dominio |

## 14.3 Mapa de Dependencias Tecnologicas

```
                    +-------------------+
                    |   Python >= 3.11  |
                    +---------+---------+
                              |
              +---------------+---------------+
              |               |               |
     +--------v------+  +----v-----+  +------v------+
     | FastAPI       |  | Pydantic |  | LangChain   |
     | >= 0.110      |  | >= 2.6   |  | >= 0.2      |
     |               |  |          |  |             |
     | uvicorn       |  | Settings |  | ChatOllama  |
     | httpx         |  | BaseModel|  | Ollama      |
     | python-       |  |          |  | Embeddings  |
     |  multipart    |  +----------+  +------+------+
     +---------------+                       |
                                      +------v------+
                                      | LangGraph   |
                                      | >= 0.2      |
                                      |             |
                                      | StateGraph  |
                                      | TypedDict   |
                                      +-------------+

     +---------------+  +----------+  +-------------+
     | chromadb      |  | redis    |  | pypdf       |
     | >= 0.5        |  | (redis-py)|  | >= 4.0      |
     |               |  | >= 5.0   |  |             |
     | Client()      |  |          |  | PdfReader() |
     | Collection    |  | Redis()  |  |             |
     +---------------+  +----------+  +-------------+

     +-------------------+
     | React >= 18       |
     | TypeScript         |
     | Vite               |
     | fetch API          |
     | ReadableStream     |
     +-------------------+
```

---

# Apendice: Resumen de la Arquitectura

## Principios Rectores

1. **Privacidad por diseno**: Todo se ejecuta localmente. Ningun dato abandona el entorno.
2. **Configuracion sobre codificacion**: Nuevos dominios se crean con YAML, no con codigo.
3. **Separacion estricta de capas**: API -> Dominio -> Infraestructura, sin saltos.
4. **Contratos explicitos**: Pydantic valida en las fronteras. El grafo usa estado tipado. La API retorna siempre `{answer, warnings, sources}`.
5. **Extensibilidad del grafo**: Nuevos nodos se agregan sin modificar los existentes.
6. **Seguridad como componente de primer orden**: Las politicas son un nodo obligatorio del pipeline, no un middleware opcional.
7. **Calidad por datos, no por algoritmo**: El chunking semantico con metadatos ricos produce mejores resultados que optimizaciones algoritmicas sobre datos mal estructurados.

## Contrato de Comunicacion Frontend-Backend

```
Request:  POST /v1/chat
          { domain_id, session_id, message }

Response: { answer: string,
            warnings: string[],
            sources: { source, chunk_id, chunk_type }[] }

Stream:   POST /v1/chat/stream
          SSE: meta -> sources -> warnings? -> start -> token* -> done|error
```

Este contrato es invariante. Todo componente del sistema, desde el chunking hasta el frontend, se disena para producir o consumir esta estructura.
