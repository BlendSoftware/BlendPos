-- 000006_add_qr_payment_method.down.sql
-- Revert: remove 'qr' from CHECK constraints.

ALTER TABLE venta_pagos DROP CONSTRAINT venta_pagos_metodo_check;
ALTER TABLE venta_pagos ADD CONSTRAINT venta_pagos_metodo_check
    CHECK (metodo IN ('efectivo','debito','credito','transferencia'));

ALTER TABLE movimiento_cajas DROP CONSTRAINT movimiento_cajas_metodo_pago_check;
ALTER TABLE movimiento_cajas ADD CONSTRAINT movimiento_cajas_metodo_pago_check
    CHECK (metodo_pago IN ('efectivo','debito','credito','transferencia'));
