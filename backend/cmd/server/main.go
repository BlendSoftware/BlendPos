package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"blendpos/internal/config"
	"blendpos/internal/infra"
	"blendpos/internal/repository"
	"blendpos/internal/router"
	"blendpos/internal/worker"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	// Structured logger — dev: pretty, prod: JSON
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	db, err := infra.NewDatabase(cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to postgres")
	}

	rdb, err := infra.NewRedis(cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to redis")
	}

	// Start goroutine worker pool for async tasks (invoicing, email, PDF).
	// Worker handlers are wired here (composition root) so that the pool
	// has full access to all infrastructure dependencies (RF-17, RF-19, RF-21).
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	afipClient := infra.NewAFIPClient(cfg.AFIPSidecarURL)
	mailer := infra.NewMailer(cfg)
	dispatcher := worker.NewDispatcher(rdb, afipClient, mailer)
	comprobanteRepo := repository.NewComprobanteRepository(db)
	ventaRepo := repository.NewVentaRepository(db)

	workerHandlers := &worker.WorkerHandlers{
		Facturacion: worker.NewFacturacionWorker(afipClient, comprobanteRepo, ventaRepo, dispatcher, cfg.PDFStoragePath),
		Email:       worker.NewEmailWorker(mailer),
	}
	worker.StartWorkerPool(ctx, rdb, workerHandlers, cfg.WorkerPoolSize)

	r := router.New(cfg, db, rdb)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown on SIGINT / SIGTERM
	go func() {
		log.Info().Msgf("BlendPOS backend listening on :%d", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down server…")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatal().Err(err).Msg("forced shutdown")
	}
	log.Info().Msg("server exited")
}
