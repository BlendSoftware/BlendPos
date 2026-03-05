package config

import (
	"fmt"

	"github.com/spf13/viper"
)

// Config holds all runtime configuration loaded from environment variables.
// Every field maps 1:1 to a documented env var (see arquitectura.md §11.3).
type Config struct {
	// Server
	Port               int    `mapstructure:"PORT"`
	Env                string `mapstructure:"APP_ENV"` // development | production
	WorkerPoolSize     int    `mapstructure:"WORKER_POOL_SIZE"`
	FacturacionWorkers int    `mapstructure:"FACTURACION_WORKERS"`
	EmailWorkers       int    `mapstructure:"EMAIL_WORKERS"`

	// Database
	DatabaseURL string `mapstructure:"DATABASE_URL"`

	// Redis
	RedisURL string `mapstructure:"REDIS_URL"`

	// Auth
	JWTSecret          string `mapstructure:"JWT_SECRET"`
	JWTExpirationHours int    `mapstructure:"JWT_EXPIRATION_HOURS"`
	JWTRefreshHours    int    `mapstructure:"JWT_REFRESH_HOURS"`

	// CORS — comma-separated list of allowed origins
	// e.g. "http://localhost:5173" for dev, "https://pos.miempresa.com" for prod
	AllowedOrigins string `mapstructure:"ALLOWED_ORIGINS"`

	// AFIP Sidecar
	AFIPSidecarURL string `mapstructure:"AFIP_SIDECAR_URL"`
	AFIPCUITEmisor string `mapstructure:"AFIP_CUIT_EMISOR"`
	// InternalAPIToken authenticates Go backend → AFIP Sidecar calls.
	// Must match INTERNAL_API_TOKEN in the sidecar container.
	InternalAPIToken string `mapstructure:"INTERNAL_API_TOKEN"`

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
// It validates critical security settings and returns an error if they are not met.
func Load() (*Config, error) {
	viper.SetConfigName(".env")
	viper.SetConfigType("env")
	viper.AddConfigPath(".")
	viper.AutomaticEnv()

	// Sensible defaults for development
	viper.SetDefault("PORT", 8000)
	viper.SetDefault("APP_ENV", "development")
	viper.SetDefault("WORKER_POOL_SIZE", 5)
	viper.SetDefault("FACTURACION_WORKERS", 0) // 0 = fallback to WORKER_POOL_SIZE
	viper.SetDefault("EMAIL_WORKERS", 0)       // 0 = fallback to WORKER_POOL_SIZE
	viper.SetDefault("JWT_EXPIRATION_HOURS", 8)
	viper.SetDefault("JWT_REFRESH_HOURS", 24)
	viper.SetDefault("ALLOWED_ORIGINS", "*")
	viper.SetDefault("AFIP_SIDECAR_URL", "http://afip-sidecar:8001")
	viper.SetDefault("INTERNAL_API_TOKEN", "")
	viper.SetDefault("SMTP_PORT", 587)
	viper.SetDefault("PDF_STORAGE_PATH", "/tmp/blendpos/pdfs")
	viper.SetDefault("DATABASE_URL", "postgres://blendpos:blendpos@localhost:5432/blendpos?sslmode=disable")
	viper.SetDefault("REDIS_URL", "redis://localhost:6379/0")

	// Register keys without defaults so AutomaticEnv picks them up during Unmarshal.
	// viper only checks env vars for keys it already knows about; calling SetDefault("")
	// or BindEnv is required when no default value exists.
	_ = viper.BindEnv("JWT_SECRET")
	_ = viper.BindEnv("DATABASE_URL")
	_ = viper.BindEnv("REDIS_URL")
	_ = viper.BindEnv("AFIP_CUIT_EMISOR")
	_ = viper.BindEnv("INTERNAL_API_TOKEN")
	_ = viper.BindEnv("SMTP_HOST")
	_ = viper.BindEnv("SMTP_USER")
	_ = viper.BindEnv("SMTP_PASSWORD")

	// Optional .env file for local development — does not fail if missing
	_ = viper.ReadInConfig()

	cfg := &Config{}
	if err := viper.Unmarshal(cfg); err != nil {
		return nil, err
	}

	// ── Security validations ─────────────────────────────────────────────
	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

// validate checks critical security invariants that must hold before the
// server is allowed to start.
func (c *Config) validate() error {
	if len(c.JWTSecret) < 32 {
		return fmt.Errorf("FATAL: JWT_SECRET must be at least 32 characters long (got %d). "+
			"Generate one with: openssl rand -hex 32", len(c.JWTSecret))
	}

	// ── SEC-04: Block known default JWT secrets in production ─────────
	isProd := c.Env == "production"
	if isProd {
		knownDefaults := []string{
			"super_secret_key_change_me_in_production_min_32_chars",
			"dev_secret_change_in_production!_32chars",
		}
		for _, d := range knownDefaults {
			if c.JWTSecret == d {
				return fmt.Errorf("FATAL: JWT_SECRET is set to a known default value. " +
					"This is a critical security risk in production. " +
					"Generate a unique secret with: openssl rand -hex 32")
			}
		}
	}

	// ── SEC-05: Warn about INTERNAL_API_TOKEN in production ──────────
	// Not fatal: MVP may not have the AFIP sidecar deployed yet.
	// The token is still enforced at the middleware level when sidecar calls are made.
	if isProd && c.InternalAPIToken == "" {
		fmt.Println("WARNING: INTERNAL_API_TOKEN is not set. AFIP sidecar calls will be unauthenticated.")
	}

	return nil
}

// IsSMTPConfigured returns true if all required SMTP settings are present.
func (c *Config) IsSMTPConfigured() bool {
	return c.SMTPHost != "" && c.SMTPPort > 0 && c.SMTPUser != "" && c.SMTPPassword != ""
}
