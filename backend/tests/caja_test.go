package tests

import (
	"context"
	"errors"
	"testing"
	"time"

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

// ── Full in-memory CajaRepository ────────────────────────────────────────────

type fullCajaRepo struct {
	sesiones    map[uuid.UUID]*model.SesionCaja
	movimientos []model.MovimientoCaja
}

func newFullCajaRepo() *fullCajaRepo {
	return &fullCajaRepo{
		sesiones: make(map[uuid.UUID]*model.SesionCaja),
	}
}

func (r *fullCajaRepo) CreateSesion(_ context.Context, s *model.SesionCaja) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	s.OpenedAt = time.Now()
	r.sesiones[s.ID] = s
	return nil
}

func (r *fullCajaRepo) FindSesionAbiertaPorPDV(_ context.Context, pdv int) (*model.SesionCaja, error) {
	for _, s := range r.sesiones {
		if s.PuntoDeVenta == pdv && s.Estado == "abierta" {
			return s, nil
		}
	}
	return nil, errors.New("not found")
}

func (r *fullCajaRepo) FindSesionByID(_ context.Context, id uuid.UUID) (*model.SesionCaja, error) {
	s, ok := r.sesiones[id]
	if !ok {
		return nil, errors.New("not found")
	}
	// Attach related movimientos
	s.Movimientos = nil
	for _, m := range r.movimientos {
		if m.SesionCajaID == id {
			s.Movimientos = append(s.Movimientos, m)
		}
	}
	return s, nil
}

func (r *fullCajaRepo) UpdateSesion(_ context.Context, s *model.SesionCaja) error {
	r.sesiones[s.ID] = s
	return nil
}

func (r *fullCajaRepo) CreateMovimiento(_ context.Context, m *model.MovimientoCaja) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	m.CreatedAt = time.Now()
	r.movimientos = append(r.movimientos, *m)
	return nil
}

func (r *fullCajaRepo) CreateMovimientoTx(_ *gorm.DB, m *model.MovimientoCaja) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	m.CreatedAt = time.Now()
	r.movimientos = append(r.movimientos, *m)
	return nil
}

func (r *fullCajaRepo) ListMovimientos(_ context.Context, sesionID uuid.UUID) ([]model.MovimientoCaja, error) {
	var result []model.MovimientoCaja
	for _, m := range r.movimientos {
		if m.SesionCajaID == sesionID {
			result = append(result, m)
		}
	}
	return result, nil
}

func (r *fullCajaRepo) SumMovimientosByMetodo(_ context.Context, sesionID uuid.UUID) (map[string]decimal.Decimal, error) {
	sums := map[string]decimal.Decimal{
		"efectivo":      decimal.Zero,
		"debito":        decimal.Zero,
		"credito":       decimal.Zero,
		"transferencia": decimal.Zero,
	}
	for _, m := range r.movimientos {
		if m.SesionCajaID == sesionID && m.MetodoPago != nil {
			sums[*m.MetodoPago] = sums[*m.MetodoPago].Add(m.Monto)
		}
	}
	return sums, nil
}

func (r *fullCajaRepo) FindSesionAbiertaPorUsuario(_ context.Context, usuarioID uuid.UUID) (*model.SesionCaja, error) {
	for _, s := range r.sesiones {
		if s.UsuarioID == usuarioID && s.Estado == "abierta" {
			return s, nil
		}
	}
	return nil, nil
}

func (r *fullCajaRepo) ListSesiones(_ context.Context, page, limit int) ([]model.SesionCaja, int64, error) {
	all := make([]model.SesionCaja, 0, len(r.sesiones))
	for _, s := range r.sesiones {
		all = append(all, *s)
	}
	total := int64(len(all))
	start := (page - 1) * limit
	if start >= len(all) {
		return nil, total, nil
	}
	end := start + limit
	if end > len(all) {
		end = len(all)
	}
	return all[start:end], total, nil
}

var _ repository.CajaRepository = (*fullCajaRepo)(nil)

// ── Tests ─────────────────────────────────────────────────────────────────────

func TestAbrirCaja(t *testing.T) {
	repo := newFullCajaRepo()
	svc := service.NewCajaService(repo)

	resp, err := svc.Abrir(context.Background(), uuid.New(), dto.AbrirCajaRequest{
		PuntoDeVenta: 1,
		MontoInicial: decimal.NewFromFloat(5000),
	})

	require.NoError(t, err)
	assert.Equal(t, "abierta", resp.Estado)
	assert.Equal(t, 1, resp.PuntoDeVenta)
	assert.Equal(t, decimal.NewFromFloat(5000).String(), resp.MontoInicial.String())
}

