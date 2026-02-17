package infra

import (
	"blendpos/internal/config"
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

// SendComprobante sends a PDF receipt to the customer email.
func (m *Mailer) SendComprobante(to, subject, body, pdfPath string) error {
	e := email.NewEmail()
	e.From = m.user
	e.To = []string{to}
	e.Subject = subject
	e.Text = []byte(body)

	if pdfPath != "" {
		if _, err := e.AttachFile(pdfPath); err != nil {
			return fmt.Errorf("mailer: attach PDF: %w", err)
		}
	}

	auth := smtp.PlainAuth("", m.user, m.password, m.host)
	return e.Send(m.addr, auth)
}
