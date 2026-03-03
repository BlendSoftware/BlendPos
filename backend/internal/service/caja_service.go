package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type CajaService interface {
	Abrir(ctx context.Context, usuarioID uuid.UUID, req dto.AbrirCajaRequest) (*dto.ReporteCajaResponse, error)
	RegistrarMovimiento(ctx context.Context, req dto.MovimientoManualRequest) error
	Arqueo(ctx context.Context, req dto.ArqueoRequest, usuarioID *uuid.UUID) (*dto.ArqueoResponse, error)
	ObtenerReporte(ctx context.Context, sesionID uuid.UUID) (*dto.ReporteCajaResponse, error)
	// FindSesionAbierta is called by VentaService to validate an open session
	FindSesionAbierta(ctx context.Context, sesionID uuid.UUID) error
	// GetActiva returns the active session for the given user/PDV, or nil if none.
	// puntoDeVenta: if non-nil, any open session on that PDV is returned (ignoring user_id).
	GetActiva(ctx context.Context, usuarioID uuid.UUID, puntoDeVenta *int) (*dto.ReporteCajaResponse, error)
	// Historial returns a paginated list of past sessions (any state).
	Historial(ctx context.Context, page, limit int) ([]dto.ReporteCajaResponse, error)
}

type cajaService struct {
	repo repository.CajaRepository
}

func NewCajaService(repo repository.CajaRepository) CajaService {
	return &cajaService{repo: repo}
}

// ── Abrir ─────────────────────────────────────────────────────────────────────
// AC-04.1 / AC-04.2

func (s *cajaService) Abrir(ctx context.Context, usuarioID uuid.UUID, req dto.AbrirCajaRequest) (*dto.ReporteCajaResponse, error) {
	// Idempotent guard: if the PDV already has an open session, return it.
	// This allows multiple users/logins to "join" the active session on a physical
	// register without getting a 400 error, keeping the modal from getting stuck.
	if existing, err := s.repo.FindSesionAbiertaPorPDV(ctx, req.PuntoDeVenta); err == nil && existing != nil {
		return s.buildReporte(ctx, existing)
	}

	sesion := &model.SesionCaja{
		PuntoDeVenta: req.PuntoDeVenta,
		UsuarioID:    usuarioID,
		MontoInicial: req.MontoInicial,
		Estado:       "abierta",
		OpenedAt:     time.Now(),
	}
	if err := s.repo.CreateSesion(ctx, sesion); err != nil {
		// H-01: The partial UNIQUE index uq_caja_abierta_por_punto catches any
		// race condition where two concurrent requests both pass the guard above.
		if strings.Contains(err.Error(), "uq_caja_abierta_por_punto") ||
			strings.Contains(err.Error(), "duplicate key") {
			return nil, errors.New("Ya existe una caja abierta en este punto de venta")
		}
		return nil, err
	}

	// Reload session with Usuario preloaded to build the complete response
	sesion, err := s.repo.FindSesionByID(ctx, sesion.ID)
	if err != nil {
		return nil, err
	}

	return s.buildReporte(ctx, sesion)
}

// ── RegistrarMovimiento ───────────────────────────────────────────────────────
// Ingreso / egreso manual. Movements are immutable — no Update/Delete.

func (s *cajaService) RegistrarMovimiento(ctx context.Context, req dto.MovimientoManualRequest) error {
	sesionID, err := uuid.Parse(req.SesionCajaID)
	if err != nil {
		return fmt.Errorf("sesion_caja_id inválido: %w", err)
	}
	if err := s.FindSesionAbierta(ctx, sesionID); err != nil {
		return err
	}

	monto := req.Monto
	if req.Tipo == "egreso_manual" {
		monto = req.Monto.Neg()
	}
	metodo := req.MetodoPago
	mov := &model.MovimientoCaja{
		SesionCajaID: sesionID,
		Tipo:         req.Tipo,
		MetodoPago:   &metodo,
		Monto:        monto,
		Descripcion:  req.Descripcion,
	}
	return s.repo.CreateMovimiento(ctx, mov)
}

// ── Arqueo ────────────────────────────────────────────────────────────────────
// Blind count: calculates desvio AFTER receiving declaration (AC-04.4).
// Closes the session and records classification.

