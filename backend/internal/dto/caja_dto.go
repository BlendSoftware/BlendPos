package dto

import "github.com/shopspring/decimal"

// ─── Request DTOs ────────────────────────────────────────────────────────────

type AbrirCajaRequest struct {
	PuntoDeVenta int             `json:"punto_de_venta" validate:"required,min=1"`
	MontoInicial decimal.Decimal `json:"monto_inicial"  validate:"min=0"`
}

type DeclaracionArqueo struct {
	Efectivo      decimal.Decimal `json:"efectivo"     validate:"min=0"`
	Debito        decimal.Decimal `json:"debito"       validate:"min=0"`
	Credito       decimal.Decimal `json:"credito"      validate:"min=0"`
	Transferencia decimal.Decimal `json:"transferencia" validate:"min=0"`
}

type ArqueoRequest struct {
	SesionCajaID  string            `json:"sesion_caja_id" validate:"omitempty,uuid"`
	Declaracion   DeclaracionArqueo `json:"declaracion"    validate:"required"`
	Observaciones *string           `json:"observaciones"`
}

type MovimientoManualRequest struct {
	SesionCajaID string          `json:"sesion_caja_id" validate:"required,uuid"`
	Tipo         string          `json:"tipo"           validate:"required,oneof=ingreso_manual egreso_manual"`
	MetodoPago   string          `json:"metodo_pago"    validate:"required,oneof=efectivo debito credito transferencia"`
	Monto        decimal.Decimal `json:"monto"          validate:"required,gt=0"`
	Descripcion  string          `json:"descripcion"    validate:"required,min=3"`
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

type DesvioResponse struct {
	Monto         decimal.Decimal `json:"monto"`
	Porcentaje    decimal.Decimal `json:"porcentaje"`
	Clasificacion string          `json:"clasificacion"` // normal | advertencia | critico
}

type MontosPorMetodo struct {
	Efectivo      decimal.Decimal `json:"efectivo"`
	Debito        decimal.Decimal `json:"debito"`
	Credito       decimal.Decimal `json:"credito"`
	Transferencia decimal.Decimal `json:"transferencia"`
	Total         decimal.Decimal `json:"total"`
}

type ArqueoResponse struct {
	SesionCajaID   string          `json:"sesion_caja_id"`
	MontoEsperado  MontosPorMetodo `json:"monto_esperado"`
	MontoDeclarado MontosPorMetodo `json:"monto_declarado"`
	Desvio         DesvioResponse  `json:"desvio"`
	Estado         string          `json:"estado"`
}

type ReporteCajaResponse struct {
	SesionCajaID   string           `json:"sesion_caja_id"`
	PuntoDeVenta   int              `json:"punto_de_venta"`
	Usuario        string           `json:"usuario"`
	MontoInicial   decimal.Decimal  `json:"monto_inicial"`
	MontoEsperado  MontosPorMetodo  `json:"monto_esperado"`
	MontoDeclarado *MontosPorMetodo `json:"monto_declarado"`
	Desvio         *DesvioResponse  `json:"desvio"`
	Estado         string           `json:"estado"`
	Observaciones  *string          `json:"observaciones"`
	OpenedAt       string           `json:"opened_at"`
	ClosedAt       *string          `json:"closed_at"`
}
