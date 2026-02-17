package service

import (
	"context"

	"blendpos/internal/dto"
	"blendpos/internal/repository"

	"github.com/google/uuid"
)

type ProveedorService interface {
	Crear(ctx context.Context, req dto.CrearProveedorRequest) (*dto.ProveedorResponse, error)
	ObtenerPorID(ctx context.Context, id uuid.UUID) (*dto.ProveedorResponse, error)
	Listar(ctx context.Context) ([]dto.ProveedorResponse, error)
	Actualizar(ctx context.Context, id uuid.UUID, req dto.CrearProveedorRequest) (*dto.ProveedorResponse, error)
	Eliminar(ctx context.Context, id uuid.UUID) error
	ActualizarPreciosMasivo(ctx context.Context, id uuid.UUID, req dto.ActualizarPreciosMasivoRequest) (*dto.ActualizacionMasivaResponse, error)
	ImportarCSV(ctx context.Context, proveedorID uuid.UUID, csvData []byte) (*dto.CSVImportResponse, error)
}

type proveedorService struct {
	repo         repository.ProveedorRepository
	productoRepo repository.ProductoRepository
}

func NewProveedorService(repo repository.ProveedorRepository, productoRepo repository.ProductoRepository) ProveedorService {
	return &proveedorService{repo: repo, productoRepo: productoRepo}
}

func (s *proveedorService) Crear(ctx context.Context, req dto.CrearProveedorRequest) (*dto.ProveedorResponse, error) {
	// TODO (Phase 6)
	return nil, nil
}

func (s *proveedorService) ObtenerPorID(ctx context.Context, id uuid.UUID) (*dto.ProveedorResponse, error) {
	// TODO (Phase 6)
	return nil, nil
}

func (s *proveedorService) Listar(ctx context.Context) ([]dto.ProveedorResponse, error) {
	// TODO (Phase 6)
	return nil, nil
}

func (s *proveedorService) Actualizar(ctx context.Context, id uuid.UUID, req dto.CrearProveedorRequest) (*dto.ProveedorResponse, error) {
	// TODO (Phase 6)
	return nil, nil
}

func (s *proveedorService) Eliminar(ctx context.Context, id uuid.UUID) error {
	// TODO (Phase 6)
	return nil
}

func (s *proveedorService) ActualizarPreciosMasivo(ctx context.Context, id uuid.UUID, req dto.ActualizarPreciosMasivoRequest) (*dto.ActualizacionMasivaResponse, error) {
	// TODO (Phase 6): preview + apply with percentage
	return nil, nil
}

func (s *proveedorService) ImportarCSV(ctx context.Context, proveedorID uuid.UUID, csvData []byte) (*dto.CSVImportResponse, error) {
	// TODO (Phase 6): parse with encoding/csv, upsert by barcode
	return nil, nil
}
