package middleware

import (
	"blendpos/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// auditKey is the context key for the AuditService.
const auditKey = "auditSvc"

// AuditMiddleware injects the AuditService into the Gin context so that
// handlers can call AuditFromCtx(c) to log actions fire-and-forget.
func AuditMiddleware(svc service.AuditService) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(auditKey, svc)
		c.Next()
	}
}

// AuditFromCtx retrieves the AuditService from Gin context. Returns nil if not set.
func AuditFromCtx(c *gin.Context) service.AuditService {
	v, exists := c.Get(auditKey)
	if !exists {
		return nil
	}
	svc, _ := v.(service.AuditService)
	return svc
}

// AuditLog is a convenience function that handlers can call to log an audit entry.
// It extracts user info from the JWT claims in the context.
func AuditLog(c *gin.Context, action, entityType string, entityID *uuid.UUID, details interface{}) {
	svc := AuditFromCtx(c)
	if svc == nil {
		return
	}

	claims := GetClaims(c)
	var userID uuid.UUID
	var userName string
	if claims != nil {
		userID, _ = uuid.Parse(claims.UserID)
		userName = claims.Username
	}

	svc.Log(c.Request.Context(), service.AuditEntry{
		UserID:     userID,
		UserName:   userName,
		Action:     action,
		EntityType: entityType,
		EntityID:   entityID,
		Details:    details,
		IPAddress:  c.ClientIP(),
	})
}
