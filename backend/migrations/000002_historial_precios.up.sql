-- 000002_historial_precios.up.sql
-- Tabla de historial inmutable de cambios de precio por producto.
-- RF-26: El sistema debe llevar historial de cambios de precios.
-- Los registros son append-only: NO se permiten UPDATE ni DELETE.

CREATE TABLE IF NOT EXISTS historial_precios (
    id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id          UUID          NOT NULL REFERENCES productos(id),
    proveedor_id         UUID          REFERENCES proveedores(id),
    costo_antes          DECIMAL(10,2) NOT NULL,
    costo_despues        DECIMAL(10,2) NOT NULL,
    venta_antes          DECIMAL(10,2) NOT NULL,
    venta_despues        DECIMAL(10,2) NOT NULL,
    porcentaje_aplicado  DECIMAL(5,2)  NOT NULL,
    motivo               VARCHAR(50)   NOT NULL DEFAULT 'actualizacion_masiva',
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Índices para consulta eficiente por producto y proveedor
CREATE INDEX idx_historial_precio_producto   ON historial_precios(producto_id);
CREATE INDEX idx_historial_precio_proveedor  ON historial_precios(proveedor_id);
CREATE INDEX idx_historial_precio_created_at ON historial_precios(created_at DESC);

-- Comentario de política: append-only enforced at application layer
COMMENT ON TABLE historial_precios IS 'Registros inmutables de cambios de precio. No se permite UPDATE ni DELETE.';
