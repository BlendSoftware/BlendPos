package service

import (
	"context"

	"blendpos/internal/dto"
	"blendpos/internal/repository"

	"github.com/google/uuid"
)

// InventarioService defines the contract for stock and hierarchy management.
type InventarioService interface {
	CrearVinculo(ctx context.Context, req dto.CrearVinculoRequest) (*dto.VinculoResponse, error)
	ListarVinculos(ctx context.Context) ([]dto.VinculoResponse, error)
	DesarmeManual(ctx context.Context, req dto.DesarmeManualRequest) (*dto.DesarmeManualResponse, error)
	ObtenerAlertas(ctx context.Context) ([]dto.AlertaStockResponse, error)
	// DescontarStockTx is called within a sale transaction — requires a live *gorm.DB tx
	DescontarStockTx(ctx context.Context, productoID uuid.UUID, cantidad int, tx interface{}) error
}

type inventarioService struct {
	repo repository.ProductoRepository
}

func NewInventarioService(repo repository.ProductoRepository) InventarioService {
	return &inventarioService{repo: repo}
}

func (s *inventarioService) CrearVinculo(ctx context.Context, req dto.CrearVinculoRequest) (*dto.VinculoResponse, error) {
	// TODO (Phase 2)
	return nil, nil
}

func (s *inventarioService) ListarVinculos(ctx context.Context) ([]dto.VinculoResponse, error) {
	// TODO (Phase 2)
	return nil, nil
}

func (s *inventarioService) DesarmeManual(ctx context.Context, req dto.DesarmeManualRequest) (*dto.DesarmeManualResponse, error) {
	// TODO (Phase 2)
	return nil, nil
}

func (s *inventarioService) ObtenerAlertas(ctx context.Context) ([]dto.AlertaStockResponse, error) {
	// TODO (Phase 2)
	return nil, nil
}

func (s *inventarioService) DescontarStockTx(ctx context.Context, productoID uuid.UUID, cantidad int, tx interface{}) error {
	// TODO (Phase 3): automatic disassembly logic lives here — see arquitectura.md §6.4
	return nil
}
