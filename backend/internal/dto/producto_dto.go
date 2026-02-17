package dto

import "github.com/shopspring/decimal"

// ─── Request DTOs ────────────────────────────────────────────────────────────

type CrearProductoRequest struct {
	CodigoBarras string          `json:"codigo_barras" validate:"required,min=8,max=18"`
	Nombre       string          `json:"nombre"        validate:"required,min=2,max=120"`
	Descripcion  *string         `json:"descripcion"`
	Categoria    string          `json:"categoria"     validate:"required"`
	PrecioCosto  decimal.Decimal `json:"precio_costo"  validate:"required"`
	PrecioVenta  decimal.Decimal `json:"precio_venta"  validate:"required"`
	StockActual  int             `json:"stock_actual"  validate:"min=0"`
	StockMinimo  int             `json:"stock_minimo"  validate:"min=0"`
	UnidadMedida string          `json:"unidad_medida"`
	ProveedorID  *string         `json:"proveedor_id"  validate:"omitempty,uuid"`
}

type ActualizarProductoRequest struct {
	Nombre       *string          `json:"nombre"        validate:"omitempty,min=2,max=120"`
	Descripcion  *string          `json:"descripcion"`
	Categoria    *string          `json:"categoria"`
	PrecioCosto  *decimal.Decimal `json:"precio_costo"`
	PrecioVenta  *decimal.Decimal `json:"precio_venta"`
	StockMinimo  *int             `json:"stock_minimo"  validate:"omitempty,min=0"`
	UnidadMedida *string          `json:"unidad_medida"`
	ProveedorID  *string          `json:"proveedor_id"  validate:"omitempty,uuid"`
}

// ─── Filter / Pagination ─────────────────────────────────────────────────────

type ProductoFilter struct {
	Barcode     string `form:"barcode"`
	Nombre      string `form:"nombre"`
	Categoria   string `form:"categoria"`
	ProveedorID string `form:"proveedor_id"`
	Page        int    `form:"page,default=1"  validate:"min=1"`
	Limit       int    `form:"limit,default=20" validate:"min=1,max=100"`
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

type ProductoResponse struct {
	ID           string          `json:"id"`
	CodigoBarras string          `json:"codigo_barras"`
	Nombre       string          `json:"nombre"`
	Descripcion  *string         `json:"descripcion"`
	Categoria    string          `json:"categoria"`
	PrecioCosto  decimal.Decimal `json:"precio_costo"`
	PrecioVenta  decimal.Decimal `json:"precio_venta"`
	MargenPct    decimal.Decimal `json:"margen_pct"`
	StockActual  int             `json:"stock_actual"`
	StockMinimo  int             `json:"stock_minimo"`
	UnidadMedida string          `json:"unidad_medida"`
	EsPadre      bool            `json:"es_padre"`
	Activo       bool            `json:"activo"`
	ProveedorID  *string         `json:"proveedor_id"`
}

type ProductoListResponse struct {
	Data       []ProductoResponse `json:"data"`
	Total      int64              `json:"total"`
	Page       int                `json:"page"`
	Limit      int                `json:"limit"`
	TotalPages int                `json:"total_pages"`
}

// ConsultaPreciosResponse is returned by the public price check endpoint (no auth required).
type ConsultaPreciosResponse struct {
	Nombre          string          `json:"nombre"`
	PrecioVenta     decimal.Decimal `json:"precio_venta"`
	StockDisponible int             `json:"stock_disponible"`
	Categoria       string          `json:"categoria"`
	Promocion       *string         `json:"promocion"`
}
