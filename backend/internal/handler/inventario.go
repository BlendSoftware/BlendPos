package handler

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/infra"
	"blendpos/internal/middleware"
	"blendpos/internal/repository"
	"blendpos/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
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

func (h *InventarioHandler) EliminarVinculo(c *gin.Context) {
	id := c.Param("id")
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("id inválido"))
		return
	}
	if err := h.svc.EliminarVinculo(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusNotFound, apierror.New(err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *InventarioHandler) ActualizarVinculo(c *gin.Context) {
	id := c.Param("id")
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("id inválido"))
		return
	}
	var req dto.ActualizarVinculoRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.ActualizarVinculo(c.Request.Context(), id, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
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

func (h *InventarioHandler) ListarMovimientos(c *gin.Context) {
	var filter dto.MovimientoStockFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.Limit < 1 {
		filter.Limit = 100
	}
	resp, err := h.svc.ListarMovimientos(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("Error al listar movimientos"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

type FacturacionHandler struct {
	svc             service.FacturacionService
	pdfBasePath     string // base directory for PDF storage — path traversal guard
	comprobanteRepo repository.ComprobanteRepository
	ventaRepo       repository.VentaRepository
	configFiscalSvc service.ConfiguracionFiscalService
	dispatcher      interface{} // interface{} para evitar import circular
}

func NewFacturacionHandler(
	svc service.FacturacionService,
	pdfBasePath string,
	comprobanteRepo repository.ComprobanteRepository,
	ventaRepo repository.VentaRepository,
	configFiscalSvc service.ConfiguracionFiscalService,
) *FacturacionHandler {
	return &FacturacionHandler{
		svc:             svc,
		pdfBasePath:     pdfBasePath,
		comprobanteRepo: comprobanteRepo,
		ventaRepo:       ventaRepo,
		configFiscalSvc: configFiscalSvc,
	}
}

func (h *FacturacionHandler) ObtenerComprobante(c *gin.Context) {
	rawVentaID := c.Param("venta_id")
	ventaID, err := uuid.Parse(rawVentaID)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID invalido"))
		return
	}
	resp, err := h.svc.ObtenerComprobante(c.Request.Context(), ventaID)
	if err != nil {
		if h.ventaRepo != nil {
			venta, offlineErr := h.ventaRepo.FindByOfflineID(c.Request.Context(), rawVentaID)
			if offlineErr == nil && venta != nil {
				resp, err = h.svc.ObtenerComprobante(c.Request.Context(), venta.ID)
			}
		}
		if err != nil {
			c.JSON(http.StatusNotFound, apierror.New("Comprobante no encontrado"))
			return
		}
	}
	c.JSON(http.StatusOK, resp)
}

// DescargarPDF GET /v1/facturacion/pdf/:id
// Serves the generated PDF receipt as a file download (AC-06.4).
// Access control: administradores can download any PDF; supervisores are
// restricted to comprobantes belonging to their own punto_de_venta.
func (h *FacturacionHandler) DescargarPDF(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}

	// Ownership check — must happen before serving the file.
	claims := middleware.GetClaims(c)
	if err := h.svc.VerificarAccesoComprobante(c.Request.Context(), id, claims.Rol, claims.PuntoDeVenta); err != nil {
		c.JSON(http.StatusForbidden, apierror.New("Acceso denegado"))
		return
	}

	pdfPath, err := h.svc.ObtenerPDFPath(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New(err.Error()))
		return
	}

	// ── Path traversal guard (S-04) ────────────────────────────────────────
	// Resolve absolute paths to eliminate ".." segments and symlinks, then
	// verify the result is still inside the configured PDF storage directory.
	if err := validatePDFPath(h.pdfBasePath, pdfPath); err != nil {
		log.Warn().Err(err).Str("pdfPath", pdfPath).Msg("path traversal attempt blocked")
		c.JSON(http.StatusForbidden, apierror.New("Access denied"))
		return
	}

	// Ensure file exists on disk before attempting to serve.
	if _, err := os.Stat(pdfPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, apierror.New("PDF file not found on disk"))
		return
	}

	fileName := filepath.Base(pdfPath)
	c.Header("Content-Disposition", "attachment; filename=\""+fileName+"\"")
	c.Header("Content-Type", "application/pdf")
	c.File(pdfPath)
}

