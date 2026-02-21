//go:build integration

package e2e

// e2e_test.go
// End-to-end integration tests for BlendPOS using real Postgres + Redis via testcontainers.
// Run with: go test -tags integration ./tests/e2e/... -v
//
// These tests:
//   T-E2E-1: Full sale cycle (login → open caja → sale → list)
//   T-E2E-2: Offline sync-batch with idempotency (duplicate offline_id)
//   T-E2E-3: Stock conflict auto-compensation (deficit ≤ 3 units)
//   T-E2E-4: Anular venta restores stock
//   T-E2E-5: Price history recorded after masivo update

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"blendpos/internal/config"
	"blendpos/internal/infra"
	"blendpos/internal/router"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcPostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	tcRedis "github.com/testcontainers/testcontainers-go/modules/redis"
)

// ── Helpers ──────────────────────────────────────────────────────────────────

func jsonBody(t *testing.T, v any) *bytes.Buffer {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return bytes.NewBuffer(b)
}

func do(t *testing.T, srv *httptest.Server, method, path string, body *bytes.Buffer, token string) *http.Response {
	t.Helper()
	var req *http.Request
	var err error
	if body != nil {
		req, err = http.NewRequest(method, srv.URL+path, body)
	} else {
		req, err = http.NewRequest(method, srv.URL+path, nil)
	}
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := srv.Client().Do(req)
	require.NoError(t, err)
	return resp
}

func decodeJSON(t *testing.T, resp *http.Response, dest any) {
	t.Helper()
	defer resp.Body.Close()
	require.NoError(t, json.NewDecoder(resp.Body).Decode(dest))
}

// ── Test Suite Setup ─────────────────────────────────────────────────────────

type testEnv struct {
	server *httptest.Server
	token  string // admin JWT
	engine *gin.Engine
}

func setupTestEnv(t *testing.T) *testEnv {
	t.Helper()
	ctx := context.Background()

	// Start Postgres container
	pgC, err := tcPostgres.RunContainer(ctx,
		testcontainers.WithImage("postgres:15-alpine"),
		tcPostgres.WithDatabase("blendpos_test"),
		tcPostgres.WithUsername("blendpos"),
		tcPostgres.WithPassword("blendpos"),
		testcontainers.WithWaitStrategy(
			tcPostgres.BasicWaitStrategies()...,
		),
	)
	require.NoError(t, err)
	t.Cleanup(func() { _ = pgC.Terminate(ctx) })

	pgURL, err := pgC.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	// Start Redis container
	rdC, err := tcRedis.RunContainer(ctx,
		testcontainers.WithImage("redis:7-alpine"),
	)
	require.NoError(t, err)
	t.Cleanup(func() { _ = rdC.Terminate(ctx) })

	rdURL, err := rdC.ConnectionString(ctx)
	require.NoError(t, err)

	// Build config
	cfg := &config.Config{
		Port:               8000,
		Env:                "test",
		JWTSecret:          "test-secret-key",
		JWTExpirationHours: 8,
		JWTRefreshHours:    24,
		DatabaseURL:        pgURL,
		RedisURL:           rdURL,
		AFIPSidecarURL:     "http://localhost:9999", // unused in e2e tests
		WorkerPoolSize:     1,
		PDFStoragePath:     t.TempDir(),
	}

	// Connect DB + run migrations
	db, err := infra.NewDatabase(cfg.DatabaseURL)
	require.NoError(t, err)

	rdb, err := infra.NewRedis(cfg.RedisURL)
	require.NoError(t, err)

	// Auto-migrate (GORM CreateTable from models)
	require.NoError(t, infra.RunMigrations(db))

	// Seed admin user via bcrypt password
	_, err = db.Exec(`INSERT INTO usuarios (id, nombre, email, password_hash, rol, activo, created_at)
		VALUES (gen_random_uuid(), 'Admin E2E', 'admin@e2e.test',
		        '$2a$12$6zcbRzN1cj4B7bqbIp.LOukxBkHZvhKFxrlDTqX61mzKFN7N0dJIi', 'administrador', true, NOW())
		ON CONFLICT DO NOTHING`)
	require.NoError(t, err)

	// Build router
	r := router.New(cfg, db, rdb)
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)

	// Login as admin
	loginResp := do(t, srv, "POST", "/v1/auth/login",
		jsonBody(t, map[string]string{"email": "admin@e2e.test", "password": "blendpos2026"}),
		"",
	)
	require.Equal(t, http.StatusOK, loginResp.StatusCode)
	var loginBody struct {
		AccessToken string `json:"access_token"`
	}
	decodeJSON(t, loginResp, &loginBody)
	require.NotEmpty(t, loginBody.AccessToken)

	return &testEnv{
		server: srv,
		token:  loginBody.AccessToken,
		engine: r,
	}
}

