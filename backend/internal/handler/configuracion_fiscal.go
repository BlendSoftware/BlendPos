package handler

import (
	"bytes"
	"encoding/base64"
	"io"
	"net/http"
	"strconv"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/service"

	"github.com/gin-gonic/gin"
)

type ConfiguracionFiscalHandler struct {
	svc service.ConfiguracionFiscalService
}

func NewConfiguracionFiscalHandler(svc service.ConfiguracionFiscalService) *ConfiguracionFiscalHandler {
	return &ConfiguracionFiscalHandler{svc}
}

// Obtener godoc
// @Summary      Obtener Configuración Fiscal
// @Description  Devuelve la configuración fiscal activa sin exponer claves privadas
// @Tags         Configuracion Fiscal
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  dto.ConfiguracionFiscalResponse
// @Router       /v1/configuracion/fiscal [get]
func (h *ConfiguracionFiscalHandler) Obtener(c *gin.Context) {
	cfg, err := h.svc.ObtenerConfiguracion(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": cfg, "message": "Configuración obtenida correctamente"})
}

// Actualizar godoc
// @Summary      Actualizar Configuración Fiscal
// @Description  Actualiza parámetros e inyecta certificados (opcionales) en el sidecar AFIP
// @Tags         Configuracion Fiscal
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  map[string]interface{}
// @Router       /v1/configuracion/fiscal [put]
func (h *ConfiguracionFiscalHandler) Actualizar(c *gin.Context) {
	// Parse multipart form (32 MB max — certs are small)
	if err := c.Request.ParseMultipartForm(32 << 20); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("Error al parsear el formulario: "+err.Error()))
		return
	}

	puntoVenta, _ := strconv.Atoi(c.PostForm("punto_de_venta"))

	req := dto.ConfiguracionFiscalRequest{
		CUITEmsior:      c.PostForm("cuit_emisor"),
		RazonSocial:     c.PostForm("razon_social"),
		CondicionFiscal: c.PostForm("condicion_fiscal"),
		PuntoDeVenta:    puntoVenta,
		Modo:            c.PostForm("modo"),
	}

	if fecha := c.PostForm("fecha_inicio_actividades"); fecha != "" && fecha != "null" {
		req.FechaInicioActividades = &fecha
	}
	if iibb := c.PostForm("iibb"); iibb != "" && iibb != "null" {
		req.IIBB = &iibb
	}

	if req.CUITEmsior == "" || req.CondicionFiscal == "" || req.PuntoDeVenta == 0 {
		c.JSON(http.StatusBadRequest, apierror.New("Faltan campos obligatorios: cuit_emisor, condicion_fiscal, punto_de_venta"))
		return
	}

	// Helper: read an uploaded file as base64 string
	readBase64File := func(key string) *string {
		file, _, err := c.Request.FormFile(key)
		if err != nil {
			return nil
		}
		defer file.Close()
		buf := bytes.NewBuffer(nil)
		if _, err := io.Copy(buf, file); err != nil {
			return nil
		}
		b64 := base64.StdEncoding.EncodeToString(buf.Bytes())
		return &b64
	}

	req.CertificadoCrt = readBase64File("certificado_crt")
	req.CertificadoKey = readBase64File("certificado_key")

	if err := h.svc.ActualizarConfiguracion(c.Request.Context(), req); err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New(err.Error()))
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Configuración actualizada correctamente"})
}
