package service

import (
	"context"
	"fmt"
	"time"

	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"
	"blendpos/internal/worker"

	"github.com/google/uuid"
)

type FacturacionService interface {
	ObtenerComprobante(ctx context.Context, ventaID uuid.UUID) (*dto.FacturacionResponse, error)
	ObtenerPDFPath(ctx context.Context, id uuid.UUID) (string, error)
}

type facturacionService struct {
	repo       repository.ComprobanteRepository
	dispatcher *worker.Dispatcher
}

func NewFacturacionService(repo repository.ComprobanteRepository, dispatcher *worker.Dispatcher) FacturacionService {
	return &facturacionService{repo: repo, dispatcher: dispatcher}
}

// ObtenerComprobante returns the billing record associated with a venta (GET /v1/facturacion/:venta_id).
func (s *facturacionService) ObtenerComprobante(ctx context.Context, ventaID uuid.UUID) (*dto.FacturacionResponse, error) {
	comp, err := s.repo.FindByVentaID(ctx, ventaID)
	if err != nil {
		return nil, fmt.Errorf("comprobante no encontrado para la venta %s", ventaID)
	}
	return comprobanteToResponse(comp), nil
}

// ObtenerPDFPath returns the filesystem path of a generated PDF receipt (GET /v1/facturacion/pdf/:id).
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
