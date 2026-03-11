package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"blendpos/internal/dto"
	"blendpos/internal/handler"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ── Stub CajaService ─────────────────────────────────────────────────────────

type stubCajaServiceHTTP struct {
	sesiones     map[uuid.UUID]*dto.ReporteCajaResponse
	activeSesion *uuid.UUID // at most one active session per user
}

func newStubCajaSvcHTTP() *stubCajaServiceHTTP {
	return &stubCajaServiceHTTP{
		sesiones: make(map[uuid.UUID]*dto.ReporteCajaResponse),
	}
}

func (s *stubCajaServiceHTTP) Abrir(_ context.Context, usuarioID uuid.UUID, req dto.AbrirCajaRequest) (*dto.ReporteCajaResponse, error) {
	if s.activeSesion != nil {
		return nil, errors.New("ya existe una sesión de caja abierta")
	}
	id := uuid.New()
	resp := &dto.ReporteCajaResponse{
		SesionCajaID: id.String(),
		PuntoDeVenta: req.PuntoDeVenta,
		Usuario:      "testuser",
		MontoInicial: req.MontoInicial,
		Estado:       "abierta",
		OpenedAt:     "2025-01-15T08:00:00Z",
	}
	s.sesiones[id] = resp
	s.activeSesion = &id
	return resp, nil
}

func (s *stubCajaServiceHTTP) Arqueo(_ context.Context, req dto.ArqueoRequest, usuarioID *uuid.UUID) (*dto.ArqueoResponse, error) {
	if s.activeSesion == nil {
		return nil, errors.New("no hay sesión de caja abierta")
	}
	sesion := s.sesiones[*s.activeSesion]
	sesion.Estado = "cerrada"
	s.activeSesion = nil

	return &dto.ArqueoResponse{
		SesionCajaID: sesion.SesionCajaID,
		MontoEsperado: dto.MontosPorMetodo{
			Efectivo: decimal.NewFromInt(10000),
			Total:    decimal.NewFromInt(10000),
		},
		MontoDeclarado: dto.MontosPorMetodo{
			Efectivo: req.Declaracion.Efectivo,
			Total:    req.Declaracion.Efectivo,
		},
		Desvio: dto.DesvioResponse{
			Monto:         decimal.Zero,
			Porcentaje:    decimal.Zero,
			Clasificacion: "normal",
		},
		Estado: "cerrada",
	}, nil
}

func (s *stubCajaServiceHTTP) ObtenerReporte(_ context.Context, sesionID uuid.UUID) (*dto.ReporteCajaResponse, error) {
	resp, ok := s.sesiones[sesionID]
	if !ok {
		return nil, errors.New("sesión no encontrada")
	}
	return resp, nil
}

func (s *stubCajaServiceHTTP) FindSesionAbierta(_ context.Context, sesionID uuid.UUID) error {
	if s.activeSesion == nil || *s.activeSesion != sesionID {
		return errors.New("sesión no activa")
	}
	return nil
}

func (s *stubCajaServiceHTTP) GetActiva(_ context.Context, usuarioID uuid.UUID) (*dto.ReporteCajaResponse, error) {
	if s.activeSesion == nil {
		return nil, nil
	}
	return s.sesiones[*s.activeSesion], nil
}

func (s *stubCajaServiceHTTP) Historial(_ context.Context, page, limit int) ([]dto.ReporteCajaResponse, error) {
	result := make([]dto.ReporteCajaResponse, 0, len(s.sesiones))
	for _, r := range s.sesiones {
		result = append(result, *r)
	}
	return result, nil
}

func (s *stubCajaServiceHTTP) RegistrarMovimiento(_ context.Context, req dto.MovimientoManualRequest) error {
	if s.activeSesion == nil {
		return errors.New("no hay sesión de caja abierta")
	}
	return nil
}

// ── Router ────────────────────────────────────────────────────────────────────

