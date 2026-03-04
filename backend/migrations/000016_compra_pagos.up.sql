-- Migration 000016: Pagos de compras

CREATE TABLE IF NOT EXISTS compra_pagos (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    compra_id    UUID          NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    metodo       VARCHAR(50)   NOT NULL DEFAULT 'efectivo',
    monto        DECIMAL(12,2) NOT NULL DEFAULT 0,
    referencia   VARCHAR(255),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compra_pagos_compra ON compra_pagos(compra_id);
