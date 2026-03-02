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
	"blendpos/internal/middleware"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ── Stub ProductoService ──────────────────────────────────────────────────────

type stubProductoService struct {
	productos map[uuid.UUID]*dto.ProductoResponse
}

func newStubProductoSvc() *stubProductoService {
	return &stubProductoService{productos: make(map[uuid.UUID]*dto.ProductoResponse)}
}

func (s *stubProductoService) Crear(_ context.Context, req dto.CrearProductoRequest) (*dto.ProductoResponse, error) {
	id := uuid.New()
	p := &dto.ProductoResponse{
		ID:           id.String(),
		CodigoBarras: req.CodigoBarras,
		Nombre:       req.Nombre,
		Categoria:    req.Categoria,
		PrecioCosto:  req.PrecioCosto,
		PrecioVenta:  req.PrecioVenta,
		StockActual:  req.StockActual,
		StockMinimo:  req.StockMinimo,
		UnidadMedida: req.UnidadMedida,
		Activo:       true,
	}
	s.productos[id] = p
	return p, nil
}

func (s *stubProductoService) ObtenerPorID(_ context.Context, id uuid.UUID) (*dto.ProductoResponse, error) {
	p, ok := s.productos[id]
	if !ok {
		return nil, errors.New("not found")
	}
	return p, nil
}

func (s *stubProductoService) ObtenerPorBarcode(_ context.Context, barcode string) (*dto.ProductoResponse, error) {
	for _, p := range s.productos {
		if p.CodigoBarras == barcode {
			return p, nil
		}
	}
	return nil, errors.New("not found")
}

func (s *stubProductoService) Listar(_ context.Context, filter dto.ProductoFilter) (*dto.ProductoListResponse, error) {
	data := make([]dto.ProductoResponse, 0, len(s.productos))
	for _, p := range s.productos {
		data = append(data, *p)
	}
	return &dto.ProductoListResponse{
		Data:       data,
		Total:      int64(len(data)),
		Page:       filter.Page,
		Limit:      filter.Limit,
		TotalPages: 1,
	}, nil
}

func (s *stubProductoService) Actualizar(_ context.Context, id uuid.UUID, req dto.ActualizarProductoRequest) (*dto.ProductoResponse, error) {
	p, ok := s.productos[id]
	if !ok {
		return nil, errors.New("producto no encontrado")
	}
	if req.Nombre != nil {
		p.Nombre = *req.Nombre
	}
	return p, nil
}

func (s *stubProductoService) Desactivar(_ context.Context, id uuid.UUID) error {
	p, ok := s.productos[id]
	if !ok {
		return errors.New("producto no encontrado")
	}
	p.Activo = false
	return nil
}

func (s *stubProductoService) Reactivar(_ context.Context, id uuid.UUID) error {
	p, ok := s.productos[id]
	if !ok {
		return errors.New("producto no encontrado")
	}
	p.Activo = true
	return nil
}

func (s *stubProductoService) AjustarStock(_ context.Context, id uuid.UUID, req dto.AjustarStockRequest) (*dto.ProductoResponse, error) {
	p, ok := s.productos[id]
	if !ok {
		return nil, errors.New("producto no encontrado")
	}
	p.StockActual += req.Delta
	return p, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// injectClaims creates a test middleware that sets JWT claims directly on the
// Gin context, bypassing actual JWT validation. This isolates handler logic.
func injectClaims(userID, rol string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(middleware.ClaimsKey, &middleware.JWTClaims{
			UserID:   userID,
			Username: "testuser",
			Rol:      rol,
			Type:     "access",
		})
		c.Next()
	}
}

func productosRouter(svc *stubProductoService, userID, rol string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := handler.NewProductosHandler(svc)

	authed := r.Group("/v1", injectClaims(userID, rol))
	authed.GET("/productos", h.Listar)
	authed.POST("/productos", h.Crear)
	authed.GET("/productos/:id", h.ObtenerPorID)
	authed.PUT("/productos/:id", h.Actualizar)
	authed.DELETE("/productos/:id", h.Desactivar)
	authed.PATCH("/productos/:id/stock", h.AjustarStock)

	// Route without auth for 401 testing
	r.POST("/v1/noauth/productos", h.Crear)

	return r
}

func seedTestProducto(svc *stubProductoService) *dto.ProductoResponse {
	id := uuid.New()
	p := &dto.ProductoResponse{
		ID:           id.String(),
		CodigoBarras: "7790001000012",
		Nombre:       "Coca Cola 500ml",
		Categoria:    "bebidas",
		PrecioCosto:  decimal.NewFromInt(800),
		PrecioVenta:  decimal.NewFromInt(1200),
		StockActual:  50,
		StockMinimo:  10,
		UnidadMedida: "unidad",
		Activo:       true,
	}
	uid, _ := uuid.Parse(id.String())
	svc.productos[uid] = p
	return p
}

// ── Tests: GET /v1/productos ──────────────────────────────────────────────────

