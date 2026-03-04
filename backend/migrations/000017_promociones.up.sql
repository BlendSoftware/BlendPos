-- Migration 000017: Promociones (product discounts)

CREATE TABLE IF NOT EXISTS promociones (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre       VARCHAR(100)  NOT NULL,
    descripcion  TEXT,
    tipo         VARCHAR(30)   NOT NULL DEFAULT 'porcentaje', -- porcentaje | monto_fijo
    valor        DECIMAL(12,2) NOT NULL DEFAULT 0,
    fecha_inicio TIMESTAMPTZ   NOT NULL,
    fecha_fin    TIMESTAMPTZ   NOT NULL,
    activa       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promocion_productos (
    promocion_id UUID NOT NULL REFERENCES promociones(id) ON DELETE CASCADE,
    producto_id  UUID NOT NULL REFERENCES productos(id)  ON DELETE CASCADE,
    PRIMARY KEY (promocion_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_promociones_activa      ON promociones(activa);
CREATE INDEX IF NOT EXISTS idx_promociones_fecha_fin   ON promociones(fecha_fin DESC);
CREATE INDEX IF NOT EXISTS idx_promocion_productos_prod ON promocion_productos(producto_id);
