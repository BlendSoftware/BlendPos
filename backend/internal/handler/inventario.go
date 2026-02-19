package handler

import (
	"io"
	"net/http"
	"strings"

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

func (h *ProveedoresHandler) Crear(c *gin.Context) {
	var req dto.CrearProveedorRequest
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

func (h *ProveedoresHandler) Listar(c *gin.Context) {
	resp, err := h.svc.Listar(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("Error al listar proveedores"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ProveedoresHandler) ObtenerPorID(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	resp, err := h.svc.ObtenerPorID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Proveedor no encontrado"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ProveedoresHandler) Actualizar(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	var req dto.CrearProveedorRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.Actualizar(c.Request.Context(), id, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ProveedoresHandler) Eliminar(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	if err := h.svc.Eliminar(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Proveedor no encontrado"))
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

// ActualizarPreciosMasivo POST /v1/proveedores/:id/precios/masivo
// Body: { porcentaje, recalcular_venta, margen_default, preview }
// Si preview=true → 200 con cálculo, sin modificar BD (AC-07.3)
// Si preview=false → 200 con resumen de productos actualizados (AC-07.2)
func (h *ProveedoresHandler) ActualizarPreciosMasivo(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	var req dto.ActualizarPreciosMasivoRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.ActualizarPreciosMasivo(c.Request.Context(), id, req)
	if err != nil {
		if strings.Contains(err.Error(), "no encontrado") {
			c.JSON(http.StatusNotFound, apierror.New(err.Error()))
			return
		}
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ImportarCSV POST /v1/csv/import
// Recibe multipart/form-data con campo "file" (CSV) y campo "proveedor_id" (UUID).
// Tamaño máximo: 5 MB. Solo acepta text/plain o text/csv.
func (h *ProveedoresHandler) ImportarCSV(c *gin.Context) {
	const maxSize = 5 << 20 // 5 MB

	// Obtener proveedor_id del form
	proveedorIDStr := c.PostForm("proveedor_id")
	proveedorID, err := uuid.Parse(proveedorIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("proveedor_id inválido o faltante"))
		return
	}

	// Leer archivo del form
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("campo 'file' es requerido"))
		return
	}
	if fileHeader.Size > maxSize {
		c.JSON(http.StatusRequestEntityTooLarge, apierror.New("el archivo excede el tamaño máximo de 5 MB"))
		return
	}

	// Validar extensión del archivo (AC-07.5)
	name := strings.ToLower(fileHeader.Filename)
	if !strings.HasSuffix(name, ".csv") && !strings.HasSuffix(name, ".txt") {
		c.JSON(http.StatusUnsupportedMediaType, apierror.New("solo se aceptan archivos CSV (.csv, .txt)"))
		return
	}

	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("error al leer el archivo"))
		return
	}
	defer f.Close()

	csvData, err := io.ReadAll(io.LimitReader(f, maxSize))
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("error al leer el archivo"))
		return
	}

	resp, err := h.svc.ImportarCSV(c.Request.Context(), proveedorID, csvData)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}
