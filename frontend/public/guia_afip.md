# Informe Completo: Cómo Obtener Credenciales y Conectar tu POS a ARCA para Facturación Automática

Todo lo necesario para que tu sistema POS pueda emitir facturas electrónicas automáticamente pasa por 3 credenciales/elementos clave: un **Certificado Digital X.509**, un **Token+Sign temporal del WSAA**, y un **Punto de Venta habilitado para Web Services**. A continuación el proceso completo, todo extraído de la documentación oficial de ARCA.

## Fuentes Oficiales
Toda la información de esta guía viene directamente de los siguientes portales oficiales de ARCA:

| Recurso | URL Oficial |
| --- | --- |
| Portal principal WS SOAP | https://www.afip.gob.ar/ws/ |
| Arquitectura general | https://www.afip.gob.ar/ws/documentacion/arquitectura-general.asp |
| Certificados digitales | https://www.afip.gob.ar/ws/documentacion/certificados.asp |
| WSAA (Autenticación) | https://www.afip.gob.ar/ws/documentacion/wsaa.asp |
| WS Factura Electrónica | https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp |
| Catálogo de WS disponibles | https://www.afip.gob.ar/ws/documentacion/catalogo.asp |

## Arquitectura: cómo funciona la conexión
El intercambio de información entre tu POS y ARCA se implementa a través de **Web Services SOAP sobre HTTPS**. No se necesitan VPNs ni canales especiales: todo corre por Internet. El flujo tiene dos capas:

1. **WSAA (Web Service de Autenticación y Autorización)**: autentica tu aplicación y entrega un Ticket de Acceso (TA) con validez de 12 horas.
2. **WSFEv1 (Web Service de Factura Electrónica V1)**: recibe los datos de la venta y devuelve el CAE (Código de Autorización Electrónico).

La autenticación usa criptografía de clave pública con certificados digitales X.509. ARCA actúa como Autoridad Certificante y emite los certificados sin costo.

---

## PASO 1 — Crear y registrar el Punto de Venta para Web Services
Antes de pedir credenciales, necesitás tener un punto de venta específico para WS (diferente al manual).

**Cómo hacerlo:**
1. Ingresá a ARCA con tu CUIT y Clave Fiscal en: https://auth.afip.gob.ar/contribuyente_/login.xhtml
2. Buscá el servicio **"Administración de puntos de venta y domicilios"**.
3. En "A/B/M de Puntos de Venta" → Alta de nuevo punto de venta.
4. En el campo "Sistema de Facturación" elegí la opción **"Web Services"**.
5. Asigná un número de PV que no uses para facturación manual (ej: PV 3 o PV 10).

> ⚠️ Este punto de venta va a ser el que uses en todos los requests de facturación electrónica.

---

## PASO 2 — Obtener el Certificado Digital (la credencial principal)
El certificado digital es la "llave" de tu aplicación para conectarse a ARCA. Hay uno para testing y otro para producción.

