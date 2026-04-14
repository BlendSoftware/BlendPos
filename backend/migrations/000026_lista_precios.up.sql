-- Migration 000026: Listas de precios diferenciales
-- Permite crear listas con descuentos por producto para clientes específicos.

CREATE TABLE lista_precios (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      VARCHAR(120) NOT NULL UNIQUE,
    logo_url    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lista_precios_producto (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lista_precios_id      UUID NOT NULL REFERENCES lista_precios(id) ON DELETE CASCADE,
    producto_id           UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    descuento_porcentaje  DECIMAL(5,2) NOT NULL CHECK (descuento_porcentaje >= 0 AND descuento_porcentaje <= 90),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lista_precios_id, producto_id)
);

CREATE INDEX idx_lista_precios_producto_lista ON lista_precios_producto (lista_precios_id);
CREATE INDEX idx_lista_precios_producto_producto ON lista_precios_producto (producto_id);
