package tests

// Suite de tests INTEGRALES del cierre de caja.
//
// A diferencia de caja_test.go (que ataca al CajaService con movimientos
// pre-cargados en memoria), estos tests usan el VentaService REAL para
// generar los movimientos — exactamente como pasa en producción.
//
// Cubren especialmente el bug crónico de "siempre da faltante" cuya causa
// era que el movimiento de caja se grababa con el monto recibido (incluye
// vuelto) en lugar del monto neto que queda en caja.

import (
	"context"
	"testing"

	"blendpos/internal/dto"
	"blendpos/internal/service"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// integratedSetup arma VentaService + CajaService COMPARTIENDO el mismo
// repositorio de caja, para que los movimientos creados por ventas sean
// visibles cuando se hace el arqueo.
type integratedSetup struct {
	ventaSvc     service.VentaService
	cajaSvc      service.CajaService
	cajaRepo     *fullCajaRepo
	productoRepo *stubProductoRepo
}

func newIntegratedSetup() *integratedSetup {
	productoRepo := newStubProductoRepo()
	ventaRepo := newStubVentaRepo()
	cajaRepo := newFullCajaRepo()
	// stubCajaService sólo necesita avisar que hay sesión abierta para que
	// VentaService permita registrar ventas. El arqueo real lo hace cajaSvc.
	cajaSvcStub := &stubCajaService{sesionAbierta: true}
	cajaSvc := service.NewCajaService(cajaRepo)
	inventarioSvc := service.NewInventarioService(productoRepo, nil)

	ventaSvc := service.NewVentaService(ventaRepo, inventarioSvc, cajaSvcStub, cajaRepo, productoRepo, nil, nil, nil)

	return &integratedSetup{
		ventaSvc:     ventaSvc,
		cajaSvc:      cajaSvc,
		cajaRepo:     cajaRepo,
		productoRepo: productoRepo,
	}
}

// abrirSesion abre una caja y devuelve el sesionID parseado.
func (s *integratedSetup) abrirSesion(t *testing.T, pdv int, montoInicial float64) uuid.UUID {
	t.Helper()
	resp, err := s.cajaSvc.Abrir(context.Background(), uuid.New(), dto.AbrirCajaRequest{
		PuntoDeVenta: pdv,
		MontoInicial: decimal.NewFromFloat(montoInicial),
	})
	require.NoError(t, err)
	return uuid.MustParse(resp.SesionCajaID)
}

// registrarVenta es un helper conciso para crear una venta con producto único.
func (s *integratedSetup) registrarVenta(t *testing.T, sesionID uuid.UUID, prod *struct{ ID uuid.UUID }, cantidad int, precioUnit float64, pagos []dto.PagoRequest) {
	t.Helper()
	// usa un producto del repo
	require.NotNil(t, prod)
	// El precio del producto ya está sembrado, así que la venta usa ese precio.
	_, err := s.ventaSvc.RegistrarVenta(context.Background(), uuid.New(), dto.RegistrarVentaRequest{
		SesionCajaID: sesionID.String(),
		Items: []dto.ItemVentaRequest{
			{ProductoID: prod.ID.String(), Cantidad: cantidad},
		},
		Pagos: pagos,
	})
	_ = precioUnit
	require.NoError(t, err)
}

// arquear cierra la caja con la declaración de efectivo dada y devuelve el reporte.
func (s *integratedSetup) arquear(t *testing.T, sesionID uuid.UUID, declaradoEfectivo float64, obs ...string) *dto.ArqueoResponse {
	t.Helper()
	req := dto.ArqueoRequest{
		SesionCajaID: sesionID.String(),
		Declaracion:  dto.DeclaracionArqueo{Efectivo: decimal.NewFromFloat(declaradoEfectivo)},
	}
	if len(obs) > 0 {
		o := obs[0]
		req.Observaciones = &o
	}
	resp, err := s.cajaSvc.Arqueo(context.Background(), req, nil)
	require.NoError(t, err)
	return resp
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// E1: Caja abierta sin ventas. Declarar exactamente el monto inicial → cuadra.
func TestCierre_SinVentas(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 101, 5000)

	resp := s.arquear(t, sesionID, 5000)

	assert.Equal(t, "5000", resp.MontoEsperado.Efectivo.String(), "esperado debe ser solo el monto inicial")
	assert.Equal(t, "0", resp.Desvio.Monto.String(), "no debe haber desvío")
	assert.Equal(t, "normal", resp.Desvio.Clasificacion)
}

// E2: Venta en efectivo SIN vuelto (pago exacto). Caja = inicial + venta.
func TestCierre_VentaEfectivoSinVuelto(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 102, 5000)

	p := seedProducto(s.productoRepo, "Producto A", "9990000000001", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(1000)

	// Venta de $1000 paga con $1000 exactos → vuelto = 0
	s.registrarVenta(t, sesionID, &struct{ ID uuid.UUID }{ID: p.ID}, 1, 1000,
		[]dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(1000)}})

	resp := s.arquear(t, sesionID, 6000)

	assert.Equal(t, "6000", resp.MontoEsperado.Efectivo.String(), "5000 inicial + 1000 venta")
	assert.Equal(t, "0", resp.Desvio.Monto.String())
}