func (s *cajaService) Arqueo(ctx context.Context, req dto.ArqueoRequest, usuarioID *uuid.UUID) (*dto.ArqueoResponse, error) {
	var sesionID uuid.UUID
	var err error

	// Fallback: if sesion_caja_id is empty, look up the active session by usuario_id
	if req.SesionCajaID == "" {
		if usuarioID == nil {
			return nil, errors.New("sesion_caja_id o usuario autenticado requerido")
		}
		sesion, lookupErr := s.repo.FindSesionAbiertaPorUsuario(ctx, *usuarioID)
		if lookupErr != nil || sesion == nil {
			return nil, errors.New("no hay sesión de caja abierta para este usuario")
		}
		sesionID = sesion.ID
	} else {
		sesionID, err = uuid.Parse(req.SesionCajaID)
		if err != nil {
			return nil, fmt.Errorf("sesion_caja_id inválido: %w", err)
		}
	}

	sesion, err := s.repo.FindSesionByID(ctx, sesionID)
	if err != nil {
		return nil, errors.New("sesión de caja no encontrada")
	}
	if sesion.Estado != "abierta" {
		return nil, errors.New("la sesión ya está cerrada")
	}

	// AC-04.5: supervisor observations required when desvio > 5%
	sums, err := s.repo.SumMovimientosByMetodo(ctx, sesionID)
	if err != nil {
		return nil, err
	}

	esperado := dto.MontosPorMetodo{
		Efectivo:      sesion.MontoInicial.Add(sums["efectivo"]),
		Debito:        sums["debito"],
		Credito:       sums["credito"],
		Transferencia: sums["transferencia"],
		QR:            sums["qr"],
	}
	esperado.Total = esperado.Efectivo.Add(esperado.Debito).Add(esperado.Credito).Add(esperado.Transferencia).Add(esperado.QR)

	declarado := dto.MontosPorMetodo{
		Efectivo:      req.Declaracion.Efectivo,
		Debito:        req.Declaracion.Debito,
		Credito:       req.Declaracion.Credito,
		Transferencia: req.Declaracion.Transferencia,
		QR:            req.Declaracion.QR,
	}
	declarado.Total = declarado.Efectivo.Add(declarado.Debito).Add(declarado.Credito).Add(declarado.Transferencia).Add(declarado.QR)

	desvioMonto := declarado.Total.Sub(esperado.Total)
	var desvioPct decimal.Decimal
	if !esperado.Total.IsZero() {
		desvioPct = desvioMonto.Div(esperado.Total).Mul(decimal.NewFromInt(100)).Round(2)
	}

	clasificacion := clasificarDesvio(desvioPct)

	// AC-04.5: cierre con desvio critico requiere observaciones
	if clasificacion == "critico" && (req.Observaciones == nil || *req.Observaciones == "") {
		return nil, errors.New("desvío crítico: se requieren observaciones del supervisor")
	}

	// Persist closing data (total + breakdown)
	montoEsperado := esperado.Total
	montoDeclarado := declarado.Total
	sesion.MontoEsperado = &montoEsperado
	sesion.MontoDeclarado = &montoDeclarado
	// Store the detailed breakdown by payment method
	sesion.MontoDeclaradoEfectivo = &declarado.Efectivo
	sesion.MontoDeclaradoDebito = &declarado.Debito
	sesion.MontoDeclaradoCredito = &declarado.Credito
	sesion.MontoDeclaradoTransferencia = &declarado.Transferencia
	sesion.MontoDeclaradoQR = &declarado.QR
	sesion.Desvio = &desvioMonto
	sesion.DesvioPct = &desvioPct
	sesion.Estado = "cerrada"
	now := time.Now()
	sesion.ClosedAt = &now
	sesion.ClasificacionDesvio = &clasificacion
	sesion.Observaciones = req.Observaciones

	if err := s.repo.UpdateSesion(ctx, sesion); err != nil {
		return nil, err
	}

	return &dto.ArqueoResponse{
		SesionCajaID:   sesionID.String(),
		MontoEsperado:  esperado,
		MontoDeclarado: declarado,
		Desvio: dto.DesvioResponse{
			Monto:         desvioMonto,
			Porcentaje:    desvioPct,
			Clasificacion: clasificacion,
		},
		Estado: "cerrada",
	}, nil
}

// ── ObtenerReporte ────────────────────────────────────────────────────────────
// AC-04.6

func (s *cajaService) ObtenerReporte(ctx context.Context, sesionID uuid.UUID) (*dto.ReporteCajaResponse, error) {
	sesion, err := s.repo.FindSesionByID(ctx, sesionID)
	if err != nil {
		return nil, errors.New("sesión de caja no encontrada")
	}
	return s.buildReporte(ctx, sesion)
}

// ── FindSesionAbierta ─────────────────────────────────────────────────────────

func (s *cajaService) FindSesionAbierta(ctx context.Context, sesionID uuid.UUID) error {
	sesion, err := s.repo.FindSesionByID(ctx, sesionID)
	if err != nil {
		return errors.New("sesión de caja no encontrada")
	}
	if sesion.Estado != "abierta" {
		return errors.New("No hay sesion de caja abierta")
	}
	return nil
}

// ── GetActiva ─────────────────────────────────────────────────────────────────
// Returns the active (open) session for the given user or PDV, or nil if none.
// If puntoDeVenta is non-nil, any open session on that register is returned
// (regardless of which user opened it). Falls back to a user_id lookup.

