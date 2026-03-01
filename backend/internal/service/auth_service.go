package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"blendpos/internal/config"
	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

// revokedKeyPrefix is the Redis key prefix used to mark revoked JWT IDs.
// Key format: jwt:revoked:<jti>  — TTL matches the token's remaining lifetime.
const revokedKeyPrefix = "jwt:revoked:"

type AuthService interface {
	Login(ctx context.Context, req dto.LoginRequest) (*dto.LoginResponse, error)
	Refresh(ctx context.Context, refreshToken string) (*dto.LoginResponse, error)
	Logout(ctx context.Context, jti string, remaining time.Duration) error
	CrearUsuario(ctx context.Context, req dto.CrearUsuarioRequest) (*dto.UsuarioResponse, error)
	ListarUsuarios(ctx context.Context, incluirInactivos bool) ([]dto.UsuarioResponse, error)
	ActualizarUsuario(ctx context.Context, id uuid.UUID, req dto.ActualizarUsuarioRequest) (*dto.UsuarioResponse, error)
	DesactivarUsuario(ctx context.Context, id uuid.UUID) error
	ReactivarUsuario(ctx context.Context, id uuid.UUID) error
}

type authService struct {
	repo repository.UsuarioRepository
	cfg  *config.Config
	rdb  *redis.Client
}

func NewAuthService(repo repository.UsuarioRepository, cfg *config.Config, rdb *redis.Client) AuthService {
	return &authService{repo: repo, cfg: cfg, rdb: rdb}
}

func (s *authService) Login(ctx context.Context, req dto.LoginRequest) (*dto.LoginResponse, error) {
	user, err := s.repo.FindByUsername(ctx, req.Username)
	if err != nil {
		return nil, errors.New("credenciales invalidas")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, errors.New("credenciales invalidas")
	}

	accessToken, err := s.generateToken(user, time.Duration(s.cfg.JWTExpirationHours)*time.Hour)
	if err != nil {
		return nil, err
	}
	refreshToken, err := s.generateToken(user, time.Duration(s.cfg.JWTRefreshHours)*time.Hour)
	if err != nil {
		return nil, err
	}

	return &dto.LoginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "bearer",
		ExpiresIn:    s.cfg.JWTExpirationHours * 3600,
		User: dto.UsuarioResponse{
			ID:           user.ID.String(),
			Username:     user.Username,
			Nombre:       user.Nombre,
			Rol:          user.Rol,
			PuntoDeVenta: user.PuntoDeVenta,
		},
	}, nil
}

func (s *authService) Refresh(ctx context.Context, refreshToken string) (*dto.LoginResponse, error) {
	token, err := jwt.Parse(refreshToken, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("refresh token invalido o expirado")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("claims invalidos")
	}
	// Verify the refresh token has not been revoked.
	if jti, ok2 := claims["jti"].(string); ok2 && jti != "" && s.rdb != nil {
		revoked, err2 := s.rdb.Exists(ctx, fmt.Sprintf("%s%s", revokedKeyPrefix, jti)).Result()
		if err2 != nil {
			return nil, fmt.Errorf("error verificando revocacion: %w", err2)
		}
		if revoked > 0 {
			return nil, errors.New("refresh token revocado")
		}
	}
	userIDStr, ok := claims["user_id"].(string)
	if !ok {
		return nil, errors.New("token mal formado")
	}
	uid, err := uuid.Parse(userIDStr)
	if err != nil {
		return nil, errors.New("token mal formado")
	}

	user, err := s.repo.FindByID(ctx, uid)
	if err != nil || !user.Activo {
		return nil, errors.New("usuario no encontrado o inactivo")
	}

	accessToken, err := s.generateToken(user, time.Duration(s.cfg.JWTExpirationHours)*time.Hour)
	if err != nil {
		return nil, err
	}
	newRefresh, err := s.generateToken(user, time.Duration(s.cfg.JWTRefreshHours)*time.Hour)
	if err != nil {
		return nil, err
	}

	return &dto.LoginResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefresh,
		TokenType:    "bearer",
		ExpiresIn:    s.cfg.JWTExpirationHours * 3600,
		User: dto.UsuarioResponse{
			ID: user.ID.String(), Username: user.Username,
			Nombre: user.Nombre, Rol: user.Rol, PuntoDeVenta: user.PuntoDeVenta,
		},
	}, nil
}

