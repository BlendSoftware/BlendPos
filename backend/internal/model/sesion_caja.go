package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// SesionCaja represents the lifecycle of a cash register session.
// Estado: "abierta" | "cerrada"
type SesionCaja struct {
	ID           uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	PuntoDeVenta int             `gorm:"not null;index"`
	UsuarioID    uuid.UUID       `gorm:"type:uuid;not null"`
	MontoInicial decimal.Decimal `gorm:"type:decimal(12,2);not null"`
	// MontoEsperado is computed on close: SUM(movimientos) + MontoInicial
	MontoEsperado  *decimal.Decimal `gorm:"type:decimal(12,2)"`
	MontoDeclarado *decimal.Decimal `gorm:"type:decimal(12,2)"`
	Desvio         *decimal.Decimal `gorm:"type:decimal(12,2)"`
	DesvioPct      *decimal.Decimal `gorm:"type:decimal(5,2)"`
	Estado         string           `gorm:"type:varchar(20);not null;default:'abierta'"`
	// ClasificacionDesvio: "normal" | "advertencia" | "critico"
	ClasificacionDesvio *string `gorm:"type:varchar(20)"`
	Observaciones       *string
	OpenedAt            time.Time
	ClosedAt            *time.Time

	Movimientos []MovimientoCaja `gorm:"foreignKey:SesionCajaID"`
}

// MovimientoCaja is an immutable event in the cash register ledger.
// Tipo: "venta" | "ingreso_manual" | "egreso_manual" | "anulacion"
// Movements are NEVER modified or deleted — cancellations create inverse entries.
type MovimientoCaja struct {
	ID           uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	SesionCajaID uuid.UUID       `gorm:"type:uuid;index;not null"`
	Tipo         string          `gorm:"type:varchar(20);not null"`
	MetodoPago   *string         `gorm:"type:varchar(20)"`
	Monto        decimal.Decimal `gorm:"type:decimal(12,2);not null"`
	Descripcion  string          `gorm:"not null"`
	// ReferenciaID links to the originating Venta or manual operation
	ReferenciaID *uuid.UUID `gorm:"type:uuid"`
	CreatedAt    time.Time
}