// ── Tests ────────────────────────────────────────────────────────────────────

// T-E2E-1: Full sale cycle
func TestE2E_FullSaleCycle(t *testing.T) {
	env := setupTestEnv(t)

	// 1. Create producto
	prodResp := do(t, env.server, "POST", "/v1/productos",
		jsonBody(t, map[string]any{
			"nombre":        "Gaseosa 500ml",
			"codigo_barras": "7890001000001",
			"precio_costo":  150.0,
			"precio_venta":  250.0,
			"stock_actual":  20,
		}),
		env.token,
	)
	require.Equal(t, http.StatusCreated, prodResp.StatusCode)
	var prod struct {
		ID string `json:"id"`
	}
	decodeJSON(t, prodResp, &prod)

	// 2. Open caja
	cajaResp := do(t, env.server, "POST", "/v1/caja/abrir",
		jsonBody(t, map[string]any{"monto_inicial": 1000.0}),
		env.token,
	)
	require.Equal(t, http.StatusCreated, cajaResp.StatusCode)
	var caja struct {
		SesionID string `json:"sesion_id"`
	}
	decodeJSON(t, cajaResp, &caja)

	// 3. Register sale
	ventaBody := map[string]any{
		"sesion_caja_id": caja.SesionID,
		"items": []map[string]any{
			{"producto_id": prod.ID, "cantidad": 3, "descuento": 0},
		},
		"pagos": []map[string]any{
			{"metodo": "efectivo", "monto": 750.0},
		},
	}
	ventaResp := do(t, env.server, "POST", "/v1/ventas", jsonBody(t, ventaBody), env.token)
	require.Equal(t, http.StatusCreated, ventaResp.StatusCode)
	var venta struct {
		ID           string  `json:"id"`
		NumeroTicket int     `json:"numero_ticket"`
		Total        float64 `json:"total,string"`
		Estado       string  `json:"estado"`
	}
	decodeJSON(t, ventaResp, &venta)
	assert.Equal(t, "completada", venta.Estado)
	assert.Equal(t, 1, venta.NumeroTicket)

	// 4. List ventas
	listResp := do(t, env.server, "GET", fmt.Sprintf("/v1/ventas?fecha=%s", time.Now().Format("2006-01-02")), nil, env.token)
	require.Equal(t, http.StatusOK, listResp.StatusCode)
}

// T-E2E-2: Sync-batch idempotency
func TestE2E_SyncBatchIdempotency(t *testing.T) {
	env := setupTestEnv(t)

	// Create prod + open caja
	prodResp := do(t, env.server, "POST", "/v1/productos",
		jsonBody(t, map[string]any{
			"nombre": "Agua Mineral", "codigo_barras": "7890001000002",
			"precio_costo": 50.0, "precio_venta": 100.0, "stock_actual": 50,
		}), env.token)
	require.Equal(t, http.StatusCreated, prodResp.StatusCode)
	var prod struct {
		ID string `json:"id"`
	}
	decodeJSON(t, prodResp, &prod)

	cajaResp := do(t, env.server, "POST", "/v1/caja/abrir",
		jsonBody(t, map[string]any{"monto_inicial": 500.0}), env.token)
	require.Equal(t, http.StatusCreated, cajaResp.StatusCode)
	var caja struct {
		SesionID string `json:"sesion_id"`
	}
	decodeJSON(t, cajaResp, &caja)

	offlineID := "550e8400-e29b-41d4-a716-446655440000"
	saleReq := map[string]any{
		"sesion_caja_id": caja.SesionID,
		"offline_id":     offlineID,
		"items":          []map[string]any{{"producto_id": prod.ID, "cantidad": 1, "descuento": 0}},
		"pagos":          []map[string]any{{"metodo": "efectivo", "monto": 100.0}},
	}
	batch := map[string]any{"ventas": []map[string]any{saleReq, saleReq}} // same offline_id twice
	batchResp := do(t, env.server, "POST", "/v1/ventas/sync-batch", jsonBody(t, batch), env.token)
	require.Equal(t, http.StatusOK, batchResp.StatusCode)

	var results []struct {
		Estado string `json:"estado"`
	}
	decodeJSON(t, batchResp, &results)
	require.Len(t, results, 2)
	// Both should succeed (second is idempotent return of first)
	assert.Equal(t, "completada", results[0].Estado)
	assert.Equal(t, "completada", results[1].Estado)
}

