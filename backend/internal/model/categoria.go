package model

import (
	"time"

	"github.com/google/uuid"
)

// Categoria represents a product category used to classify products.
type Categoria struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Nombre      string    `gorm:"uniqueIndex;not null"`
	Descripcion *string
	Activo      bool `gorm:"not null;default:true"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// TableName overrides GORM's default singular → plural logic for Spanish names.
func (Categoria) TableName() string { return "categorias" }
