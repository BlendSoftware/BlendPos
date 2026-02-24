package repository

import (
	"context"

	"blendpos/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ProveedorRepository interface {
	Create(ctx context.Context, p *model.Proveedor) error
	FindByID(ctx context.Context, id uuid.UUID) (*model.Proveedor, error)
	List(ctx context.Context) ([]model.Proveedor, error)
	Update(ctx context.Context, p *model.Proveedor) error
	SoftDelete(ctx context.Context, id uuid.UUID) error

	// Price history — append-only (RF-26)
	CreateHistorialPrecio(ctx context.Context, h *model.HistorialPrecio) error
	ListHistorialPorProducto(ctx context.Context, productoID uuid.UUID) ([]model.HistorialPrecio, error)

	// Contacts
	ReplaceContactos(ctx context.Context, proveedorID uuid.UUID, contactos []model.ContactoProveedor) error

	// DB exposes the underlying *gorm.DB so services can open transactions.
	DB() *gorm.DB
}

type proveedorRepo struct{ db *gorm.DB }

func NewProveedorRepository(db *gorm.DB) ProveedorRepository { return &proveedorRepo{db: db} }

func (r *proveedorRepo) Create(ctx context.Context, p *model.Proveedor) error {
	return r.db.WithContext(ctx).Create(p).Error
}

func (r *proveedorRepo) FindByID(ctx context.Context, id uuid.UUID) (*model.Proveedor, error) {
	var p model.Proveedor
	err := r.db.WithContext(ctx).Preload("Contactos").First(&p, id).Error
	return &p, err
}

func (r *proveedorRepo) List(ctx context.Context) ([]model.Proveedor, error) {
	var proveedores []model.Proveedor
	err := r.db.WithContext(ctx).Preload("Contactos").Where("activo = true").Order("razon_social ASC").Find(&proveedores).Error
	return proveedores, err
}

func (r *proveedorRepo) Update(ctx context.Context, p *model.Proveedor) error {
	return r.db.WithContext(ctx).Save(p).Error
}

func (r *proveedorRepo) SoftDelete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&model.Proveedor{}).Where("id = ?", id).Update("activo", false).Error
}

func (r *proveedorRepo) CreateHistorialPrecio(ctx context.Context, h *model.HistorialPrecio) error {
	return r.db.WithContext(ctx).Create(h).Error
}

func (r *proveedorRepo) ListHistorialPorProducto(ctx context.Context, productoID uuid.UUID) ([]model.HistorialPrecio, error) {
	var historial []model.HistorialPrecio
	err := r.db.WithContext(ctx).
		Where("producto_id = ?", productoID).
		Order("created_at DESC").
		Limit(50).
		Find(&historial).Error
	return historial, err
}

func (r *proveedorRepo) DB() *gorm.DB { return r.db }

// ReplaceContactos deletes all existing contacts for the supplier and inserts the new ones.
func (r *proveedorRepo) ReplaceContactos(ctx context.Context, proveedorID uuid.UUID, contactos []model.ContactoProveedor) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("proveedor_id = ?", proveedorID).Delete(&model.ContactoProveedor{}).Error; err != nil {
			return err
		}
		if len(contactos) > 0 {
			if err := tx.Create(&contactos).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
