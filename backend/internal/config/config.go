package config

import (
	"github.com/spf13/viper"
)

// Config holds all runtime configuration loaded from environment variables.
// Every field maps 1:1 to a documented env var (see arquitectura.md §11.3).
type Config struct {
	// Server
	Port           int    `mapstructure:"PORT"`
	Env            string `mapstructure:"APP_ENV"` // development | production
	WorkerPoolSize int    `mapstructure:"WORKER_POOL_SIZE"`

	// Database
	DatabaseURL string `mapstructure:"DATABASE_URL"`

	// Redis
	RedisURL string `mapstructure:"REDIS_URL"`

	// Auth
	JWTSecret          string `mapstructure:"JWT_SECRET"`
	JWTExpirationHours int    `mapstructure:"JWT_EXPIRATION_HOURS"`
	JWTRefreshHours    int    `mapstructure:"JWT_REFRESH_HOURS"`

	// AFIP Sidecar
	AFIPSidecarURL string `mapstructure:"AFIP_SIDECAR_URL"`
	AFIPCUITEmisor string `mapstructure:"AFIP_CUIT_EMISOR"`

	// SMTP
	SMTPHost     string `mapstructure:"SMTP_HOST"`
	SMTPPort     int    `mapstructure:"SMTP_PORT"`
	SMTPUser     string `mapstructure:"SMTP_USER"`
	SMTPPassword string `mapstructure:"SMTP_PASSWORD"`

	// Business
	PDFStoragePath string `mapstructure:"PDF_STORAGE_PATH"`
	Domain         string `mapstructure:"DOMAIN"`
}

// Load reads configuration from environment variables (and optional .env file).
func Load() (*Config, error) {
	viper.SetConfigName(".env")
	viper.SetConfigType("env")
	viper.AddConfigPath(".")
	viper.AutomaticEnv()

	// Sensible defaults for development
	viper.SetDefault("PORT", 8000)
	viper.SetDefault("APP_ENV", "development")
	viper.SetDefault("WORKER_POOL_SIZE", 5)
	viper.SetDefault("JWT_EXPIRATION_HOURS", 8)
	viper.SetDefault("JWT_REFRESH_HOURS", 24)
	viper.SetDefault("AFIP_SIDECAR_URL", "http://afip-sidecar:8001")
	viper.SetDefault("SMTP_PORT", 587)
	viper.SetDefault("PDF_STORAGE_PATH", "/tmp/blendpos/pdfs")
	viper.SetDefault("DATABASE_URL", "postgres://blendpos:blendpos@localhost:5432/blendpos?sslmode=disable")
	viper.SetDefault("REDIS_URL", "redis://localhost:6379/0")

	// Optional .env file for local development — does not fail if missing
	_ = viper.ReadInConfig()

	cfg := &Config{}
	if err := viper.Unmarshal(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}
