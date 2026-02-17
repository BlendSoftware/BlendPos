package dto

import "github.com/shopspring/decimal"

type FacturacionResponse struct {
	ID             string          `json:"id"`
	Tipo           string          `json:"tipo"`
	Numero         *int64          `json:"numero"`
	PuntoDeVenta   int             `json:"punto_de_venta"`
	CAE            *string         `json:"cae"`
	CAEVencimiento *string         `json:"cae_vencimiento"`
	ReceptorCUIT   *string         `json:"receptor_cuit"`
	ReceptorNombre *string         `json:"receptor_nombre"`
	MontoNeto      decimal.Decimal `json:"monto_neto"`
	MontoIVA       decimal.Decimal `json:"monto_iva"`
	MontoTotal     decimal.Decimal `json:"monto_total"`
	Estado         string          `json:"estado"`
	PDFUrl         *string         `json:"pdf_url"`
	CreatedAt      string          `json:"created_at"`
}

type InventarioDTO struct{} // placeholder for vinculos / alertas (see facturacion_dto.go for those)
