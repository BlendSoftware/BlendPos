package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Compra represents a purchase order from a supplier.
type Compra struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Numero           *string   `gorm:"type:varchar(100)"`
	ProveedorID      uuid.UUID `gorm:"type:uuid;not null;index"`
	FechaCompra      time.Time `gorm:"not null;default:now()"`
	FechaVencimiento time.Time `gorm:"not null"`
	Moneda           string    `gorm:"not null;default:'ARS'"`
	Deposito         string    `gorm:"not null;default:'Principal'"`
	Notas            *string
	Subtotal         decimal.Decimal `gorm:"type:decimal(12,2);not null;default:0"`
	DescuentoTotal   decimal.Decimal `gorm:"type:decimal(12,2);not null;default:0"`
	Total            decimal.Decimal `gorm:"type:decimal(12,2);not null;default:0"`
	Estado           string          `gorm:"not null;default:'pendiente'"` // pendiente, pagada, anulada
	CreatedAt        time.Time
	UpdatedAt        time.Time

	// Associations
	Proveedor *Proveedor   `gorm:"foreignKey:ProveedorID"`
	Items     []CompraItem `gorm:"foreignKey:CompraID;constraint:OnDelete:CASCADE"`
	Pagos     []CompraPago `gorm:"foreignKey:CompraID;constraint:OnDelete:CASCADE"`
}

func (Compra) TableName() string { return "compras" }

// CompraPago represents a payment made against a purchase order.
type CompraPago struct {
	ID         uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	CompraID   uuid.UUID       `gorm:"type:uuid;not null;index"`
	Metodo     string          `gorm:"not null;default:'efectivo'"`
	Monto      decimal.Decimal `gorm:"type:decimal(12,2);not null;default:0"`
	Referencia *string
	CreatedAt  time.Time
}

func (CompraPago) TableName() string { return "compra_pagos" }

// CompraItem represents a line item within a purchase order.
type CompraItem struct {
	ID             uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	CompraID       uuid.UUID       `gorm:"type:uuid;not null;index"`
	ProductoID     *uuid.UUID      `gorm:"type:uuid"`
	NombreProducto string          `gorm:"not null"`
	Precio         decimal.Decimal `gorm:"type:decimal(12,2);not null;default:0"`
	DescuentoPct   decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0"`
	ImpuestoPct    decimal.Decimal `gorm:"type:decimal(5,2);not null;default:0"`
	Cantidad       int             `gorm:"not null;default:1"`
	Observaciones  *string
	Total          decimal.Decimal `gorm:"type:decimal(12,2);not null;default:0"`
	CreatedAt      time.Time

	// Associations
	Producto *Producto `gorm:"foreignKey:ProductoID"`
}

func (CompraItem) TableName() string { return "compra_items" }
