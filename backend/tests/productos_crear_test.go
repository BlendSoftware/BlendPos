package tests

import (
	"context"
	"strings"
	"testing"

	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/service"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

// ── Crear producto: colisión de código de barras ─────────────────────────────
//
// El índice único idx_productos_barcode cubre TODOS los productos, activos e
// inactivos. Pero "eliminar" un producto sólo marca activo=false, así que un
// producto desactivado sigue ocupando su código y es invisible para la app.
//
// Antes de este fix, Crear() consultaba únicamente productos activos: no
// encontraba el duplicado, mandaba el INSERT igual y Postgres lo rechazaba con
// el error crudo `duplicate key value violates unique constraint ...`, que
// llegaba tal cual a la pantalla del cajero.

func nuevoProductoRequest(codigo, nombre string) dto.CrearProductoRequest {
	return dto.CrearProductoRequest{
		CodigoBarras: codigo,
		Nombre:       nombre,
		Categoria:    "Almacen",
		PrecioCosto:  decimal.NewFromInt(100),
		PrecioVenta:  decimal.NewFromInt(150),
		StockActual:  10,
		StockMinimo:  5,
		UnidadMedida: "unidad",
	}
}

func TestCrearProducto_CodigoDeBarrasDeProductoDesactivado(t *testing.T) {
	repo := newStubProductoRepo()
	desactivado := &model.Producto{
		ID:           uuid.New(),
		CodigoBarras: "7798142880019",
		Nombre:       "TOSTADA DE ARROZ CLASICA",
		Activo:       false,
	}
	repo.productos[desactivado.ID] = desactivado

	svc := service.NewProductoService(repo, nil, nil, nil)

	_, err := svc.Crear(context.Background(),
		nuevoProductoRequest("7798142880019", "Tostada de Arroz Clasica"))

	require.Error(t, err, "crear con el código de un producto desactivado debe fallar")

	msg := err.Error()
	require.NotContains(t, strings.ToLower(msg), "duplicate key",
		"el error de Postgres no debe llegar al usuario")
	require.Contains(t, strings.ToLower(msg), "desactivado",
		"el mensaje debe explicar que el producto existe pero está desactivado")
	require.Contains(t, msg, "TOSTADA DE ARROZ CLASICA",
		"el mensaje debe nombrar el producto que ocupa el código")
}

func TestCrearProducto_CodigoDeBarrasDeProductoActivo(t *testing.T) {
	repo := newStubProductoRepo()
	activo := &model.Producto{
		ID:           uuid.New(),
		CodigoBarras: "7790387013627",
		Nombre:       "YERBA TARAGUI ROJA",
		Activo:       true,
	}
	repo.productos[activo.ID] = activo

	svc := service.NewProductoService(repo, nil, nil, nil)

	_, err := svc.Crear(context.Background(),
		nuevoProductoRequest("7790387013627", "Yerba Taragui Roja"))

	require.Error(t, err)
	require.NotContains(t, strings.ToLower(err.Error()), "duplicate key")
	require.Contains(t, err.Error(), "YERBA TARAGUI ROJA")
}

func TestCrearProducto_CodigoLibre(t *testing.T) {
	repo := newStubProductoRepo()
	ocupado := &model.Producto{
		ID:           uuid.New(),
		CodigoBarras: "7798142880019",
		Nombre:       "TOSTADA DE ARROZ CLASICA",
		Activo:       false,
	}
	repo.productos[ocupado.ID] = ocupado

	svc := service.NewProductoService(repo, nil, nil, nil)

	resp, err := svc.Crear(context.Background(),
		nuevoProductoRequest("7790070509123", "YERBA CHAMIGO"))

	require.NoError(t, err, "un código libre debe poder crearse")
	require.NotNil(t, resp)
	require.Equal(t, "YERBA CHAMIGO", resp.Nombre)
}
