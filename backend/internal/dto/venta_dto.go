package dto

import "github.com/shopspring/decimal"

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
	OfflineID *string `json:"offline_id" validate:"omitempty,uuid"`
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
