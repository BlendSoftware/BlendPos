-- Migration 000028: Descuento tipado (% / $ fijo) y tipo de precio por ítem.
--
-- Cambios:
--   * ventas.discount_type     — 'percentage' | 'fixed' | NULL (sin descuento global tipado)
--   * ventas.discount_value    — valor crudo ingresado por el cajero (% o $)
--   * venta_items.tipo_precio  — 'minorista' (default) | 'mayorista'
--   * venta_items.precio_minorista_original — snapshot del precio minorista
--     al momento de la venta, útil para auditoría cuando se aplicó mayorista.
--
-- NOTA: ventas.descuento_total ya existe y guarda el MONTO ($) total descontado.
-- No se modifica. discount_type/value son SOLO para audit del input del cajero.

ALTER TABLE ventas
    ADD COLUMN discount_type  VARCHAR(20) NULL
        CHECK (discount_type IS NULL OR discount_type IN ('percentage', 'fixed')),
    ADD COLUMN discount_value DECIMAL(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN ventas.discount_type  IS 'Tipo de descuento global ingresado: percentage | fixed | NULL';
COMMENT ON COLUMN ventas.discount_value IS 'Valor crudo del descuento global (% o $, según discount_type). Solo para audit.';

ALTER TABLE venta_items
    ADD COLUMN tipo_precio VARCHAR(20) NOT NULL DEFAULT 'minorista'
        CHECK (tipo_precio IN ('minorista', 'mayorista')),
    ADD COLUMN precio_minorista_original DECIMAL(10,2) NULL;

COMMENT ON COLUMN venta_items.tipo_precio IS 'Tipo de precio aplicado a esta línea: minorista (default) o mayorista.';
COMMENT ON COLUMN venta_items.precio_minorista_original IS 'Snapshot del precio minorista al momento de la venta. Útil cuando tipo_precio=mayorista.';
