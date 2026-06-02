# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:24.16.0-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# ── Stage 2: Nginx Serve ─────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Vite 빌드 결과를 Nginx 정적 경로에 복사
COPY --from=builder /app/dist /usr/share/nginx/html

# 기본 nginx config 제거 (docker-compose에서 볼륨 마운트로 주입)
RUN rm /etc/nginx/conf.d/default.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
