package model

import "github.com/google/uuid"

// ProductoHijo defines the parent-child relationship between products.
// One parent unit contains UnidadesPorPadre child units.
// When child stock is zero, the automatic disassembly engine triggers.
type ProductoHijo struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProductoPadreID  uuid.UUID `gorm:"type:uuid;uniqueIndex:idx_padre_hijo;not null"`
	ProductoHijoID   uuid.UUID `gorm:"type:uuid;uniqueIndex:idx_padre_hijo;not null"`
	UnidadesPorPadre int       `gorm:"not null"`
	// DesarmeAuto enables automatic disassembly at sale time
	DesarmeAuto bool `gorm:"not null;default:true"`

	Padre *Producto `gorm:"foreignKey:ProductoPadreID"`
	Hijo  *Producto `gorm:"foreignKey:ProductoHijoID"`
}
