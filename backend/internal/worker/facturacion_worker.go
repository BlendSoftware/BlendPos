package worker

// facturacion_worker.go
// Processes fiscal billing jobs from QueueFacturacion.
// Sends POST to the Python AFIP Sidecar and stores the CAE result.
// Implements exponential backoff (max 3 retries) as required by RF-19.

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
	comprobanteRepo repository.ComprobanteRepository
	ventaRepo       repository.VentaRepository
	dispatcher      *Dispatcher
	pdfStoragePath  string
	cuitEmisor      string
}

// NewFacturacionWorker wires all dependencies for the billing worker.
func NewFacturacionWorker(
	afipClient *infra.AFIPClient,
	comprobanteRepo repository.ComprobanteRepository,
	ventaRepo repository.VentaRepository,
	dispatcher *Dispatcher,
	pdfStoragePath string,
	cuitEmisor string,
) *FacturacionWorker {
	return &FacturacionWorker{
		afipClient:      afipClient,
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
//  4. Call AFIP Sidecar with exponential backoff (max 3 retries, RF-19)
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

	// 3. AFIP call with exponential backoff (RF-19): attempts = 1, retry after 1s, 2s
	var afipResp *infra.AFIPResponse
	afipErr := withRetry(ctx, 3, func(attempt int) error {
		afipPayload := infra.AFIPPayload{
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
			VentaID:         payload.VentaID,
		}
		resp, err := w.afipClient.Facturar(ctx, afipPayload)
		if err != nil {
			log.Warn().
				Err(err).
				Int("attempt", attempt+1).
				Str("venta_id", payload.VentaID).
				Msg("facturacion_worker: AFIP attempt failed, retrying")
			return err
		}
		afipResp = resp
		return nil
	})

	// 4. Update Comprobante based on AFIP result
	if afipErr != nil {
		log.Error().Err(afipErr).Str("venta_id", payload.VentaID).Msg("facturacion_worker: AFIP failed after all retries")
		comp.Estado = "pendiente" // stays pending for manual retry
		obs := fmt.Sprintf("AFIP error after 3 retries: %v", afipErr)
		comp.Observaciones = &obs
		_ = w.comprobanteRepo.Update(ctx, comp)
	} else if afipResp != nil && afipResp.Resultado == "A" {
		comp.Estado = "emitido"
		cae := afipResp.CAE
		comp.CAE = &cae
		if venc, err := parseFechaCAE(afipResp.CAEVencimiento); err == nil {
			comp.CAEVencimiento = venc
		}
		_ = w.comprobanteRepo.Update(ctx, comp)
		log.Info().Str("cae", cae).Str("venta_id", payload.VentaID).Msg("facturacion_worker: CAE obtained successfully")
	} else if afipResp != nil {
		comp.Estado = "rechazado"
		obs := fmt.Sprintf("AFIP rechazó el comprobante: resultado=%s", afipResp.Resultado)
		comp.Observaciones = &obs
		_ = w.comprobanteRepo.Update(ctx, comp)
		log.Warn().Str("resultado", afipResp.Resultado).Str("venta_id", payload.VentaID).Msg("facturacion_worker: AFIP rejected")
	}

	// 5. Generate internal PDF ticket (AC-06.3)
	pdfPath, pdfErr := infra.GenerateTicketPDF(venta, w.pdfStoragePath)
	if pdfErr != nil {
		log.Warn().Err(pdfErr).Str("venta_id", payload.VentaID).Msg("facturacion_worker: PDF generation failed")
	} else {
		comp.PDFPath = &pdfPath
		_ = w.comprobanteRepo.Update(ctx, comp)
		log.Info().Str("pdf", pdfPath).Str("venta_id", payload.VentaID).Msg("facturacion_worker: PDF generated")
	}

	// 6. Async email if customer email was provided (AC-06.5)
	if payload.ClienteEmail != nil && *payload.ClienteEmail != "" && pdfPath != "" {
		emailJob := EmailJobPayload{
			ToEmail: *payload.ClienteEmail,
			Subject: fmt.Sprintf("Comprobante BlendPOS — Ticket #%d", venta.NumeroTicket),
			Body:    fmt.Sprintf("Adjunto encontrarás tu comprobante de compra.\nTotal: $%.2f", venta.Total.InexactFloat64()),
			PDFPath: pdfPath,
		}
		if err := w.dispatcher.EnqueueEmail(ctx, emailJob); err != nil {
			log.Warn().Err(err).Str("email", *payload.ClienteEmail).Msg("facturacion_worker: failed to enqueue email")
		} else {
			log.Info().Str("email", *payload.ClienteEmail).Msg("facturacion_worker: email job enqueued")
		}
	}
}

// withRetry calls fn up to maxAttempts times with exponential backoff.
// Backoff schedule: attempt 1 = immediate, 2 = 1s, 3 = 2s.
// Returns nil if any attempt succeeds; last error otherwise.
func withRetry(ctx context.Context, maxAttempts int, fn func(attempt int) error) error {
	var lastErr error
	for i := 0; i < maxAttempts; i++ {
		if i > 0 {
			// 1s, 2s … (exponential backoff)
			wait := time.Duration(1<<uint(i-1)) * time.Second
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(wait):
			}
		}
		if err := fn(i); err != nil {
			lastErr = err
			continue
		}
		return nil
	}
	return lastErr
}

// parseFechaCAE parses the date format returned by AFIP ("YYYYMMDD").
func parseFechaCAE(s string) (*time.Time, error) {
	t, err := time.Parse("20060102", s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}
