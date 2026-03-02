#!/bin/sh
# ─────────────────────────────────────────────────────────────────────
# BlendPOS — PostgreSQL Backup Script (OPS-02)
# Ejecuta pg_dump comprimido y retiene los últimos 7 días de backups.
#
# Uso (cron cada 6 horas):
#   0 */6 * * * /scripts/pg_backup.sh
#
# Variables de entorno requeridas:
#   POSTGRES_HOST, POSTGRES_USER, POSTGRES_DB, PGPASSWORD
# ─────────────────────────────────────────────────────────────────────
set -e

BACKUP_DIR="/backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${POSTGRES_DB}_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

echo "[backup] $(date) — Iniciando backup de ${POSTGRES_DB}..."

# Ejecutar pg_dump comprimido con gzip
pg_dump \
  -h "${POSTGRES_HOST:-postgres}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-owner \
  --no-privileges \
  --format=plain \
  | gzip > "${FILEPATH}"

# Verificar que el archivo no esté vacío
if [ ! -s "${FILEPATH}" ]; then
  echo "[backup] ERROR: Backup vacío — eliminando ${FILEPATH}"
  rm -f "${FILEPATH}"
  exit 1
fi

SIZE=$(du -h "${FILEPATH}" | cut -f1)
echo "[backup] ✓ Backup exitoso: ${FILEPATH} (${SIZE})"

# Limpiar backups antiguos (retener últimos RETENTION_DAYS días)
DELETED=$(find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -print -delete | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  echo "[backup] 🧹 Eliminados ${DELETED} backups con más de ${RETENTION_DAYS} días"
fi

echo "[backup] $(date) — Proceso completado"
