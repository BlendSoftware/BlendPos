package handler

import (
	"net/http"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type InventarioHandler struct{ svc service.InventarioService }

func NewInventarioHandler(svc service.InventarioService) *InventarioHandler {
	return &InventarioHandler{svc: svc}
}

func (h *InventarioHandler) CrearVinculo(c *gin.Context) {
	var req dto.CrearVinculoRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.CrearVinculo(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *InventarioHandler) ListarVinculos(c *gin.Context) {
	resp, err := h.svc.ListarVinculos(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("Error al listar vinculos"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *InventarioHandler) DesarmeManual(c *gin.Context) {
	var req dto.DesarmeManualRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.DesarmeManual(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *InventarioHandler) ObtenerAlertas(c *gin.Context) {
	resp, err := h.svc.ObtenerAlertas(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("Error al obtener alertas"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

type FacturacionHandler struct{ svc service.FacturacionService }

func NewFacturacionHandler(svc service.FacturacionService) *FacturacionHandler {
	return &FacturacionHandler{svc: svc}
}

func (h *FacturacionHandler) ObtenerComprobante(c *gin.Context) {
	ventaID, err := uuid.Parse(c.Param("venta_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID invalido"))
		return
	}
	resp, err := h.svc.ObtenerComprobante(c.Request.Context(), ventaID)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Comprobante no encontrado"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *FacturacionHandler) DescargarPDF(c *gin.Context) {
	// TODO (Phase 5)
	c.JSON(http.StatusNotImplemented, apierror.New("not implemented"))
}

type ProveedoresHandler struct{ svc service.ProveedorService }

func NewProveedoresHandler(svc service.ProveedorService) *ProveedoresHandler {
	return &ProveedoresHandler{svc: svc}
}

func (h *ProveedoresHandler) Crear(c *gin.Context)        { c.JSON(http.StatusNotImplemented, nil) }
func (h *ProveedoresHandler) Listar(c *gin.Context)       { c.JSON(http.StatusNotImplemented, nil) }
func (h *ProveedoresHandler) ObtenerPorID(c *gin.Context) { c.JSON(http.StatusNotImplemented, nil) }
func (h *ProveedoresHandler) Actualizar(c *gin.Context)   { c.JSON(http.StatusNotImplemented, nil) }
func (h *ProveedoresHandler) Eliminar(c *gin.Context)     { c.JSON(http.StatusNotImplemented, nil) }
func (h *ProveedoresHandler) ActualizarPreciosMasivo(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, nil)
}
func (h *ProveedoresHandler) ImportarCSV(c *gin.Context) { c.JSON(http.StatusNotImplemented, nil) }
