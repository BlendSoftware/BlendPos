-- Migración 000004: Aumentar precisión de campos decimal en sesion_caja y movimientos_caja
-- para evitar errores SQLSTATE 22003 (numeric field overflow)

-- sesion_caja: cambiar de decimal(12,2) a decimal(15,2)
ALTER TABLE sesion_cajas
    ALTER COLUMN monto_inicial TYPE decimal(15,2),
    ALTER COLUMN monto_esperado TYPE decimal(15,2),
    ALTER COLUMN monto_declarado TYPE decimal(15,2),
    ALTER COLUMN desvio TYPE decimal(15,2);

-- movimientos_caja: cambiar de decimal(12,2) a decimal(15,2)
ALTER TABLE movimiento_cajas
    ALTER COLUMN monto TYPE decimal(15,2);
