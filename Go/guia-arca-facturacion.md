# Guía Completa: Facturación Electrónica ARCA / AFIP con BlendPOS

> **Versión** 1.0 — Aplica a BlendPOS con el módulo `afip-sidecar`
>
> Las siglas **ARCA** (Agencia de Recaudación y Control Aduanero) son el nuevo nombre oficial de AFIP desde fines de 2024.
> Los endpoints, portales y documentación técnica pueden aparecer indistintamente como "ARCA" o "AFIP".

---

## Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [¿Qué hace el sistema internamente?](#2-qué-hace-el-sistema-internamente)
3. [PASO A PASO — PROGRAMADOR (Homologación / Testing)](#3-paso-a-paso--programador-homologación--testing)
4. [PASO A PASO — CLIENTE (Producción)](#4-paso-a-paso--cliente-producción)
5. [Cargar los certificados en BlendPOS](#5-cargar-los-certificados-en-blendpos)
6. [Checklist de verificación](#6-checklist-de-verificación)
7. [Troubleshooting](#7-troubleshooting)
8. [Glosario](#8-glosario)

---

## 1. Requisitos previos

### El programador necesita:
- Acceso a la instancia BlendPOS desplegada (Docker Compose o Railway)
- `openssl` instalado (viene incluido en Git for Windows, WSL, macOS y Linux)
- Editor de texto plano (Notepad++, VS Code, etc.)

### El cliente necesita:
- **CUIT** del emisor (persona física o jurídica)
- **Clave Fiscal nivel 3** en ARCA/AFIP
- El **número de Punto de Venta** que usará para facturar (se crea en ARCA)
- Acceso al servicio **"Administración de Puntos de Venta y Domicilios"** en ARCA

---

## 2. ¿Qué hace el sistema internamente?

BlendPOS usa una arquitectura de dos servicios para emitir facturas electrónicas:

```
Frontend (React)
     │  Sube .crt y .key (base64) vía Config. Fiscal
     ▼
Backend Go  ──────────────────────────┐
├── Guarda certs en PostgreSQL        │  POST /v1/configuracion/fiscal
└── Reenvía certs al sidecar ─────────┤
                                      ▼
                            afip-sidecar (Python + pyafipws)
                            ├── Escribe afip.crt y afip.key en /certs/
                            ├── WSAA: firma TRA con el cert → obtiene Token+Sign (12 h)
                            └── WSFEV1: solicita CAE con Token+Sign
```

**Flujo de una factura:**

1. Se completa una venta en el POS
2. El backend encola un job de facturación en Redis
3. El `FacturacionWorker` lee los datos fiscales de la DB y arma el payload AFIP
4. Llama al endpoint `POST /facturar` del sidecar
5. El sidecar usa el token WSAA vigente para llamar a `FECAESolicitar`
6. ARCA devuelve el **CAE** (Código de Autorización Electrónico) y la fecha de vencimiento
7. El comprobante queda registrado con CAE en la DB

---

## 3. PASO A PASO — PROGRAMADOR (Homologación / Testing)

> En Homologación las facturas **no tienen validez legal**. Se usa para probar la integración antes de ir a producción.

### Paso 3.1 — Registrar el Punto de Venta para Web Services (Testing)

**Quién lo hace:** El cliente (con su Clave Fiscal), o el programador en nombre del cliente.

1. Ingresar a [https://auth.afip.gob.ar](https://auth.afip.gob.ar) con el CUIT y Clave Fiscal
2. Buscar el servicio **"Administración de Puntos de Venta y Domicilios"**
3. Ir a **"A/B/M de Puntos de Venta"** → **"Alta"**
4. Elegir:
   - **Número de PV:** cualquier número disponible (recomendado: separado del PV manual, ej. PV 3)
   - **Sistema de Facturación:** `RECE - Régimen de Emisión Comprobantes Electrónicos (Web Services)`
   - **Domicilio:** el domicilio fiscal del contribuyente
5. Confirmar y anotar el número de PV

> **Nota:** Este mismo PV se usa para homologación Y producción. No es necesario crear uno separado por ambiente.

---

### Paso 3.2 — Obtener el certificado de HOMOLOGACIÓN

AFIP tiene un autoservicio para obtener certificados de testing llamado **WSASS**.

1. Ingresar a AFIP con Clave Fiscal
2. Ir a **"Administrador de Relaciones de Clave Fiscal"** → agregar el servicio **"WSASS"** (Web Service de Autoservicio de Homologación)
3. Acceder al WSASS: en mis servicios, abrir **"WSASS"**
4. Dentro del portal WSASS:
   a. Ir a **"Nuevo Certificado"**
   b. El portal genera la clave privada y el certificado internamente
   c. **Descargar el archivo `.key`** (clave privada) — ¡guardar con cuidado, no se puede recuperar!
   d. **Descargar el archivo `.crt`** (certificado público)
5. También dentro del WSASS:
   - Asociar el certificado al servicio **"wsfe"** para el CUIT correspondiente

> **Alternativa:** Si el cliente quiere usar `openssl` para generar el par de claves y luego subir el CSR al WSASS, seguir los pasos del Paso 4.2 pero apuntando al portal WSASS en vez del de producción.

---

### Paso 3.3 — Verificar que todo funciona

Una vez cargados los certificados en BlendPOS (ver Paso 5):

1. El sidecar intentará autenticarse automáticamente con WSAA Homologación (`wsaahomo.afip.gov.ar`)
2. En la pantalla de Config. Fiscal deberías ver el mensaje: **"Certificados actualizados y autenticación WSAA exitosa"**
3. Hacer una venta de prueba y verificar que se genera un CAE válido

**URL de homologación:**
- WSAA: `https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl`
- WSFEv1: `https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL`

---

## 4. PASO A PASO — CLIENTE (Producción)

> En Producción cada factura tiene **validez legal** y está registrada en ARCA.

### Paso 4.1 — Registrar el Punto de Venta (igual que Paso 3.1)

Si ya lo crearon para testing, el mismo número de PV sirve para producción. No hace falta repetirlo.

---

### Paso 4.2 — Generar la clave privada y el CSR

Este proceso genera los dos archivos que BlendPOS necesita.

#### En Windows (usando Git Bash, WSL o una terminal con OpenSSL):

```bash
# 1. Crear directorio de trabajo
mkdir certs-afip && cd certs-afip

# 2. Generar la clave privada RSA de 2048 bits
openssl genrsa -out afip.key 2048

# 3. Generar el Certificate Signing Request (CSR)
#    Reemplazar los valores entre < > con los datos del cliente
openssl req -new -key afip.key \
  -subj "/C=AR/O=<RAZON_SOCIAL>/CN=<NOMBRE_APP>/serialNumber=CUIT <CUIT_SIN_GUIONES>" \
  -out afip.csr
```

**Ejemplo real:**
```bash
openssl req -new -key afip.key \
  -subj "/C=AR/O=Juan Perez SA/CN=BlendPOS/serialNumber=CUIT 20304050607" \
  -out afip.csr
```

> **Windows sin Git Bash:** Descargar [Win64 OpenSSL Light](https://slproweb.com/products/Win32OpenSSL.html) e instalarlo. Luego correr en CMD:
> ```cmd
> "C:\Program Files\OpenSSL-Win64\bin\openssl.exe" genrsa -out afip.key 2048
> "C:\Program Files\OpenSSL-Win64\bin\openssl.exe" req -new -key afip.key -subj "/C=AR/O=Empresa/CN=BlendPOS/serialNumber=CUIT 20XXXXXXXXX0" -out afip.csr
> ```

---

### Paso 4.3 — Solicitar el certificado firmado en ARCA (Producción)

1. Ingresar a [https://auth.afip.gob.ar](https://auth.afip.gob.ar) con CUIT y Clave Fiscal
2. Ir a **"Administración de Certificados Digitales"**
3. Seleccionar **"Alta de Certificado"**
4. Subir el archivo `afip.csr` generado en el paso anterior
5. ARCA firma el CSR y devuelve el archivo `afip.crt` (el certificado)
6. **Descargar el `afip.crt`**

Ahora tienes los dos archivos necesarios:
- `afip.key` — clave privada (generada localmente, nunca viaja a AFIP)
- `afip.crt` — certificado público firmado por ARCA

---

### Paso 4.4 — Asociar el certificado al servicio WSFEv1

1. Desde **"Administrador de Relaciones de Clave Fiscal"**
2. Buscar el CUIT del emisor → **"Nueva Relación"**
3. Servicio: **"Facturación Electrónica"** → **"wsfe"** (Web Service de Factura Electrónica)
4. Representante: elegir la persona/empresa que usará el certificado
5. Computador Fiscal: seleccionar el certificado recién creado
6. Confirmar

---

### Paso 4.5 — Cambiar BlendPOS a modo Producción

En la pantalla **Config. Fiscal** de BlendPOS:
- Cambiar el campo **"Modo"** de `homologacion` a `produccion`
- Subir los nuevos archivos `.crt` y `.key` de producción
- Guardar

> ⚠️ **Importante:** Los certificados de homologación y producción son DISTINTOS. No mezclarlos.

---

## 5. Cargar los certificados en BlendPOS

### Desde la UI (recomendado)

1. Ir a **Admin → Configuración Fiscal**
2. Completar los campos: CUIT, Razón Social, Condición Fiscal, Punto de Venta, Modo
3. Hacer clic en **"Adjuntar Certificado CRT"** y seleccionar el archivo `.crt`
4. Hacer clic en **"Adjuntar Clave KEY"** y seleccionar el archivo `.key`
5. Clic en **"Guardar Configuración"**
6. El sistema guarda los certificados en la DB y los envía al sidecar para iniciar sesión con WSAA

### Resultado esperado

- **✅ "Configuración actualizada y AFIP notificado correctamente":** Todo ok, el sidecar autenticó con WSAA
- **⚠️ "Certificados guardados pero WSAA rechazó la autenticación":** Los archivos se guardaron, pero ARCA no aceptó el cert. Verificar que el cert esté asociado al servicio `wsfe` (Paso 4.4) y que no esté vencido

---

## 6. Checklist de verificación

### Homologación (Testing)

- [ ] Punto de Venta creado en ARCA con sistema "Web Services"
- [ ] Certificado de testing generado desde WSASS
- [ ] Certificado asociado al servicio "wsfe" en el WSASS
- [ ] Archivos `.crt` y `.key` cargados en BlendPOS (modo `homologacion`)
- [ ] Campo "Condición Fiscal" configurado correctamente (Monotributo / Responsable Inscripto)
- [ ] Número de Punto de Venta en BlendPOS = el número creado en ARCA
- [ ] CUIT en BlendPOS = CUIT del emisor (sin guiones)
- [ ] Venta de prueba generó CAE (14 dígitos)

### Producción

- [ ] Todos los ítems de homologación completados y verificados
- [ ] CSR generado con `openssl genrsa` + `openssl req`
- [ ] CSR subido a ARCA → `.crt` de producción descargado
- [ ] `.crt` y `.key` de producción cargados en BlendPOS (modo `produccion`)
- [ ] Al menos una factura de producción emitida correctamente con CAE válido
- [ ] Backup de los archivos `.crt` y `.key` en lugar seguro

---

## 7. Troubleshooting

### "WSAA_ALREADY_AUTHENTICATED"
**Causa:** El token WSAA sigue siendo válido (12 h de vigencia). No es real un error.
**Solución:** Esperar a que expire o usar `/configurar` para forzar re-auth.

### "Certificado no encontrado: /certs/afip.crt"
**Causa:** Los archivos no llegaron al sidecar.
**Por qué en dev:** El volumen Docker estaba montado con `:ro`. **Ya corregido** — el volumen ahora es writable.
**Solución:** Volver a subir los certificados desde la UI de Config. Fiscal.

### "Error al llamar a ARCA: Connection refused / Timeout"
**Causa:** El sidecar no puede llegar a los endpoints de ARCA.
**Solución:** Verificar conectividad de red desde el servidor hacia `wsaahomo.afip.gov.ar` (testing) o `wsaa.afip.gov.ar` (producción). Puerto 443 HTTPS.

### "Factura rechazada — Resultado: R"
**Causa:** ARCA rechazó el comprobante. Ver el campo `observaciones` en la respuesta.
**Errores comunes:**
- Código 10016: El importe total no coincide con la suma de los componentes
- Código 422: El tipo de comprobante no corresponde a la condición fiscal del emisor
- Código 10094: Punto de Venta inexistente o no habilitado para Web Services

### Factura C rechazada (Monotributo)
**Causa histórica:** El monto total estaba en `imp_op_ex` en lugar de `imp_tot_conc`. **Ya corregido** en la versión actual.

### El CAE tiene 0 o está vacío
**Causa:** `afipResp.Resultado != "A"` — la factura fue rechazada o está pendiente.
**Solución:** Revisar `observaciones` en el comprobante dentro de BlendPOS.

### "sidecar AFIP no disponible"
**Causa:** El container `afip-sidecar` no está corriendo o el backend no puede resolverlo.
**Solución:** `docker compose ps` para verificar estado. `docker compose logs afip-sidecar` para ver errores.

---

## 8. Glosario

| Término | Significado |
|---------|-------------|
| **ARCA** | Agencia de Recaudación y Control Aduanero (ex AFIP) |
| **WSAA** | Web Service de Autenticación y Autorización de AFIP |
| **WSFEv1** | Web Service de Factura Electrónica Versión 1 |
| **TRA** | Ticket de Requerimiento de Acceso (firmado con el cert para obtener el TA) |
| **TA** | Ticket de Acceso (Token + Sign, 12 h de validez) |
| **CAE** | Código de Autorización Electrónico (14 dígitos, valida una factura) |
| **CSR** | Certificate Signing Request (solicitud de certificado, contiene la clave pública) |
| **CRT** | Certificado digital firmado por ARCA, contiene la clave pública |
| **KEY** | Clave privada RSA (nunca sale de tu servidor) |
| **PV** | Punto de Venta |
| **CUIT** | Clave Única de Identificación Tributaria |
| **RI** | Responsable Inscripto (frente al IVA) — emite Facturas A y B |
| **Monotributo** | Régimen simplificado — emite Factura C (sin IVA desglosado) |
| **Homologación** | Ambiente de testing de AFIP, las facturas no tienen validez legal |
| **Producción** | Ambiente real, todas las facturas quedan registradas en ARCA |
