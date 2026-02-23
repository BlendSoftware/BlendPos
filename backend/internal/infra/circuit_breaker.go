package infra

import (
	"errors"
	"sync"
	"time"
)

// ── Circuit Breaker ───────────────────────────────────────────────────────────
// Generic implementation of the Circuit Breaker pattern (Closed → Open → Half-Open).
// Prevents cascading failures when the AFIP Sidecar is unavailable.
//
// States:
//   - Closed:    normal operation, requests pass through
//   - Open:      all requests fail immediately (fast-fail)
//   - Half-Open: one probe request allowed through to test recovery

// CBState represents the current circuit breaker state.
type CBState int

const (
	CBClosed   CBState = iota // normal — requests flow
	CBOpen                    // tripped — fast-fail all requests
	CBHalfOpen                // probing — one request allowed
)

// String returns a human-readable state name (for health endpoints / logs).
func (s CBState) String() string {
	switch s {
	case CBClosed:
		return "closed"
	case CBOpen:
		return "open"
	case CBHalfOpen:
		return "half-open"
	default:
		return "unknown"
	}
}

// ErrCircuitOpen is returned when Execute is called while the CB is open.
var ErrCircuitOpen = errors.New("circuit breaker is open")

// CircuitBreakerConfig holds tunable parameters.
type CircuitBreakerConfig struct {
	FailureThreshold int           // consecutive failures to trip open (default: 5)
	SuccessThreshold int           // consecutive successes in half-open to close (default: 2)
	OpenTimeout      time.Duration // how long to stay open before probing (default: 60s)
}

// DefaultCBConfig returns sensible defaults for the AFIP circuit breaker.
func DefaultCBConfig() CircuitBreakerConfig {
	return CircuitBreakerConfig{
		FailureThreshold: 5,
		SuccessThreshold: 2,
		OpenTimeout:      60 * time.Second,
	}
}

// CircuitBreaker implements the pattern with thread-safe state transitions.
type CircuitBreaker struct {
	mu               sync.Mutex
	state            CBState
	failureCount     int
	successCount     int
	lastFailureTime  time.Time
	failureThreshold int
	successThreshold int
	openTimeout      time.Duration
}

// NewCircuitBreaker creates a CB in Closed state.
func NewCircuitBreaker(cfg CircuitBreakerConfig) *CircuitBreaker {
	if cfg.FailureThreshold <= 0 {
		cfg.FailureThreshold = 5
	}
	if cfg.SuccessThreshold <= 0 {
		cfg.SuccessThreshold = 2
	}
	if cfg.OpenTimeout <= 0 {
		cfg.OpenTimeout = 60 * time.Second
	}
	return &CircuitBreaker{
		state:            CBClosed,
		failureThreshold: cfg.FailureThreshold,
		successThreshold: cfg.SuccessThreshold,
		openTimeout:      cfg.OpenTimeout,
	}
}

// State returns the current CB state (safe for concurrent reads).
func (cb *CircuitBreaker) State() CBState {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	// Auto-transition open → half-open if timeout elapsed
	if cb.state == CBOpen && time.Since(cb.lastFailureTime) >= cb.openTimeout {
		cb.state = CBHalfOpen
		cb.successCount = 0
	}
	return cb.state
}

// Execute runs fn through the circuit breaker.
// Returns ErrCircuitOpen immediately if the CB is open.
func (cb *CircuitBreaker) Execute(fn func() error) error {
	state := cb.State()

	if state == CBOpen {
		return ErrCircuitOpen
	}

	err := fn()

	cb.mu.Lock()
	defer cb.mu.Unlock()

	if err != nil {
		cb.onFailure()
		return err
	}
	cb.onSuccess()
	return nil
}

// onFailure records a failure (must be called under lock).
func (cb *CircuitBreaker) onFailure() {
	cb.failureCount++
	cb.lastFailureTime = time.Now()

	switch cb.state {
	case CBClosed:
		if cb.failureCount >= cb.failureThreshold {
			cb.state = CBOpen
			cb.successCount = 0
		}
	case CBHalfOpen:
		// Probe failed — go back to open
		cb.state = CBOpen
		cb.failureCount = 0
	}
}

// onSuccess records a success (must be called under lock).
func (cb *CircuitBreaker) onSuccess() {
	switch cb.state {
	case CBClosed:
		cb.failureCount = 0
	case CBHalfOpen:
		cb.successCount++
		if cb.successCount >= cb.successThreshold {
			cb.state = CBClosed
			cb.failureCount = 0
			cb.successCount = 0
		}
	}
}
