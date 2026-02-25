package handler

import (
	"net/http"
	"strconv"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/middleware"
	"blendpos/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CajaHandler struct{ svc service.CajaService }

func NewCajaHandler(svc service.CajaService) *CajaHandler { return &CajaHandler{svc: svc} }

// Abrir godoc
// @Summary Abre una nueva sesion de caja
// @Tags caja
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.AbrirCajaRequest true "Datos de apertura"
// @Success 201 {object} dto.ReporteCajaResponse
// @Failure 400 {object} apierror.APIError
// @Router /v1/caja/abrir [post]
func (h *CajaHandler) Abrir(c *gin.Context) {
	var req dto.AbrirCajaRequest
	if !bindAndValidate(c, &req) {
		return
	}
	claims := middleware.GetClaims(c)
	usuarioID, _ := uuid.Parse(claims.UserID)

	resp, err := h.svc.Abrir(c.Request.Context(), usuarioID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, resp)
}

// Arqueo godoc
// @Summary Realiza el arqueo ciego y cierra la sesion
// @Tags caja
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.ArqueoRequest true "Declaracion de arqueo"
// @Success 200 {object} dto.ArqueoResponse
// @Failure 400 {object} apierror.APIError
// @Router /v1/caja/arqueo [post]
func (h *CajaHandler) Arqueo(c *gin.Context) {
	var req dto.ArqueoRequest
	if !bindAndValidate(c, &req) {
		return
	}
	// Extract usuario_id from JWT for fallback when sesion_caja_id is empty
	claims := middleware.GetClaims(c)
	var usuarioID *uuid.UUID
	if uid, err := uuid.Parse(claims.UserID); err == nil {
		usuarioID = &uid
	}
	resp, err := h.svc.Arqueo(c.Request.Context(), req, usuarioID)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ObtenerReporte godoc
// @Summary Obtiene el reporte de una sesion de caja
// @Tags caja
// @Produce json
// @Security BearerAuth
// @Param id path string true "ID de sesion"
// @Success 200 {object} dto.ReporteCajaResponse
// @Failure 400 {object} apierror.APIError
// @Failure 404 {object} apierror.APIError
// @Router /v1/caja/{id}/reporte [get]
func (h *CajaHandler) ObtenerReporte(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	resp, err := h.svc.ObtenerReporte(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// RegistrarMovimiento godoc
// @Summary Registra un ingreso o egreso manual en caja
// @Tags caja
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.MovimientoManualRequest true "Movimiento manual"
// @Success 204
// @Failure 400 {object} apierror.APIError
// @Router /v1/caja/movimiento [post]
func (h *CajaHandler) RegistrarMovimiento(c *gin.Context) {
	var req dto.MovimientoManualRequest
	if !bindAndValidate(c, &req) {
		return
	}
	if err := h.svc.RegistrarMovimiento(c.Request.Context(), req); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}

// GetActiva returns the currently open cash session for the authenticated user.
func (h *CajaHandler) GetActiva(c *gin.Context) {
	claims := middleware.GetClaims(c)
	usuarioID, err := uuid.Parse(claims.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID de usuario inválido"))
		return
	}
	resp, err := h.svc.GetActiva(c.Request.Context(), usuarioID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New(err.Error()))
		return
	}
	if resp == nil {
		c.JSON(http.StatusNotFound, apierror.New("Sin sesión activa"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// Historial returns a paginated list of closed cash sessions.
func (h *CajaHandler) Historial(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	resp, err := h.svc.Historial(c.Request.Context(), page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": resp, "page": page, "limit": limit})
}
