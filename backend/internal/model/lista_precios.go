package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type ListaPrecios struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Nombre    string    `gorm:"uniqueIndex;not null;size:120"`
	LogoURL   *string   `gorm:"column:logo_url"`
	CreatedAt time.Time
	UpdatedAt time.Time

	Productos []ListaPreciosProducto `gorm:"foreignKey:ListaPreciosID"`
}

func (ListaPrecios) TableName() string { return "lista_precios" }

type ListaPreciosProducto struct {
	ID                   uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ListaPreciosID       uuid.UUID       `gorm:"type:uuid;not null;index"`
	ProductoID           uuid.UUID       `gorm:"type:uuid;not null;index"`
	DescuentoPorcentaje  decimal.Decimal `gorm:"type:decimal(5,2);not null"`
	CreatedAt            time.Time
	UpdatedAt            time.Time

	Producto *Producto `gorm:"foreignKey:ProductoID"`
}

func (ListaPreciosProducto) TableName() string { return "lista_precios_producto" }
