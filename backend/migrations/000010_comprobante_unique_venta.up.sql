-- B-01: Add UNIQUE constraint on comprobantes.venta_id to prevent duplicate
-- fiscal records for the same sale (idempotency guard).
ALTER TABLE comprobantes ADD CONSTRAINT uq_comprobante_venta UNIQUE (venta_id);
