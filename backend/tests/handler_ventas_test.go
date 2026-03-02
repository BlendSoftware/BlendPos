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

// ── Stub VentaService ─────────────────────────────────────────────────────────

type stubVentaServiceHTTP struct {
	ventas       map[uuid.UUID]*dto.VentaResponse
	requireCaja  bool   // when true, fail if sesion_caja_id doesn't match
	activeCajaID string // valid sesion_caja_id
}

func newStubVentaSvcHTTP() *stubVentaServiceHTTP {
	cajaID := uuid.New().String()
	return &stubVentaServiceHTTP{
		ventas:       make(map[uuid.UUID]*dto.VentaResponse),
		requireCaja:  true,
		activeCajaID: cajaID,
	}
}

func (s *stubVentaServiceHTTP) RegistrarVenta(_ context.Context, usuarioID uuid.UUID, req dto.RegistrarVentaRequest) (*dto.VentaResponse, error) {
	if s.requireCaja && req.SesionCajaID != s.activeCajaID {
		return nil, errors.New("no hay sesión de caja abierta para este punto de venta")
	}

	id := uuid.New()
	total := decimal.Zero
	items := make([]dto.ItemVentaResponse, 0, len(req.Items))
	for _, item := range req.Items {
		subtotal := decimal.NewFromInt(int64(item.Cantidad * 1000))
		total = total.Add(subtotal)
		items = append(items, dto.ItemVentaResponse{
			Producto:       "Producto Test",
			Cantidad:       item.Cantidad,
			PrecioUnitario: decimal.NewFromInt(1000),
			Subtotal:       subtotal,
		})
	}

	resp := &dto.VentaResponse{
		ID:           id.String(),
		NumeroTicket: len(s.ventas) + 1,
		Items:        items,
		Subtotal:     total,
		Total:        total,
		Estado:       "completada",
		CreatedAt:    "2025-01-15T10:30:00Z",
	}
	s.ventas[id] = resp
	return resp, nil
}

func (s *stubVentaServiceHTTP) AnularVenta(_ context.Context, id uuid.UUID, motivo string) error {
	v, ok := s.ventas[id]
	if !ok {
		return errors.New("venta no encontrada")
	}
	v.Estado = "anulada"
	return nil
}

func (s *stubVentaServiceHTTP) SyncBatch(_ context.Context, usuarioID uuid.UUID, req dto.SyncBatchRequest) ([]dto.VentaResponse, error) {
	results := make([]dto.VentaResponse, 0, len(req.Ventas))
	for _, v := range req.Ventas {
		resp, err := s.RegistrarVenta(context.Background(), usuarioID, v)
		if err != nil {
			return nil, err
		}
		results = append(results, *resp)
	}
	return results, nil
}

func (s *stubVentaServiceHTTP) ListVentas(_ context.Context, filter dto.VentaFilter) (*dto.VentaListResponse, error) {
	data := make([]dto.VentaListItem, 0)
	for _, v := range s.ventas {
		data = append(data, dto.VentaListItem{
			ID:       v.ID,
			Total:    v.Total,
			Estado:   v.Estado,
			Subtotal: v.Subtotal,
		})
	}
	return &dto.VentaListResponse{
		Data:  data,
		Total: int64(len(data)),
		Page:  filter.Page,
		Limit: filter.Limit,
	}, nil
}

// ── Router ────────────────────────────────────────────────────────────────────

func ventasRouter(svc *stubVentaServiceHTTP, userID, rol string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := handler.NewVentasHandler(svc)

	authed := r.Group("/v1", injectClaims(userID, rol))
	authed.POST("/ventas", h.RegistrarVenta)
	authed.GET("/ventas", h.ListarVentas)
	authed.DELETE("/ventas/:id", h.AnularVenta)
	authed.POST("/ventas/sync-batch", h.SyncBatch)

	// Route without auth – handler will panic on GetClaims
	r.POST("/v1/noauth/ventas", h.RegistrarVenta)

	return r
}

// ── Tests: POST /v1/ventas ────────────────────────────────────────────────────

