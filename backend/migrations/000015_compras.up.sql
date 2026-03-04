-- Migration 000015: Compras (purchase orders from suppliers)

CREATE TABLE IF NOT EXISTS compras (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    numero            VARCHAR(100),
    proveedor_id      UUID         NOT NULL REFERENCES proveedores(id),
    fecha_compra      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    fecha_vencimiento TIMESTAMPTZ  NOT NULL,
    moneda            VARCHAR(10)  NOT NULL DEFAULT 'ARS',
    deposito          VARCHAR(100) NOT NULL DEFAULT 'Principal',
    notas             TEXT,
    subtotal          DECIMAL(12,2) NOT NULL DEFAULT 0,
    descuento_total   DECIMAL(12,2) NOT NULL DEFAULT 0,
    total             DECIMAL(12,2) NOT NULL DEFAULT 0,
    estado            VARCHAR(30)  NOT NULL DEFAULT 'pendiente',
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compra_items (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    compra_id        UUID          NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    producto_id      UUID          REFERENCES productos(id),
    nombre_producto  VARCHAR(255)  NOT NULL,
    precio           DECIMAL(12,2) NOT NULL DEFAULT 0,
    descuento_pct    DECIMAL(5,2)  NOT NULL DEFAULT 0,
    impuesto_pct     DECIMAL(5,2)  NOT NULL DEFAULT 0,
    cantidad         INTEGER       NOT NULL DEFAULT 1,
    observaciones    TEXT,
    total            DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha     ON compras(fecha_compra DESC);
CREATE INDEX IF NOT EXISTS idx_compra_items_compra ON compra_items(compra_id);