func cajaRouter(svc *stubCajaServiceHTTP, userID, rol string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := handler.NewCajaHandler(svc)

	authed := r.Group("/v1/caja", injectClaims(userID, rol))
	authed.POST("/abrir", h.Abrir)
	authed.POST("/arqueo", h.Arqueo)
	authed.POST("/movimiento", h.RegistrarMovimiento)
	authed.GET("/:id/reporte", h.ObtenerReporte)
	authed.GET("/activa", h.GetActiva)
	authed.GET("/historial", h.Historial)

	return r
}

// ── Tests: POST /v1/caja/abrir ────────────────────────────────────────────────

func TestAbrirCaja_201(t *testing.T) {
	svc := newStubCajaSvcHTTP()
	r := cajaRouter(svc, uuid.New().String(), "cajero")

	body, _ := json.Marshal(dto.AbrirCajaRequest{
		PuntoDeVenta: 1,
		MontoInicial: decimal.NewFromInt(5000),
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/v1/caja/abrir", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Contains(t, w.Header().Get("Content-Type"), "application/json")

	var resp dto.ReporteCajaResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.NotEmpty(t, resp.SesionCajaID)
	assert.Equal(t, "abierta", resp.Estado)
	assert.Equal(t, 1, resp.PuntoDeVenta)
}

func TestAbrirCaja_400_YaAbierta(t *testing.T) {
	svc := newStubCajaSvcHTTP()
	r := cajaRouter(svc, uuid.New().String(), "cajero")

	body, _ := json.Marshal(dto.AbrirCajaRequest{PuntoDeVenta: 1, MontoInicial: decimal.NewFromInt(5000)})

	// First open succeeds
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest(http.MethodPost, "/v1/caja/abrir", bytes.NewReader(body))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusCreated, w1.Code)

	// Second open fails (already open)
	body2, _ := json.Marshal(dto.AbrirCajaRequest{PuntoDeVenta: 1, MontoInicial: decimal.NewFromInt(5000)})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodPost, "/v1/caja/abrir", bytes.NewReader(body2))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)

	assert.Equal(t, http.StatusBadRequest, w2.Code)
}

func TestAbrirCaja_400_MissingPuntoDeVenta(t *testing.T) {
	svc := newStubCajaSvcHTTP()
	r := cajaRouter(svc, uuid.New().String(), "cajero")

	body := []byte(`{"monto_inicial": 5000}`) // missing punto_de_venta
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/v1/caja/abrir", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.True(t, w.Code == http.StatusBadRequest || w.Code == http.StatusUnprocessableEntity,
		"expected 400 or 422, got %d", w.Code)
}

// ── Tests: POST /v1/caja/arqueo ───────────────────────────────────────────────

func TestArqueo_200(t *testing.T) {
	svc := newStubCajaSvcHTTP()
	userID := uuid.New().String()
	r := cajaRouter(svc, userID, "cajero")

	// Open a session first
	openBody, _ := json.Marshal(dto.AbrirCajaRequest{PuntoDeVenta: 1, MontoInicial: decimal.NewFromInt(5000)})
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest(http.MethodPost, "/v1/caja/abrir", bytes.NewReader(openBody))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)
	require.Equal(t, http.StatusCreated, w1.Code)

	var openResp dto.ReporteCajaResponse
	json.Unmarshal(w1.Body.Bytes(), &openResp)

	// Now do arqueo
	arqueoBody, _ := json.Marshal(dto.ArqueoRequest{
		SesionCajaID: openResp.SesionCajaID,
		Declaracion: dto.DeclaracionArqueo{
			Efectivo: decimal.NewFromInt(10000),
		},
	})

	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodPost, "/v1/caja/arqueo", bytes.NewReader(arqueoBody))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)

	assert.Equal(t, http.StatusOK, w2.Code)
	var resp dto.ArqueoResponse
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp))
	assert.Equal(t, "cerrada", resp.Estado)
}

