package dto

// ─── Request DTOs ─────────────────────────────────────────────────────────────

type CrearPromocionRequest struct {
	Nombre            string   `json:"nombre"             validate:"required,min=2,max=100"`
	Descripcion       *string  `json:"descripcion"`
	Tipo              string   `json:"tipo"               validate:"required,oneof=porcentaje monto_fijo"`
	Valor             float64  `json:"valor"              validate:"required,gt=0"`
	CantidadRequerida int      `json:"cantidad_requerida"`
	FechaInicio       string   `json:"fecha_inicio"       validate:"required"`
	FechaFin          string   `json:"fecha_fin"          validate:"required"`
	ProductoIDs       []string `json:"producto_ids"       validate:"required,min=1"`
}

type ActualizarPromocionRequest struct {
	Nombre            string   `json:"nombre"             validate:"required,min=2,max=100"`
	Descripcion       *string  `json:"descripcion"`
	Tipo              string   `json:"tipo"               validate:"required,oneof=porcentaje monto_fijo"`
	Valor             float64  `json:"valor"              validate:"required,gt=0"`
	CantidadRequerida int      `json:"cantidad_requerida"`
	FechaInicio       string   `json:"fecha_inicio"       validate:"required"`
	FechaFin          string   `json:"fecha_fin"          validate:"required"`
	Activa            bool     `json:"activa"`
	ProductoIDs       []string `json:"producto_ids"       validate:"required,min=1"`
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

type PromocionProducto struct {
	ID          string  `json:"id"`
	Nombre      string  `json:"nombre"`
	PrecioVenta float64 `json:"precio_venta"`
}

type PromocionResponse struct {
	ID                string              `json:"id"`
	Nombre            string              `json:"nombre"`
	Descripcion       *string             `json:"descripcion"`
	Tipo              string              `json:"tipo"`
	Valor             float64             `json:"valor"`
	CantidadRequerida int                 `json:"cantidad_requerida"`
	FechaInicio       string              `json:"fecha_inicio"`
	FechaFin          string              `json:"fecha_fin"`
	Activa            bool                `json:"activa"`
	Estado            string              `json:"estado"` // "activa" | "pendiente" | "vencida"
	Productos         []PromocionProducto `json:"productos"`
	CreatedAt         string              `json:"created_at"`
}
