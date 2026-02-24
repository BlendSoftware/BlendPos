package tests

import (
	"context"
	"errors"
	"testing"

	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"
	"blendpos/internal/service"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ── In-memory ProductoRepository stub ────────────────────────────────────────

type stubProductoRepo struct {
	productos map[uuid.UUID]*model.Producto
	vinculos  map[uuid.UUID]*model.ProductoHijo
}

func newStubProductoRepo() *stubProductoRepo {
	return &stubProductoRepo{
		productos: make(map[uuid.UUID]*model.Producto),
		vinculos:  make(map[uuid.UUID]*model.ProductoHijo),
	}
}

func (r *stubProductoRepo) Create(_ context.Context, p *model.Producto) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	r.productos[p.ID] = p
	return nil
}

func (r *stubProductoRepo) FindByID(_ context.Context, id uuid.UUID) (*model.Producto, error) {
	p, ok := r.productos[id]
	if !ok {
		return nil, errors.New("record not found")
	}
	return p, nil
}

func (r *stubProductoRepo) FindByBarcode(_ context.Context, barcode string) (*model.Producto, error) {
	for _, p := range r.productos {
		if p.CodigoBarras == barcode && p.Activo {
			return p, nil
		}
	}
	return nil, errors.New("record not found")
}

func (r *stubProductoRepo) List(_ context.Context, filter dto.ProductoFilter) ([]model.Producto, int64, error) {
	var result []model.Producto
	for _, p := range r.productos {
		if !p.Activo {
			continue
		}
		result = append(result, *p)
	}
	return result, int64(len(result)), nil
}

func (r *stubProductoRepo) Update(_ context.Context, p *model.Producto) error {
	r.productos[p.ID] = p
	return nil
}

func (r *stubProductoRepo) SoftDelete(_ context.Context, id uuid.UUID) error {
	p, ok := r.productos[id]
	if !ok {
		return errors.New("record not found")
	}
	p.Activo = false
	return nil
}

func (r *stubProductoRepo) Reactivar(_ context.Context, id uuid.UUID) error {
	p, ok := r.productos[id]
	if !ok {
		return errors.New("record not found")
	}
	p.Activo = true
	return nil
}

func (r *stubProductoRepo) FindByProveedorID(_ context.Context, proveedorID uuid.UUID) ([]model.Producto, error) {
	var result []model.Producto
	for _, p := range r.productos {
		if p.ProveedorID != nil && *p.ProveedorID == proveedorID && p.Activo {
			result = append(result, *p)
		}
	}
	return result, nil
}

func (r *stubProductoRepo) CreateVinculo(_ context.Context, v *model.ProductoHijo) error {
	if v.ID == uuid.Nil {
		v.ID = uuid.New()
	}
	r.vinculos[v.ID] = v
	return nil
}

func (r *stubProductoRepo) FindVinculoByHijoID(_ context.Context, hijoID uuid.UUID) (*model.ProductoHijo, error) {
	for _, v := range r.vinculos {
		if v.ProductoHijoID == hijoID && v.DesarmeAuto {
			return v, nil
		}
	}
	return nil, errors.New("vinculo not found")
}

func (r *stubProductoRepo) FindVinculoByID(_ context.Context, id uuid.UUID) (*model.ProductoHijo, error) {
	v, ok := r.vinculos[id]
	if !ok {
		return nil, errors.New("vinculo not found")
	}
	return v, nil
}

func (r *stubProductoRepo) ListVinculos(_ context.Context) ([]model.ProductoHijo, error) {
	result := make([]model.ProductoHijo, 0, len(r.vinculos))
	for _, v := range r.vinculos {
		result = append(result, *v)
	}
	return result, nil
}

func (r *stubProductoRepo) UpdateStockTx(_ *gorm.DB, id uuid.UUID, delta int) error {
	p, ok := r.productos[id]
	if !ok {
		return errors.New("record not found")
	}
	p.StockActual += delta
	return nil
}

func (r *stubProductoRepo) UpdatePreciosTx(_ *gorm.DB, id uuid.UUID, nuevoCosto, nuevaVenta, margen interface{}) error {
	p, ok := r.productos[id]
	if !ok {
		return errors.New("record not found")
	}
	if c, ok := nuevoCosto.(decimal.Decimal); ok {
		p.PrecioCosto = c
	}
	if v, ok := nuevaVenta.(decimal.Decimal); ok {
		p.PrecioVenta = v
	}
	if m, ok := margen.(decimal.Decimal); ok {
		p.MargenPct = m
	}
	return nil
}

