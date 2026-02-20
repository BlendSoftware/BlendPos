// cmd/seeduser/main.go — Crea/actualiza usuario de demo.
// Uso: go run cmd/seeduser/main.go
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://blendpos:blendpos@postgres:5432/blendpos?sslmode=disable"
	}
	username := "admin@blendpos.com"
	password := "1234"
	nombre := "Admin Demo"
	email := "admin@blendpos.com"
	rol := "administrador"

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		log.Fatalf("bcrypt error: %v", err)
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("db connect error: %v", err)
	}

	result := db.WithContext(context.Background()).Exec(`
		INSERT INTO usuarios (username, nombre, email, password_hash, rol)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (username) DO UPDATE
		SET password_hash = EXCLUDED.password_hash,
		    nombre = EXCLUDED.nombre,
		    email = EXCLUDED.email,
		    rol = EXCLUDED.rol,
		    activo = true
	`, username, nombre, email, string(hash), rol)

	if result.Error != nil {
		log.Fatalf("insert error: %v", result.Error)
	}
	fmt.Printf("✅ Usuario '%s' creado/actualizado con password '%s'\n", username, password)
}
