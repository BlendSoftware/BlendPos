# Proyecto BlendPOS: Especificaciones del Sistema

## Introduccion

El presente documento describe las especificaciones completas para el desarrollo de BlendPOS, un sistema de punto de venta (Point of Sale) de mision critica diseñado especificamente para la alta rotacion y granularidad de stock propia de un Kiosco o Drugstore. La plataforma se construye sobre una arquitectura Cliente-Servidor robusta que combina un backend en Python con FastAPI, validacion estricta de datos mediante Pydantic V2, persistencia transaccional en PostgreSQL y un frontend reactivo en React con Vite, TypeScript, TailwindCSS y ShadcnUI.

El objetivo central es construir un sistema que permita realizar ventas de alta velocidad con latencia inferior a 100 milisegundos, gestionar un inventario jerarquico con desarme automatico de bultos, operar un modulo completo de caja y tesoreria, generar facturacion hibrida con integracion fiscal AFIP, administrar proveedores y costos con carga masiva, y ofrecer un modo de consulta de precios aislado, todo asegurado mediante autenticacion JWT y preparado para despliegue containerizado con Docker.

---

## Vision General del Sistema

BlendPOS opera como un ecosistema integrado que cubre las siguientes areas funcionales: registro de ventas de alta velocidad optimizado para atajos de teclado y lectores de codigos de barras, gestion de inventario jerarquico con relacion padre-hijo entre bultos cerrados y unidades individuales, gestion de caja y tesoreria con apertura, arqueo ciego, cierre y deteccion de desvios, facturacion hibrida con integracion fiscal AFIP y generacion de comprobantes PDF internos con envio asincrono por email, administracion de proveedores y costos con carga masiva CSV y actualizacion de precios por porcentaje, y un modo de consulta de precios aislado que no afecta el flujo de ventas.

El sistema se despliega como una aplicacion cliente-servidor donde el backend expone una API REST que orquesta toda la logica de negocio y transaccionalidad, mientras el frontend provee una interfaz reactiva optimizada para velocidad de operacion. La base de datos PostgreSQL garantiza integridad transaccional ACID en todas las operaciones criticas, particularmente en el desarme automatico de inventario y en el registro de movimientos de caja.

La arquitectura esta diseñada para soportar multiples puntos de venta conectados al mismo servidor, permitiendo operacion concurrente sin conflictos de stock ni inconsistencias contables.

---

## Stack Tecnologico

El backend del sistema se construye sobre FastAPI como framework de API REST, aprovechando su soporte nativo para operaciones asincronas, validacion automatica con Pydantic V2 y generacion de documentacion OpenAPI. SQLAlchemy 2.0 con Alembic gestiona el ORM y las migraciones de base de datos sobre PostgreSQL.

PostgreSQL funciona como la base de datos relacional principal, garantizando transacciones ACID para todas las operaciones criticas del sistema: ventas, movimientos de inventario, operaciones de caja y facturacion. Su soporte nativo para JSONB permite almacenar metadatos flexibles como detalles de facturacion fiscal.

El sistema de autenticacion se implementa mediante JWT (JSON Web Tokens) siguiendo el estandar OAuth2, con roles diferenciados para cajeros, administradores y supervisores. Cada endpoint esta protegido por permisos basados en rol.

Celery con Redis como broker gestiona tareas asincronas como la generacion de comprobantes PDF, el envio de emails y la sincronizacion con los servicios fiscales de AFIP.

El frontend se implementa en React con Vite y TypeScript, estilizado con TailwindCSS y componentes ShadcnUI. La interfaz esta optimizada para operacion mediante atajos de teclado, lectores de codigos de barras y pantallas tactiles, priorizando la velocidad de despacho sobre la estetica decorativa.

---

## Modelo de Inventario Jerarquico

El sistema define un modelo de inventario innovador basado en una relacion jerarquica Padre/Hijo que resuelve el problema fundamental de los kioscos: vender unidades individuales provenientes de bultos cerrados.

La primera entidad es el Producto Padre (bulto), que representa la unidad de compra al proveedor. Por ejemplo, una caja de 12 latas de Coca-Cola 354ml. El producto padre tiene su propio stock, precio de costo, codigo de barras y proveedor asociado.

La segunda entidad es el Producto Hijo (unidad), que representa la unidad de venta al consumidor final. Siguiendo el ejemplo, una lata individual de Coca-Cola 354ml. El producto hijo tiene su propio precio de venta, codigo de barras y stock independiente.

La relacion entre ambos se define por el campo `units_per_parent`, que indica cuantas unidades hijo contiene cada unidad padre. Cuando el stock del producto hijo se agota o resulta insuficiente para una venta, el sistema ejecuta un desarme automatico: decrementa una unidad del producto padre y acredita `units_per_parent` unidades al producto hijo, todo dentro de una transaccion atomica que garantiza integridad ACID.

