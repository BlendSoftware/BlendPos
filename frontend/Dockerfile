# BlendPOS Frontend Dockerfile
# Builds React/Vite app and serves via nginx

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

COPY . .
RUN npm run build

# ── Runtime Stage ──────────────────────────────────────────────────────────────
FROM nginx:1.25-alpine

# Custom nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