func TestAbrirCajaDuplicada(t *testing.T) {
	repo := newFullCajaRepo()
	svc := service.NewCajaService(repo)

	_, err := svc.Abrir(context.Background(), uuid.New(), dto.AbrirCajaRequest{
		PuntoDeVenta: 1,
		MontoInicial: decimal.NewFromFloat(5000),
	})
	require.NoError(t, err)

	// Second open on same punto_de_venta should fail
	_, err = svc.Abrir(context.Background(), uuid.New(), dto.AbrirCajaRequest{
		PuntoDeVenta: 1,
		MontoInicial: decimal.NewFromFloat(2000),
	})
	assert.ErrorContains(t, err, "Ya existe una caja abierta")
}

func TestMovimientoInmutable(t *testing.T) {
	// Movements are created, never updated — verify CreateMovimiento is called
	// and no UpdateMovimiento method exists on the interface (compile-time guarantee).
	repo := newFullCajaRepo()
	svc := service.NewCajaService(repo)

	resp, err := svc.Abrir(context.Background(), uuid.New(), dto.AbrirCajaRequest{
		PuntoDeVenta: 2,
		MontoInicial: decimal.NewFromFloat(1000),
	})
	require.NoError(t, err)
	sesionID := resp.SesionCajaID

	err = svc.RegistrarMovimiento(context.Background(), dto.MovimientoManualRequest{
		SesionCajaID: sesionID,
		Tipo:         "ingreso_manual",
		MetodoPago:   "efectivo",
		Monto:        decimal.NewFromFloat(500),
		Descripcion:  "Fondo de cambio",
	})
	require.NoError(t, err)

	// One movimiento created
	assert.Len(t, repo.movimientos, 1)
	assert.Equal(t, "ingreso_manual", repo.movimientos[0].Tipo)
	assert.Equal(t, decimal.NewFromFloat(500).String(), repo.movimientos[0].Monto.String())
}

func TestDesvioNormal(t *testing.T) {
	repo := newFullCajaRepo()
	svc := service.NewCajaService(repo)

	resp, err := svc.Abrir(context.Background(), uuid.New(), dto.AbrirCajaRequest{
		PuntoDeVenta: 3,
		MontoInicial: decimal.NewFromFloat(5000),
	})
	require.NoError(t, err)
	sesionID := uuid.MustParse(resp.SesionCajaID)

	// Simulate a sale movement: +10000 efectivo
	metodo := "efectivo"
	repo.movimientos = append(repo.movimientos, model.MovimientoCaja{
		ID: uuid.New(), SesionCajaID: sesionID, Tipo: "venta",
		MetodoPago: &metodo, Monto: decimal.NewFromFloat(10000),
		Descripcion: "Venta #1",
	})

	// Declare exact match: 5000 (inicial) + 10000 (venta) = 15000
	arqueoResp, err := svc.Arqueo(context.Background(), dto.ArqueoRequest{
		SesionCajaID: sesionID.String(),
		Declaracion:  dto.DeclaracionArqueo{Efectivo: decimal.NewFromFloat(15000)},
	}, nil)
	require.NoError(t, err)
	assert.Equal(t, "normal", arqueoResp.Desvio.Clasificacion)
	assert.Equal(t, "0", arqueoResp.Desvio.Monto.String())
}

func TestDesvioAdvertencia(t *testing.T) {
	repo := newFullCajaRepo()
	svc := service.NewCajaService(repo)

	resp, err := svc.Abrir(context.Background(), uuid.New(), dto.AbrirCajaRequest{
		PuntoDeVenta: 4,
		MontoInicial: decimal.NewFromFloat(5000),
	})
	require.NoError(t, err)
	sesionID := uuid.MustParse(resp.SesionCajaID)

	// Expected: 5000 efectivo (no movements). Declare 4800 → desvio = -200, pct ≈ -4% → advertencia
	arqueoResp, err := svc.Arqueo(context.Background(), dto.ArqueoRequest{
		SesionCajaID: sesionID.String(),
		Declaracion:  dto.DeclaracionArqueo{Efectivo: decimal.NewFromFloat(4800)},
	}, nil)
	require.NoError(t, err)
	assert.Equal(t, "advertencia", arqueoResp.Desvio.Clasificacion)
	assert.True(t, arqueoResp.Desvio.Monto.IsNegative())
}

