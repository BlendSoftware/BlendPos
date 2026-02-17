# Proyecto RAG Multi-Dominio: Especificaciones del Sistema

## Introduccion

El presente documento describe las especificaciones completas para el desarrollo de una plataforma de asistencia inteligente basada en la tecnica de Retrieval-Augmented Generation (RAG), disenada desde su concepcion como un sistema multi-dominio. La plataforma permite desplegar asistentes virtuales especializados para distintas verticales de negocio, como restaurantes y peluquerias, utilizando un unico nucleo tecnologico comun. Cada dominio comparte la misma arquitectura y el mismo motor de procesamiento, diferenciandose unicamente en su configuracion, su base de conocimiento y sus reglas de negocio.

El objetivo central es construir un sistema que responda preguntas de los usuarios finales utilizando exclusivamente informacion verificada proveniente de documentos internos, evitando la generacion de contenido inventado, citando siempre las fuentes de informacion y emitiendo advertencias cuando la naturaleza de la consulta lo requiera, particularmente en temas relacionados con salud, alergenos o contraindicaciones quimicas.

---

## Vision General del Sistema

El sistema opera como un pipeline completo que recorre las siguientes etapas: ingesta de documentos, fragmentacion semantica, generacion de embeddings, almacenamiento vectorial, recuperacion de fragmentos relevantes ante una consulta, generacion de respuesta mediante un modelo de lenguaje local, validacion de politicas de seguridad y entrega de una respuesta estructurada al usuario final.

Todo el sistema se ejecuta de forma local, sin dependencia de servicios en la nube para la inferencia del modelo de lenguaje. Esto se logra mediante el uso de Ollama como proveedor de modelos locales, lo cual garantiza privacidad de datos y autonomia operativa.

La clave del diseno generico reside en que el nucleo del sistema es completamente agnostico al dominio. Lo unico que cambia entre un asistente de restaurante y uno de peluqueria es la configuracion declarativa: el prompt de sistema, las politicas de respuesta, los tipos de fragmentos y los documentos ingestados. No se duplica codigo; se reutiliza infraestructura.

---

## Stack Tecnologico

El backend del sistema se construye sobre FastAPI como framework de API REST, aprovechando su soporte nativo para operaciones asincronas y streaming. La orquestacion del flujo de RAG se realiza mediante LangChain para la interaccion con el modelo de lenguaje y la generacion de embeddings, y LangGraph para el control del flujo de procesamiento mediante un grafo de nodos con estados tipados.

ChromaDB funciona como el almacen vectorial, manteniendo una coleccion independiente por cada dominio. Redis cumple multiples funciones: almacena el historial reciente de conversaciones por sesion, puede actuar como cache de respuestas frecuentes para reducir latencia, y opcionalmente gestiona rate-limiting y colas livianas de ingesta.

Ollama provee tanto el modelo de lenguaje principal (por ejemplo, llama3.1:8b) como el modelo de embeddings (nomic-embed-text), ambos ejecutandose localmente.

El frontend se implementa en React, ofreciendo una interfaz de chat con soporte para streaming de tokens, visualizacion de advertencias y un panel de fuentes citadas. Tambien incluye un modo de administracion para la carga de documentos y la gestion de dominios.

---

## Modelo Multi-Dominio

El sistema define tres entidades fundamentales que articulan su capacidad multi-dominio.

La primera es el Dominio, identificado por un domain_id unico (como "restaurant" o "hair_salon"). Cada dominio posee su propio prompt de sistema, que define el tono y las reglas de comportamiento del asistente; sus politicas, que determinan que puede afirmar, que debe advertir y cuando derivar a un humano; su configuracion de recuperacion, que establece parametros como el numero de fragmentos a recuperar y el umbral de relevancia; y opcionalmente un esquema de salida particular.

La segunda entidad es el Documento, que representa una fuente de conocimiento asociada a un dominio. Un documento puede ser un PDF, una pagina web, un texto manual o un objeto JSON. Cada documento se identifica por un doc_id y esta vinculado a un domain_id.

La tercera entidad es el Fragmento (Chunk), que es la unidad minima de conocimiento indexada en el almacen vectorial. Cada fragmento contiene el texto en si, su domain_id, el doc_id del documento de origen y un conjunto de metadatos que incluyen el tipo de fragmento (por ejemplo: ingredientes, alergenos, contraindicaciones, descripcion, contaminacion cruzada) y cualquier etiqueta adicional relevante para el dominio.

La riqueza de los metadatos es un aspecto critico del diseno. Gracias a ellos, el mismo motor de recuperacion puede aplicar filtros y prioridades diferentes segun el dominio, sin necesidad de modificar el codigo fuente.

---

## Configuracion Declarativa por Dominio

