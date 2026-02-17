package worker

// facturacion_worker.go
// Processes fiscal billing jobs from QueueFacturacion.
// Sends POST to the Python AFIP Sidecar and stores the CAE result.
// Implements exponential backoff (max 3 retries) as required by RF-19.
// Full implementation: Phase 5 (T-5.2)

// TODO (Phase 5): implement FacturacionWorker
