package tests

// facturacion_test.go
// Tests for Phase 5: facturacion_service, PDF generation, worker retry logic.
// Criteria:
//   - T-5.1: PDF generado con gofpdf, layout completo (AC-06.3)
//   - T-5.2: Worker encula POST a AFIP Sidecar con retry, CAE almacenado, venta no bloqueada
//   - AC-06.4: ObtenerPDFPath retorna ruta del PDF generado
//   - AC-06.2: AFIP falla → estado "pendiente", observaciones registradas

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"blendpos/internal/dto"
	"blendpos/internal/infra"
	"blendpos/internal/model"
	"blendpos/internal/repository"
	"blendpos/internal/service"
	"blendpos/internal/worker"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ── In-memory ComprobanteRepository stub ─────────────────────────────────────

type stubComprobanteRepo struct {
	comprobantes map[uuid.UUID]*model.Comprobante
	byVenta      map[uuid.UUID]*model.Comprobante
}

func newStubComprobanteRepo() *stubComprobanteRepo {
	return &stubComprobanteRepo{
		comprobantes: make(map[uuid.UUID]*model.Comprobante),
		byVenta:      make(map[uuid.UUID]*model.Comprobante),
	}
}

func (r *stubComprobanteRepo) Create(_ context.Context, c *model.Comprobante) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	c.CreatedAt = time.Now()
	cloned := *c
	r.comprobantes[c.ID] = &cloned
	r.byVenta[c.VentaID] = r.comprobantes[c.ID]
	return nil
}

func (r *stubComprobanteRepo) FindByVentaID(_ context.Context, ventaID uuid.UUID) (*model.Comprobante, error) {
	c, ok := r.byVenta[ventaID]
	if !ok {
		return nil, errors.New("record not found")
	}
	return c, nil
}

func (r *stubComprobanteRepo) FindByID(_ context.Context, id uuid.UUID) (*model.Comprobante, error) {
	c, ok := r.comprobantes[id]
	if !ok {
		return nil, errors.New("record not found")
	}
	return c, nil
}

func (r *stubComprobanteRepo) Update(_ context.Context, c *model.Comprobante) error {
	cloned := *c
	r.comprobantes[c.ID] = &cloned
	r.byVenta[c.VentaID] = r.comprobantes[c.ID]
	return nil
}

func (r *stubComprobanteRepo) ListPendingRetries(_ context.Context, _ time.Time, limit int) ([]model.Comprobante, error) {
	var results []model.Comprobante
	for _, c := range r.comprobantes {
		if c.Estado == "pendiente" && c.NextRetryAt != nil {
			results = append(results, *c)
		}
		if len(results) >= limit {
			break
		}
	}
	return results, nil
}

// compile-time interface check
var _ repository.ComprobanteRepository = (*stubComprobanteRepo)(nil)

// ── In-memory VentaRepository stub (minimal for facturacion worker) ───────────

type stubVentaRepoFacturacion struct {
	ventas map[uuid.UUID]*model.Venta
}

func newStubVentaRepoFacturacion() *stubVentaRepoFacturacion {
	return &stubVentaRepoFacturacion{ventas: make(map[uuid.UUID]*model.Venta)}
}

func (r *stubVentaRepoFacturacion) Create(_ context.Context, _ *gorm.DB, v *model.Venta) error {
	if v.ID == uuid.Nil {
		v.ID = uuid.New()
	}
	r.ventas[v.ID] = v
	return nil
}
func (r *stubVentaRepoFacturacion) FindByID(_ context.Context, id uuid.UUID) (*model.Venta, error) {
	v, ok := r.ventas[id]
	if !ok {
		return nil, errors.New("venta not found")
	}
	return v, nil
}
func (r *stubVentaRepoFacturacion) FindByOfflineID(_ context.Context, _ string) (*model.Venta, error) {
	return nil, errors.New("not found")
}
func (r *stubVentaRepoFacturacion) UpdateEstado(_ context.Context, id uuid.UUID, estado string) error {
	if v, ok := r.ventas[id]; ok {
		v.Estado = estado
	}
	return nil
}
func (r *stubVentaRepoFacturacion) NextTicketNumber(_ context.Context, _ *gorm.DB) (int, error) {
	return 1, nil
}
func (r *stubVentaRepoFacturacion) List(_ context.Context, _ dto.VentaFilter) ([]model.Venta, int64, error) {
	return nil, 0, nil
}
func (r *stubVentaRepoFacturacion) DB() *gorm.DB { return nil }