Cada dominio se define mediante un archivo YAML independiente almacenado en el directorio de datos del backend. Este archivo contiene el identificador del dominio, su nombre visible, el tono deseado para las respuestas, las politicas de comportamiento (como la obligacion de citar fuentes, la prohibicion de inventar informacion, o la exigencia de incluir disclaimers de salud), los parametros de recuperacion y el prompt de sistema completo.

Para el dominio de restaurante, el prompt de sistema instruye al asistente a comportarse como un "IA-Mozo" cordial y profesional, que responde exclusivamente con la informacion del contexto provisto, nunca inventa ingredientes ni alergenos, advierte con claridad sobre riesgos alimentarios, incluye informacion de contaminacion cruzada cuando esta disponible, y jamas brinda consejos medicos.

Para el dominio de peluqueria, el prompt instruye al asistente a ser amable pero tecnico y prudente, respondiendo solo con evidencia documental, sin inventar quimicos ni contraindicaciones, sugiriendo consultar a un profesional cuando la evidencia es insuficiente, y absteniendose de emitir diagnosticos medicos o dermatologicos.

Agregar un nuevo dominio consiste simplemente en crear un nuevo archivo YAML con la configuracion correspondiente y cargar los documentos relevantes. El codigo del sistema no requiere modificacion alguna.

---

## Pipeline de Ingesta

El proceso de ingesta transforma documentos crudos en fragmentos semanticos indexados en el almacen vectorial. El flujo consta de cinco pasos secuenciales.

Primero, la normalizacion de fuentes: el sistema acepta documentos en formato PDF, HTML, Markdown o JSON y los convierte a texto plano junto con sus metadatos asociados.

Segundo, la conversion a formato canonico interno. Cada dominio define una estructura de datos canonica. Para el dominio de restaurante, esta estructura es el DishCanonical, que contiene campos como identificador del plato, nombre, categoria, etiquetas, descripcion para el menu, lista de ingredientes, lista de alergenos con nivel de severidad, informacion de contaminacion cruzada con detalle de trazas posibles, datos nutricionales opcionales, notas adicionales y fuentes de origen. Para el dominio de peluqueria, la estructura es el HairProductCanonical, que incluye identificador del producto, nombre, tipo de producto, descripcion, instrucciones de uso, lista de quimicos con su nombre INCI y su rol, contraindicaciones con condicion y guia de accion, notas y fuentes.

Tercero, el chunking semantico. A diferencia de un enfoque ingenuo que fragmenta el texto por tamano fijo, este sistema fragmenta por estructura semantica. Un plato genera fragmentos independientes para su descripcion, sus ingredientes, sus alergenos, su informacion de contaminacion cruzada y sus notas. Un producto capilar genera fragmentos para su descripcion, su uso, sus quimicos INCI, sus contraindicaciones y sus notas. Cada fragmento lleva metadatos que identifican su tipo, su dominio y su documento de origen.

Cuarto, la generacion de embeddings. Los textos de cada fragmento se convierten en vectores numericos mediante el modelo de embeddings local provisto por Ollama.

Quinto, el upsert en ChromaDB. Los fragmentos, junto con sus vectores, textos y metadatos, se almacenan en la coleccion correspondiente al dominio. El uso de upsert garantiza que la reingesta de un documento actualice los fragmentos existentes sin generar duplicados.

Para el caso especifico de PDFs de restaurante, el sistema incluye un parser heuristico por secciones que identifica encabezados como "PLATO:", "INGREDIENTES:", "ALERGENOS:", "CONTAMINACION CRUZADA:" y "NOTAS:", y convierte el texto extraido en estructuras canonicas DishCanonical que luego se fragmentan semanticamente. Para dominios donde aun no existe un parser especializado, el PDF se ingesta como un unico fragmento crudo, permitiendo que el sistema funcione de inmediato aunque con menor calidad de recuperacion.

---

## Flujo de Procesamiento RAG (LangGraph)

El procesamiento de cada consulta del usuario sigue un grafo dirigido de cuatro nodos, implementado con LangGraph y un estado tipado que se propaga entre nodos.

El primer nodo es Retrieve. Recibe la pregunta del usuario y el identificador del dominio, ejecuta una busqueda por similitud en la coleccion de ChromaDB correspondiente aplicando el filtro de domain_id, y retorna los fragmentos mas relevantes segun el parametro top_k configurado para ese dominio.

El segundo nodo es Generate. Construye un prompt que combina el prompt de sistema del dominio con los fragmentos recuperados (formateados como contexto numerado con sus metadatos) y la pregunta del usuario, y lo envia al modelo de lenguaje local para obtener una respuesta. Las instrucciones explicitas del prompt exigen que la respuesta se base unicamente en el contexto provisto, que declare explicitamente cuando la informacion es insuficiente, y que incluya advertencias y fuentes.

