# Requirements — RAG Multi-Dominio

> Documento de requerimientos — Spec-Driven Development (cc-sdd)
> Version: 1.0.0
> Fecha: 2026-02-09
> Estado: Draft para revision
> Formato: EARS (Easy Approach to Requirements Syntax)

---

## 1. Overview

### 1.1 Descripcion del Producto

Una plataforma de asistencia inteligente que permite a negocios de distintas verticales (restaurantes, peluquerias, y futuras verticales) desplegar asistentes virtuales capaces de responder preguntas de sus clientes finales utilizando exclusivamente informacion verificada proveniente de documentos internos del negocio.

### 1.2 Proposicion de Valor

Los negocios de atencion al publico enfrentan un problema recurrente: sus clientes tienen preguntas sobre productos o servicios (ingredientes, alergenos, composicion quimica, contraindicaciones) que el personal no siempre puede responder con precision en tiempo real. La informacion existe en fichas tecnicas, menus y documentos internos, pero no esta accesible de forma inmediata. Este sistema convierte esa documentacion interna en un asistente conversacional que responde con precision, cita sus fuentes y advierte proactivamente sobre riesgos de salud, eliminando el riesgo de informacion inventada o imprecisa.

### 1.3 Usuarios Objetivo

- **Cliente final**: Persona que interactua con el asistente para obtener informacion sobre platos, productos o servicios del negocio. No tiene conocimiento tecnico. Necesita respuestas claras, confiables y con advertencias visibles.
- **Administrador del negocio**: Persona responsable de cargar y mantener la base de conocimiento del asistente. Sube documentos (menus, fichas tecnicas) y verifica que el asistente responda correctamente. Conocimiento tecnico basico.
- **Operador de plataforma**: Persona que configura nuevos dominios, define politicas de seguridad y monitorea el sistema. Conocimiento tecnico avanzado.

---

## 2. User Stories

---

### US-01: Consulta Conversacional con Fuentes

**As a** cliente final de un negocio,
**I need** enviar preguntas en lenguaje natural sobre productos o servicios y recibir respuestas basadas en documentos internos del negocio,
**So that** pueda tomar decisiones informadas sin depender de la disponibilidad del personal.

#### Acceptance Criteria

- AC-01.1: Cuando el cliente envia una pregunta, el sistema retorna una respuesta textual, una lista de advertencias (puede estar vacia) y una lista de fuentes citadas.
- AC-01.2: La respuesta se basa exclusivamente en fragmentos recuperados de la base de conocimiento del dominio correspondiente.
- AC-01.3: Cuando no existe informacion suficiente para responder, el sistema lo declara explicitamente en lugar de inventar contenido.
- AC-01.4: Cada fuente citada identifica el documento de origen, el fragmento utilizado y el tipo de informacion (ingredientes, alergenos, etc.).
- AC-01.5: El historial reciente de la conversacion se preserva durante la sesion del cliente.

#### Edge Cases

- El cliente hace una pregunta completamente fuera del dominio del negocio (ej: "Cual es la capital de Francia" en un asistente de restaurante). El sistema debe indicar que no tiene informacion disponible, sin inventar.
- El cliente hace una pregunta ambigua que podria referirse a multiples platos o productos. El sistema debe responder con la informacion de los fragmentos mas relevantes recuperados.

---

### US-02: Advertencias Proactivas de Seguridad y Salud

**As a** cliente final con condiciones de salud (alergias, intolerancias, embarazo, condiciones dermatologicas),
**I need** que el sistema me advierta automaticamente sobre riesgos relevantes cuando mi consulta involucra temas de salud,
**So that** pueda proteger mi bienestar sin necesidad de formular preguntas especificas sobre cada riesgo.

#### Acceptance Criteria

- AC-02.1: Cuando la pregunta del cliente contiene terminos relacionados con salud (alergias, celiaquia, intolerancia, embarazo, asma, dermatitis, urticaria, anafilaxia, hipertension, diabetes), el sistema agrega un disclaimer obligatorio a la respuesta.
- AC-02.2: El disclaimer recomienda consultar al personal del negocio o a un profesional de salud, segun corresponda al dominio.
- AC-02.3: Cuando existen datos de contaminacion cruzada en los fragmentos recuperados, el sistema incluye una advertencia de contaminacion cruzada en la respuesta, independientemente de la pregunta formulada.
- AC-02.4: Las advertencias se presentan de forma visualmente diferenciada de la respuesta principal.
- AC-02.5: El sistema nunca emite consejos medicos concluyentes bajo ningun dominio.