// E3: BUG REPORTADO — Venta en efectivo CON vuelto.
// Antes del fix esto daba un "faltante" igual al vuelto.
func TestCierre_VentaEfectivoConVuelto(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 103, 5000)

	p := seedProducto(s.productoRepo, "Producto B", "9990000000002", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(1000)

	// Venta $1000, paga con $1500 → vuelto = $500 (sale de caja físicamente)
	// Caja al cierre debe tener: 5000 + 1500 - 500 = 6000
	s.registrarVenta(t, sesionID, &struct{ ID uuid.UUID }{ID: p.ID}, 1, 1000,
		[]dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(1500)}})

	resp := s.arquear(t, sesionID, 6000)

	assert.Equal(t, "6000", resp.MontoEsperado.Efectivo.String(),
		"el esperado debe ser el efectivo NETO en caja, no lo que el cliente entregó")
	assert.Equal(t, "0", resp.Desvio.Monto.String(),
		"no debe haber faltante artificial por el vuelto")
}

// E4: Múltiples ventas con vueltos. Los vueltos NO deben acumularse como faltante.
func TestCierre_MultiplesVentasConVueltos(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 104, 5000)

	p := seedProducto(s.productoRepo, "Producto C", "9990000000003", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(100)

	// 3 ventas distintas de 1 unidad ($100) pagadas con billete grande
	// Venta 1: $100 paga con $500 → vuelto $400 → caja +$100
	// Venta 2: $100 paga con $200 → vuelto $100 → caja +$100
	// Venta 3: $100 paga con $1000 → vuelto $900 → caja +$100
	// Total esperado en caja: 5000 + 300 = 5300
	for _, recibido := range []float64{500, 200, 1000} {
		s.registrarVenta(t, sesionID, &struct{ ID uuid.UUID }{ID: p.ID}, 1, 100,
			[]dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(recibido)}})
	}

	resp := s.arquear(t, sesionID, 5300)

	assert.Equal(t, "5300", resp.MontoEsperado.Efectivo.String())
	assert.Equal(t, "0", resp.Desvio.Monto.String())
}

// E5: Pagos mixtos sin vuelto. Cada método se acumula por separado.
func TestCierre_PagosMixtosSinVuelto(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 105, 3000)

	p := seedProducto(s.productoRepo, "Producto D", "9990000000004", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(2400)

	// Venta $2400: $1000 efectivo + $1400 débito = $2400 exacto → vuelto 0
	s.registrarVenta(t, sesionID, &struct{ ID uuid.UUID }{ID: p.ID}, 1, 2400,
		[]dto.PagoRequest{
			{Metodo: "efectivo", Monto: decimal.NewFromFloat(1000)},
			{Metodo: "debito", Monto: decimal.NewFromFloat(1400)},
		})

	// Para llegar al arqueo necesitamos declarar TODOS los métodos
	req := dto.ArqueoRequest{
		SesionCajaID: sesionID.String(),
		Declaracion: dto.DeclaracionArqueo{
			Efectivo: decimal.NewFromFloat(4000), // 3000 + 1000
			Debito:   decimal.NewFromFloat(1400),
		},
	}
	resp, err := s.cajaSvc.Arqueo(context.Background(), req, nil)
	require.NoError(t, err)

	assert.Equal(t, "4000", resp.MontoEsperado.Efectivo.String())
	assert.Equal(t, "1400", resp.MontoEsperado.Debito.String())
	assert.Equal(t, "0", resp.Desvio.Monto.String())
}

