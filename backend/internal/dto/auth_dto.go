package dto

// ─── Request DTOs ────────────────────────────────────────────────────────────

type LoginRequest struct {
	Username string `json:"username" validate:"required,min=1"`
	Password string `json:"password" validate:"required,min=4"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

type CrearUsuarioRequest struct {
	Username     string  `json:"username"  validate:"required,min=1,max=150"`
	Nombre       string  `json:"nombre"    validate:"required,min=2,max=100"`
	Email        *string `json:"email"     validate:"omitempty,email"`
	Password     string  `json:"password"  validate:"required,min=8"`
	Rol          string  `json:"rol"       validate:"required,oneof=cajero supervisor administrador"`
	PuntoDeVenta *int    `json:"punto_de_venta"`
}

type ActualizarUsuarioRequest struct {
	Nombre       string  `json:"nombre"        validate:"omitempty,min=2,max=100"`
	Email        *string `json:"email"         validate:"omitempty,email"`
	Rol          string  `json:"rol"           validate:"omitempty,oneof=cajero supervisor administrador"`
	PuntoDeVenta *int    `json:"punto_de_venta"`
	Password     string  `json:"password"      validate:"omitempty,min=8"`
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

type UsuarioResponse struct {
	ID           string  `json:"id"`
	Username     string  `json:"username"`
	Nombre       string  `json:"nombre"`
	Email        *string `json:"email"`
	Rol          string  `json:"rol"`
	PuntoDeVenta *int    `json:"punto_de_venta"`
	Activo       bool    `json:"activo"`
}

type LoginResponse struct {
	AccessToken  string          `json:"access_token"`
	RefreshToken string          `json:"refresh_token"`
	TokenType    string          `json:"token_type"`
	ExpiresIn    int             `json:"expires_in"` // seconds
	User         UsuarioResponse `json:"user"`
}
