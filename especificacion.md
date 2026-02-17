# Especificacion Formal — RAG Multi-Dominio

> Documento Spec-Driven Development (SDD)
> Version: 1.0.0
> Fecha: 2026-02-09
> Estado: Draft para revision

---

## Indice

1. [Constitucion del Proyecto](#1-constitucion-del-proyecto)
2. [Especificacion Funcional](#2-especificacion-funcional)
3. [Plan Tecnico y Arquitectura](#3-plan-tecnico-y-arquitectura)
4. [Tareas de Implementacion](#4-tareas-de-implementacion)

---

# 1. Constitucion del Proyecto

> Principios inmutables que rigen todas las decisiones de diseno e implementacion.
> Este bloque funciona como contexto persistente para cualquier agente IA o desarrollador humano.

## 1.1 Identidad del Sistema

- **Nombre**: RAG Multi-Dominio
- **Tipo**: Plataforma de asistencia inteligente basada en Retrieval-Augmented Generation
- **Proposito**: Responder preguntas de usuarios finales utilizando exclusivamente informacion verificada de documentos internos, citando fuentes y emitiendo advertencias de seguridad cuando corresponda
- **Alcance MVP**: Un dominio funcional (restaurante / IA-Mozo), clonable a peluqueria sin modificar codigo

## 1.2 Stack Tecnologico (Inmutable para el MVP)

| Capa | Tecnologia | Version Minima | Rol |
|------|-----------|----------------|-----|
| API | FastAPI | >= 0.110 | Backend REST + SSE streaming |
| Orquestacion LLM | LangChain | >= 0.2 | Interaccion con modelo de lenguaje y embeddings |
| Grafo de flujo | LangGraph | >= 0.2 | Control de flujo RAG con estado tipado |
| Vector store | ChromaDB | >= 0.5 | Almacenamiento y busqueda vectorial |
| Cache / Sesion | Redis | >= 5.0 | Historial de chat, cache de respuestas |
| LLM local | Ollama | latest | Inferencia local (llama3.1:8b) |
| Embeddings | Ollama | latest | Embeddings locales (nomic-embed-text) |
| Validacion | Pydantic | >= 2.6 | Esquemas canonicos y validacion de datos |
| Frontend | React | >= 18 | Interfaz de chat + admin |
| PDF parsing | pypdf | >= 4.0 | Extraccion de texto de PDFs |

## 1.3 Principios de Diseno (Invariantes)

1. **Ejecucion 100% local**: Ningun dato del usuario ni contenido de documentos sale del entorno local. Ollama provee LLM y embeddings sin conexion a la nube.
2. **Nucleo agnostico al dominio**: El codigo fuente no contiene logica especifica de ningun dominio. Toda variacion se resuelve por configuracion declarativa (YAML).
3. **No inventar**: El sistema jamas genera informacion que no este presente en los fragmentos recuperados. Ante falta de evidencia, lo declara explicitamente.
4. **Citar siempre**: Toda respuesta incluye las fuentes de las que proviene la informacion.
5. **Advertir proactivamente**: Si la consulta involucra salud, alergenos o contraindicaciones, el sistema agrega disclaimers obligatorios sin que el usuario lo solicite.
6. **Chunking semantico, no por tamano**: Los documentos se fragmentan por estructura conceptual (ingredientes, alergenos, contraindicaciones), nunca por cantidad fija de caracteres.
7. **Salida estructurada**: Toda respuesta es un contrato JSON con tres campos: `answer`, `warnings`, `sources`.
8. **Dominio explicito**: El `domain_id` siempre viene del frontend. El sistema nunca lo infiere ni lo adivina.

## 1.4 Reglas de Seguridad (Invariantes)

- El sistema NO brinda consejo medico concluyente bajo ningun dominio.
- Si existen datos de contaminacion cruzada para un plato, se muestran SIEMPRE, independientemente de la pregunta.
- Las palabras clave de salud (`alerg`, `celiac`, `intoler`, `embaraz`, `asma`, `dermat`, `urtic`, `anafil`, `hipert`, `diabet`) disparan un disclaimer obligatorio.
- El disclaimer es especifico por dominio: restaurante recomienda consultar al personal; peluqueria recomienda consultar a un profesional.

## 1.5 Estructura de Directorios (Convencion)

```
rag-multidomain-mvp/
  backend/
    pyproject.toml
    app/
      main.py                    # Entry point FastAPI
      settings.py                # Configuracion (env vars)
      api/
        chat.py                  # POST /v1/chat
        chat_stream.py           # POST /v1/chat/stream (SSE)
        ingest.py                # POST /v1/ingest/pdf, /v1/ingest/json
        domains.py               # GET/POST /v1/domains
      core/
        domain_registry.py       # Carga YAML -> DomainConfig
        chunking.py              # Canonico -> chunks semanticos
        schemas.py               # Pydantic: DishCanonical, HairProductCanonical
        policies.py              # Disclaimers y triggers de salud
        pdf_menu_parser.py       # PDF -> DishCanonical (heuristico)
      infra/
        chroma.py                # Cliente ChromaDB
        redis.py                 # Cliente Redis
        ollama.py                # LLM + Embeddings via Ollama
      rag/
        graph.py                 # LangGraph: Retrieve -> Generate -> Validate -> Format
        retrieval.py             # Busqueda vectorial con filtros
        prompts.py               # Construccion de prompts
        formatters.py            # Formateo de salida
      data/
        domains/
          restaurant.yaml        # Config dominio restaurante
          hair_salon.yaml        # Config dominio peluqueria
  frontend/
    package.json
    src/
      api.ts                     # Cliente SSE over POST
      App.tsx
      pages/
        ChatPage.tsx
      components/
        Chat.tsx                 # Interfaz de chat con streaming
        SourcesPanel.tsx         # Panel de fuentes citadas
        WarningsPanel.tsx        # Panel de advertencias
```

---

# 2. Especificacion Funcional

> Cada feature se define como una User Story con criterios de aceptacion en formato Given/When/Then,
> contratos de entrada/salida, reglas de negocio, casos de borde y escenarios de error.

---

## Feature 01: Registro y Carga de Dominios

### User Story

**Como** administrador del sistema,
**quiero** definir dominios mediante archivos YAML declarativos,
**para que** cada dominio tenga su propio prompt, politicas y parametros de recuperacion sin modificar codigo.

### Contrato de Datos — DomainConfig

```yaml
# Esquema obligatorio de cada archivo YAML de dominio
domain_id: string            # Identificador unico (snake_case). Ej: "restaurant", "hair_salon"
display_name: string         # Nombre visible en UI. Ej: "IA-Mozo"
tone: string                 # Tono de respuesta. Ej: "cordial, claro, profesional"
policies:
  must_disclaimer_on_health: bool    # Disclaimer obligatorio ante triggers de salud
  must_cite_sources: bool            # Citar fuentes en cada respuesta
  do_not_invent: bool                # Prohibir generacion sin evidencia
  cross_contamination_always_if_present: bool  # Mostrar contaminacion cruzada siempre (restaurant)
retrieval:
  top_k: int                 # Cantidad de fragmentos a recuperar (default: 6)
system_prompt: string        # Prompt de sistema completo (multilinea)
output_format: string        # Formato de salida. Valor fijo: "answer_warnings_sources"
```

### Criterios de Aceptacion

**Escenario: Carga exitosa de dominio al iniciar el backend**
- Given: existe el archivo `backend/app/data/domains/restaurant.yaml` con todos los campos obligatorios
- When: el backend inicia con `uvicorn app.main:app`
- Then: el dominio "restaurant" esta disponible en el registro interno `DOMAINS`
- And: `GET /v1/domains` retorna `[{"domain_id": "restaurant", "display_name": "IA-Mozo"}]`

**Escenario: Multiples dominios cargados simultaneamente**
- Given: existen los archivos `restaurant.yaml` y `hair_salon.yaml` en el directorio de dominios
- When: el backend inicia
- Then: `GET /v1/domains` retorna ambos dominios
- And: cada uno tiene su propia configuracion independiente

**Escenario: Archivo YAML malformado**
- Given: un archivo YAML con campo `domain_id` faltante
- When: el backend intenta cargar los dominios
- Then: el sistema lanza un error descriptivo al inicio y no registra ese dominio
- And: los demas dominios validos se cargan normalmente

### Endpoint — GET /v1/domains

```
GET /v1/domains

Response 200:
[
  { "domain_id": "restaurant", "display_name": "IA-Mozo" },
  { "domain_id": "hair_salon", "display_name": "Asistente Peluqueria" }
]
```

### Endpoint — POST /v1/domains

```
POST /v1/domains
Content-Type: application/json

Request:
{
  "domain_id": "restaurant",
  "display_name": "IA-Mozo",
  "system_prompt": "Sos un asistente virtual de un restaurante...",
  "policies": { "must_disclaimer_on_health": true, ... },
  "retrieval": { "top_k": 6 }
}

Response 200:
{ "ok": true, "domain_id": "restaurant" }

Response 400:
{ "detail": "domain_id requerido" }
```

---

## Feature 02: Ingesta de Documentos JSON (Canonico)

### User Story

**Como** administrador del sistema,
**quiero** ingestar documentos en formato JSON con estructura canonica,
**para que** se generen fragmentos semanticos con metadatos ricos indexados en el vector store.

### Precondiciones

- El dominio referenciado por `domain_id` debe existir en el registro.
- El payload JSON debe ser valido contra el esquema Pydantic del dominio correspondiente.

### Contrato de Datos — DishCanonical (Restaurant)

```json
{
  "domain_id": "restaurant",
  "dish_id": "string (slug unico)",
  "name": "string",
  "category": "string (default: 'main')",
  "tags": ["string"],
  "short_description": "string | null",
  "menu_description": "string | null",
  "ingredients": ["string"],
  "allergens": [
    {
      "name": "string",
      "severity": "info | warning | critical",
      "notes": "string | null"
    }
  ],
  "cross_contamination": {
    "statement": "string",
    "traces_possible": ["string"],
    "kitchen_notes": "string | null"
  } | null,
  "nutrition": {} | null,
  "notes": ["string"],
  "sources": ["string"]
}
```

### Contrato de Datos — HairProductCanonical (Peluqueria)

```json
{
  "domain_id": "hair_salon",
  "product_id": "string (slug unico)",
  "name": "string",
  "product_type": "string (shampoo | acondicionador | keratina | tintura | ...)",
  "tags": ["string"],
  "description": "string | null",
  "usage": "string | null",
  "chemicals": [
    {
      "inci_name": "string",
      "common_name": "string | null",
      "role": "string | null",
      "notes": "string | null"
    }
  ],
  "contraindications": [
    {
      "condition": "string",
      "guidance": "string",
      "evidence": "string | null"
    }
  ],
  "notes": ["string"],
  "sources": ["string"]
}
```

### Reglas de Chunking Semantico

El sistema transforma cada estructura canonica en fragmentos independientes. Cada fragmento es una unidad atomica de conocimiento con texto y metadatos.

**Para DishCanonical, se generan los siguientes chunks (si el campo tiene valor):**

| Condicion | chunk_type | Texto generado |
|-----------|-----------|----------------|
| `menu_description` presente | `description` | Valor literal del campo |
| `ingredients` no vacio | `ingredients` | `"Ingredientes: {lista separada por comas}"` |
| `allergens` no vacio | `allergens` | `"Alergenos: {nombre (severidad); ...}"` |
| `cross_contamination` presente | `cross_contamination` | `"Contaminacion cruzada: {statement} \| Trazas posibles: {lista}"` |
| Por cada item en `notes` | `notes` | `"Nota: {texto}"` |

**Para HairProductCanonical, se generan los siguientes chunks (si el campo tiene valor):**

| Condicion | chunk_type | Texto generado |
|-----------|-----------|----------------|
| `description` presente | `description` | Valor literal del campo |
| `usage` presente | `usage` | `"Uso: {texto}"` |
| `chemicals` no vacio | `chemicals` | `"Quimicos/INCI: {inci_name; ...}"` |
| Por cada item en `contraindications` | `contraindications` | `"Contraindicacion: {condition}. Guia: {guidance}."` |
| Por cada item en `notes` | `notes` | `"Nota: {texto}"` |

**Metadatos obligatorios de cada chunk:**

```json
{
  "domain_id": "string",
  "dish_id | product_id": "string",
  "name": "string",
  "chunk_type": "string",
  "source": "string",
  "chunk_id": "string (source:index)"
}
```

### Endpoint — POST /v1/ingest/json

```
POST /v1/ingest/json
Content-Type: application/json

Request (restaurant):
{
  "domain_id": "restaurant",
  "dish_id": "trucha_grillada",
  "name": "Trucha grillada con crema de nabo",
  ...
}

Response 200:
{ "ok": true, "domain_id": "restaurant", "chunks": 5 }

Response 400 (domain_id invalido):
{ "detail": "domain_id invalido: unknown_domain" }

Response 422 (schema validation):
{ "detail": [ { "loc": ["name"], "msg": "field required", "type": "value_error.missing" } ] }
```

### Criterios de Aceptacion

**Escenario: Ingesta JSON exitosa de un plato**
- Given: el dominio "restaurant" esta registrado
- And: se envia un JSON valido con `dish_id: "trucha_grillada"`, 3 ingredientes, 2 alergenos y 1 cross_contamination
- When: se invoca `POST /v1/ingest/json`
- Then: la respuesta es `200` con `"chunks": 5` (description + ingredients + allergens + cross_contamination + note)
- And: en ChromaDB, la coleccion `kb_restaurant` contiene 5 documentos con metadata `dish_id=trucha_grillada`

**Escenario: Reingesta del mismo plato actualiza sin duplicar**
- Given: el plato "trucha_grillada" ya fue ingestado con 5 chunks
- When: se reingesta el mismo plato con ingredientes modificados
- Then: los chunks se actualizan (upsert) y el total sigue siendo 5 (no 10)

**Escenario: Ingesta de producto de peluqueria**
- Given: el dominio "hair_salon" esta registrado
- When: se envia un JSON valido con `product_id: "shampoo_suave_01"`, 4 chemicals y 2 contraindications
- Then: la respuesta es `200` con el conteo correcto de chunks generados

**Escenario: domain_id inexistente**
- Given: no existe el dominio "farmacia" en el registro
- When: se envia un JSON con `domain_id: "farmacia"`
- Then: la respuesta es `400` con mensaje `"domain_id invalido: farmacia"`

---

## Feature 03: Ingesta de Documentos PDF

### User Story

**Como** administrador del sistema,
**quiero** subir archivos PDF para que se extraiga el texto, se parsee en estructuras canonicas y se generen fragmentos semanticos,
**para que** el asistente pueda responder preguntas basadas en documentos originales como menus o fichas tecnicas.

### Precondiciones

- El archivo debe ser de tipo `application/pdf`.
- El PDF debe contener texto extraible (no es un PDF de imagen/escaneo).

### Flujo de Procesamiento

```
PDF upload
    |
    v
Extraer texto (pypdf)
    |
    v
domain_id == "restaurant"?
    |--- SI --> Parser heuristico por secciones
    |              |
    |              v
    |           Lista de DishCanonical
    |              |
    |              v
    |           Chunks semanticos por plato
    |
    |--- NO --> Chunk unico tipo "raw_pdf"
    |
    v
Generar embeddings (Ollama nomic-embed-text)
    |
    v
Upsert en ChromaDB (coleccion kb_{domain_id})
```

### Parser Heuristico de PDF para Restaurant

**Separacion de registros:**
1. Intentar dividir por separadores `---` en el texto
2. Si no hay separadores, dividir por apariciones de `PLATO:` o `NOMBRE:`

**Encabezados reconocidos por registro:**

| Patron regex | Campo mapeado |
|-------------|---------------|
| `^(PLATO\|NOMBRE)\s*:\s*(.+)$` | `name` |
| `^(DESCRIPCION)\s*:\s*(.+)$` | `menu_description` |
| `^(INGREDIENTES)\s*:\s*(.+)$` | `ingredients` (split por coma/punto y coma) |
| `^(ALERGENOS)\s*:\s*(.+)$` | `allergens` (con deteccion de severidad entre parentesis) |
| `^(CONTAMINACION CRUZADA)\s*:\s*(.+)$` | `cross_contamination` |
| `^(NOTAS?)\s*:\s*(.+)$` | `notes` |
| `^(CATEGORIA)\s*:\s*(.+)$` | `category` |
| `^(TAGS?)\s*:\s*(.+)$` | `tags` |

**Reglas del parser:**
- Las lineas que no coinciden con ningun encabezado se concatenan al ultimo encabezado detectado (soporte multilinea).
- Si no se detecta `PLATO:`, la primera linea del registro se usa como nombre.
- El `dish_id` se genera como slug del nombre: minusculas, sin caracteres especiales, guiones en lugar de espacios.
- Registros sin nombre se descartan silenciosamente.

### Endpoint — POST /v1/ingest/pdf

```
POST /v1/ingest/pdf
Content-Type: multipart/form-data

Fields:
  domain_id: "restaurant"
  file: menu_2026.pdf

Response 200 (modo canonico):
{ "ok": true, "domain_id": "restaurant", "dishes": 12, "chunks": 47, "mode": "canonical" }

Response 200 (modo raw):
{ "ok": true, "domain_id": "hair_salon", "chunks": 1, "mode": "raw_pdf" }

Response 400 (no es PDF):
{ "detail": "file debe ser PDF" }

Response 400 (PDF sin texto):
{ "detail": "No se pudo extraer texto del PDF (o esta vacio)." }
```

### Criterios de Aceptacion

**Escenario: PDF de restaurante con fichas estructuradas**
- Given: un PDF con 3 platos separados por `---`, cada uno con PLATO, INGREDIENTES, ALERGENOS
- When: se invoca `POST /v1/ingest/pdf` con `domain_id=restaurant`
- Then: la respuesta indica `"dishes": 3` y `"mode": "canonical"`
- And: cada plato genera chunks semanticos individuales en ChromaDB

**Escenario: PDF de peluqueria (sin parser especializado)**
- Given: un PDF con fichas tecnicas de productos capilares
- When: se invoca `POST /v1/ingest/pdf` con `domain_id=hair_salon`
- Then: la respuesta indica `"chunks": 1` y `"mode": "raw_pdf"`
- And: todo el texto se almacena como un unico chunk con `chunk_type=raw_pdf`

**Escenario: PDF sin texto extraible**
- Given: un PDF que es imagen escaneada sin OCR
- When: se invoca `POST /v1/ingest/pdf`
- Then: la respuesta es `400` con mensaje indicando que no se pudo extraer texto

**Escenario: Archivo no es PDF**
- Given: se envia un archivo .docx en lugar de PDF
- When: se invoca `POST /v1/ingest/pdf`
- Then: la respuesta es `400` con mensaje `"file debe ser PDF"`

---

## Feature 04: Chat con Respuesta Completa (Sincrono)

### User Story

**Como** usuario final del asistente,
**quiero** enviar una pregunta en lenguaje natural y recibir una respuesta basada en fuentes internas con advertencias de seguridad,
**para que** pueda tomar decisiones informadas sobre platos, ingredientes, alergenos o productos.

### Precondiciones

- El dominio solicitado debe existir en el registro.
- El campo `message` no debe estar vacio.
- Debe haber al menos una coleccion con documentos ingestados para el dominio.

### Flujo de Procesamiento (Grafo LangGraph)

```
Estado inicial:
{
  domain_id: string,
  question: string,
  top_k: int,
  context: [],
  draft: "",
  warnings: [],
  sources: [],
  final: {}
}

Nodo 1: RETRIEVE
  Input:  state.domain_id, state.question, state.top_k
  Accion: similarity_search en ChromaDB (coleccion kb_{domain_id})
  Output: state.context = lista de {text, metadata, distance}

Nodo 2: GENERATE
  Input:  state.context, state.question, DomainConfig.system_prompt
  Accion: Construir prompt con contexto numerado + pregunta.
          Invocar LLM (Ollama) con el prompt completo.
  Output: state.draft = texto de respuesta del LLM

Nodo 3: VALIDATE
  Input:  state.domain_id, state.question, state.context, state.draft
  Accion:
    - Si context esta vacio -> agregar warning "No se encontraron fuentes relevantes"
    - Si domain_id == "restaurant" Y algun chunk tiene chunk_type == "cross_contamination"
      -> agregar warning de contaminacion cruzada
    - Si la pregunta contiene triggers de salud -> agregar disclaimer del dominio
  Output: state.warnings = lista de strings (unique, order preserved)

Nodo 4: FORMAT
  Input:  state.draft, state.warnings, state.context
  Accion: Extraer sources de los metadatos del contexto (max 10)
  Output: state.final = { answer, warnings, sources }

Grafo: RETRIEVE -> GENERATE -> VALIDATE -> FORMAT -> END
```

### Contrato del Prompt

```
System (prepended):
  {DomainConfig.system_prompt}

User:
  Contexto (fuentes internas):

  [1] {chunk.text}
  META={chunk.metadata}

  [2] {chunk.text}
  META={chunk.metadata}

  ...

  Pregunta del cliente:
  {message}

  Instrucciones:
  - Responde SOLO con base en el Contexto.
  - Si el Contexto no alcanza, deci "No tengo esa informacion en las fuentes disponibles".
  - Inclui advertencias si corresponde.
  - Al final lista las fuentes usadas (source + chunk_id).
```

### Endpoint — POST /v1/chat

```
POST /v1/chat
Content-Type: application/json

Request:
{
  "domain_id": "restaurant",
  "session_id": "mesa_12",
  "message": "Este plato es apto para celiacos?"
}

Response 200:
{
  "answer": "La trucha grillada no es apta para celiacos. Se elabora en una cocina donde se manipula gluten.",
  "warnings": [
    "Atencion: hay informacion de contaminacion cruzada en las fuentes.",
    "Si tenes alergias o condiciones medicas, confirma con el personal del local antes de consumir."
  ],
  "sources": [
    {
      "source": "menu_2026.pdf",
      "chunk_id": "menu_2026.pdf:3",
      "chunk_type": "cross_contamination"
    },
    {
      "source": "menu_2026.pdf",
      "chunk_id": "menu_2026.pdf:2",
      "chunk_type": "allergens"
    }
  ]
}

Response 400 (domain invalido):
{ "detail": "domain_id invalido: unknown" }

Response 400 (sin mensaje):
{ "detail": "message requerido" }
```

### Gestion de Sesion (Redis)

- Clave Redis: `chat:{domain_id}:{session_id}`
- Almacena: ultimas 10 preguntas del usuario (LPUSH + LTRIM)
- Proposito MVP: contexto conversacional basico (no se usa para RAG aun, pero queda disponible)

### Criterios de Aceptacion

**Escenario: Pregunta sobre alergenos con evidencia disponible**
- Given: el plato "trucha_grillada" esta ingestado con chunks de allergens y cross_contamination
- And: el dominio es "restaurant"
- When: el usuario pregunta "Este plato es apto para celiacos?"
- Then: la respuesta incluye informacion de los chunks de allergens y cross_contamination
- And: `warnings` contiene el disclaimer de contaminacion cruzada
- And: `warnings` contiene el disclaimer de salud (trigger: "celiac")
- And: `sources` lista los chunks utilizados

**Escenario: Pregunta sin evidencia disponible**
- Given: no hay documentos ingestados para el dominio "restaurant"
- When: el usuario pregunta "Que ingredientes tiene la milanesa?"
- Then: `answer` indica que no tiene informacion disponible
- And: `warnings` contiene "No se encontraron fuentes internas relevantes"

**Escenario: Pregunta sin triggers de salud**
- Given: hay documentos ingestados sobre el plato
- When: el usuario pregunta "Cual es la descripcion de la trucha grillada?"
- Then: `answer` contiene la descripcion del plato
- And: `warnings` esta vacio (no hay triggers de salud en la pregunta)
- And: `sources` lista los chunks utilizados

**Escenario: Almacenamiento de sesion**
- Given: el usuario envia 3 preguntas consecutivas con `session_id=mesa_12`
- When: se consulta Redis con clave `chat:restaurant:mesa_12`
- Then: las 3 preguntas estan almacenadas en orden inverso (LIFO)

---

## Feature 05: Chat con Streaming SSE

### User Story

**Como** usuario final del asistente,
**quiero** ver la respuesta generandose token por token en tiempo real,
**para que** la experiencia sea fluida y perciba rapidez incluso con modelos locales.

### Precondiciones

- Mismas que Feature 04.
- El cliente debe soportar lectura de `ReadableStream` (fetch API moderna).

### Protocolo SSE

El endpoint retorna un stream `text/event-stream` con los siguientes tipos de evento en orden garantizado:

```
1. event: meta
   data: {"domain_id": "restaurant"}

2. event: sources
   data: {"sources": [{source, chunk_id, chunk_type}, ...]}

3. event: warnings  (solo si hay warnings)
   data: {"warnings": ["string", ...]}

4. event: start
   data: {"ok": true}

5. event: token  (N veces, uno por token generado)
   data: {"t": "La"}

6. event: done
   data: {"ok": true}

-- En caso de error en cualquier punto: --
   event: error
   data: {"message": "descripcion del error"}
```

**Invariante de orden**: `meta` -> `sources` -> `warnings` (opcional) -> `start` -> `token`* -> `done | error`.

Sources y warnings se emiten ANTES de los tokens para que el frontend pueda renderizarlos inmediatamente mientras la respuesta se genera.

### Endpoint — POST /v1/chat/stream

```
POST /v1/chat/stream
Content-Type: application/json

Request:
{
  "domain_id": "restaurant",
  "message": "Que ingredientes tiene la trucha grillada?"
}

Response:
  Status: 200
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
  X-Accel-Buffering: no

  event: meta
  data: {"domain_id": "restaurant"}

  event: sources
  data: {"sources": [{"source": "menu_2026.pdf", "chunk_id": "menu_2026.pdf:1", "chunk_type": "ingredients"}]}

  event: start
  data: {"ok": true}

  event: token
  data: {"t": "La"}

  event: token
  data: {"t": " trucha"}

  ...

  event: done
  data: {"ok": true}
```

### Criterios de Aceptacion

**Escenario: Streaming completo exitoso**
- Given: el dominio "restaurant" tiene documentos ingestados
- When: el usuario envia una pregunta via `POST /v1/chat/stream`
- Then: se recibe el evento `meta` primero
- And: se recibe el evento `sources` con al menos una fuente
- And: se recibe el evento `start`
- And: se reciben multiples eventos `token` con fragmentos de texto
- And: la concatenacion de todos los tokens forma una respuesta coherente
- And: se recibe el evento `done` al final

**Escenario: Pregunta con warnings de salud via streaming**
- Given: la pregunta contiene el termino "alergico"
- When: se envia via streaming
- Then: se recibe el evento `warnings` con el disclaimer ANTES de los tokens

**Escenario: Error durante generacion**
- Given: Ollama no esta disponible
- When: se envia una pregunta via streaming
- Then: se recibe un evento `error` con mensaje descriptivo
- And: no se recibe el evento `done`

---

## Feature 06: Politicas de Seguridad y Validacion

### User Story

**Como** operador del sistema,
**quiero** que el asistente aplique automaticamente reglas de seguridad por dominio,
**para que** nunca se generen respuestas que puedan poner en riesgo la salud de un usuario.

### Triggers de Salud (Postcondicion Global)

```python
HEALTH_TRIGGERS = [
    "alerg", "celiac", "intoler", "embaraz", "asma",
    "dermat", "urtic", "anafil", "hipert", "diabet"
]
```

**Regla**: si `any(trigger in question.lower() for trigger in HEALTH_TRIGGERS)` es verdadero, se agrega un disclaimer obligatorio a `warnings`.

### Disclaimers por Dominio

| domain_id | Disclaimer |
|-----------|-----------|
| `restaurant` | "Si tenes alergias o condiciones medicas, confirma con el personal del local antes de consumir." |
| `hair_salon` | "Si tenes condiciones del cuero cabelludo o dudas de salud, consulta con un profesional antes de usar el producto." |
| (cualquier otro) | "Consulta con un profesional ante dudas de salud." |

### Reglas Especificas por Dominio

**Restaurant:**
- Si algun chunk en el contexto tiene `chunk_type == "cross_contamination"`, agregar warning: "Atencion: hay informacion de contaminacion cruzada en las fuentes."
- Esta regla se aplica SIEMPRE que el chunk exista, independientemente de la pregunta.

**Hair Salon:**
- (MVP: sin reglas adicionales especificas. Se aplican solo los triggers de salud genericos.)

### Regla de Contexto Vacio

- Si `context` esta vacio (no se recuperaron chunks), agregar warning: "No se encontraron fuentes internas relevantes para responder con certeza."

### Postcondicion de Unicidad

- La lista `warnings` no contiene duplicados. Se preserva el orden de insercion.

### Criterios de Aceptacion

**Escenario: Trigger de salud activa disclaimer**
- Given: el usuario pregunta "Puedo comer esto si soy alergico al pescado?"
- When: se procesa en el nodo Validate
- Then: `warnings` contiene el disclaimer correspondiente al dominio

**Escenario: Contaminacion cruzada forzada en restaurant**
- Given: el contexto recuperado incluye un chunk con `chunk_type=cross_contamination`
- And: el usuario pregunta simplemente "Contame sobre la trucha grillada"
- When: se procesa en el nodo Validate
- Then: `warnings` contiene la advertencia de contaminacion cruzada
- And: esto ocurre aunque la pregunta NO contenga triggers de salud

**Escenario: Pregunta sin triggers ni contaminacion**
- Given: el contexto no tiene chunks de cross_contamination
- And: la pregunta es "Cual es el postre del dia?"
- When: se procesa en el nodo Validate
- Then: `warnings` esta vacio

---

## Feature 07: Frontend — Chat con Streaming

### User Story

**Como** usuario final,
**quiero** una interfaz de chat donde vea la respuesta escribiendose en tiempo real, con advertencias visibles y fuentes consultables,
**para que** la experiencia sea clara, confiable y profesional.

### Componentes de UI

**Chat.tsx — Componente principal**

| Elemento | Descripcion | Comportamiento |
|----------|------------|----------------|
| Selector de dominio | `<select>` con opciones cargadas de `/v1/domains` | Cambia el `domain_id` de las requests |
| Campo de texto | Input de pregunta | Habilitado cuando no esta en streaming |
| Boton enviar | Dispara la peticion al backend | Se deshabilita durante streaming. Muestra "..." mientras transmite |
| Area de respuesta | Div con `white-space: pre-wrap` | Se actualiza token por token durante streaming |
| Panel de advertencias | Lista de warnings en bloque destacado | Se muestra ANTES que la respuesta (llega primero por SSE) |
| Panel de fuentes | Lista de sources con source, chunk_type y chunk_id | Se muestra debajo de la respuesta |

### Maquina de Estados del Chat

```
IDLE
  |-- usuario escribe y presiona Enviar
  v
STREAMING
  |-- recibe evento "meta" -> renderiza metadata
  |-- recibe evento "sources" -> renderiza panel de fuentes
  |-- recibe evento "warnings" -> renderiza panel de advertencias
  |-- recibe evento "token" -> concatena al area de respuesta
  |-- recibe evento "done" -> transicion a IDLE
  |-- recibe evento "error" -> muestra error en warnings, transicion a IDLE
  v
IDLE
```

### Cliente SSE (api.ts)

**Invariantes de implementacion:**
- Usa `fetch()` con `method: POST` y `body: JSON.stringify(payload)` (no EventSource nativo, que solo soporta GET).
- Lee el `ReadableStream` del response body con un `TextDecoder`.
- Parsea eventos SSE manualmente: split por `\n\n`, extrae `event:` y `data:` de cada bloque.
- Expone callbacks tipados: `onMeta`, `onSources`, `onWarnings`, `onToken`, `onDone`, `onError`.

### Criterios de Aceptacion

**Escenario: Flujo completo de chat con streaming**
- Given: el frontend esta cargado y conectado al backend
- When: el usuario selecciona "IA-Mozo", escribe "Tiene lacteos la trucha?" y presiona Enviar
- Then: el boton se deshabilita y muestra "..."
- And: aparece el panel de fuentes (evento sources)
- And: aparece el panel de advertencias si corresponde (evento warnings)
- And: la respuesta se escribe token por token en el area de respuesta
- And: al completarse (evento done), el boton vuelve a "Enviar"

**Escenario: Error de conexion**
- Given: el backend no esta disponible
- When: el usuario envia una pregunta
- Then: el panel de advertencias muestra "Error: HTTP 0" o el mensaje correspondiente
- And: el boton vuelve a "Enviar"

---

## Feature 08: Frontend — Panel de Administracion

### User Story

**Como** administrador del sistema,
**quiero** una interfaz web donde pueda subir documentos PDF o JSON para ingesta y verificar el estado del proceso,
**para que** pueda gestionar la base de conocimiento sin necesidad de usar herramientas de linea de comandos.

### Funcionalidades

| Funcionalidad | Descripcion |
|---------------|------------|
| Subir PDF | Formulario con selector de `domain_id` y campo de archivo. Invoca `POST /v1/ingest/pdf` |
| Subir JSON | Formulario con selector de `domain_id` y area de texto para pegar JSON. Invoca `POST /v1/ingest/json` |
| Estado de ingesta | Muestra la respuesta del endpoint (cantidad de chunks, modo, errores) |
| Smoke test | Campo de texto para probar una pregunta rapida contra un dominio y verificar que responde |

### Criterios de Aceptacion

**Escenario: Subir PDF exitosamente**
- Given: el admin accede al panel de administracion
- When: selecciona dominio "restaurant", elige un archivo PDF y presiona "Subir"
- Then: se muestra el resultado con cantidad de platos detectados y chunks generados

**Escenario: Probar pregunta rapida**
- Given: hay documentos ingestados para "restaurant"
- When: el admin escribe una pregunta de prueba y presiona "Probar"
- Then: se muestra la respuesta completa con answer, warnings y sources

---

# 3. Plan Tecnico y Arquitectura

## 3.1 Diagrama de Componentes

```
                         +------------------+
                         |   React Frontend |
                         |  (Chat + Admin)  |
                         +--------+---------+
                                  |
                          fetch / SSE POST
                                  |
                         +--------v---------+
                         |     FastAPI       |
                         |  (API Gateway)    |
                         +--+----+----+-----+
                            |    |    |
               +------------+    |    +------------+
               |                 |                 |
      +--------v------+  +------v-------+  +------v-------+
      | /v1/chat      |  | /v1/ingest   |  | /v1/domains  |
      | /v1/chat/stream| | /pdf  /json  |  |              |
      +--------+------+  +------+-------+  +------+-------+
               |                 |                 |
               v                 v                 v
      +------------------+  +----------+   +-------------+
      | LangGraph        |  | Chunking |   | Domain      |
      | (RAG Pipeline)   |  | Engine   |   | Registry    |
      | Retrieve         |  +-----+----+   | (YAML load) |
      | Generate         |        |        +-------------+
      | Validate         |        v
      | Format           |  +----------+
      +---+---------+----+  | Pydantic |
          |         |       | Schemas  |
          v         v       +----------+
   +------+--+ +---+----+
   | ChromaDB | | Ollama |
   | (vectors)| | (LLM + |
   +----------+ | embed) |
                +--------+
          +----------+
          |  Redis   |
          | (session |
          |  + cache)|
          +----------+
```

## 3.2 Modelo de Datos — ChromaDB

Una coleccion por dominio, nombrada `kb_{domain_id}`.

```
Collection: kb_restaurant
  id:        "menu_2026.pdf:0"
  document:  "Ingredientes: trucha, crema de leche, nabo, naranja"
  metadata:  {
    domain_id: "restaurant",
    dish_id: "trucha-grillada",
    name: "Trucha grillada con crema de nabo",
    chunk_type: "ingredients",
    source: "menu_2026.pdf",
    chunk_id: "menu_2026.pdf:0"
  }
  embedding: [0.123, -0.456, ...]  (vector de nomic-embed-text)
```

## 3.3 Modelo de Datos — Redis

```
Clave:   chat:{domain_id}:{session_id}
Tipo:    List (LPUSH / LTRIM)
Valores: ultimas 10 preguntas del usuario (strings)
TTL:     sin expiracion en MVP (revisar para produccion)
```

## 3.4 Configuracion del Entorno (settings.py)

```python
APP_NAME: str = "RAG Multi-domain MVP"
CHROMA_PATH: str = "./chroma_data"           # Ruta de persistencia ChromaDB
REDIS_URL: str = "redis://localhost:6379/0"   # URL de conexion Redis
OLLAMA_BASE_URL: str = "http://localhost:11434"  # URL de Ollama
OLLAMA_LLM_MODEL: str = "llama3.1:8b"           # Modelo de lenguaje
OLLAMA_EMBED_MODEL: str = "nomic-embed-text"     # Modelo de embeddings
```

Todas las variables son configurables via variables de entorno (Pydantic BaseSettings).

## 3.5 Dependencias Externas y Comandos de Ejecucion

**Servicios requeridos:**

```bash
# 1. Redis
docker run -p 6379:6379 redis:7

# 2. Ollama
ollama serve
ollama pull llama3.1:8b
ollama pull nomic-embed-text

# 3. Backend
cd backend
uvicorn app.main:app --reload --port 8000

# 4. Frontend
cd frontend
npm install
npm run dev
```

## 3.6 Mapa de Dependencias entre Modulos

```
main.py
  <- api/chat.py         <- core/domain_registry.py
                          <- rag/graph.py
                              <- rag/retrieval.py       <- infra/chroma.py
                                                        <- infra/ollama.py
                              <- rag/prompts.py
                              <- core/policies.py
                              <- infra/ollama.py
  <- api/chat_stream.py  <- core/domain_registry.py
                          <- rag/retrieval.py
                          <- rag/prompts.py
                          <- core/policies.py
                          <- infra/ollama.py
  <- api/ingest.py        <- infra/chroma.py
                           <- infra/ollama.py
                           <- core/schemas.py
                           <- core/chunking.py
                           <- core/pdf_menu_parser.py   <- core/schemas.py
  <- api/domains.py       <- core/domain_registry.py
```

---

# 4. Tareas de Implementacion

> Cada tarea esta dimensionada para ser completada en una sesion de 1-4 horas
> y producir un PR independiente y testeable.

## Fase 1: Infraestructura y Configuracion

### Tarea 1.1 — Scaffold del proyecto backend

**Descripcion**: Crear la estructura de directorios del backend, `pyproject.toml` con dependencias, `settings.py` con variables de entorno y `main.py` con la app FastAPI vacia + endpoint `/health`.

**Archivos a crear:**
- `backend/pyproject.toml`
- `backend/app/__init__.py`
- `backend/app/main.py`
- `backend/app/settings.py`

**Criterio de completitud:**
- `uvicorn app.main:app` arranca sin error
- `GET /health` retorna `{"ok": true}`

---

### Tarea 1.2 — Clientes de infraestructura (Chroma, Redis, Ollama)

**Descripcion**: Implementar los modulos de conexion a ChromaDB, Redis y Ollama con las funciones factory.

**Archivos a crear:**
- `backend/app/infra/chroma.py` — `get_chroma_client()`, `get_or_create_collection(domain_id)`
- `backend/app/infra/redis.py` — `get_redis()`
- `backend/app/infra/ollama.py` — `get_llm()`, `get_embeddings()`

**Criterio de completitud:**
- Importar cada modulo sin error
- `get_or_create_collection("test")` crea una coleccion en Chroma
- `get_redis().ping()` retorna `True`
- `get_llm()` retorna un objeto ChatOllama funcional

---

### Tarea 1.3 — Registro de dominios y archivos YAML

**Descripcion**: Implementar `domain_registry.py` con la funcion `load_domains()` y crear los archivos YAML de `restaurant` y `hair_salon`.

**Archivos a crear:**
- `backend/app/core/domain_registry.py`
- `backend/app/data/domains/restaurant.yaml`
- `backend/app/data/domains/hair_salon.yaml`

**Criterio de completitud:**
- `load_domains("./app/data/domains")` retorna un dict con 2 claves
- Cada `DomainConfig` tiene `system_prompt` no vacio

---

## Fase 2: Esquemas, Chunking e Ingesta

### Tarea 2.1 — Esquemas Pydantic canonicos

**Descripcion**: Implementar los modelos Pydantic: `DishAllergen`, `DishCrossContamination`, `DishCanonical`, `HairChemical`, `HairContraindication`, `HairProductCanonical`.

**Archivos a crear:**
- `backend/app/core/schemas.py`

**Criterio de completitud:**
- Instanciar un `DishCanonical` con datos de ejemplo sin error de validacion
- Instanciar un `HairProductCanonical` con datos de ejemplo sin error de validacion
- Campos obligatorios ausentes producen `ValidationError`

---

### Tarea 2.2 — Motor de chunking semantico

**Descripcion**: Implementar `chunks_from_dish()` y `chunks_from_hair_product()` que transforman estructuras canonicas en listas de chunks con texto y metadata.

**Archivos a crear:**
- `backend/app/core/chunking.py`

**Criterio de completitud:**
- Un `DishCanonical` completo genera al menos 4 chunks (description, ingredients, allergens, cross_contamination)
- Cada chunk tiene `text` no vacio y `metadata` con `domain_id`, `dish_id`, `chunk_type`

---

### Tarea 2.3 — Endpoint de ingesta JSON

**Descripcion**: Implementar `POST /v1/ingest/json` que recibe un payload, lo valida contra el esquema del dominio, genera chunks y hace upsert en ChromaDB.

**Archivos a crear:**
- `backend/app/api/ingest.py` (parcial: solo la ruta JSON)

**Criterio de completitud:**
- Ingestar un DishCanonical JSON y verificar que los chunks aparecen en ChromaDB
- domain_id invalido retorna 400
- JSON invalido retorna 422

---

### Tarea 2.4 — Parser de PDF y endpoint de ingesta PDF

**Descripcion**: Implementar el parser heuristico de PDF para restaurante y el endpoint `POST /v1/ingest/pdf`.

**Archivos a crear:**
- `backend/app/core/pdf_menu_parser.py`
- `backend/app/api/ingest.py` (completar con ruta PDF)

**Criterio de completitud:**
- Un PDF de ejemplo con 2 platos produce 2 `DishCanonical` con campos parseados correctamente
- El endpoint retorna `"mode": "canonical"` para restaurant y `"mode": "raw_pdf"` para otros dominios

---

## Fase 3: Pipeline RAG

### Tarea 3.1 — Modulo de retrieval

**Descripcion**: Implementar `retrieve(domain_id, query, top_k)` que ejecuta similarity search en ChromaDB con filtros.

**Archivos a crear:**
- `backend/app/rag/retrieval.py`

**Criterio de completitud:**
- Con datos ingestados previamente, `retrieve("restaurant", "trucha", 5)` retorna chunks relevantes
- Cada resultado tiene `text`, `metadata` y `distance`

---

### Tarea 3.2 — Construccion de prompts y politicas

**Descripcion**: Implementar `build_user_prompt()` en prompts.py y `must_add_disclaimer()` + `disclaimer_text()` en policies.py.

**Archivos a crear:**
- `backend/app/rag/prompts.py`
- `backend/app/core/policies.py`

**Criterio de completitud:**
- `build_user_prompt("pregunta", context_blocks)` genera un string con contexto numerado y la pregunta
- `must_add_disclaimer("restaurant", "soy celíaco")` retorna `True`
- `must_add_disclaimer("restaurant", "quiero postre")` retorna `False`

---

### Tarea 3.3 — Grafo LangGraph completo

**Descripcion**: Implementar los 4 nodos (retrieve, generate, validate, format), el estado tipado `RAGState` y la funcion `build_graph()` que compila el grafo.

**Archivos a crear:**
- `backend/app/rag/graph.py`

**Criterio de completitud:**
- `build_graph()` retorna un grafo compilado sin error
- Invocar el grafo con un estado valido produce un `final` con `answer`, `warnings` y `sources`

---

### Tarea 3.4 — Endpoint de chat sincrono

**Descripcion**: Implementar `POST /v1/chat` que carga el dominio, construye el estado, ejecuta el grafo y retorna la respuesta.

**Archivos a crear:**
- `backend/app/api/chat.py`

**Criterio de completitud:**
- Con datos ingestados, una pregunta produce un JSON con answer, warnings y sources
- domain_id invalido retorna 400
- message vacio retorna 400
- La sesion se almacena en Redis

---

### Tarea 3.5 — Endpoint de chat con streaming SSE

**Descripcion**: Implementar `POST /v1/chat/stream` con StreamingResponse y el generador de eventos SSE.

**Archivos a crear:**
- `backend/app/api/chat_stream.py`

**Criterio de completitud:**
- El endpoint retorna `Content-Type: text/event-stream`
- Se reciben eventos en el orden especificado: meta -> sources -> warnings -> start -> token* -> done
- Los tokens concatenados forman una respuesta coherente

---

## Fase 4: Frontend

### Tarea 4.1 — Cliente SSE y estructura base React

**Descripcion**: Implementar el modulo `api.ts` con la funcion `chatStream()` que consume SSE over POST, y el scaffolding basico de la app React.

**Archivos a crear:**
- `frontend/src/api.ts`
- `frontend/src/App.tsx`
- `frontend/package.json`

**Criterio de completitud:**
- `chatStream()` parsea correctamente los 6 tipos de evento SSE
- Los callbacks se disparan en el orden correcto

---

### Tarea 4.2 — Componente de chat con streaming

**Descripcion**: Implementar `Chat.tsx` con selector de dominio, input, area de respuesta con streaming, panel de warnings y panel de sources.

**Archivos a crear:**
- `frontend/src/components/Chat.tsx`
- `frontend/src/components/SourcesPanel.tsx`
- `frontend/src/components/WarningsPanel.tsx`
- `frontend/src/pages/ChatPage.tsx`

**Criterio de completitud:**
- El usuario puede seleccionar dominio, escribir pregunta y enviar
- La respuesta aparece token por token
- Las advertencias y fuentes se muestran cuando estan disponibles
- El boton se deshabilita durante streaming

---

### Tarea 4.3 — Panel de administracion

**Descripcion**: Implementar la pagina de admin con formularios de subida de PDF y JSON, indicador de estado de ingesta y campo de smoke test.

**Archivos a crear:**
- `frontend/src/pages/AdminIngest.tsx`

**Criterio de completitud:**
- El admin puede subir un PDF y ver la cantidad de chunks creados
- El admin puede pegar JSON y ver el resultado de ingesta
- El campo de smoke test muestra la respuesta del asistente

---

## Fase 5: Integracion y Validacion End-to-End

### Tarea 5.1 — Test de integracion end-to-end

**Descripcion**: Ejecutar el flujo completo: iniciar servicios, ingestar un PDF de ejemplo, hacer una pregunta via chat, verificar que la respuesta tiene answer + warnings + sources correctos.

**Criterio de completitud:**
- Todos los servicios se levantan sin error (Redis, Ollama, FastAPI)
- La ingesta de un PDF produce chunks en ChromaDB
- El chat retorna respuestas basadas en los chunks ingestados
- El streaming funciona de principio a fin en el navegador
- Los triggers de salud activan disclaimers
- La contaminacion cruzada aparece como warning cuando corresponde

---

### Tarea 5.2 — Agregar segundo dominio (hair_salon) sin tocar codigo

**Descripcion**: Verificar que el sistema soporta un segundo dominio creando solo configuracion YAML y datos JSON.

**Criterio de completitud:**
- Se agrega `hair_salon.yaml` (ya creado en Tarea 1.3)
- Se ingesta un producto de peluqueria via `POST /v1/ingest/json`
- Se hace una pregunta sobre el producto via `POST /v1/chat` con `domain_id=hair_salon`
- La respuesta usa el system_prompt de peluqueria
- El disclaimer de salud dice "consulta con un profesional" (no "consulta al personal del local")
- No se modifico ningun archivo de codigo fuente

---

# Apendice A: Ejemplos de Datos Canonicos

## A.1 DishCanonical — Trucha Grillada

```json
{
  "domain_id": "restaurant",
  "dish_id": "trucha_grillada",
  "name": "Trucha grillada con crema de nabo y emulsion de naranja",
  "category": "main",
  "tags": ["sin-tacc", "pescado", "citricos"],
  "short_description": "Trucha grillada con crema suave de nabo, emulsion citrica y ensalada fresca.",
  "menu_description": "Trucha grillada servida con crema suave de nabo, emulsion de naranja y ensalada de porotos mung, pomelo y cilantro.",
  "ingredients": ["trucha", "crema de leche", "nabo", "naranja", "pomelo", "cilantro", "porotos mung"],
  "allergens": [
    { "name": "pescado", "severity": "critical" },
    { "name": "lacteos", "severity": "warning" }
  ],
  "cross_contamination": {
    "statement": "Se elabora en una cocina donde se manipula gluten.",
    "traces_possible": ["gluten"],
    "kitchen_notes": "No hay sector exclusivo libre de gluten."
  },
  "notes": ["Consultar al personal ante alergias severas."],
  "sources": ["menu_2026.pdf", "ficha_trucha.json"]
}
```

## A.2 HairProductCanonical — Shampoo Suave Diario

```json
{
  "domain_id": "hair_salon",
  "product_id": "shampoo_suave_01",
  "name": "Shampoo Suave Diario",
  "product_type": "shampoo",
  "tags": ["uso-diario", "cabello-normal"],
  "description": "Shampoo de limpieza suave para uso diario.",
  "usage": "Aplicar sobre cabello mojado, masajear y enjuagar. Repetir si es necesario.",
  "chemicals": [
    { "inci_name": "Aqua", "common_name": "Agua", "role": "solvente" },
    { "inci_name": "Sodium Laureth Sulfate", "common_name": "SLES", "role": "surfactante" },
    { "inci_name": "Cocamidopropyl Betaine", "role": "co-surfactante" },
    { "inci_name": "Phenoxyethanol", "role": "conservante" }
  ],
  "contraindications": [
    { "condition": "cuero cabelludo muy sensible", "guidance": "test de parche / consultar profesional" },
    { "condition": "irritacion activa", "guidance": "evitar hasta resolucion" }
  ],
  "notes": ["Si aparece irritacion, discontinuar y consultar."],
  "sources": ["ficha_inci_shampoo_01.pdf"]
}
```

---

# Apendice B: Prompt de Sistema por Dominio

## B.1 Restaurant (IA-Mozo)

```
Sos un asistente virtual de un restaurante (IA-Mozo).
Reglas obligatorias:
- Responde SOLO usando la informacion del contexto provisto.
- NO inventes ingredientes, alergenos ni afirmaciones.
- Si falta informacion, decilo explicitamente.
- Cuando haya riesgos (alergenos, intolerancias, celiaquia), adverti con claridad.
- Nunca brindes consejo medico; recomenda consultar al personal.
- Si existe informacion de contaminacion cruzada, incluila.
```

## B.2 Hair Salon (Asistente Peluqueria)

```
Sos un asistente de peluqueria.
Reglas:
- Responde SOLO con evidencia del contexto.
- NO inventes quimicos, efectos ni contraindicaciones.
- Si no hay evidencia, decilo y sugeri consultar a un profesional.
- No des diagnosticos ni consejo medico/dermatologico.
```

---

# Apendice C: Glosario

| Termino | Definicion |
|---------|-----------|
| RAG | Retrieval-Augmented Generation. Tecnica que combina busqueda de documentos con generacion de texto por LLM. |
| Chunk | Fragmento atomico de texto con metadatos, indexado como vector en ChromaDB. |
| Chunking semantico | Fragmentacion de documentos por estructura conceptual (no por tamano fijo). |
| Canonico | Formato interno estandarizado al que se normalizan todos los documentos antes de fragmentar. |
| Domain | Vertical de negocio (restaurant, hair_salon) con configuracion, datos y reglas propias. |
| Embedding | Representacion vectorial numerica de un texto, usada para busqueda por similitud. |
| SSE | Server-Sent Events. Protocolo de streaming unidireccional del servidor al cliente. |
| Upsert | Operacion que inserta si no existe o actualiza si ya existe, evitando duplicados. |
| Disclaimer | Advertencia legal/de seguridad que el sistema agrega automaticamente ante temas sensibles. |
| top_k | Cantidad maxima de fragmentos a recuperar en una busqueda vectorial. |
| INCI | International Nomenclature of Cosmetic Ingredients. Nomenclatura estandar de quimicos cosmeticos. |
| Trigger de salud | Palabra clave que activa la emision automatica de un disclaimer. |
