package handler

import (
	"net/http"
	"strconv"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// HistorialPreciosHandler serves RF-26: price-change history per product.
type HistorialPreciosHandler struct {
	repo repository.HistorialPrecioRepository
}

func NewHistorialPreciosHandler(repo repository.HistorialPrecioRepository) *HistorialPreciosHandler {
	return &HistorialPreciosHandler{repo: repo}
}

// ListarPorProducto godoc
// @Summary      Historial de precios de un producto
// @Description  Retorna el historial inmutable de cambios de precio de un producto, ordenado por fecha descendente.
// @Tags         productos
// @Security     BearerAuth
// @Param        id    path     string  true  "UUID del producto"
// @Param        page  query    int     false "Página (default 1)"
// @Param        limit query    int     false "Registros por página (default 50, max 200)"
// @Success      200   {object} dto.HistorialPrecioListResponse
// @Failure      400   {object} apierror.APIError
// @Failure      404   {object} apierror.APIError
// @Router       /v1/productos/{id}/historial-precios [get]
func (h *HistorialPreciosHandler) ListarPorProducto(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID de producto inválido"))
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

	rows, total, err := h.repo.ListByProducto(c.Request.Context(), id, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("Error al obtener historial de precios"))
		return
	}

	data := make([]dto.HistorialPrecioItem, 0, len(rows))
	for _, r := range rows {
		item := historialToDTO(&r)
		data = append(data, item)
	}

	c.JSON(http.StatusOK, dto.HistorialPrecioListResponse{
		Data:  data,
		Total: total,
		Page:  page,
		Limit: limit,
	})
}

func historialToDTO(h *model.HistorialPrecio) dto.HistorialPrecioItem {
	item := dto.HistorialPrecioItem{
		ID:                 h.ID.String(),
		ProductoID:         h.ProductoID.String(),
		CostoAntes:         h.CostoAntes,
		CostoDespues:       h.CostoDespues,
		VentaAntes:         h.VentaAntes,
		VentaDespues:       h.VentaDespues,
		PorcentajeAplicado: h.PorcentajeAplicado,
		Motivo:             h.Motivo,
		CreatedAt:          h.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
	if h.ProveedorID != nil {
		s := h.ProveedorID.String()
		item.ProveedorID = &s
	}
	if h.Proveedor != nil {
		item.ProveedorNombre = &h.Proveedor.RazonSocial
	}
	return item
}