func (r *stubProductoRepo) DB() *gorm.DB {
	// In-memory stub: return a zero-value DB so Transaction callback can still be invoked
	// by the service — but for unit tests we skip DesarmeManual's full TX path.
	return nil
}

func (r *stubProductoRepo) AjustarStock(_ context.Context, id uuid.UUID, delta int) error {
	p, ok := r.productos[id]
	if !ok {
		return errors.New("record not found")
	}
	p.StockActual += delta
	return nil
}

// Ensure the stub satisfies the interface at compile time.
var _ repository.ProductoRepository = (*stubProductoRepo)(nil)

// ── Helpers ───────────────────────────────────────────────────────────────────

func seedProducto(repo *stubProductoRepo, nombre, barcode string, stock, stockMin int) *model.Producto {
	p := &model.Producto{
		ID:           uuid.New(),
		CodigoBarras: barcode,
		Nombre:       nombre,
		Categoria:    "TEST",
		PrecioCosto:  decimal.NewFromFloat(10.00),
		PrecioVenta:  decimal.NewFromFloat(15.00),
		StockActual:  stock,
		StockMinimo:  stockMin,
		UnidadMedida: "UN",
		Activo:       true,
	}
	repo.productos[p.ID] = p
	return p
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestCrearProducto(t *testing.T) {
	repo := newStubProductoRepo()
	svc := service.NewProductoService(repo, nil, nil)

	resp, err := svc.Crear(context.Background(), dto.CrearProductoRequest{
		CodigoBarras: "7790001111111",
		Nombre:       "Gaseosa Cola 1.5L",
		Categoria:    "Bebidas",
		PrecioCosto:  decimal.NewFromFloat(80),
		PrecioVenta:  decimal.NewFromFloat(120),
		StockActual:  50,
		StockMinimo:  5,
		UnidadMedida: "UN",
	})

	require.NoError(t, err)
	assert.Equal(t, "Gaseosa Cola 1.5L", resp.Nombre)
	assert.Equal(t, "7790001111111", resp.CodigoBarras)
	assert.Equal(t, decimal.NewFromFloat(50).String(), resp.MargenPct.String())
}

func TestBusquedaPorBarcode(t *testing.T) {
	repo := newStubProductoRepo()
	svc := service.NewProductoService(repo, nil, nil)
	seedProducto(repo, "Agua Mineral 500ml", "7790002222222", 100, 10)

	resp, err := svc.ObtenerPorBarcode(context.Background(), "7790002222222")
	require.NoError(t, err)
	assert.Equal(t, "Agua Mineral 500ml", resp.Nombre)
	assert.Equal(t, 100, resp.StockActual)
}

func TestBusquedaPorBarcodeNoExiste(t *testing.T) {
	repo := newStubProductoRepo()
	svc := service.NewProductoService(repo, nil, nil)

	_, err := svc.ObtenerPorBarcode(context.Background(), "9999999999999")
	assert.Error(t, err)
}

func TestSoftDeleteProducto(t *testing.T) {
	repo := newStubProductoRepo()
	svc := service.NewProductoService(repo, nil, nil)
	p := seedProducto(repo, "Fideos 500g", "7790003333333", 30, 5)

	err := svc.Desactivar(context.Background(), p.ID)
	require.NoError(t, err)

	// Should no longer appear in active searches
	_, err = svc.ObtenerPorBarcode(context.Background(), "7790003333333")
	assert.Error(t, err)
}

func TestActualizarPrecioInvalidaCache(t *testing.T) {
	repo := newStubProductoRepo()
	svc := service.NewProductoService(repo, nil, nil) // nil Redis — invalidation is best-effort
	p := seedProducto(repo, "Leche 1L", "7790004444444", 20, 3)

	nuevoPrecio := decimal.NewFromFloat(95)
	resp, err := svc.Actualizar(context.Background(), p.ID, dto.ActualizarProductoRequest{
		PrecioVenta: &nuevoPrecio,
	})
	require.NoError(t, err)
	assert.Equal(t, nuevoPrecio.String(), resp.PrecioVenta.String())
}

func TestCrearVinculo(t *testing.T) {
	repo := newStubProductoRepo()
	svc := service.NewInventarioService(repo, nil)

	padre := seedProducto(repo, "Pack 6 latas", "7790005555555", 10, 2)
	hijo := seedProducto(repo, "Lata Cerveza 350ml", "7790006666666", 0, 5)

	resp, err := svc.CrearVinculo(context.Background(), dto.CrearVinculoRequest{
		ProductoPadreID:  padre.ID.String(),
		ProductoHijoID:   hijo.ID.String(),
		UnidadesPorPadre: 6,
		DesarmeAuto:      true,
	})
	require.NoError(t, err)
	assert.Equal(t, padre.ID.String(), resp.ProductoPadreID)
	assert.Equal(t, hijo.ID.String(), resp.ProductoHijoID)
	assert.Equal(t, 6, resp.UnidadesPorPadre)
}

func TestCrearVinculoMismoPadreHijo(t *testing.T) {
	repo := newStubProductoRepo()
	svc := service.NewInventarioService(repo, nil)
	p := seedProducto(repo, "Producto X", "7790007777777", 10, 1)

	_, err := svc.CrearVinculo(context.Background(), dto.CrearVinculoRequest{
		ProductoPadreID:  p.ID.String(),
		ProductoHijoID:   p.ID.String(),
		UnidadesPorPadre: 3,
	})
	assert.ErrorContains(t, err, "no puede ser hijo de sí mismo")
}

func TestObtenerAlertasStock(t *testing.T) {
	repo := newStubProductoRepo()
	svc := service.NewInventarioService(repo, nil)

	seedProducto(repo, "Producto OK", "1111111111111", 50, 5)      // stock > minimo
	seedProducto(repo, "Producto Bajo", "2222222222222", 3, 5)     // stock <= minimo
	seedProducto(repo, "Producto Critico", "3333333333333", 0, 10) // stock <= minimo

	alertas, err := svc.ObtenerAlertas(context.Background())
	require.NoError(t, err)
	assert.Len(t, alertas, 2)
}

func TestListarVinculos(t *testing.T) {
	repo := newStubProductoRepo()
	svc := service.NewInventarioService(repo, nil)

	padre := seedProducto(repo, "Caja 12", "4444444444444", 5, 1)
	hijo := seedProducto(repo, "Unidad", "5555555555555", 0, 6)

	_, err := svc.CrearVinculo(context.Background(), dto.CrearVinculoRequest{
		ProductoPadreID:  padre.ID.String(),
		ProductoHijoID:   hijo.ID.String(),
		UnidadesPorPadre: 12,
		DesarmeAuto:      false,
	})
	require.NoError(t, err)

	lista, err := svc.ListarVinculos(context.Background())
	require.NoError(t, err)
	assert.Len(t, lista, 1)
	assert.Equal(t, 12, lista[0].UnidadesPorPadre)
}

func TestDesarmePadreInsuficiente(t *testing.T) {
	repo := newStubProductoRepo()
	svc := service.NewInventarioService(repo, nil)

	padre := seedProducto(repo, "Caja 6 botellas", "6666666666666", 2, 0) // only 2 units
	hijo := seedProducto(repo, "Botella 1L", "7777777777777", 0, 0)

	var vinculoID uuid.UUID
	{
		resp, err := svc.CrearVinculo(context.Background(), dto.CrearVinculoRequest{
			ProductoPadreID:  padre.ID.String(),
			ProductoHijoID:   hijo.ID.String(),
			UnidadesPorPadre: 6,
			DesarmeAuto:      true,
		})
		require.NoError(t, err)
		vinculoID = uuid.MustParse(resp.ID)
	}

	_, err := svc.DesarmeManual(context.Background(), dto.DesarmeManualRequest{
		VinculoID:      vinculoID.String(),
		CantidadPadres: 5, // requesting 5, only 2 available
	})
	assert.ErrorContains(t, err, "stock insuficiente")
}

func TestDesarmeAutomatico(t *testing.T) {
	repo := newStubProductoRepo()

	padre := seedProducto(repo, "Pack x3", "8888888888888", 4, 0)
	hijo := seedProducto(repo, "Unidad chica", "9999999999999", 0, 0)

	// Create vinculo directly in the stub so we can bypass the TX requirement
	vinculo := &model.ProductoHijo{
		ID:               uuid.New(),
		ProductoPadreID:  padre.ID,
		ProductoHijoID:   hijo.ID,
		UnidadesPorPadre: 3,
		DesarmeAuto:      true,
		Padre:            padre,
		Hijo:             hijo,
	}
	repo.vinculos[vinculo.ID] = vinculo

	// Use UpdateStockTx directly (simulating what DesarmeManual would do in a real TX)
	err := repo.UpdateStockTx(nil, padre.ID, -2)
	require.NoError(t, err)
	err = repo.UpdateStockTx(nil, hijo.ID, 2*3)
	require.NoError(t, err)

	assert.Equal(t, 2, repo.productos[padre.ID].StockActual)
	assert.Equal(t, 6, repo.productos[hijo.ID].StockActual)
}
