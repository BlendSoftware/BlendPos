package infra

import (
	"blendpos/internal/config"
	"crypto/tls"
	"fmt"
	"net/smtp"

	"github.com/jordan-wright/email"
)

// Mailer wraps SMTP configuration for sending emails with PDF attachments.
type Mailer struct {
	host     string
	port     int
	user     string
	password string
	addr     string
}

func NewMailer(cfg *config.Config) *Mailer {
	return &Mailer{
		host:     cfg.SMTPHost,
		port:     cfg.SMTPPort,
		user:     cfg.SMTPUser,
		password: cfg.SMTPPassword,
		addr:     fmt.Sprintf("%s:%d", cfg.SMTPHost, cfg.SMTPPort),
	}
}

// IsConfigured returns false when SMTP credentials are missing.
func (m *Mailer) IsConfigured() bool {
	return m.host != "" && m.user != "" && m.password != ""
}

// SendComprobante sends a PDF receipt to the customer email.
// Supports Gmail (port 587 STARTTLS / port 465 TLS) and plain SMTP.
func (m *Mailer) SendComprobante(to, subject, body, pdfPath string) error {
	if !m.IsConfigured() {
		return fmt.Errorf("mailer: SMTP not configured")
	}

	e := email.NewEmail()
	e.From = fmt.Sprintf("BlendPOS <%s>", m.user)
	e.To = []string{to}
	e.Subject = subject
	e.Text = []byte(body)

	if pdfPath != "" {
		if _, err := e.AttachFile(pdfPath); err != nil {
			return fmt.Errorf("mailer: attach PDF: %w", err)
		}
	}

	tlsCfg := &tls.Config{ServerName: m.host}
	auth := smtp.PlainAuth("", m.user, m.password, m.host)

	// Port 465 = implicit TLS (SMTPS); port 587 = STARTTLS; others = plain.
	switch m.port {
	case 465:
		return e.SendWithTLS(m.addr, auth, tlsCfg)
	case 587:
		return e.SendWithStartTLS(m.addr, auth, tlsCfg)
	default:
		return e.Send(m.addr, auth)
	}
}
