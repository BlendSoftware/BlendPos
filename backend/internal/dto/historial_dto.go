package dto

import "github.com/shopspring/decimal"

// HistorialPrecioItem is one row in the price-history list (RF-26).
type HistorialPrecioItem struct {
	ID                 string          `json:"id"`
	ProductoID         string          `json:"producto_id"`
	ProveedorID        *string         `json:"proveedor_id,omitempty"`
	ProveedorNombre    *string         `json:"proveedor_nombre,omitempty"`
	CostoAntes         decimal.Decimal `json:"costo_antes"`
	CostoDespues       decimal.Decimal `json:"costo_despues"`
	VentaAntes         decimal.Decimal `json:"venta_antes"`
	VentaDespues       decimal.Decimal `json:"venta_despues"`
	PorcentajeAplicado decimal.Decimal `json:"porcentaje_aplicado"`
	Motivo             string          `json:"motivo"`
	CreatedAt          string          `json:"created_at"`
}

// HistorialPrecioListResponse is returned by GET /v1/productos/:id/historial-precios.
type HistorialPrecioListResponse struct {
	Data  []HistorialPrecioItem `json:"data"`
	Total int64                 `json:"total"`
	Page  int                   `json:"page"`
	Limit int                   `json:"limit"`
}
