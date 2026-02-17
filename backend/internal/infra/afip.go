package infra

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// AFIPPayload is sent by the Go worker pool to the AFIP Python Sidecar.
// The Sidecar handles WSAA + WSFEV1 and returns the CAE.
type AFIPPayload struct {
	TipoCBTE   int     `json:"tipo_cbte"` // 6=Factura B, 1=Factura A, 11=Factura C
	PuntoVenta int     `json:"punto_vta"`
	CUIT       string  `json:"cuit"`
	MontoNeto  float64 `json:"monto_neto"`
	MontoIVA   float64 `json:"monto_iva"`
	MontoTotal float64 `json:"monto_total"`
	VentaID    string  `json:"venta_id"`
}

// AFIPResponse is returned by the Python Sidecar after querying WSFEV1.
type AFIPResponse struct {
	CAE            string `json:"cae"`
	CAEVencimiento string `json:"cae_vencimiento"`
	Resultado      string `json:"resultado"` // "A" (aprobado) | "R" (rechazado)
	Observaciones  []struct {
		Codigo  int    `json:"codigo"`
		Mensaje string `json:"mensaje"`
	} `json:"observaciones"`
}

// AFIPClient is an HTTP client that delegates AFIP communication to the Python Sidecar.
// This decoupling isolates AFIP failures from the core Go backend (ADR-001).
type AFIPClient struct {
	sidecarURL string
	httpClient *http.Client
}

func NewAFIPClient(sidecarURL string) *AFIPClient {
	return &AFIPClient{
		sidecarURL: sidecarURL,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// Facturar sends a POST to the Python Sidecar and returns the CAE response.
func (c *AFIPClient) Facturar(ctx context.Context, payload AFIPPayload) (*AFIPResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("afip: marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.sidecarURL+"/facturar", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("afip: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("afip: sidecar unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("afip: sidecar returned %d", resp.StatusCode)
	}

	var result AFIPResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("afip: decode response: %w", err)
	}
	return &result, nil
}
