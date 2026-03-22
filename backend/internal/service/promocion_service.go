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
	"github.com/shopspring/decimal"
)

// PromocionService handles promotion business logic.
type PromocionService interface {
	Crear(ctx context.Context, req dto.CrearPromocionRequest) (*dto.PromocionResponse, error)
	Listar(ctx context.Context, soloActivas bool) ([]dto.PromocionResponse, error)
	ObtenerPorID(ctx context.Context, id string) (*dto.PromocionResponse, error)
	Actualizar(ctx context.Context, id string, req dto.ActualizarPromocionRequest) (*dto.PromocionResponse, error)
	Eliminar(ctx context.Context, id string) error
}

type promocionService struct {
	repo repository.PromocionRepository
}

func NewPromocionService(repo repository.PromocionRepository) PromocionService {
	return &promocionService{repo: repo}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func calcEstado(p *model.Promocion) string {
	now := time.Now()
	if !p.Activa || now.After(p.FechaFin) {
		return "vencida"
	}
	if now.Before(p.FechaInicio) {
		return "pendiente"
	}
	return "activa"
}

func promocionToResponse(p *model.Promocion) dto.PromocionResponse {
	prods := make([]dto.PromocionProducto, 0, len(p.Productos))
	for _, pr := range p.Productos {
		prods = append(prods, dto.PromocionProducto{
			ID:          pr.ID.String(),
			Nombre:      pr.Nombre,
			PrecioVenta: pr.PrecioVenta.InexactFloat64(),
		})
	}
	cantReq := p.CantidadRequerida
	if cantReq < 1 {
		cantReq = 1
	}

	modo := p.Modo
	if modo == "" {
		modo = "clasico"
	}

	// Map grupos
	grupos := make([]dto.PromocionGrupoResponse, 0, len(p.Grupos))
	for _, g := range p.Grupos {
		gProds := make([]dto.PromocionProducto, 0, len(g.Productos))
		for _, pr := range g.Productos {
			gProds = append(gProds, dto.PromocionProducto{
				ID:          pr.ID.String(),
				Nombre:      pr.Nombre,
				PrecioVenta: pr.PrecioVenta.InexactFloat64(),
			})
		}
		gr := dto.PromocionGrupoResponse{
			ID:                g.ID.String(),
			Nombre:            g.Nombre,
			Orden:             g.Orden,
			CantidadRequerida: g.CantidadRequerida,
			TipoSeleccion:     g.TipoSeleccion,
			Productos:         gProds,
		}
		if g.CategoriaID != nil {
			catID := g.CategoriaID.String()
			gr.CategoriaID = &catID
		}
		if g.Categoria != nil {
			gr.CategoriaNombre = &g.Categoria.Nombre
		}
		grupos = append(grupos, gr)
	}

	return dto.PromocionResponse{
		ID:                p.ID.String(),
		Nombre:            p.Nombre,
		Descripcion:       p.Descripcion,
		Tipo:              p.Tipo,
		Valor:             p.Valor.InexactFloat64(),
		Modo:              modo,
		CantidadRequerida: cantReq,
		FechaInicio:       p.FechaInicio.Format(time.RFC3339),
		FechaFin:          p.FechaFin.Format(time.RFC3339),
		Activa:            p.Activa,
		Estado:            calcEstado(p),
		Productos:         prods,
		Grupos:            grupos,
		CreatedAt:         p.CreatedAt.Format(time.RFC3339),
	}
}

func parseProductoIDs(ids []string) ([]uuid.UUID, error) {
	out := make([]uuid.UUID, 0, len(ids))
	for _, s := range ids {
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, fmt.Errorf("producto_id inválido: %s", s)
		}
		out = append(out, id)
	}
	return out, nil
}

func parseFechas(inicio, fin string) (time.Time, time.Time, error) {
	fi, err := time.Parse("2006-01-02", inicio)
	if err != nil {
		fi, err = time.Parse(time.RFC3339, inicio)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("fecha_inicio inválida: %w", err)
		}
	}
	ff, err := time.Parse("2006-01-02", fin)
	if err != nil {
		ff, err = time.Parse(time.RFC3339, fin)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("fecha_fin inválida: %w", err)
		}
	}
	if !ff.After(fi) {
		return time.Time{}, time.Time{}, errors.New("fecha_fin debe ser posterior a fecha_inicio")
	}
	return fi, ff, nil
}

// buildGrupoModels converts DTO grupo requests into model structs ready for persistence.
func buildGrupoModels(grupos []dto.PromocionGrupoRequest) ([]model.PromocionGrupo, error) {
	out := make([]model.PromocionGrupo, 0, len(grupos))
	for _, g := range grupos {
		prodIDs, err := parseProductoIDs(g.ProductoIDs)
		if err != nil {
			return nil, err
		}
		prods := make([]model.Producto, 0, len(prodIDs))
		for _, pid := range prodIDs {
			prods = append(prods, model.Producto{ID: pid})
		}

		mg := model.PromocionGrupo{
			Nombre:            g.Nombre,
			Orden:             g.Orden,
			CantidadRequerida: g.CantidadRequerida,
			TipoSeleccion:     g.TipoSeleccion,
			Productos:         prods,
		}
		if mg.CantidadRequerida < 1 {
			mg.CantidadRequerida = 1
		}
		if g.CategoriaID != nil && *g.CategoriaID != "" {
			catID, err := uuid.Parse(*g.CategoriaID)
			if err != nil {
				return nil, fmt.Errorf("categoria_id inválido: %s", *g.CategoriaID)
			}
			mg.CategoriaID = &catID
		}
		out = append(out, mg)
	}
	return out, nil
}

