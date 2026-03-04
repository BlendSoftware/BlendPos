package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Promocion represents a time-limited discount promotion applied to specific products.
type Promocion struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Nombre      string    `gorm:"not null"`
	Descripcion *string
	Tipo        string          `gorm:"not null;default:'porcentaje'"` // "porcentaje" | "monto_fijo"
	Valor       decimal.Decimal `gorm:"type:decimal(12,2);not null;default:0"`
	// CantidadRequerida: for single-product promos, how many units must be in the
	// cart for the discount to activate (e.g., 2 for a 2x1). For multi-product
	// combo promos this field is ignored.
	CantidadRequerida int       `gorm:"not null;default:1"`
	FechaInicio       time.Time `gorm:"not null"`
	FechaFin          time.Time `gorm:"not null"`
	Activa            bool      `gorm:"not null;default:true"`
	CreatedAt         time.Time
	UpdatedAt         time.Time

	// Many-to-many association
	Productos []Producto `gorm:"many2many:promocion_productos;"`
}

func (Promocion) TableName() string { return "promociones" }
