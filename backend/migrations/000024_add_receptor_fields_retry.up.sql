-- Retry: Agregar campos de receptor a comprobantes
ALTER TABLE comprobantes 
ADD COLUMN IF NOT EXISTS receptor_tipo_documento INT DEFAULT 99;

ALTER TABLE comprobantes 
ADD COLUMN IF NOT EXISTS receptor_numero_documento VARCHAR(20);

ALTER TABLE comprobantes 
ADD COLUMN IF NOT EXISTS receptor_domicilio VARCHAR(255);

ALTER TABLE comprobantes 
ADD COLUMN IF NOT EXISTS receptor_condicion_iva INT DEFAULT 5;

-- Índice para búsquedas por CUIT
CREATE INDEX IF NOT EXISTS idx_comprobantes_receptor_cuit ON comprobantes(receptor_cuit) WHERE receptor_cuit IS NOT NULL;