### 2A. Certificado para TESTING / Homologación
📄 **Documentación oficial:**
- Cómo adherirse al WSASS: [PDF](https://www.afip.gob.ar/ws/WSASS/WSASS_como_adherirse.pdf)
- Manual completo del WSASS: [HTML](https://www.afip.gob.ar/ws/WSASS/html/index.html) | [PDF](https://www.afip.gob.ar/ws/WSASS/WSASS_manual.pdf)

Para testing se usa la aplicación web WSASS (Autoservicio de Acceso a APIs de Homologación). El proceso es:
1. Ingresá con Clave Fiscal de una persona física (no de persona jurídica) al Administrador de Relaciones de Clave Fiscal.
2. Adherite al servicio "WSASS" desde ese administrador.
3. Dentro del WSASS generás tu par de claves y descargás el `.crt` de testing.

### 2B. Certificado para PRODUCCIÓN
📄 **Documentación oficial:**
- Guía para obtener el certificado de producción: [PDF](https://www.afip.gob.ar/ws/WSAA/wsaa_obtener_certificado_produccion.pdf)
- Guía para asociar el certificado a un WS de negocio: [PDF](https://www.afip.gob.ar/ws/WSAA/wsaa_asociar_certificado_a_wsn_produccion.pdf)
- Guía general de generación de certificados: [PDF](https://www.afip.gob.ar/ws/WSAA/WSAA.ObtenerCertificado.pdf)

**Los pasos para producción son:**
1. Ingresá a ARCA con Clave Fiscal: https://auth.afip.gob.ar/contribuyente_/login.xhtml
2. Accedé al servicio **"Administración de Certificados Digitales"**.
3. Generá un par de claves RSA (pública/privada) desde de la terminal (ej. en Mac o Linux, o descargá OpenSSL para Windows):
   ```bash
   openssl genrsa -out private.key 2048
   openssl req -new -key private.key -subj "/C=AR/O=MiEmpresa/CN=MiApp/serialNumber=CUIT XXXXXXXXXXXXXXX" -out cert.csr
   ```
4. Subís la clave pública (`cert.csr`) en la aplicación de ARCA.
5. Descargás el certificado `.crt` firmado por ARCA.
6. **Guardás junto con tu `private.key` — esas dos son tus credenciales.**

---

## PASO 3 — Asociar el Certificado al Servicio WSFEv1
Tener el certificado no alcanza; hay que decirle a ARCA que ese certificado tiene permiso para usar el servicio de facturación.

📄 **Guía oficial:** [PDF](https://www.afip.gob.ar/ws/WSAA/ADMINREL.DelegarWS.pdf)

**El proceso es:**
1. Ingresá al "Administrador de Relaciones de Clave Fiscal": https://auth.afip.gob.ar/contribuyente_/login.xhtml?action=SYSTEM&system=adminrel
2. Buscá el servicio **"wsfe" o "wsfev1"** en el listado.
3. Asociá tu certificado digital a ese servicio para el CUIT correspondiente.

*(Para testing esto se hace desde el mismo WSASS. Para producción se usa el Administrador de Relaciones).*

---

## PASO 4 — Autenticarte con el WSAA
Con el certificado en mano, tu app pide un Ticket de Acceso (TA) al WSAA antes de cada sesión de facturación.

📄 **Manual del desarrollador WSAA:** [PDF](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)
📄 **Especificación técnica del WSAA:** [PDF](https://www.afip.gob.ar/ws/WSAA/Especificacion_Tecnica_WSAA_1.2.2.pdf)

**Endpoints del WSAA:**
- **Testing**: `https://wsaahomo.afip.gov.ar/ws/services/LoginCms`
- **Producción**: `https://wsaa.afip.gov.ar/ws/services/LoginCms`

La respuesta del WSAA devuelve `<Token>` y `<Sign>` que se incluyen en cada llamada al WSFEv1. Esos tokens duran 12 horas y pueden reutilizarse para múltiples facturas.

---

## PASO 5 — Emitir la Factura con WSFEv1
Con el TA activo ya podés llamar al WS de negocio para obtener el CAE.

📄 **Manual del desarrollador WSFEv1 V4.1:** [Portal](https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp)

**Endpoints del WSFEv1:**
- **Testing**: `https://wswhomo.afip.gov.ar/wsfev1/service.asmx`
- **Producción**: `https://servicios1.afip.gov.ar/wsfev1/service.asmx`

---

## PASO 6 — Cadenas de Certificación (necesarias para validar SSL)
Dependiendo de cuándo creaste el certificado, necesitás descargar la cadena correspondiente:

**Testing:**
- Cadena 2014–2024: [ZIP](https://www.afip.gob.ar/ws/WSASS/Cadena_de_certificacion_homo_2014_2024.zip)
- Cadena 2022–2034: [ZIP](https://www.afip.gob.ar/ws/WSASS/Cadena_de_certificacion_homo_2022_2034.zip)

**Producción:**
- Cadena 2016–2024: [ZIP](https://www.afip.gob.ar/ws/documentacion/certificados/Cadena_de_certificacion_prod_2016_2024.zip)
- Cadena 2024–2035: [ZIP](https://www.afip.gob.ar/ws/documentacion/certificados/Cadena_de_certificacion_prod_2024_2035.zip)

---

## Resumen del flujo completo
```text
Tu POS                         ARCA
  |                              |
  |-- 1. Login CMS (cert.crt) -->| WSAA
  |<-- Token + Sign -------------|
  |                              |
  |-- 2. FECAESolicitar -------->| WSFEv1
  |   (Token, Sign, datos venta) |
  |<-- CAE + FchVto -------------|
  |                              |
  Imprimís la factura con el CAE
```