#### Edge Cases

- El cliente pregunta por un plato y los fragmentos recuperados incluyen contaminacion cruzada, pero la pregunta no contiene triggers de salud. Ambas advertencias (contaminacion cruzada y disclaimer) tienen reglas independientes: la primera se activa por presencia en el contexto, la segunda por presencia en la pregunta.
- Multiples triggers de salud en una misma pregunta. La lista de advertencias no debe contener duplicados.

---

### US-03: Respuesta en Tiempo Real con Streaming

**As a** cliente final del asistente,
**I need** ver la respuesta del asistente generandose progresivamente en pantalla, token por token,
**So that** perciba rapidez y fluidez en la interaccion, incluso cuando el modelo de lenguaje local toma varios segundos en completar la generacion.

#### Acceptance Criteria

- AC-03.1: La interfaz muestra la respuesta construyendose incrementalmente a medida que el modelo genera cada token.
- AC-03.2: Las fuentes citadas y las advertencias se muestran antes de que comiencen a llegar los tokens de la respuesta.
- AC-03.3: Durante la generacion, el campo de entrada de texto esta deshabilitado para evitar envios duplicados.
- AC-03.4: Cuando la generacion se completa, el campo de entrada se rehabilita automaticamente.
- AC-03.5: Si ocurre un error durante la generacion, se muestra un mensaje de error descriptivo y el campo de entrada se rehabilita.

#### Edge Cases

- El servicio de inferencia local se desconecta a mitad de una generacion. El sistema debe emitir un evento de error y no dejar la interfaz en estado bloqueado.
- La respuesta generada es muy larga. Los tokens deben seguir concatenandose sin limite predefinido de longitud.

---

### US-04: Ingesta de Documentos en Formato JSON Estructurado

**As an** administrador del negocio,
**I need** cargar documentos en formato JSON con estructura canonicamente definida (platos con ingredientes, alergenos, contaminacion cruzada; o productos con quimicos, contraindicaciones),
**So that** el asistente pueda responder preguntas con fragmentos semanticos ricos y metadatos detallados.

#### Acceptance Criteria

- AC-04.1: El sistema valida el JSON contra el esquema canonico del dominio correspondiente antes de procesarlo.
- AC-04.2: Un documento JSON valido se transforma en fragmentos semanticos independientes (uno por seccion conceptual: descripcion, ingredientes, alergenos, contaminacion cruzada, notas, quimicos, contraindicaciones, uso).
- AC-04.3: Cada fragmento generado contiene metadatos que identifican el dominio, el item de origen, el tipo de fragmento y la fuente del documento.
- AC-04.4: La reingesta del mismo item actualiza los fragmentos existentes sin generar duplicados.
- AC-04.5: El sistema retorna la cantidad de fragmentos generados como confirmacion.
- AC-04.6: Si el dominio referenciado no existe, el sistema retorna un error descriptivo.
- AC-04.7: Si el JSON no cumple con el esquema, el sistema retorna los errores de validacion con detalle de campo y motivo.

#### Edge Cases

- Un item tiene campos opcionales vacios (ej: un plato sin informacion de contaminacion cruzada). Solo se generan fragmentos para los campos con valor.
- Un item tiene multiples notas. Se genera un fragmento independiente por cada nota.

---

### US-05: Ingesta de Documentos en Formato PDF

**As an** administrador del negocio,
**I need** subir archivos PDF (menus, fichas tecnicas, listados de productos) para que el sistema extraiga la informacion y la indexe automaticamente,
**So that** pueda alimentar al asistente con documentacion existente sin necesidad de transcribir manualmente a formato JSON.

#### Acceptance Criteria

- AC-05.1: El sistema extrae el texto del PDF y lo procesa para generar fragmentos indexables.
- AC-05.2: Para dominios con parser especializado (restaurante), el texto se convierte en estructuras canonicas con fragmentos semanticos individuales (descripcion, ingredientes, alergenos, contaminacion cruzada, notas).
- AC-05.3: Para dominios sin parser especializado, el texto completo del PDF se almacena como un unico fragmento con tipo "raw_pdf".
- AC-05.4: El sistema retorna la cantidad de items detectados y fragmentos generados como confirmacion.
- AC-05.5: Si el archivo no es un PDF, el sistema retorna un error descriptivo.
- AC-05.6: Si el PDF no contiene texto extraible (es una imagen escaneada sin OCR), el sistema retorna un error descriptivo.

