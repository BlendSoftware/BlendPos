package repository

import (
	"context"

	"blendpos/internal/dto"
	"blendpos/internal/model"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type ListaPreciosRepository interface {
	Create(ctx context.Context, lp *model.ListaPrecios) error
	FindByID(ctx context.Context, id uuid.UUID) (*model.ListaPrecios, error)
	FindByIDWithProductos(ctx context.Context, id uuid.UUID) (*model.ListaPrecios, error)
	List(ctx context.Context, filter dto.ListaPreciosFilter) ([]model.ListaPrecios, int64, error)
	Update(ctx context.Context, lp *model.ListaPrecios) error
	Delete(ctx context.Context, id uuid.UUID) error

	// Productos dentro de una lista
	UpsertProducto(ctx context.Context, lpp *model.ListaPreciosProducto) error
	RemoveProducto(ctx context.Context, listaID, productoID uuid.UUID) error
	FindProductosByListaID(ctx context.Context, listaID uuid.UUID) ([]model.ListaPreciosProducto, error)
	AplicarMasivoTx(tx *gorm.DB, listaID uuid.UUID, descuento float64, productoIDs []uuid.UUID) error

	DB() *gorm.DB
}

type listaPreciosRepo struct {
	db *gorm.DB
}

func NewListaPreciosRepository(db *gorm.DB) ListaPreciosRepository {
	return &listaPreciosRepo{db: db}
}

func (r *listaPreciosRepo) DB() *gorm.DB { return r.db }

func (r *listaPreciosRepo) Create(ctx context.Context, lp *model.ListaPrecios) error {
	return r.db.WithContext(ctx).Create(lp).Error
}

func (r *listaPreciosRepo) FindByID(ctx context.Context, id uuid.UUID) (*model.ListaPrecios, error) {
	var lp model.ListaPrecios
	err := r.db.WithContext(ctx).First(&lp, "id = ?", id).Error
	return &lp, err
}

func (r *listaPreciosRepo) FindByIDWithProductos(ctx context.Context, id uuid.UUID) (*model.ListaPrecios, error) {
	var lp model.ListaPrecios
	err := r.db.WithContext(ctx).
		Preload("Productos", func(db *gorm.DB) *gorm.DB {
			return db.Preload("Producto")
		}).
		First(&lp, "id = ?", id).Error
	return &lp, err
}

func (r *listaPreciosRepo) List(ctx context.Context, filter dto.ListaPreciosFilter) ([]model.ListaPrecios, int64, error) {
	var listas []model.ListaPrecios
	var total int64

	countQ := r.db.WithContext(ctx).Model(&model.ListaPrecios{})
	if filter.Nombre != "" {
		countQ = countQ.Where("nombre ILIKE ?", "%"+filter.Nombre+"%")
	}
	if err := countQ.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	findQ := r.db.WithContext(ctx).Preload("Productos")
	if filter.Nombre != "" {
		findQ = findQ.Where("nombre ILIKE ?", "%"+filter.Nombre+"%")
	}
	offset := (filter.Page - 1) * filter.Limit
	err := findQ.
		Order("nombre ASC").
		Limit(filter.Limit).
		Offset(offset).
		Find(&listas).Error

	return listas, total, err
}

func (r *listaPreciosRepo) Update(ctx context.Context, lp *model.ListaPrecios) error {
	return r.db.WithContext(ctx).Save(lp).Error
}

func (r *listaPreciosRepo) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.ListaPrecios{}, "id = ?", id).Error
}

func (r *listaPreciosRepo) UpsertProducto(ctx context.Context, lpp *model.ListaPreciosProducto) error {
	return r.db.WithContext(ctx).
		Where("lista_precios_id = ? AND producto_id = ?", lpp.ListaPreciosID, lpp.ProductoID).
		Assign(model.ListaPreciosProducto{DescuentoPorcentaje: lpp.DescuentoPorcentaje}).
		FirstOrCreate(lpp).Error
}

func (r *listaPreciosRepo) RemoveProducto(ctx context.Context, listaID, productoID uuid.UUID) error {
	res := r.db.WithContext(ctx).
		Where("lista_precios_id = ? AND producto_id = ?", listaID, productoID).
		Delete(&model.ListaPreciosProducto{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *listaPreciosRepo) FindProductosByListaID(ctx context.Context, listaID uuid.UUID) ([]model.ListaPreciosProducto, error) {
	var items []model.ListaPreciosProducto
	err := r.db.WithContext(ctx).
		Preload("Producto").
		Where("lista_precios_id = ?", listaID).
		Find(&items).Error
	return items, err
}

func (r *listaPreciosRepo) AplicarMasivoTx(tx *gorm.DB, listaID uuid.UUID, descuento float64, productoIDs []uuid.UUID) error {
	// Delete existing entries for this list
	if err := tx.Where("lista_precios_id = ?", listaID).Delete(&model.ListaPreciosProducto{}).Error; err != nil {
		return err
	}

	// Bulk insert all products with the given discount
	items := make([]model.ListaPreciosProducto, len(productoIDs))
	for i, pid := range productoIDs {
		items[i] = model.ListaPreciosProducto{
			ListaPreciosID:      listaID,
			ProductoID:          pid,
			DescuentoPorcentaje: decFromFloat(descuento),
		}
	}

	if len(items) > 0 {
		return tx.CreateInBatches(items, 100).Error
	}
	return nil
}

func decFromFloat(f float64) decimal.Decimal {
	return decimal.NewFromFloat(f).Round(2)
}
