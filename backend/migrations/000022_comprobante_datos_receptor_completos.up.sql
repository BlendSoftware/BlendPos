-- Agregar campos completos del receptor según AFIP (idempotente)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='comprobantes' AND column_name='receptor_tipo_documento') THEN
        ALTER TABLE comprobantes
        ADD COLUMN receptor_tipo_documento INT DEFAULT 99, -- 80=CUIT, 96=DNI, 99=Consumidor Final sin identificar
        ADD COLUMN receptor_numero_documento VARCHAR(20),
        ADD COLUMN receptor_domicilio VARCHAR(255),
        ADD COLUMN receptor_condicion_iva INT DEFAULT 5; -- 1=RI, 4=Exento, 5=Consumidor Final, 6=Monotributista
    END IF;
END $$;

-- Agregar comentarios
COMMENT ON COLUMN comprobantes.receptor_tipo_documento IS 'Código AFIP: 80=CUIT, 96=DNI, 99=Sin identificar';
COMMENT ON COLUMN comprobantes.receptor_condicion_iva IS 'Código AFIP: 1=RI, 4=Exento, 5=CF, 6=Monotributista';

-- Índice para búsquedas por CUIT (idempotente)
CREATE INDEX IF NOT EXISTS idx_comprobantes_receptor_cuit ON comprobantes(receptor_cuit) WHERE receptor_cuit IS NOT NULL;
