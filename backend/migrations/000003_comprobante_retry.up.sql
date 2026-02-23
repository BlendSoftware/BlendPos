ALTER TABLE comprobantes
  ADD COLUMN retry_count   INT NOT NULL DEFAULT 0,
  ADD COLUMN next_retry_at TIMESTAMPTZ,
  ADD COLUMN last_error    TEXT;

-- Index for the retry cron query: pending comprobantes due for retry
CREATE INDEX idx_comprobantes_pending_retry
  ON comprobantes (next_retry_at)
  WHERE estado = 'pendiente' AND next_retry_at IS NOT NULL;
