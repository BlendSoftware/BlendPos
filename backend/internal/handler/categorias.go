package handler

import (
	"net/http"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CategoriasHandler struct{ svc service.CategoriaService }

func NewCategoriasHandler(svc service.CategoriaService) *CategoriasHandler {
	return &CategoriasHandler{svc: svc}
}

// Crear POST /v1/categorias
func (h *CategoriasHandler) Crear(c *gin.Context) {
	var req dto.CrearCategoriaRequest
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

// Listar GET /v1/categorias
func (h *CategoriasHandler) Listar(c *gin.Context) {
	resp, err := h.svc.Listar(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("Error al listar categorías"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// Actualizar PUT /v1/categorias/:id
func (h *CategoriasHandler) Actualizar(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	var req dto.ActualizarCategoriaRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, svcErr := h.svc.Actualizar(c.Request.Context(), id, req)
	if svcErr != nil {
		c.JSON(http.StatusBadRequest, apierror.New(svcErr.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// Desactivar DELETE /v1/categorias/:id
func (h *CategoriasHandler) Desactivar(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	if svcErr := h.svc.Desactivar(c.Request.Context(), id); svcErr != nil {
		c.JSON(http.StatusBadRequest, apierror.New(svcErr.Error()))
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
