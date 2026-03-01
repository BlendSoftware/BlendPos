package middleware

import (
	"net/http"
	"strings"

	"blendpos/internal/apierror"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

const (
	ClaimsKey        = "claims"
	revokedKeyPrefix = "jwt:revoked:"
)

// JWTClaims are the custom claims embedded in every access token.
// The embedded RegisteredClaims.ID field carries the "jti" (JWT ID) claim
// used for token revocation checks.
type JWTClaims struct {
	UserID       string `json:"user_id"`
	Username     string `json:"username"`
	Rol          string `json:"rol"`
	PuntoDeVenta *int   `json:"punto_de_venta"`
	jwt.RegisteredClaims
}

// JWTAuth validates the Bearer token on every protected route.
// If rdb is non-nil, it also checks whether the token's jti has been
// added to the Redis revocation set (e.g. after an explicit logout).
func JWTAuth(secret string, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, apierror.New("Autenticacion requerida"))
			return
		}

		tokenStr := strings.TrimPrefix(header, "Bearer ")
		claims := &JWTClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, apierror.New("Token invalido o expirado"))
			return
		}

		// Revocation check: if the jti appears in Redis the token was explicitly
		// invalidated (logout). Fail fast without touching the DB.
		if rdb != nil && claims.ID != "" {
			n, redisErr := rdb.Exists(c.Request.Context(), revokedKeyPrefix+claims.ID).Result()
			if redisErr == nil && n > 0 {
				c.AbortWithStatusJSON(http.StatusUnauthorized, apierror.New("Token revocado"))
				return
			}
		}

		c.Set(ClaimsKey, claims)
		c.Next()
	}
}

// RequireRole rejects requests whose JWT role is not in the allowed list.
func RequireRole(roles ...string) gin.HandlerFunc {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(c *gin.Context) {
		claims, ok := c.MustGet(ClaimsKey).(*JWTClaims)
		if !ok || !allowed[claims.Rol] {
			c.AbortWithStatusJSON(http.StatusForbidden, apierror.New("Permisos insuficientes"))
			return
		}
		c.Next()
	}
}

// GetClaims is a helper to retrieve typed claims from the Gin context.
func GetClaims(c *gin.Context) *JWTClaims {
	claims, _ := c.MustGet(ClaimsKey).(*JWTClaims)
	return claims
}
