#!/bin/bash
# BlendPOS — Restore de PostgreSQL
# Uso: ./scripts/restore.sh <backup_file.sql.gz>
set -euo pipefail

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./scripts/restore.sh <backup_file.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -lh /backups/blendpos/blendpos_*.sql.gz 2>/dev/null || echo "  (none found in /backups/blendpos/)"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: File not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "WARNING: This will overwrite the current database!"
echo "File: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
read -p "Continue? (y/N) " -r
[[ $REPLY =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

echo "[$(date -Iseconds)] Restoring from $BACKUP_FILE…"

gunzip -c "$BACKUP_FILE" | docker compose exec -T postgres psql -U blendpos blendpos

echo "[$(date -Iseconds)] Restore completed successfully."
