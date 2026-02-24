package model

import (
	"time"

	"github.com/google/uuid"
)

// ContactoProveedor stores one contact person for a Proveedor.
type ContactoProveedor struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProveedorID uuid.UUID `gorm:"type:uuid;not null;index"`
	Nombre      string    `gorm:"not null"`
	Cargo       *string
	Telefono    *string
	Email       *string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (ContactoProveedor) TableName() string { return "contacto_proveedors" }
