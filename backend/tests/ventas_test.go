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

// ── Stubs ─────────────────────────────────────────────────────────────────────

// stubVentaRepo is an in-memory VentaRepository for testing.
type stubVentaRepo struct {
	ventas     map[uuid.UUID]*model.Venta
	offlineIdx map[string]*model.Venta
	ticketSeq  int
}

func newStubVentaRepo() *stubVentaRepo {
	return &stubVentaRepo{
		ventas:    make(map[uuid.UUID]*model.Venta),
		offlineIdx: make(map[string]*model.Venta),
	}
}

func (r *stubVentaRepo) Create(_ context.Context, _ *gorm.DB, v *model.Venta) error {
	if v.ID == uuid.Nil {
		v.ID = uuid.New()
	}
	r.ventas[v.ID] = v
	if v.OfflineID != nil {
		r.offlineIdx[*v.OfflineID] = v
	}
	return nil
}

func (r *stubVentaRepo) FindByID(_ context.Context, id uuid.UUID) (*model.Venta, error) {
	v, ok := r.ventas[id]
	if !ok {
		return nil, errors.New("not found")
	}
	return v, nil
}

func (r *stubVentaRepo) FindByOfflineID(_ context.Context, offlineID string) (*model.Venta, error) {
	v, ok := r.offlineIdx[offlineID]
	if !ok {
		return nil, errors.New("not found")
	}
	return v, nil
}

func (r *stubVentaRepo) UpdateEstado(_ context.Context, id uuid.UUID, estado string) error {
	v, ok := r.ventas[id]
	if !ok {
		return errors.New("not found")
	}
	v.Estado = estado
	return nil
}

func (r *stubVentaRepo) NextTicketNumber(_ context.Context, _ *gorm.DB) (int, error) {
	r.ticketSeq++
	return r.ticketSeq, nil
}

func (r *stubVentaRepo) DB() *gorm.DB { return nil }

var _ repository.VentaRepository = (*stubVentaRepo)(nil)

// stubCajaService is a minimal CajaService stub for venta tests.
type stubCajaService struct {
	sesionAbierta bool
}

func (s *stubCajaService) Abrir(_ context.Context, _ uuid.UUID, _ dto.AbrirCajaRequest) (*dto.ReporteCajaResponse, error) {
	return nil, nil
}
func (s *stubCajaService) RegistrarMovimiento(_ context.Context, _ dto.MovimientoManualRequest) error {
	return nil
}
func (s *stubCajaService) Arqueo(_ context.Context, _ dto.ArqueoRequest) (*dto.ArqueoResponse, error) {
	return nil, nil
}
func (s *stubCajaService) ObtenerReporte(_ context.Context, _ uuid.UUID) (*dto.ReporteCajaResponse, error) {
	return nil, nil
}
func (s *stubCajaService) FindSesionAbierta(_ context.Context, _ uuid.UUID) error {
	if !s.sesionAbierta {
		return errors.New("No hay sesion de caja abierta")
	}
	return nil
}

var _ service.CajaService = (*stubCajaService)(nil)

// stubCajaRepo captures created movimientos for assertion.
type stubCajaRepo struct {
	movimientos []model.MovimientoCaja
}

func (r *stubCajaRepo) CreateSesion(_ context.Context, _ *model.SesionCaja) error { return nil }
func (r *stubCajaRepo) FindSesionAbiertaPorPDV(_ context.Context, _ int) (*model.SesionCaja, error) {
	return nil, nil
}
func (r *stubCajaRepo) FindSesionByID(_ context.Context, id uuid.UUID) (*model.SesionCaja, error) {
	return &model.SesionCaja{ID: id, Estado: "abierta"}, nil
}
func (r *stubCajaRepo) UpdateSesion(_ context.Context, _ *model.SesionCaja) error { return nil }
func (r *stubCajaRepo) CreateMovimiento(_ context.Context, m *model.MovimientoCaja) error {
	r.movimientos = append(r.movimientos, *m)
	return nil
}
func (r *stubCajaRepo) ListMovimientos(_ context.Context, _ uuid.UUID) ([]model.MovimientoCaja, error) {
	return r.movimientos, nil
}
func (r *stubCajaRepo) SumMovimientosByMetodo(_ context.Context, _ uuid.UUID) (map[string]decimal.Decimal, error) {
	return nil, nil
}

var _ repository.CajaRepository = (*stubCajaRepo)(nil)

// ── VentaService factory for tests ───────────────────────────────────────────

// We override DescontarStockTx in inventarioService to work with our in-memory stub.
// Since the TX is nil in tests, we rely on the stub's UpdateStockTx accepting nil *gorm.DB.

