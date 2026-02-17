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
	FindSesionByID(ctx context.Context, id uuid.UUID) (*model.SesionCaja, error)
	UpdateSesion(ctx context.Context, s *model.SesionCaja) error
	CreateMovimiento(ctx context.Context, m *model.MovimientoCaja) error
	ListMovimientos(ctx context.Context, sesionCajaID uuid.UUID) ([]model.MovimientoCaja, error)
	SumMovimientosByMetodo(ctx context.Context, sesionCajaID uuid.UUID) (map[string]decimal.Decimal, error)
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

func (r *cajaRepo) ListMovimientos(ctx context.Context, sesionCajaID uuid.UUID) ([]model.MovimientoCaja, error) {
	var movs []model.MovimientoCaja
	err := r.db.WithContext(ctx).Where("sesion_caja_id = ?", sesionCajaID).Order("created_at ASC").Find(&movs).Error
	return movs, err
}

func (r *cajaRepo) SumMovimientosByMetodo(ctx context.Context, sesionCajaID uuid.UUID) (map[string]decimal.Decimal, error) {
	// TODO (Phase 4): implement GROUP BY metodo_pago SUM(monto)
	return map[string]decimal.Decimal{}, nil
}
