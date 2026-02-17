package middleware

import (
	"net/http"
	"sync"
	"time"

	"blendpos/internal/apierror"

	"github.com/gin-gonic/gin"
)

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

// LoginRateLimiter limits login attempts to 5 per minute per IP.
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
		if entry.count > 5 {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, apierror.New("Demasiados intentos de login. Intente en 1 minuto."))
			return
		}
		c.Next()
	}
}
