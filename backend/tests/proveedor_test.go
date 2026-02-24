package tests

import (
	"context"
	"errors"
	"strings"
	"testing"

	"blendpos/internal/model"
	"blendpos/internal/repository"
	"blendpos/internal/service"

	"blendpos/internal/dto"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ── In-memory ProveedorRepository stub ───────────────────────────────────────

type stubProveedorRepo struct {
	proveedores map[uuid.UUID]*model.Proveedor
	historial   []*model.HistorialPrecio
	db          *gorm.DB
}

func newStubProveedorRepo() *stubProveedorRepo {
	return &stubProveedorRepo{
		proveedores: make(map[uuid.UUID]*model.Proveedor),
	}
}

func (r *stubProveedorRepo) Create(_ context.Context, p *model.Proveedor) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	for _, existing := range r.proveedores {
		if existing.CUIT == p.CUIT {
			return errors.New("unique constraint violation")
		}
	}
	r.proveedores[p.ID] = p
	return nil
}

func (r *stubProveedorRepo) FindByID(_ context.Context, id uuid.UUID) (*model.Proveedor, error) {
	p, ok := r.proveedores[id]
	if !ok {
		return nil, errors.New("record not found")
	}
	return p, nil
}

func (r *stubProveedorRepo) List(_ context.Context) ([]model.Proveedor, error) {
	result := make([]model.Proveedor, 0, len(r.proveedores))
	for _, p := range r.proveedores {
		if p.Activo {
			result = append(result, *p)
		}
	}
	return result, nil
}

func (r *stubProveedorRepo) Update(_ context.Context, p *model.Proveedor) error {
	r.proveedores[p.ID] = p
	return nil
}

func (r *stubProveedorRepo) SoftDelete(_ context.Context, id uuid.UUID) error {
	p, ok := r.proveedores[id]
	if !ok {
		return errors.New("record not found")
	}
	p.Activo = false
	return nil
}

func (r *stubProveedorRepo) CreateHistorialPrecio(_ context.Context, h *model.HistorialPrecio) error {
	if h.ID == uuid.Nil {
		h.ID = uuid.New()
	}
	r.historial = append(r.historial, h)
	return nil
}

func (r *stubProveedorRepo) ListHistorialPorProducto(_ context.Context, productoID uuid.UUID) ([]model.HistorialPrecio, error) {
	var result []model.HistorialPrecio
	for _, h := range r.historial {
		if h.ProductoID == productoID {
			result = append(result, *h)
		}
	}
	return result, nil
}

func (r *stubProveedorRepo) ReplaceContactos(_ context.Context, proveedorID uuid.UUID, contactos []model.ContactoProveedor) error {
	p, ok := r.proveedores[proveedorID]
	if !ok {
		return errors.New("proveedor not found")
	}
	p.Contactos = contactos
	return nil
}

func (r *stubProveedorRepo) DB() *gorm.DB { return r.db }

var _ repository.ProveedorRepository = (*stubProveedorRepo)(nil)

// ── Helpers ───────────────────────────────────────────────────────────────────

func seedProveedor(repo *stubProveedorRepo, razonSocial, cuit string) *model.Proveedor {
	p := &model.Proveedor{
		ID:          uuid.New(),
		RazonSocial: razonSocial,
		CUIT:        cuit,
		Activo:      true,
	}
	repo.proveedores[p.ID] = p
	return p
}

func buildProveedorSvc() (service.ProveedorService, *stubProveedorRepo, *stubProductoRepo) {
	provRepo := newStubProveedorRepo()
	prodRepo := newStubProductoRepo()
	svc := service.NewProveedorService(provRepo, prodRepo)
	return svc, provRepo, prodRepo
}

// ── CRUD Tests ────────────────────────────────────────────────────────────────

func TestCrearProveedor(t *testing.T) {
	svc, _, _ := buildProveedorSvc()

	resp, err := svc.Crear(context.Background(), dto.CrearProveedorRequest{
		RazonSocial: "Distribuidora El Sol S.A.",
		CUIT:        "30-71234567-8",
	})

	require.NoError(t, err)
	assert.Equal(t, "Distribuidora El Sol S.A.", resp.RazonSocial)
	assert.True(t, resp.Activo)
	assert.NotEmpty(t, resp.ID)
}

func TestCrearProveedor_CUITDuplicado(t *testing.T) {
	svc, provRepo, _ := buildProveedorSvc()
	seedProveedor(provRepo, "Proveedor Existente", "30-99999999-9")

	_, err := svc.Crear(context.Background(), dto.CrearProveedorRequest{
		RazonSocial: "Otro Proveedor",
		CUIT:        "30-99999999-9",
	})

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "ya existe un proveedor con el CUIT")
}

