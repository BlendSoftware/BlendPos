package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

type FacturacionService interface {
	ObtenerComprobante(ctx context.Context, ventaID uuid.UUID) (*dto.FacturacionResponse, error)
	ObtenerPDFPath(ctx context.Context, id uuid.UUID) (string, error)
	AnularComprobante(ctx context.Context, id uuid.UUID, motivo string) (*dto.FacturacionResponse, error)
	ReintentarComprobante(ctx context.Context, id uuid.UUID) (*dto.FacturacionResponse, error)
}

type facturacionService struct {
	repo       repository.ComprobanteRepository
	dispatcher interface{} // kept for future use (e.g., re-dispatch AFIP calls)
}

func NewFacturacionService(repo repository.ComprobanteRepository, dispatcher interface{}) FacturacionService {
	return &facturacionService{repo: repo, dispatcher: dispatcher}
}

// ObtenerComprobante returns the billing record associated with a venta.
func (s *facturacionService) ObtenerComprobante(ctx context.Context, ventaID uuid.UUID) (*dto.FacturacionResponse, error) {
	comp, err := s.repo.FindByVentaID(ctx, ventaID)
	if err != nil {
		return nil, fmt.Errorf("comprobante no encontrado para la venta %s", ventaID)
	}
	return comprobanteToResponse(comp), nil
}

// ObtenerPDFPath returns the filesystem path of a generated PDF receipt.
func (s *facturacionService) ObtenerPDFPath(ctx context.Context, id uuid.UUID) (string, error) {
	comp, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return "", fmt.Errorf("comprobante no encontrado")
	}
	if comp.PDFPath == nil || *comp.PDFPath == "" {
		return "", fmt.Errorf("PDF no disponible — el comprobante está en estado '%s'", comp.Estado)
	}
	return *comp.PDFPath, nil
}

// AnularComprobante transitions a comprobante from "emitido" to "anulado".
// Only emitido comprobantes can be annulled. Records the reason in observaciones.
func (s *facturacionService) AnularComprobante(ctx context.Context, id uuid.UUID, motivo string) (*dto.FacturacionResponse, error) {
	comp, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, errors.New("comprobante no encontrado")
	}

	if comp.Estado != "emitido" {
		return nil, fmt.Errorf("solo se puede anular un comprobante emitido (estado actual: %s)", comp.Estado)
	}

	comp.Estado = "anulado"
	obs := fmt.Sprintf("Anulado: %s", motivo)
	comp.Observaciones = &obs

	if err := s.repo.Update(ctx, comp); err != nil {
		log.Error().Err(err).Str("comprobante_id", id.String()).Msg("facturacion_service: failed to update comprobante on annulation")
		return nil, fmt.Errorf("error al anular comprobante: %w", err)
	}

	log.Info().Str("comprobante_id", id.String()).Msg("facturacion_service: comprobante annulled")
	return comprobanteToResponse(comp), nil
}

// ReintentarComprobante resets a comprobante in "error" or "rechazado" back to "pendiente"
// and schedules an immediate retry via next_retry_at.
func (s *facturacionService) ReintentarComprobante(ctx context.Context, id uuid.UUID) (*dto.FacturacionResponse, error) {
	comp, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, errors.New("comprobante no encontrado")
	}

	if comp.Estado != "error" && comp.Estado != "rechazado" {
		return nil, fmt.Errorf("solo se puede reintentar un comprobante en error o rechazado (estado actual: %s)", comp.Estado)
	}

	comp.Estado = "pendiente"
	comp.RetryCount = 0
	now := time.Now()
	comp.NextRetryAt = &now
	comp.LastError = nil

	if err := s.repo.Update(ctx, comp); err != nil {
		log.Error().Err(err).Str("comprobante_id", id.String()).Msg("facturacion_service: failed to reset comprobante for retry")
		return nil, fmt.Errorf("error al reintentar comprobante: %w", err)
	}

	log.Info().Str("comprobante_id", id.String()).Msg("facturacion_service: comprobante reset for retry")
	return comprobanteToResponse(comp), nil
}

// ── helpers ──────────────────────────────────────────────────────────────────

func comprobanteToResponse(c *model.Comprobante) *dto.FacturacionResponse {
	resp := &dto.FacturacionResponse{
		ID:             c.ID.String(),
		Tipo:           c.Tipo,
		Numero:         c.Numero,
		PuntoDeVenta:   c.PuntoDeVenta,
		CAE:            c.CAE,
		ReceptorCUIT:   c.ReceptorCUIT,
		ReceptorNombre: c.ReceptorNombre,
		MontoNeto:      c.MontoNeto,
		MontoIVA:       c.MontoIVA,
		MontoTotal:     c.MontoTotal,
		Estado:         c.Estado,
		CreatedAt:      c.CreatedAt.Format(time.RFC3339),
	}
	if c.CAEVencimiento != nil {
		s := c.CAEVencimiento.Format("2006-01-02")
		resp.CAEVencimiento = &s
	}
	if c.PDFPath != nil && *c.PDFPath != "" {
		u := "/v1/facturacion/pdf/" + c.ID.String()
		resp.PDFUrl = &u
	}
	return resp
}
