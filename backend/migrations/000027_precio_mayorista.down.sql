-- Rollback migration 000027: drop precio_mayorista column
ALTER TABLE productos DROP COLUMN IF EXISTS precio_mayorista;
