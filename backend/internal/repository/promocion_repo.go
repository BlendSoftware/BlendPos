package repository

import (
	"context"

	"blendpos/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// PromocionRepository defines the data access contract for promotions.
type PromocionRepository interface {
	Create(ctx context.Context, p *model.Promocion) error
	FindByID(ctx context.Context, id uuid.UUID) (*model.Promocion, error)
	List(ctx context.Context, soloActivas bool) ([]model.Promocion, error)
	Update(ctx context.Context, p *model.Promocion, productoIDs []uuid.UUID) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type promocionRepo struct{ db *gorm.DB }

func NewPromocionRepository(db *gorm.DB) PromocionRepository {
	return &promocionRepo{db: db}
}

func (r *promocionRepo) Create(ctx context.Context, p *model.Promocion) error {
	return r.db.WithContext(ctx).Create(p).Error
}

func (r *promocionRepo) FindByID(ctx context.Context, id uuid.UUID) (*model.Promocion, error) {
	var p model.Promocion
	err := r.db.WithContext(ctx).
		Preload("Productos").
		First(&p, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *promocionRepo) List(ctx context.Context, soloActivas bool) ([]model.Promocion, error) {
	q := r.db.WithContext(ctx).
		Preload("Productos").
		Order("fecha_inicio DESC")
	if soloActivas {
		q = q.Where("activa = TRUE")
	}
	var items []model.Promocion
	if err := q.Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

func (r *promocionRepo) Update(ctx context.Context, p *model.Promocion, productoIDs []uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Save scalar fields
		if err := tx.Save(p).Error; err != nil {
			return err
		}
		// Replace many2many association
		prods := make([]model.Producto, 0, len(productoIDs))
		for _, pid := range productoIDs {
			prods = append(prods, model.Producto{ID: pid})
		}
		return tx.Model(p).Association("Productos").Replace(prods)
	})
}

func (r *promocionRepo) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.Promocion{}, "id = ?", id).Error
}
