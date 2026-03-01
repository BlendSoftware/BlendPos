package repository

import (
	"context"
	"fmt"
	"time"

	"blendpos/internal/dto"
	"blendpos/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type VentaRepository interface {
	Create(ctx context.Context, tx *gorm.DB, v *model.Venta) error
	FindByID(ctx context.Context, id uuid.UUID) (*model.Venta, error)
	FindByOfflineID(ctx context.Context, offlineID string) (*model.Venta, error)
	UpdateEstado(ctx context.Context, id uuid.UUID, estado string) error
	UpdateEstadoTx(tx *gorm.DB, id uuid.UUID, estado string) error
	NextTicketNumber(ctx context.Context, tx *gorm.DB) (int, error)
	List(ctx context.Context, filter dto.VentaFilter) ([]model.Venta, int64, error)
	DB() *gorm.DB // exposes the DB for transaction creation in service layer
}

type ventaRepo struct{ db *gorm.DB }

func NewVentaRepository(db *gorm.DB) VentaRepository { return &ventaRepo{db: db} }

func (r *ventaRepo) DB() *gorm.DB { return r.db }

func (r *ventaRepo) Create(ctx context.Context, tx *gorm.DB, v *model.Venta) error {
	return tx.WithContext(ctx).Create(v).Error
}

func (r *ventaRepo) FindByID(ctx context.Context, id uuid.UUID) (*model.Venta, error) {
	var v model.Venta
	err := r.db.WithContext(ctx).Preload("Items.Producto").Preload("Pagos").First(&v, id).Error
	return &v, err
}

func (r *ventaRepo) FindByOfflineID(ctx context.Context, offlineID string) (*model.Venta, error) {
	var v model.Venta
	err := r.db.WithContext(ctx).Where("offline_id = ?", offlineID).First(&v).Error
	return &v, err
}

func (r *ventaRepo) UpdateEstado(ctx context.Context, id uuid.UUID, estado string) error {
	return r.db.WithContext(ctx).Model(&model.Venta{}).Where("id = ?", id).Update("estado", estado).Error
}

func (r *ventaRepo) UpdateEstadoTx(tx *gorm.DB, id uuid.UUID, estado string) error {
	return tx.Model(&model.Venta{}).Where("id = ?", id).Update("estado", estado).Error
}


func (r *ventaRepo) NextTicketNumber(ctx context.Context, tx *gorm.DB) (int, error) {
	// Uses a PostgreSQL sequence for atomic ticket number generation
	var num int
	err := tx.WithContext(ctx).Raw("SELECT nextval('ventas_numero_ticket_seq')").Scan(&num).Error
	return num, err
}

func (r *ventaRepo) List(ctx context.Context, filter dto.VentaFilter) ([]model.Venta, int64, error) {
	var ventas []model.Venta
	var total int64
	offset := (filter.Page - 1) * filter.Limit

	q := r.db.WithContext(ctx).Model(&model.Venta{})

	if filter.Estado != "" && filter.Estado != "all" {
		q = q.Where("estado = ?", filter.Estado)
	}

	// Date range: Desde/Hasta overrides Fecha.
	// All comparisons use timestamptz range bounds (e.g. created_at >= X AND created_at < Y)
	// instead of DATE(created_at) so the existing index on created_at can be used (P2-006).
	if filter.Desde != "" && filter.Hasta != "" {
		desde, err1 := dayStart(filter.Desde)
		hasta, err2 := dayEnd(filter.Hasta)
		if err1 == nil && err2 == nil {
			q = q.Where("created_at >= ? AND created_at < ?", desde, hasta)
		}
	} else if filter.Desde != "" {
		desde, err := dayStart(filter.Desde)
		if err == nil {
			q = q.Where("created_at >= ?", desde)
		}
	} else if filter.Hasta != "" {
		hasta, err := dayEnd(filter.Hasta)
		if err == nil {
			q = q.Where("created_at < ?", hasta)
		}
	} else if filter.Fecha != "" {
		desde, err1 := dayStart(filter.Fecha)
		hasta, err2 := dayEnd(filter.Fecha)
		if err1 == nil && err2 == nil {
			q = q.Where("created_at >= ? AND created_at < ?", desde, hasta)
		}
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Ordering
	orderCol := "created_at"
	switch filter.OrdenarPor {
	case "total":
		orderCol = "total"
	case "numero_ticket":
		orderCol = "numero_ticket"
	}
	orderDir := "DESC"
	if filter.Orden == "asc" {
		orderDir = "ASC"
	}

	err := q.Preload("Pagos").Preload("Usuario").
		Order(orderCol + " " + orderDir).
		Offset(offset).Limit(filter.Limit).
		Find(&ventas).Error
	// NOTE: Items.Producto is intentionally NOT preloaded in List to avoid the N+1
	// query storm (up to 3× queries per row).  Item details are only needed in the
	// FindByID/detail view.  List callers that need item counts should use the
	// aggregate fields on Venta (total, subtotal) instead.

	return ventas, total, err
}

// ── Date helpers ──────────────────────────────────────────────────────────────
// Using timestamptz range bounds instead of DATE() ensures the index on
// created_at can be used by the query planner (P2-006).

const dateLayout = "2006-01-02"

// dayStart parses a YYYY-MM-DD string and returns the UTC start of that day.
func dayStart(dateStr string) (time.Time, error) {
	t, err := time.ParseInLocation(dateLayout, dateStr, time.UTC)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid date %q: %w", dateStr, err)
	}
	return t, nil
}

// dayEnd returns the exclusive upper bound (start of the next day) for a
// half-open interval [dayStart, dayEnd), so: created_at >= dayStart AND created_at < dayEnd.
func dayEnd(dateStr string) (time.Time, error) {
	t, err := dayStart(dateStr)
	if err != nil {
		return time.Time{}, err
	}
	return t.AddDate(0, 0, 1), nil
}