func TestRegistrarVenta_201(t *testing.T) {
	svc := newStubVentaSvcHTTP()
	userID := uuid.New().String()
	r := ventasRouter(svc, userID, "cajero")

	body, _ := json.Marshal(dto.RegistrarVentaRequest{
		SesionCajaID: svc.activeCajaID,
		Items: []dto.ItemVentaRequest{
			{ProductoID: uuid.New().String(), Cantidad: 2, Descuento: decimal.Zero},
		},
		Pagos: []dto.PagoRequest{
			{Metodo: "efectivo", Monto: decimal.NewFromInt(2000)},
		},
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/v1/ventas", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Contains(t, w.Header().Get("Content-Type"), "application/json")

	var resp dto.VentaResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.NotEmpty(t, resp.ID)
	assert.Equal(t, "completada", resp.Estado)
	assert.GreaterOrEqual(t, len(resp.Items), 1)
}

func TestRegistrarVenta_400_IncompleteBody(t *testing.T) {
	svc := newStubVentaSvcHTTP()
	r := ventasRouter(svc, uuid.New().String(), "cajero")

	// Missing required fields (items and pagos)
	body := []byte(`{"sesion_caja_id":"` + uuid.New().String() + `"}`)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/v1/ventas", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.True(t, w.Code == http.StatusBadRequest || w.Code == http.StatusUnprocessableEntity,
		"expected 400 or 422, got %d", w.Code)
}

func TestRegistrarVenta_400_NoCajaAbierta(t *testing.T) {
	svc := newStubVentaSvcHTTP()
	r := ventasRouter(svc, uuid.New().String(), "cajero")

	body, _ := json.Marshal(dto.RegistrarVentaRequest{
		SesionCajaID: uuid.New().String(), // wrong session ID
		Items: []dto.ItemVentaRequest{
			{ProductoID: uuid.New().String(), Cantidad: 1, Descuento: decimal.Zero},
		},
		Pagos: []dto.PagoRequest{
			{Metodo: "efectivo", Monto: decimal.NewFromInt(1000)},
		},
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/v1/ventas", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ── Tests: GET /v1/ventas ─────────────────────────────────────────────────────

func TestListarVentas_200(t *testing.T) {
	svc := newStubVentaSvcHTTP()
	r := ventasRouter(svc, uuid.New().String(), "cajero")

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/v1/ventas", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Header().Get("Content-Type"), "application/json")

	var resp dto.VentaListResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.NotNil(t, resp.Data)
}

// ── Tests: DELETE /v1/ventas/:id ──────────────────────────────────────────────

func TestAnularVenta_204(t *testing.T) {
	svc := newStubVentaSvcHTTP()
	// Seed a sale directly
	ventaID := uuid.New()
	svc.ventas[ventaID] = &dto.VentaResponse{
		ID: ventaID.String(), Estado: "completada",
		Total: decimal.NewFromInt(1000), Subtotal: decimal.NewFromInt(1000),
	}
	r := ventasRouter(svc, uuid.New().String(), "administrador")

	body, _ := json.Marshal(dto.AnularVentaRequest{Motivo: "Cliente devolvió el producto"})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodDelete, "/v1/ventas/"+ventaID.String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNoContent, w.Code)
	assert.Equal(t, "anulada", svc.ventas[ventaID].Estado)
}

func TestAnularVenta_400_NotFound(t *testing.T) {
	svc := newStubVentaSvcHTTP()
	r := ventasRouter(svc, uuid.New().String(), "administrador")

	body, _ := json.Marshal(dto.AnularVentaRequest{Motivo: "Motivo de prueba largo"})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodDelete, "/v1/ventas/"+uuid.New().String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestAnularVenta_400_InvalidID(t *testing.T) {
	svc := newStubVentaSvcHTTP()
	r := ventasRouter(svc, uuid.New().String(), "administrador")

	body, _ := json.Marshal(dto.AnularVentaRequest{Motivo: "Motivo de prueba largo"})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodDelete, "/v1/ventas/not-a-uuid", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ── Tests: POST /v1/ventas/sync-batch ─────────────────────────────────────────

func TestSyncBatch_200(t *testing.T) {
	svc := newStubVentaSvcHTTP()
	svc.requireCaja = false // batch sync may use various caja IDs
	r := ventasRouter(svc, uuid.New().String(), "cajero")

	body, _ := json.Marshal(dto.SyncBatchRequest{
		Ventas: []dto.RegistrarVentaRequest{
			{
				SesionCajaID: uuid.New().String(),
				Items:        []dto.ItemVentaRequest{{ProductoID: uuid.New().String(), Cantidad: 1, Descuento: decimal.Zero}},
				Pagos:        []dto.PagoRequest{{Metodo: "efectivo", Monto: decimal.NewFromInt(500)}},
			},
		},
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/v1/ventas/sync-batch", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp []dto.VentaResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Len(t, resp, 1)
}
