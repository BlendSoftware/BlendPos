-- 000006_add_qr_payment_method.up.sql
-- Add 'qr' to the CHECK constraints on venta_pagos and movimiento_cajas.
-- Without this, any sale paid by QR is rejected by PostgreSQL.

-- ── venta_pagos ───────────────────────────────────────────────────────────────
ALTER TABLE venta_pagos DROP CONSTRAINT venta_pagos_metodo_check;
ALTER TABLE venta_pagos ADD CONSTRAINT venta_pagos_metodo_check
    CHECK (metodo IN ('efectivo','debito','credito','transferencia','qr'));

-- ── movimiento_cajas ─────────────────────────────────────────────────────────
ALTER TABLE movimiento_cajas DROP CONSTRAINT movimiento_cajas_metodo_pago_check;
ALTER TABLE movimiento_cajas ADD CONSTRAINT movimiento_cajas_metodo_pago_check
    CHECK (metodo_pago IN ('efectivo','debito','credito','transferencia','qr'));
