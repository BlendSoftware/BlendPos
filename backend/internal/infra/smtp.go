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
// Port 465 → implicit TLS (recommended on Railway).
// Port 587 → STARTTLS.
func (m *Mailer) SendComprobante(to, subject, body, pdfPath string) error {
	if !m.IsConfigured() {
		return fmt.Errorf("mailer: SMTP no configurado")
	}

	msg, err := buildMessage(m.user, to, subject, body, pdfPath)
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

// buildMessage constructs a MIME email. If pdfPath is set, attaches it.
func buildMessage(from, to, subject, body, pdfPath string) ([]byte, error) {
	var buf bytes.Buffer

	if pdfPath == "" {
		fmt.Fprintf(&buf, "From: BlendPOS <%s>\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s", from, to, subject, body)
		return buf.Bytes(), nil
	}

	pdfData, err := os.ReadFile(pdfPath)
	if err != nil {
		return nil, fmt.Errorf("mailer: leer PDF: %w", err)
	}

	boundary := "==BlendPOS_Boundary=="
	fmt.Fprintf(&buf, "From: BlendPOS <%s>\r\n", from)
	fmt.Fprintf(&buf, "To: %s\r\n", to)
	fmt.Fprintf(&buf, "Subject: %s\r\n", subject)
	fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(&buf, "Content-Type: multipart/mixed; boundary=%q\r\n\r\n", boundary)

	// Texto
	fmt.Fprintf(&buf, "--%s\r\n", boundary)
	fmt.Fprintf(&buf, "Content-Type: text/plain; charset=UTF-8\r\n\r\n")
	fmt.Fprintf(&buf, "%s\r\n\r\n", body)

	// PDF adjunto
	fmt.Fprintf(&buf, "--%s\r\n", boundary)
	fmt.Fprintf(&buf, "Content-Type: application/pdf\r\n")
	fmt.Fprintf(&buf, "Content-Disposition: attachment; filename=%q\r\n", filepath.Base(pdfPath))
	fmt.Fprintf(&buf, "Content-Transfer-Encoding: base64\r\n\r\n")
	encoded := base64.StdEncoding.EncodeToString(pdfData)
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


// Mailer envía emails usando la API HTTP de Resend (resend.com).
// No usa SMTP — evita bloqueos de puertos en Railway y similares.
type Mailer struct {
	apiKey  string
	fromAddr string
	httpClient *http.Client
}

func NewMailer(cfg *config.Config) *Mailer {
	from := cfg.SMTPUser // reutilizamos SMTPUser como dirección FROM
	if from == "" {
		from = "BlendPOS <onboarding@resend.dev>"
	} else if cfg.ResendFromName != "" {
		from = fmt.Sprintf("%s <%s>", cfg.ResendFromName, from)
	} else {
		from = fmt.Sprintf("BlendPOS <%s>", from)
	}
	return &Mailer{
		apiKey:   cfg.ResendAPIKey,
		fromAddr: from,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// IsConfigured returns false when Resend API key is missing.
func (m *Mailer) IsConfigured() bool {
	return m.apiKey != ""
}

type resendAttachment struct {
	Filename string `json:"filename"`
	Content  string `json:"content"` // base64
}

type resendRequest struct {
	From        string             `json:"from"`
	To          []string           `json:"to"`
	Subject     string             `json:"subject"`
	Text        string             `json:"text"`
	Attachments []resendAttachment `json:"attachments,omitempty"`
}

// SendComprobante envía el comprobante al email del cliente vía Resend.
func (m *Mailer) SendComprobante(to, subject, body, pdfPath string) error {
	if !m.IsConfigured() {
		return fmt.Errorf("mailer: Resend API key no configurado (RESEND_API_KEY)")
	}

	req := resendRequest{
		From:    m.fromAddr,
		To:      []string{to},
		Subject: subject,
		Text:    body,
	}

	if pdfPath != "" {
		data, err := os.ReadFile(pdfPath)
		if err == nil {
			req.Attachments = []resendAttachment{{
				Filename: filepath.Base(pdfPath),
				Content:  base64.StdEncoding.EncodeToString(data),
			}}
		}
	}

	payload, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("mailer: marshal: %w", err)
	}

	httpReq, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("mailer: create request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+m.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := m.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("mailer: resend request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mailer: resend error %d: %s", resp.StatusCode, string(body))
	}
	return nil
}
