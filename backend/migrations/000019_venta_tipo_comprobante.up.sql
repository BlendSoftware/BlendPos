-- 000019_venta_tipo_comprobante.up.sql
-- Adds tipo_comprobante to ventas so each sale records the requested receipt type.
-- "ticket_interno" is the default (no AFIP emission).
-- "factura_a" | "factura_b" | "factura_c" trigger the AFIP worker.

ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS tipo_comprobante VARCHAR(30) NOT NULL DEFAULT 'ticket_interno';
