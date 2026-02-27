# ── Build Stage ────────────────────────────────────────────────────────────────
FROM golang:1.24-alpine AS builder

RUN apk --no-cache add ca-certificates git tzdata curl

WORKDIR /app

# Download deps before copying source — maximizes Docker layer cache hits
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=0 produces a fully static binary (no libc dependency)
# Results in a ~15MB final image from scratch/alpine
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /blendpos ./cmd/server/main.go

# Download golang-migrate CLI for auto-migration on startup
RUN curl -L https://github.com/golang-migrate/migrate/releases/download/v4.17.0/migrate.linux-amd64.tar.gz \
    | tar xz && mv migrate /usr/local/bin/migrate

# ── Runtime Stage ──────────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata

# Non-root user for security
RUN adduser -D -u 1001 blendpos

COPY --from=builder /blendpos /blendpos
COPY --from=builder /usr/local/bin/migrate /usr/local/bin/migrate
COPY --chown=blendpos:blendpos migrations /migrations

# Entrypoint script: run migrations then start server
COPY --chown=blendpos:blendpos entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER blendpos

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8000/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