Este mecanismo permite que el cajero simplemente escanee el producto y venda, sin preocuparse por abrir cajas manualmente ni ajustar stocks a mano. El sistema se encarga de toda la logica de conversion automaticamente.

Los productos que no forman parte de una jerarquia operan como productos simples, con stock directo sin relacion padre-hijo.

---

## Modulo de Ventas de Alta Velocidad

El sistema de ventas esta diseñado para operar con latencia inferior a 100 milisegundos en el registro de items, optimizado para tres metodos de entrada: escaneo de codigo de barras, busqueda por nombre con autocompletado y atajos de teclado.

Cada venta se registra como una transaccion atomica que incluye: la creacion del ticket de venta con todos sus items, el decremento de stock de cada producto vendido (con posible desarme automatico de bultos), el registro del movimiento de caja correspondiente y, opcionalmente, la generacion del comprobante fiscal.

El modulo soporta multiples metodos de pago: efectivo (con calculo automatico de vuelto), tarjeta de debito, tarjeta de credito, transferencia bancaria y pagos mixtos que combinan varios metodos en una misma transaccion. Cada metodo de pago se registra de forma independiente para el cierre de caja.

La interfaz de ventas presenta un layout optimizado para velocidad: un campo de busqueda prominente con foco automatico, una grilla de items agregados con cantidades editables, un panel de totales y un area de finalizacion con atajos de teclado. La tecla F2 busca por nombre, F3 aplica descuento, F10 finaliza la venta, Escape cancela, y las flechas navegan entre items.

Las ventas se asocian obligatoriamente a una sesion de caja abierta. No es posible registrar ventas sin una caja activa.

---

## Modulo de Caja y Tesoreria

El modulo de caja gestiona el ciclo de vida completo de una sesion de caja: apertura con monto inicial, operaciones durante el turno (ventas, ingresos, egresos), arqueo ciego al cierre y deteccion automatica de desvios.

La apertura de caja registra el monto inicial declarado por el cajero, el identificador del punto de venta, la fecha y hora, y el usuario responsable. Desde este momento, toda operacion monetaria se vincula a esta sesion de caja.

Durante la operacion, el sistema registra cada movimiento de caja como un evento inmutable: ventas (ingreso por cada metodo de pago), ingresos manuales (ej: cambio recibido de otro local), egresos manuales (ej: pago a proveedor en efectivo) y anulaciones (que generan un movimiento inverso, nunca eliminan el original).

El cierre de caja implementa un arqueo ciego: el cajero declara lo que contó en caja (efectivo, comprobantes de tarjeta, transferencias) sin ver el monto esperado por el sistema. Solo despues de confirmar la declaracion, el sistema calcula la diferencia entre lo esperado (sumatoria de movimientos) y lo declarado. Los desvios se clasifican por umbral: hasta un 1% se reporta como normal, entre 1% y 5% como advertencia, y mas del 5% como critico, requiriendo justificacion obligatoria del supervisor.

Cada sesion de caja genera un reporte completo con desglose por metodo de pago, lista de movimientos, monto inicial, monto esperado, monto declarado, desvio y observaciones.

---

## Motor de Facturacion Hibrida

El sistema de facturacion opera en dos modos complementarios.

El modo fiscal integra con los web services de AFIP para la emision de comprobantes electronicos (facturas A, B y C; notas de credito y debito). La comunicacion se realiza mediante los servicios WSAA (autenticacion) y WSFEV1 (facturacion electronica), utilizando certificados digitales. El proceso de facturacion es asincrono: la venta se registra inmediatamente y la factura se emite en segundo plano via Celery, evitando que una falla de conectividad con AFIP bloquee la operacion de caja.

El modo interno genera comprobantes PDF para operaciones que no requieren factura fiscal (tickets de venta para consumidor final, remitos, presupuestos). Los PDFs se generan con ReportLab, siguiendo un formato configurable que incluye el logo del negocio, datos del contribuyente, detalle de items, totales, metodo de pago y codigo QR para facturacion electronica cuando aplica.

Ambos modos soportan envio asincrono por email: una vez generado el comprobante (fiscal o interno), se encola una tarea de envio al email del cliente si este fue proporcionado. El envio utiliza SMTP configurado por variables de entorno.

La informacion fiscal (CUIT emisor, punto de venta, tipo de contribuyente, inicio de actividades, condicion frente al IVA) se configura una vez en el sistema y se aplica automaticamente a todos los comprobantes.

---

## Administracion de Proveedores y Costos

