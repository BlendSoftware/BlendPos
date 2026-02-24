package repository

import (
	"context"

	"blendpos/internal/dto"
	"blendpos/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ProductoRepository defines the data access contract for products.
// Services depend on this interface, not on the concrete GORM implementation,
// enabling clean unit testing via mocks.
type ProductoRepository interface {
	Create(ctx context.Context, p *model.Producto) error
	FindByID(ctx context.Context, id uuid.UUID) (*model.Producto, error)
	FindByBarcode(ctx context.Context, barcode string) (*model.Producto, error)
	List(ctx context.Context, filter dto.ProductoFilter) ([]model.Producto, int64, error)
	Update(ctx context.Context, p *model.Producto) error
	SoftDelete(ctx context.Context, id uuid.UUID) error
	Reactivar(ctx context.Context, id uuid.UUID) error
	FindByProveedorID(ctx context.Context, proveedorID uuid.UUID) ([]model.Producto, error)

	// Hierarchy
	CreateVinculo(ctx context.Context, v *model.ProductoHijo) error
	FindVinculoByHijoID(ctx context.Context, hijoID uuid.UUID) (*model.ProductoHijo, error)
	FindVinculoByID(ctx context.Context, id uuid.UUID) (*model.ProductoHijo, error)
	ListVinculos(ctx context.Context) ([]model.ProductoHijo, error)

	// Used inside transactions — callers must pass the tx instance
	UpdateStockTx(tx *gorm.DB, id uuid.UUID, delta int) error

	// UpdatePreciosTx actualiza precio_costo, precio_venta y margen_pct dentro de una tx.
	UpdatePreciosTx(tx *gorm.DB, id uuid.UUID, nuevoCosto, nuevaVenta, margen interface{}) error

	// AjustarStock incrementa o decrementa stock_actual sin transaccion externa.
	AjustarStock(ctx context.Context, id uuid.UUID, delta int) error

	// DB exposes the underlying *gorm.DB so services can open transactions.
	DB() *gorm.DB
}

type productoRepo struct{ db *gorm.DB }

func NewProductoRepository(db *gorm.DB) ProductoRepository { return &productoRepo{db: db} }

// ── Implementations are written in Phase 2 ──────────────────────────────────
// Stub bodies are intentional: they make the scaffold compile-ready while
// avoiding premature implementation that may change during spec review.

func (r *productoRepo) Create(ctx context.Context, p *model.Producto) error {
	return r.db.WithContext(ctx).Create(p).Error
}

func (r *productoRepo) FindByID(ctx context.Context, id uuid.UUID) (*model.Producto, error) {
	var p model.Producto
	err := r.db.WithContext(ctx).First(&p, id).Error
	return &p, err
}

func (r *productoRepo) FindByBarcode(ctx context.Context, barcode string) (*model.Producto, error) {
	var p model.Producto
	err := r.db.WithContext(ctx).Where("codigo_barras = ? AND activo = true", barcode).First(&p).Error
	return &p, err
}

func (r *productoRepo) List(ctx context.Context, filter dto.ProductoFilter) ([]model.Producto, int64, error) {
	var productos []model.Producto
	var total int64

	q := r.db.WithContext(ctx).Model(&model.Producto{})

	// Activo filter: "false" = inactivos, "all" = todos, anything else = activos (default)
	switch filter.Activo {
	case "false":
		q = q.Where("activo = false")
	case "all":
		// no filter
	default:
		q = q.Where("activo = true")
	}

	if filter.Barcode != "" {
		q = q.Where("codigo_barras = ?", filter.Barcode)
	}
	if filter.Nombre != "" {
		// pg_trgm similarity search — falls back to ILIKE when no index hit
		q = q.Where("nombre ILIKE ?", "%"+filter.Nombre+"%")
	}
	if filter.Categoria != "" {
		q = q.Where("categoria = ?", filter.Categoria)
	}
	if filter.ProveedorID != "" {
		q = q.Where("proveedor_id = ?", filter.ProveedorID)
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (filter.Page - 1) * filter.Limit
	err := q.Order("nombre ASC").Limit(filter.Limit).Offset(offset).Find(&productos).Error
	return productos, total, err
}

func (r *productoRepo) Update(ctx context.Context, p *model.Producto) error {
	return r.db.WithContext(ctx).Save(p).Error
}

func (r *productoRepo) SoftDelete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&model.Producto{}).Where("id = ?", id).Update("activo", false).Error
}

func (r *productoRepo) Reactivar(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&model.Producto{}).Where("id = ?", id).Update("activo", true).Error
}

func (r *productoRepo) FindByProveedorID(ctx context.Context, proveedorID uuid.UUID) ([]model.Producto, error) {
	var productos []model.Producto
	err := r.db.WithContext(ctx).Where("proveedor_id = ? AND activo = true", proveedorID).Find(&productos).Error
	return productos, err
}

func (r *productoRepo) CreateVinculo(ctx context.Context, v *model.ProductoHijo) error {
	return r.db.WithContext(ctx).Create(v).Error
}

func (r *productoRepo) FindVinculoByHijoID(ctx context.Context, hijoID uuid.UUID) (*model.ProductoHijo, error) {
	var v model.ProductoHijo
	err := r.db.WithContext(ctx).Where("producto_hijo_id = ? AND desarme_auto = true", hijoID).First(&v).Error
	return &v, err
}

func (r *productoRepo) FindVinculoByID(ctx context.Context, id uuid.UUID) (*model.ProductoHijo, error) {
	var v model.ProductoHijo
	err := r.db.WithContext(ctx).First(&v, id).Error
	return &v, err
}

func (r *productoRepo) ListVinculos(ctx context.Context) ([]model.ProductoHijo, error) {
	var vinculos []model.ProductoHijo
	err := r.db.WithContext(ctx).Preload("Padre").Preload("Hijo").Find(&vinculos).Error
	return vinculos, err
}

func (r *productoRepo) UpdateStockTx(tx *gorm.DB, id uuid.UUID, delta int) error {
	return tx.Model(&model.Producto{}).Where("id = ?", id).
		Update("stock_actual", gorm.Expr("stock_actual + ?", delta)).Error
}

func (r *productoRepo) UpdatePreciosTx(tx *gorm.DB, id uuid.UUID, nuevoCosto, nuevaVenta, margen interface{}) error {
	return tx.Model(&model.Producto{}).Where("id = ?", id).Updates(map[string]interface{}{
		"precio_costo": nuevoCosto,
		"precio_venta": nuevaVenta,
		"margen_pct":   margen,
	}).Error
}

func (r *productoRepo) DB() *gorm.DB { return r.db }

func (r *productoRepo) AjustarStock(ctx context.Context, id uuid.UUID, delta int) error {
	return r.db.WithContext(ctx).Model(&model.Producto{}).
		Where("id = ? AND activo = true", id).
		Update("stock_actual", gorm.Expr("stock_actual + ?", delta)).Error
}
