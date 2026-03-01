-- Migration 000007: Performance + integrity improvements
-- Covers:
--   P2-006 — replace idx_ventas_created (no DESC order) with one the planner can use
--   P2-008 — add updated_at column + auto-update trigger to ventas
--   P2-009 — add DEFERRABLE FK from ventas(comprobante_id) → comprobantes(id)

-- ── P2-006: Better index on ventas(created_at) ────────────────────────────────
-- The old idx_ventas_created was created without explicit direction; the new one
-- uses DESC so ORDER BY created_at DESC queries get an index scan.
-- Also add a covering index for the common (sesion_caja_id, estado) filter used
-- in POS closing reports.

DROP INDEX IF EXISTS idx_ventas_created;

CREATE INDEX IF NOT EXISTS idx_ventas_created_at_desc
    ON ventas (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ventas_sesion_estado
    ON ventas (sesion_caja_id, estado);

-- ── P2-008: updated_at on ventas ─────────────────────────────────────────────
-- GORM expects updated_at to exist for Model embedding; missing column caused
-- silent "update touches 0 rows" bugs on UPDATE queries.

ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Update existing rows so updated_at ≈ created_at (better than keeping epoch)
UPDATE ventas SET updated_at = created_at WHERE updated_at = to_timestamp(0) OR updated_at IS NULL;

-- Trigger: keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS
$$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ventas_updated_at ON ventas;

CREATE TRIGGER trg_ventas_updated_at
    BEFORE UPDATE ON ventas
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

-- ── P2-009: FK from ventas(comprobante_id) → comprobantes(id) ─────────────────
-- DEFERRABLE INITIALLY DEFERRED lets the worker insert the comprobante row in
-- the same transaction as the venta update without ordering constraints.

ALTER TABLE ventas
    DROP CONSTRAINT IF EXISTS fk_ventas_comprobante;

ALTER TABLE ventas
    ADD CONSTRAINT fk_ventas_comprobante
        FOREIGN KEY (comprobante_id)
        REFERENCES comprobantes (id)
        DEFERRABLE INITIALLY DEFERRED;
