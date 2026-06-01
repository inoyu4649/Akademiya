# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# 프로덕션 의존성만 설치 (chromium은 런타임 필요)
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

# 빌드 결과 + 서버 코드 복사
COPY --from=builder /build/dist ./dist
COPY server ./server
COPY scripts ./scripts

# 데이터/백업 디렉토리 생성
RUN mkdir -p data backup

# 비루트 사용자
RUN addgroup -S gmcauto && adduser -S gmcauto -G gmcauto
RUN chown -R gmcauto:gmcauto /app
USER gmcauto

EXPOSE 3001

ENV PORT=3001 \
    NODE_ENV=production

CMD ["node", "server/index.js"]
