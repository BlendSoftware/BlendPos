package handler

import (
	"net/http"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CompraHandler struct{ svc service.CompraService }

func NewCompraHandler(svc service.CompraService) *CompraHandler {
	return &CompraHandler{svc: svc}
}

func (h *CompraHandler) Crear(c *gin.Context) {
	var req dto.CrearCompraRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.Crear(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *CompraHandler) Listar(c *gin.Context) {
	var filter dto.CompraFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Limit < 1 {
		filter.Limit = 20
	}
	resp, err := h.svc.Listar(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("Error al listar compras"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *CompraHandler) ObtenerPorID(c *gin.Context) {
	id := c.Param("id")
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("id inválido"))
		return
	}
	resp, err := h.svc.ObtenerPorID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *CompraHandler) ActualizarEstado(c *gin.Context) {
	id := c.Param("id")
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("id inválido"))
		return
	}
	var req dto.ActualizarCompraRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.ActualizarEstado(c.Request.Context(), id, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *CompraHandler) Eliminar(c *gin.Context) {
	id := c.Param("id")
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("id inválido"))
		return
	}
	if err := h.svc.Eliminar(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusNotFound, apierror.New(err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}
