package service

import (
	"context"
	"errors"

	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CategoriaService defines business operations for product categories.
type CategoriaService interface {
	Crear(ctx context.Context, req dto.CrearCategoriaRequest) (dto.CategoriaResponse, error)
	Listar(ctx context.Context) ([]dto.CategoriaResponse, error)
	Actualizar(ctx context.Context, id uuid.UUID, req dto.ActualizarCategoriaRequest) (dto.CategoriaResponse, error)
	Desactivar(ctx context.Context, id uuid.UUID) error
}

type categoriaService struct {
	repo repository.CategoriaRepository
}

func NewCategoriaService(repo repository.CategoriaRepository) CategoriaService {
	return &categoriaService{repo: repo}
}

// mapCategoria converts a model to a DTO response.
func mapCategoria(c model.Categoria) dto.CategoriaResponse {
	return dto.CategoriaResponse{
		ID:          c.ID,
		Nombre:      c.Nombre,
		Descripcion: c.Descripcion,
		Activo:      c.Activo,
	}
}

func (s *categoriaService) Crear(ctx context.Context, req dto.CrearCategoriaRequest) (dto.CategoriaResponse, error) {
	// Check for duplicate name
	existing, err := s.repo.ObtenerPorNombre(ctx, req.Nombre)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return dto.CategoriaResponse{}, err
	}
	if existing != nil {
		return dto.CategoriaResponse{}, errors.New("ya existe una categoría con ese nombre")
	}

	c := &model.Categoria{
		Nombre:      req.Nombre,
		Descripcion: req.Descripcion,
		Activo:      true,
	}
	if err := s.repo.Crear(ctx, c); err != nil {
		return dto.CategoriaResponse{}, err
	}
	return mapCategoria(*c), nil
}

func (s *categoriaService) Listar(ctx context.Context) ([]dto.CategoriaResponse, error) {
	list, err := s.repo.Listar(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]dto.CategoriaResponse, 0, len(list))
	for _, c := range list {
		result = append(result, mapCategoria(c))
	}
	return result, nil
}

func (s *categoriaService) Actualizar(ctx context.Context, id uuid.UUID, req dto.ActualizarCategoriaRequest) (dto.CategoriaResponse, error) {
	c, err := s.repo.ObtenerPorID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return dto.CategoriaResponse{}, errors.New("categoría no encontrada")
		}
		return dto.CategoriaResponse{}, err
	}

	if req.Nombre != nil {
		// Check uniqueness if name is changing
		if *req.Nombre != c.Nombre {
			existing, err := s.repo.ObtenerPorNombre(ctx, *req.Nombre)
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return dto.CategoriaResponse{}, err
			}
			if existing != nil && existing.ID != id {
				return dto.CategoriaResponse{}, errors.New("ya existe una categoría con ese nombre")
			}
		}
		c.Nombre = *req.Nombre
	}
	if req.Descripcion != nil {
		c.Descripcion = req.Descripcion
	}
	if req.Activo != nil {
		c.Activo = *req.Activo
	}

	if err := s.repo.Actualizar(ctx, c); err != nil {
		return dto.CategoriaResponse{}, err
	}
	return mapCategoria(*c), nil
}

func (s *categoriaService) Desactivar(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.ObtenerPorID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("categoría no encontrada")
		}
		return err
	}
	return s.repo.Desactivar(ctx, id)
}