func TestObtenerProveedorPorID(t *testing.T) {
	svc, provRepo, _ := buildProveedorSvc()
	p := seedProveedor(provRepo, "Lácteos Norte", "20-12345678-3")

	resp, err := svc.ObtenerPorID(context.Background(), p.ID)

	require.NoError(t, err)
	assert.Equal(t, "Lácteos Norte", resp.RazonSocial)
}

func TestObtenerProveedor_NoExiste(t *testing.T) {
	svc, _, _ := buildProveedorSvc()

	_, err := svc.ObtenerPorID(context.Background(), uuid.New())
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no encontrado")
}

func TestListarProveedores(t *testing.T) {
	svc, provRepo, _ := buildProveedorSvc()
	seedProveedor(provRepo, "Proveedor A", "20-11111111-1")
	seedProveedor(provRepo, "Proveedor B", "20-22222222-2")

	lista, err := svc.Listar(context.Background())

	require.NoError(t, err)
	assert.Len(t, lista, 2)
}

func TestActualizarProveedor(t *testing.T) {
	svc, provRepo, _ := buildProveedorSvc()
	p := seedProveedor(provRepo, "Proveedor Original", "20-33333333-3")
	tel := "2615551234"

	resp, err := svc.Actualizar(context.Background(), p.ID, dto.CrearProveedorRequest{
		RazonSocial: "Proveedor Actualizado",
		CUIT:        "20-33333333-3",
		Telefono:    &tel,
	})

	require.NoError(t, err)
	assert.Equal(t, "Proveedor Actualizado", resp.RazonSocial)
	assert.Equal(t, &tel, resp.Telefono)
}

func TestEliminarProveedor(t *testing.T) {
	svc, provRepo, _ := buildProveedorSvc()
	p := seedProveedor(provRepo, "Para Borrar", "20-44444444-4")

	err := svc.Eliminar(context.Background(), p.ID)
	require.NoError(t, err)

	// Debe retornar "no encontrado" para proveedores inactivos
	_, err = svc.ObtenerPorID(context.Background(), p.ID)
	assert.Error(t, err)
}

func TestEliminarProveedor_NoExiste(t *testing.T) {
	svc, _, _ := buildProveedorSvc()

	err := svc.Eliminar(context.Background(), uuid.New())
	assert.Error(t, err)
}

// ── ActualizarPreciosMasivo Tests ─────────────────────────────────────────────

func TestActualizarPreciosMasivo_Preview(t *testing.T) {
	svc, provRepo, prodRepo := buildProveedorSvc()

	prov := seedProveedor(provRepo, "Frutos del Mar S.A.", "30-55555555-5")

	// Seed productos del proveedor
	p1 := seedProducto(prodRepo, "Salmón 500g", "7790010000001", 10, 2)
	p1.PrecioCosto = decimal.NewFromFloat(800)
	p1.PrecioVenta = decimal.NewFromFloat(1200)
	p1.ProveedorID = &prov.ID
	prodRepo.productos[p1.ID] = p1

	p2 := seedProducto(prodRepo, "Trucha 300g", "7790010000002", 15, 3)
	p2.PrecioCosto = decimal.NewFromFloat(500)
	p2.PrecioVenta = decimal.NewFromFloat(750)
	p2.ProveedorID = &prov.ID
	prodRepo.productos[p2.ID] = p2

	resp, err := svc.ActualizarPreciosMasivo(context.Background(), prov.ID,
		dto.ActualizarPreciosMasivoRequest{
			Porcentaje: decimal.NewFromFloat(10),
			Preview:    true,
		},
	)

	require.NoError(t, err)
	assert.Equal(t, 2, resp.ProductosAfectados)
	assert.Len(t, resp.Preview, 2)
	// Verificar que los precios en BD no cambiaron (modo preview)
	assert.Equal(t, decimal.NewFromFloat(800), prodRepo.productos[p1.ID].PrecioCosto)
	assert.Equal(t, decimal.NewFromFloat(500), prodRepo.productos[p2.ID].PrecioCosto)
}

func TestActualizarPreciosMasivo_PreviewCalculos(t *testing.T) {
	svc, provRepo, prodRepo := buildProveedorSvc()
	prov := seedProveedor(provRepo, "Distribuidora Test", "30-66666666-6")

	prod := seedProducto(prodRepo, "Producto Test", "7790020000001", 5, 1)
	prod.PrecioCosto = decimal.NewFromFloat(100)
	prod.PrecioVenta = decimal.NewFromFloat(150)
	prod.ProveedorID = &prov.ID
	prodRepo.productos[prod.ID] = prod

	resp, err := svc.ActualizarPreciosMasivo(context.Background(), prov.ID,
		dto.ActualizarPreciosMasivoRequest{
			Porcentaje: decimal.NewFromFloat(15),
			Preview:    true,
		},
	)

	require.NoError(t, err)
	require.Len(t, resp.Preview, 1)
	item := resp.Preview[0]
	// Costo nuevo = 100 * 1.15 = 115
	assert.Equal(t, decimal.NewFromFloat(115).String(), item.PrecioCostoNuevo.String())
	// DiferenciaCosto = 115 - 100 = 15
	assert.Equal(t, decimal.NewFromFloat(15).String(), item.DiferenciaCosto.String())
	// Venta no cambia sin RecalcularVenta
	assert.Equal(t, decimal.NewFromFloat(150).String(), item.PrecioVentaNuevo.String())
}

