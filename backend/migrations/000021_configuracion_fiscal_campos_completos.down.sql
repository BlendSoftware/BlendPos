ALTER TABLE configuracion_fiscal
DROP COLUMN IF EXISTS domicilio_comercial,
DROP COLUMN IF EXISTS domicilio_ciudad,
DROP COLUMN IF EXISTS domicilio_provincia,
DROP COLUMN IF EXISTS domicilio_codigo_postal,
DROP COLUMN IF EXISTS logo_path;
