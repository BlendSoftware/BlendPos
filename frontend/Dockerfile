# ── Build Stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .

# Vite env vars are injected at build time via ARG
ARG VITE_API_URL=https://api.example.com
ARG VITE_API_BASE=https://api.example.com
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build

# ── Runtime Stage ──────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Remove default nginx page
RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
