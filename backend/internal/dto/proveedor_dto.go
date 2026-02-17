package dto

import "github.com/shopspring/decimal"

// ─── Request DTOs ────────────────────────────────────────────────────────────

type CrearProveedorRequest struct {
	RazonSocial   string  `json:"razon_social"   validate:"required,min=2"`
	CUIT          string  `json:"cuit"           validate:"required"`
	Telefono      *string `json:"telefono"`
	Email         *string `json:"email"          validate:"omitempty,email"`
	Direccion     *string `json:"direccion"`
	CondicionPago *string `json:"condicion_pago"`
}

type ActualizarPreciosMasivoRequest struct {
	Porcentaje      decimal.Decimal `json:"porcentaje"       validate:"required,gt=0"`
	RecalcularVenta bool            `json:"recalcular_venta"`
	MargenDefault   decimal.Decimal `json:"margen_default"   validate:"min=0"`
	Preview         bool            `json:"preview"`
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

type ProveedorResponse struct {
	ID            string  `json:"id"`
	RazonSocial   string  `json:"razon_social"`
	CUIT          string  `json:"cuit"`
	Telefono      *string `json:"telefono"`
	Email         *string `json:"email"`
	Direccion     *string `json:"direccion"`
	CondicionPago *string `json:"condicion_pago"`
	Activo        bool    `json:"activo"`
}

type PrecioPreviewItem struct {
	ProductoID        string          `json:"producto_id"`
	Nombre            string          `json:"nombre"`
	PrecioCostoActual decimal.Decimal `json:"precio_costo_actual"`
	PrecioCostoNuevo  decimal.Decimal `json:"precio_costo_nuevo"`
	PrecioVentaActual decimal.Decimal `json:"precio_venta_actual"`
	PrecioVentaNuevo  decimal.Decimal `json:"precio_venta_nuevo"`
	DiferenciaCosto   decimal.Decimal `json:"diferencia_costo"`
}

type ActualizacionMasivaResponse struct {
	Proveedor          string              `json:"proveedor"`
	Porcentaje         decimal.Decimal     `json:"porcentaje"`
	ProductosAfectados int                 `json:"productos_afectados"`
	Preview            []PrecioPreviewItem `json:"preview,omitempty"`
}

type CSVImportResponse struct {
	TotalFilas     int           `json:"total_filas"`
	Procesadas     int           `json:"procesadas"`
	Errores        int           `json:"errores"`
	Creadas        int           `json:"creadas"`
	Actualizadas   int           `json:"actualizadas"`
	DetalleErrores []CSVErrorRow `json:"detalle_errores"`
}

type CSVErrorRow struct {
	Fila   int    `json:"fila"`
	Motivo string `json:"motivo"`
}
