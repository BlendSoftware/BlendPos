package middleware

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"blendpos/internal/apierror"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// redisRateLimiter implements a fixed-window counter using Redis INCR/EXPIRE.
// Using Redis means the limit is enforced globally across all backend replicas
// (fixes P2-001 — in-memory maps only worked per-process).
//
// Key format: rl:<prefix>:<ip>:<window_bucket>
// The window bucket is time.Now().Unix() / windowSecs, so a new bucket is
// created at the start of each window and expires naturally after 2× window.
func redisRateLimiter(rdb *redis.Client, prefix string, limit int, window time.Duration) gin.HandlerFunc {
	windowSecs := int64(window.Seconds())
	if windowSecs < 1 {
		windowSecs = 60
	}

	return func(c *gin.Context) {
		ip := c.ClientIP()
		bucket := time.Now().Unix() / windowSecs
		key := fmt.Sprintf("rl:%s:%s:%d", prefix, ip, bucket)

		ctx := c.Request.Context()
		count, err := rdb.Incr(ctx, key).Result()
		if err != nil {
			// Redis unavailable — fail open rather than blocking all traffic.
			// The error is silently swallowed here; structured logging would
			// add per-request noise. A healthcheck alert covers persistent outages.
			c.Next()
			return
		}
		// Set TTL only on the first increment so one Expire call suffices.
		if count == 1 {
			rdb.Expire(ctx, key, window*2) //nolint:errcheck // best-effort TTL
		}

		if int(count) > limit {
			retryAfter := time.Duration((bucket+1)*windowSecs-time.Now().Unix()) * time.Second
			c.Header("Retry-After", fmt.Sprintf("%d", int(retryAfter.Seconds())))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, apierror.New("Demasiadas solicitudes. Intente nuevamente en un momento."))
			return
		}
		c.Next()
	}
}

// LoginRateLimiter limits login attempts to 20 per minute per IP.
// Uses Redis so the limit holds even with multiple backend replicas (P2-001).
func LoginRateLimiter(rdb *redis.Client) gin.HandlerFunc {
	return redisRateLimiter(rdb, "login", 20, time.Minute)
}

// RateLimiter returns a general-purpose fixed-window rate limiter backed by Redis.
func RateLimiter(rdb *redis.Client, limit int, window time.Duration) gin.HandlerFunc {
	return redisRateLimiter(rdb, "api", limit, window)
}

// fallbackContext is used when no request context is available.
var fallbackContext = context.Background() //nolint:gochecknoglobals
