package dto

import "github.com/shopspring/decimal"

// ─── Request DTOs ────────────────────────────────────────────────────────────

type CrearListaPreciosRequest struct {
	Nombre  string  `json:"nombre"   validate:"required,min=2,max=120"`
	LogoURL *string `json:"logo_url"`
}

type ActualizarListaPreciosRequest struct {
	Nombre  *string `json:"nombre"   validate:"omitempty,min=2,max=120"`
	LogoURL *string `json:"logo_url"`
}

type AsignarProductoRequest struct {
	ProductoID          string          `json:"producto_id"           validate:"required,uuid"`
	DescuentoPorcentaje decimal.Decimal `json:"descuento_porcentaje"`
}

type AplicarMasivoRequest struct {
	DescuentoPorcentaje decimal.Decimal `json:"descuento_porcentaje"`
}

// ─── Filter / Pagination ─────────────────────────────────────────────────────

type ListaPreciosFilter struct {
	Nombre string `form:"nombre"`
	Page   int    `form:"page,default=1"  validate:"min=1"`
	Limit  int    `form:"limit,default=20" validate:"min=1,max=100"`
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

type ListaPreciosResponse struct {
	ID              string `json:"id"`
	Nombre          string `json:"nombre"`
	LogoURL         *string `json:"logo_url"`
	CantidadProductos int  `json:"cantidad_productos"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

type ListaPreciosDetalleResponse struct {
	ID        string                        `json:"id"`
	Nombre    string                        `json:"nombre"`
	LogoURL   *string                       `json:"logo_url"`
	Productos []ListaPreciosProductoResponse `json:"productos"`
	CreatedAt string                        `json:"created_at"`
	UpdatedAt string                        `json:"updated_at"`
}

type ListaPreciosProductoResponse struct {
	ID                  string          `json:"id"`
	ProductoID          string          `json:"producto_id"`
	ProductoNombre      string          `json:"producto_nombre"`
	ProductoBarcode     string          `json:"producto_barcode"`
	PrecioVenta         decimal.Decimal `json:"precio_venta"`
	DescuentoPorcentaje decimal.Decimal `json:"descuento_porcentaje"`
	PrecioFinal         decimal.Decimal `json:"precio_final"`
}

type ListaPreciosListResponse struct {
	Data       []ListaPreciosResponse `json:"data"`
	Total      int64                  `json:"total"`
	Page       int                    `json:"page"`
	Limit      int                    `json:"limit"`
	TotalPages int                    `json:"total_pages"`
}
