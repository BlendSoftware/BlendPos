package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// Comprobante stores a fiscal or internal receipt.
// Tipo: "factura_a" | "factura_b" | "factura_c" | "nota_credito" | "nota_debito" | "ticket_interno"
// Estado: "pendiente" | "emitido" | "rechazado" | "error"
type Comprobante struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	VentaID      uuid.UUID `gorm:"type:uuid;index;not null"`
	Tipo         string    `gorm:"type:varchar(30);not null"`
	Numero       *int64
	PuntoDeVenta int
	// CAE is the authorization code returned by AFIP
	CAE            *string    `gorm:"type:varchar(20);column:cae"`
	CAEVencimiento *time.Time `gorm:"column:cae_vencimiento"`
	ReceptorCUIT   *string    `gorm:"type:varchar(20);column:receptor_cuit"`
	ReceptorNombre *string
	MontoNeto      decimal.Decimal `gorm:"type:decimal(12,2);not null"`
	MontoIVA       decimal.Decimal `gorm:"type:decimal(12,2);not null;default:0;column:monto_iva"`
	MontoTotal     decimal.Decimal `gorm:"type:decimal(12,2);not null"`
	Estado         string          `gorm:"type:varchar(20);not null;default:'pendiente'"`
	// PDFPath is relative to PDF_STORAGE_PATH env var
	PDFPath       *string `gorm:"column:pdf_path"`
	Observaciones *string
	// Retry fields — used by retry_cron to re-attempt failed AFIP calls
	RetryCount  int        `gorm:"not null;default:0"`
	NextRetryAt *time.Time `gorm:"column:next_retry_at"`
	LastError   *string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
