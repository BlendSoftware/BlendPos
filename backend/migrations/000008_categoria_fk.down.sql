-- Migration 000008 DOWN: Revert categoria FK

DROP INDEX IF EXISTS idx_productos_categoria_id;

ALTER TABLE productos DROP COLUMN IF EXISTS categoria_id;
