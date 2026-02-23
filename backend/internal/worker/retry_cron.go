package worker

// retry_cron.go
// Background goroutine that periodically re-attempts AFIP calls for
// comprobantes stuck in estado='pendiente' with a next_retry_at in the past.
// Uses the Circuit Breaker to avoid hammering a downed sidecar.

import (
	"context"
	"fmt"
	"time"

	"blendpos/internal/infra"
	"blendpos/internal/repository"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

const (
	retryTickInterval = 30 * time.Second
	retryBatchSize    = 10
)

// RetryCronConfig holds all dependencies for the retry goroutine.
type RetryCronConfig struct {
	ComprobanteRepo repository.ComprobanteRepository
	AFIPClient      *infra.AFIPClient
	CB              *infra.CircuitBreaker
	RDB             *redis.Client
	CUITEmisor      string
}

// StartRetryCron launches a background goroutine that ticks every 30s,
// queries pending comprobantes, and re-attempts AFIP calls through the CB.
// It respects the context for graceful shutdown.
func StartRetryCron(ctx context.Context, cfg RetryCronConfig) {
	go func() {
		ticker := time.NewTicker(retryTickInterval)
		defer ticker.Stop()

		log.Info().Msg("retry_cron: started")

		for {
			select {
			case <-ctx.Done():
				log.Info().Msg("retry_cron: shutting down")
				return
			case <-ticker.C:
				processRetries(ctx, cfg)
			}
		}
	}()
}

func processRetries(ctx context.Context, cfg RetryCronConfig) {
	// If CB is open, skip entirely — don't hammer a downed sidecar
	if cfg.CB.State() == infra.CBOpen {
		log.Debug().Msg("retry_cron: circuit breaker is open, skipping tick")
		return
	}

	now := time.Now()
	comprobantes, err := cfg.ComprobanteRepo.ListPendingRetries(ctx, now, retryBatchSize)
	if err != nil {
		log.Error().Err(err).Msg("retry_cron: failed to query pending retries")
		return
	}

	if len(comprobantes) == 0 {
		return
	}

	log.Info().Int("count", len(comprobantes)).Msg("retry_cron: processing pending comprobantes")

	for i := range comprobantes {
		comp := &comprobantes[i]

		// Check CB state before each call — it may have tripped mid-batch
		if cfg.CB.State() == infra.CBOpen {
			log.Debug().Msg("retry_cron: circuit breaker opened mid-batch, stopping")
			return
		}

		afipPayload := infra.AFIPPayload{
			CUITEmisor:      cfg.CUITEmisor,
			PuntoDeVenta:    comp.PuntoDeVenta,
			TipoComprobante: 11,
			TipoDocReceptor: 99,
			NroDocReceptor:  "0",
			Concepto:        1,
			ImporteNeto:     comp.MontoNeto.InexactFloat64(),
			ImporteExento:   0,
			ImporteIVA:      comp.MontoIVA.InexactFloat64(),
			ImporteTotal:    comp.MontoTotal.InexactFloat64(),
			VentaID:         comp.VentaID.String(),
		}

		var afipResp *infra.AFIPResponse
		cbErr := cfg.CB.Execute(func() error {
			resp, err := cfg.AFIPClient.Facturar(ctx, afipPayload)
			if err != nil {
				return err
			}
			afipResp = resp
			return nil
		})

		if cbErr != nil {
			// Failure — increment retry count, schedule next attempt
			comp.RetryCount++
			errMsg := cbErr.Error()
			comp.LastError = &errMsg
			nextRetry := time.Now().Add(computeRetryBackoff(comp.RetryCount))
			comp.NextRetryAt = &nextRetry

			if comp.RetryCount >= MaxComprobanteRetries {
				comp.Estado = "error"
				comp.NextRetryAt = nil
				log.Error().
					Str("comprobante_id", comp.ID.String()).
					Str("venta_id", comp.VentaID.String()).
					Int("retries", comp.RetryCount).
					Msg("retry_cron: max retries exceeded, moving to error/DLQ")

				// Send to DLQ for manual inspection
				payload := fmt.Sprintf(`{"venta_id":"%s","comprobante_id":"%s"}`, comp.VentaID, comp.ID)
				SendToDLQ(ctx, cfg.RDB, QueueFacturacion, "facturacion", []byte(payload),
					fmt.Sprintf("max retries (%d) exceeded: %s", MaxComprobanteRetries, errMsg),
					comp.RetryCount)
			} else {
				log.Warn().
					Str("comprobante_id", comp.ID.String()).
					Int("retry_count", comp.RetryCount).
					Time("next_retry_at", *comp.NextRetryAt).
					Msg("retry_cron: AFIP retry failed, scheduled next attempt")
			}

			_ = cfg.ComprobanteRepo.Update(ctx, comp)
			continue
		}

		// Success path
		if afipResp != nil && afipResp.Resultado == "A" {
			comp.Estado = "emitido"
			cae := afipResp.CAE
			comp.CAE = &cae
			if venc, err := parseFechaCAE(afipResp.CAEVencimiento); err == nil {
				comp.CAEVencimiento = venc
			}
			comp.NextRetryAt = nil
			comp.LastError = nil
			_ = cfg.ComprobanteRepo.Update(ctx, comp)

			log.Info().
				Str("cae", cae).
				Str("comprobante_id", comp.ID.String()).
				Int("total_retries", comp.RetryCount).
				Msg("retry_cron: CAE obtained after retry")
		} else if afipResp != nil {
			comp.Estado = "rechazado"
			obs := fmt.Sprintf("AFIP rechazó (retry): resultado=%s", afipResp.Resultado)
			comp.Observaciones = &obs
			comp.NextRetryAt = nil
			_ = cfg.ComprobanteRepo.Update(ctx, comp)
			log.Warn().
				Str("resultado", afipResp.Resultado).
				Str("comprobante_id", comp.ID.String()).
				Msg("retry_cron: AFIP rejected on retry")
		}
	}
}
