package worker

// facturacion_worker.go
// Processes fiscal billing jobs from QueueFacturacion.
// Sends POST to the Python AFIP Sidecar (through a Circuit Breaker) and stores the CAE result.
// When the CB is open, jobs are deferred to the retry cron via next_retry_at.

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"blendpos/internal/infra"
	"blendpos/internal/model"
	"blendpos/internal/repository"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"github.com/shopspring/decimal"
)

// MaxComprobanteRetries is the maximum number of retry attempts before
// a comprobante is moved to estado='error' and pushed to the DLQ.
const MaxComprobanteRetries = 10

// FacturacionJobPayload is the job envelope sent to QueueFacturacion.
type FacturacionJobPayload struct {
	VentaID      string  `json:"venta_id"`
	ClienteEmail *string `json:"cliente_email,omitempty"`
}

// FacturacionWorker processes fiscal billing jobs from QueueFacturacion.
// It calls the AFIP Python Sidecar and stores the CAE result in the DB.
// After a successful AFIP call (or fallback), it generates a PDF ticket
// and optionally enqueues an email job.
type FacturacionWorker struct {
	afipClient      *infra.AFIPClient
	cb              *infra.CircuitBreaker
	comprobanteRepo repository.ComprobanteRepository
	ventaRepo       repository.VentaRepository
	dispatcher      *Dispatcher
	pdfStoragePath  string
	cuitEmisor      string
}

// NewFacturacionWorker wires all dependencies for the billing worker.
func NewFacturacionWorker(
	afipClient *infra.AFIPClient,
	cb *infra.CircuitBreaker,
	comprobanteRepo repository.ComprobanteRepository,
	ventaRepo repository.VentaRepository,
	dispatcher *Dispatcher,
	pdfStoragePath string,
	cuitEmisor string,
) *FacturacionWorker {
	return &FacturacionWorker{
		afipClient:      afipClient,
		cb:              cb,
		comprobanteRepo: comprobanteRepo,
		ventaRepo:       ventaRepo,
		dispatcher:      dispatcher,
		pdfStoragePath:  pdfStoragePath,
		cuitEmisor:      cuitEmisor,
	}
}

// Process handles a single facturacion job:
//  1. Parse FacturacionJobPayload from the job envelope
//  2. Fetch the Venta (with items+pagos) from DB
//  3. Create Comprobante record with estado="pendiente"
//  4. Call AFIP Sidecar through Circuit Breaker
//  5. Update Comprobante (CAE / estado / observaciones)
//  6. Generate PDF ticket (gofpdf, AC-06.3)
//  7. Optionally enqueue email job (AC-06.5)
func (w *FacturacionWorker) Process(ctx context.Context, raw json.RawMessage) {
	var payload FacturacionJobPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		log.Error().Err(err).Msg("facturacion_worker: invalid payload")
		return
	}

	ventaID, err := uuid.Parse(payload.VentaID)
	if err != nil {
		log.Error().Str("venta_id", payload.VentaID).Msg("facturacion_worker: invalid venta_id")
		return
	}

	// 1. Fetch Venta with items and pagos
	venta, err := w.ventaRepo.FindByID(ctx, ventaID)
	if err != nil {
		log.Error().Err(err).Str("venta_id", payload.VentaID).Msg("facturacion_worker: venta not found")
		return
	}

	// 2. Create Comprobante with status "pendiente"
	comp := &model.Comprobante{
		VentaID:    ventaID,
		Tipo:       "ticket_interno",
		MontoNeto:  venta.Total,
		MontoIVA:   decimal.Zero,
		MontoTotal: venta.Total,
		Estado:     "pendiente",
	}
	if err := w.comprobanteRepo.Create(ctx, comp); err != nil {
		log.Error().Err(err).Str("venta_id", payload.VentaID).Msg("facturacion_worker: failed to create comprobante")
		return
	}

	// 3. AFIP call through Circuit Breaker
	afipPayload := w.buildAFIPPayload(venta, payload.VentaID)
	afipResp, afipErr := w.callAFIPWithCB(ctx, afipPayload)

	// 4. Update Comprobante based on AFIP result
	w.handleAFIPResult(ctx, comp, afipResp, afipErr, payload.VentaID)

	// 5. Generate internal PDF ticket (AC-06.3)
	pdfPath := w.generatePDF(ctx, venta, comp, payload.VentaID)

	// 6. Async email if customer email was provided (AC-06.5)
	if payload.ClienteEmail != nil && *payload.ClienteEmail != "" && pdfPath != "" {
		w.enqueueEmail(ctx, venta, *payload.ClienteEmail, pdfPath)
	}
}

// callAFIPWithCB wraps the AFIP call in the circuit breaker.
// If the CB is open, the call fails immediately with ErrCircuitOpen,
// allowing the retry cron to pick it up later.
func (w *FacturacionWorker) callAFIPWithCB(ctx context.Context, payload infra.AFIPPayload) (*infra.AFIPResponse, error) {
	var afipResp *infra.AFIPResponse
	err := w.cb.Execute(func() error {
		resp, err := w.afipClient.Facturar(ctx, payload)
		if err != nil {
			return err
		}
		afipResp = resp
		return nil
	})
	return afipResp, err
}

