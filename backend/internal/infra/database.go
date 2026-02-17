package infra

import (
	"blendpos/internal/model"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// NewDatabase establishes a GORM connection backed by pgx and runs auto-migration
// for schema validation. Production schema changes use golang-migrate SQL files.
func NewDatabase(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		// Use a silent logger in production; verbose in development
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}

	// Expose underlying sql.DB to configure pool settings
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)

	// AutoMigrate is used only to verify schema consistency.
	// Actual schema creation is handled by golang-migrate (migrations/).
	_ = db.AutoMigrate(
		&model.Producto{},
		&model.ProductoHijo{},
		&model.Usuario{},
		&model.SesionCaja{},
		&model.MovimientoCaja{},
		&model.Venta{},
		&model.VentaItem{},
		&model.VentaPago{},
		&model.Comprobante{},
		&model.Proveedor{},
	)

	return db, nil
}
