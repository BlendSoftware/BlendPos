-- ────────────────────────────────────────────────────────────────────────────
-- Rollback Migration 000014: Remove detailed cash count columns
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE sesion_cajas
    DROP COLUMN IF EXISTS monto_declarado_efectivo,
    DROP COLUMN IF EXISTS monto_declarado_debito,
    DROP COLUMN IF EXISTS monto_declarado_credito,
    DROP COLUMN IF EXISTS monto_declarado_transferencia,
    DROP COLUMN IF EXISTS monto_declarado_qr;
