package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"blendpos/internal/apierror"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

// ── In-memory fallback rate limiter (H-02) ──────────────────────────────────
// Used when Redis is unavailable. More conservative limit to compensate for
// per-process (non-distributed) counting.
type memEntry struct {
	count     int
	expiresAt time.Time
}

var (
	memStore = make(map[string]*memEntry) //nolint:gochecknoglobals
	memMu    sync.Mutex                   //nolint:gochecknoglobals
)

func memIncr(key string, window time.Duration) int {
	memMu.Lock()
	defer memMu.Unlock()

	now := time.Now()
	entry, ok := memStore[key]
	if !ok || now.After(entry.expiresAt) {
		memStore[key] = &memEntry{count: 1, expiresAt: now.Add(window)}
		return 1
	}
	entry.count++
	return entry.count
}

// redisRateLimiter implements a fixed-window counter using Redis INCR/EXPIRE.
// Using Redis means the limit is enforced globally across all backend replicas
// (fixes P2-001 — in-memory maps only worked per-process).
//
// H-02: If Redis is unavailable, fall back to in-memory counting with a
// more conservative limit (limit/2 or 3, whichever is lower). This ensures
// the rate limiter never fails open.
//
// Key format: rl:<prefix>:<ip>:<window_bucket>
func redisRateLimiter(rdb *redis.Client, prefix string, limit int, window time.Duration) gin.HandlerFunc {
	windowSecs := int64(window.Seconds())
	if windowSecs < 1 {
		windowSecs = 60
	}

	// Conservative in-memory limit when Redis is down.
	memLimit := limit / 2
	if memLimit > 3 {
		memLimit = 3
	}
	if memLimit < 1 {
		memLimit = 1
	}

	// When rdb is nil (e.g. tests without Redis), use in-memory limiter at full limit.
	if rdb == nil {
		return func(c *gin.Context) {
			ip := c.ClientIP()
			bucket := time.Now().Unix() / windowSecs
			memKey := fmt.Sprintf("rl:%s:%s:%d", prefix, ip, bucket)
			memCount := memIncr(memKey, window)
			if memCount > limit {
				retryAfter := time.Duration((bucket+1)*windowSecs-time.Now().Unix()) * time.Second
				c.Header("Retry-After", fmt.Sprintf("%d", int(retryAfter.Seconds())))
				c.AbortWithStatusJSON(http.StatusTooManyRequests, apierror.New("Demasiadas solicitudes. Intente nuevamente en un momento."))
				return
			}
			c.Next()
		}
	}

	return func(c *gin.Context) {
		ip := c.ClientIP()
		bucket := time.Now().Unix() / windowSecs
		key := fmt.Sprintf("rl:%s:%s:%d", prefix, ip, bucket)

		ctx := c.Request.Context()
		count, err := rdb.Incr(ctx, key).Result()
		if err != nil {
			// H-02: Redis unavailable — use in-memory fallback (never fail open).
			log.Error().Err(err).Str("prefix", prefix).Str("ip", ip).
				Msg("Rate limiter: Redis unavailable, using in-memory fallback")

			memKey := fmt.Sprintf("rl:%s:%s:%d", prefix, ip, bucket)
			memCount := memIncr(memKey, window)
			if memCount > memLimit {
				retryAfter := time.Duration((bucket+1)*windowSecs-time.Now().Unix()) * time.Second
				c.Header("Retry-After", fmt.Sprintf("%d", int(retryAfter.Seconds())))
				c.AbortWithStatusJSON(http.StatusTooManyRequests, apierror.New("Demasiadas solicitudes. Intente nuevamente en un momento."))
				return
			}
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

// LoginRateLimiter limits login attempts to 5 per minute per IP (H-02: reduced from 20).
// Uses Redis so the limit holds even with multiple backend replicas (P2-001).
func LoginRateLimiter(rdb *redis.Client) gin.HandlerFunc {
	return redisRateLimiter(rdb, "login", 5, time.Minute)
}

// RefreshRateLimiter limits token refresh attempts to 10 per minute per IP.
func RefreshRateLimiter(rdb *redis.Client) gin.HandlerFunc {
	return redisRateLimiter(rdb, "refresh", 10, time.Minute)
}

// RateLimiter returns a general-purpose fixed-window rate limiter backed by Redis.
func RateLimiter(rdb *redis.Client, limit int, window time.Duration) gin.HandlerFunc {
	return redisRateLimiter(rdb, "api", limit, window)
}
