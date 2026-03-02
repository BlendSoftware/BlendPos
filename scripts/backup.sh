#!/bin/bash
# BlendPOS — Backup de PostgreSQL
# Uso: ./scripts/backup.sh
# Cron recomendado (diario 3 AM):
#   0 3 * * * /opt/blendpos/scripts/backup.sh >> /var/log/blendpos-backup.log 2>&1
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backups/blendpos}"
BACKUP_FILE="${BACKUP_DIR}/blendpos_${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Iseconds)] Starting backup…"

# Dump comprimido — usa el contenedor postgres del docker-compose
docker compose exec -T postgres pg_dump -U blendpos blendpos | gzip > "$BACKUP_FILE"

# Verificar que el archivo no esta vacio
if [ ! -s "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file is empty!" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date -Iseconds)] Backup created: $BACKUP_FILE ($SIZE)"

# Limpiar backups viejos
DELETED=$(find "$BACKUP_DIR" -name "blendpos_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
echo "[$(date -Iseconds)] Old backups cleaned: $DELETED removed (retention: ${RETENTION_DAYS} days)"