func TestActualizarPreciosMasivo_ConRecalculoVenta(t *testing.T) {
	svc, provRepo, prodRepo := buildProveedorSvc()
	prov := seedProveedor(provRepo, "Distribuidora Test 2", "30-77777777-7")

	prod := seedProducto(prodRepo, "Prod ReCalculate", "7790030000001", 5, 1)
	prod.PrecioCosto = decimal.NewFromFloat(100)
	prod.PrecioVenta = decimal.NewFromFloat(150)
	prod.ProveedorID = &prov.ID
	prodRepo.productos[prod.ID] = prod

	resp, err := svc.ActualizarPreciosMasivo(context.Background(), prov.ID,
		dto.ActualizarPreciosMasivoRequest{
			Porcentaje:      decimal.NewFromFloat(10), // costo: 100 → 110
			RecalcularVenta: true,
			MargenDefault:   decimal.NewFromFloat(50), // venta = 110 * 1.5 = 165
			Preview:         true,
		},
	)

	require.NoError(t, err)
	require.Len(t, resp.Preview, 1)
	assert.Equal(t, decimal.NewFromFloat(110).String(), resp.Preview[0].PrecioCostoNuevo.String())
	assert.Equal(t, decimal.NewFromFloat(165).String(), resp.Preview[0].PrecioVentaNuevo.String())
}

func TestActualizarPreciosMasivo_Aplicar(t *testing.T) {
	svc, provRepo, prodRepo := buildProveedorSvc()
	prov := seedProveedor(provRepo, "Distribuidora Aplicar", "30-88888888-8")

	prod := seedProducto(prodRepo, "Prod Aplicar", "7790040000001", 5, 1)
	prod.PrecioCosto = decimal.NewFromFloat(200)
	prod.PrecioVenta = decimal.NewFromFloat(300)
	prod.ProveedorID = &prov.ID
	prodRepo.productos[prod.ID] = prod

	resp, err := svc.ActualizarPreciosMasivo(context.Background(), prov.ID,
		dto.ActualizarPreciosMasivoRequest{
			Porcentaje: decimal.NewFromFloat(20), // costo: 200 → 240
			Preview:    false,
		},
	)

	require.NoError(t, err)
	assert.Equal(t, 1, resp.ProductosAfectados)
	assert.Nil(t, resp.Preview) // no preview en modo aplicar
	// Los precios en BD deben haberse actualizado
	assert.Equal(t, decimal.NewFromFloat(240).String(), prodRepo.productos[prod.ID].PrecioCosto.String())
}

func TestActualizarPreciosMasivo_ProveedorNoExiste(t *testing.T) {
	svc, _, _ := buildProveedorSvc()

	_, err := svc.ActualizarPreciosMasivo(context.Background(), uuid.New(),
		dto.ActualizarPreciosMasivoRequest{
			Porcentaje: decimal.NewFromFloat(10),
			Preview:    true,
		},
	)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no encontrado")
}

func TestActualizarPreciosMasivo_SinProductos(t *testing.T) {
	svc, provRepo, _ := buildProveedorSvc()
	prov := seedProveedor(provRepo, "Proveedor Sin Productos", "30-99990000-0")

	resp, err := svc.ActualizarPreciosMasivo(context.Background(), prov.ID,
		dto.ActualizarPreciosMasivoRequest{
			Porcentaje: decimal.NewFromFloat(10),
			Preview:    true,
		},
	)

	require.NoError(t, err)
	assert.Equal(t, 0, resp.ProductosAfectados)
	assert.Empty(t, resp.Preview)
}

// ── ImportarCSV Tests ─────────────────────────────────────────────────────────

