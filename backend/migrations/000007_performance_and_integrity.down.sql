-- Migration 000007 DOWN: Revert performance + integrity improvements

-- P2-009: Drop comprobante FK
ALTER TABLE ventas DROP CONSTRAINT IF EXISTS fk_ventas_comprobante;

-- P2-008: Drop trigger, function, and column
DROP TRIGGER IF EXISTS trg_ventas_updated_at ON ventas;
DROP FUNCTION IF EXISTS fn_set_updated_at();
ALTER TABLE ventas DROP COLUMN IF EXISTS updated_at;

-- P2-006: Drop new indexes, restore old one
DROP INDEX IF EXISTS idx_ventas_sesion_estado;
DROP INDEX IF EXISTS idx_ventas_created_at_desc;

CREATE INDEX IF NOT EXISTS idx_ventas_created ON ventas (created_at);