func TestArqueo_400_SinCajaAbierta(t *testing.T) {
	svc := newStubCajaSvcHTTP()
	r := cajaRouter(svc, uuid.New().String(), "cajero")

	body, _ := json.Marshal(dto.ArqueoRequest{
		SesionCajaID: uuid.New().String(),
		Declaracion: dto.DeclaracionArqueo{
			Efectivo: decimal.NewFromInt(10000),
		},
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/v1/caja/arqueo", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ── Tests: GET /v1/caja/:id/reporte ───────────────────────────────────────────

func TestObtenerReporte_200(t *testing.T) {
	svc := newStubCajaSvcHTTP()
	r := cajaRouter(svc, uuid.New().String(), "cajero")

	// Open a session
	openBody, _ := json.Marshal(dto.AbrirCajaRequest{PuntoDeVenta: 1, MontoInicial: decimal.NewFromInt(5000)})
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest(http.MethodPost, "/v1/caja/abrir", bytes.NewReader(openBody))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	var openResp dto.ReporteCajaResponse
	json.Unmarshal(w1.Body.Bytes(), &openResp)

	// Get report
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodGet, "/v1/caja/"+openResp.SesionCajaID+"/reporte", nil)
	r.ServeHTTP(w2, req2)

	assert.Equal(t, http.StatusOK, w2.Code)
	var resp dto.ReporteCajaResponse
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp))
	assert.Equal(t, openResp.SesionCajaID, resp.SesionCajaID)
}

func TestObtenerReporte_404(t *testing.T) {
	svc := newStubCajaSvcHTTP()
	r := cajaRouter(svc, uuid.New().String(), "cajero")

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/v1/caja/"+uuid.New().String()+"/reporte", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

// ── Tests: GET /v1/caja/activa ────────────────────────────────────────────────

func TestGetActiva_404_NoSesion(t *testing.T) {
	svc := newStubCajaSvcHTTP()
	r := cajaRouter(svc, uuid.New().String(), "cajero")

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/v1/caja/activa", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGetActiva_200(t *testing.T) {
	svc := newStubCajaSvcHTTP()
	userID := uuid.New().String()
	r := cajaRouter(svc, userID, "cajero")

	// Open session
	body, _ := json.Marshal(dto.AbrirCajaRequest{PuntoDeVenta: 1, MontoInicial: decimal.NewFromInt(5000)})
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest(http.MethodPost, "/v1/caja/abrir", bytes.NewReader(body))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	// Get active
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodGet, "/v1/caja/activa", nil)
	r.ServeHTTP(w2, req2)

	assert.Equal(t, http.StatusOK, w2.Code)
}

// ── Tests: POST /v1/caja/movimiento ──────────────────────────────────────────

func TestRegistrarMovimiento_204(t *testing.T) {
	svc := newStubCajaSvcHTTP()
	r := cajaRouter(svc, uuid.New().String(), "cajero")

	// Open session first
	openBody, _ := json.Marshal(dto.AbrirCajaRequest{PuntoDeVenta: 1, MontoInicial: decimal.NewFromInt(5000)})
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest(http.MethodPost, "/v1/caja/abrir", bytes.NewReader(openBody))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	var openResp dto.ReporteCajaResponse
	json.Unmarshal(w1.Body.Bytes(), &openResp)

	movBody, _ := json.Marshal(dto.MovimientoManualRequest{
		SesionCajaID: openResp.SesionCajaID,
		Tipo:         "ingreso_manual",
		MetodoPago:   "efectivo",
		Monto:        decimal.NewFromInt(1000),
		Descripcion:  "Ingreso de prueba",
	})

	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest(http.MethodPost, "/v1/caja/movimiento", bytes.NewReader(movBody))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)

	assert.Equal(t, http.StatusNoContent, w2.Code)
}

// ── Tests: GET /v1/caja/historial ─────────────────────────────────────────────

func TestHistorial_200(t *testing.T) {
	svc := newStubCajaSvcHTTP()
	r := cajaRouter(svc, uuid.New().String(), "cajero")

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/v1/caja/historial", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Header().Get("Content-Type"), "application/json")
}
