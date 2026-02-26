package infra

import (
	"fmt"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// NewDatabase establishes a GORM connection backed by pgx, runs AutoMigrate to
// create / update all tables, then applies any idempotent SQL patches that GORM
// cannot express (partial indexes, column additions that AutoMigrate may skip on
// existing DBs, etc.).
func NewDatabase(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)

	if err := applyPreMigrationPatches(db); err != nil {
		return nil, fmt.Errorf("pre-migration patches: %w", err)
	}

	// ⚠️ GORM AutoMigrate DISABLED: Schema is managed exclusively via SQL migrations
	// to prevent conflicts and maintain precise control over decimal precision,
	// constraints, and other DDL operations. See migrations/ directory.
	// if err := db.AutoMigrate(
	// 	&model.Producto{},
	// 	&model.ProductoHijo{},
	// 	&model.Usuario{},
	// 	&model.SesionCaja{},
	// 	&model.MovimientoCaja{},
	// 	&model.Venta{},
	// 	&model.VentaItem{},
	// 	&model.VentaPago{},
	// 	&model.Comprobante{},
	// 	&model.Proveedor{},
	// 	&model.HistorialPrecio{},
	// 	&model.MovimientoStock{},
	// 	&model.Categoria{},
	// 	&model.ContactoProveedor{},
	// ); err != nil {
	// 	return nil, fmt.Errorf("AutoMigrate: %w", err)
	// }

	if err := applySchemaPatches(db); err != nil {
		return nil, fmt.Errorf("schema patches: %w", err)
	}

	return db, nil
}

// applyPreMigrationPatches reconciles DB constraint/index names with what GORM
// AutoMigrate expects before it runs.
//
// Background:
//   - SQL migrations (000001) created unique constraints with PostgreSQL's default
//     naming: "{table}_{column}_key" (e.g. productos_codigo_barras_key).
//   - GORM AutoMigrate names constraints "uni_{table}_{column}" and issues
//     ALTER TABLE … DROP CONSTRAINT uni_* before re-creating.  When the DB only
//     has the *_key name the DROP fails with SQLSTATE 42704.
//   - A previous remediation attempt erroneously created standalone uni_* INDEX
//     objects; those must be dropped first (they cannot be dropped via DROP CONSTRAINT).
//
// This function is fully idempotent: each statement is guarded by an existence
// check so re-running on an already-patched schema is a no-op.
func applyPreMigrationPatches(db *gorm.DB) error {
	patches := []struct{ descr, sql string }{
		// 1. Drop stale standalone INDEX objects (not backed by a constraint) that were
		//    left by a previous failed migration attempt.  These must be dropped BEFORE
		//    the rename steps below because they share the same uni_* name.
		//    Guard: only drop if the name exists as an index AND has no backing constraint.
		{"drop stale standalone idx uni_productos_codigo_barras", `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uni_productos_codigo_barras')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_productos_codigo_barras') THEN
    DROP INDEX uni_productos_codigo_barras;
  END IF;
END $$`},
		{"drop stale standalone idx uni_usuarios_username", `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uni_usuarios_username')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_usuarios_username') THEN
    DROP INDEX uni_usuarios_username;
  END IF;
END $$`},
		{"drop stale standalone idx uni_proveedores_cuit", `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uni_proveedores_cuit')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_proveedores_cuit') THEN
    DROP INDEX uni_proveedores_cuit;
  END IF;
END $$`},
		{"drop stale standalone idx uni_ventas_numero_ticket", `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uni_ventas_numero_ticket')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_ventas_numero_ticket') THEN
    DROP INDEX uni_ventas_numero_ticket;
  END IF;
END $$`},

		// 2. Drop the duplicate idx_productos_barcode index (covered by the constraint).
		{"drop duplicate idx_productos_barcode",
			`DROP INDEX IF EXISTS idx_productos_barcode`},

		// 3. Rename *_key UNIQUE CONSTRAINTs to the uni_* names GORM expects.
		//    Each block only fires when the old name still exists (idempotent).
		{"rename productos_codigo_barras_key → uni_productos_codigo_barras", `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = to_regclass('productos') AND conname = 'productos_codigo_barras_key') THEN
    ALTER TABLE productos RENAME CONSTRAINT productos_codigo_barras_key TO uni_productos_codigo_barras;
  END IF;
END $$`},
		{"rename usuarios_username_key → uni_usuarios_username", `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = to_regclass('usuarios') AND conname = 'usuarios_username_key') THEN
    ALTER TABLE usuarios RENAME CONSTRAINT usuarios_username_key TO uni_usuarios_username;
  END IF;
END $$`},
		{"rename proveedores_cuit_key → uni_proveedores_cuit", `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = to_regclass('proveedores') AND conname = 'proveedores_cuit_key') THEN
    ALTER TABLE proveedores RENAME CONSTRAINT proveedores_cuit_key TO uni_proveedores_cuit;
  END IF;
END $$`},
		{"rename ventas_numero_ticket_key → uni_ventas_numero_ticket", `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = to_regclass('ventas') AND conname = 'ventas_numero_ticket_key') THEN
    ALTER TABLE ventas RENAME CONSTRAINT ventas_numero_ticket_key TO uni_ventas_numero_ticket;
  END IF;
END $$`},
		// ventas.offline_id: DB has a UNIQUE constraint; model now only has index.
		// GORM will try to drop "uni_ventas_offline_id" before creating a regular index.
		{"rename ventas_offline_id_key → uni_ventas_offline_id", `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = to_regclass('ventas') AND conname = 'ventas_offline_id_key') THEN
    ALTER TABLE ventas RENAME CONSTRAINT ventas_offline_id_key TO uni_ventas_offline_id;
  END IF;
END $$`},
		// producto_hijos: composite UNIQUE constraint; model uses uniqueIndex:idx_padre_hijo.
		// The SQL migration already created a standalone idx_padre_hijo index, so GORM
		// will find it and make no changes.  We just need to ensure the rename is a no-op
		// if idx_padre_hijo already exists.
		{"reconcile producto_hijos composite index", `
DO $$ BEGIN
  -- Only rename if old constraint exists AND idx_padre_hijo does NOT yet exist
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = to_regclass('producto_hijos')
               AND conname = 'producto_hijos_producto_padre_id_producto_hijo_id_key')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_padre_hijo') THEN
    ALTER TABLE producto_hijos
      RENAME CONSTRAINT producto_hijos_producto_padre_id_producto_hijo_id_key TO idx_padre_hijo;
  END IF;
END $$`},

		// 4. Migrate data from the stale GORM-created "proveedors" table into the
		//    SQL-migration-created "proveedores" table, then retarget all FKs and drop.
		//    Background: Proveedor model lacked TableName() so GORM auto-created
		//    "proveedors" (wrong) with column "c_ui_t" instead of "cuit".
		//    FKs on productos, historial_precios, and contacto_proveedors all point
		//    to "proveedors"; after migration they must point to "proveedores".
		{"migrate proveedors → proveedores and retarget FKs", `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proveedors') THEN
    -- Copy rows from proveedors into proveedores (c_ui_t → cuit)
    INSERT INTO proveedores (id, razon_social, cuit, telefono, email, direccion,
                             condicion_pago, activo, created_at, updated_at)
    SELECT id, razon_social, c_ui_t, telefono, email, direccion,
           condicion_pago, activo, created_at, updated_at
    FROM proveedors
    WHERE id NOT IN (SELECT id FROM proveedores);

    -- Retarget productos FK: drop GORM-created FK to proveedors
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_proveedors_productos') THEN
      ALTER TABLE productos DROP CONSTRAINT fk_proveedors_productos;
    END IF;

    -- Retarget historial_precios FK
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_historial_precios_proveedor') THEN
      ALTER TABLE historial_precios DROP CONSTRAINT fk_historial_precios_proveedor;
      ALTER TABLE historial_precios
        ADD CONSTRAINT fk_historial_precios_proveedor
        FOREIGN KEY (proveedor_id) REFERENCES proveedores(id);
    END IF;

    -- Retarget contacto_proveedors FK
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_proveedors_contactos') THEN
      ALTER TABLE contacto_proveedors DROP CONSTRAINT fk_proveedors_contactos;
      ALTER TABLE contacto_proveedors
        ADD CONSTRAINT fk_contacto_proveedors_proveedor
        FOREIGN KEY (proveedor_id) REFERENCES proveedores(id);
    END IF;

    DROP TABLE proveedors;
  END IF;
END $$`},
	}
	for _, p := range patches {
		if err := db.Exec(p.sql).Error; err != nil {
			return fmt.Errorf("pre-patch %q: %w", p.descr, err)
		}
	}
	return nil
}

