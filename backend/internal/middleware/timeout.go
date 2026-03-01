package middleware

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
)

// GlobalTimeout wraps every incoming request in a context with the given deadline.
// Handlers and downstream calls (DB, Redis, AFIP) that respect ctx.Done() will be
// cancelled automatically if the request takes longer than d.
//
// NOTE: Gin's c.File() streams directly to the ResponseWriter, so long downloads
// (e.g. PDF receipts) should set a more generous per-route timeout when needed.
func GlobalTimeout(d time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), d)
		defer cancel()

		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}