// validatePDFPath ensures the resolved pdfPath is inside basePath, preventing
// path traversal attacks (e.g., ../../../../etc/passwd stored in DB).
func validatePDFPath(basePath, pdfPath string) error {
	absBase, err := filepath.Abs(basePath)
	if err != nil {
		return fmt.Errorf("cannot resolve base path: %w", err)
	}
	absPath, err := filepath.Abs(pdfPath)
	if err != nil {
		return fmt.Errorf("cannot resolve pdf path: %w", err)
	}
	// Ensure the resolved path starts with the base directory + separator
	if !strings.HasPrefix(absPath, absBase+string(filepath.Separator)) {
		return fmt.Errorf("path traversal detected: %s is outside %s", absPath, absBase)
	}
	return nil
}

// AnularComprobante DELETE /v1/facturacion/:id
// Transitions an emitido comprobante to anulado state.
func (h *FacturacionHandler) AnularComprobante(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	var body struct {
		Motivo string `json:"motivo" validate:"required,min=5"`
	}
	if !bindAndValidate(c, &body) {
		return
	}
	resp, err := h.svc.AnularComprobante(c.Request.Context(), id, body.Motivo)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ReintentarComprobante POST /v1/facturacion/:id/reintentar
// Resets an error/rechazado comprobante back to pendiente for retry.
func (h *FacturacionHandler) ReintentarComprobante(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}
	resp, err := h.svc.ReintentarComprobante(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// CancelarPendientes POST /v1/facturacion/cancelar-pendientes
// Marca como 'error' todos los comprobantes pendientes con next_retry_at activo.
// Solo administradores. Útil para limpiar reintentos con datos incorrectos.
func (h *FacturacionHandler) CancelarPendientes(c *gin.Context) {
	cancelados, err := h.comprobanteRepo.CancelarPendientes(
		c.Request.Context(),
		"Cancelado manualmente por administrador",
	)
	if err != nil {
		log.Error().Err(err).Msg("CancelarPendientes: DB error")
		c.JSON(http.StatusInternalServerError, apierror.New("Error al cancelar comprobantes pendientes"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"cancelados": cancelados})
}

// RegenerarPDF POST /v1/facturacion/:id/regen-pdf
// Regenera el PDF fiscal (A4) de un comprobante que ya tiene CAE.
// Útil para comprobantes que fueron generados como ticket por falta de config fiscal.
func (h *FacturacionHandler) RegenerarPDF(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}

	ctx := c.Request.Context()

	// Access check
	claims := middleware.GetClaims(c)
	if err := h.svc.VerificarAccesoComprobante(ctx, id, claims.Rol, claims.PuntoDeVenta); err != nil {
		c.JSON(http.StatusForbidden, apierror.New("Acceso denegado"))
		return
	}

	// Get comprobante
	comp, err := h.comprobanteRepo.FindByID(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Comprobante no encontrado"))
		return
	}

	// Only fiscal comprobantes with CAE can get a fiscal PDF
	if comp.CAE == nil || *comp.CAE == "" {
		c.JSON(http.StatusBadRequest, apierror.New("El comprobante no tiene CAE — solo facturas electrónicas pueden regenerarse"))
		return
	}

	// Get fiscal config
	fiscalCfg, err := h.configFiscalSvc.ObtenerConfiguracionCompleta(ctx)
	if err != nil || fiscalCfg == nil || fiscalCfg.CUITEmsior == "" {
		c.JSON(http.StatusServiceUnavailable, apierror.New("Configuración fiscal no disponible"))
		return
	}

	// Get venta with all details
	venta, err := h.ventaRepo.FindByID(ctx, comp.VentaID)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Venta no encontrada"))
		return
	}

	// Generate fiscal A4 PDF
	pdfPath, err := infra.GenerateFacturaFiscalPDF(
		venta,
		comp,
		fiscalCfg,
		h.pdfBasePath,
	)
	if err != nil {
		log.Error().Err(err).Str("comprobante_id", id.String()).Msg("RegenerarPDF: generation failed")
		c.JSON(http.StatusInternalServerError, apierror.New("Error al generar PDF fiscal"))
		return
	}

	// Update pdf_path in DB
	comp.PDFPath = &pdfPath
	if err := h.comprobanteRepo.Update(ctx, comp); err != nil {
		log.Error().Err(err).Str("comprobante_id", id.String()).Msg("RegenerarPDF: failed to update pdf_path")
	}

	log.Info().Str("comprobante_id", id.String()).Str("pdf_path", pdfPath).Msg("RegenerarPDF: PDF fiscal regenerado")
	c.JSON(http.StatusOK, gin.H{"message": "PDF fiscal regenerado correctamente", "pdf_path": pdfPath})
}

// ObtenerHTML GET /v1/facturacion/html/:id
// Devuelve un HTML autocontenido de la factura fiscal lista para imprimir/guardar como PDF desde el navegador.
func (h *FacturacionHandler) ObtenerHTML(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}

	ctx := c.Request.Context()
	claims := middleware.GetClaims(c)
	if err := h.svc.VerificarAccesoComprobante(ctx, id, claims.Rol, claims.PuntoDeVenta); err != nil {
		c.JSON(http.StatusForbidden, apierror.New("Acceso denegado"))
		return
	}

	comp, err := h.comprobanteRepo.FindByID(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Comprobante no encontrado"))
		return
	}

	fiscalCfg, err := h.configFiscalSvc.ObtenerConfiguracionCompleta(ctx)
	if err != nil || fiscalCfg == nil || fiscalCfg.CUITEmsior == "" {
		c.JSON(http.StatusServiceUnavailable, apierror.New("Configuración fiscal no disponible"))
		return
	}

	venta, err := h.ventaRepo.FindByID(ctx, comp.VentaID)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Venta no encontrada"))
		return
	}

	htmlContent, err := infra.GenerateFacturaHTML(venta, comp, fiscalCfg)
	if err != nil {
		log.Error().Err(err).Str("comprobante_id", id.String()).Msg("ObtenerHTML: generation failed")
		c.JSON(http.StatusInternalServerError, apierror.New("Error al generar HTML de la factura"))
		return
	}

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, "%s", htmlContent)
}

