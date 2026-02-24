-- 000005_missing_tables.up.sql
-- Crea tablas faltantes: categorias, contacto_proveedors, movimientos_stock

-- ── Categorías ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categorias (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      VARCHAR(100) NOT NULL,
    descripcion TEXT,
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_categorias_nombre ON categorias(nombre);

-- ── Contactos de Proveedor ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacto_proveedors (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id UUID         NOT NULL REFERENCES proveedores(id),
    nombre       VARCHAR(150) NOT NULL,
    cargo        VARCHAR(100),
    telefono     VARCHAR(30),
    email        VARCHAR(150),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacto_proveedor ON contacto_proveedors(proveedor_id);

-- ── Movimientos de Stock ──────────────────────────────────────────────────────
-- Registra cada cambio de stock: ventas, ajustes manuales, desarmes
CREATE TABLE IF NOT EXISTS movimientos_stock (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id    UUID         NOT NULL REFERENCES productos(id),
    tipo           VARCHAR(30)  NOT NULL,
    cantidad       INTEGER      NOT NULL,
    stock_anterior INTEGER      NOT NULL,
    stock_nuevo    INTEGER      NOT NULL,
    motivo         TEXT,
    referencia_id  UUID,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movimiento_stock_producto ON movimientos_stock(producto_id);
CREATE INDEX idx_movimiento_stock_created  ON movimientos_stock(created_at DESC);

-- Comentario sobre movimientos de stock
COMMENT ON TABLE movimientos_stock IS 'Auditoria de cambios de stock. Append-only, nunca se modifica.';

-- ── Seed Categorías Básicas ───────────────────────────────────────────────────
INSERT INTO categorias (nombre, descripcion, activo) VALUES
    ('almacen', 'Productos de almacén y despensa', TRUE),
    ('bebidas', 'Bebidas alcohólicas y no alcohólicas', TRUE),
    ('lacteos', 'Productos lácteos y derivados', TRUE),
    ('panaderia', 'Pan, facturas y productos de panadería', TRUE),
    ('limpieza', 'Artículos de limpieza e higiene', TRUE),
    ('otros', 'Categoría general', TRUE)
ON CONFLICT (nombre) DO NOTHING;
