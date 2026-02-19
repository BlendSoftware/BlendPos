# ⚡ AFIP Sidecar — Quick Start

Guía rápida para levantar el AFIP Sidecar en 5 minutos.

---

## 🚀 Inicio Rápido (Homologación)

### 1. Obtener Certificados de AFIP

Para testing, necesitas certificados oficiales de AFIP Homologación:

**Opción A: Generar CSR localmente**
```bash
./generate_certs.sh
# Ingresa tu CUIT cuando te lo pida
```

Esto genera:
- `certs/afip.key` (clave privada)
- `certs/afip.csr` (Certificate Signing Request)
- `certs/afip.crt` (certificado autofirmado temporal)

**Opción B: Obtener certificados oficiales de AFIP**

1. Ve a: https://www.afip.gob.ar/ws/WSAA/certificado.asp
2. Selecciona **"WSFE - Factura Electrónica"**
3. Sube el archivo `certs/afip.csr`
4. Descarga el certificado `.crt` oficial
5. Reemplaza `certs/afip.crt` con el certificado oficial

### 2. Configurar Variables de Entorno

```bash
cp .env.example .env
nano .env
```

Editar:
```env
AFIP_CUIT_EMISOR=20123456789    # Tu CUIT real
AFIP_HOMOLOGACION=true          # true = testing
```

### 3. Levantar con Docker Compose

```bash
docker compose up -d
```

Verificar logs:
```bash
docker compose logs -f
```

### 4. Probar el Sidecar

```bash
# Health check
curl http://localhost:8001/health | jq

# Test completo con script Python
pip install httpx rich
python test_client.py
```

**¡Listo!** El sidecar está corriendo en `http://localhost:8001`

---

## 🧪 Testing Manual

### Health Check

```bash
curl -X GET http://localhost:8001/health
```

Respuesta esperada:
```json
{
  "ok": true,
  "service": "afip-sidecar",
  "mode": "homologacion",
  "afip_conectado": true,
  "ultima_autenticacion": "2026-02-18T10:30:00"
}
```

### Emitir Factura B (Consumidor Final)

```bash
curl -X POST http://localhost:8001/facturar \
  -H "Content-Type: application/json" \
  -d '{
    "cuit_emisor": "20123456789",
    "punto_de_venta": 1,
    "tipo_comprobante": 6,
    "tipo_doc_receptor": 99,
    "nro_doc_receptor": "0",
    "nombre_receptor": "CONSUMIDOR FINAL",
    "concepto": 1,
    "importe_neto": 1000.00,
    "importe_exento": 0,
    "importe_iva": 210.00,
    "importe_tributos": 0,
    "importe_total": 1210.00,
    "moneda": "PES",
    "cotizacion_moneda": 1.0
  }' | jq
```

Respuesta esperada:
```json
{
  "resultado": "A",
  "numero_comprobante": 1,
  "fecha_comprobante": "20260218",
  "cae": "71234567890123",
  "cae_vencimiento": "20260228",
  "observaciones": null
}
```

---

## 🔧 Troubleshooting

### Error: "Certificado no encontrado"

**Causa:** Faltan los archivos `.crt` o `.key` en `certs/`

**Solución:**
```bash
ls -la certs/
# Debe mostrar: afip.crt y afip.key
```

Si faltan, ejecuta `./generate_certs.sh`

### Error: "WSAA authentication failed"

**Causa:** Certificado autofirmado (no oficial)

**Solución:**
1. Obtener certificado oficial de AFIP (ver arriba)
2. Reemplazar `certs/afip.crt` con el oficial
3. Reiniciar: `docker compose restart`

### Error: "CUIT no registrado en AFIP"

**Causa:** El CUIT no está habilitado para facturar electrónicamente

**Solución para Homologación:**
- Usar CUIT de testing de AFIP: `20409378472`
- Cambiar en `.env`: `AFIP_CUIT_EMISOR=20409378472`

**Solución para Producción:**
- Tramitar adhesión a Factura Electrónica en AFIP

### El sidecar no arranca

```bash
# Ver logs detallados
docker compose logs afip-sidecar

# Verificar puertos
netstat -tuln | grep 8001

# Verificar variables de entorno
docker compose exec afip-sidecar env | grep AFIP
```

---

## 📊 Swagger UI

En modo homologación, accede a la documentación interactiva:

```
http://localhost:8001/docs
```

Desde ahí puedes probar todos los endpoints con interfaz gráfica.

---

## 🔄 Actualizar el Sidecar

```bash
# Pull latest code
git pull origin master

# Rebuild image
docker compose build afip-sidecar

# Restart
docker compose up -d afip-sidecar
```

---

## 🛑 Detener el Sidecar

```bash
# Detener
docker compose stop

# Detener y eliminar contenedores
docker compose down

# Detener y eliminar todo (incluyendo volúmenes)
docker compose down -v
```

---

## 📚 Próximos Pasos

1. **Integrar con Backend Go:** Ver [documentación del worker](../backend/internal/worker/README.md)
2. **Configurar Producción:** Cambiar `AFIP_HOMOLOGACION=false` y usar certificados de producción
3. **Monitoreo:** Configurar alertas para CAEs rechazados
4. **Backup:** Hacer backup periódico de certificados

---

## 🆘 Ayuda

- **README completo:** [README.md](README.md)
- **Documentación AFIP:** https://www.afip.gob.ar/fe/
- **Issues:** Reportar en el repositorio del proyecto

---

**¡Buen facturamiento! 🧾**
