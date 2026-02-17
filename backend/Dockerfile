# ── Build Stage ────────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

RUN apk --no-cache add ca-certificates git tzdata

WORKDIR /app

# Download deps before copying source — maximizes Docker layer cache hits
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=0 produces a fully static binary (no libc dependency)
# Results in a ~15MB final image from scratch/alpine
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /blendpos ./cmd/server/main.go

# ── Runtime Stage ──────────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata

# Non-root user for security
RUN adduser -D -u 1001 blendpos
USER blendpos

COPY --from=builder /blendpos /blendpos
COPY --chown=blendpos:blendpos migrations /migrations

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8000/health || exit 1

CMD ["/blendpos"]
