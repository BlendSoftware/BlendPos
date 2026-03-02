package repository

import (
	"context"
	"time"

	"blendpos/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AuditRepository persists and queries audit log entries.
type AuditRepository interface {
	Log(ctx context.Context, entry *model.AuditLog) error
	List(ctx context.Context, filter AuditFilter) ([]model.AuditLog, int64, error)
}

// AuditFilter controls query parameters for the audit list endpoint.
type AuditFilter struct {
	EntityType string
	EntityID   *uuid.UUID
	UserID     *uuid.UUID
	Desde      *time.Time
	Hasta      *time.Time
	Page       int
	Limit      int
}

type auditRepo struct{ db *gorm.DB }

// NewAuditRepository creates a GORM-backed audit repository.
func NewAuditRepository(db *gorm.DB) AuditRepository {
	return &auditRepo{db: db}
}

func (r *auditRepo) Log(ctx context.Context, entry *model.AuditLog) error {
	return r.db.WithContext(ctx).Create(entry).Error
}

func (r *auditRepo) List(ctx context.Context, filter AuditFilter) ([]model.AuditLog, int64, error) {
	q := r.db.WithContext(ctx).Model(&model.AuditLog{})

	if filter.EntityType != "" {
		q = q.Where("entity_type = ?", filter.EntityType)
	}
	if filter.EntityID != nil {
		q = q.Where("entity_id = ?", *filter.EntityID)
	}
	if filter.UserID != nil {
		q = q.Where("user_id = ?", *filter.UserID)
	}
	if filter.Desde != nil {
		q = q.Where("created_at >= ?", *filter.Desde)
	}
	if filter.Hasta != nil {
		q = q.Where("created_at <= ?", *filter.Hasta)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page := filter.Page
	if page < 1 {
		page = 1
	}
	limit := filter.Limit
	if limit < 1 || limit > 100 {
		limit = 50
	}
	offset := (page - 1) * limit

	var entries []model.AuditLog
	err := q.Order("created_at DESC").Offset(offset).Limit(limit).Find(&entries).Error
	return entries, total, err
}