#### Edge Cases

- Un PDF con 50 platos donde algunos tienen secciones incompletas (ej: sin alergenos declarados). El parser debe procesar correctamente los que tienen informacion y descartar silenciosamente registros sin nombre.
- Un PDF con formato libre (no sigue la estructura de encabezados esperada). Se ingesta como chunk raw, permitiendo busqueda pero con menor calidad de recuperacion.

---

### US-06: Configuracion Declarativa de Dominios

**As an** operador de plataforma,
**I need** definir y modificar dominios (verticales de negocio) mediante archivos de configuracion declarativos, sin modificar codigo fuente,
**So that** pueda desplegar un nuevo asistente para una vertical diferente (peluqueria, farmacia, tienda) solo con configuracion y datos.

#### Acceptance Criteria

- AC-06.1: Cada dominio se define en un archivo de configuracion independiente que contiene: identificador unico, nombre visible, tono de respuesta, politicas de comportamiento, parametros de recuperacion y prompt de sistema completo.
- AC-06.2: Agregar un nuevo dominio consiste exclusivamente en crear un nuevo archivo de configuracion y cargar los documentos correspondientes. Ningun archivo de codigo fuente requiere modificacion.
- AC-06.3: El sistema carga todos los dominios disponibles al iniciar.
- AC-06.4: Si un archivo de configuracion tiene errores, el sistema lo reporta y continua cargando los demas dominios validos.
- AC-06.5: La lista de dominios disponibles es consultable desde la interfaz de administracion y desde la interfaz de chat (para el selector de dominio).
- AC-06.6: Las politicas del dominio (obligacion de citar fuentes, prohibicion de inventar, disclaimers de salud, contaminacion cruzada obligatoria) se aplican automaticamente en cada interaccion del asistente para ese dominio.

#### Edge Cases

- Dos archivos de configuracion con el mismo domain_id. El sistema debe manejar el conflicto de forma determinista (ultimo archivo procesado gana, o error explicito).
- Un dominio sin documentos ingestados. El asistente debe funcionar pero indicar que no tiene informacion disponible.

---

### US-07: Interfaz de Chat para el Cliente Final

**As a** cliente final,
**I need** una interfaz de chat visual con burbujas de mensaje, panel de advertencias destacado y panel de fuentes consultable,
**So that** pueda interactuar con el asistente de forma intuitiva, confiar en la informacion recibida y verificar su origen.

#### Acceptance Criteria

- AC-07.1: La interfaz presenta un campo de texto para escribir preguntas y un boton de envio.
- AC-07.2: Las respuestas se muestran en formato de burbuja de chat.
- AC-07.3: Las advertencias de seguridad se muestran en un panel visualmente diferenciado (colores, iconos) antes o junto a la respuesta.
- AC-07.4: Las fuentes citadas se muestran en un panel desplegable o visible debajo de la respuesta, indicando documento de origen, tipo de fragmento e identificador.
- AC-07.5: Un selector de dominio permite al cliente alternar entre los asistentes disponibles (ej: IA-Mozo, Asistente Peluqueria).
- AC-07.6: El streaming de tokens es visible: el cliente ve la respuesta escribiendose en tiempo real.

#### Edge Cases

- El backend no esta disponible. La interfaz muestra un mensaje de error y no queda en estado bloqueado.
- La respuesta no contiene advertencias ni fuentes. Los paneles correspondientes no se muestran (no quedan vacios visibles).

---

### US-08: Panel de Administracion para Gestion de Conocimiento

**As an** administrador del negocio,
**I need** una interfaz web donde pueda subir documentos PDF o JSON, ver el resultado de la ingesta y probar preguntas rapidas,
**So that** pueda gestionar la base de conocimiento del asistente sin usar herramientas tecnicas de linea de comandos.

#### Acceptance Criteria

- AC-08.1: La interfaz permite seleccionar un dominio y subir un archivo PDF para ingesta.
- AC-08.2: La interfaz permite seleccionar un dominio y pegar contenido JSON para ingesta.
- AC-08.3: Tras cada ingesta, se muestra el resultado: cantidad de items detectados, cantidad de fragmentos generados, modo de procesamiento (canonico o raw) y errores si los hubo.
- AC-08.4: La interfaz incluye un campo de prueba rapida (smoke test) donde el administrador puede escribir una pregunta y verificar que el asistente responde correctamente para un dominio dado.