func (s *authService) CrearUsuario(ctx context.Context, req dto.CrearUsuarioRequest) (*dto.UsuarioResponse, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		return nil, err
	}
	user := &model.Usuario{
		Username:     req.Username,
		Nombre:       req.Nombre,
		Email:        req.Email,
		PasswordHash: string(hash),
		Rol:          req.Rol,
		PuntoDeVenta: req.PuntoDeVenta,
		Activo:       true,
	}
	if err := s.repo.Create(ctx, user); err != nil {
		return nil, err
	}
	return &dto.UsuarioResponse{
		ID: user.ID.String(), Username: user.Username, Nombre: user.Nombre,
		Email: user.Email, Rol: user.Rol, PuntoDeVenta: user.PuntoDeVenta, Activo: user.Activo,
	}, nil
}

func (s *authService) ListarUsuarios(ctx context.Context, incluirInactivos bool) ([]dto.UsuarioResponse, error) {
	var users []model.Usuario
	var err error
	if incluirInactivos {
		users, err = s.repo.ListAll(ctx)
	} else {
		users, err = s.repo.List(ctx)
	}
	if err != nil {
		return nil, err
	}
	resp := make([]dto.UsuarioResponse, len(users))
	for i, u := range users {
		resp[i] = dto.UsuarioResponse{
			ID: u.ID.String(), Username: u.Username, Nombre: u.Nombre,
			Email: u.Email, Rol: u.Rol, PuntoDeVenta: u.PuntoDeVenta, Activo: u.Activo,
		}
	}
	return resp, nil
}

func (s *authService) ActualizarUsuario(ctx context.Context, id uuid.UUID, req dto.ActualizarUsuarioRequest) (*dto.UsuarioResponse, error) {
	user, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, errors.New("usuario no encontrado")
	}
	if req.Nombre != "" {
		user.Nombre = req.Nombre
	}
	if req.Email != nil {
		user.Email = req.Email
	}
	if req.Rol != "" {
		user.Rol = req.Rol
	}
	if req.PuntoDeVenta != nil {
		user.PuntoDeVenta = req.PuntoDeVenta
	}
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
		if err != nil {
			return nil, err
		}
		user.PasswordHash = string(hash)
	}
	if err := s.repo.Update(ctx, user); err != nil {
		return nil, err
	}
	return &dto.UsuarioResponse{
		ID: user.ID.String(), Username: user.Username, Nombre: user.Nombre,
		Email: user.Email, Rol: user.Rol, PuntoDeVenta: user.PuntoDeVenta, Activo: user.Activo,
	}, nil
}

func (s *authService) DesactivarUsuario(ctx context.Context, id uuid.UUID) error {
	return s.repo.SoftDelete(ctx, id)
}

func (s *authService) ReactivarUsuario(ctx context.Context, id uuid.UUID) error {
	return s.repo.Reactivar(ctx, id)
}

// Logout marks a JWT as revoked in Redis for the remainder of its lifetime.
// jti must be the "jti" claim value extracted from the validated token.
func (s *authService) Logout(ctx context.Context, jti string, remaining time.Duration) error {
	if s.rdb == nil {
		return errors.New("redis no disponible: no se puede revocar el token")
	}
	if remaining <= 0 {
		// Token already expired — nothing to revoke.
		return nil
	}
	key := fmt.Sprintf("%s%s", revokedKeyPrefix, jti)
	return s.rdb.Set(ctx, key, "1", remaining).Err()
}

func (s *authService) generateToken(user *model.Usuario, duration time.Duration) (string, error) {
	claims := jwt.MapClaims{
		"jti":            uuid.New().String(),
		"user_id":        user.ID.String(),
		"username":       user.Username,
		"rol":            user.Rol,
		"punto_de_venta": user.PuntoDeVenta,
		"exp":            time.Now().Add(duration).Unix(),
		"iat":            time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}
