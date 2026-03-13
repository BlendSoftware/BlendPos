package worker

// facturacion_worker.go
// Processes fiscal billing jobs from QueueFacturacion.
// Sends POST to the Python AFIP Sidecar (through a Circuit Breaker) and stores the CAE result.
// When the CB is open, jobs are deferred to the retry cron via next_retry_at.

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
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
	// TipoComprobante: "ticket_interno" | "factura_a" | "factura_b" | "factura_c"
	TipoComprobante string `json:"tipo_comprobante"`
	// TipoDocReceptor: 96=DNI, 80=CUIT, 99=ConsumidorFinal
	TipoDocReceptor *int `json:"tipo_doc_receptor,omitempty"`
	// NroDocReceptor: CUIT/DNI del receptor, empty = default to "0"
	NroDocReceptor *string `json:"nro_doc_receptor,omitempty"`
	// ReceptorNombre: Nombre/Razón Social del receptor (obligatorio para facturas A/B/C)
	ReceptorNombre *string `json:"receptor_nombre,omitempty"`
	// ReceptorDomicilio: domicilio del comprador para la factura/PDF
	ReceptorDomicilio *string `json:"receptor_domicilio,omitempty"`
}

func applyPayloadToComprobante(comp *model.Comprobante, payload *FacturacionJobPayload) {
	if comp == nil || payload == nil {
		return
	}
	comp.ReceptorTipoDocumento = payload.TipoDocReceptor
	comp.ReceptorNumeroDocumento = payload.NroDocReceptor
	comp.ReceptorNombre = payload.ReceptorNombre
	comp.ReceptorDomicilio = payload.ReceptorDomicilio
	if payload.NroDocReceptor != nil && *payload.NroDocReceptor != "" && *payload.NroDocReceptor != "0" {
		comp.ReceptorCUIT = payload.NroDocReceptor
	}
}

// FacturacionWorker processes fiscal billing jobs from QueueFacturacion.
// It calls the AFIP Python Sidecar and stores the CAE result in the DB.
// After a successful AFIP call (or fallback), it generates a PDF ticket
// and optionally enqueues an email job.
type FacturacionWorker struct {
	afipClient      infra.AFIPClient
	cb              *infra.CircuitBreaker
	comprobanteRepo repository.ComprobanteRepository
	ventaRepo       repository.VentaRepository
	dispatcher      *Dispatcher
	pdfStoragePath  string
	configFiscalSvc ConfiguracionFiscalProvider
}