// applySchemaPatches runs idempotent DDL statements that GORM AutoMigrate cannot
// fully handle on its own (e.g. partial indexes, backfill of columns added to an
// existing table after initial deployment).  Each statement uses IF NOT EXISTS /
// DO NOTHING semantics so re-running on an already-patched DB is safe.
func applySchemaPatches(db *gorm.DB) error {
	patches := []string{
	// migration 000003: retry columns — ADD COLUMN IF NOT EXISTS is idempotent
		`DO $$ BEGIN
		  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comprobantes') THEN
		    ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS retry_count   INT         NOT NULL DEFAULT 0;
		    ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;
		    ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS last_error    TEXT;
		  END IF;
		END $$`,
		// migration 000003: partial index for the retry cron query
		`DO $$ BEGIN
		  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comprobantes')
		    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_comprobantes_pending_retry') THEN
		    CREATE INDEX idx_comprobantes_pending_retry
		        ON comprobantes (next_retry_at)
		        WHERE estado = 'pendiente' AND next_retry_at IS NOT NULL;
		  END IF;
		END $$`,
		// migration 000002: historial_precios index (safe to re-create)
		`DO $$ BEGIN
		  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'historial_precios')
		    AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_historial_precios_producto') THEN
		    CREATE INDEX idx_historial_precios_producto
		        ON historial_precios (producto_id);
		  END IF;
		END $$`,
	}

	for _, sql := range patches {
		if err := db.Exec(sql).Error; err != nil {
			return fmt.Errorf("patch %q: %w", sql[:min(len(sql), 60)], err)
		}
	}
	return nil
}

// RunMigrations applies schema patches for integration tests.
// ⚠️ GORM AutoMigrate DISABLED: Use SQL migrations exclusively (see migrations/ directory).
// Tests should use migrate CLI to apply migrations instead of GORM AutoMigrate.
func RunMigrations(db *gorm.DB) error {
	// if err := db.AutoMigrate(
	// 	&model.Producto{},
	// 	&model.ProductoHijo{},
	// 	&model.Usuario{},
	// 	&model.SesionCaja{},
	// 	&model.MovimientoCaja{},
	// 	&model.Venta{},
	// 	&model.VentaItem{},
	// 	&model.VentaPago{},
	// 	&model.Comprobante{},
	// 	&model.Proveedor{},
	// 	&model.HistorialPrecio{},
	// 	&model.MovimientoStock{},
	// 	&model.Categoria{},
	// 	&model.ContactoProveedor{},
	// ); err != nil {
	// 	return err
	// }
	return applySchemaPatches(db)
}
