-- Rollback migration 000028
ALTER TABLE venta_items DROP COLUMN IF EXISTS precio_minorista_original;
ALTER TABLE venta_items DROP COLUMN IF EXISTS tipo_precio;
ALTER TABLE ventas      DROP COLUMN IF EXISTS discount_value;
ALTER TABLE ventas      DROP COLUMN IF EXISTS discount_type;
