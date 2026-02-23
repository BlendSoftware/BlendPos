package middleware

import (
	"net/http"
	"sync"
	"time"

	"blendpos/internal/apierror"

	"github.com/gin-gonic/gin"
)

// ── Login rate limiter ────────────────────────────────────────────────────────

// ipEntry tracks login attempts per IP within a sliding window.
type ipEntry struct {
	count     int
	windowEnd time.Time
	mu        sync.Mutex
}

var (
	ipMap   = make(map[string]*ipEntry)
	ipMapMu sync.Mutex
)

// LoginRateLimiter limits login attempts to 20 per minute per IP.
func LoginRateLimiter() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()

		ipMapMu.Lock()
		entry, exists := ipMap[ip]
		if !exists {
			entry = &ipEntry{}
			ipMap[ip] = entry
		}
		ipMapMu.Unlock()

		entry.mu.Lock()
		defer entry.mu.Unlock()

		now := time.Now()
		if now.After(entry.windowEnd) {
			// Reset sliding window
			entry.count = 0
			entry.windowEnd = now.Add(time.Minute)
		}

		entry.count++
		if entry.count > 20 {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, apierror.New("Demasiados intentos de login. Intente en 1 minuto."))
			return
		}
		c.Next()
	}
}

// ── General API rate limiter ──────────────────────────────────────────────────

// rateEntry tracks request counts per IP for the general API limiter.
type rateEntry struct {
	count     int
	windowEnd time.Time
	mu        sync.Mutex
}

var (
	apiRateMap   = make(map[string]*rateEntry)
	apiRateMapMu sync.Mutex
)

// RateLimiter returns a general-purpose sliding-window rate limiter.
// Default: 200 requests per minute per IP — adjust limit / window as needed.
func RateLimiter(limit int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()

		apiRateMapMu.Lock()
		entry, exists := apiRateMap[ip]
		if !exists {
			entry = &rateEntry{}
			apiRateMap[ip] = entry
		}
		apiRateMapMu.Unlock()

		entry.mu.Lock()
		defer entry.mu.Unlock()

		now := time.Now()
		if now.After(entry.windowEnd) {
			entry.count = 0
			entry.windowEnd = now.Add(window)
		}

		entry.count++
		if entry.count > limit {
			c.Header("Retry-After", entry.windowEnd.Format(time.RFC1123))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, apierror.New("Demasiadas solicitudes. Intente nuevamente en un momento."))
			return
		}
		c.Next()
	}
}