// compile-time interface check
var _ repository.VentaRepository = (*stubVentaRepoFacturacion)(nil)

// ── helpers ───────────────────────────────────────────────────────────────────

func buildVentaConItems() *model.Venta {
	producto := &model.Producto{
		ID:     uuid.New(),
		Nombre: "Coca-Cola 354ml",
	}
	return &model.Venta{
		ID:           uuid.New(),
		NumeroTicket: 42,
		Total:        decimal.NewFromFloat(1500),
		Subtotal:     decimal.NewFromFloat(1500),
		Estado:       "completada",
		CreatedAt:    time.Now(),
		Items: []model.VentaItem{
			{
				ID:             uuid.New(),
				ProductoID:     producto.ID,
				Producto:       producto,
				Cantidad:       2,
				PrecioUnitario: decimal.NewFromFloat(750),
				Subtotal:       decimal.NewFromFloat(1500),
			},
		},
		Pagos: []model.VentaPago{
			{
				ID:     uuid.New(),
				Metodo: "efectivo",
				Monto:  decimal.NewFromFloat(1500),
			},
		},
	}
}

func mustJSON(v interface{}) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}

// ── FacturacionService tests ──────────────────────────────────────────────────

func TestObtenerComprobante_Existente(t *testing.T) {
	repo := newStubComprobanteRepo()
	svc := service.NewFacturacionService(repo, nil)

	ventaID := uuid.New()
	comp := &model.Comprobante{
		VentaID:    ventaID,
		Tipo:       "ticket_interno",
		MontoTotal: decimal.NewFromFloat(1500),
		Estado:     "emitido",
	}
	require.NoError(t, repo.Create(context.Background(), comp))

	resp, err := svc.ObtenerComprobante(context.Background(), ventaID)

	require.NoError(t, err)
	assert.Equal(t, "emitido", resp.Estado)
	assert.Equal(t, "ticket_interno", resp.Tipo)
	assert.True(t, decimal.NewFromFloat(1500).Equal(resp.MontoTotal))
}

func TestObtenerComprobante_NoExiste(t *testing.T) {
	repo := newStubComprobanteRepo()
	svc := service.NewFacturacionService(repo, nil)

	_, err := svc.ObtenerComprobante(context.Background(), uuid.New())

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "comprobante no encontrado")
}

func TestObtenerPDFPath_Disponible(t *testing.T) {
	repo := newStubComprobanteRepo()
	svc := service.NewFacturacionService(repo, nil)

	pdfPath := "/tmp/ticket_42.pdf"
	comp := &model.Comprobante{
		VentaID:    uuid.New(),
		Tipo:       "ticket_interno",
		MontoTotal: decimal.NewFromFloat(1500),
		Estado:     "emitido",
		PDFPath:    &pdfPath,
	}
	require.NoError(t, repo.Create(context.Background(), comp))

	path, err := svc.ObtenerPDFPath(context.Background(), comp.ID)

	require.NoError(t, err)
	assert.Equal(t, pdfPath, path)
}

func TestObtenerPDFPath_NoPDF(t *testing.T) {
	repo := newStubComprobanteRepo()
	svc := service.NewFacturacionService(repo, nil)

	comp := &model.Comprobante{
		VentaID:    uuid.New(),
		Tipo:       "ticket_interno",
		MontoTotal: decimal.NewFromFloat(1500),
		Estado:     "pendiente",
		PDFPath:    nil,
	}
	require.NoError(t, repo.Create(context.Background(), comp))

	_, err := svc.ObtenerPDFPath(context.Background(), comp.ID)

	assert.Error(t, err)
	assert.True(t, strings.Contains(strings.ToLower(err.Error()), "pdf no disponible"))
}

// ── PDF Generation tests (AC-06.3) ───────────────────────────────────────────

func TestGenerateTicketPDF_Exitoso(t *testing.T) {
	tmpDir := t.TempDir()
	venta := buildVentaConItems()

	pdfPath, err := infra.GenerateTicketPDF(venta, tmpDir)

	require.NoError(t, err)
	assert.NotEmpty(t, pdfPath)

	// File must exist and have content
	info, statErr := os.Stat(pdfPath)
	require.NoError(t, statErr)
	assert.Greater(t, info.Size(), int64(100), "PDF should have content > 100 bytes")
}