#### Edge Cases

- El administrador intenta subir un archivo que no es PDF. La interfaz muestra el error devuelto por el backend.
- El administrador pega JSON malformado. La interfaz muestra los errores de validacion.

---

### US-09: Clonado de Dominio sin Modificar Codigo

**As an** operador de plataforma,
**I need** que el sistema soporte multiples dominios simultaneamente donde cada uno tiene su propia base de conocimiento, prompt de sistema, politicas y tipos de fragmento, compartiendo el mismo nucleo de procesamiento,
**So that** pueda escalar la plataforma a nuevas verticales de negocio con minimo esfuerzo y sin riesgo de regresion en dominios existentes.

#### Acceptance Criteria

- AC-09.1: Dos dominios activos simultaneamente (ej: restaurante y peluqueria) funcionan de forma completamente independiente: sus documentos, fragmentos, prompts y politicas no se mezclan.
- AC-09.2: Una pregunta dirigida al dominio "restaurant" solo recupera fragmentos de la coleccion de restaurante.
- AC-09.3: Una pregunta dirigida al dominio "hair_salon" usa el prompt de sistema de peluqueria, no el de restaurante.
- AC-09.4: Los disclaimers de salud son especificos por dominio: restaurante recomienda consultar al personal del local; peluqueria recomienda consultar a un profesional.
- AC-09.5: Agregar el segundo dominio no requiere modificar ningun archivo de codigo fuente del backend ni del frontend.

#### Edge Cases

- Un dominio se elimina o desactiva. Las consultas a ese dominio retornan un error descriptivo en lugar de una respuesta vacia o incorrecta.

---

### US-10: Verificacion de Salud del Sistema

**As an** operador de plataforma,
**I need** un mecanismo para verificar que el servicio backend esta activo y operativo,
**So that** pueda integrar el sistema con herramientas de monitoreo y detectar caidas de forma automatizada.

#### Acceptance Criteria

- AC-10.1: El sistema expone un endpoint de health check que retorna un indicador de estado positivo cuando el servicio esta operativo.
- AC-10.2: El endpoint responde sin autenticacion y con minima latencia.

---

## 3. Requerimientos Funcionales (Formato EARS)

> Notacion EARS:
> - Ubicuo: "El sistema debe [accion]"
> - Evento: "Cuando [trigger], el sistema debe [accion]"
> - Estado: "Mientras [estado], el sistema debe [accion]"
> - Comportamiento no deseado: "Si [condicion no deseada], entonces el sistema debe [accion]"
> - Opcional: "Donde [feature], el sistema debe [accion]"

---

### 3.1 Dominio y Configuracion

**REQ-001** — El sistema debe permitir la definicion de multiples dominios, cada uno con su propio identificador unico, prompt de sistema, politicas de comportamiento, parametros de recuperacion y nombre visible.

**REQ-002** — El sistema debe cargar la configuracion de todos los dominios disponibles al momento de iniciar el servicio.

**REQ-003** — Cuando un dominio se referencia en una peticion, el sistema debe resolver su configuracion completa (prompt, politicas, parametros) a partir del identificador de dominio provisto.

**REQ-004** — Si un dominio referenciado en una peticion no existe en el registro, entonces el sistema debe retornar un error descriptivo indicando que el dominio es invalido.

**REQ-005** — Si un archivo de configuracion de dominio contiene errores de formato o campos obligatorios faltantes, entonces el sistema debe reportar el error y continuar cargando los demas dominios validos.

**REQ-006** — El sistema debe exponer la lista de dominios configurados con su identificador y nombre visible para consumo del frontend.

**REQ-007** — El sistema debe permitir la creacion o actualizacion de la configuracion de un dominio a traves de una peticion de la interfaz de administracion.

---

### 3.2 Ingesta y Fragmentacion

**REQ-008** — El sistema debe aceptar documentos en formato JSON con estructura canonica definida por dominio, validarlos contra el esquema correspondiente y transformarlos en fragmentos semanticos indexados.

**REQ-009** — El sistema debe aceptar documentos en formato PDF, extraer el texto contenido y transformarlo en fragmentos indexados.

