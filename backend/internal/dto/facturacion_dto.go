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

// ─── Movimiento Stock ─────────────────────────────────────────────────────────

type MovimientoStockResponse struct {
	ID             string `json:"id"`
	ProductoID     string `json:"producto_id"`
	ProductoNombre string `json:"producto_nombre"`
	Tipo           string `json:"tipo"`
	Cantidad       int    `json:"cantidad"`
	StockAnterior  int    `json:"stock_anterior"`
	StockNuevo     int    `json:"stock_nuevo"`
	Motivo         string `json:"motivo"`
	CreatedAt      string `json:"created_at"`
}

type MovimientoStockListResponse struct {
	Data  []MovimientoStockResponse `json:"data"`
	Total int64                     `json:"total"`
	Page  int                       `json:"page"`
	Limit int                       `json:"limit"`
}

type MovimientoStockFilter struct {
	ProductoID string `form:"producto_id"`
	Tipo       string `form:"tipo"`
	Page       int    `form:"page,default=1"   validate:"min=1"`
	Limit      int    `form:"limit,default=100" validate:"min=1,max=500"`
}
