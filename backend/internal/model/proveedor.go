package model

import (
	"time"

	"github.com/google/uuid"
)

// Proveedor represents a supplier with commercial data.
type Proveedor struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	RazonSocial   string    `gorm:"not null"`
	CUIT          string    `gorm:"column:cuit;uniqueIndex;not null"`
	Telefono      *string
	Email         *string
	Direccion     *string
	CondicionPago *string
	Activo        bool `gorm:"not null;default:true"`
	CreatedAt     time.Time
	UpdatedAt     time.Time

	Productos []Producto          `gorm:"foreignKey:ProveedorID"`
	Contactos []ContactoProveedor `gorm:"foreignKey:ProveedorID"`
}

func (Proveedor) TableName() string { return "proveedores" }
