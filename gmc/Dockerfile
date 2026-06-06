# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:24.16.0-alpine AS builder
WORKDIR /build

COPY package.json ./
# mysql2는 네이티브 빌드 불필요 (pure JS + optional native addon)
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:24.16.0-alpine AS production
WORKDIR /app

# Chromium 및 필수 라이브러리 설치 (Playwright reCAPTCHA용)
# tzdata: Alpine에서 TZ 환경변수(KST) 적용에 필요
RUN apk add --no-cache \
    tzdata \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto

# 프로덕션 의존성만 설치
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

# 빌드 결과 + 서버 코드 복사
COPY --from=builder /build/dist ./dist
COPY server ./server
COPY scripts ./scripts

# 백업 디렉토리 생성
RUN mkdir -p backup

# 비루트 사용자
RUN addgroup -S gmcauto && adduser -S gmcauto -G gmcauto
RUN chown -R gmcauto:gmcauto /app
USER gmcauto

EXPOSE 3001

ENV PORT=3001 \
    NODE_ENV=production \
    TZ=Asia/Seoul \
    CHROME_PATH=/usr/bin/chromium-browser \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROMIUM_FLAGS="--no-sandbox --disable-dev-shm-usage"

CMD ["node_modules/.bin/tsx", "server/index.ts"]
