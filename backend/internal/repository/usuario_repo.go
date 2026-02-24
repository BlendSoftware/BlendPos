package repository

import (
	"context"

	"blendpos/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type UsuarioRepository interface {
	Create(ctx context.Context, u *model.Usuario) error
	FindByUsername(ctx context.Context, username string) (*model.Usuario, error)
	FindByID(ctx context.Context, id uuid.UUID) (*model.Usuario, error)
	List(ctx context.Context) ([]model.Usuario, error)
	ListAll(ctx context.Context) ([]model.Usuario, error)
	Update(ctx context.Context, u *model.Usuario) error
	SoftDelete(ctx context.Context, id uuid.UUID) error
	Reactivar(ctx context.Context, id uuid.UUID) error
}

type usuarioRepo struct{ db *gorm.DB }

func NewUsuarioRepository(db *gorm.DB) UsuarioRepository { return &usuarioRepo{db: db} }

func (r *usuarioRepo) Create(ctx context.Context, u *model.Usuario) error {
	return r.db.WithContext(ctx).Create(u).Error
}

func (r *usuarioRepo) FindByUsername(ctx context.Context, username string) (*model.Usuario, error) {
	var u model.Usuario
	// Accept login by username OR email (case-insensitive email match)
	err := r.db.WithContext(ctx).
		Where("(username = ? OR LOWER(email::text) = LOWER(?)) AND activo = true", username, username).
		First(&u).Error
	return &u, err
}

func (r *usuarioRepo) FindByID(ctx context.Context, id uuid.UUID) (*model.Usuario, error) {
	var u model.Usuario
	err := r.db.WithContext(ctx).First(&u, id).Error
	return &u, err
}

func (r *usuarioRepo) List(ctx context.Context) ([]model.Usuario, error) {
	var users []model.Usuario
	err := r.db.WithContext(ctx).Where("activo = true").Find(&users).Error
	return users, err
}

func (r *usuarioRepo) ListAll(ctx context.Context) ([]model.Usuario, error) {
	var users []model.Usuario
	err := r.db.WithContext(ctx).Find(&users).Error
	return users, err
}

func (r *usuarioRepo) Update(ctx context.Context, u *model.Usuario) error {
	return r.db.WithContext(ctx).Save(u).Error
}

func (r *usuarioRepo) SoftDelete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&model.Usuario{}).Where("id = ?", id).Update("activo", false).Error
}

func (r *usuarioRepo) Reactivar(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&model.Usuario{}).Where("id = ?", id).Update("activo", true).Error
}
