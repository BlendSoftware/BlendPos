package handler

import (
	"net/http"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/middleware"
	"blendpos/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type VentasHandler struct{ svc service.VentaService }

func NewVentasHandler(svc service.VentaService) *VentasHandler { return &VentasHandler{svc: svc} }

func (h *VentasHandler) RegistrarVenta(c *gin.Context) {
	var req dto.RegistrarVentaRequest
	if !bindAndValidate(c, &req) {
		return
	}
	claims := middleware.GetClaims(c)
	usuarioID, _ := uuid.Parse(claims.UserID)

	resp, err := h.svc.RegistrarVenta(c.Request.Context(), usuarioID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *VentasHandler) AnularVenta(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID invalido"))
		return
	}
	var req dto.AnularVentaRequest
	if !bindAndValidate(c, &req) {
		return
	}
	if err := h.svc.AnularVenta(c.Request.Context(), id, req.Motivo); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}

// ListarVentas returns a paginated, filtered list of sales.
func (h *VentasHandler) ListarVentas(c *gin.Context) {
	var filter dto.VentaFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	resp, err := h.svc.ListVentas(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("Error al listar ventas"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *VentasHandler) SyncBatch(c *gin.Context) {
	var req dto.SyncBatchRequest
	if !bindAndValidate(c, &req) {
		return
	}
	claims := middleware.GetClaims(c)
	usuarioID, _ := uuid.Parse(claims.UserID)

	resp, err := h.svc.SyncBatch(c.Request.Context(), usuarioID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}
