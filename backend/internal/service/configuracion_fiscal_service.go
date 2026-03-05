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

// ErrAFIPAuthWarning is returned when the fiscal config was saved to the DB
// but the AFIP sidecar could not authenticate with WSAA (bad cert, unreachable
// service, etc.). The HTTP handler should respond with 200 + a warning field
// rather than 500, because the data IS persisted.
type ErrAFIPAuthWarning struct {
	Msg string
}

func (e *ErrAFIPAuthWarning) Error() string { return e.Msg }

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

	// 4. If we have certs, ping the sidecar to reload them.
	// On sidecar/WSAA failure the config is already persisted — return a warning
	// instead of a hard error so the handler can respond with HTTP 200.
	if newCrt != nil && newKey != nil && *newCrt != "" && *newKey != "" {
		if warn := s.notificarSidecar(ctx, req.CUITEmsior, req.Modo, *newCrt, *newKey); warn != nil {
			return warn // always *ErrAFIPAuthWarning at this point
		}
	}

	return nil
}

func (s *configuracionFiscalService) notificarSidecar(ctx context.Context, cuit, modo, crtBase64, keyBase64 string) error {
	sidecarURL := s.afipClient.GetSidecarURL()
	token := s.afipClient.GetInternalToken()
	if sidecarURL == "" {
		return nil
	}

	payload := map[string]string{
		"cuit_emisor": cuit,
		"modo":        modo,
		"crt_base64":  crtBase64,
		"key_base64":  keyBase64,
	}
	body, _ := json.Marshal(payload)

	httpReq, err := http.NewRequestWithContext(ctx, "POST", sidecarURL+"/configurar", bytes.NewReader(body))
	if err != nil {
		return &ErrAFIPAuthWarning{Msg: fmt.Sprintf("no se pudo preparar la solicitud al sidecar: %s", err)}
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if token != "" {
		httpReq.Header.Set("X-Internal-Token", token)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return &ErrAFIPAuthWarning{Msg: fmt.Sprintf("sidecar AFIP no disponible: %s", err)}
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result) //nolint:errcheck

	if resp.StatusCode != http.StatusOK {
		detail, _ := result["detail"].(string)
		if detail == "" {
			detail = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return &ErrAFIPAuthWarning{Msg: fmt.Sprintf("sidecar rechazó la configuración: %s", detail)}
	}

	// HTTP 200 but the sidecar may report ok=false when WSAA auth failed.
	// The cert files ARE written to disk; we return a warning so the user knows
	// they need to verify the certificate in ARCA.
	if ok, _ := result["ok"].(bool); !ok {
		afipErr, _ := result["afip_error"].(string)
		msg, _ := result["message"].(string)
		if msg == "" {
			msg = "Certificados guardados pero WSAA rechazó la autenticación"
		}
		if afipErr != "" {
			msg = fmt.Sprintf("%s — %s", msg, afipErr)
		}
		return &ErrAFIPAuthWarning{Msg: msg}
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
