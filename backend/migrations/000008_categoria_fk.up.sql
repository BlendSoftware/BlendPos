-- Migration 000008: Add categoria_id FK to productos
-- P2-007 — Replace the loose varchar categoria column with a proper FK to categorias.
--
-- Strategy (two-phase migration to avoid downtime):
--   Phase A (this migration): Add nullable categoria_id + backfill + FK + index.
--                             The old categoria varchar is kept so existing code
--                             keeps working during the transition period.
--   Phase B (000009, future): Drop the old categoria varchar once all service
--                             code reads/writes categoria_id instead.

-- ── Phase A ───────────────────────────────────────────────────────────────────

-- 1. Add nullable FK column (must be nullable for the backfill step)
ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES categorias (id);

-- 2. Backfill: match existing string values to category names (case-insensitive)
UPDATE productos p
SET    categoria_id = c.id
FROM   categorias c
WHERE  lower(p.categoria) = lower(c.nombre);

-- 3. For productos whose categoria string doesn't match any category name,
--    assign the catch-all "otros" category so we can later set NOT NULL.
UPDATE productos p
SET    categoria_id = c.id
FROM   categorias c
WHERE  p.categoria_id IS NULL
  AND  lower(c.nombre) = 'otros';

-- 4. Now that all rows have a value, enforce NOT NULL
ALTER TABLE productos
    ALTER COLUMN categoria_id SET NOT NULL;

-- 5. Index for FK lookups (JOIN categorias) and filter queries
CREATE INDEX IF NOT EXISTS idx_productos_categoria_id
    ON productos (categoria_id);
