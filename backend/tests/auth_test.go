package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"blendpos/internal/config"
	"blendpos/internal/dto"
	"blendpos/internal/handler"
	"blendpos/internal/middleware"
	"blendpos/internal/model"
	"blendpos/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"golang.org/x/crypto/bcrypt"
)

// ── In-memory Repository Stub ─────────────────────────────────────────────────

type stubUsuarioRepo struct {
	users map[string]*model.Usuario
}

func newStubRepo() *stubUsuarioRepo {
	return &stubUsuarioRepo{users: make(map[string]*model.Usuario)}
}

func (r *stubUsuarioRepo) Create(_ context.Context, u *model.Usuario) error {
	u.ID = uuid.New()
	r.users[u.Username] = u
	return nil
}

func (r *stubUsuarioRepo) FindByUsername(_ context.Context, username string) (*model.Usuario, error) {
	u, ok := r.users[username]
	if !ok || !u.Activo {
		return nil, errors.New("not found")
	}
	return u, nil
}

func (r *stubUsuarioRepo) FindByID(_ context.Context, id uuid.UUID) (*model.Usuario, error) {
	for _, u := range r.users {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, errors.New("not found")
}

func (r *stubUsuarioRepo) List(_ context.Context) ([]model.Usuario, error) {
	users := make([]model.Usuario, 0, len(r.users))
	for _, u := range r.users {
		users = append(users, *u)
	}
	return users, nil
}

func (r *stubUsuarioRepo) Update(_ context.Context, u *model.Usuario) error {
	r.users[u.Username] = u
	return nil
}

func (r *stubUsuarioRepo) SoftDelete(_ context.Context, id uuid.UUID) error {
	for _, u := range r.users {
		if u.ID == id {
			u.Activo = false
			return nil
		}
	}
	return errors.New("not found")
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const testSecret = "test_jwt_secret_32_chars_minimum!"

func newTestCfg() *config.Config {
	return &config.Config{
		JWTSecret:          testSecret,
		JWTExpirationHours: 8,
		JWTRefreshHours:    24,
	}
}

func seedUser(t *testing.T, repo *stubUsuarioRepo, username, password, rol string) *model.Usuario {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	assert.NoError(t, err)
	u := &model.Usuario{
		ID: uuid.New(), Username: username, Nombre: "Test User",
		PasswordHash: string(hash), Rol: rol, Activo: true,
	}
	repo.users[username] = u
	return u
}

func signToken(t *testing.T, userID, rol string, dur time.Duration) string {
	t.Helper()
	claims := jwt.MapClaims{
		"user_id": userID, "username": "testuser", "rol": rol,
		"exp": time.Now().Add(dur).Unix(), "iat": time.Now().Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := tok.SignedString([]byte(testSecret))
	assert.NoError(t, err)
	return s
}

func doLoginRequest(t *testing.T, svc service.AuthService, req dto.LoginRequest) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	authH := handler.NewAuthHandler(svc)
	r.POST("/login", authH.Login)

	body, _ := json.Marshal(req)
	w := httptest.NewRecorder()
	httpReq, _ := http.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, httpReq)
	return w
}

func ginTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.JWTAuth(testSecret))
	r.GET("/protected", func(c *gin.Context) {
		claims := middleware.GetClaims(c)
		c.JSON(http.StatusOK, gin.H{"user_id": claims.UserID, "rol": claims.Rol})
	})
	r.GET("/admin", middleware.RequireRole("administrador"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	return r
}

// ── Tests: Login ──────────────────────────────────────────────────────────────

func TestLogin_Success(t *testing.T) {
	repo := newStubRepo()
	seedUser(t, repo, "admin", "password123", "administrador")
	svc := service.NewAuthService(repo, newTestCfg())

	w := doLoginRequest(t, svc, dto.LoginRequest{Username: "admin", Password: "password123"})

	assert.Equal(t, http.StatusOK, w.Code)
	var resp dto.LoginResponse
	assert.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.NotEmpty(t, resp.AccessToken)
	assert.NotEmpty(t, resp.RefreshToken)
	assert.Equal(t, "bearer", resp.TokenType)
	assert.Equal(t, "administrador", resp.User.Rol)
}

func TestLogin_InvalidCredentials(t *testing.T) {
	repo := newStubRepo()
	seedUser(t, repo, "cajero1", "correctpass", "cajero")
	svc := service.NewAuthService(repo, newTestCfg())

	w := doLoginRequest(t, svc, dto.LoginRequest{Username: "cajero1", Password: "wrongpass"})
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestLogin_UserNotFound(t *testing.T) {
	repo := newStubRepo()
	svc := service.NewAuthService(repo, newTestCfg())

	w := doLoginRequest(t, svc, dto.LoginRequest{Username: "noexiste", Password: "anypass123"})
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestLogin_ShortPassword_Rejected(t *testing.T) {
	// DTO validation: password must be >= 6 chars
	repo := newStubRepo()
	svc := service.NewAuthService(repo, newTestCfg())

	w := doLoginRequest(t, svc, dto.LoginRequest{Username: "u", Password: "12"})
	// 422 Unprocessable Entity from bindAndValidate
	assert.Equal(t, http.StatusUnprocessableEntity, w.Code)
}

// ── Tests: Refresh ────────────────────────────────────────────────────────────

func TestRefresh_Success(t *testing.T) {
	repo := newStubRepo()
	u := seedUser(t, repo, "super1", "pass1234", "supervisor")
	svc := service.NewAuthService(repo, newTestCfg())

	loginW := doLoginRequest(t, svc, dto.LoginRequest{Username: "super1", Password: "pass1234"})
	assert.Equal(t, http.StatusOK, loginW.Code)
	var loginResp dto.LoginResponse
	json.Unmarshal(loginW.Body.Bytes(), &loginResp) //nolint

	resp, err := svc.Refresh(context.Background(), loginResp.RefreshToken)
	assert.NoError(t, err)
	assert.NotEmpty(t, resp.AccessToken)
	assert.Equal(t, u.Username, resp.User.Username)
}

func TestRefresh_InvalidToken(t *testing.T) {
	repo := newStubRepo()
	svc := service.NewAuthService(repo, newTestCfg())

	_, err := svc.Refresh(context.Background(), "this.is.garbage")
	assert.Error(t, err)
}

func TestRefresh_ExpiredToken(t *testing.T) {
	repo := newStubRepo()
	u := seedUser(t, repo, "cajero2", "pass12345", "cajero")
	svc := service.NewAuthService(repo, newTestCfg())

	expired := signToken(t, u.ID.String(), "cajero", -1*time.Second)
	_, err := svc.Refresh(context.Background(), expired)
	assert.Error(t, err)
}

// ── Tests: JWT Middleware ──────────────────────────────────────────────────────

func TestProtectedEndpoint_NoToken(t *testing.T) {
	r := ginTestRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/protected", nil)
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestProtectedEndpoint_ValidToken(t *testing.T) {
	r := ginTestRouter()
	tok := signToken(t, uuid.New().String(), "cajero", time.Hour)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestProtectedEndpoint_ExpiredToken(t *testing.T) {
	r := ginTestRouter()
	tok := signToken(t, uuid.New().String(), "cajero", -time.Second)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestRequireRole_WrongRole(t *testing.T) {
	r := ginTestRouter()
	tok := signToken(t, uuid.New().String(), "cajero", time.Hour)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestRequireRole_CorrectRole(t *testing.T) {
	r := ginTestRouter()
	tok := signToken(t, uuid.New().String(), "administrador", time.Hour)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}

// ── Tests: User CRUD (service layer) ─────────────────────────────────────────

func TestCrearUsuario_Success(t *testing.T) {
	repo := newStubRepo()
	svc := service.NewAuthService(repo, newTestCfg())

	resp, err := svc.CrearUsuario(context.Background(), dto.CrearUsuarioRequest{
		Username: "nuevo", Nombre: "Nuevo User", Password: "securepass",
		Rol: "cajero",
	})
	assert.NoError(t, err)
	assert.Equal(t, "cajero", resp.Rol)
	assert.NotEmpty(t, resp.ID)
}

func TestListarUsuarios(t *testing.T) {
	repo := newStubRepo()
	seedUser(t, repo, "u1", "pass1234", "cajero")
	seedUser(t, repo, "u2", "pass1234", "supervisor")
	svc := service.NewAuthService(repo, newTestCfg())

	users, err := svc.ListarUsuarios(context.Background())
	assert.NoError(t, err)
	assert.Len(t, users, 2)
}

func TestDesactivarUsuario(t *testing.T) {
	repo := newStubRepo()
	u := seedUser(t, repo, "goodbye", "pass1234", "cajero")
	svc := service.NewAuthService(repo, newTestCfg())

	err := svc.DesactivarUsuario(context.Background(), u.ID)
	assert.NoError(t, err)

	_, err = repo.FindByUsername(context.Background(), "goodbye")
	assert.Error(t, err, "soft-deleted user must not be findable")
}
