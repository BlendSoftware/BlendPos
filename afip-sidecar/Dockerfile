FROM python:3.11-slim

WORKDIR /app

# Build deps for pyafipws (needs lxml, openssl bindings)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libxml2-dev libxslt-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Non-root user
RUN useradd -m -u 1001 afipsidecar
USER afipsidecar

EXPOSE 8001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
