package middleware

import (
	"net/http"
	"strings"

	"blendpos/internal/apierror"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const (
	ClaimsKey = "claims"
)

// JWTClaims are the custom claims embedded in every access token.
type JWTClaims struct {
	UserID       string `json:"user_id"`
	Username     string `json:"username"`
	Rol          string `json:"rol"`
	PuntoDeVenta *int   `json:"punto_de_venta"`
	jwt.RegisteredClaims
}

// JWTAuth validates the Bearer token on every protected route.
func JWTAuth(secret string) gin.HandlerFunc {
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
