package repository

import (
	"context"

	"blendpos/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ConfiguracionFiscalRepository interface {
	Get(ctx context.Context) (*model.ConfiguracionFiscal, error)
	Upsert(ctx context.Context, config *model.ConfiguracionFiscal) error
}

type configuracionFiscalRepository struct {
	db *gorm.DB
}

func NewConfiguracionFiscalRepository(db *gorm.DB) ConfiguracionFiscalRepository {
	return &configuracionFiscalRepository{db}
}

// Fixed UUID for the single configuration row
var ConfigFiscalID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

func (r *configuracionFiscalRepository) Get(ctx context.Context) (*model.ConfiguracionFiscal, error) {
	var cfg model.ConfiguracionFiscal
	if err := r.db.WithContext(ctx).Where("id = ?", ConfigFiscalID).First(&cfg).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil // Not found is acceptable (first time setup)
		}
		return nil, err
	}
	return &cfg, nil
}

func (r *configuracionFiscalRepository) Upsert(ctx context.Context, config *model.ConfiguracionFiscal) error {
	config.ID = ConfigFiscalID
	
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing model.ConfiguracionFiscal
		err := tx.Where("id = ?", ConfigFiscalID).First(&existing).Error
		
		if err == gorm.ErrRecordNotFound {
			// Create
			return tx.Create(config).Error
		} else if err != nil {
			return err
		}

		// Update
		config.CreatedAt = existing.CreatedAt // Preserve creation time
		return tx.Save(config).Error
	})
}
