-- ────────────────────────────────────────────────────────────────────────────
-- Migration 000014: Arqueo detallado por método de pago
-- Adds columns to store the detailed cash count breakdown by payment method.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE sesion_cajas
    ADD COLUMN IF NOT EXISTS monto_declarado_efectivo      DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS monto_declarado_debito        DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS monto_declarado_credito       DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS monto_declarado_transferencia DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS monto_declarado_qr            DECIMAL(12,2);

-- Backfill existing records: if monto_declarado exists and is not null,
-- assign it all to efectivo for backward compatibility.
UPDATE sesion_cajas
SET
    monto_declarado_efectivo = monto_declarado,
    monto_declarado_debito = 0,
    monto_declarado_credito = 0,
    monto_declarado_transferencia = 0,
    monto_declarado_qr = 0
WHERE monto_declarado IS NOT NULL
  AND monto_declarado_efectivo IS NULL;
