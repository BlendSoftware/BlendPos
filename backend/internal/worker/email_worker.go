package worker

// email_worker.go
// Processes email jobs from QueueEmail.
// Sends PDF receipts to customer emails via SMTP (RF-21, AC-06.5).

import (
	"context"
	"encoding/json"

	"blendpos/internal/infra"

	"github.com/rs/zerolog/log"
)

// EmailJobPayload is the job envelope sent to QueueEmail.
type EmailJobPayload struct {
	ToEmail string `json:"to_email"`
	Subject string `json:"subject"`
	Body    string `json:"body"`
	PDFPath string `json:"pdf_path"`
}

// EmailWorker processes email jobs from QueueEmail.
// Sends PDF receipts to customer emails via SMTP.
type EmailWorker struct {
	mailer *infra.Mailer
}

// NewEmailWorker creates an EmailWorker with the provided SMTP mailer.
func NewEmailWorker(mailer *infra.Mailer) *EmailWorker {
	return &EmailWorker{mailer: mailer}
}

// Process sends an email with the PDF receipt as attachment.
func (w *EmailWorker) Process(_ context.Context, raw json.RawMessage) {
	var payload EmailJobPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		log.Error().Err(err).Msg("email_worker: invalid payload")
		return
	}
	if payload.ToEmail == "" {
		log.Warn().Msg("email_worker: empty to_email — skipping")
		return
	}

	if err := w.mailer.SendComprobante(payload.ToEmail, payload.Subject, payload.Body, payload.PDFPath); err != nil {
		log.Error().Err(err).Str("to", payload.ToEmail).Msg("email_worker: failed to send email")
		return
	}
	log.Info().Str("to", payload.ToEmail).Msg("email_worker: comprobante sent successfully")
}