func TestListarProductos_200(t *testing.T) {
	svc := newStubProductoSvc()
	seedTestProducto(svc)
	r := productosRouter(svc, uuid.New().String(), "administrador")

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/v1/productos", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Header().Get("Content-Type"), "application/json")

	var resp dto.ProductoListResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.GreaterOrEqual(t, len(resp.Data), 1)
}

func TestListarProductos_EmptyList(t *testing.T) {
	svc := newStubProductoSvc()
	r := productosRouter(svc, uuid.New().String(), "administrador")

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/v1/productos", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp dto.ProductoListResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, int64(0), resp.Total)
}

// ── Tests: POST /v1/productos ─────────────────────────────────────────────────

func TestCrearProducto_201(t *testing.T) {
	svc := newStubProductoSvc()
	r := productosRouter(svc, uuid.New().String(), "administrador")

	body, _ := json.Marshal(dto.CrearProductoRequest{
		CodigoBarras: "7790001000029",
		Nombre:       "Pepsi 500ml",
		Categoria:    "bebidas",
		PrecioCosto:  decimal.NewFromInt(750),
		PrecioVenta:  decimal.NewFromInt(1100),
		StockActual:  30,
		StockMinimo:  5,
		UnidadMedida: "unidad",
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/v1/productos", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Contains(t, w.Header().Get("Content-Type"), "application/json")

	var resp dto.ProductoResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "Pepsi 500ml", resp.Nombre)
	assert.NotEmpty(t, resp.ID)
}

func TestCrearProducto_400_IncompleteBody(t *testing.T) {
	svc := newStubProductoSvc()
	r := productosRouter(svc, uuid.New().String(), "administrador")

	// Missing required fields
	body := []byte(`{"nombre": "X"}`)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPost, "/v1/productos", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.True(t, w.Code == http.StatusBadRequest || w.Code == http.StatusUnprocessableEntity,
		"expected 400 or 422, got %d", w.Code)
}

// ── Tests: GET /v1/productos/:id ──────────────────────────────────────────────

func TestObtenerProducto_200(t *testing.T) {
	svc := newStubProductoSvc()
	p := seedTestProducto(svc)
	r := productosRouter(svc, uuid.New().String(), "administrador")

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/v1/productos/"+p.ID, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp dto.ProductoResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, p.Nombre, resp.Nombre)
}

func TestObtenerProducto_404(t *testing.T) {
	svc := newStubProductoSvc()
	r := productosRouter(svc, uuid.New().String(), "administrador")

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/v1/productos/"+uuid.New().String(), nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestObtenerProducto_400_InvalidID(t *testing.T) {
	svc := newStubProductoSvc()
	r := productosRouter(svc, uuid.New().String(), "administrador")

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/v1/productos/not-a-uuid", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ── Tests: PUT /v1/productos/:id ──────────────────────────────────────────────

func TestActualizarProducto_200(t *testing.T) {
	svc := newStubProductoSvc()
	p := seedTestProducto(svc)
	r := productosRouter(svc, uuid.New().String(), "administrador")

	newName := "Coca Cola Zero 500ml"
	body, _ := json.Marshal(dto.ActualizarProductoRequest{Nombre: &newName})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPut, "/v1/productos/"+p.ID, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp dto.ProductoResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, newName, resp.Nombre)
}

func TestActualizarProducto_NotFound(t *testing.T) {
	svc := newStubProductoSvc()
	r := productosRouter(svc, uuid.New().String(), "administrador")

	newName := "Ghost"
	body, _ := json.Marshal(dto.ActualizarProductoRequest{Nombre: &newName})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPut, "/v1/productos/"+uuid.New().String(), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ── Tests: DELETE /v1/productos/:id ───────────────────────────────────────────

func TestDesactivarProducto_204(t *testing.T) {
	svc := newStubProductoSvc()
	p := seedTestProducto(svc)
	r := productosRouter(svc, uuid.New().String(), "administrador")

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodDelete, "/v1/productos/"+p.ID, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNoContent, w.Code)

	// Verify product was soft deleted
	uid, _ := uuid.Parse(p.ID)
	assert.False(t, svc.productos[uid].Activo)
}

func TestDesactivarProducto_NotFound(t *testing.T) {
	svc := newStubProductoSvc()
	r := productosRouter(svc, uuid.New().String(), "administrador")

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodDelete, "/v1/productos/"+uuid.New().String(), nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ── Tests: PATCH /v1/productos/:id/stock ──────────────────────────────────────

func TestAjustarStock_200(t *testing.T) {
	svc := newStubProductoSvc()
	p := seedTestProducto(svc)
	r := productosRouter(svc, uuid.New().String(), "administrador")

	body, _ := json.Marshal(dto.AjustarStockRequest{Delta: 10, Motivo: "Reposición manual"})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodPatch, "/v1/productos/"+p.ID+"/stock", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp dto.ProductoResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, 60, resp.StockActual) // 50 + 10
}
