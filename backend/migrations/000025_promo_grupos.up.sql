-- Add 'modo' column to promociones: 'clasico' (backward compat) | 'grupos' (new)
ALTER TABLE promociones ADD COLUMN IF NOT EXISTS modo VARCHAR(10) NOT NULL DEFAULT 'clasico';

-- New table: promotion groups
CREATE TABLE IF NOT EXISTS promocion_grupos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promocion_id UUID NOT NULL REFERENCES promociones(id) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL DEFAULT '',
    orden INT NOT NULL DEFAULT 0,
    cantidad_requerida INT NOT NULL DEFAULT 1,
    tipo_seleccion VARCHAR(20) NOT NULL DEFAULT 'productos', -- 'productos' | 'categoria'
    categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_grupos_promocion ON promocion_grupos(promocion_id);

-- New join table: products belonging to a promotion group
CREATE TABLE IF NOT EXISTS promocion_grupo_productos (
    grupo_id UUID NOT NULL REFERENCES promocion_grupos(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    PRIMARY KEY (grupo_id, producto_id)
);
