-- Revert B-01: Remove UNIQUE constraint on comprobantes.venta_id
ALTER TABLE comprobantes DROP CONSTRAINT IF EXISTS uq_comprobante_venta;
