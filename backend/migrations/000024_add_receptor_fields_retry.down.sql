-- Rollback receptor fields
DROP INDEX IF EXISTS idx_comprobantes_receptor_cuit;
ALTER TABLE comprobantes DROP COLUMN IF EXISTS receptor_condicion_iva;
ALTER TABLE comprobantes DROP COLUMN IF EXISTS receptor_domicilio;
ALTER TABLE comprobantes DROP COLUMN IF EXISTS receptor_numero_documento;
ALTER TABLE comprobantes DROP COLUMN IF EXISTS receptor_tipo_documento;
