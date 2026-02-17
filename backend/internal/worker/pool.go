package worker

import (
	"context"
	"encoding/json"
	"time"

	"blendpos/internal/infra"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

const (
	QueueFacturacion = "jobs:facturacion"
	QueueEmail       = "jobs:email"
)

// Job is the generic envelope for all async tasks.
type Job struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// Dispatcher enqueues async jobs into Redis lists.
// The worker pool dequeues them via BRPOP.
type Dispatcher struct {
	rdb        *redis.Client
	afipClient *infra.AFIPClient
	mailer     *infra.Mailer
}

func NewDispatcher(rdb *redis.Client, afipClient *infra.AFIPClient, mailer *infra.Mailer) *Dispatcher {
	return &Dispatcher{rdb: rdb, afipClient: afipClient, mailer: mailer}
}

// EnqueueFacturacion pushes a billing job to Redis.
func (d *Dispatcher) EnqueueFacturacion(ctx context.Context, payload interface{}) error {
	return d.enqueue(ctx, QueueFacturacion, "facturacion", payload)
}

// EnqueueEmail pushes an email job to Redis.
func (d *Dispatcher) EnqueueEmail(ctx context.Context, payload interface{}) error {
	return d.enqueue(ctx, QueueEmail, "email", payload)
}

func (d *Dispatcher) enqueue(ctx context.Context, queue, jobType string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	job := Job{Type: jobType, Payload: data}
	encoded, err := json.Marshal(job)
	if err != nil {
		return err
	}
	return d.rdb.LPush(ctx, queue, encoded).Err()
}

// StartWorkerPool launches numWorkers goroutines consuming both queues.
// Each goroutine blocks on BRPOP — zero CPU when idle.
func StartWorkerPool(ctx context.Context, rdb *redis.Client, numWorkers int) {
	for i := 0; i < numWorkers; i++ {
		go runWorker(ctx, rdb, i)
	}
	log.Info().Msgf("worker pool started with %d workers", numWorkers)
}

func runWorker(ctx context.Context, rdb *redis.Client, id int) {
	queues := []string{QueueFacturacion, QueueEmail}
	for {
		select {
		case <-ctx.Done():
			log.Info().Msgf("worker %d shutting down", id)
			return
		default:
			// Blocking pop — waits up to 5s then loops to check ctx
			result, err := rdb.BRPop(ctx, 5*time.Second, queues...).Result()
			if err != nil {
				continue // timeout or context cancelled
			}
			if len(result) < 2 {
				continue
			}
			processJob(ctx, result[0], result[1])
		}
	}
}

func processJob(ctx context.Context, queue, raw string) {
	var job Job
	if err := json.Unmarshal([]byte(raw), &job); err != nil {
		log.Error().Str("queue", queue).Err(err).Msg("failed to unmarshal job")
		return
	}
	// Specific handlers are wired in Phase 5
	log.Info().Str("type", job.Type).Str("queue", queue).Msg("processing job")
}
