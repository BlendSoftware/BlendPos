FROM python:3.11-slim

WORKDIR /app

# Build deps for pyafipws (needs lxml, openssl bindings)
# También incluimos openssl runtime para que pyafipws pueda usar el comando openssl
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make libxml2-dev libxslt-dev libssl-dev swig \
    libc6-dev linux-libc-dev openssl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-base.txt requirements.txt patch_setuppy.py patch_wsaa.py patch_wsaa_openssl2.py patch_wsaa_b64.py patch_utils.py patch_pysimplesoap.py patch_helpers.py patch_wsfev1_final.py ./

# Instalar deps base
RUN pip install --no-cache-dir -r requirements-base.txt

# Parches para pysimplesoap (Python 2 -> 3 compatibility)
# patch_helpers.py también parchea client.py (hashlib.md5 Python 3 fix)
RUN python3 /app/patch_pysimplesoap.py && \
    python3 /app/patch_helpers.py

# pyafipws tiene print sin paréntesis (Python 2) y tabs/espacios mixtos en setup.py.
# Descargamos el tarball directamente con urllib (pip download también llama egg_info),
# parcheamos con patch_setuppy.py, creamos el archivo faltante y luego instalamos.
RUN python3 -c "\
import urllib.request; \
urllib.request.urlretrieve(\
'https://files.pythonhosted.org/packages/source/P/PyAfipWs/PyAfipWs-2.7.1874.tar.gz',\
'/tmp/pyafipws.tar.gz')" && \
    cd /tmp && \
    tar xzf pyafipws.tar.gz && \
    cd *fip*2.7.1874* && \
    rm -f setup_fe_db.py designer.py && \
    touch setup_fe_db.py designer.py && \
    python3 /app/patch_setuppy.py /tmp/PyAfipWs-2.7.1874 && \
    rm -rf *.egg-info setup.cfg && \
    python3 setup.py install --single-version-externally-managed --record /dev/null && \
    python3 /app/patch_wsaa.py && \
    python3 /app/patch_wsaa_openssl2.py && \
    python3 /app/patch_wsaa_b64.py && \
    python3 /app/patch_utils.py && \
    python3 /app/patch_wsfev1_final.py && \
    cd /tmp && rm -rf *fip*2.7.1874* pyafipws.tar.gz

COPY *.py .
# Copiar certificados directamente a la imagen (solo test) 
# para saltar problemas de bind mount con Docker Desktop / WSL.
COPY certs/ /certs/
RUN mkdir -p /certs

# Non-root user — se crea el usuario pero se corre como root
# para que los volúmenes de Docker Desktop en Windows (que se montan como root)
# sean accesibles. En producción con Linux nativo esto no es problema.
RUN useradd -m -u 1001 afipsidecar && \
    mkdir -p /tmp/afip_cache && \
    mkdir -p /usr/local/lib/python3.11/site-packages/pyafipws/cache && \
    chown -R afipsidecar:afipsidecar /tmp/afip_cache && \
    chown -R afipsidecar:afipsidecar /usr/local/lib/python3.11/site-packages/pyafipws/cache

# En Docker Desktop/Windows los volúmenes se montan con UID root.
# Corremos como root en dev; en producción Linux el volumen se puede chown correctamente.
# USER afipsidecar

EXPOSE 8001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"

# Limpiar cacché de pickles stale al inicio: los .pkl de pysimplesoap/pyafipws pueden
# quedar incompatibles entre reinicios (name-mangling de Python 3 en Struct.__keys).
# El .xml del WSDL se conserva, el .pkl se regenera limpio en cada arranque.
CMD ["sh", "-c", "chmod 644 /certs/afip.key /certs/afip.crt 2>/dev/null || true; find /usr/local/lib/python3.11/site-packages/pyafipws/cache -name '*.pkl' -delete 2>/dev/null; exec uvicorn main:app --host 0.0.0.0 --port 8001"]