**REQ-010** — Donde existe un parser especializado para un dominio (ej: parser de fichas de restaurante), el sistema debe convertir el texto extraido del PDF en estructuras canonicas con fragmentos semanticos individuales por seccion conceptual.

**REQ-011** — Donde no existe un parser especializado para un dominio, el sistema debe almacenar el texto completo del PDF como un unico fragmento de tipo generico.

**REQ-012** — El sistema debe fragmentar cada estructura canonica en unidades atomicas de conocimiento separadas por concepto semantico: un fragmento para descripcion, uno para ingredientes, uno para alergenos, uno para contaminacion cruzada, uno por cada nota, uno para quimicos, uno por cada contraindicacion, uno para uso.

**REQ-013** — El sistema debe generar fragmentos solo para campos que contienen valor. Los campos vacios o ausentes no producen fragmentos.

**REQ-014** — Cada fragmento generado debe contener metadatos obligatorios: identificador de dominio, identificador del item de origen, tipo de fragmento, fuente del documento e identificador unico del fragmento.

**REQ-015** — El sistema debe convertir el texto de cada fragmento en un vector numerico (embedding) mediante un modelo de embeddings local.

**REQ-016** — El sistema debe almacenar cada fragmento junto con su vector, texto y metadatos en una coleccion del almacen vectorial correspondiente al dominio.

**REQ-017** — Cuando se reingesta un documento cuyos fragmentos ya existen, el sistema debe actualizar los fragmentos existentes sin generar duplicados.

**REQ-018** — Cuando el sistema procesa un PDF de restaurante, debe reconocer encabezados de seccion (PLATO, INGREDIENTES, ALERGENOS, CONTAMINACION CRUZADA, NOTAS, CATEGORIA, TAGS) y separar registros por delimitadores o apariciones consecutivas de encabezados de nombre.

**REQ-019** — Si el archivo subido no es un PDF, entonces el sistema debe retornar un error descriptivo indicando el formato requerido.

**REQ-020** — Si el PDF no contiene texto extraible, entonces el sistema debe retornar un error descriptivo indicando que no se pudo procesar el documento.

**REQ-021** — El sistema debe retornar como confirmacion de ingesta: la cantidad de items detectados, la cantidad de fragmentos generados y el modo de procesamiento utilizado.

---

### 3.3 Recuperacion y Generacion de Respuesta

**REQ-022** — Cuando el usuario envia una pregunta, el sistema debe recuperar los fragmentos mas relevantes del almacen vectorial correspondiente al dominio, utilizando busqueda por similitud con filtro por identificador de dominio.

**REQ-023** — La cantidad de fragmentos a recuperar debe ser configurable por dominio mediante el parametro top_k de la configuracion.

**REQ-024** — El sistema debe construir un prompt que combine el prompt de sistema del dominio, los fragmentos recuperados formateados como contexto numerado con sus metadatos, y la pregunta del usuario.

**REQ-025** — El prompt debe instruir explicitamente al modelo de lenguaje a responder solo con base en el contexto provisto, a declarar cuando la informacion es insuficiente, a incluir advertencias si corresponde y a listar las fuentes utilizadas.

**REQ-026** — El sistema debe enviar el prompt construido al modelo de lenguaje local y obtener una respuesta textual.

**REQ-027** — El sistema debe estructurar toda respuesta final como un objeto con tres campos: respuesta textual (answer), lista de advertencias (warnings) y lista de fuentes citadas (sources).

**REQ-028** — Cada fuente citada en la respuesta debe contener: identificador de la fuente original, identificador del fragmento y tipo de fragmento.

**REQ-029** — El sistema debe limitar las fuentes citadas a un maximo de 10 por respuesta.

---

### 3.4 Politicas de Seguridad y Validacion

**REQ-030** — El sistema debe mantener una lista de terminos trigger de salud. Los terminos deben cubrir al menos: alergias, celiaquia, intolerancia, embarazo, asma, dermatitis, urticaria, anafilaxia, hipertension y diabetes.

**REQ-031** — Cuando la pregunta del usuario contiene al menos un termino trigger de salud, el sistema debe agregar un disclaimer obligatorio a la lista de advertencias de la respuesta.

**REQ-032** — El disclaimer de salud debe ser especifico por dominio: para restaurante debe recomendar consultar al personal del local; para peluqueria debe recomendar consultar a un profesional; para cualquier otro dominio debe recomendar consultar a un profesional generico.

