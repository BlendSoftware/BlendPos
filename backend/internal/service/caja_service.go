package service

import (
	"context"

	"blendpos/internal/dto"
	"blendpos/internal/repository"

	"github.com/google/uuid"
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

func (s *cajaService) Abrir(ctx context.Context, usuarioID uuid.UUID, req dto.AbrirCajaRequest) (*dto.ReporteCajaResponse, error) {
	// TODO (Phase 4)
	return nil, nil
}

func (s *cajaService) RegistrarMovimiento(ctx context.Context, req dto.MovimientoManualRequest) error {
	// TODO (Phase 4)
	return nil
}

func (s *cajaService) Arqueo(ctx context.Context, req dto.ArqueoRequest) (*dto.ArqueoResponse, error) {
	// TODO (Phase 4)
	return nil, nil
}

func (s *cajaService) ObtenerReporte(ctx context.Context, sesionID uuid.UUID) (*dto.ReporteCajaResponse, error) {
	// TODO (Phase 4)
	return nil, nil
}

func (s *cajaService) FindSesionAbierta(ctx context.Context, sesionID uuid.UUID) error {
	// TODO (Phase 3)
	return nil
}
