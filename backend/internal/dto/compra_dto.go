package dto

import "github.com/shopspring/decimal"

// ─── Request DTOs ────────────────────────────────────────────────────────────

type PagoCompraRequest struct {
	Metodo     string  `json:"metodo"     validate:"required,oneof=efectivo transferencia cheque tarjeta_debito tarjeta_credito cuenta_corriente otro"`
	Monto      float64 `json:"monto"      validate:"required,gt=0"`
	Referencia *string `json:"referencia"`
}

type PagoCompraResponse struct {
	ID         string  `json:"id"`
	Metodo     string  `json:"metodo"`
	Monto      float64 `json:"monto"`
	Referencia *string `json:"referencia"`
	CreatedAt  string  `json:"created_at"`
}

type CompraItemRequest struct {
	ProductoID     *string         `json:"producto_id"`
	NombreProducto string          `json:"nombre_producto" validate:"required"`
	Precio         decimal.Decimal `json:"precio"          validate:"required"`
	DescuentoPct   decimal.Decimal `json:"descuento_pct"`
	ImpuestoPct    decimal.Decimal `json:"impuesto_pct"`
	Cantidad       int             `json:"cantidad"        validate:"required,min=1"`
	Observaciones  *string         `json:"observaciones"`
}

type CrearCompraRequest struct {
	Numero           *string             `json:"numero"`
	ProveedorID      string              `json:"proveedor_id"       validate:"required,uuid"`
	FechaCompra      string              `json:"fecha_compra"       validate:"required"`
	FechaVencimiento string              `json:"fecha_vencimiento"  validate:"required"`
	Moneda           string              `json:"moneda"`
	Deposito         string              `json:"deposito"`
	Notas            *string             `json:"notas"`
	Items            []CompraItemRequest `json:"items" validate:"required,min=1"`
	Pagos            []PagoCompraRequest `json:"pagos"`
}

type ActualizarCompraRequest struct {
	Estado string `json:"estado" validate:"required,oneof=pendiente pagada anulada"`
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

type CompraItemResponse struct {
	ID             string          `json:"id"`
	ProductoID     *string         `json:"producto_id"`
	NombreProducto string          `json:"nombre_producto"`
	Precio         decimal.Decimal `json:"precio"`
	DescuentoPct   decimal.Decimal `json:"descuento_pct"`
	ImpuestoPct    decimal.Decimal `json:"impuesto_pct"`
	Cantidad       int             `json:"cantidad"`
	Observaciones  *string         `json:"observaciones"`
	Total          decimal.Decimal `json:"total"`
}

type CompraResponse struct {
	ID               string               `json:"id"`
	Numero           *string              `json:"numero"`
	ProveedorID      string               `json:"proveedor_id"`
	NombreProveedor  string               `json:"nombre_proveedor"`
	FechaCompra      string               `json:"fecha_compra"`
	FechaVencimiento string               `json:"fecha_vencimiento"`
	Moneda           string               `json:"moneda"`
	Deposito         string               `json:"deposito"`
	Notas            *string              `json:"notas"`
	Subtotal         decimal.Decimal      `json:"subtotal"`
	DescuentoTotal   decimal.Decimal      `json:"descuento_total"`
	Total            decimal.Decimal      `json:"total"`
	Estado           string               `json:"estado"`
	Items            []CompraItemResponse `json:"items"`
	Pagos            []PagoCompraResponse `json:"pagos"`
	CreatedAt        string               `json:"created_at"`
}

type CompraListResponse struct {
	Data  []CompraResponse `json:"data"`
	Total int64            `json:"total"`
	Page  int              `json:"page"`
	Limit int              `json:"limit"`
}

type CompraFilter struct {
	ProveedorID string `form:"proveedor_id"`
	Estado      string `form:"estado"`
	Page        int    `form:"page,default=1"   validate:"min=1"`
	Limit       int    `form:"limit,default=20" validate:"min=1,max=200"`
}
