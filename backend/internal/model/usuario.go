package model

import (
	"time"

	"github.com/google/uuid"
)

// Usuario stores system users with role-based access.
// Rol: "cajero" | "supervisor" | "administrador"
type Usuario struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Username     string    `gorm:"uniqueIndex;not null"`
	Nombre       string    `gorm:"not null"`
	Email        *string
	PasswordHash string `gorm:"not null"`
	Rol          string `gorm:"type:varchar(20);not null"`
	// PuntoDeVenta restricts a cashier to a specific register; nil = all registers
	PuntoDeVenta *int
	Activo       bool `gorm:"not null;default:true"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
