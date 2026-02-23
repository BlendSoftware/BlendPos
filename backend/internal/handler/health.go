package handler

import (
	"context"
	"net/http"
	"time"

	"blendpos/internal/infra"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// Health returns a JSON health check response.
// Checks DB, Redis connectivity, and AFIP circuit breaker state.
// Never exposes credentials or internals.
func Health(db *gorm.DB, rdb *redis.Client, afipCB *infra.CircuitBreaker) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		defer cancel()

		dbStatus := "connected"
		sqlDB, err := db.DB()
		if err != nil || sqlDB.PingContext(ctx) != nil {
			dbStatus = "error"
		}

		redisStatus := "connected"
		if rdb.Ping(ctx).Err() != nil {
			redisStatus = "error"
		}

		// Circuit breaker state (closed = healthy, open = AFIP down)
		cbState := "n/a"
		if afipCB != nil {
			cbState = afipCB.State().String()
		}

		status := http.StatusOK
		if dbStatus != "connected" || redisStatus != "connected" {
			status = http.StatusServiceUnavailable
		}

		c.JSON(status, gin.H{
			"ok":      status == http.StatusOK,
			"db":      dbStatus,
			"redis":   redisStatus,
			"afip_cb": cbState,
		})
	}
}
