-- Retry: Agregar campos de domicilio a configuracion_fiscal
ALTER TABLE configuracion_fiscal 
ADD COLUMN IF NOT EXISTS domicilio_comercial VARCHAR(255);

ALTER TABLE configuracion_fiscal 
ADD COLUMN IF NOT EXISTS domicilio_ciudad VARCHAR(100);

ALTER TABLE configuracion_fiscal 
ADD COLUMN IF NOT EXISTS domicilio_provincia VARCHAR(100);

ALTER TABLE configuracion_fiscal 
ADD COLUMN IF NOT EXISTS domicilio_codigo_postal VARCHAR(10);

ALTER TABLE configuracion_fiscal 
ADD COLUMN IF NOT EXISTS logo_path VARCHAR(255);
