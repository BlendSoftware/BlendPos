package service

import (
	"context"
	"fmt"

	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/shopspring/decimal"
)

// ProductoService defines the business logic contract for products.
type ProductoService interface {
	Crear(ctx context.Context, req dto.CrearProductoRequest) (*dto.ProductoResponse, error)
	ObtenerPorID(ctx context.Context, id uuid.UUID) (*dto.ProductoResponse, error)
	ObtenerPorBarcode(ctx context.Context, barcode string) (*dto.ProductoResponse, error)
	Listar(ctx context.Context, filter dto.ProductoFilter) (*dto.ProductoListResponse, error)
	Actualizar(ctx context.Context, id uuid.UUID, req dto.ActualizarProductoRequest) (*dto.ProductoResponse, error)
	Desactivar(ctx context.Context, id uuid.UUID) error
	Reactivar(ctx context.Context, id uuid.UUID) error
	AjustarStock(ctx context.Context, id uuid.UUID, req dto.AjustarStockRequest) (*dto.ProductoResponse, error)
}

type productoService struct {
	repo    repository.ProductoRepository
	movRepo repository.MovimientoStockRepository
	rdb     *redis.Client
}

func NewProductoService(repo repository.ProductoRepository, movRepo repository.MovimientoStockRepository, rdb *redis.Client) ProductoService {
	return &productoService{repo: repo, movRepo: movRepo, rdb: rdb}
}

// precioCacheKey returns the Redis key for a product's price cache entry.
func precioCacheKey(barcode string) string { return fmt.Sprintf("precio:%s", barcode) }

// invalidatePrecioCache removes the cached price for a given barcode.
// A best-effort operation — errors are intentionally swallowed.
// Safe to call when rdb is nil (e.g. in unit tests).
func (s *productoService) invalidatePrecioCache(ctx context.Context, barcode string) {
	if s.rdb == nil {
		return
	}
	_ = s.rdb.Del(ctx, precioCacheKey(barcode)).Err()
}

// calcMargen returns (precioVenta - precioCosto) / precioCosto * 100.
// Returns 0 if precioCosto is zero to avoid division by zero.
func calcMargen(costo, venta decimal.Decimal) decimal.Decimal {
	if costo.IsZero() {
		return decimal.Zero
	}
	return venta.Sub(costo).Div(costo).Mul(decimal.NewFromInt(100)).Round(2)
}

// toProductoResponse maps a model.Producto to its response DTO.
func toProductoResponse(p *model.Producto) *dto.ProductoResponse {
	var provStr *string
	if p.ProveedorID != nil {
		s := p.ProveedorID.String()
		provStr = &s
	}
	return &dto.ProductoResponse{
		ID:           p.ID.String(),
		CodigoBarras: p.CodigoBarras,
		Nombre:       p.Nombre,
		Descripcion:  p.Descripcion,
		Categoria:    p.Categoria,
		PrecioCosto:  p.PrecioCosto,
		PrecioVenta:  p.PrecioVenta,
		MargenPct:    calcMargen(p.PrecioCosto, p.PrecioVenta),
		StockActual:  p.StockActual,
		StockMinimo:  p.StockMinimo,
		UnidadMedida: p.UnidadMedida,
		EsPadre:      p.EsPadre,
		Activo:       p.Activo,
		ProveedorID:  provStr,
	}
}

// ── Service methods ──────────────────────────────────────────────────────────

func (s *productoService) Crear(ctx context.Context, req dto.CrearProductoRequest) (*dto.ProductoResponse, error) {
	var provID *uuid.UUID
	if req.ProveedorID != nil {
		id, err := uuid.Parse(*req.ProveedorID)
		if err != nil {
			return nil, fmt.Errorf("proveedor_id inválido: %w", err)
		}
		provID = &id
	}

	p := &model.Producto{
		CodigoBarras: req.CodigoBarras,
		Nombre:       req.Nombre,
		Descripcion:  req.Descripcion,
		Categoria:    req.Categoria,
		PrecioCosto:  req.PrecioCosto,
		PrecioVenta:  req.PrecioVenta,
		StockActual:  req.StockActual,
		StockMinimo:  req.StockMinimo,
		UnidadMedida: req.UnidadMedida,
		EsPadre:      false,
		Activo:       true,
		ProveedorID:  provID,
	}

	if err := s.repo.Create(ctx, p); err != nil {
		return nil, err
	}
	return toProductoResponse(p), nil
}

