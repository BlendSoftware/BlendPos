package dto

import "github.com/google/uuid"

// ── Request DTOs ──────────────────────────────────────────────────────────────

type CrearCategoriaRequest struct {
	Nombre      string  `json:"nombre"      validate:"required,min=2,max=100"`
	Descripcion *string `json:"descripcion"`
}

type ActualizarCategoriaRequest struct {
	Nombre      *string `json:"nombre"      validate:"omitempty,min=2,max=100"`
	Descripcion *string `json:"descripcion"`
	Activo      *bool   `json:"activo"`
}

// ── Response DTOs ─────────────────────────────────────────────────────────────

type CategoriaResponse struct {
	ID          uuid.UUID `json:"id"`
	Nombre      string    `json:"nombre"`
	Descripcion *string   `json:"descripcion,omitempty"`
	Activo      bool      `json:"activo"`
}
