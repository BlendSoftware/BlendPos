-- H-01: Prevent two open cash registers for the same punto_de_venta.
-- A partial unique index is the safest way — the DB enforces the constraint
-- even under concurrent writes, without needing advisory locks.
CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_abierta_por_punto
    ON sesion_cajas (punto_de_venta)
    WHERE estado = 'abierta';