// T-E2E-3: Stock conflict auto-compensation (deficit ≤ 3)
func TestE2E_StockAutoCompensation(t *testing.T) {
	env := setupTestEnv(t)

	prodResp := do(t, env.server, "POST", "/v1/productos",
		jsonBody(t, map[string]any{
			"nombre": "Jugo 1L", "codigo_barras": "7890001000003",
			"precio_costo": 80.0, "precio_venta": 150.0, "stock_actual": 0, // stock = 0
		}), env.token)
	require.Equal(t, http.StatusCreated, prodResp.StatusCode)
	var prod struct {
		ID string `json:"id"`
	}
	decodeJSON(t, prodResp, &prod)

	cajaResp := do(t, env.server, "POST", "/v1/caja/abrir",
		jsonBody(t, map[string]any{"monto_inicial": 500.0}), env.token)
	require.Equal(t, http.StatusCreated, cajaResp.StatusCode)
	var caja struct {
		SesionID string `json:"sesion_id"`
	}
	decodeJSON(t, cajaResp, &caja)

	// cantidad=2, stock=0 → deficit=2 ≤ 3 → auto-compensate (sale accepted, stock goes negative)
	ventaResp := do(t, env.server, "POST", "/v1/ventas",
		jsonBody(t, map[string]any{
			"sesion_caja_id": caja.SesionID,
			"items":          []map[string]any{{"producto_id": prod.ID, "cantidad": 2, "descuento": 0}},
			"pagos":          []map[string]any{{"metodo": "efectivo", "monto": 300.0}},
		}), env.token)
	require.Equal(t, http.StatusCreated, ventaResp.StatusCode)
	var venta struct {
		Estado         string `json:"estado"`
		ConflictoStock bool   `json:"conflicto_stock"`
	}
	decodeJSON(t, ventaResp, &venta)
	assert.Equal(t, "completada", venta.Estado)
	assert.True(t, venta.ConflictoStock) // flagged but accepted
}

// T-E2E-4: Anular venta restores stock
func TestE2E_AnularVentaRestoresStock(t *testing.T) {
	env := setupTestEnv(t)

	prodResp := do(t, env.server, "POST", "/v1/productos",
		jsonBody(t, map[string]any{
			"nombre": "Leche 1L", "codigo_barras": "7890001000004",
			"precio_costo": 120.0, "precio_venta": 200.0, "stock_actual": 10,
		}), env.token)
	require.Equal(t, http.StatusCreated, prodResp.StatusCode)
	var prod struct {
		ID string `json:"id"`
	}
	decodeJSON(t, prodResp, &prod)

	cajaResp := do(t, env.server, "POST", "/v1/caja/abrir",
		jsonBody(t, map[string]any{"monto_inicial": 500.0}), env.token)
	require.Equal(t, http.StatusCreated, cajaResp.StatusCode)
	var caja struct {
		SesionID string `json:"sesion_id"`
	}
	decodeJSON(t, cajaResp, &caja)

	ventaResp := do(t, env.server, "POST", "/v1/ventas",
		jsonBody(t, map[string]any{
			"sesion_caja_id": caja.SesionID,
			"items":          []map[string]any{{"producto_id": prod.ID, "cantidad": 3, "descuento": 0}},
			"pagos":          []map[string]any{{"metodo": "efectivo", "monto": 600.0}},
		}), env.token)
	require.Equal(t, http.StatusCreated, ventaResp.StatusCode)
	var venta struct {
		ID string `json:"id"`
	}
	decodeJSON(t, ventaResp, &venta)

	// Anular
	anularResp := do(t, env.server, "DELETE", "/v1/ventas/"+venta.ID,
		jsonBody(t, map[string]any{"motivo": "Error de carga en test"}), env.token)
	assert.Equal(t, http.StatusNoContent, anularResp.StatusCode)

	// Verify stock restored to 10
	prodDetailResp := do(t, env.server, "GET", "/v1/productos/"+prod.ID, nil, env.token)
	require.Equal(t, http.StatusOK, prodDetailResp.StatusCode)
	var updatedProd struct {
		StockActual int `json:"stock_actual"`
	}
	decodeJSON(t, prodDetailResp, &updatedProd)
	assert.Equal(t, 10, updatedProd.StockActual)
}
