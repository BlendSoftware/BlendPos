package handler

import (
	"net/http"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type PromocionHandler struct{ svc service.PromocionService }

func NewPromocionHandler(svc service.PromocionService) *PromocionHandler {
	return &PromocionHandler{svc: svc}
}

// Crear POST /v1/promociones
func (h *PromocionHandler) Crear(c *gin.Context) {
	var req dto.CrearPromocionRequest
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

// Listar GET /v1/promociones
func (h *PromocionHandler) Listar(c *gin.Context) {
	soloActivas := c.Query("activas") == "true"
	resp, err := h.svc.Listar(c.Request.Context(), soloActivas)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("Error al listar promociones"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ObtenerPorID GET /v1/promociones/:id
func (h *PromocionHandler) ObtenerPorID(c *gin.Context) {
	if _, err := uuid.Parse(c.Param("id")); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	resp, err := h.svc.ObtenerPorID(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// Actualizar PUT /v1/promociones/:id
func (h *PromocionHandler) Actualizar(c *gin.Context) {
	if _, err := uuid.Parse(c.Param("id")); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	var req dto.ActualizarPromocionRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.Actualizar(c.Request.Context(), c.Param("id"), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// Eliminar DELETE /v1/promociones/:id
func (h *PromocionHandler) Eliminar(c *gin.Context) {
	if _, err := uuid.Parse(c.Param("id")); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	if err := h.svc.Eliminar(c.Request.Context(), c.Param("id")); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