// ── Service methods ──────────────────────────────────────────────────────────

func (s *promocionService) Crear(ctx context.Context, req dto.CrearPromocionRequest) (*dto.PromocionResponse, error) {
	fi, ff, err := parseFechas(req.FechaInicio, req.FechaFin)
	if err != nil {
		return nil, err
	}

	modo := req.Modo
	if modo == "" {
		modo = "clasico"
	}

	qtyReq := req.CantidadRequerida
	if qtyReq < 1 {
		qtyReq = 1
	}

	p := &model.Promocion{
		Nombre:            req.Nombre,
		Descripcion:       req.Descripcion,
		Tipo:              req.Tipo,
		Valor:             decimal.NewFromFloat(req.Valor),
		Modo:              modo,
		CantidadRequerida: qtyReq,
		FechaInicio:       fi,
		FechaFin:          ff,
		Activa:            true,
	}

	if modo == "grupos" {
		if len(req.Grupos) < 2 {
			return nil, errors.New("las promociones por grupos requieren al menos 2 grupos")
		}
		grupoModels, err := buildGrupoModels(req.Grupos)
		if err != nil {
			return nil, err
		}
		p.Grupos = grupoModels
	} else {
		// Classic mode: products via many-to-many
		prodIDs, err := parseProductoIDs(req.ProductoIDs)
		if err != nil {
			return nil, err
		}
		prods := make([]model.Producto, 0, len(prodIDs))
		for _, id := range prodIDs {
			prods = append(prods, model.Producto{ID: id})
		}
		p.Productos = prods
	}

	if err := s.repo.Create(ctx, p); err != nil {
		return nil, err
	}

	full, err := s.repo.FindByID(ctx, p.ID)
	if err != nil {
		resp := promocionToResponse(p)
		return &resp, nil
	}
	resp := promocionToResponse(full)
	return &resp, nil
}

func (s *promocionService) Listar(ctx context.Context, soloActivas bool) ([]dto.PromocionResponse, error) {
	items, err := s.repo.List(ctx, soloActivas)
	if err != nil {
		return nil, err
	}
	out := make([]dto.PromocionResponse, 0, len(items))
	for i := range items {
		out = append(out, promocionToResponse(&items[i]))
	}
	return out, nil
}

func (s *promocionService) ObtenerPorID(ctx context.Context, id string) (*dto.PromocionResponse, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("id inválido: %w", err)
	}
	p, err := s.repo.FindByID(ctx, uid)
	if err != nil {
		return nil, errors.New("promoción no encontrada")
	}
	resp := promocionToResponse(p)
	return &resp, nil
}

func (s *promocionService) Actualizar(ctx context.Context, id string, req dto.ActualizarPromocionRequest) (*dto.PromocionResponse, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("id inválido: %w", err)
	}
	p, err := s.repo.FindByID(ctx, uid)
	if err != nil {
		return nil, errors.New("promoción no encontrada")
	}

	fi, ff, err := parseFechas(req.FechaInicio, req.FechaFin)
	if err != nil {
		return nil, err
	}

	modo := req.Modo
	if modo == "" {
		modo = "clasico"
	}

	p.Nombre = req.Nombre
	p.Descripcion = req.Descripcion
	p.Tipo = req.Tipo
	p.Valor = decimal.NewFromFloat(req.Valor)
	p.Modo = modo
	p.FechaInicio = fi
	p.FechaFin = ff
	p.Activa = req.Activa
	qtyReqUpd := req.CantidadRequerida
	if qtyReqUpd < 1 {
		qtyReqUpd = 1
	}
	p.CantidadRequerida = qtyReqUpd

	if modo == "grupos" {
		if len(req.Grupos) < 2 {
			return nil, errors.New("las promociones por grupos requieren al menos 2 grupos")
		}
		grupoModels, err := buildGrupoModels(req.Grupos)
		if err != nil {
			return nil, err
		}
		// Update scalar fields + replace grupos
		if err := s.repo.UpdateWithGrupos(ctx, p, grupoModels); err != nil {
			return nil, err
		}
	} else {
		// Classic mode
		prodIDs, err := parseProductoIDs(req.ProductoIDs)
		if err != nil {
			return nil, err
		}
		if err := s.repo.Update(ctx, p, prodIDs); err != nil {
			return nil, err
		}
	}

	full, err := s.repo.FindByID(ctx, uid)
	if err != nil {
		resp := promocionToResponse(p)
		return &resp, nil
	}
	resp := promocionToResponse(full)
	return &resp, nil
}

func (s *promocionService) Eliminar(ctx context.Context, id string) error {
	uid, err := uuid.Parse(id)
	if err != nil {
		return fmt.Errorf("id inválido: %w", err)
	}
	if _, err := s.repo.FindByID(ctx, uid); err != nil {
		return errors.New("promoción no encontrada")
	}
	return s.repo.Delete(ctx, uid)
}
