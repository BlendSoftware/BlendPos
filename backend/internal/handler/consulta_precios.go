package handler

import (
	"net/http"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/repository"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

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

	// Try Redis cache first to maintain <50ms latency
	// TODO (Phase 2): implement Redis cache layer

	producto, err := h.repo.FindByBarcode(c.Request.Context(), barcode)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Producto no encontrado"))
		return
	}

	c.JSON(http.StatusOK, dto.ConsultaPreciosResponse{
		Nombre:          producto.Nombre,
		PrecioVenta:     producto.PrecioVenta,
		StockDisponible: producto.StockActual,
		Categoria:       producto.Categoria,
		Promocion:       nil, // Promotions module not in current scope
	})
}