func TestGenerateTicketPDF_NombreArchivo(t *testing.T) {
	tmpDir := t.TempDir()
	venta := buildVentaConItems()
	venta.NumeroTicket = 99

	pdfPath, err := infra.GenerateTicketPDF(venta, tmpDir)

	require.NoError(t, err)
	assert.Equal(t, "ticket_99.pdf", filepath.Base(pdfPath))
}

func TestGenerateTicketPDF_ConDescuento(t *testing.T) {
	tmpDir := t.TempDir()
	venta := buildVentaConItems()
	venta.DescuentoTotal = decimal.NewFromFloat(100)
	venta.Total = decimal.NewFromFloat(1400)

	pdfPath, err := infra.GenerateTicketPDF(venta, tmpDir)

	require.NoError(t, err)
	_, statErr := os.Stat(pdfPath)
	assert.NoError(t, statErr)
}

// ── FacturacionWorker tests (AC-06.2, AC-06.3, RF-19) ────────────────────────

func TestFacturacionWorker_AFIPFalla_EstadoPendiente(t *testing.T) {
	// Given: AFIP sidecar unreachable
	comprobanteRepo := newStubComprobanteRepo()
	ventaRepo := newStubVentaRepoFacturacion()
	tmpDir := t.TempDir()

	venta := buildVentaConItems()
	ventaRepo.ventas[venta.ID] = venta

	// Use client pointing to a port nothing listens on
	afipClient := infra.NewAFIPClient("http://localhost:19999")
	cb := infra.NewCircuitBreaker(infra.DefaultCBConfig())
	w := worker.NewFacturacionWorker(afipClient, cb, comprobanteRepo, ventaRepo, nil, tmpDir, "")

	payload := worker.FacturacionJobPayload{VentaID: venta.ID.String()}
	w.Process(context.Background(), mustJSON(payload))

	// Comprobante should be created with LastError about AFIP failure
	comp, err := comprobanteRepo.FindByVentaID(context.Background(), venta.ID)
	require.NoError(t, err)
	assert.Equal(t, "pendiente", comp.Estado)
	assert.NotNil(t, comp.LastError)
	assert.Greater(t, comp.RetryCount, 0)
}

func TestFacturacionWorker_GeneraPDF_AunSinAFIP(t *testing.T) {
	// Given: AFIP fails, PDF should still be generated (AC-06.3)
	comprobanteRepo := newStubComprobanteRepo()
	ventaRepo := newStubVentaRepoFacturacion()
	tmpDir := t.TempDir()

	venta := buildVentaConItems()
	ventaRepo.ventas[venta.ID] = venta

	afipClient := infra.NewAFIPClient("http://localhost:19999")
	cb := infra.NewCircuitBreaker(infra.DefaultCBConfig())
	w := worker.NewFacturacionWorker(afipClient, cb, comprobanteRepo, ventaRepo, nil, tmpDir, "")
	w.Process(context.Background(), mustJSON(worker.FacturacionJobPayload{VentaID: venta.ID.String()}))

	comp, err := comprobanteRepo.FindByVentaID(context.Background(), venta.ID)
	require.NoError(t, err)

	// PDF generated even when AFIP failed
	require.NotNil(t, comp.PDFPath, "PDF path should be set even when AFIP fails")
	_, statErr := os.Stat(*comp.PDFPath)
	assert.NoError(t, statErr, "PDF file should exist on disk")
}

func TestFacturacionWorker_VentaIDInvalido_NoPanic(t *testing.T) {
	// Given: invalid venta_id in job payload
	comprobanteRepo := newStubComprobanteRepo()
	ventaRepo := newStubVentaRepoFacturacion()

	afipClient := infra.NewAFIPClient("http://localhost:19999")
	cb := infra.NewCircuitBreaker(infra.DefaultCBConfig())
	w := worker.NewFacturacionWorker(afipClient, cb, comprobanteRepo, ventaRepo, nil, t.TempDir(), "")

	payload := worker.FacturacionJobPayload{VentaID: "not-a-valid-uuid"}
	assert.NotPanics(t, func() {
		w.Process(context.Background(), mustJSON(payload))
	})
	// No comprobante should have been created
	assert.Empty(t, comprobanteRepo.comprobantes)
}
