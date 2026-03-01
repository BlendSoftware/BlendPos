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
	// Categoria is the legacy string column kept for backward compatibility.
	// New code should use CategoriaID + the Categoria FK association.
	// Will be dropped in migration 000009 once all writes use CategoriaID.
	Categoria    string          `gorm:"not null"`
	// CategoriaID is the normalized FK reference added in migration 000008 (P2-007).
	CategoriaID  uuid.UUID       `gorm:"type:uuid;not null;index"`
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

	CategoriaFK *Categoria `gorm:"foreignKey:CategoriaID"`
	Proveedor   *Proveedor `gorm:"foreignKey:ProveedorID"`
}
