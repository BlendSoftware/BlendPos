package service

import (
	"context"

	"blendpos/internal/dto"
	"blendpos/internal/repository"
	"blendpos/internal/worker"

	"github.com/google/uuid"
)

type VentaService interface {
	RegistrarVenta(ctx context.Context, usuarioID uuid.UUID, req dto.RegistrarVentaRequest) (*dto.VentaResponse, error)
	AnularVenta(ctx context.Context, id uuid.UUID, motivo string) error
	SyncBatch(ctx context.Context, usuarioID uuid.UUID, req dto.SyncBatchRequest) ([]dto.VentaResponse, error)
}

type ventaService struct {
	repo       repository.VentaRepository
	inventario InventarioService
	caja       CajaService
	dispatcher *worker.Dispatcher
}

func NewVentaService(
	repo repository.VentaRepository,
	inventario InventarioService,
	caja CajaService,
	dispatcher *worker.Dispatcher,
) VentaService {
	return &ventaService{repo: repo, inventario: inventario, caja: caja, dispatcher: dispatcher}
}

func (s *ventaService) RegistrarVenta(ctx context.Context, usuarioID uuid.UUID, req dto.RegistrarVentaRequest) (*dto.VentaResponse, error) {
	// TODO (Phase 3): full ACID transaction — see arquitectura.md §7.1
	return nil, nil
}

func (s *ventaService) AnularVenta(ctx context.Context, id uuid.UUID, motivo string) error {
	// TODO (Phase 3)
	return nil
}

func (s *ventaService) SyncBatch(ctx context.Context, usuarioID uuid.UUID, req dto.SyncBatchRequest) ([]dto.VentaResponse, error) {
	// TODO (Phase 3): process offline sales batch
	return nil, nil
}