**REQ-033** — Donde el dominio es restaurante y los fragmentos recuperados contienen un fragmento de tipo contaminacion cruzada, el sistema debe agregar una advertencia de contaminacion cruzada a la respuesta, independientemente del contenido de la pregunta.

**REQ-034** — Si no se recuperaron fragmentos relevantes para la pregunta, entonces el sistema debe agregar una advertencia indicando que no se encontraron fuentes internas relevantes.

**REQ-035** — La lista de advertencias no debe contener duplicados. El orden de insercion debe preservarse.

**REQ-036** — El sistema no debe emitir consejos medicos concluyentes bajo ningun dominio ni circunstancia. El prompt de sistema debe incluir esta restriccion explicita.

---

### 3.5 Streaming de Respuesta

**REQ-037** — El sistema debe soportar un modo de respuesta en streaming donde los tokens generados por el modelo se transmiten al cliente de forma incremental.

**REQ-038** — El flujo de streaming debe emitir los siguientes tipos de evento en orden garantizado: metadatos del dominio, fuentes recuperadas, advertencias (si aplica), inicio de generacion, tokens individuales, y finalizacion o error.

**REQ-039** — Las fuentes y advertencias deben emitirse antes del primer token de la respuesta, para que la interfaz pueda renderizarlas inmediatamente.

**REQ-040** — Si ocurre un error durante la generacion en streaming, entonces el sistema debe emitir un evento de error descriptivo y no emitir el evento de finalizacion exitosa.

---

### 3.6 Gestion de Sesion

**REQ-041** — El sistema debe almacenar las ultimas preguntas del usuario por sesion, identificadas por la combinacion de dominio e identificador de sesion.

**REQ-042** — El historial de sesion debe limitarse a las 10 preguntas mas recientes para evitar crecimiento ilimitado.

**REQ-043** — Cada sesion es independiente: las preguntas de una sesion no afectan ni son visibles desde otra sesion.

---

### 3.7 Interfaz de Usuario — Chat

**REQ-044** — La interfaz de chat debe presentar un selector de dominio que permita al usuario alternar entre los asistentes disponibles.

**REQ-045** — La interfaz de chat debe mostrar la respuesta del asistente en formato de burbuja de mensaje con streaming visible token por token.

**REQ-046** — Mientras el sistema esta generando una respuesta, la interfaz debe deshabilitar el campo de entrada y el boton de envio para evitar envios duplicados.

**REQ-047** — Cuando la generacion se completa o se produce un error, la interfaz debe rehabilitar el campo de entrada y el boton de envio.

**REQ-048** — Las advertencias deben mostrarse en un panel visualmente diferenciado con indicadores de alerta.

**REQ-049** — Las fuentes citadas deben mostrarse en un panel identificable debajo o junto a la respuesta.

**REQ-050** — Si la respuesta no contiene advertencias, el panel de advertencias no debe mostrarse. Si no contiene fuentes, el panel de fuentes no debe mostrarse.

---

### 3.8 Interfaz de Usuario — Administracion

**REQ-051** — La interfaz de administracion debe permitir subir un archivo PDF asociado a un dominio seleccionado.

**REQ-052** — La interfaz de administracion debe permitir pegar contenido JSON asociado a un dominio seleccionado.

**REQ-053** — Tras cada operacion de ingesta, la interfaz debe mostrar el resultado: items detectados, fragmentos generados, modo de procesamiento y errores.

**REQ-054** — La interfaz de administracion debe incluir un campo de prueba rapida (smoke test) para verificar que el asistente responde correctamente en un dominio dado.

---

### 3.9 Esquemas Canonicos por Dominio

**REQ-055** — El dominio "restaurant" debe definir un esquema canonico para platos que incluya: identificador unico del plato, nombre, categoria, etiquetas, descripcion corta, descripcion completa, lista de ingredientes, lista de alergenos con nombre y nivel de severidad (informativo, advertencia, critico), informacion de contaminacion cruzada con declaracion general y lista de trazas posibles, datos nutricionales opcionales, notas y fuentes de origen.

**REQ-056** — El dominio "hair_salon" debe definir un esquema canonico para productos que incluya: identificador unico del producto, nombre, tipo de producto, etiquetas, descripcion, instrucciones de uso, lista de quimicos con nombre INCI y rol funcional, lista de contraindicaciones con condicion y guia de accion, notas y fuentes de origen.

**REQ-057** — Cada esquema canonico debe validar los datos de entrada al momento de la ingesta, rechazando payloads que no cumplan con los campos obligatorios.

