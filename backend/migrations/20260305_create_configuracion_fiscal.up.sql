CREATE TABLE configuracion_fiscal (
    id UUID PRIMARY KEY,
    cuit_emisor VARCHAR(20) NOT NULL,
    razon_social VARCHAR(255) NOT NULL,
    condicion_fiscal VARCHAR(50) NOT NULL,
    punto_de_venta INT NOT NULL,
    certificado_crt TEXT,
    certificado_key TEXT,
    modo VARCHAR(20) NOT NULL DEFAULT 'homologacion',
    fecha_inicio_actividades DATE,
    iibb VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