// SetDispatcher inyecta el dispatcher después de la construcción para enviar emails.
// Se usa para evitar imports circulares.
func (h *FacturacionHandler) SetDispatcher(dispatcher interface{}) {
	h.dispatcher = dispatcher
}

// EnviarEmailComprobante POST /v1/facturacion/:id/enviar-email
// Encola un job de email para enviar el comprobante a la dirección indicada.
func (h *FacturacionHandler) EnviarEmailComprobante(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID inválido"))
		return
	}

	var body struct {
		Email string `json:"email" validate:"required,email"`
	}
	if !bindAndValidate(c, &body) {
		return
	}

	ctx := c.Request.Context()

	// Access check
	claims := middleware.GetClaims(c)
	if err := h.svc.VerificarAccesoComprobante(ctx, id, claims.Rol, claims.PuntoDeVenta); err != nil {
		c.JSON(http.StatusForbidden, apierror.New("Acceso denegado"))
		return
	}

	// Get comprobante
	comp, err := h.comprobanteRepo.FindByID(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Comprobante no encontrado"))
		return
	}

	// Get venta for email content
	venta, err := h.ventaRepo.FindByID(ctx, comp.VentaID)
	if err != nil {
		c.JSON(http.StatusNotFound, apierror.New("Venta no encontrada"))
		return
	}

	// Prepare PDF path (may be empty if not yet generated)
	pdfPath := ""
	if comp.PDFPath != nil {
		pdfPath = *comp.PDFPath
	}

	// Build email payload
	emailPayload := map[string]interface{}{
		"to_email": body.Email,
		"subject":  fmt.Sprintf("Comprobante BlendPOS — Ticket #%d", venta.NumeroTicket),
		"body": func() string {
			if pdfPath != "" {
				return fmt.Sprintf("Adjunto encontrarás tu comprobante de compra.\nTotal: $%.2f\n\nGracias por tu compra.", venta.Total.InexactFloat64())
			}
			return fmt.Sprintf("Comprobante de tu compra.\nTotal: $%.2f\n\nTicket #%d\n\nPuedes solicitar una copia impresa en nuestro local.\nGracias por tu compra.", venta.Total.InexactFloat64(), venta.NumeroTicket)
		}(),
		"pdf_path": pdfPath,
	}

	// Enqueue email job using dispatcher
	if h.dispatcher == nil {
		c.JSON(http.StatusServiceUnavailable, apierror.New("Servicio de email no configurado"))
		return
	}

	// Type assertion para acceder al método EnqueueEmail
	type emailDispatcher interface {
		EnqueueEmail(ctx context.Context, payload interface{}) error
	}

	dispatcher, ok := h.dispatcher.(emailDispatcher)
	if !ok {
		log.Error().Msg("EnviarEmailComprobante: dispatcher no implementa EnqueueEmail")
		c.JSON(http.StatusInternalServerError, apierror.New("Error interno de configuración"))
		return
	}

	if err := dispatcher.EnqueueEmail(ctx, emailPayload); err != nil {
		log.Error().Err(err).Str("email", body.Email).Msg("EnviarEmailComprobante: failed to enqueue email")
		c.JSON(http.StatusInternalServerError, apierror.New("Error al encolar el email"))
		return
	}

	log.Info().Str("email", body.Email).Str("comprobante_id", id.String()).Msg("EnviarEmailComprobante: email job enqueued")
	c.JSON(http.StatusOK, gin.H{
		"message": "Email encolado correctamente",
		"email":   body.Email,
	})
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
