-- Rollback domicilio fields
ALTER TABLE configuracion_fiscal DROP COLUMN IF EXISTS logo_path;
ALTER TABLE configuracion_fiscal DROP COLUMN IF EXISTS domicilio_codigo_postal;
ALTER TABLE configuracion_fiscal DROP COLUMN IF EXISTS domicilio_provincia;
ALTER TABLE configuracion_fiscal DROP COLUMN IF EXISTS domicilio_ciudad;
ALTER TABLE configuracion_fiscal DROP COLUMN IF EXISTS domicilio_comercial;