---

## 4. Requerimientos No Funcionales

---

### 4.1 Privacidad y Ejecucion Local

**NFR-001** — El sistema debe ejecutar toda inferencia de modelo de lenguaje y generacion de embeddings de forma local, sin enviar datos del usuario ni contenido de documentos a servicios externos en la nube.

**NFR-002** — Ningun dato de documentos internos del negocio debe transmitirse fuera del entorno de ejecucion local.

---

### 4.2 Rendimiento

**NFR-003** — El primer evento de streaming (metadatos) debe emitirse en menos de 2 segundos tras la recepcion de la pregunta, asumiendo que los servicios de infraestructura (almacen vectorial, modelo de lenguaje, cache) estan operativos y en condiciones normales de carga.

**NFR-004** — La ingesta de un documento JSON canonico con 5 secciones debe completarse en menos de 30 segundos, incluyendo generacion de embeddings y almacenamiento.

**NFR-005** — El cache de sesion debe operar con latencia inferior a 10 milisegundos para operaciones de lectura y escritura.

---

### 4.3 Escalabilidad

**NFR-006** — El sistema debe soportar al menos 10 dominios configurados simultaneamente sin degradacion observable de rendimiento en la carga de configuracion ni en el despacho de peticiones.

**NFR-007** — Cada dominio debe soportar al menos 10,000 fragmentos indexados en su coleccion vectorial sin degradacion significativa en la latencia de recuperacion.

---

### 4.4 Disponibilidad y Resiliencia

**NFR-008** — El sistema debe exponer un endpoint de verificacion de salud que responda sin autenticacion y con latencia inferior a 100 milisegundos.

**NFR-009** — Si el servicio de cache de sesion no esta disponible, el sistema debe continuar procesando preguntas sin historial de sesion, en lugar de rechazar la peticion.

**NFR-010** — Si el servicio de modelo de lenguaje local no esta disponible, el sistema debe retornar un error descriptivo indicando que la generacion no es posible en ese momento.

---

### 4.5 Seguridad

**NFR-011** — El sistema debe validar todos los datos de entrada (payloads JSON, archivos PDF, parametros de peticion) antes de procesarlos, rechazando inputs malformados con errores descriptivos.

**NFR-012** — La carga de archivos de configuracion debe usar parsing seguro (safe loading) para prevenir ejecucion de codigo arbitrario.

**NFR-013** — El sistema no debe exponer trazas de error internas (stack traces, rutas de archivos del servidor) en las respuestas de error al cliente.

---

### 4.6 Observabilidad

**NFR-014** — Cada peticion al sistema debe generar un identificador de traza (trace_id) que permita correlacionar la peticion con su procesamiento a lo largo de todo el flujo del grafo.

**NFR-015** — El sistema debe registrar logs de cada nodo del grafo de procesamiento (recuperacion, generacion, validacion, formateo) con el trace_id correspondiente.

---

### 4.7 Mantenibilidad y Extensibilidad

**NFR-016** — El nucleo del sistema (pipeline de ingesta, grafo de procesamiento, motor de recuperacion, endpoints de API, interfaz de usuario) no debe contener logica especifica de ningun dominio. Toda variacion por dominio debe resolverse mediante configuracion declarativa y datos.

**NFR-017** — Los esquemas canonicos de nuevos dominios deben poder agregarse sin modificar los esquemas de dominios existentes.

**NFR-018** — La interfaz de usuario debe renderizar dinamicamente la lista de dominios disponibles a partir de la respuesta del endpoint de dominios, sin requerir cambios en el codigo del frontend para agregar nuevos dominios.

---

### 4.8 Portabilidad

**NFR-019** — Todas las dependencias de infraestructura (almacen vectorial, cache, modelo de lenguaje) deben ser configurables mediante variables de entorno, permitiendo desplegar el sistema en diferentes entornos sin modificar codigo.

**NFR-020** — El sistema debe poder ejecutarse completamente en un entorno de desarrollo local con un unico comando por servicio (backend, cache, modelo de lenguaje).

---

## 5. Dependencias y Restricciones

### 5.1 Dependencias Externas

