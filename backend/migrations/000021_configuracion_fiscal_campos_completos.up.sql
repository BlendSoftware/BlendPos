-- Agregar campos obligatorios por AFIP para emisor
ALTER TABLE configuracion_fiscal
ADD COLUMN domicilio_comercial VARCHAR(255),
ADD COLUMN domicilio_ciudad VARCHAR(100),
ADD COLUMN domicilio_provincia VARCHAR(100),
ADD COLUMN domicilio_codigo_postal VARCHAR(10),
ADD COLUMN logo_path VARCHAR(255);

-- Agregar comentarios para claridad
COMMENT ON COLUMN configuracion_fiscal.domicilio_comercial IS 'Dirección completa del establecimiento comercial';
COMMENT ON COLUMN configuracion_fiscal.logo_path IS 'Ruta al archivo de logo para facturas (relativo a storage)';
