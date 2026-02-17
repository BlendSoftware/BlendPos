package service

import (
	"context"

	"blendpos/internal/dto"
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

func (s *facturacionService) ObtenerComprobante(ctx context.Context, ventaID uuid.UUID) (*dto.FacturacionResponse, error) {
	// TODO (Phase 5)
	return nil, nil
}

func (s *facturacionService) ObtenerPDFPath(ctx context.Context, id uuid.UUID) (string, error) {
	// TODO (Phase 5)
	return "", nil
}