func TestDesvioCritico(t *testing.T) {
	repo := newFullCajaRepo()
	svc := service.NewCajaService(repo)

	resp, err := svc.Abrir(context.Background(), uuid.New(), dto.AbrirCajaRequest{
		PuntoDeVenta: 5,
		MontoInicial: decimal.NewFromFloat(10000),
	})
	require.NoError(t, err)
	sesionID := uuid.MustParse(resp.SesionCajaID)

	// Expected: 10000. Declare 9000 → desvio = -1000, pct = -10% → critico
	// Without observaciones → should fail
	_, err = svc.Arqueo(context.Background(), dto.ArqueoRequest{
		SesionCajaID: sesionID.String(),
		Declaracion:  dto.DeclaracionArqueo{Efectivo: decimal.NewFromFloat(9000)},
	}, nil)
	assert.ErrorContains(t, err, "crítico")

	// With observaciones → should succeed
	obs := "Faltante detectado en turno nocturno"
	arqueoResp, err := svc.Arqueo(context.Background(), dto.ArqueoRequest{
		SesionCajaID:  sesionID.String(),
		Declaracion:   dto.DeclaracionArqueo{Efectivo: decimal.NewFromFloat(9000)},
		Observaciones: &obs,
	}, nil)
	require.NoError(t, err)
	assert.Equal(t, "critico", arqueoResp.Desvio.Clasificacion)
	assert.Equal(t, "cerrada", arqueoResp.Estado)
}

func TestArqueoCiego(t *testing.T) {
	// Blind arqueo: the service must NOT expose montoEsperado before receiving declaration.
	// We verify the flow: Abrir → movimientos → Arqueo (without prior "sneak peek").
	repo := newFullCajaRepo()
	svc := service.NewCajaService(repo)

	resp, err := svc.Abrir(context.Background(), uuid.New(), dto.AbrirCajaRequest{
		PuntoDeVenta: 6,
		MontoInicial: decimal.NewFromFloat(2000),
	})
	require.NoError(t, err)
	sesionID := uuid.MustParse(resp.SesionCajaID)

	// Effective sales: 3000 efectivo + 1500 debito
	efectivo, debito := "efectivo", "debito"
	repo.movimientos = append(repo.movimientos,
		model.MovimientoCaja{ID: uuid.New(), SesionCajaID: sesionID, Tipo: "venta",
			MetodoPago: &efectivo, Monto: decimal.NewFromFloat(3000), Descripcion: "Venta #1"},
		model.MovimientoCaja{ID: uuid.New(), SesionCajaID: sesionID, Tipo: "venta",
			MetodoPago: &debito, Monto: decimal.NewFromFloat(1500), Descripcion: "Venta #2"},
	)

	// Cajero declares blindly: efectivo=4900 (slight shortage), debito=1500 (exact)
	// Expected efectivo = 2000 (inicial) + 3000 = 5000; declared = 4900 → desvio on total = -100
	arqueoResp, err := svc.Arqueo(context.Background(), dto.ArqueoRequest{
		SesionCajaID: sesionID.String(),
		Declaracion: dto.DeclaracionArqueo{
			Efectivo: decimal.NewFromFloat(4900),
			Debito:   decimal.NewFromFloat(1500),
		},
	}, nil)
	require.NoError(t, err)
	// MontoEsperado total = (2000+3000) + 1500 = 6500; declared = 4900+1500 = 6400
	// desvio = -100, pct = -100/6500 ≈ -1.54% → advertencia
	assert.Equal(t, "advertencia", arqueoResp.Desvio.Clasificacion)
	assert.Equal(t, "-100", arqueoResp.Desvio.Monto.String())
}

func TestObtenerReporte(t *testing.T) {
	repo := newFullCajaRepo()
	svc := service.NewCajaService(repo)

	openResp, err := svc.Abrir(context.Background(), uuid.New(), dto.AbrirCajaRequest{
		PuntoDeVenta: 7,
		MontoInicial: decimal.NewFromFloat(3000),
	})
	require.NoError(t, err)

	reporte, err := svc.ObtenerReporte(context.Background(), uuid.MustParse(openResp.SesionCajaID))
	require.NoError(t, err)
	assert.Equal(t, "abierta", reporte.Estado)
	assert.Equal(t, 7, reporte.PuntoDeVenta)
	assert.Equal(t, decimal.NewFromFloat(3000).String(), reporte.MontoInicial.String())
}

func TestEgresoManual_MontoNegativo(t *testing.T) {
	repo := newFullCajaRepo()
	svc := service.NewCajaService(repo)

	resp, err := svc.Abrir(context.Background(), uuid.New(), dto.AbrirCajaRequest{
		PuntoDeVenta: 8,
		MontoInicial: decimal.NewFromFloat(5000),
	})
	require.NoError(t, err)

	err = svc.RegistrarMovimiento(context.Background(), dto.MovimientoManualRequest{
		SesionCajaID: resp.SesionCajaID,
		Tipo:         "egreso_manual",
		MetodoPago:   "efectivo",
		Monto:        decimal.NewFromFloat(200),
		Descripcion:  "Pago de taxi",
	})
	require.NoError(t, err)

	// Egreso should be stored as negative
	assert.True(t, repo.movimientos[0].Monto.IsNegative())
	assert.Equal(t, "-200", repo.movimientos[0].Monto.String())
}
