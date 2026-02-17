package repository

import (
	"context"

	"blendpos/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ProveedorRepository interface {
	Create(ctx context.Context, p *model.Proveedor) error
	FindByID(ctx context.Context, id uuid.UUID) (*model.Proveedor, error)
	List(ctx context.Context) ([]model.Proveedor, error)
	Update(ctx context.Context, p *model.Proveedor) error
	SoftDelete(ctx context.Context, id uuid.UUID) error
}

type proveedorRepo struct{ db *gorm.DB }

func NewProveedorRepository(db *gorm.DB) ProveedorRepository { return &proveedorRepo{db: db} }

func (r *proveedorRepo) Create(ctx context.Context, p *model.Proveedor) error {
	return r.db.WithContext(ctx).Create(p).Error
}

func (r *proveedorRepo) FindByID(ctx context.Context, id uuid.UUID) (*model.Proveedor, error) {
	var p model.Proveedor
	err := r.db.WithContext(ctx).First(&p, id).Error
	return &p, err
}

func (r *proveedorRepo) List(ctx context.Context) ([]model.Proveedor, error) {
	var proveedores []model.Proveedor
	err := r.db.WithContext(ctx).Where("activo = true").Find(&proveedores).Error
	return proveedores, err
}

func (r *proveedorRepo) Update(ctx context.Context, p *model.Proveedor) error {
	return r.db.WithContext(ctx).Save(p).Error
}

func (r *proveedorRepo) SoftDelete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&model.Proveedor{}).Where("id = ?", id).Update("activo", false).Error
}
