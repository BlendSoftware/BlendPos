package repository

import (
	"context"

	"blendpos/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CategoriaRepository defines CRUD operations for Categoria.
type CategoriaRepository interface {
	Crear(ctx context.Context, c *model.Categoria) error
	Listar(ctx context.Context) ([]model.Categoria, error)
	ObtenerPorID(ctx context.Context, id uuid.UUID) (*model.Categoria, error)
	ObtenerPorNombre(ctx context.Context, nombre string) (*model.Categoria, error)
	Actualizar(ctx context.Context, c *model.Categoria) error
	Desactivar(ctx context.Context, id uuid.UUID) error
}

type categoriaRepository struct{ db *gorm.DB }

func NewCategoriaRepository(db *gorm.DB) CategoriaRepository {
	return &categoriaRepository{db: db}
}

func (r *categoriaRepository) Crear(ctx context.Context, c *model.Categoria) error {
	return r.db.WithContext(ctx).Create(c).Error
}

func (r *categoriaRepository) Listar(ctx context.Context) ([]model.Categoria, error) {
	var list []model.Categoria
	err := r.db.WithContext(ctx).Order("nombre asc").Find(&list).Error
	return list, err
}

func (r *categoriaRepository) ObtenerPorID(ctx context.Context, id uuid.UUID) (*model.Categoria, error) {
	var c model.Categoria
	err := r.db.WithContext(ctx).First(&c, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *categoriaRepository) ObtenerPorNombre(ctx context.Context, nombre string) (*model.Categoria, error) {
	var c model.Categoria
	err := r.db.WithContext(ctx).Where("lower(nombre) = lower(?)", nombre).First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *categoriaRepository) Actualizar(ctx context.Context, c *model.Categoria) error {
	return r.db.WithContext(ctx).Save(c).Error
}

func (r *categoriaRepository) Desactivar(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&model.Categoria{}).Where("id = ?", id).Update("activo", false).Error
}