El modulo de proveedores gestiona la relacion comercial con cada proveedor: datos de contacto, CUIT, condiciones de pago, historico de compras y lista de productos asociados.

La actualizacion de precios de costo se realiza de dos maneras. La primera es la actualizacion individual, donde el administrador modifica el precio de costo de un producto y opcionalmente recalcula el precio de venta aplicando el margen configurado. La segunda es la actualizacion masiva por porcentaje, donde el administrador selecciona un proveedor y aplica un incremento porcentual a todos sus productos en una sola operacion. El sistema muestra una vista previa con los precios actuales, los nuevos precios y la diferencia antes de confirmar.

La carga masiva CSV permite importar catalogos completos de proveedores. El archivo CSV debe seguir un formato estandar con columnas para codigo de barras, nombre del producto, precio de costo, precio de venta sugerido, unidades por bulto y categoria. El sistema valida cada fila, reporta errores de formato o datos inconsistentes, y procesa las filas validas mediante upsert para evitar duplicados.

El historial de compras registra cada ingreso de mercaderia: fecha, proveedor, lista de productos con cantidades y costos, monto total y numero de remito o factura del proveedor. Estos registros alimentan reportes de costo promedio ponderado y frecuencia de reposicion.

---

## Modo de Consulta de Precios

El sistema incluye un modo de operacion aislado diseñado para terminales de autoconsulta o para uso rapido del cajero. Este modo permite escanear un codigo de barras o buscar un producto por nombre y muestra unicamente la informacion publica del producto: nombre, precio de venta, stock disponible (opcionalmente) y promociones vigentes.

El modo de consulta de precios no requiere una sesion de caja activa, no registra movimientos, no modifica stock y no requiere autenticacion de cajero. Funciona como una ventana independiente que puede ejecutarse en una terminal dedicada o como un modo dentro de la interfaz principal.

---

## Seguridad y Autenticacion

El sistema implementa autenticacion JWT siguiendo el estandar OAuth2 con tres roles diferenciados.

El rol Cajero puede registrar ventas, realizar consultas de precio, declarar arqueos y visualizar reportes de su propia caja. El rol Supervisor hereda los permisos del cajero y ademas puede abrir y cerrar cajas de otros usuarios, autorizar anulaciones, visualizar reportes de caja de todos los usuarios y justificar desvios. El rol Administrador hereda todos los permisos y ademas puede gestionar productos, proveedores, usuarios, configuracion fiscal, actualizacion masiva de precios y acceso a reportes globales.

Cada token JWT incluye el user_id, el rol, el punto de venta asignado y un timestamp de expiracion. Los tokens de acceso expiran a las 8 horas (un turno de trabajo) y los tokens de refresco expiran a las 24 horas.

El sistema implementa manejo global de excepciones que:nunca expone stack traces al cliente, registra todos los errores con contexto suficiente para debugging, retorna mensajes de error descriptivos y consistentes, y distingue entre errores de validacion (422), errores de negocio (400), errores de autenticacion (401), errores de autorizacion (403) y errores internos (500).

---

## Estructura del Proyecto

El proyecto se organiza en dos grandes directorios: backend y frontend.

El backend sigue una arquitectura en capas con separacion estricta de responsabilidades. El area de API agrupa los endpoints organizados por dominio de negocio: ventas, productos, inventario, caja, facturacion, proveedores, usuarios y consulta de precios. El area de core contiene la logica de negocio pura: el servicio de ventas con logica de desarme automatico, el servicio de inventario con gestion jerarquica, el servicio de caja con ciclo de vida y arqueo, el servicio de facturacion con integracion AFIP, y el servicio de proveedores con actualizacion masiva. El area de modelos define las entidades SQLAlchemy: Producto, ProductoHijo, Venta, VentaItem, SesionCaja, MovimientoCaja, Comprobante, Proveedor, Usuario. El area de esquemas define los modelos Pydantic V2 para validacion de entrada y serializacion de salida. El area de infraestructura encapsula las conexiones con PostgreSQL, Redis y servicios externos como AFIP y SMTP.

El frontend contiene las paginas principales: POS (interfaz de ventas), CierreCaja (arqueo y cierre), Productos (ABM de productos), Inventario (gestion de stock y desarmes), Proveedores (administracion y carga CSV), Facturacion (historial y configuracion fiscal), Usuarios (gestion de roles) y ConsultaPrecios (modo aislado).

---

## Esquemas de Datos Principales

El sistema define modelos relacionales rigurosos en PostgreSQL.

El modelo Producto incluye: id, codigo de barras (unico), nombre, descripcion, categoria, precio de costo, precio de venta, margen porcentual calculado, stock actual, stock minimo para alertas de reposicion, unidad de medida, es_padre (booleano), proveedor_id y timestamps de creacion y actualizacion.

