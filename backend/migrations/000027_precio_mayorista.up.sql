-- Migration 000027: Precio mayorista por producto
-- Permite definir un precio mayorista alternativo por producto. NULL = sin precio mayorista.
-- El POS muestra un toggle "Mayorista" en la fila solo si el producto tiene este campo poblado.

ALTER TABLE productos
    ADD COLUMN precio_mayorista DECIMAL(10,2) NULL
    CHECK (precio_mayorista IS NULL OR precio_mayorista >= 0);

COMMENT ON COLUMN productos.precio_mayorista IS
    'Precio mayorista opcional. NULL = sin precio mayorista. Se aplica por ítem en el POS, no a toda la venta.';
