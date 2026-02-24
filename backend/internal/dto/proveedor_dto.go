package dto

import "github.com/shopspring/decimal"

// ─── Request DTOs ────────────────────────────────────────────────────────────

type ContactoProveedorInput struct {
	Nombre   string  `json:"nombre"   validate:"required,min=1"`
	Cargo    *string `json:"cargo"`
	Telefono *string `json:"telefono"`
	Email    *string `json:"email"    validate:"omitempty,email"`
}

type CrearProveedorRequest struct {
	RazonSocial   string                   `json:"razon_social"   validate:"required,min=2"`
	CUIT          string                   `json:"cuit"           validate:"required"`
	Telefono      *string                  `json:"telefono"`
	Email         *string                  `json:"email"          validate:"omitempty,email"`
	Direccion     *string                  `json:"direccion"`
	CondicionPago *string                  `json:"condicion_pago"`
	Contactos     []ContactoProveedorInput `json:"contactos"`
}

type ActualizarPreciosMasivoRequest struct {
	Porcentaje      decimal.Decimal `json:"porcentaje"       validate:"required,gt=0"`
	RecalcularVenta bool            `json:"recalcular_venta"`
	MargenDefault   decimal.Decimal `json:"margen_default"   validate:"min=0"`
	Preview         bool            `json:"preview"`
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

type ContactoProveedorResponse struct {
	ID       string  `json:"id"`
	Nombre   string  `json:"nombre"`
	Cargo    *string `json:"cargo,omitempty"`
	Telefono *string `json:"telefono,omitempty"`
	Email    *string `json:"email,omitempty"`
}

type ProveedorResponse struct {
	ID            string                      `json:"id"`
	RazonSocial   string                      `json:"razon_social"`
	CUIT          string                      `json:"cuit"`
	Telefono      *string                     `json:"telefono"`
	Email         *string                     `json:"email"`
	Direccion     *string                     `json:"direccion"`
	CondicionPago *string                     `json:"condicion_pago"`
	Activo        bool                        `json:"activo"`
	Contactos     []ContactoProveedorResponse `json:"contactos"`
}

type PrecioPreviewItem struct {
	ProductoID        string          `json:"producto_id"`
	Nombre            string          `json:"nombre"`
	PrecioCostoActual decimal.Decimal `json:"precio_costo_actual"`
	PrecioCostoNuevo  decimal.Decimal `json:"precio_costo_nuevo"`
	PrecioVentaActual decimal.Decimal `json:"precio_venta_actual"`
	PrecioVentaNuevo  decimal.Decimal `json:"precio_venta_nuevo"`
	DiferenciaCosto   decimal.Decimal `json:"diferencia_costo"`
	MargenNuevo       decimal.Decimal `json:"margen_nuevo"`
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
	Fila         int    `json:"fila"`
	CodigoBarras string `json:"codigo_barras,omitempty"`
	Nombre       string `json:"nombre,omitempty"`
	ErrorCode    string `json:"error_code"` // BARCODE_MISSING|BARCODE_DUPLICATE|PRICE_NOT_NUMBER|PRICE_NEGATIVE|NAME_MISSING|ROW_FORMAT|READ_ERROR
	Motivo       string `json:"motivo"`
}