El tercer nodo es Validate. Aplica las politicas de seguridad del dominio sobre la respuesta generada. Si no se encontraron fragmentos relevantes, agrega una advertencia de falta de evidencia. Si el dominio es restaurante y existen fragmentos de tipo contaminacion cruzada en el contexto, fuerza la inclusion de una advertencia al respecto. Si la pregunta del usuario contiene terminos relacionados con salud (alergias, celiaquia, intolerancia, embarazo, asma, dermatitis, entre otros), agrega un disclaimer obligatorio que recomienda consultar al personal del local o a un profesional segun corresponda al dominio.

El cuarto nodo es Format. Estructura la respuesta final en un formato estandarizado que contiene tres campos: la respuesta textual (answer), una lista de advertencias (warnings) y una lista de fuentes citadas (sources), donde cada fuente incluye el identificador de la fuente original, el identificador del fragmento y el tipo de fragmento.

Este grafo lineal puede extenderse en el futuro con nodos adicionales como RewriteQuestion para mejorar la formulacion de la busqueda, DetectDomain para inferir automaticamente el dominio cuando no se provee explicitamente, o un nodo de re-ranking para reordenar los fragmentos recuperados.

---

## API REST

El backend expone los siguientes endpoints.

POST /v1/chat: recibe un objeto con domain_id, session_id y message. Ejecuta el grafo RAG completo y retorna la respuesta estructurada con answer, warnings y sources. Redis almacena las ultimas diez interacciones de la sesion para contexto conversacional basico.

POST /v1/chat/stream: variante del endpoint de chat que utiliza Server-Sent Events (SSE) para transmitir la respuesta en tiempo real. El flujo de eventos emite primero los metadatos del dominio, luego las fuentes recuperadas, a continuacion las advertencias si las hubiera, y finalmente los tokens de la respuesta uno a uno a medida que el modelo los genera. Esto permite que la interfaz de usuario muestre la respuesta progresivamente, mejorando significativamente la experiencia percibida.

POST /v1/ingest/pdf: recibe un domain_id y un archivo PDF. Extrae el texto, lo convierte a formato canonico si existe un parser para el dominio (como el parser de fichas de restaurante), genera fragmentos semanticos y los almacena en ChromaDB.

POST /v1/ingest/json: recibe un payload JSON que incluye el domain_id y los datos estructurados del item (plato o producto). Valida la estructura contra el esquema canonico correspondiente, genera fragmentos semanticos y los almacena.

GET /v1/domains: retorna la lista de dominios configurados con su identificador y nombre visible, utilizado por el frontend para poblar el selector de dominio.

POST /v1/domains: permite crear o actualizar la configuracion de un dominio, incluyendo su prompt de sistema y sus politicas.

GET /health: endpoint de verificacion de salud del servicio.

---

## Interfaz de Usuario (Frontend React)

La interfaz de usuario se compone de dos areas funcionales principales.

El area de chat presenta una interfaz conversacional con burbujas de mensajes y soporte para streaming de tokens, de modo que el usuario ve la respuesta escribiendose en tiempo real. Debajo o junto a cada respuesta se muestra una seccion de advertencias destacada visualmente para comunicar riesgos alimentarios, quimicos o disclaimers de salud. Un panel de fuentes permite al usuario verificar de donde proviene cada afirmacion del asistente, fortaleciendo la confianza en las respuestas. Un selector de dominio permite alternar entre los distintos asistentes disponibles (por ejemplo, IA-Mozo para restaurante, Asistente Peluqueria para salon de belleza).

El area de administracion permite cargar documentos en formato PDF o JSON, visualizar el estado de los procesos de ingesta, y ejecutar consultas rapidas de prueba para verificar el correcto funcionamiento del asistente en cada dominio.

El cliente de streaming se implementa mediante fetch con ReadableStream para soportar SSE sobre peticiones POST, ya que el endpoint requiere enviar un cuerpo JSON. El parser de eventos procesa los distintos tipos de evento (meta, sources, warnings, token, done, error) y actualiza la interfaz de forma reactiva.

---

## Politicas y Reglas de Seguridad por Dominio

Las politicas constituyen un componente esencial del sistema, ya que determinan el comportamiento del asistente en situaciones sensibles.

Para el dominio de restaurante, las reglas establecen que ante preguntas sobre aptitud para celiacos u otras condiciones alimentarias, el asistente debe responder estrictamente con lo que indica la ficha del plato; si falta evidencia, no debe asumir ni inventar; debe advertir sobre contaminacion cruzada cuando esta no esta especificada claramente; ante preguntas sobre alergias, debe responder con evidencia acompanada de un disclaimer y recomendar consultar al personal del establecimiento.

