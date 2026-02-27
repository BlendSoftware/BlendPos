package repository

import (
	"context"

	"blendpos/internal/model"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type CajaRepository interface {
	CreateSesion(ctx context.Context, s *model.SesionCaja) error
	FindSesionAbiertaPorPDV(ctx context.Context, puntoDeVenta int) (*model.SesionCaja, error)
	FindSesionAbiertaPorUsuario(ctx context.Context, usuarioID uuid.UUID) (*model.SesionCaja, error)
	FindSesionByID(ctx context.Context, id uuid.UUID) (*model.SesionCaja, error)
	UpdateSesion(ctx context.Context, s *model.SesionCaja) error
	CreateMovimiento(ctx context.Context, m *model.MovimientoCaja) error
	CreateMovimientoTx(tx *gorm.DB, m *model.MovimientoCaja) error
	ListMovimientos(ctx context.Context, sesionCajaID uuid.UUID) ([]model.MovimientoCaja, error)
	SumMovimientosByMetodo(ctx context.Context, sesionCajaID uuid.UUID) (map[string]decimal.Decimal, error)
	ListSesiones(ctx context.Context, page, limit int) ([]model.SesionCaja, int64, error)
}

type cajaRepo struct{ db *gorm.DB }

func NewCajaRepository(db *gorm.DB) CajaRepository { return &cajaRepo{db: db} }

func (r *cajaRepo) CreateSesion(ctx context.Context, s *model.SesionCaja) error {
	return r.db.WithContext(ctx).Create(s).Error
}

func (r *cajaRepo) FindSesionAbiertaPorPDV(ctx context.Context, puntoDeVenta int) (*model.SesionCaja, error) {
	var s model.SesionCaja
	err := r.db.WithContext(ctx).Where("punto_de_venta = ? AND estado = 'abierta'", puntoDeVenta).First(&s).Error
	return &s, err
}

func (r *cajaRepo) FindSesionByID(ctx context.Context, id uuid.UUID) (*model.SesionCaja, error) {
	var s model.SesionCaja
	err := r.db.WithContext(ctx).Preload("Movimientos").First(&s, id).Error
	return &s, err
}

func (r *cajaRepo) UpdateSesion(ctx context.Context, s *model.SesionCaja) error {
	return r.db.WithContext(ctx).Save(s).Error
}

func (r *cajaRepo) CreateMovimiento(ctx context.Context, m *model.MovimientoCaja) error {
	return r.db.WithContext(ctx).Create(m).Error
}

// CreateMovimientoTx creates a movimiento within an existing DB transaction.
// Use this inside runTx closures to ensure the movimiento is part of the TX.
func (r *cajaRepo) CreateMovimientoTx(tx *gorm.DB, m *model.MovimientoCaja) error {
	return tx.Create(m).Error
}

func (r *cajaRepo) ListMovimientos(ctx context.Context, sesionCajaID uuid.UUID) ([]model.MovimientoCaja, error) {
	var movs []model.MovimientoCaja
	err := r.db.WithContext(ctx).Where("sesion_caja_id = ?", sesionCajaID).Order("created_at ASC").Find(&movs).Error
	return movs, err
}

func (r *cajaRepo) SumMovimientosByMetodo(ctx context.Context, sesionCajaID uuid.UUID) (map[string]decimal.Decimal, error) {
	type row struct {
		MetodoPago string
		Total      decimal.Decimal
	}
	var rows []row
	err := r.db.WithContext(ctx).
		Model(&model.MovimientoCaja{}).
		Select("metodo_pago, SUM(monto) as total").
		Where("sesion_caja_id = ? AND metodo_pago IS NOT NULL", sesionCajaID).
		Group("metodo_pago").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := map[string]decimal.Decimal{
		"efectivo":      decimal.Zero,
		"debito":        decimal.Zero,
		"credito":       decimal.Zero,
		"transferencia": decimal.Zero,
		"qr":            decimal.Zero,
	}
	for _, r := range rows {
		key := r.MetodoPago
		result[key] = result[key].Add(r.Total)
	}
	return result, nil
}

func (r *cajaRepo) FindSesionAbiertaPorUsuario(ctx context.Context, usuarioID uuid.UUID) (*model.SesionCaja, error) {
	var s model.SesionCaja
	err := r.db.WithContext(ctx).Where("usuario_id = ? AND estado = 'abierta'", usuarioID).First(&s).Error
	return &s, err
}

func (r *cajaRepo) ListSesiones(ctx context.Context, page, limit int) ([]model.SesionCaja, int64, error) {
	var sesiones []model.SesionCaja
	var total int64
	offset := (page - 1) * limit
	if err := r.db.WithContext(ctx).Model(&model.SesionCaja{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := r.db.WithContext(ctx).
		Order("opened_at DESC").
		Offset(offset).Limit(limit).
		Find(&sesiones).Error
	return sesiones, total, err
}