// NewFacturacionWorker wires all dependencies for the billing worker.
func NewFacturacionWorker(
	afipClient infra.AFIPClient,
	cb *infra.CircuitBreaker,
	comprobanteRepo repository.ComprobanteRepository,
	ventaRepo repository.VentaRepository,
	dispatcher *Dispatcher,
	pdfStoragePath string,
	configFiscalSvc ConfiguracionFiscalProvider,
) *FacturacionWorker {
	return &FacturacionWorker{
		afipClient:      afipClient,
		cb:              cb,
		comprobanteRepo: comprobanteRepo,
		ventaRepo:       ventaRepo,
		dispatcher:      dispatcher,
		pdfStoragePath:  pdfStoragePath,
		configFiscalSvc: configFiscalSvc,
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

	// 2. Idempotency check (B-01): if a comprobante already exists for this
	// venta, reuse it instead of creating a duplicate.
	comp, findErr := w.comprobanteRepo.FindByVentaID(ctx, ventaID)
	if findErr == nil && comp != nil {
		// Comprobante already exists.
		if comp.CAE != nil && *comp.CAE != "" {
			// Already has a CAE — previous job succeeded, this retry is a duplicate.
			log.Info().Str("venta_id", payload.VentaID).Msg("facturacion_worker: comprobante already has CAE, skipping")
			return
		}
		// Exists but without CAE — reuse this record for retry.
		log.Info().Str("venta_id", payload.VentaID).Msg("facturacion_worker: retrying existing comprobante without CAE")
	} else {
		// No comprobante exists — create one with estado "pendiente"
		tipoComp := payload.TipoComprobante
		if tipoComp == "" {
			tipoComp = "ticket_interno"
		}
		comp = &model.Comprobante{
			VentaID:    ventaID,
			Tipo:       tipoComp,
			MontoNeto:  venta.Total,
			MontoIVA:   decimal.Zero,
			MontoTotal: venta.Total,
			Estado:     "pendiente",
		}
		applyPayloadToComprobante(comp, &payload)
		if err := w.comprobanteRepo.Create(ctx, comp); err != nil {
			log.Error().Err(err).Str("venta_id", payload.VentaID).Msg("facturacion_worker: failed to create comprobante")
			return
		}
	}
	applyPayloadToComprobante(comp, &payload)

	// 3. For ticket_interno: mark as emitido immediately (no AFIP call needed)
	if comp.Tipo == "ticket_interno" {
		comp.Estado = "emitido"
		if err := w.comprobanteRepo.Update(ctx, comp); err != nil {
			log.Error().Err(err).Str("venta_id", payload.VentaID).Msg("facturacion_worker: failed to mark ticket_interno as emitido")
		}
		// Still generate PDF + email for internal tickets
		pdfPath := w.generatePDF(ctx, venta, comp, payload.VentaID)
		// Send email even if PDF generation failed (user still wants the receipt)
		if payload.ClienteEmail != nil && *payload.ClienteEmail != "" {
			htmlBody := w.generateHTMLBody(ctx, venta, comp)
			w.enqueueEmail(ctx, venta, *payload.ClienteEmail, pdfPath, htmlBody)
		}
		return
	}
	// 3. AFIP call through Circuit Breaker
	afipPayload := w.buildAFIPPayload(ctx, venta, &payload)
	afipResp, afipErr := w.callAFIPWithCB(ctx, afipPayload)

	// 4. Update Comprobante based on AFIP result
	w.handleAFIPResult(ctx, comp, afipResp, afipErr, payload.VentaID)

	// 5. Generate internal PDF ticket (AC-06.3)
	pdfPath := w.generatePDF(ctx, venta, comp, payload.VentaID)

	// 6. Async email if customer email was provided (AC-06.5)
	// Send email even if PDF generation failed (user still wants the receipt)
	if payload.ClienteEmail != nil && *payload.ClienteEmail != "" {
		htmlBody := w.generateHTMLBody(ctx, venta, comp)
		w.enqueueEmail(ctx, venta, *payload.ClienteEmail, pdfPath, htmlBody)
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

func (w *FacturacionWorker) buildAFIPPayload(ctx context.Context, venta *model.Venta, payload *FacturacionJobPayload) infra.AFIPPayload {
	// ── Read fiscal config from DB (with fallback defaults) ──────────────────
	cuitEmisor := ""
	puntoDeVenta := 1
	condicionFiscal := "Monotributo" // Safest default: Factura C, no IVA

	if w.configFiscalSvc != nil {
		if cfg, err := w.configFiscalSvc.ObtenerConfiguracion(ctx); err == nil && cfg != nil && cfg.CUITEmsior != "" {
			cuitEmisor = cfg.CUITEmsior
			puntoDeVenta = cfg.PuntoDeVenta
			condicionFiscal = cfg.CondicionFiscal
		} else if err != nil {
			log.Warn().Err(err).Msg("facturacion_worker: could not read fiscal config from DB, using defaults")
		}
	}

	// ── Determine comprobante type from condicion fiscal ─────────────────────
	// Overrideable from job payload for specific cases (e.g. B2B).
	tipoComprobante := 11 // Default: Factura C (Monotributo / Exento)
	switch payload.TipoComprobante {
	case "factura_a":
		tipoComprobante = 1
	case "factura_b":
		tipoComprobante = 6
	case "factura_c":
		tipoComprobante = 11
	default:
		// Auto-resolve from condicion fiscal when no override is given
		switch condicionFiscal {
		case "Responsable Inscripto":
			// If receptor is RI → Factura A; else Factura B
			if payload.TipoDocReceptor != nil && *payload.TipoDocReceptor == 80 {
				tipoComprobante = 1 // Factura A
			} else {
				tipoComprobante = 6 // Factura B
			}
		}
	}

	// ── IVA calculation ───────────────────────────────────────────────────────
	// El cálculo de IVA depende del TIPO DE COMPROBANTE final, no de la condición fiscal:
	// - Factura A (tipo 1): DEBE discriminar IVA 21% (neto + iva = total)
	// - Factura B (tipo 6): IVA incluido, no discriminado (total = neto, iva = 0)
	// - Factura C (tipo 11): Sin IVA, monotributista (total = neto, iva = 0)
	var importeNeto, importeIVA, importeExento decimal.Decimal
	total := venta.Total

	switch tipoComprobante {
	case 1: // Factura A - Discriminar IVA 21%
		// neto = total / 1.21 ; iva = total - neto
		divisor := decimal.NewFromFloat(1.21)
		importeNeto = total.Div(divisor).RoundBank(2)
		importeIVA = total.Sub(importeNeto).RoundBank(2)
		importeExento = decimal.Zero
	case 6, 11: // Factura B y C - IVA incluido o sin IVA
		// Para B y C: el total va íntegramente en imp_neto, sin discriminar IVA
		// AFIP requiere ImpTotal = ImpNeto + ImpTrib para estos tipos
		importeNeto = total
		importeIVA = decimal.Zero
		importeExento = decimal.Zero
	default:
		// Fallback seguro (tipo desconocido → ticket interno)
		importeNeto = total
		importeIVA = decimal.Zero
		importeExento = decimal.Zero
	}

	// ── Doc receptor ─────────────────────────────────────────────────────────
	tipoDocReceptor := 99 // ConsumidorFinal
	if payload.TipoDocReceptor != nil {
		tipoDocReceptor = *payload.TipoDocReceptor
	}
	nroDocReceptor := "0"
	if payload.NroDocReceptor != nil && *payload.NroDocReceptor != "" {
		nroDocReceptor = *payload.NroDocReceptor
	}

	return infra.AFIPPayload{
		CUITEmisor:       cuitEmisor,
		PuntoDeVenta:     puntoDeVenta,
		TipoComprobante:  tipoComprobante,
		TipoDocReceptor:  tipoDocReceptor,
		NroDocReceptor:   nroDocReceptor,
		Concepto:         1, // Productos
		ImporteNeto:      importeNeto.StringFixed(2),
		ImporteExento:    importeExento.StringFixed(2),
		ImporteIVA:       importeIVA.StringFixed(2),
		ImporteTributos:  "0.00", // Sin tributos adicionales por ahora
		ImporteTotal:     total.StringFixed(2),
		Moneda:           "PES",
		CotizacionMoneda: 1.0,
		VentaID:          payload.VentaID,
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
		if afipResp.NumeroComprobante > 0 {
			comp.Numero = &afipResp.NumeroComprobante
		}
		if afipResp.PuntoDeVenta > 0 {
			comp.PuntoDeVenta = afipResp.PuntoDeVenta
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
		var obsLines []string
		for _, o := range afipResp.Observaciones {
			obsLines = append(obsLines, fmt.Sprintf("[%d] %s", o.Codigo, o.Mensaje))
		}
		obs := fmt.Sprintf("AFIP rechazó el comprobante: resultado=%s", afipResp.Resultado)
		if len(obsLines) > 0 {
			obs += " — " + strings.Join(obsLines, "; ")
		}
		comp.Observaciones = &obs
		if err := w.comprobanteRepo.Update(ctx, comp); err != nil {
			log.Error().Err(err).Str("comprobante_id", comp.ID.String()).Msg("facturacion_worker: failed to persist comprobante after AFIP rejection")
		}
		log.Warn().Str("resultado", afipResp.Resultado).Str("venta_id", ventaID).Msg("facturacion_worker: AFIP rejected")
	}
}

func (w *FacturacionWorker) generatePDF(ctx context.Context, venta *model.Venta, comp *model.Comprobante, ventaID string) string {
	// Determine which PDF generator to use based on comprobante type
	isFiscal := comp.Tipo == "factura_a" || comp.Tipo == "factura_b" || comp.Tipo == "factura_c"
	
	var pdfPath string
	var pdfErr error

	if isFiscal {
		// Generate fiscal A4 PDF for electronic invoices.
		if w.configFiscalSvc == nil {
			pdfPath, pdfErr = infra.GenerateTicketPDF(venta, w.pdfStoragePath)
		} else {
			config, err := w.configFiscalSvc.ObtenerConfiguracionCompleta(ctx)
			if err != nil || config == nil || config.CUITEmsior == "" {
				log.Warn().Err(err).Str("venta_id", ventaID).Msg("facturacion_worker: could not load fiscal config for invoice, falling back to ticket")
				pdfPath, pdfErr = infra.GenerateTicketPDF(venta, w.pdfStoragePath)
			} else {
				pdfPath, pdfErr = infra.GenerateFacturaFiscalPDF(
					venta,
					comp,
					config,
					w.pdfStoragePath,
				)
			}
		}
	} else {
		// Generate simple thermal ticket for ticket_interno
		pdfPath, pdfErr = infra.GenerateTicketPDF(venta, w.pdfStoragePath)
	}

	if pdfErr != nil {
		log.Warn().Err(pdfErr).Str("venta_id", ventaID).Msg("facturacion_worker: PDF generation failed")
		return ""
	}
	
	comp.PDFPath = &pdfPath
	if err := w.comprobanteRepo.Update(ctx, comp); err != nil {
		log.Error().Err(err).Str("comprobante_id", comp.ID.String()).Msg("facturacion_worker: failed to persist PDF path")
	}
	
	log.Info().Str("pdf", pdfPath).Str("tipo", comp.Tipo).Str("venta_id", ventaID).Msg("facturacion_worker: PDF generated")
	return pdfPath
}

// generateHTMLBody renders the invoice HTML using GenerateFacturaHTML.
// Returns an empty string if generation fails (email will fall back to plain text).
func (w *FacturacionWorker) generateHTMLBody(ctx context.Context, venta *model.Venta, comp *model.Comprobante) string {
	if w.configFiscalSvc == nil {
		return ""
	}
	config, err := w.configFiscalSvc.ObtenerConfiguracionCompleta(ctx)
	if err != nil || config == nil {
		log.Warn().Err(err).Msg("facturacion_worker: could not load fiscal config for HTML email body")
		return ""
	}
	html, err := infra.GenerateFacturaEmailHTML(venta, comp, config)
	if err != nil {
		log.Warn().Err(err).Str("venta_id", venta.ID.String()).Msg("facturacion_worker: HTML body generation failed")
		return ""
	}
	return html
}

func (w *FacturacionWorker) enqueueEmail(ctx context.Context, venta *model.Venta, email, pdfPath, htmlBody string) {
	// Plain-text fallback body
	var body string
	if pdfPath != "" {
		body = fmt.Sprintf("Adjunto encontrarás tu comprobante de compra.\nTotal: $%.2f\n\nGracias por tu compra.", venta.Total.InexactFloat64())
	} else {
		body = fmt.Sprintf("Comprobante de tu compra.\nTotal: $%.2f\n\nTicket #%d\n\nPuedes solicitar una copia impresa en nuestro local.\nGracias por tu compra.", venta.Total.InexactFloat64(), venta.NumeroTicket)
		log.Warn().Str("email", email).Msg("facturacion_worker: sending email without PDF attachment")
	}

	emailJob := EmailJobPayload{
		ToEmail:  email,
		Subject:  fmt.Sprintf("Comprobante BlendPOS — Ticket #%d", venta.NumeroTicket),
		Body:     body,
		HTMLBody: htmlBody,
		PDFPath:  pdfPath,
	}
	if err := w.dispatcher.EnqueueEmail(ctx, emailJob); err != nil {
		log.Warn().Err(err).Str("email", email).Msg("facturacion_worker: failed to enqueue email")
	} else {
		log.Info().Str("email", email).Bool("with_pdf", pdfPath != "").Bool("with_html", htmlBody != "").Msg("facturacion_worker: email job enqueued")
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
