package infra

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"net"
	"net/smtp"
	"os"
	"path/filepath"
	"strings"

	"blendpos/internal/config"
)

// Mailer sends emails via SMTP (Gmail-compatible).
// Use port 465 (implicit TLS/SMTPS) on Railway — port 587 is blocked.
type Mailer struct {
	host     string
	port     int
	user     string
	password string
}

func NewMailer(cfg *config.Config) *Mailer {
	return &Mailer{
		host:     cfg.SMTPHost,
		port:     cfg.SMTPPort,
		user:     cfg.SMTPUser,
		password: cfg.SMTPPassword,
	}
}

// IsConfigured returns false when SMTP credentials are missing.
func (m *Mailer) IsConfigured() bool {
	return m.host != "" && m.user != "" && m.password != ""
}

// SendComprobante sends a receipt email, optionally attaching a PDF.
// If htmlBody is non-empty it is used as the email body (text/html); body is the plain-text fallback.
// Port 465 → implicit TLS (recommended on Railway).
// Port 587 → STARTTLS.
func (m *Mailer) SendComprobante(to, subject, body, htmlBody, pdfPath string) error {
	if !m.IsConfigured() {
		return fmt.Errorf("mailer: SMTP no configurado")
	}

	msg, err := buildMessage(m.user, to, subject, body, htmlBody, pdfPath)
	if err != nil {
		return err
	}

	addr := fmt.Sprintf("%s:%d", m.host, m.port)
	auth := smtp.PlainAuth("", m.user, m.password, m.host)
	tlsCfg := &tls.Config{ServerName: m.host}

	if m.port == 465 {
		// Implicit TLS — no STARTTLS handshake needed
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return fmt.Errorf("mailer: tls dial: %w", err)
		}
		client, err := smtp.NewClient(conn, m.host)
		if err != nil {
			return fmt.Errorf("mailer: smtp client: %w", err)
		}
		defer client.Close()
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("mailer: auth: %w", err)
		}
		return sendViaClient(client, m.user, to, msg)
	}

	// Port 587 or other — STARTTLS
	rawConn, err := net.Dial("tcp", addr)
	if err != nil {
		return fmt.Errorf("mailer: dial: %w", err)
	}
	client, err := smtp.NewClient(rawConn, m.host)
	if err != nil {
		return fmt.Errorf("mailer: smtp client: %w", err)
	}
	defer client.Close()
	if ok, _ := client.Extension("STARTTLS"); ok {
		if err = client.StartTLS(tlsCfg); err != nil {
			return fmt.Errorf("mailer: starttls: %w", err)
		}
	}
	if err = client.Auth(auth); err != nil {
		return fmt.Errorf("mailer: auth: %w", err)
	}
	return sendViaClient(client, m.user, to, msg)
}

func sendViaClient(client *smtp.Client, from, to string, msg []byte) error {
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("mailer: MAIL FROM: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("mailer: RCPT TO: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("mailer: DATA: %w", err)
	}
	if _, err = w.Write(msg); err != nil {
		return fmt.Errorf("mailer: write: %w", err)
	}
	return w.Close()
}

// buildMessage constructs a MIME email.
// If htmlBody is set it is used as the body (text/html); otherwise body (text/plain) is used.
// If attachPath is set, the file is attached via multipart/mixed (supports .pdf and .html).
func buildMessage(from, to, subject, body, htmlBody, attachPath string) ([]byte, error) {
	var buf bytes.Buffer

	bodyContentType := "text/plain; charset=UTF-8"
	bodyContent := body
	if htmlBody != "" {
		bodyContentType = "text/html; charset=UTF-8"
		bodyContent = htmlBody
	}

	if attachPath == "" {
		fmt.Fprintf(&buf, "From: Mix de Dulzura <%s>\r\n", from)
		fmt.Fprintf(&buf, "To: %s\r\n", to)
		fmt.Fprintf(&buf, "Subject: %s\r\n", subject)
		fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")
		fmt.Fprintf(&buf, "Content-Type: %s\r\n\r\n", bodyContentType)
		fmt.Fprintf(&buf, "%s", bodyContent)
		return buf.Bytes(), nil
	}

	attachData, err := os.ReadFile(attachPath)
	if err != nil {
		return nil, fmt.Errorf("mailer: leer adjunto: %w", err)
	}

	// Determine content type from file extension
	ext := strings.ToLower(filepath.Ext(attachPath))
	attachContentType := "application/pdf"
	attachFilename := filepath.Base(attachPath)
	if ext == ".html" || ext == ".htm" {
		attachContentType = "text/html; charset=UTF-8"
		// Rename to .html for clarity in email clients
		attachFilename = strings.TrimSuffix(attachFilename, ext) + ".html"
	}

	boundary := "==BlendPOS_Boundary=="
	fmt.Fprintf(&buf, "From: Mix de Dulzura <%s>\r\n", from)
	fmt.Fprintf(&buf, "To: %s\r\n", to)
	fmt.Fprintf(&buf, "Subject: %s\r\n", subject)
	fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&buf, "Content-Type: multipart/mixed; boundary=%q\r\n\r\n", boundary)

	// Cuerpo (HTML o texto plano)
	fmt.Fprintf(&buf, "--%s\r\n", boundary)
	fmt.Fprintf(&buf, "Content-Type: %s\r\n\r\n", bodyContentType)
	fmt.Fprintf(&buf, "%s\r\n\r\n", bodyContent)

	// Adjunto
	fmt.Fprintf(&buf, "--%s\r\n", boundary)
	fmt.Fprintf(&buf, "Content-Type: %s\r\n", attachContentType)
	fmt.Fprintf(&buf, "Content-Disposition: attachment; filename=%q\r\n", attachFilename)
	fmt.Fprintf(&buf, "Content-Transfer-Encoding: base64\r\n\r\n")
	encoded := base64.StdEncoding.EncodeToString(attachData)
	for i := 0; i < len(encoded); i += 76 {
		end := i + 76
		if end > len(encoded) {
			end = len(encoded)
		}
		fmt.Fprintf(&buf, "%s\r\n", encoded[i:end])
	}
	fmt.Fprintf(&buf, "--%s--\r\n", boundary)

	return buf.Bytes(), nil
}

