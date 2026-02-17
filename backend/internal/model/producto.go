package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Producto represents both simple products and parent/child participants.
// EsPadre=true means this product has child units linked via ProductoHijo.
type Producto struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	CodigoBarras string    `gorm:"uniqueIndex;not null"`
	Nombre       string    `gorm:"index;not null"`
	Descripcion  *string
	Categoria    string          `gorm:"not null"`
	PrecioCosto  decimal.Decimal `gorm:"type:decimal(10,2);not null"`
	PrecioVenta  decimal.Decimal `gorm:"type:decimal(10,2);not null"`
	// MargenPct is derived from (PrecioVenta - PrecioCosto) / PrecioCosto * 100
	MargenPct    decimal.Decimal `gorm:"type:decimal(5,2)"`
	StockActual  int             `gorm:"not null;default:0"`
	StockMinimo  int             `gorm:"not null;default:5"`
	UnidadMedida string          `gorm:"not null;default:'unidad'"`
	EsPadre      bool            `gorm:"not null;default:false"`
	ProveedorID  *uuid.UUID      `gorm:"type:uuid;index"`
	Activo       bool            `gorm:"not null;default:true"`
	CreatedAt    time.Time
	UpdatedAt    time.Time

	Proveedor *Proveedor `gorm:"foreignKey:ProveedorID"`
}
