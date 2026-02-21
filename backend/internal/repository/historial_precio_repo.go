package repository

import (
	"context"

	"blendpos/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type HistorialPrecioRepository interface {
	ListByProducto(ctx context.Context, productoID uuid.UUID, page, limit int) ([]model.HistorialPrecio, int64, error)
}

type historialPrecioRepository struct{ db *gorm.DB }

func NewHistorialPrecioRepository(db *gorm.DB) HistorialPrecioRepository {
	return &historialPrecioRepository{db: db}
}

// ListByProducto returns paginated price-change records for one product,
// ordered newest-first (append-only table, so this reflects natural insert order).
func (r *historialPrecioRepository) ListByProducto(
	ctx context.Context,
	productoID uuid.UUID,
	page, limit int,
) ([]model.HistorialPrecio, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}

	var total int64
	if err := r.db.WithContext(ctx).
		Model(&model.HistorialPrecio{}).
		Where("producto_id = ?", productoID).
		Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var rows []model.HistorialPrecio
	offset := (page - 1) * limit
	if err := r.db.WithContext(ctx).
		Where("producto_id = ?", productoID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Preload("Proveedor").
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}

	return rows, total, nil
}
