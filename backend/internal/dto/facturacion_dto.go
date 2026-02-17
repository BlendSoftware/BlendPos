package dto

import "github.com/shopspring/decimal"

// ─── Request DTOs ────────────────────────────────────────────────────────────

type CrearVinculoRequest struct {
	ProductoPadreID  string `json:"producto_padre_id"  validate:"required,uuid"`
	ProductoHijoID   string `json:"producto_hijo_id"   validate:"required,uuid"`
	UnidadesPorPadre int    `json:"unidades_por_padre" validate:"required,min=1"`
	DesarmeAuto      bool   `json:"desarme_automatico"`
}

type DesarmeManualRequest struct {
	VinculoID      string `json:"vinculo_id"       validate:"required,uuid"`
	CantidadPadres int    `json:"cantidad_padres"  validate:"required,min=1"`
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

type VinculoResponse struct {
	ID               string `json:"id"`
	ProductoPadreID  string `json:"producto_padre_id"`
	NombrePadre      string `json:"nombre_padre"`
	ProductoHijoID   string `json:"producto_hijo_id"`
	NombreHijo       string `json:"nombre_hijo"`
	UnidadesPorPadre int    `json:"unidades_por_padre"`
	DesarmeAuto      bool   `json:"desarme_automatico"`
}

type AlertaStockResponse struct {
	ProductoID  string          `json:"producto_id"`
	Nombre      string          `json:"nombre"`
	StockActual int             `json:"stock_actual"`
	StockMinimo int             `json:"stock_minimo"`
	PrecioVenta decimal.Decimal `json:"precio_venta"`
}

type DesarmeManualResponse struct {
	VinculoID         string `json:"vinculo_id"`
	PadresDesarmados  int    `json:"padres_desarmados"`
	UnidadesGeneradas int    `json:"unidades_generadas"`
}
