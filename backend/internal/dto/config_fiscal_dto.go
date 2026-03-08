package dto

// ConfiguracionFiscalResponse is the data returned to the frontend.
// It specifically omits the private key for security reasons, only indicating if it exists.
type ConfiguracionFiscalResponse struct {
	CUITEmsior             string  `json:"cuit_emisor"`
	RazonSocial            string  `json:"razon_social"`
	CondicionFiscal        string  `json:"condicion_fiscal"`
	PuntoDeVenta           int     `json:"punto_de_venta"`
	Modo                   string  `json:"modo"`
	FechaInicioActividades *string `json:"fecha_inicio_actividades"`
	IIBB                   *string `json:"iibb"`
	
	// Domicilio comercial
	DomicilioComercial    *string `json:"domicilio_comercial"`
	DomicilioCiudad       *string `json:"domicilio_ciudad"`
	DomicilioProvincia    *string `json:"domicilio_provincia"`
	DomicilioCodigoPostal *string `json:"domicilio_codigo_postal"`
	
	// Logo
	LogoPath *string `json:"logo_path"`
	
	TieneCertificadoCrt    bool    `json:"tiene_certificado_crt"`
	TieneCertificadoKey    bool    `json:"tiene_certificado_key"`
}

// ConfiguracionFiscalRequest is the data sent from the frontend to update the config.
// The certificates are optional; if not provided, the existing ones are kept.
type ConfiguracionFiscalRequest struct {
	CUITEmsior             string  `json:"cuit_emisor" form:"cuit_emisor" validate:"required"`
	RazonSocial            string  `json:"razon_social" form:"razon_social" validate:"required"`
	CondicionFiscal        string  `json:"condicion_fiscal" form:"condicion_fiscal" validate:"required"`
	PuntoDeVenta           int     `json:"punto_de_venta" form:"punto_de_venta" validate:"required"`
	Modo                   string  `json:"modo" form:"modo" validate:"required"`
	FechaInicioActividades *string `json:"fecha_inicio_actividades" form:"fecha_inicio_actividades"`
	IIBB                   *string `json:"iibb" form:"iibb"`
	
	// Domicilio comercial
	DomicilioComercial    *string `json:"domicilio_comercial" form:"domicilio_comercial"`
	DomicilioCiudad       *string `json:"domicilio_ciudad" form:"domicilio_ciudad"`
	DomicilioProvincia    *string `json:"domicilio_provincia" form:"domicilio_provincia"`
	DomicilioCodigoPostal *string `json:"domicilio_codigo_postal" form:"domicilio_codigo_postal"`
	
	// Logo path (optional)
	LogoPath *string `json:"logo_path" form:"logo_path"`
	
	// These will be bound from multipart/form-data via context
	CertificadoCrt *string `json:"-" form:"-"`
	CertificadoKey *string `json:"-" form:"-"`
}