func buildVentaSvc(sesionAbierta bool) (service.VentaService, *stubVentaRepo, *stubProductoRepo, *stubCajaRepo) {
	productoRepo := newStubProductoRepo()
	ventaRepo := newStubVentaRepo()
	cajaRepo := &stubCajaRepo{}
	cajaSvc := &stubCajaService{sesionAbierta: sesionAbierta}
	inventarioSvc := service.NewInventarioService(productoRepo)

	svc := service.NewVentaService(ventaRepo, inventarioSvc, cajaSvc, cajaRepo, productoRepo, nil)
	return svc, ventaRepo, productoRepo, cajaRepo
}

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestRegistrarVenta_SinCajaAbierta(t *testing.T) {
	svc, _, productoRepo, _ := buildVentaSvc(false)
	p := seedProducto(productoRepo, "Cerveza 355ml", "1010101010101", 50, 5)

	sesionID := uuid.New()
	_, err := svc.RegistrarVenta(context.Background(), uuid.New(), dto.RegistrarVentaRequest{
		SesionCajaID: sesionID.String(),
		Items: []dto.ItemVentaRequest{
			{ProductoID: p.ID.String(), Cantidad: 1},
		},
		Pagos: []dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(100)}},
	})
	assert.ErrorContains(t, err, "No hay sesion de caja abierta")
}

func TestRegistrarVenta_PagoInsuficiente(t *testing.T) {
	svc, _, productoRepo, _ := buildVentaSvc(true)
	// PrecioVenta = 15.00 (from seedProducto helper), quantity=10, total=150
	p := seedProducto(productoRepo, "Agua 500ml", "2020202020202", 50, 5)
	// override price
	p.PrecioVenta = decimal.NewFromFloat(250)

	_, err := svc.RegistrarVenta(context.Background(), uuid.New(), dto.RegistrarVentaRequest{
		SesionCajaID: uuid.New().String(),
		Items: []dto.ItemVentaRequest{
			{ProductoID: p.ID.String(), Cantidad: 10},
		},
		Pagos: []dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(100)}},
	})
	assert.ErrorContains(t, err, "insuficiente")
}

func TestRegistrarVenta_StockInsuficiente(t *testing.T) {
	svc, ventaRepo, productoRepo, _ := buildVentaSvc(true)
	p := seedProducto(productoRepo, "Vino 750ml", "3030303030303", 2, 0) // only 2 in stock
	p.PrecioVenta = decimal.NewFromFloat(500)

	resp, err := svc.RegistrarVenta(context.Background(), uuid.New(), dto.RegistrarVentaRequest{
		SesionCajaID: uuid.New().String(),
		Items: []dto.ItemVentaRequest{
			{ProductoID: p.ID.String(), Cantidad: 5}, // request 5, only 2 available
		},
		Pagos: []dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(3000)}},
	})
	// Should succeed with conflicto_stock = true
	require.NoError(t, err)
	assert.True(t, resp.ConflictoStock)
	// Venta should be stored
	stored, err := ventaRepo.FindByID(context.Background(), uuid.MustParse(resp.ID))
	require.NoError(t, err)
	assert.True(t, stored.ConflictoStock)
}

func TestRegistrarVenta_PagoMixto(t *testing.T) {
	svc, ventaRepo, productoRepo, cajaRepo := buildVentaSvc(true)
	p := seedProducto(productoRepo, "Fernet 750ml", "4040404040404", 20, 3)
	p.PrecioVenta = decimal.NewFromFloat(1200)

	// total = 1200 × 2 = 2400; pago: 1000 efectivo + 1400 debito = 2400 exacto, vuelto = 0
	resp, err := svc.RegistrarVenta(context.Background(), uuid.New(), dto.RegistrarVentaRequest{
		SesionCajaID: uuid.New().String(),
		Items: []dto.ItemVentaRequest{
			{ProductoID: p.ID.String(), Cantidad: 2},
		},
		Pagos: []dto.PagoRequest{
			{Metodo: "efectivo", Monto: decimal.NewFromFloat(1000)},
			{Metodo: "debito", Monto: decimal.NewFromFloat(1400)},
		},
	})
	require.NoError(t, err)
	assert.Equal(t, "0", resp.Vuelto.String())
	assert.Len(t, resp.Pagos, 2)
	assert.Equal(t, "completada", resp.Estado)

	// Two movimientos de caja (one per metodo)
	assert.Len(t, cajaRepo.movimientos, 2)

	// Stock decremented
	stored, _ := ventaRepo.FindByID(context.Background(), uuid.MustParse(resp.ID))
	assert.Equal(t, decimal.NewFromFloat(2400).String(), stored.Total.String())
}

func TestRegistrarVenta_Vuelto(t *testing.T) {
	svc, _, productoRepo, _ := buildVentaSvc(true)
	p := seedProducto(productoRepo, "Gaseosa 1.5L", "5050505050505", 30, 5)
	p.PrecioVenta = decimal.NewFromFloat(200)

	// total=400, pago=500, vuelto=100
	resp, err := svc.RegistrarVenta(context.Background(), uuid.New(), dto.RegistrarVentaRequest{
		SesionCajaID: uuid.New().String(),
		Items:        []dto.ItemVentaRequest{{ProductoID: p.ID.String(), Cantidad: 2}},
		Pagos:        []dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(500)}},
	})
	require.NoError(t, err)
	assert.Equal(t, "100", resp.Vuelto.String())
}

