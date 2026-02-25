package repository

import (
	"context"

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

	// Date range: Desde/Hasta overrides Fecha
	if filter.Desde != "" && filter.Hasta != "" {
		q = q.Where("DATE(created_at) BETWEEN ? AND ?", filter.Desde, filter.Hasta)
	} else if filter.Desde != "" {
		q = q.Where("DATE(created_at) >= ?", filter.Desde)
	} else if filter.Hasta != "" {
		q = q.Where("DATE(created_at) <= ?", filter.Hasta)
	} else if filter.Fecha != "" {
		q = q.Where("DATE(created_at) = ?", filter.Fecha)
	}
	// If no date filter at all: return all (no implicit TODAY — caller sets limit)

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

	err := q.Preload("Items.Producto").Preload("Pagos").
		Order(orderCol + " " + orderDir).
		Offset(offset).Limit(filter.Limit).
		Find(&ventas).Error

	return ventas, total, err
}