// E6: Pagos mixtos CON vuelto (el vuelto se descuenta del efectivo).
func TestCierre_PagosMixtosConVuelto(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 106, 3000)

	p := seedProducto(s.productoRepo, "Producto E", "9990000000005", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(1000)

	// Venta $1000: $500 efectivo + $700 débito = $1200 → vuelto $200 (en efectivo)
	// Efectivo NETO en caja por esta venta: 500 - 200 = 300
	// Caja al cierre: 3000 (inicial) + 300 = 3300
	// Débito: 700
	s.registrarVenta(t, sesionID, &struct{ ID uuid.UUID }{ID: p.ID}, 1, 1000,
		[]dto.PagoRequest{
			{Metodo: "efectivo", Monto: decimal.NewFromFloat(500)},
			{Metodo: "debito", Monto: decimal.NewFromFloat(700)},
		})

	req := dto.ArqueoRequest{
		SesionCajaID: sesionID.String(),
		Declaracion: dto.DeclaracionArqueo{
			Efectivo: decimal.NewFromFloat(3300),
			Debito:   decimal.NewFromFloat(700),
		},
	}
	resp, err := s.cajaSvc.Arqueo(context.Background(), req, nil)
	require.NoError(t, err)

	assert.Equal(t, "3300", resp.MontoEsperado.Efectivo.String(),
		"efectivo neto en caja debe ser 3000 + 500 - 200")
	assert.Equal(t, "700", resp.MontoEsperado.Debito.String())
	assert.Equal(t, "0", resp.Desvio.Monto.String())
}

// E7: Pago solo con tarjeta — efectivo en caja no se mueve.
func TestCierre_SoloTarjeta(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 107, 2000)

	p := seedProducto(s.productoRepo, "Producto F", "9990000000006", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(1500)

	s.registrarVenta(t, sesionID, &struct{ ID uuid.UUID }{ID: p.ID}, 1, 1500,
		[]dto.PagoRequest{{Metodo: "credito", Monto: decimal.NewFromFloat(1500)}})

	req := dto.ArqueoRequest{
		SesionCajaID: sesionID.String(),
		Declaracion: dto.DeclaracionArqueo{
			Efectivo: decimal.NewFromFloat(2000), // sin cambios
			Credito:  decimal.NewFromFloat(1500),
		},
	}
	resp, err := s.cajaSvc.Arqueo(context.Background(), req, nil)
	require.NoError(t, err)

	assert.Equal(t, "2000", resp.MontoEsperado.Efectivo.String())
	assert.Equal(t, "1500", resp.MontoEsperado.Credito.String())
	assert.Equal(t, "0", resp.Desvio.Monto.String())
}

// E8: Pago con tarjeta por MÁS del total (vuelto sin efectivo) → debe RECHAZARSE.
// El vuelto solo puede devolverse en efectivo; en tarjeta no es semánticamente posible.
func TestCierre_VueltoSinEfectivo_DebeRechazar(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 108, 1000)

	p := seedProducto(s.productoRepo, "Producto G", "9990000000007", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(1000)

	// Intentar venta $1000 pagando $1500 en débito (vuelto $500 sin pago en efectivo)
	_, err := s.ventaSvc.RegistrarVenta(context.Background(), uuid.New(), dto.RegistrarVentaRequest{
		SesionCajaID: sesionID.String(),
		Items: []dto.ItemVentaRequest{
			{ProductoID: p.ID.String(), Cantidad: 1},
		},
		Pagos: []dto.PagoRequest{{Metodo: "debito", Monto: decimal.NewFromFloat(1500)}},
	})
	assert.Error(t, err, "venta con vuelto pero sin pago en efectivo debe fallar")
	assert.Contains(t, err.Error(), "vuelto")
}

