package repository

import (
	"context"

	"blendpos/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// MovimientoStockFilter defines filters for listing stock movements.
type MovimientoStockFilter struct {
	ProductoID *uuid.UUID
	Tipo       string
	Page       int
	Limit      int
}

type MovimientoStockRepository interface {
	Create(ctx context.Context, m *model.MovimientoStock) error
	CreateTx(tx *gorm.DB, m *model.MovimientoStock) error
	List(ctx context.Context, filter MovimientoStockFilter) ([]model.MovimientoStock, int64, error)
}

type movimientoStockRepo struct{ db *gorm.DB }

func NewMovimientoStockRepository(db *gorm.DB) MovimientoStockRepository {
	return &movimientoStockRepo{db: db}
}

func (r *movimientoStockRepo) Create(ctx context.Context, m *model.MovimientoStock) error {
	return r.db.WithContext(ctx).Create(m).Error
}

func (r *movimientoStockRepo) CreateTx(tx *gorm.DB, m *model.MovimientoStock) error {
	return tx.Create(m).Error
}

func (r *movimientoStockRepo) List(ctx context.Context, filter MovimientoStockFilter) ([]model.MovimientoStock, int64, error) {
	q := r.db.WithContext(ctx).Model(&model.MovimientoStock{}).
		Preload("Producto")
	if filter.ProductoID != nil {
		q = q.Where("producto_id = ?", *filter.ProductoID)
	}
	if filter.Tipo != "" {
		q = q.Where("tipo = ?", filter.Tipo)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page := filter.Page
	limit := filter.Limit
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 500 {
		limit = 100
	}
	offset := (page - 1) * limit

	var movimientos []model.MovimientoStock
	err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&movimientos).Error
	return movimientos, total, err
}