func TestAnularVenta_RestaurarStock(t *testing.T) {
	svc, ventaRepo, productoRepo, cajaRepo := buildVentaSvc(true)
	p := seedProducto(productoRepo, "Whisky 750ml", "6060606060606", 10, 1)
	p.PrecioVenta = decimal.NewFromFloat(1800)
	sesionID := uuid.New()

	// Register a sale first
	resp, err := svc.RegistrarVenta(context.Background(), uuid.New(), dto.RegistrarVentaRequest{
		SesionCajaID: sesionID.String(),
		Items:        []dto.ItemVentaRequest{{ProductoID: p.ID.String(), Cantidad: 3}},
		Pagos:        []dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(6000)}},
	})
	require.NoError(t, err)
	assert.Equal(t, 7, productoRepo.productos[p.ID].StockActual) // 10 - 3 = 7

	// Now cancel it
	err = svc.AnularVenta(context.Background(), uuid.MustParse(resp.ID), "error de precio")
	require.NoError(t, err)

	// Stock should be restored
	assert.Equal(t, 10, productoRepo.productos[p.ID].StockActual)

	// Estado = anulada
	stored, _ := ventaRepo.FindByID(context.Background(), uuid.MustParse(resp.ID))
	assert.Equal(t, "anulada", stored.Estado)

	// An inverse movimiento should have been created (negative amount)
	var tieneAnulacion bool
	for _, m := range cajaRepo.movimientos {
		if m.Tipo == "anulacion" {
			tieneAnulacion = true
			assert.True(t, m.Monto.IsNegative())
		}
	}
	assert.True(t, tieneAnulacion)
}

func TestRegistrarVenta_ConDesarme(t *testing.T) {
	// When hijo stock is 0 but padre has units, auto-desarme should trigger
	productoRepo := newStubProductoRepo()
	ventaRepo := newStubVentaRepo()
	cajaRepo := &stubCajaRepo{}

	padre := seedProducto(productoRepo, "Pack 6 latas", "7070707070707", 3, 0) // 3 packs
	padre.PrecioVenta = decimal.NewFromFloat(600)
	hijo := seedProducto(productoRepo, "Lata 355ml", "8080808080808", 0, 0) // 0 stock
	hijo.PrecioVenta = decimal.NewFromFloat(120)

	// Register vinculo: 1 pack = 6 latas, desarme_auto = true
	vinculo := &model.ProductoHijo{
		ID:               uuid.New(),
		ProductoPadreID:  padre.ID,
		ProductoHijoID:   hijo.ID,
		UnidadesPorPadre: 6,
		DesarmeAuto:      true,
	}
	productoRepo.vinculos[vinculo.ID] = vinculo

	inventarioSvc := service.NewInventarioService(productoRepo)
	cajaSvc := &stubCajaService{sesionAbierta: true}
	svc := service.NewVentaService(ventaRepo, inventarioSvc, cajaSvc, cajaRepo, productoRepo, nil)

	// Sell 4 latas (hijo stock = 0, needs auto-desarme of 1 pack → 6 units)
	resp, err := svc.RegistrarVenta(context.Background(), uuid.New(), dto.RegistrarVentaRequest{
		SesionCajaID: uuid.New().String(),
		Items:        []dto.ItemVentaRequest{{ProductoID: hijo.ID.String(), Cantidad: 4}},
		Pagos:        []dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(1000)}},
	})
	require.NoError(t, err)
	assert.Equal(t, "completada", resp.Estado)

	// 1 pack disassembled → padre: 3-1=2; hijo: 0+6-4=2
	assert.Equal(t, 2, productoRepo.productos[padre.ID].StockActual)
	assert.Equal(t, 2, productoRepo.productos[hijo.ID].StockActual)
}

func TestRegistrarVenta_Idempotente_OfflineID(t *testing.T) {
	svc, ventaRepo, productoRepo, _ := buildVentaSvc(true)
	p := seedProducto(productoRepo, "Jugo 1L", "9090909090909", 20, 2)
	p.PrecioVenta = decimal.NewFromFloat(150)
	offlineID := uuid.New().String()

	req := dto.RegistrarVentaRequest{
		SesionCajaID: uuid.New().String(),
		Items:        []dto.ItemVentaRequest{{ProductoID: p.ID.String(), Cantidad: 1}},
		Pagos:        []dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(200)}},
		OfflineID:    &offlineID,
	}

	resp1, err := svc.RegistrarVenta(context.Background(), uuid.New(), req)
	require.NoError(t, err)

	// Second call with same offline_id should return same venta
	resp2, err := svc.RegistrarVenta(context.Background(), uuid.New(), req)
	require.NoError(t, err)
	assert.Equal(t, resp1.ID, resp2.ID)

	// Only one venta stored
	assert.Len(t, ventaRepo.ventas, 1)
}