func TestImportarCSV_Exitoso(t *testing.T) {
	svc, provRepo, _ := buildProveedorSvc()
	prov := seedProveedor(provRepo, "Proveedor CSV", "20-55551234-0")

	csvContent := "codigo_barras,nombre,precio_costo,precio_venta,unidades_por_bulto,categoria\n" +
		"7790050000001,Producto Nuevo A,50.00,75.00,12,bebidas\n" +
		"7790050000002,Producto Nuevo B,100.00,150.00,6,snacks\n"

	resp, err := svc.ImportarCSV(context.Background(), prov.ID, []byte(csvContent))

	require.NoError(t, err)
	assert.Equal(t, 2, resp.TotalFilas)
	assert.Equal(t, 2, resp.Procesadas)
	assert.Equal(t, 2, resp.Creadas)
	assert.Equal(t, 0, resp.Actualizadas)
	assert.Equal(t, 0, resp.Errores)
}

func TestImportarCSV_Upsert(t *testing.T) {
	svc, provRepo, prodRepo := buildProveedorSvc()
	prov := seedProveedor(provRepo, "Proveedor Upsert", "20-66661234-0")

	// Pre-existente
	existing := seedProducto(prodRepo, "Producto Existente", "7790060000001", 10, 2)
	existing.PrecioCosto = decimal.NewFromFloat(80)
	existing.PrecioVenta = decimal.NewFromFloat(120)
	prodRepo.productos[existing.ID] = existing

	csvContent := "codigo_barras,nombre,precio_costo,precio_venta\n" +
		"7790060000001,Producto Existente Actualizado,90.00,135.00\n" + // update
		"7790060000002,Producto Nuevo,50.00,75.00\n" // create

	resp, err := svc.ImportarCSV(context.Background(), prov.ID, []byte(csvContent))

	require.NoError(t, err)
	assert.Equal(t, 2, resp.TotalFilas)
	assert.Equal(t, 1, resp.Actualizadas)
	assert.Equal(t, 1, resp.Creadas)
	assert.Equal(t, 0, resp.Errores)
	// Precio debe haber cambiado — usar .Equal() para comparar decimals independientemente
	// de su representación interna (90 vs 9000e-2 son matemáticamente equivalentes)
	assert.True(t, decimal.NewFromFloat(90).Equal(prodRepo.productos[existing.ID].PrecioCosto),
		"PrecioCosto esperado 90.00, obtenido: %s", prodRepo.productos[existing.ID].PrecioCosto.String())
}

func TestImportarCSV_FilaConError(t *testing.T) {
	svc, provRepo, _ := buildProveedorSvc()
	prov := seedProveedor(provRepo, "Proveedor Errores", "20-77771234-0")

	csvContent := "codigo_barras,nombre,precio_costo,precio_venta\n" +
		"7790070000001,Producto OK,50.00,75.00\n" +
		",Nombre sin barcode,50.00,75.00\n" + // fila inválida: barcode vacío
		"7790070000003,Precio inválido,abc,75.00\n" + // fila inválida: precio no numérico
		"7790070000004,Venta menor a costo,100.00,50.00\n" // fila inválida: venta < costo

	resp, err := svc.ImportarCSV(context.Background(), prov.ID, []byte(csvContent))

	require.NoError(t, err)
	assert.Equal(t, 4, resp.TotalFilas)
	assert.Equal(t, 1, resp.Procesadas)
	assert.Equal(t, 3, resp.Errores)
	assert.Len(t, resp.DetalleErrores, 3)
}

func TestImportarCSV_ArchivoBinarioRechazado(t *testing.T) {
	svc, provRepo, _ := buildProveedorSvc()
	prov := seedProveedor(provRepo, "Proveedor Binario", "20-88881234-0")

	// Firma ZIP (XLSX)
	xlsxHeader := []byte{0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00}

	_, err := svc.ImportarCSV(context.Background(), prov.ID, xlsxHeader)

	assert.Error(t, err)
	assert.Contains(t, strings.ToLower(err.Error()), "inválido")
}

func TestImportarCSV_EncabezadoIncorrecto(t *testing.T) {
	svc, provRepo, _ := buildProveedorSvc()
	prov := seedProveedor(provRepo, "Proveedor Encabezado", "20-99991234-0")

	csvContent := "columna1,columna2,columna3\n1,2,3\n"

	_, err := svc.ImportarCSV(context.Background(), prov.ID, []byte(csvContent))

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "precio")
}

func TestImportarCSV_ProveedorNoExiste(t *testing.T) {
	svc, _, _ := buildProveedorSvc()

	csvContent := "codigo_barras,nombre,precio_costo,precio_venta\n7790000000001,Prod,50,75\n"

	_, err := svc.ImportarCSV(context.Background(), uuid.New(), []byte(csvContent))

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no encontrado")
}

func TestImportarCSV_ArchivoVacio(t *testing.T) {
	svc, provRepo, _ := buildProveedorSvc()
	prov := seedProveedor(provRepo, "Proveedor Vacío", "20-11110000-0")

	_, err := svc.ImportarCSV(context.Background(), prov.ID, []byte{})

	assert.Error(t, err)
}
