-- Rollback de migración 000004: Revertir campos decimal de sesion_caja y movimientos_caja

-- sesion_caja: revertir de decimal(15,2) a decimal(12,2)
ALTER TABLE sesion_cajas
    ALTER COLUMN monto_inicial TYPE decimal(12,2),
    ALTER COLUMN monto_esperado TYPE decimal(12,2),
    ALTER COLUMN monto_declarado TYPE decimal(12,2),
    ALTER COLUMN desvio TYPE decimal(12,2);

-- movimientos_caja: revertir de decimal(15,2) a decimal(12,2)
ALTER TABLE movimiento_cajas
    ALTER COLUMN monto TYPE decimal(12,2);
