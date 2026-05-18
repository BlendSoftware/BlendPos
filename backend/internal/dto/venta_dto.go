package dto

import "github.com/shopspring/decimal"

// ─── Filter / List ──────────────────────────────────────────────────────────

// VentaFilter is bound from query string of GET /v1/ventas.
type VentaFilter struct {
	Fecha      string `form:"fecha"`                     // YYYY-MM-DD; empty = today
	Desde      string `form:"desde"`                     // YYYY-MM-DD; range start (overrides fecha)
	Hasta      string `form:"hasta"`                     // YYYY-MM-DD; range end (overrides fecha)
	Estado     string `form:"estado,default=completada"` // completada | anulada | all
	OrdenarPor string `form:"ordenar_por"`               // "fecha" | "total" | "numero_ticket"
	Orden      string `form:"orden"`                     // "asc" | "desc" (default desc)
	Page       int    `form:"page,default=1"   validate:"min=1"`
	Limit      int    `form:"limit,default=50" validate:"min=1,max=1000"`
}

// VentaListItem is returned inside VentaListResponse for GET /v1/ventas.
type VentaListItem struct {
	ID             string              `json:"id"`
	NumeroTicket   int                 `json:"numero_ticket"`
	SesionCajaID   string              `json:"sesion_caja_id"`
	UsuarioID      string              `json:"usuario_id"`
	CajeroNombre   string              `json:"cajero_nombre"`
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
	// TipoPrecio: "minorista" (default) o "mayorista". El backend valida que el producto
	// tenga precio_mayorista cuando se solicita "mayorista".
	TipoPrecio *string `json:"tipo_precio" validate:"omitempty,oneof=minorista mayorista"`
	// PrecioUnitarioAplicado: opcional, informativo. Backend SIEMPRE recalcula
	// el precio efectivo desde la BD según TipoPrecio (security: no aceptar precios del cliente).
	PrecioUnitarioAplicado *decimal.Decimal `json:"precio_unitario_aplicado" validate:"omitempty"`
}

// DescuentoGlobalRequest captura el descuento global tipado para audit.
// El backend NO recalcula totales con esto — el monto efectivo viene en ItemVentaRequest.Descuento
// (ya distribuido proporcionalmente por el frontend). Este bloque solo persiste el INPUT del cajero.
type DescuentoGlobalRequest struct {
	Type   string          `json:"type"   validate:"required,oneof=percentage fixed"`
	Value  decimal.Decimal `json:"value"  validate:"min=0"`
	Amount decimal.Decimal `json:"amount" validate:"min=0"`
}

type PagoRequest struct {
	Metodo string          `json:"metodo" validate:"required,oneof=efectivo debito credito qr transferencia"`
	Monto  decimal.Decimal `json:"monto"  validate:"required"`
}

type RegistrarVentaRequest struct {
	SesionCajaID string             `json:"sesion_caja_id" validate:"required,uuid"`
	Items        []ItemVentaRequest `json:"items"          validate:"required,min=1,dive"`
	Pagos        []PagoRequest      `json:"pagos"          validate:"required,min=1,dive"`
	// DescuentoGlobal: descuento global tipado (% o $ fijo). Opcional.
	// El backend lo persiste para audit en ventas.discount_type/discount_value.
	DescuentoGlobal *DescuentoGlobalRequest `json:"descuento_global" validate:"omitempty"`
	// OfflineID is set by the PWA when registering a sale created offline
	OfflineID *string `json:"offline_id"    validate:"omitempty,uuid"`
	// ClienteEmail: optional — when present, the facturacion worker mails the PDF receipt.
	ClienteEmail *string `json:"cliente_email" validate:"omitempty,email"`
	// Fiscal comprobante fields — optional; defaults to ticket_interno when omitted.
	// TipoComprobante: "ticket_interno" | "factura_a" | "factura_b" | "factura_c"
	TipoComprobante *string `json:"tipo_comprobante"  validate:"omitempty,oneof=ticket_interno factura_a factura_b factura_c"`
	// TipoDocReceptor: 96=DNI, 80=CUIT, 99=ConsumidorFinal
	TipoDocReceptor *int `json:"tipo_doc_receptor" validate:"omitempty"`
	// NroDocReceptor: CUIT/DNI del receptor, "0" si ConsumidorFinal
	NroDocReceptor *string `json:"nro_doc_receptor"  validate:"omitempty"`
	// ReceptorNombre: Nombre/Razón Social del receptor (obligatorio para facturas A/B/C)
	ReceptorNombre *string `json:"receptor_nombre" validate:"omitempty,max=255"`
	// ReceptorDomicilio: domicilio del comprador para el comprobante fiscal
	ReceptorDomicilio *string `json:"receptor_domicilio" validate:"omitempty,max=255"`
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
	// OfflineID echoes the offline_id from the request so clients can correlate
	// batch results without relying on fragile array-index matching (P2-005).
	OfflineID      *string `json:"offline_id,omitempty"`
	ConflictoStock bool    `json:"conflicto_stock"`
	CreatedAt      string  `json:"created_at"`
}
