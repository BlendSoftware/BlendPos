package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// HistorialPrecio registra cada cambio de precio de un producto.
// Los registros son inmutables — nunca se eliminan ni modifican.
// AC-07.2 / RF-26: Historial de cambios de precios.
type HistorialPrecio struct {
	ID          uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProductoID  uuid.UUID       `gorm:"type:uuid;not null;index"`
	ProveedorID *uuid.UUID      `gorm:"type:uuid;index"`
	CostoAntes  decimal.Decimal `gorm:"type:decimal(10,2);not null"`
	CostoDespues decimal.Decimal `gorm:"type:decimal(10,2);not null"`
	VentaAntes  decimal.Decimal `gorm:"type:decimal(10,2);not null"`
	VentaDespues decimal.Decimal `gorm:"type:decimal(10,2);not null"`
	PorcentajeAplicado decimal.Decimal `gorm:"type:decimal(5,2);not null"`
	Motivo      string          `gorm:"not null;default:'actualizacion_masiva'"` // actualizacion_masiva | csv_import | manual
	CreatedAt   time.Time

	Producto  Producto   `gorm:"foreignKey:ProductoID"`
	Proveedor *Proveedor `gorm:"foreignKey:ProveedorID"`
}
