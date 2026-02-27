package model

import (
	"time"

	"github.com/google/uuid"
)

// MovimientoStock registra cada cambio de stock en un producto.
// Se crea automáticamente al vender, ajustar, o desarmar un producto.
type MovimientoStock struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProductoID    uuid.UUID `gorm:"type:uuid;not null;index"`
	Tipo          string    `gorm:"not null"` // "venta" | "ajuste_manual" | "desarme" | "restore_anulacion"
	Cantidad      int       `gorm:"not null"` // positive = entrada, negative = salida
	StockAnterior int       `gorm:"not null"`
	StockNuevo    int       `gorm:"not null"`
	Motivo        string
	ReferenciaID  *uuid.UUID `gorm:"type:uuid"` // venta_id or sesion_caja_id if applicable
	CreatedAt     time.Time

	Producto *Producto `gorm:"foreignKey:ProductoID"`
}

// TableName overrides GORM's default pluralization (movimiento_stocks → movimientos_stock).
func (MovimientoStock) TableName() string { return "movimientos_stock" }