// E9: QR + efectivo con vuelto.
func TestCierre_QRYEfectivoConVuelto(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 109, 1000)

	p := seedProducto(s.productoRepo, "Producto H", "9990000000008", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(800)

	// Venta $800: $300 QR + $700 efectivo = $1000 → vuelto $200 (en efectivo)
	// Efectivo neto: 700 - 200 = 500
	// QR: 300
	s.registrarVenta(t, sesionID, &struct{ ID uuid.UUID }{ID: p.ID}, 1, 800,
		[]dto.PagoRequest{
			{Metodo: "qr", Monto: decimal.NewFromFloat(300)},
			{Metodo: "efectivo", Monto: decimal.NewFromFloat(700)},
		})

	req := dto.ArqueoRequest{
		SesionCajaID: sesionID.String(),
		Declaracion: dto.DeclaracionArqueo{
			Efectivo: decimal.NewFromFloat(1500), // 1000 + 500
			QR:       decimal.NewFromFloat(300),
		},
	}
	resp, err := s.cajaSvc.Arqueo(context.Background(), req, nil)
	require.NoError(t, err)

	assert.Equal(t, "1500", resp.MontoEsperado.Efectivo.String())
	assert.Equal(t, "300", resp.MontoEsperado.QR.String())
	assert.Equal(t, "0", resp.Desvio.Monto.String())
}

// E10: Anulación de venta con vuelto. La caja debe volver a su estado previo.
func TestCierre_AnulacionVentaConVuelto(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 110, 2000)

	p := seedProducto(s.productoRepo, "Producto I", "9990000000009", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(1000)

	// Venta $1000 paga $1200 (vuelto $200) → caja debería sumar $1000 neto
	resp, err := s.ventaSvc.RegistrarVenta(context.Background(), uuid.New(), dto.RegistrarVentaRequest{
		SesionCajaID: sesionID.String(),
		Items:        []dto.ItemVentaRequest{{ProductoID: p.ID.String(), Cantidad: 1}},
		Pagos:        []dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(1200)}},
	})
	require.NoError(t, err)

	// Anular la venta — debe generar un movimiento inverso
	err = s.ventaSvc.AnularVenta(context.Background(), uuid.MustParse(resp.ID), "test")
	require.NoError(t, err)

	// Tras la anulación, la caja debe volver a 2000 (sólo monto inicial)
	arqueo := s.arquear(t, sesionID, 2000)
	assert.Equal(t, "2000", arqueo.MontoEsperado.Efectivo.String(),
		"tras anulación la caja debe quedar como al inicio")
	assert.Equal(t, "0", arqueo.Desvio.Monto.String())
}

// E11: Sobrante de caja (declarar más que lo esperado) → desvío POSITIVO.
func TestCierre_Sobrante(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 111, 5000)

	p := seedProducto(s.productoRepo, "Producto J", "9990000000010", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(2000)

	s.registrarVenta(t, sesionID, &struct{ ID uuid.UUID }{ID: p.ID}, 1, 2000,
		[]dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(2000)}})

	// Esperado 7000, declarar 7100 → +100 sobrante
	resp := s.arquear(t, sesionID, 7100)

	assert.Equal(t, "7000", resp.MontoEsperado.Efectivo.String())
	assert.Equal(t, "100", resp.Desvio.Monto.String(), "desvío debe ser positivo (sobrante)")
}

// E12: Faltante REAL (no por vuelto, sino por error humano).
func TestCierre_FaltanteReal(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 112, 5000)

	p := seedProducto(s.productoRepo, "Producto K", "9990000000011", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(2000)

	s.registrarVenta(t, sesionID, &struct{ ID uuid.UUID }{ID: p.ID}, 1, 2000,
		[]dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(2000)}})

	// Esperado 7000, cajero declara 6900 → -100 faltante real
	// -100/7000 ≈ -1.43% → advertencia (no crítico)
	resp := s.arquear(t, sesionID, 6900)

	assert.Equal(t, "7000", resp.MontoEsperado.Efectivo.String())
	assert.Equal(t, "-100", resp.Desvio.Monto.String())
	assert.Equal(t, "advertencia", resp.Desvio.Clasificacion)
}

