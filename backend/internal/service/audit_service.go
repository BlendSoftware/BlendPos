package service

import (
	"context"
	"encoding/json"

	"blendpos/internal/model"
	"blendpos/internal/repository"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// AuditService provides a fire-and-forget interface for recording audit entries.
// If the audit write fails, the error is logged but the calling operation is NOT affected.
type AuditService interface {
	Log(ctx context.Context, entry AuditEntry)
}

// AuditEntry is the input struct for creating an audit log.
type AuditEntry struct {
	UserID     uuid.UUID
	UserName   string
	Action     string // create, update, delete, login, anular
	EntityType string // producto, venta, usuario, proveedor, caja, precio_masivo
	EntityID   *uuid.UUID
	Details    interface{} // will be marshalled to JSON
	IPAddress  string
}

type auditService struct {
	repo repository.AuditRepository
}

// NewAuditService creates an audit service. If repo is nil, audit calls are no-ops.
func NewAuditService(repo repository.AuditRepository) AuditService {
	return &auditService{repo: repo}
}

func (s *auditService) Log(ctx context.Context, entry AuditEntry) {
	if s.repo == nil {
		return
	}

	var detailsJSON json.RawMessage
	if entry.Details != nil {
		b, err := json.Marshal(entry.Details)
		if err != nil {
			log.Error().Err(err).Str("action", entry.Action).Msg("audit: failed to marshal details")
			detailsJSON = json.RawMessage(`{}`)
		} else {
			detailsJSON = b
		}
	}

	record := &model.AuditLog{
		UserID:     entry.UserID,
		UserName:   entry.UserName,
		Action:     entry.Action,
		EntityType: entry.EntityType,
		EntityID:   entry.EntityID,
		Details:    detailsJSON,
		IPAddress:  entry.IPAddress,
	}

	// Fire-and-forget: run in a goroutine so the caller is never blocked or affected.
	go func() {
		if err := s.repo.Log(context.Background(), record); err != nil {
			log.Error().Err(err).
				Str("action", entry.Action).
				Str("entity_type", entry.EntityType).
				Msg("audit: failed to persist audit log entry")
		}
	}()
}