func (w *FacturacionWorker) buildAFIPPayload(venta *model.Venta, ventaID string) infra.AFIPPayload {
	return infra.AFIPPayload{
		CUITEmisor:      w.cuitEmisor,
		PuntoDeVenta:    1,
		TipoComprobante: 11, // Factura C — consumidor final
		TipoDocReceptor: 99, // 99 = Consumidor Final
		NroDocReceptor:  "0",
		Concepto:        1, // Productos
		ImporteNeto:     venta.Total.InexactFloat64(),
		ImporteExento:   0,
		ImporteIVA:      0,
		ImporteTotal:    venta.Total.InexactFloat64(),
		VentaID:         ventaID,
	}
}

func (w *FacturacionWorker) handleAFIPResult(ctx context.Context, comp *model.Comprobante, afipResp *infra.AFIPResponse, afipErr error, ventaID string) {
	if afipErr != nil {
		log.Error().Err(afipErr).Str("venta_id", ventaID).Msg("facturacion_worker: AFIP call failed")
		comp.RetryCount++
		errMsg := afipErr.Error()
		comp.LastError = &errMsg
		// Schedule for retry with exponential backoff
		nextRetry := time.Now().Add(computeRetryBackoff(comp.RetryCount))
		comp.NextRetryAt = &nextRetry
		if comp.RetryCount >= MaxComprobanteRetries {
			comp.Estado = "error"
		}
		if err := w.comprobanteRepo.Update(ctx, comp); err != nil {
			log.Error().Err(err).Str("comprobante_id", comp.ID.String()).Msg("facturacion_worker: failed to persist comprobante after AFIP error")
		}
	} else if afipResp != nil && afipResp.Resultado == "A" {
		comp.Estado = "emitido"
		cae := afipResp.CAE
		comp.CAE = &cae
		if venc, err := parseFechaCAE(afipResp.CAEVencimiento); err == nil {
			comp.CAEVencimiento = venc
		}
		comp.RetryCount = 0
		comp.NextRetryAt = nil
		comp.LastError = nil
		if err := w.comprobanteRepo.Update(ctx, comp); err != nil {
			log.Error().Err(err).Str("comprobante_id", comp.ID.String()).Msg("facturacion_worker: failed to persist comprobante after CAE success")
		}
		log.Info().Str("cae", cae).Str("venta_id", ventaID).Msg("facturacion_worker: CAE obtained successfully")
	} else if afipResp != nil {
		comp.Estado = "rechazado"
		obs := fmt.Sprintf("AFIP rechazó el comprobante: resultado=%s", afipResp.Resultado)
		comp.Observaciones = &obs
		if err := w.comprobanteRepo.Update(ctx, comp); err != nil {
			log.Error().Err(err).Str("comprobante_id", comp.ID.String()).Msg("facturacion_worker: failed to persist comprobante after AFIP rejection")
		}
		log.Warn().Str("resultado", afipResp.Resultado).Str("venta_id", ventaID).Msg("facturacion_worker: AFIP rejected")
	}
}

func (w *FacturacionWorker) generatePDF(ctx context.Context, venta *model.Venta, comp *model.Comprobante, ventaID string) string {
	pdfPath, pdfErr := infra.GenerateTicketPDF(venta, w.pdfStoragePath)
	if pdfErr != nil {
		log.Warn().Err(pdfErr).Str("venta_id", ventaID).Msg("facturacion_worker: PDF generation failed")
		return ""
	}
	comp.PDFPath = &pdfPath
	if err := w.comprobanteRepo.Update(ctx, comp); err != nil {
		log.Error().Err(err).Str("comprobante_id", comp.ID.String()).Msg("facturacion_worker: failed to persist PDF path")
	}
	log.Info().Str("pdf", pdfPath).Str("venta_id", ventaID).Msg("facturacion_worker: PDF generated")
	return pdfPath
}

func (w *FacturacionWorker) enqueueEmail(ctx context.Context, venta *model.Venta, email, pdfPath string) {
	emailJob := EmailJobPayload{
		ToEmail: email,
		Subject: fmt.Sprintf("Comprobante BlendPOS — Ticket #%d", venta.NumeroTicket),
		Body:    fmt.Sprintf("Adjunto encontrarás tu comprobante de compra.\nTotal: $%.2f", venta.Total.InexactFloat64()),
		PDFPath: pdfPath,
	}
	if err := w.dispatcher.EnqueueEmail(ctx, emailJob); err != nil {
		log.Warn().Err(err).Str("email", email).Msg("facturacion_worker: failed to enqueue email")
	} else {
		log.Info().Str("email", email).Msg("facturacion_worker: email job enqueued")
	}
}

// computeRetryBackoff returns exponential backoff for comprobante retries.
// Schedule: 30s, 1m, 2m, 4m, 8m, 16m, 32m, 60m (capped).
func computeRetryBackoff(retryCount int) time.Duration {
	base := 30 * time.Second
	backoff := base * time.Duration(1<<uint(retryCount-1))
	maxBackoff := 60 * time.Minute
	if backoff > maxBackoff {
		return maxBackoff
	}
	return backoff
}

// parseFechaCAE parses the date format returned by AFIP ("YYYYMMDD").
func parseFechaCAE(s string) (*time.Time, error) {
	t, err := time.Parse("20060102", s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}
