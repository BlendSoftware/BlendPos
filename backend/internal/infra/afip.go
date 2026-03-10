package infra

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// AFIPPayload is sent by the Go worker pool to the AFIP Python Sidecar.
// The Sidecar handles WSAA + WSFEV1 and returns the CAE.
// Field names must match the sidecar's FacturarRequest Pydantic schema.
//
// Monetary fields use string (decimal representation, e.g. "1234.56") instead
// of float64 to avoid IEEE-754 rounding errors on fiscal amounts (P1-005).
type AFIPPayload struct {
	CUITEmisor      string `json:"cuit_emisor"`       // CUIT del emisor (sin guiones)
	PuntoDeVenta    int    `json:"punto_de_venta"`    // Punto de venta autorizado
	TipoComprobante int    `json:"tipo_comprobante"`  // 1=FacturaA, 6=FacturaB, 11=FacturaC
	TipoDocReceptor int    `json:"tipo_doc_receptor"` // 96=DNI, 80=CUIT, 99=ConsumidorFinal
	NroDocReceptor  string `json:"nro_doc_receptor"`  // DNI/CUIT del receptor, "0" para Consumidor Final
	Concepto        int    `json:"concepto"`          // 1=Productos, 2=Servicios, 3=Ambos
	ImporteNeto      string  `json:"importe_neto"`      // Monto gravado sin IVA  (2 decimales)
	ImporteExento    string  `json:"importe_exento"`    // Monto exento de IVA    (2 decimales)
	ImporteIVA       string  `json:"importe_iva"`       // Monto de IVA           (2 decimales)
	ImporteTributos  string  `json:"importe_tributos"`  // Otros tributos (IIBB, percepciones)
	ImporteTotal     string  `json:"importe_total"`     // Total (neto+exento+iva+tributos) (2 decimales)
	Moneda           string  `json:"moneda"`             // PES=Pesos, DOL=Dólar
	CotizacionMoneda float64 `json:"cotizacion_moneda"` // Cotización (1.0 para pesos)
	VentaID          string  `json:"venta_id"`
}

// AFIPResponse is returned by the Python Sidecar after querying WSFEV1.
type AFIPResponse struct {
	CAE              string `json:"cae"`
	CAEVencimiento   string `json:"cae_vencimiento"`
	NumeroComprobante int64  `json:"numero_comprobante"`
	PuntoDeVenta     int    `json:"punto_de_venta"`
	Resultado        string `json:"resultado"` // "A" (aprobado) | "R" (rechazado)
	Observaciones    []struct {
		Codigo  int    `json:"codigo"`
		Mensaje string `json:"mensaje"`
	} `json:"observaciones"`
}

// AFIPValidationError is returned when the sidecar responds with a 4xx status code.
// These errors are permanent (bad input data) and must NOT be retried.
type AFIPValidationError struct {
	StatusCode int
	Detail     string
}

func (e *AFIPValidationError) Error() string {
	return fmt.Sprintf("afip: datos inválidos (%d): %s", e.StatusCode, e.Detail)
}

// AFIPClient is an HTTP client that delegates AFIP communication to the Python Sidecar.
// This decoupling isolates AFIP failures from the core Go backend (ADR-001).
type AFIPClient interface {
	Facturar(ctx context.Context, payload AFIPPayload) (*AFIPResponse, error)
	GetSidecarURL() string
	GetInternalToken() string
}

type afipClientImpl struct {
	sidecarURL    string
	internalToken string // X-Internal-Token header value (P1-008)
	httpClient    *http.Client
}

func (c *afipClientImpl) GetSidecarURL() string { return c.sidecarURL }
func (c *afipClientImpl) GetInternalToken() string { return c.internalToken }

// NewAFIPClient creates an AFIPClient.
// internalToken is sent as the X-Internal-Token header to authenticate
// requests to the sidecar. Pass an empty string to disable the header
// (e.g. in local development without the AFIP sidecar auth enabled).
func NewAFIPClient(sidecarURL, internalToken string) AFIPClient {
	return &afipClientImpl{
		sidecarURL:    sidecarURL,
		internalToken: internalToken,
		httpClient:    &http.Client{Timeout: 30 * time.Second},
	}
}

// Facturar sends a POST to the Python Sidecar and returns the CAE response.
func (c *afipClientImpl) Facturar(ctx context.Context, payload AFIPPayload) (*AFIPResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("afip: marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.sidecarURL+"/facturar", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("afip: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.internalToken != "" {
		req.Header.Set("X-Internal-Token", c.internalToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("afip: sidecar unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("afip: sidecar rechazó la solicitud (token interno inválido)")
	}
	if resp.StatusCode >= 400 && resp.StatusCode < 500 {
		// 4xx = error permanente de datos — no reintentar
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, &AFIPValidationError{StatusCode: resp.StatusCode, Detail: string(bodyBytes)}
	}
	if resp.StatusCode != http.StatusOK {
		// 5xx u otro = error transitorio — se puede reintentar
		bodyBytes, _ := io.ReadAll(resp.Body)
		bodyStr := string(bodyBytes)
		return nil, fmt.Errorf("afip: sidecar returned %d: %s", resp.StatusCode, bodyStr)
	}

	var result AFIPResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("afip: decode response: %w", err)
	}
	return &result, nil
}
