package repository

import (
	"context"
	"time"

	"blendpos/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ComprobanteRepository interface {
	Create(ctx context.Context, c *model.Comprobante) error
	FindByVentaID(ctx context.Context, ventaID uuid.UUID) (*model.Comprobante, error)
	FindByID(ctx context.Context, id uuid.UUID) (*model.Comprobante, error)
	Update(ctx context.Context, c *model.Comprobante) error
	// ListPendingRetries returns comprobantes with estado='pendiente' and
	// next_retry_at <= now, ordered by next_retry_at ASC. Used by retry cron.
	ListPendingRetries(ctx context.Context, now time.Time, limit int) ([]model.Comprobante, error)
	// CancelarPendientes marks all pendiente/retry comprobantes as 'error'.
	// Returns the number of rows affected.
	CancelarPendientes(ctx context.Context, motivo string) (int64, error)
}

type comprobanteRepo struct{ db *gorm.DB }

func NewComprobanteRepository(db *gorm.DB) ComprobanteRepository {
	return &comprobanteRepo{db: db}
}

func (r *comprobanteRepo) CancelarPendientes(ctx context.Context, motivo string) (int64, error) {
	result := r.db.WithContext(ctx).Exec(
		"UPDATE comprobantes SET estado = 'error', next_retry_at = NULL, last_error = ? WHERE estado = 'pendiente' AND next_retry_at IS NOT NULL",
		motivo,
	)
	return result.RowsAffected, result.Error
}

func (r *comprobanteRepo) Create(ctx context.Context, c *model.Comprobante) error {
	return r.db.WithContext(ctx).Create(c).Error
}

func (r *comprobanteRepo) FindByVentaID(ctx context.Context, ventaID uuid.UUID) (*model.Comprobante, error) {
	var c model.Comprobante
	err := r.db.WithContext(ctx).Where("venta_id = ?", ventaID).First(&c).Error
	return &c, err
}

func (r *comprobanteRepo) FindByID(ctx context.Context, id uuid.UUID) (*model.Comprobante, error) {
	var c model.Comprobante
	err := r.db.WithContext(ctx).First(&c, id).Error
	return &c, err
}

func (r *comprobanteRepo) Update(ctx context.Context, c *model.Comprobante) error {
	return r.db.WithContext(ctx).Save(c).Error
}

func (r *comprobanteRepo) ListPendingRetries(ctx context.Context, now time.Time, limit int) ([]model.Comprobante, error) {
	var results []model.Comprobante
	err := r.db.WithContext(ctx).
		Where("estado = ? AND next_retry_at IS NOT NULL AND next_retry_at <= ?", "pendiente", now).
		Order("next_retry_at ASC").
		Limit(limit).
		Find(&results).Error
	return results, err
}