| Dependencia | Tipo | Descripcion |
|-------------|------|-------------|
| Servicio de modelo de lenguaje local | Runtime | Debe estar ejecutandose y sirviendo al menos un modelo de lenguaje y un modelo de embeddings |
| Servicio de almacen vectorial | Runtime | Debe estar accesible para almacenamiento y recuperacion de fragmentos |
| Servicio de cache | Runtime | Debe estar accesible para gestion de sesiones. Degradacion aceptable: funciona sin cache |
| Contenedor Docker | Operacional | Requerido para ejecutar el servicio de cache en desarrollo |

### 5.2 Restricciones de Negocio

- **Privacidad de datos**: Ningun dato de documentos o conversaciones puede salir del entorno local. Esto excluye el uso de APIs de LLM en la nube.
- **Responsabilidad legal**: El sistema no debe emitir consejos medicos concluyentes. Todo disclaimer debe derivar a un profesional humano.
- **Trazabilidad**: Toda afirmacion del asistente debe poder rastrearse hasta el fragmento y documento de origen.

### 5.3 Restricciones de Alcance MVP

- El MVP se centra en un dominio funcional completo (restaurante / IA-Mozo).
- El segundo dominio (peluqueria) se valida como prueba de clonabilidad, no como producto completo.
- No se implementa autenticacion de usuarios en el MVP.
- No se implementa rate-limiting en el MVP.
- No se implementa cola de ingesta asincrona en el MVP.
- El historial de sesion no tiene TTL en el MVP (revisar para produccion).

---

## 6. Supuestos

- SUP-01: Los documentos PDF del negocio contienen texto extraible (no son imagenes escaneadas).
- SUP-02: Los PDFs de restaurante siguen una estructura semi-estandarizada con encabezados de seccion reconocibles (PLATO, INGREDIENTES, ALERGENOS, etc.).
- SUP-03: El administrador tiene acceso al entorno de ejecucion para iniciar los servicios requeridos (backend, cache, modelo de lenguaje).
- SUP-04: El hardware del entorno local soporta la ejecucion de un modelo de lenguaje de 8B parametros con latencia aceptable.
- SUP-05: Los documentos internos del negocio estan en idioma espanol.

---

## 7. Preguntas Abiertas

- [NEEDS CLARIFICATION: autenticacion] — El MVP no incluye autenticacion. Debe definirse para la version de produccion si los endpoints de ingesta y gestion de dominios requieren proteccion por roles (admin vs. usuario final).
- [NEEDS CLARIFICATION: multi-idioma] — El SUP-05 asume espanol. Si se requiere soporte para otros idiomas, debe evaluarse el impacto en los triggers de salud, los disclaimers y el modelo de embeddings.
- [NEEDS CLARIFICATION: limites de archivo] — No se ha definido un tamano maximo para los archivos PDF aceptados. Debe establecerse un limite para prevenir agotamiento de memoria durante el parsing.
- [NEEDS CLARIFICATION: TTL de sesion] — El historial de sesion no expira en el MVP. Debe definirse una politica de expiracion para produccion.
- [NEEDS CLARIFICATION: eliminacion de documentos] — No se ha especificado un mecanismo para eliminar documentos o fragmentos previamente ingestados. Debe definirse si el administrador necesita esta capacidad.
- [NEEDS CLARIFICATION: metricas de calidad] — No se han definido umbrales de relevancia (score threshold) para la busqueda vectorial. Debe evaluarse si se descartan fragmentos con distancia superior a un umbral configurable.

---

## Apendice: Trazabilidad Requisitos - User Stories

| Requisito | User Story |
|-----------|-----------|
| REQ-001 a REQ-007 | US-06 (Configuracion de Dominios) |
| REQ-008 a REQ-021 | US-04 (Ingesta JSON), US-05 (Ingesta PDF) |
| REQ-022 a REQ-029 | US-01 (Consulta Conversacional) |
| REQ-030 a REQ-036 | US-02 (Advertencias de Seguridad) |
| REQ-037 a REQ-040 | US-03 (Streaming) |
| REQ-041 a REQ-043 | US-01 (Consulta Conversacional — Sesion) |
| REQ-044 a REQ-050 | US-07 (Interfaz de Chat) |
| REQ-051 a REQ-054 | US-08 (Panel de Administracion) |
| REQ-055 a REQ-057 | US-04 (Ingesta JSON — Esquemas), US-09 (Clonado) |
| NFR-001 a NFR-002 | US-01 (Privacidad implica ejecucion local) |
| NFR-016 a NFR-018 | US-06 (Configuracion), US-09 (Clonado) |