func (s *productoService) ObtenerPorID(ctx context.Context, id uuid.UUID) (*dto.ProductoResponse, error) {
	p, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return toProductoResponse(p), nil
}

func (s *productoService) ObtenerPorBarcode(ctx context.Context, barcode string) (*dto.ProductoResponse, error) {
	p, err := s.repo.FindByBarcode(ctx, barcode)
	if err != nil {
		return nil, err
	}
	return toProductoResponse(p), nil
}

func (s *productoService) Listar(ctx context.Context, filter dto.ProductoFilter) (*dto.ProductoListResponse, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Limit < 1 {
		filter.Limit = 20
	}

	productos, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	items := make([]dto.ProductoResponse, 0, len(productos))
	for i := range productos {
		items = append(items, *toProductoResponse(&productos[i]))
	}

	totalPages := int(total) / filter.Limit
	if int(total)%filter.Limit != 0 {
		totalPages++
	}

	return &dto.ProductoListResponse{
		Data:       items,
		Total:      total,
		Page:       filter.Page,
		Limit:      filter.Limit,
		TotalPages: totalPages,
	}, nil
}

func (s *productoService) Actualizar(ctx context.Context, id uuid.UUID, req dto.ActualizarProductoRequest) (*dto.ProductoResponse, error) {
	p, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.Nombre != nil {
		p.Nombre = *req.Nombre
	}
	if req.Descripcion != nil {
		p.Descripcion = req.Descripcion
	}
	if req.Categoria != nil {
		p.Categoria = *req.Categoria
	}
	if req.PrecioCosto != nil {
		p.PrecioCosto = *req.PrecioCosto
	}
	if req.PrecioVenta != nil {
		p.PrecioVenta = *req.PrecioVenta
	}
	if req.StockMinimo != nil {
		p.StockMinimo = *req.StockMinimo
	}
	if req.UnidadMedida != nil {
		p.UnidadMedida = *req.UnidadMedida
	}
	if req.ProveedorID != nil {
		pid, err := uuid.Parse(*req.ProveedorID)
		if err != nil {
			return nil, fmt.Errorf("proveedor_id inválido: %w", err)
		}
		p.ProveedorID = &pid
	}

	if err := s.repo.Update(ctx, p); err != nil {
		return nil, err
	}

	// Invalidate Redis price cache on any price change
	s.invalidatePrecioCache(ctx, p.CodigoBarras)

	return toProductoResponse(p), nil
}

func (s *productoService) Desactivar(ctx context.Context, id uuid.UUID) error {
	p, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return err
	}
	if err := s.repo.SoftDelete(ctx, id); err != nil {
		return err
	}
	s.invalidatePrecioCache(ctx, p.CodigoBarras)
	return nil
}

func (s *productoService) Reactivar(ctx context.Context, id uuid.UUID) error {
	return s.repo.Reactivar(ctx, id)
}

// AjustarStock incrementa (delta > 0) o decrementa (delta < 0) el stock de un producto.
// Corresponde a PATCH /v1/productos/:id/stock.
func (s *productoService) AjustarStock(ctx context.Context, id uuid.UUID, req dto.AjustarStockRequest) (*dto.ProductoResponse, error) {
	p, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("producto no encontrado")
	}
	if !p.Activo {
		return nil, fmt.Errorf("el producto está desactivado")
	}
	nuevoStock := p.StockActual + req.Delta
	if nuevoStock < 0 {
		return nil, fmt.Errorf("stock insuficiente: el ajuste resultaría en stock negativo (%d)", nuevoStock)
	}

	stockAntes := p.StockActual
	if err := s.repo.AjustarStock(ctx, id, req.Delta); err != nil {
		return nil, err
	}

	// Record movimiento de stock
	motivo := req.Motivo
	if motivo == "" {
		motivo = "Ajuste manual"
	}
	mov := &model.MovimientoStock{
		ProductoID:    id,
		Tipo:          "ajuste_manual",
		Cantidad:      req.Delta,
		StockAnterior: stockAntes,
		StockNuevo:    nuevoStock,
		Motivo:        motivo,
	}
	if s.movRepo != nil {
		_ = s.movRepo.Create(ctx, mov) // best-effort — don't fail the adjustment if this errors
	}

	// Refresh the product from DB to return updated stock
	p, err = s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return toProductoResponse(p), nil
}
