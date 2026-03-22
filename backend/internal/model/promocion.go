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
	Tipo        string          `gorm:"not null;default:'porcentaje'"` // "porcentaje" | "monto_fijo" | "precio_fijo_combo"
	Valor       decimal.Decimal `gorm:"type:decimal(12,2);not null;default:0"`
	Modo        string          `gorm:"not null;default:'clasico'"` // "clasico" | "grupos"
	// CantidadRequerida: for single-product promos, how many units must be in the
	// cart for the discount to activate (e.g., 2 for a 2x1). For multi-product
	// combo promos this field is ignored.
	CantidadRequerida int       `gorm:"not null;default:1"`
	FechaInicio       time.Time `gorm:"not null"`
	FechaFin          time.Time `gorm:"not null"`
	Activa            bool      `gorm:"not null;default:true"`
	CreatedAt         time.Time
	UpdatedAt         time.Time

	// Many-to-many association (used when Modo == "clasico")
	Productos []Producto `gorm:"many2many:promocion_productos;"`
	// Group-based association (used when Modo == "grupos")
	Grupos []PromocionGrupo `gorm:"foreignKey:PromocionID"`
}

func (Promocion) TableName() string { return "promociones" }

// PromocionGrupo represents a group of products within a group-based promotion.
type PromocionGrupo struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	PromocionID       uuid.UUID  `gorm:"type:uuid;not null;index"`
	Nombre            string     `gorm:"not null;default:''"`
	Orden             int        `gorm:"not null;default:0"`
	CantidadRequerida int        `gorm:"not null;default:1"`
	TipoSeleccion     string     `gorm:"not null;default:'productos'"` // "productos" | "categoria"
	CategoriaID       *uuid.UUID `gorm:"type:uuid"`
	CreatedAt         time.Time

	Productos []Producto `gorm:"many2many:promocion_grupo_productos;joinForeignKey:grupo_id;joinReferences:producto_id"`
	Categoria *Categoria `gorm:"foreignKey:CategoriaID"`
}

func (PromocionGrupo) TableName() string { return "promocion_grupos" }
