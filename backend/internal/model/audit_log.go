package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// AuditLog records who changed what and when for critical operations (Q-03).
type AuditLog struct {
	ID         uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID     uuid.UUID       `gorm:"type:uuid;not null" json:"user_id"`
	UserName   string          `gorm:"type:varchar(200);not null" json:"user_name"`
	Action     string          `gorm:"type:varchar(50);not null" json:"action"`
	EntityType string          `gorm:"type:varchar(100);not null" json:"entity_type"`
	EntityID   *uuid.UUID      `gorm:"type:uuid" json:"entity_id,omitempty"`
	Details    json.RawMessage `gorm:"type:jsonb" json:"details,omitempty"`
	IPAddress  string          `gorm:"type:varchar(45)" json:"ip_address,omitempty"`
	CreatedAt  time.Time       `gorm:"autoCreateTime" json:"created_at"`
}

func (AuditLog) TableName() string { return "audit_log" }
