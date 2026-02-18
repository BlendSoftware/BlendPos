package service

import (
	"context"
	"errors"
	"fmt"

	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
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

// ── Helpers ──────────────────────────────────────────────────────────────────

func toVinculoResponse(v *model.ProductoHijo) dto.VinculoResponse {
	resp := dto.VinculoResponse{
		ID:               v.ID.String(),
		ProductoPadreID:  v.ProductoPadreID.String(),
		ProductoHijoID:   v.ProductoHijoID.String(),
		UnidadesPorPadre: v.UnidadesPorPadre,
		DesarmeAuto:      v.DesarmeAuto,
	}
	if v.Padre != nil {
		resp.NombrePadre = v.Padre.Nombre
	}
	if v.Hijo != nil {
		resp.NombreHijo = v.Hijo.Nombre
	}
	return resp
}

// ── Service methods ──────────────────────────────────────────────────────────

func (s *inventarioService) CrearVinculo(ctx context.Context, req dto.CrearVinculoRequest) (*dto.VinculoResponse, error) {
	padreID, err := uuid.Parse(req.ProductoPadreID)
	if err != nil {
		return nil, fmt.Errorf("producto_padre_id inválido: %w", err)
	}
	hijoID, err := uuid.Parse(req.ProductoHijoID)
	if err != nil {
		return nil, fmt.Errorf("producto_hijo_id inválido: %w", err)
	}
	if padreID == hijoID {
		return nil, errors.New("un producto no puede ser hijo de sí mismo")
	}

	// Validate both products exist
	padre, err := s.repo.FindByID(ctx, padreID)
	if err != nil {
		return nil, fmt.Errorf("producto padre no encontrado: %w", err)
	}
	hijo, err := s.repo.FindByID(ctx, hijoID)
	if err != nil {
		return nil, fmt.Errorf("producto hijo no encontrado: %w", err)
	}

	v := &model.ProductoHijo{
		ProductoPadreID:  padreID,
		ProductoHijoID:   hijoID,
		UnidadesPorPadre: req.UnidadesPorPadre,
		DesarmeAuto:      req.DesarmeAuto,
		Padre:            padre,
		Hijo:             hijo,
	}

	if err := s.repo.CreateVinculo(ctx, v); err != nil {
		return nil, err
	}

	resp := toVinculoResponse(v)
	return &resp, nil
}

func (s *inventarioService) ListarVinculos(ctx context.Context) ([]dto.VinculoResponse, error) {
	vinculos, err := s.repo.ListVinculos(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]dto.VinculoResponse, 0, len(vinculos))
	for i := range vinculos {
		result = append(result, toVinculoResponse(&vinculos[i]))
	}
	return result, nil
}

func (s *inventarioService) DesarmeManual(ctx context.Context, req dto.DesarmeManualRequest) (*dto.DesarmeManualResponse, error) {
	vinculoID, err := uuid.Parse(req.VinculoID)
	if err != nil {
		return nil, fmt.Errorf("vinculo_id inválido: %w", err)
	}

	vinculo, err := s.repo.FindVinculoByID(ctx, vinculoID)
	if err != nil {
		return nil, fmt.Errorf("vínculo no encontrado: %w", err)
	}

	padre, err := s.repo.FindByID(ctx, vinculo.ProductoPadreID)
	if err != nil {
		return nil, fmt.Errorf("producto padre no encontrado: %w", err)
	}

	if padre.StockActual < req.CantidadPadres {
		return nil, fmt.Errorf("stock insuficiente: disponible %d, solicitado %d",
			padre.StockActual, req.CantidadPadres)
	}

	unidadesGeneradas := req.CantidadPadres * vinculo.UnidadesPorPadre

	// Execute both stock changes in a single DB transaction
	txErr := s.repo.DB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.repo.UpdateStockTx(tx, vinculo.ProductoPadreID, -req.CantidadPadres); err != nil {
			return err
		}
		return s.repo.UpdateStockTx(tx, vinculo.ProductoHijoID, unidadesGeneradas)
	})
	if txErr != nil {
		return nil, txErr
	}

	return &dto.DesarmeManualResponse{
		VinculoID:         vinculoID.String(),
		PadresDesarmados:  req.CantidadPadres,
		UnidadesGeneradas: unidadesGeneradas,
	}, nil
}

func (s *inventarioService) ObtenerAlertas(ctx context.Context) ([]dto.AlertaStockResponse, error) {
	// Use List with a high Limit and filter in-memory.
	// A dedicated DB query will replace this in Phase 4 when the read model is ready.
	filter := dto.ProductoFilter{Page: 1, Limit: 1000}
	productos, _, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	alertas := make([]dto.AlertaStockResponse, 0)
	for _, p := range productos {
		if p.StockActual <= p.StockMinimo {
			alertas = append(alertas, dto.AlertaStockResponse{
				ProductoID:  p.ID.String(),
				Nombre:      p.Nombre,
				StockActual: p.StockActual,
				StockMinimo: p.StockMinimo,
				PrecioVenta: p.PrecioVenta,
			})
		}
	}
	return alertas, nil
}

func (s *inventarioService) DescontarStockTx(ctx context.Context, productoID uuid.UUID, cantidad int, tx interface{}) error {
	// TODO (Phase 3): automatic disassembly logic lives here — see arquitectura.md §6.4
	gormTx, ok := tx.(*gorm.DB)
	if !ok {
		return errors.New("tx debe ser *gorm.DB")
	}
	return s.repo.UpdateStockTx(gormTx, productoID, -cantidad)
}
