# ── Stage 1: Build (frontend) ────────────────────────────────────────────────
FROM node:24.18.0-alpine AS builder
WORKDIR /build

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:24.18.0-alpine AS production
WORKDIR /app

# 프로덕션 의존성만 설치 (argon2는 알파인용 프리빌드 바이너리 사용 — 별도 빌드 도구 불필요)
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /build/dist ./dist
COPY server ./server

RUN addgroup -S akashaalt && adduser -S akashaalt -G akashaalt
RUN chown -R akashaalt:akashaalt /app
USER akashaalt

EXPOSE 3003

ENV PORT=3003 \
    NODE_ENV=production

CMD ["node_modules/.bin/tsx", "server/index.ts"]
