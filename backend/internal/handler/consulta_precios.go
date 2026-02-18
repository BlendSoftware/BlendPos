package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/repository"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

const precioCacheTTL = 4 * time.Hour

// ConsultaPreciosHandler serves the public price check endpoint.
// No authentication required — no side effects whatsoever (RF-27).
type ConsultaPreciosHandler struct {
	repo repository.ProductoRepository
	rdb  *redis.Client
}

func NewConsultaPreciosHandler(repo repository.ProductoRepository, rdb *redis.Client) *ConsultaPreciosHandler {
	return &ConsultaPreciosHandler{repo: repo, rdb: rdb}
}

// GetPrecioPorBarcode godoc
// @Summary Consulta de precio por codigo de barras (sin autenticacion)
// @Tags precio
// @Produce json
// @Param barcode path string true "Codigo de barras"
// @Success 200 {object} dto.ConsultaPreciosResponse
// @Failure 404 {object} apierror.APIError
// @Router /v1/precio/{barcode} [get]
func (h *ConsultaPreciosHandler) GetPrecioPorBarcode(c *gin.Context) {
	barcode := c.Param("barcode")
	ctx := c.Request.Context()
	cacheKey := "precio:" + barcode

	// 1. Try Redis cache (target: <50ms p99 — RF-27)
	if cached, err := h.rdb.Get(ctx, cacheKey).Bytes(); err == nil {
		var resp dto.ConsultaPreciosResponse
		if jsonErr := json.Unmarshal(cached, &resp); jsonErr == nil {
			c.JSON(http.StatusOK, resp)
			return
		}
	}

	// 2. Cache miss — query DB
	producto, err := h.repo.FindByBarcode(ctx, barcode)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Producto no encontrado"))
		return
	}

	resp := dto.ConsultaPreciosResponse{
		Nombre:          producto.Nombre,
		PrecioVenta:     producto.PrecioVenta,
		StockDisponible: producto.StockActual,
		Categoria:       producto.Categoria,
		Promocion:       nil, // Promotions module not in current scope
	}

	// 3. Populate cache — best effort, ignore errors
	if b, jsonErr := json.Marshal(resp); jsonErr == nil {
		_ = h.rdb.Set(context.Background(), cacheKey, b, precioCacheTTL).Err()
	}

	c.JSON(http.StatusOK, resp)
}
