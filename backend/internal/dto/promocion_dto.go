package dto

// ─── Request DTOs ─────────────────────────────────────────────────────────────

type CrearPromocionRequest struct {
	Nombre            string                    `json:"nombre"             validate:"required,min=2,max=100"`
	Descripcion       *string                   `json:"descripcion"`
	Tipo              string                    `json:"tipo"               validate:"required,oneof=porcentaje monto_fijo precio_fijo_combo"`
	Valor             float64                   `json:"valor"              validate:"required,gt=0"`
	Modo              string                    `json:"modo"`              // "clasico" | "grupos"
	CantidadRequerida int                       `json:"cantidad_requerida"`
	FechaInicio       string                    `json:"fecha_inicio"       validate:"required"`
	FechaFin          string                    `json:"fecha_fin"          validate:"required"`
	ProductoIDs       []string                  `json:"producto_ids"`      // Required when modo=clasico
	Grupos            []PromocionGrupoRequest   `json:"grupos"`            // Required when modo=grupos
}

type ActualizarPromocionRequest struct {
	Nombre            string                    `json:"nombre"             validate:"required,min=2,max=100"`
	Descripcion       *string                   `json:"descripcion"`
	Tipo              string                    `json:"tipo"               validate:"required,oneof=porcentaje monto_fijo precio_fijo_combo"`
	Valor             float64                   `json:"valor"              validate:"required,gt=0"`
	Modo              string                    `json:"modo"`              // "clasico" | "grupos"
	CantidadRequerida int                       `json:"cantidad_requerida"`
	FechaInicio       string                    `json:"fecha_inicio"       validate:"required"`
	FechaFin          string                    `json:"fecha_fin"          validate:"required"`
	Activa            bool                      `json:"activa"`
	ProductoIDs       []string                  `json:"producto_ids"`      // Required when modo=clasico
	Grupos            []PromocionGrupoRequest   `json:"grupos"`            // Required when modo=grupos
}

type PromocionGrupoRequest struct {
	Nombre            string   `json:"nombre"`
	Orden             int      `json:"orden"`
	CantidadRequerida int      `json:"cantidad_requerida"`
	TipoSeleccion     string   `json:"tipo_seleccion" validate:"required,oneof=productos categoria"`
	CategoriaID       *string  `json:"categoria_id"`
	ProductoIDs       []string `json:"producto_ids"`
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

type PromocionProducto struct {
	ID          string  `json:"id"`
	Nombre      string  `json:"nombre"`
	PrecioVenta float64 `json:"precio_venta"`
}

type PromocionGrupoResponse struct {
	ID                string              `json:"id"`
	Nombre            string              `json:"nombre"`
	Orden             int                 `json:"orden"`
	CantidadRequerida int                 `json:"cantidad_requerida"`
	TipoSeleccion     string              `json:"tipo_seleccion"`
	CategoriaID       *string             `json:"categoria_id,omitempty"`
	CategoriaNombre   *string             `json:"categoria_nombre,omitempty"`
	Productos         []PromocionProducto `json:"productos"`
}

type PromocionResponse struct {
	ID                string                   `json:"id"`
	Nombre            string                   `json:"nombre"`
	Descripcion       *string                  `json:"descripcion"`
	Tipo              string                   `json:"tipo"`
	Valor             float64                  `json:"valor"`
	Modo              string                   `json:"modo"`
	CantidadRequerida int                      `json:"cantidad_requerida"`
	FechaInicio       string                   `json:"fecha_inicio"`
	FechaFin          string                   `json:"fecha_fin"`
	Activa            bool                     `json:"activa"`
	Estado            string                   `json:"estado"` // "activa" | "pendiente" | "vencida"
	Productos         []PromocionProducto      `json:"productos"`
	Grupos            []PromocionGrupoResponse `json:"grupos,omitempty"`
	CreatedAt         string                   `json:"created_at"`
}
