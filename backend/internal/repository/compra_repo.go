package repository

import (
	"context"

	"blendpos/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CompraRepository defines the data access contract for purchase orders.
type CompraRepository interface {
	Create(ctx context.Context, c *model.Compra) error
	FindByID(ctx context.Context, id uuid.UUID) (*model.Compra, error)
	List(ctx context.Context, proveedorID *uuid.UUID, estado string, page, limit int) ([]model.Compra, int64, error)
	UpdateEstado(ctx context.Context, id uuid.UUID, estado string) error
	Delete(ctx context.Context, id uuid.UUID) error
	DB() *gorm.DB
}

type compraRepo struct{ db *gorm.DB }

func NewCompraRepository(db *gorm.DB) CompraRepository { return &compraRepo{db: db} }

func (r *compraRepo) DB() *gorm.DB { return r.db }

func (r *compraRepo) Create(ctx context.Context, c *model.Compra) error {
	return r.db.WithContext(ctx).Create(c).Error
}

func (r *compraRepo) FindByID(ctx context.Context, id uuid.UUID) (*model.Compra, error) {
	var c model.Compra
	err := r.db.WithContext(ctx).
		Preload("Proveedor").
		Preload("Items").
		Preload("Items.Producto").
		Preload("Pagos").
		First(&c, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *compraRepo) List(ctx context.Context, proveedorID *uuid.UUID, estado string, page, limit int) ([]model.Compra, int64, error) {
	q := r.db.WithContext(ctx).
		Preload("Proveedor").
		Preload("Items").
		Preload("Pagos").
		Order("fecha_compra DESC")

	if proveedorID != nil {
		q = q.Where("proveedor_id = ?", *proveedorID)
	}
	if estado != "" {
		q = q.Where("estado = ?", estado)
	}

	var total int64
	if err := q.Model(&model.Compra{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * limit
	var compras []model.Compra
	if err := q.Limit(limit).Offset(offset).Find(&compras).Error; err != nil {
		return nil, 0, err
	}
	return compras, total, nil
}

func (r *compraRepo) UpdateEstado(ctx context.Context, id uuid.UUID, estado string) error {
	return r.db.WithContext(ctx).Model(&model.Compra{}).
		Where("id = ?", id).Update("estado", estado).Error
}

func (r *compraRepo) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.Compra{}, "id = ?", id).Error
}
