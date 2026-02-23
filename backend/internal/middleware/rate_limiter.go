package middleware

import (
	"net/http"
	"sync"
	"time"

	"blendpos/internal/apierror"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
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

// ── Purge goroutine ───────────────────────────────────────────────────────────
// Periodically removes expired entries from both rate limiter maps to prevent
// memory leaks from accumulating IPs that never return.

const purgeInterval = 5 * time.Minute

func init() {
	go purgeExpiredEntries()
}

func purgeExpiredEntries() {
	ticker := time.NewTicker(purgeInterval)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()

		// Purge login rate limiter map
		ipMapMu.Lock()
		purgedLogin := 0
		for ip, entry := range ipMap {
			entry.mu.Lock()
			if now.After(entry.windowEnd) {
				delete(ipMap, ip)
				purgedLogin++
			}
			entry.mu.Unlock()
		}
		ipMapMu.Unlock()

		// Purge API rate limiter map
		apiRateMapMu.Lock()
		purgedAPI := 0
		for ip, entry := range apiRateMap {
			entry.mu.Lock()
			if now.After(entry.windowEnd) {
				delete(apiRateMap, ip)
				purgedAPI++
			}
			entry.mu.Unlock()
		}
		apiRateMapMu.Unlock()

		if purgedLogin > 0 || purgedAPI > 0 {
			log.Debug().
				Int("login_entries_purged", purgedLogin).
				Int("api_entries_purged", purgedAPI).
				Int("login_entries_remaining", len(ipMap)).
				Int("api_entries_remaining", len(apiRateMap)).
				Msg("rate limiter maps purged")
		}
	}
}