El modelo ProductoHijo extiende la relacion jerarquica: id, producto_padre_id (FK a Producto), producto_hijo_id (FK a Producto), unidades_por_padre (integer, cuantas unidades hijo contiene un padre), desarme_automatico_habilitado (booleano).

El modelo Venta incluye: id, numero de ticket, sesion_caja_id, usuario_id, lista de items, subtotal, descuento total, total final, metodos de pago con sus montos, estado (completada, anulada), comprobante_id opcional y timestamps.

El modelo SesionCaja incluye: id, punto_de_venta, usuario_id, monto_inicial, monto_esperado (calculado), monto_declarado (ingresado en cierre), desvio, estado (abierta, cerrada), lista de movimientos y timestamps.

El modelo Comprobante incluye: id, tipo (factura A/B/C, nota credito, ticket interno), numero, punto de venta, CAE (codigo de autorizacion AFIP), vencimiento CAE, datos del receptor, detalle JSON, monto total, estado (pendiente, emitido, error) y ruta del PDF generado.

---

## Modelo de Negocio y Despliegue

BlendPOS se comercializa como un producto SaaS empaquetado: el comprador alquila una maquina virtual en la nube (Digital Ocean Droplet) donde se despliega todo el sistema con un unico archivo `docker-compose.prod.yml`. El comprador accede desde el navegador de su PC como una Progressive Web App (PWA) que funciona con o sin internet.

### El "Bunker" en la Nube (Digital Ocean Droplet)

El despliegue en produccion orquesta los siguientes servicios containerizados:

- **Traefik** (reverse proxy): Es el portero del sistema. Gestiona el dominio personalizado del comprador (ej: `app.tukiosco.com`), genera y renueva certificados SSL automaticamente con Let's Encrypt, y rutea el trafico entre frontend y backend. Sin HTTPS, la PWA no puede funcionar offline.
- **Backend FastAPI**: API REST que recibe las ventas sincronizadas, ejecuta la logica de negocio y gestiona la base de datos.
- **PostgreSQL**: La fuente de la verdad. Todas las transacciones ACID, inventario, ventas y datos fiscales persisten aqui.
- **Redis**: Cache de productos frecuentes y broker de tareas asincronas para Celery.
- **Celery Worker**: Procesa facturacion AFIP, generacion de PDFs y envio de emails en segundo plano.
- **Nginx (Frontend Server)**: Sirve los archivos estaticos de la React App como PWA con manifest y service worker.

### El Cliente (El Kiosco)

El flujo de instalacion para el comprador es:

1. El comprador abre Chrome o Edge en su PC.
2. Entra a `app.tukiosco.com` (su dominio personalizado con HTTPS).
3. El navegador detecta el manifest PWA y ofrece "Instalar la App".
4. Al instalar, se descarga la PWA: se cachean los assets (JS, CSS, imagenes) y se registra el ServiceWorker.
5. Dexie.js (IndexedDB local) se llena con el catalogo completo de productos desde la nube.
6. **Listo**: ya puede vender, con o sin internet.

Cuando hay conectividad, las ventas se sincronizan automaticamente con el servidor. Cuando no hay internet, las ventas se almacenan localmente en IndexedDB y se encolan en la SyncQueue para sincronizarse cuando vuelva la conexion.

La configuracion del entorno se gestiona integramente por variables de entorno: credenciales de base de datos, configuracion SMTP, certificados AFIP, secreto JWT, dominio del cliente y parametros de negocio como razones sociales y puntos de venta.

Para desarrollo local, un archivo `docker-compose.yml` separado levanta todo el stack con hot-reload habilitado en backend y frontend.

---

## Decisiones Tecnicas Fundamentales

El inventario jerarquico se resuelve a nivel de transaccion de base de datos, no a nivel de aplicacion, garantizando que el desarme atomico nunca deje el stock en un estado inconsistente. PostgreSQL con transacciones serializables es la garantia de integridad ACID.

La facturacion es asincrona por diseño: la venta se confirma instantaneamente y el comprobante se genera en segundo plano. Esto desacopla la experiencia del cajero de la disponibilidad de AFIP.

El arqueo ciego es una decision de negocio critica: el cajero declara sin ver el esperado, lo que permite detectar desvios reales sin sesgo. El sistema calcula la diferencia post-declaracion.

La latencia objetivo de 100ms para el registro de items se logra mediante indices en codigo de barras, cache de productos frecuentes en Redis, y queries optimizadas con pool de conexiones.

El sistema esta diseñado para que la precision contable dependa de la integridad transaccional de la base de datos, no de la logica de aplicacion. Cada operacion monetaria es un evento inmutable que se registra, nunca se modifica ni se elimina.