Para el dominio de peluqueria, las reglas establecen que ante preguntas sobre uso de productos en condiciones especiales como embarazo, si no hay evidencia solida en la base de conocimiento, el asistente debe derivar a un profesional y nunca dar consejo medico concluyente; ante preguntas sobre composicion quimica, debe responder desde los listados INCI con fuentes verificables.

Estas politicas se implementan como un nodo fijo del grafo de procesamiento. Las reglas especificas cambian segun el dominio, pero el mecanismo de validacion es identico.

---

## Estructura del Proyecto

El proyecto se organiza en dos grandes directorios: backend y frontend.

El backend contiene el punto de entrada de la aplicacion FastAPI, el modulo de configuracion con variables de entorno, y tres areas funcionales. El area de API agrupa los endpoints de chat, chat con streaming, ingesta y gestion de dominios. El area de core contiene la logica de negocio reutilizable: el registro de dominios que carga y administra las configuraciones YAML, el modulo de chunking que transforma estructuras canonicas en fragmentos semanticos, los esquemas Pydantic que definen las estructuras canonicas de cada dominio, las politicas de validacion de seguridad, y el parser de PDF por secciones. El area de infraestructura encapsula las conexiones con ChromaDB, Redis y Ollama. El area de RAG implementa el grafo LangGraph, la logica de recuperacion vectorial, la construccion de prompts y el formateo de salida. Finalmente, el directorio de datos almacena los archivos YAML de configuracion de cada dominio.

El frontend contiene el cliente de API con soporte para SSE, la pagina principal de chat, los componentes de chat, panel de fuentes, panel de advertencias, selector de dominio, y la pagina de administracion para ingesta de documentos.

---

## Esquemas de Datos Canonicos

El sistema define esquemas Pydantic rigurosos para cada tipo de entidad por dominio.

Para el dominio de restaurante, el esquema DishCanonical incluye: domain_id fijo en "restaurant", dish_id como identificador unico del plato, nombre, categoria (entrada, principal, postre, etc.), etiquetas descriptivas, descripcion corta, descripcion completa para el menu, lista de ingredientes como cadenas de texto, lista de alergenos donde cada uno tiene nombre, severidad (info, warning o critical) y notas opcionales, informacion de contaminacion cruzada con declaracion general, lista de trazas posibles y notas de cocina, datos nutricionales opcionales como diccionario flexible, notas generales como lista de cadenas, y fuentes de origen.

Para el dominio de peluqueria, el esquema HairProductCanonical incluye: domain_id fijo en "hair_salon", product_id como identificador unico, nombre, tipo de producto (shampoo, acondicionador, keratina, tintura, etc.), etiquetas, descripcion general, instrucciones de uso, lista de quimicos donde cada uno tiene nombre INCI, nombre comun opcional, rol funcional y notas, lista de contraindicaciones donde cada una tiene condicion, guia de accion y evidencia opcional, notas generales y fuentes de origen.

---

## Estrategia de Despliegue del MVP

El producto minimo viable se centra en un unico dominio (restaurante) con el asistente IA-Mozo completamente funcional. Este MVP incluye ingesta de documentos en formato PDF y JSON, chat con respuestas basadas en fuentes, manejo real de alergenos y contaminacion cruzada, streaming de tokens en la interfaz de usuario, y una arquitectura preparada para la incorporacion inmediata de nuevos dominios.

Para ejecutar el sistema se requieren tres servicios: el backend FastAPI corriendo con uvicorn, una instancia de Redis (ejecutable via Docker), y Ollama sirviendo los modelos llama3.1:8b y nomic-embed-text.

La extension a un segundo dominio, como peluqueria, se realiza sin modificar el codigo fuente: se agrega el archivo YAML de configuracion, se cargan los documentos del nuevo dominio, y el sistema queda operativo para ese vertical. Eventualmente se puede agregar un parser de PDF especializado para fichas tecnicas de productos capilares, siguiendo el mismo patron del parser de fichas de restaurante.

---

## Decisiones Tecnicas Fundamentales

El dominio siempre se especifica explicitamente desde el frontend; nunca se intenta adivinar. El chunking se realiza por estructura semantica, no por tamano fijo, lo cual impacta directamente en la calidad de las respuestas. Los metadatos de cada fragmento son ricos y detallados, habilitando filtros y respuestas mas seguras. La salida del sistema siempre es estructurada: respuesta, advertencias y fuentes. Redis se utiliza para cachear respuestas a preguntas frecuentes, reduciendo la latencia percibida. Cada request genera un trace_id para facilitar la observabilidad y el debugging del flujo completo del grafo.

El sistema esta disenado para que la calidad dependa de la calidad de los datos, no de la complejidad del codigo. Un buen chunking semantico con metadatos ricos sobre una base de conocimiento bien curada produce resultados significativamente superiores a cualquier optimizacion algoritmica sobre datos mal estructurados.
