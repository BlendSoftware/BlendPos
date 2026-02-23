DROP INDEX IF EXISTS idx_comprobantes_pending_retry;

ALTER TABLE comprobantes
  DROP COLUMN IF EXISTS retry_count,
  DROP COLUMN IF EXISTS next_retry_at,
  DROP COLUMN IF EXISTS last_error;
