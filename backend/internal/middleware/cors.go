package middleware

import (
	"github.com/gin-gonic/gin"
)

// CORS enforces a per-origin allowlist instead of the wildcard "*".
// Pass the list from config.AllowedOrigins (comma-split by the caller).
//
// Why not "*"?
//   - "*" + credentials is rejected by browsers (CORS spec §7.2).
//   - "*" allows any origin to call authenticated endpoints, enabling
//     cross-site request forgery via CORS (OWASP A05).
//
// Production value (env ALLOWED_ORIGINS): "https://pos.miempresa.com"
// Development value: "http://localhost:5173"
func CORS(allowedOrigins []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		if trimmed := trimSpace(o); trimmed != "" {
			allowed[trimmed] = struct{}{}
		}
	}

	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if _, ok := allowed[origin]; ok {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			// Vary: Origin tells caches that the response differs per origin
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID")
		c.Header("Access-Control-Expose-Headers", "X-Request-ID")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

// trimSpace removes leading/trailing whitespace from a string.
// Defined locally to avoid importing "strings" in this small file.
func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}