func (s *cajaService) GetActiva(ctx context.Context, usuarioID uuid.UUID, puntoDeVenta *int) (*dto.ReporteCajaResponse, error) {
	// If the user is associated with a specific register, look for any open
	// session on that register — not just sessions they personally opened.
	if puntoDeVenta != nil {
		sesion, err := s.repo.FindSesionAbiertaPorPDV(ctx, *puntoDeVenta)
		if err == nil && sesion != nil {
			return s.buildReporte(ctx, sesion)
		}
	}
	// Fallback: find a session that this user personally opened
	// (handles admins/supervisors with no fixed register).
	sesion, err := s.repo.FindSesionAbiertaPorUsuario(ctx, usuarioID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil // genuinely no open session
		}
		return nil, err // real DB error – propagate so caller gets 500
	}
	return s.buildReporte(ctx, sesion)
}

// ── Historial ─────────────────────────────────────────────────────────────────
// Returns a paginated list of past sessions (any state), newest first.

func (s *cajaService) Historial(ctx context.Context, page, limit int) ([]dto.ReporteCajaResponse, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	sesiones, _, err := s.repo.ListSesiones(ctx, page, limit)
	if err != nil {
		return nil, err
	}
	result := make([]dto.ReporteCajaResponse, 0, len(sesiones))
	for i := range sesiones {
		rep, err := s.buildReporte(ctx, &sesiones[i])
		if err != nil {
			return nil, err
		}
		result = append(result, *rep)
	}
	return result, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// getDecimalOrZero returns the dereferenced value or decimal.Zero if nil.
func getDecimalOrZero(d *decimal.Decimal) decimal.Decimal {
	if d == nil {
		return decimal.Zero
	}
	return *d
}

// clasificarDesvio returns "normal" | "advertencia" | "critico"
// normal: |desvio| <= 1%, advertencia: <= 5%, critico: > 5%
func clasificarDesvio(pct decimal.Decimal) string {
	abs := pct.Abs()
	one := decimal.NewFromInt(1)
	five := decimal.NewFromInt(5)
	switch {
	case abs.LessThanOrEqual(one):
		return "normal"
	case abs.LessThanOrEqual(five):
		return "advertencia"
	default:
		return "critico"
	}
}

func (s *cajaService) buildReporte(ctx context.Context, sesion *model.SesionCaja) (*dto.ReporteCajaResponse, error) {
	sums, err := s.repo.SumMovimientosByMetodo(ctx, sesion.ID)
	if err != nil {
		return nil, err
	}

	esperado := dto.MontosPorMetodo{
		Efectivo:      sesion.MontoInicial.Add(sums["efectivo"]),
		Debito:        sums["debito"],
		Credito:       sums["credito"],
		Transferencia: sums["transferencia"],
		QR:            sums["qr"],
	}
	esperado.Total = esperado.Efectivo.Add(esperado.Debito).Add(esperado.Credito).Add(esperado.Transferencia).Add(esperado.QR)

	reporte := &dto.ReporteCajaResponse{
		SesionCajaID:  sesion.ID.String(),
		PuntoDeVenta:  sesion.PuntoDeVenta,
		Usuario:       sesion.Usuario.Nombre, // Include user name from preloaded relation
		MontoInicial:  sesion.MontoInicial,
		MontoEsperado: esperado,
		Estado:        sesion.Estado,
		Observaciones: sesion.Observaciones,
		OpenedAt:      sesion.OpenedAt.Format("2006-01-02T15:04:05Z"),
	}

	// Count completed sales for this session
	ventasCount, err := s.repo.CountVentasBySesion(ctx, sesion.ID)
	if err == nil {
		reporte.VentasDelDia = ventasCount
	}

	if sesion.MontoDeclarado != nil {
		montoDeclarado := dto.MontosPorMetodo{
			Total:         *sesion.MontoDeclarado,
			Efectivo:      getDecimalOrZero(sesion.MontoDeclaradoEfectivo),
			Debito:        getDecimalOrZero(sesion.MontoDeclaradoDebito),
			Credito:       getDecimalOrZero(sesion.MontoDeclaradoCredito),
			Transferencia: getDecimalOrZero(sesion.MontoDeclaradoTransferencia),
			QR:            getDecimalOrZero(sesion.MontoDeclaradoQR),
		}
		reporte.MontoDeclarado = &montoDeclarado
	}

	if sesion.Desvio != nil && sesion.DesvioPct != nil && sesion.ClasificacionDesvio != nil {
		reporte.Desvio = &dto.DesvioResponse{
			Monto:         *sesion.Desvio,
			Porcentaje:    *sesion.DesvioPct,
			Clasificacion: *sesion.ClasificacionDesvio,
		}
	}

	if sesion.ClosedAt != nil {
		t := sesion.ClosedAt.Format("2006-01-02T15:04:05Z")
		reporte.ClosedAt = &t
	}

	return reporte, nil
}
