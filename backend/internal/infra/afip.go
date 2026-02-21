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
// Field names must match the sidecar's FacturarRequest Pydantic schema.
type AFIPPayload struct {
	CUITEmisor      string  `json:"cuit_emisor"`       // CUIT del emisor (sin guiones)
	PuntoDeVenta    int     `json:"punto_de_venta"`    // Punto de venta autorizado
	TipoComprobante int     `json:"tipo_comprobante"`  // 1=FacturaA, 6=FacturaB, 11=FacturaC
	TipoDocReceptor int     `json:"tipo_doc_receptor"` // 96=DNI, 80=CUIT, 99=ConsumidorFinal
	NroDocReceptor  string  `json:"nro_doc_receptor"`  // DNI/CUIT del receptor, "0" para Consumidor Final
	Concepto        int     `json:"concepto"`          // 1=Productos, 2=Servicios, 3=Ambos
	ImporteNeto     float64 `json:"importe_neto"`      // Monto gravado sin IVA
	ImporteExento   float64 `json:"importe_exento"`    // Monto exento de IVA
	ImporteIVA      float64 `json:"importe_iva"`       // Monto de IVA
	ImporteTotal    float64 `json:"importe_total"`     // Total (neto+exento+iva)
	VentaID         string  `json:"venta_id"`
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