// E13: Sesión múltiples ventas + retiro manual de caja (egreso).
func TestCierre_VentasConEgresoManual(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 113, 5000)

	p := seedProducto(s.productoRepo, "Producto L", "9990000000012", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(1500)

	// 2 ventas en efectivo
	for i := 0; i < 2; i++ {
		s.registrarVenta(t, sesionID, &struct{ ID uuid.UUID }{ID: p.ID}, 1, 1500,
			[]dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(1500)}})
	}

	// Egreso manual: retiró $1000 para pagar un proveedor
	err := s.cajaSvc.RegistrarMovimiento(context.Background(), dto.MovimientoManualRequest{
		SesionCajaID: sesionID.String(),
		Tipo:         "egreso_manual",
		MetodoPago:   "efectivo",
		Monto:        decimal.NewFromFloat(1000),
		Descripcion:  "Pago proveedor",
	})
	require.NoError(t, err)

	// Esperado: 5000 + 1500 + 1500 - 1000 = 7000
	resp := s.arquear(t, sesionID, 7000)

	assert.Equal(t, "7000", resp.MontoEsperado.Efectivo.String())
	assert.Equal(t, "0", resp.Desvio.Monto.String())
}

// E14: Aislamiento entre sesiones — dos cajas distintas no se contaminan.
func TestCierre_AislamientoEntreSesiones(t *testing.T) {
	s := newIntegratedSetup()
	sesion1 := s.abrirSesion(t, 114, 1000)
	sesion2 := s.abrirSesion(t, 115, 2000)

	p := seedProducto(s.productoRepo, "Producto M", "9990000000013", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(500)

	// Venta en sesión 1
	s.registrarVenta(t, sesion1, &struct{ ID uuid.UUID }{ID: p.ID}, 1, 500,
		[]dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(500)}})

	// Venta en sesión 2
	s.registrarVenta(t, sesion2, &struct{ ID uuid.UUID }{ID: p.ID}, 2, 500,
		[]dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromFloat(1000)}})

	// Cada arqueo solo debe ver SUS movimientos
	resp1 := s.arquear(t, sesion1, 1500)
	resp2 := s.arquear(t, sesion2, 3000)

	assert.Equal(t, "1500", resp1.MontoEsperado.Efectivo.String(), "sesión 1: 1000 + 500")
	assert.Equal(t, "3000", resp2.MontoEsperado.Efectivo.String(), "sesión 2: 2000 + 1000")
	assert.Equal(t, "0", resp1.Desvio.Monto.String())
	assert.Equal(t, "0", resp2.Desvio.Monto.String())
}

// E15: Pago mixto con vuelto donde TODO el efectivo se va como vuelto.
// Edge case: cliente paga $1000 con $200 efectivo + $1000 débito = $1200 → vuelto $200.
// El efectivo neto en caja: 200 - 200 = 0.
func TestCierre_EfectivoNetoCero(t *testing.T) {
	s := newIntegratedSetup()
	sesionID := s.abrirSesion(t, 116, 1000)

	p := seedProducto(s.productoRepo, "Producto N", "9990000000014", 100, 5)
	p.PrecioVenta = decimal.NewFromFloat(1000)

	s.registrarVenta(t, sesionID, &struct{ ID uuid.UUID }{ID: p.ID}, 1, 1000,
		[]dto.PagoRequest{
			{Metodo: "efectivo", Monto: decimal.NewFromFloat(200)},
			{Metodo: "debito", Monto: decimal.NewFromFloat(1000)},
		})

	req := dto.ArqueoRequest{
		SesionCajaID: sesionID.String(),
		Declaracion: dto.DeclaracionArqueo{
			Efectivo: decimal.NewFromFloat(1000), // 1000 + 0
			Debito:   decimal.NewFromFloat(1000),
		},
	}
	resp, err := s.cajaSvc.Arqueo(context.Background(), req, nil)
	require.NoError(t, err)

	assert.Equal(t, "1000", resp.MontoEsperado.Efectivo.String())
	assert.Equal(t, "1000", resp.MontoEsperado.Debito.String())
	assert.Equal(t, "0", resp.Desvio.Monto.String())
}
