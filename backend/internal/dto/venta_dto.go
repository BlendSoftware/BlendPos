package dto

import "github.com/shopspring/decimal"

// ─── Filter / List ──────────────────────────────────────────────────────────

// VentaFilter is bound from query string of GET /v1/ventas.
type VentaFilter struct {
	Fecha  string `form:"fecha"`                     // YYYY-MM-DD; empty = today
	Estado string `form:"estado,default=completada"` // completada | anulada | all
	Page   int    `form:"page,default=1"   validate:"min=1"`
	Limit  int    `form:"limit,default=50" validate:"min=1,max=200"`
}

// VentaListItem is returned inside VentaListResponse for GET /v1/ventas.
type VentaListItem struct {
	ID             string              `json:"id"`
	NumeroTicket   int                 `json:"numero_ticket"`
	SesionCajaID   string              `json:"sesion_caja_id"`
	UsuarioID      string              `json:"usuario_id"`
	Total          decimal.Decimal     `json:"total"`
	DescuentoTotal decimal.Decimal     `json:"descuento_total"`
	Subtotal       decimal.Decimal     `json:"subtotal"`
	Estado         string              `json:"estado"`
	Items          []ItemVentaResponse `json:"items"`
	Pagos          []PagoRequest       `json:"pagos"`
	CreatedAt      string              `json:"created_at"`
}

type VentaListResponse struct {
	Data  []VentaListItem `json:"data"`
	Total int64           `json:"total"`
	Page  int             `json:"page"`
	Limit int             `json:"limit"`
}

// ─── Request DTOs ────────────────────────────────────────────────────────────

type ItemVentaRequest struct {
	ProductoID string          `json:"producto_id" validate:"required,uuid"`
	Cantidad   int             `json:"cantidad"    validate:"required,min=1"`
	Descuento  decimal.Decimal `json:"descuento"   validate:"min=0"`
}

type PagoRequest struct {
	Metodo string          `json:"metodo" validate:"required,oneof=efectivo debito credito transferencia"`
	Monto  decimal.Decimal `json:"monto"  validate:"required"`
}

type RegistrarVentaRequest struct {
	SesionCajaID string             `json:"sesion_caja_id" validate:"required,uuid"`
	Items        []ItemVentaRequest `json:"items"          validate:"required,min=1,dive"`
	Pagos        []PagoRequest      `json:"pagos"          validate:"required,min=1,dive"`
	// OfflineID is set by the PWA when registering a sale created offline
	OfflineID *string `json:"offline_id"    validate:"omitempty,uuid"`
	// ClienteEmail: optional — when present, the facturacion worker mails the PDF receipt.
	ClienteEmail *string `json:"cliente_email" validate:"omitempty,email"`
}

type AnularVentaRequest struct {
	Motivo string `json:"motivo" validate:"required,min=5"`
}

// SyncBatchRequest holds multiple offline sales to reconcile
type SyncBatchRequest struct {
	Ventas []RegistrarVentaRequest `json:"ventas" validate:"required,min=1,dive"`
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

type ItemVentaResponse struct {
	Producto       string          `json:"producto"`
	Cantidad       int             `json:"cantidad"`
	PrecioUnitario decimal.Decimal `json:"precio_unitario"`
	Subtotal       decimal.Decimal `json:"subtotal"`
}

type VentaResponse struct {
	ID             string              `json:"id"`
	NumeroTicket   int                 `json:"numero_ticket"`
	Items          []ItemVentaResponse `json:"items"`
	Subtotal       decimal.Decimal     `json:"subtotal"`
	DescuentoTotal decimal.Decimal     `json:"descuento_total"`
	Total          decimal.Decimal     `json:"total"`
	Pagos          []PagoRequest       `json:"pagos"`
	Vuelto         decimal.Decimal     `json:"vuelto"`
	Estado         string              `json:"estado"`
	ConflictoStock bool                `json:"conflicto_stock"`
	CreatedAt      string              `json:"created_at"`
}
