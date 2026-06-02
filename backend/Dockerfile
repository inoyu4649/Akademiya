# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:24.16.0-alpine AS builder

WORKDIR /app

# 의존성 설치 (캐시 레이어 분리)
COPY package.json ./
RUN npm install --legacy-peer-deps

# 소스 복사 및 TypeScript 컴파일
COPY . .
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:24.16.0-alpine AS production

WORKDIR /app

# 프로덕션 의존성만 설치
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

# 빌드 결과 복사
COPY --from=builder /app/dist ./dist

# SQL 마이그레이션 파일 복사 (tsc 컴파일 대상 아님)
COPY --from=builder /app/src/db/migrations ./dist/db/migrations

# 업로드 디렉터리 생성
RUN mkdir -p uploads

# 비루트 사용자로 실행 (보안)
RUN addgroup -S akademiya && adduser -S akademiya -G akademiya
USER akademiya

EXPOSE 3000

CMD ["node", "dist/index.js"]
