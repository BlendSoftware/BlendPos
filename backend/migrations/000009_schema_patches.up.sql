-- migration 000009: consolidate pre-migration compatibility patches
--
-- This migration makes the idempotent DDL in applyPreMigrationPatches() (database.go)
-- the authoritative source for NEW deployments.  On an existing deployment the
-- DO $$ ... $$ blocks are no-ops (all guards return false once already patched).
--
-- After applying this migration the Go-level applyPreMigrationPatches function
-- remains as a safety-net for deployments that skip migrations, but will silently
-- become a no-op once the schema is in the correct state.

-- 1. Drop stale standalone index objects (left by failed GORM AutoMigrate attempts)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uni_productos_codigo_barras')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_productos_codigo_barras') THEN
    DROP INDEX uni_productos_codigo_barras;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uni_usuarios_username')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_usuarios_username') THEN
    DROP INDEX uni_usuarios_username;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uni_proveedores_cuit')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_proveedores_cuit') THEN
    DROP INDEX uni_proveedores_cuit;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uni_ventas_numero_ticket')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_ventas_numero_ticket') THEN
    DROP INDEX uni_ventas_numero_ticket;
  END IF;
END $$;

-- 2. Drop duplicate barcode index (covered by constraint)
DROP INDEX IF EXISTS idx_productos_barcode;

-- 3. Rename *_key constraints to uni_* names expected by GORM
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = to_regclass('productos') AND conname = 'productos_codigo_barras_key') THEN
    ALTER TABLE productos RENAME CONSTRAINT productos_codigo_barras_key TO uni_productos_codigo_barras;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = to_regclass('usuarios') AND conname = 'usuarios_username_key') THEN
    ALTER TABLE usuarios RENAME CONSTRAINT usuarios_username_key TO uni_usuarios_username;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = to_regclass('proveedores') AND conname = 'proveedores_cuit_key') THEN
    ALTER TABLE proveedores RENAME CONSTRAINT proveedores_cuit_key TO uni_proveedores_cuit;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = to_regclass('ventas') AND conname = 'ventas_numero_ticket_key') THEN
    ALTER TABLE ventas RENAME CONSTRAINT ventas_numero_ticket_key TO uni_ventas_numero_ticket;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = to_regclass('ventas') AND conname = 'ventas_offline_id_key') THEN
    ALTER TABLE ventas RENAME CONSTRAINT ventas_offline_id_key TO uni_ventas_offline_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = to_regclass('producto_hijos')
               AND conname = 'producto_hijos_producto_padre_id_producto_hijo_id_key')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_padre_hijo') THEN
    ALTER TABLE producto_hijos
      RENAME CONSTRAINT producto_hijos_producto_padre_id_producto_hijo_id_key TO idx_padre_hijo;
  END IF;
END $$;

-- 4. Migrate data from stale GORM-created "proveedors" table into "proveedores"
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proveedors') THEN
    INSERT INTO proveedores (id, razon_social, cuit, telefono, email, direccion,
                             condicion_pago, activo, created_at, updated_at)
    SELECT id, razon_social, c_ui_t, telefono, email, direccion,
           condicion_pago, activo, created_at, updated_at
    FROM proveedors
    WHERE id NOT IN (SELECT id FROM proveedores);

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_proveedors_productos') THEN
      ALTER TABLE productos DROP CONSTRAINT fk_proveedors_productos;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_historial_precios_proveedor') THEN
      ALTER TABLE historial_precios DROP CONSTRAINT fk_historial_precios_proveedor;
      ALTER TABLE historial_precios
        ADD CONSTRAINT fk_historial_precios_proveedor
        FOREIGN KEY (proveedor_id) REFERENCES proveedores(id);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_proveedors_contactos') THEN
      ALTER TABLE contacto_proveedors DROP CONSTRAINT fk_proveedors_contactos;
      ALTER TABLE contacto_proveedors
        ADD CONSTRAINT fk_contacto_proveedors_proveedor
        FOREIGN KEY (proveedor_id) REFERENCES proveedores(id);
    END IF;

    DROP TABLE proveedors;
  END IF;
END $$;
