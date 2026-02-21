package handler

import (
	"net/http"

	"blendpos/internal/apierror"
	"blendpos/internal/dto"
	"blendpos/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AuthHandler struct{ svc service.AuthService }

func NewAuthHandler(svc service.AuthService) *AuthHandler { return &AuthHandler{svc: svc} }

// Login godoc
// @Summary Login de usuario
// @Tags auth
// @Accept json
// @Produce json
// @Param body body dto.LoginRequest true "Credenciales"
// @Success 200 {object} dto.LoginResponse
// @Failure 401 {object} apierror.APIError
// @Router /v1/auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if !bindAndValidate(c, &req) {
		return
	}

	resp, err := h.svc.Login(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// Refresh godoc
// @Summary      Renovar token JWT
// @Description  Intercambia un refresh token válido por un nuevo access token.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body dto.RefreshRequest true "Refresh token"
// @Success      200  {object} dto.LoginResponse
// @Failure      401  {object} apierror.APIError
// @Router       /v1/auth/refresh [post]
func (h *AuthHandler) Refresh(c *gin.Context) {
	var req dto.RefreshRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.Refresh(c.Request.Context(), req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ── Usuarios Handler ─────────────────────────────────────────────────────────

type UsuariosHandler struct{ svc service.AuthService }

func NewUsuariosHandler(svc service.AuthService) *UsuariosHandler {
	return &UsuariosHandler{svc: svc}
}

// Crear godoc
// @Summary      Crear usuario
// @Tags         usuarios
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body body dto.CrearUsuarioRequest true "Datos del usuario"
// @Success      201  {object} dto.UsuarioResponse
// @Failure      400  {object} apierror.APIError
// @Router       /v1/usuarios [post]
func (h *UsuariosHandler) Crear(c *gin.Context) {
	var req dto.CrearUsuarioRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.CrearUsuario(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *UsuariosHandler) Listar(c *gin.Context) {
	resp, err := h.svc.ListarUsuarios(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierror.New("Error al listar usuarios"))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *UsuariosHandler) Actualizar(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID invalido"))
		return
	}
	var req dto.ActualizarUsuarioRequest
	if !bindAndValidate(c, &req) {
		return
	}
	resp, err := h.svc.ActualizarUsuario(c.Request.Context(), id, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *UsuariosHandler) Desactivar(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("ID invalido"))
		return
	}
	if err := h.svc.DesactivarUsuario(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New(err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}
