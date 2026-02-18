package service

import (
	"context"
	"errors"
	"fmt"

	"blendpos/internal/dto"
	"blendpos/internal/model"
	"blendpos/internal/repository"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type CajaService interface {
	Abrir(ctx context.Context, usuarioID uuid.UUID, req dto.AbrirCajaRequest) (*dto.ReporteCajaResponse, error)
	RegistrarMovimiento(ctx context.Context, req dto.MovimientoManualRequest) error
	Arqueo(ctx context.Context, req dto.ArqueoRequest) (*dto.ArqueoResponse, error)
	ObtenerReporte(ctx context.Context, sesionID uuid.UUID) (*dto.ReporteCajaResponse, error)
	// FindSesionAbierta is called by VentaService to validate an open session
	FindSesionAbierta(ctx context.Context, sesionID uuid.UUID) error
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
	// Guard: no duplicate open session per punto_de_venta
	if existing, err := s.repo.FindSesionAbiertaPorPDV(ctx, req.PuntoDeVenta); err == nil && existing != nil {
		return nil, errors.New("Ya existe una caja abierta en este punto de venta")
	}

	sesion := &model.SesionCaja{
		PuntoDeVenta: req.PuntoDeVenta,
		UsuarioID:    usuarioID,
		MontoInicial: req.MontoInicial,
		Estado:       "abierta",
	}
	if err := s.repo.CreateSesion(ctx, sesion); err != nil {
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

func (s *cajaService) Arqueo(ctx context.Context, req dto.ArqueoRequest) (*dto.ArqueoResponse, error) {
	sesionID, err := uuid.Parse(req.SesionCajaID)
	if err != nil {
		return nil, fmt.Errorf("sesion_caja_id inválido: %w", err)
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
	}
	esperado.Total = esperado.Efectivo.Add(esperado.Debito).Add(esperado.Credito).Add(esperado.Transferencia)

	declarado := dto.MontosPorMetodo{
		Efectivo:      req.Declaracion.Efectivo,
		Debito:        req.Declaracion.Debito,
		Credito:       req.Declaracion.Credito,
		Transferencia: req.Declaracion.Transferencia,
	}
	declarado.Total = declarado.Efectivo.Add(declarado.Debito).Add(declarado.Credito).Add(declarado.Transferencia)

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

	// Persist closing data
	montoEsperado := esperado.Total
	montoDeclarado := declarado.Total
	sesion.MontoEsperado = &montoEsperado
	sesion.MontoDeclarado = &montoDeclarado
	sesion.Desvio = &desvioMonto
	sesion.DesvioPct = &desvioPct
	sesion.Estado = "cerrada"
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
	}
	esperado.Total = esperado.Efectivo.Add(esperado.Debito).Add(esperado.Credito).Add(esperado.Transferencia)

	reporte := &dto.ReporteCajaResponse{
		SesionCajaID:  sesion.ID.String(),
		PuntoDeVenta:  sesion.PuntoDeVenta,
		MontoInicial:  sesion.MontoInicial,
		MontoEsperado: esperado,
		Estado:        sesion.Estado,
		Observaciones: sesion.Observaciones,
		OpenedAt:      sesion.OpenedAt.Format("2006-01-02T15:04:05Z"),
	}

	if sesion.MontoDeclarado != nil {
		montoDeclarado := dto.MontosPorMetodo{Total: *sesion.MontoDeclarado}
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
