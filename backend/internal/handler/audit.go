package handler

import (
	"net/http"
	"strconv"
	"time"

	"blendpos/internal/apierror"
	"blendpos/internal/repository"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// AuditHandler exposes the audit log via a read-only endpoint.
type AuditHandler struct {
	repo repository.AuditRepository
}

func NewAuditHandler(repo repository.AuditRepository) *AuditHandler {
	return &AuditHandler{repo: repo}
}

// List godoc
// @Summary   Listar registros de auditoría
// @Tags      audit
// @Produce   json
// @Param     entity_type query string false "Tipo de entidad (producto, venta, usuario, etc.)"
// @Param     entity_id   query string false "UUID de la entidad"
// @Param     user_id     query string false "UUID del usuario"
// @Param     desde       query string false "Fecha inicio (RFC3339)"
// @Param     hasta       query string false "Fecha fin (RFC3339)"
// @Param     page        query int    false "Página" default(1)
// @Param     limit       query int    false "Registros por página" default(50)
// @Success   200 {object} map[string]interface{}
// @Failure   400 {object} apierror.APIError
// @Security  BearerAuth
// @Router    /v1/audit [get]
func (h *AuditHandler) List(c *gin.Context) {
	filter := repository.AuditFilter{
		EntityType: c.Query("entity_type"),
		Page:       1,
		Limit:      50,
	}

	if v := c.Query("entity_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierror.New("entity_id inválido"))
			return
		}
		filter.EntityID = &id
	}
	if v := c.Query("user_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierror.New("user_id inválido"))
			return
		}
		filter.UserID = &id
	}
	if v := c.Query("desde"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierror.New("desde debe ser formato RFC3339"))
			return
		}
		filter.Desde = &t
	}
	if v := c.Query("hasta"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			c.JSON(http.StatusBadRequest, apierror.New("hasta debe ser formato RFC3339"))
			return
		}
		filter.Hasta = &t
	}
	if v := c.Query("page"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 {
			filter.Page = p
		}
	}
	if v := c.Query("limit"); v != "" {
		if l, err := strconv.Atoi(v); err == nil && l > 0 {
			filter.Limit = l
		}
	}

	entries, total, err := h.repo.List(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("error consultando auditoría"))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  entries,
		"total": total,
		"page":  filter.Page,
		"limit": filter.Limit,
	})
}
