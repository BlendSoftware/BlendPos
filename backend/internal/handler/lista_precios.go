package handler

import (
	"net/http"
	"path/filepath"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/middleware"
	"blendpos/internal/model"
	"blendpos/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ListaPreciosHandler struct {
	svc             service.ListaPreciosService
	configFiscalSvc service.ConfiguracionFiscalService
	pdfStoragePath  string
}

func NewListaPreciosHandler(svc service.ListaPreciosService, cfgFiscalSvc service.ConfiguracionFiscalService, pdfPath string) *ListaPreciosHandler {
	return &ListaPreciosHandler{svc: svc, configFiscalSvc: cfgFiscalSvc, pdfStoragePath: pdfPath}
}

func (h *ListaPreciosHandler) Crear(c *gin.Context) {
	var req dto.CrearListaPreciosRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.Crear(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	id, _ := uuid.Parse(resp.ID)
	middleware.AuditLog(c, "create", "lista_precios", &id, map[string]interface{}{"nombre": req.Nombre})
	c.JSON(http.StatusCreated, resp)
}

func (h *ListaPreciosHandler) Listar(c *gin.Context) {
	var filter dto.ListaPreciosFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	resp, err := h.svc.Listar(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("Error al listar listas de precios"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ListaPreciosHandler) ObtenerPorID(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	resp, err := h.svc.ObtenerPorID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Lista de precios no encontrada"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ListaPreciosHandler) Actualizar(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	var req dto.ActualizarListaPreciosRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.Actualizar(c.Request.Context(), id, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	middleware.AuditLog(c, "update", "lista_precios", &id, req)
	c.JSON(http.StatusOK, resp)
}

func (h *ListaPreciosHandler) Eliminar(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	if err := h.svc.Eliminar(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	middleware.AuditLog(c, "delete", "lista_precios", &id, nil)
	c.Status(http.StatusNoContent)
}

func (h *ListaPreciosHandler) AsignarProducto(c *gin.Context) {
	listaID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	var req dto.AsignarProductoRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.AsignarProducto(c.Request.Context(), listaID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ListaPreciosHandler) QuitarProducto(c *gin.Context) {
	listaID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	productoID, err := uuid.Parse(c.Param("productoId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("producto_id inválido"))
		return
	}
	if err := h.svc.QuitarProducto(c.Request.Context(), listaID, productoID); err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Producto no encontrado en la lista"))
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *ListaPreciosHandler) AplicarMasivo(c *gin.Context) {
	listaID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	var req dto.AplicarMasivoRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.AplicarMasivo(c.Request.Context(), listaID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	middleware.AuditLog(c, "aplicar_masivo", "lista_precios", &listaID, req)
	c.JSON(http.StatusOK, resp)
}

func (h *ListaPreciosHandler) DescargarPDF(c *gin.Context) {
	listaID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}

	var configFiscal *model.ConfiguracionFiscal
	if h.configFiscalSvc != nil {
		cfg, err := h.configFiscalSvc.ObtenerConfiguracionCompleta(c.Request.Context())
		if err == nil {
			configFiscal = cfg
		}
	}

	filePath, err := h.svc.GenerarPDF(c.Request.Context(), listaID, configFiscal, h.pdfStoragePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("Error al generar PDF: "+err.Error()))
		return
	}

	c.FileAttachment(filePath, filepath.Base(filePath))
}
