package service

import (
	"context"

	"blendpos/internal/dto"
	"blendpos/internal/repository"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// ProductoService defines the business logic contract for products.
type ProductoService interface {
	Crear(ctx context.Context, req dto.CrearProductoRequest) (*dto.ProductoResponse, error)
	ObtenerPorID(ctx context.Context, id uuid.UUID) (*dto.ProductoResponse, error)
	ObtenerPorBarcode(ctx context.Context, barcode string) (*dto.ProductoResponse, error)
	Listar(ctx context.Context, filter dto.ProductoFilter) (*dto.ProductoListResponse, error)
	Actualizar(ctx context.Context, id uuid.UUID, req dto.ActualizarProductoRequest) (*dto.ProductoResponse, error)
	Desactivar(ctx context.Context, id uuid.UUID) error
}

type productoService struct {
	repo repository.ProductoRepository
	rdb  *redis.Client
}

func NewProductoService(repo repository.ProductoRepository, rdb *redis.Client) ProductoService {
	return &productoService{repo: repo, rdb: rdb}
}

// ── Implementations written in Phase 2 ──────────────────────────────────────

func (s *productoService) Crear(ctx context.Context, req dto.CrearProductoRequest) (*dto.ProductoResponse, error) {
	// TODO (Phase 2)
	return nil, nil
}

func (s *productoService) ObtenerPorID(ctx context.Context, id uuid.UUID) (*dto.ProductoResponse, error) {
	// TODO (Phase 2)
	return nil, nil
}

func (s *productoService) ObtenerPorBarcode(ctx context.Context, barcode string) (*dto.ProductoResponse, error) {
	// TODO (Phase 2)
	return nil, nil
}

func (s *productoService) Listar(ctx context.Context, filter dto.ProductoFilter) (*dto.ProductoListResponse, error) {
	// TODO (Phase 2)
	return nil, nil
}

func (s *productoService) Actualizar(ctx context.Context, id uuid.UUID, req dto.ActualizarProductoRequest) (*dto.ProductoResponse, error) {
	// TODO (Phase 2)
	return nil, nil
}

func (s *productoService) Desactivar(ctx context.Context, id uuid.UUID) error {
	// TODO (Phase 2)
	return nil
}
