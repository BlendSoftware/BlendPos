package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"blendpos/internal/dto"
	"blendpos/internal/infra"
	"blendpos/internal/model"
	"blendpos/internal/repository"
)

type ConfiguracionFiscalService interface {
	ObtenerConfiguracion(ctx context.Context) (*dto.ConfiguracionFiscalResponse, error)
	ActualizarConfiguracion(ctx context.Context, req dto.ConfiguracionFiscalRequest) error
}

type configuracionFiscalService struct {
	repo       repository.ConfiguracionFiscalRepository
	afipClient infra.AFIPClient
}

func NewConfiguracionFiscalService(repo repository.ConfiguracionFiscalRepository, afipClient infra.AFIPClient) ConfiguracionFiscalService {
	return &configuracionFiscalService{repo, afipClient}
}

func (s *configuracionFiscalService) ObtenerConfiguracion(ctx context.Context) (*dto.ConfiguracionFiscalResponse, error) {
	cfg, err := s.repo.Get(ctx)
	if err != nil {
		return nil, err
	}
	
	// Si no existe configuración, devolvemos un objeto vacío
	if cfg == nil {
		return &dto.ConfiguracionFiscalResponse{}, nil
	}

	return &dto.ConfiguracionFiscalResponse{
		CUITEmsior:             cfg.CUITEmsior,
		RazonSocial:            cfg.RazonSocial,
		CondicionFiscal:        cfg.CondicionFiscal,
		PuntoDeVenta:           cfg.PuntoDeVenta,
		Modo:                   cfg.Modo,
		FechaInicioActividades: datePtrToString(cfg.FechaInicioActividades),
		IIBB:                   cfg.IIBB,
		TieneCertificadoCrt:    cfg.CertificadoCrt != nil && *cfg.CertificadoCrt != "",
		TieneCertificadoKey:    cfg.CertificadoKey != nil && *cfg.CertificadoKey != "",
	}, nil
}

func (s *configuracionFiscalService) ActualizarConfiguracion(ctx context.Context, req dto.ConfiguracionFiscalRequest) error {
	// 1. Fetch existing config to preserve certificates if not uploaded
	existing, err := s.repo.Get(ctx)
	if err != nil {
		return err
	}

	var newCrt, newKey *string
	if existing != nil {
		newCrt = existing.CertificadoCrt
		newKey = existing.CertificadoKey
	}

	// Overwrite if new certificates were uploaded
	if req.CertificadoCrt != nil {
		newCrt = req.CertificadoCrt
	}
	if req.CertificadoKey != nil {
		newKey = req.CertificadoKey
	}

	// 2. Map request to model
	cfg := &model.ConfiguracionFiscal{
		CUITEmsior:             req.CUITEmsior,
		RazonSocial:            req.RazonSocial,
		CondicionFiscal:        req.CondicionFiscal,
		PuntoDeVenta:           req.PuntoDeVenta,
		Modo:                   req.Modo,
		FechaInicioActividades: stringToDatePtr(req.FechaInicioActividades),
		IIBB:                   req.IIBB,
		CertificadoCrt:         newCrt,
		CertificadoKey:         newKey,
	}

	// 3. Save to database
	if err := s.repo.Upsert(ctx, cfg); err != nil {
		return fmt.Errorf("error al guardar configuración fiscal: %w", err)
	}

	// 4. If we have certs, ping the sidecar to reload them
	if newCrt != nil && newKey != nil && *newCrt != "" && *newKey != "" {
		if err := s.notificarSidecar(ctx, req.CUITEmsior, req.Modo, *newCrt, *newKey); err != nil {
			return fmt.Errorf("configuración guardada localmente, pero AFIP devolvió error: %w", err)
		}
	}

	return nil
}

func (s *configuracionFiscalService) notificarSidecar(ctx context.Context, cuit, modo, crtBase64, keyBase64 string) error {
	// The Python sidecar expects dynamic reconfiguration
	sidecarURL := s.afipClient.GetSidecarURL()
	token := s.afipClient.GetInternalToken()

	if sidecarURL == "" {
		return nil // Dev feature flag fallback
	}

	payload := map[string]string{
		"cuit_emisor": cuit,
		"modo":        modo,
		"crt_base64":  crtBase64,
		"key_base64":  keyBase64,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", sidecarURL+"/configurar", bytes.NewReader(body))
	if err != nil {
		return err
	}
	
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("X-Internal-Token", token)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("error al contactar el sidecar AFIP: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var result map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&result)
		return fmt.Errorf("el sidecar rechazó la configuración (AFIP WSAA fallido): %v", result["detail"])
	}

	return nil
}

// Helpers
func datePtrToString(t *time.Time) *string {
	if t == nil {
		return nil
	}
	str := t.Format("2006-01-02")
	return &str
}

func stringToDatePtr(s *string) *time.Time {
	if s == nil || *s == "" {
		return nil
	}
	t, err := time.Parse("2006-01-02", *s)
	if err != nil {
		return nil
	}
	return &t
}
