package worker

// dlq.go — Dead Letter Queue
// Jobs that exceed the maximum retry count are moved here for manual inspection.
// Uses a Redis list per source queue: dlq:{original_queue}

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

const DLQPrefix = "dlq:"

// DLQEntry wraps a failed job with metadata for debugging.
type DLQEntry struct {
	OriginalQueue string          `json:"original_queue"`
	JobType       string          `json:"job_type"`
	Payload       json.RawMessage `json:"payload"`
	Reason        string          `json:"reason"`
	FailedAt      string          `json:"failed_at"` // ISO 8601
	Attempts      int             `json:"attempts"`
}

// SendToDLQ pushes a failed job to the dead letter queue for manual inspection.
func SendToDLQ(ctx context.Context, rdb *redis.Client, queue string, jobType string, payload json.RawMessage, reason string, attempts int) {
	entry := DLQEntry{
		OriginalQueue: queue,
		JobType:       jobType,
		Payload:       payload,
		Reason:        reason,
		FailedAt:      time.Now().UTC().Format(time.RFC3339),
		Attempts:      attempts,
	}

	data, err := json.Marshal(entry)
	if err != nil {
		log.Error().Err(err).Str("queue", queue).Msg("dlq: failed to marshal entry")
		return
	}

	dlqKey := DLQPrefix + queue
	if err := rdb.LPush(ctx, dlqKey, data).Err(); err != nil {
		log.Error().Err(err).Str("dlq_key", dlqKey).Msg("dlq: failed to push to DLQ")
		return
	}

	log.Warn().
		Str("queue", queue).
		Str("job_type", jobType).
		Str("reason", reason).
		Int("attempts", attempts).
		Msg("dlq: job moved to dead letter queue")
}

// DLQLength returns the number of entries in a DLQ for monitoring.
func DLQLength(ctx context.Context, rdb *redis.Client, queue string) (int64, error) {
	return rdb.LLen(ctx, DLQPrefix+queue).Result()
}
