package model

import (
	"time"

	"github.com/google/uuid"
)

// ConfiguracionFiscal contiene los parámetros para emitir facturas electrónicas
type ConfiguracionFiscal struct {
	ID                     uuid.UUID `gorm:"type:uuid;primary_key"`
	CUITEmsior             string    `gorm:"column:cuit_emisor;type:varchar(20);not null"`
	RazonSocial            string    `gorm:"type:varchar(255);not null"`
	CondicionFiscal        string    `gorm:"type:varchar(50);not null"`
	PuntoDeVenta           int       `gorm:"not null"`
	CertificadoCrt         *string   `gorm:"type:text"`
	CertificadoKey         *string   `gorm:"type:text"`
	Modo                   string    `gorm:"type:varchar(20);not null;default:'homologacion'"`
	FechaInicioActividades *time.Time
	IIBB                   *string `gorm:"type:varchar(50)"`
	
	// Domicilio comercial (obligatorio por AFIP)
	DomicilioComercial   *string `gorm:"type:varchar(255)"`
	DomicilioCiudad      *string `gorm:"type:varchar(100)"`
	DomicilioProvincia   *string `gorm:"type:varchar(100)"`
	DomicilioCodigoPostal *string `gorm:"type:varchar(10)"`
	
	// Logo para facturas
	LogoPath *string `gorm:"type:varchar(255)"`

	CreatedAt time.Time
	UpdatedAt time.Time
}

func (ConfiguracionFiscal) TableName() string {
	return "configuracion_fiscal"
}
