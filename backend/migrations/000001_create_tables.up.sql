-- 000001_create_tables.up.sql
-- BlendPOS: Initial schema migration
-- Managed by golang-migrate. Run: migrate -path migrations -database $DATABASE_URL up

-- Enable pg_trgm for trigram-based ILIKE search on product names
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Proveedores ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    razon_social    VARCHAR(200) NOT NULL,
    cuit            VARCHAR(20)  NOT NULL UNIQUE,
    telefono        VARCHAR(30),
    email           VARCHAR(150),
    direccion       VARCHAR(300),
    condicion_pago  VARCHAR(100),
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Productos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_barras   VARCHAR(20)      NOT NULL UNIQUE,
    nombre          VARCHAR(120)     NOT NULL,
    descripcion     TEXT,
    categoria       VARCHAR(60)      NOT NULL,
    precio_costo    DECIMAL(10,2)    NOT NULL,
    precio_venta    DECIMAL(10,2)    NOT NULL,
    margen_pct      DECIMAL(5,2)     NOT NULL DEFAULT 0,
    stock_actual    INTEGER          NOT NULL DEFAULT 0,
    stock_minimo    INTEGER          NOT NULL DEFAULT 5,
    unidad_medida   VARCHAR(30)      NOT NULL DEFAULT 'unidad',
    es_padre        BOOLEAN          NOT NULL DEFAULT FALSE,
    proveedor_id    UUID             REFERENCES proveedores(id),
    activo          BOOLEAN          NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Indexes — see arquitectura.md §9.1
CREATE UNIQUE INDEX idx_productos_barcode ON productos(codigo_barras);
CREATE INDEX idx_productos_nombre_trgm ON productos USING GIN (nombre gin_trgm_ops);
CREATE INDEX idx_productos_proveedor ON productos(proveedor_id);
CREATE INDEX idx_productos_activo ON productos(activo);

-- ── Producto Hijo (Jerarquia) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS producto_hijos (
    id                  UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_padre_id   UUID     NOT NULL REFERENCES productos(id),
    producto_hijo_id    UUID     NOT NULL REFERENCES productos(id),
    unidades_por_padre  INTEGER  NOT NULL,
    desarme_auto        BOOLEAN  NOT NULL DEFAULT TRUE,
    UNIQUE (producto_padre_id, producto_hijo_id)
);

-- ── Usuarios ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(30)  NOT NULL UNIQUE,
    nombre          VARCHAR(100) NOT NULL,
    email           VARCHAR(150),
    password_hash   VARCHAR(72)  NOT NULL,
    rol             VARCHAR(20)  NOT NULL CHECK (rol IN ('cajero','supervisor','administrador')),
    punto_de_venta  INTEGER,
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Sesion de Caja ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sesion_cajas (
    id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    punto_de_venta          INTEGER       NOT NULL,
    usuario_id              UUID          NOT NULL REFERENCES usuarios(id),
    monto_inicial           DECIMAL(12,2) NOT NULL,
    monto_esperado          DECIMAL(12,2),
    monto_declarado         DECIMAL(12,2),
    desvio                  DECIMAL(12,2),
    desvio_pct              DECIMAL(5,2),
    estado                  VARCHAR(20)   NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
    clasificacion_desvio    VARCHAR(20),
    observaciones           TEXT,
    opened_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    closed_at               TIMESTAMPTZ
);

CREATE INDEX idx_sesion_caja_pdv_estado ON sesion_cajas(punto_de_venta, estado);

-- ── Movimientos de Caja ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS movimiento_cajas (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    sesion_caja_id  UUID          NOT NULL REFERENCES sesion_cajas(id),
    tipo            VARCHAR(20)   NOT NULL CHECK (tipo IN ('venta','ingreso_manual','egreso_manual','anulacion')),
    metodo_pago     VARCHAR(20)   CHECK (metodo_pago IN ('efectivo','debito','credito','transferencia')),
    monto           DECIMAL(12,2) NOT NULL,
    descripcion     TEXT          NOT NULL,
    referencia_id   UUID,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mov_caja_sesion ON movimiento_cajas(sesion_caja_id);

-- ── Ventas ────────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS ventas_numero_ticket_seq;

CREATE TABLE IF NOT EXISTS ventas (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_ticket   INTEGER       NOT NULL UNIQUE DEFAULT nextval('ventas_numero_ticket_seq'),
    sesion_caja_id  UUID          NOT NULL REFERENCES sesion_cajas(id),
    usuario_id      UUID          NOT NULL REFERENCES usuarios(id),
    subtotal        DECIMAL(12,2) NOT NULL,
    descuento_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    total           DECIMAL(12,2) NOT NULL,
    estado          VARCHAR(20)   NOT NULL DEFAULT 'completada' CHECK (estado IN ('completada','anulada')),
    comprobante_id  UUID,
    offline_id      VARCHAR(36)   UNIQUE,
    conflicto_stock BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ventas_sesion ON ventas(sesion_caja_id);
CREATE INDEX idx_ventas_created ON ventas(created_at);

-- ── Venta Items ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venta_items (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id        UUID          NOT NULL REFERENCES ventas(id),
    producto_id     UUID          NOT NULL REFERENCES productos(id),
    cantidad        INTEGER       NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    descuento_item  DECIMAL(10,2) NOT NULL DEFAULT 0,
    subtotal        DECIMAL(12,2) NOT NULL
);

CREATE INDEX idx_venta_items_venta ON venta_items(venta_id);

-- ── Venta Pagos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venta_pagos (
    id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id UUID          NOT NULL REFERENCES ventas(id),
    metodo   VARCHAR(20)   NOT NULL CHECK (metodo IN ('efectivo','debito','credito','transferencia')),
    monto    DECIMAL(12,2) NOT NULL
);

CREATE INDEX idx_venta_pagos_venta ON venta_pagos(venta_id);

-- ── Comprobantes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comprobantes (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id        UUID          NOT NULL REFERENCES ventas(id),
    tipo            VARCHAR(30)   NOT NULL,
    numero          BIGINT,
    punto_de_venta  INTEGER       NOT NULL DEFAULT 1,
    cae             VARCHAR(20),
    cae_vencimiento TIMESTAMPTZ,
    receptor_cuit   VARCHAR(20),
    receptor_nombre VARCHAR(200),
    monto_neto      DECIMAL(12,2) NOT NULL,
    monto_iva       DECIMAL(12,2) NOT NULL DEFAULT 0,
    monto_total     DECIMAL(12,2) NOT NULL,
    estado          VARCHAR(20)   NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','emitido','rechazado','error')),
    pdf_path        VARCHAR(500),
    observaciones   TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comprobantes_venta ON comprobantes(venta_id);

-- ── Seed: admin default user ──────────────────────────────────────────────────
-- Password: "blendpos2026" — CHANGE ON FIRST LOGIN
-- bcrypt hash (cost 12): generated with golang.org/x/crypto/bcrypt
INSERT INTO usuarios (username, nombre, password_hash, rol)
VALUES ('admin', 'Administrador', '$2a$12$czOpzwKZllZGSALbuhPJcOpCiQTnjyNG1TPZwl3sFv6JZJcdMoHH6', 'administrador')
ON CONFLICT (username) DO NOTHING;
