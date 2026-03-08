#!/bin/sh
set -e

echo "🔐 AFIP Sidecar - Inicializando certificados..."

# Crear directorio de certificados si no existe
mkdir -p /certs

# Escribir certificados desde variables de entorno si están presentes
if [ -n "$AFIP_CERT_B64" ]; then
    echo "✅ Escribiendo afip.crt desde AFIP_CERT_B64..."
    echo "$AFIP_CERT_B64" | base64 -d > /certs/afip.crt
    chmod 644 /certs/afip.crt
else
    echo "⚠️  AFIP_CERT_B64 no está definida. Verificando si /certs/afip.crt existe..."
    if [ ! -f /certs/afip.crt ]; then
        echo "❌ ERROR: /certs/afip.crt no existe y AFIP_CERT_B64 no está definida."
        echo "   Por favor configura AFIP_CERT_B64 o monta /certs con los certificados."
        exit 1
    fi
fi

if [ -n "$AFIP_KEY_B64" ]; then
    echo "✅ Escribiendo afip.key desde AFIP_KEY_B64..."
    echo "$AFIP_KEY_B64" | base64 -d > /certs/afip.key
    chmod 644 /certs/afip.key
else
    echo "⚠️  AFIP_KEY_B64 no está definida. Verificando si /certs/afip.key existe..."
    if [ ! -f /certs/afip.key ]; then
        echo "❌ ERROR: /certs/afip.key no existe y AFIP_KEY_B64 no está definida."
        echo "   Por favor configura AFIP_KEY_B64 o monta /certs con los certificados."
        exit 1
    fi
fi

echo "✅ Certificados AFIP listos en /certs/"
ls -lh /certs/

# Limpiar caché de pickles stale (pysimplesoap/pyafipws)
echo "🧹 Limpiando caché stale de pyafipws..."
find /usr/local/lib/python3.11/site-packages/pyafipws/cache -name '*.pkl' -delete 2>/dev/null || true

echo "🚀 Iniciando AFIP Sidecar en puerto 8001..."
exec uvicorn main:app --host 0.0.0.0 --port 8001
