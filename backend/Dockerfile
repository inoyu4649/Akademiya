# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:24.18.0-alpine AS builder

WORKDIR /app

# 의존성 설치 (캐시 레이어 분리)
COPY package.json ./
RUN npm install --legacy-peer-deps

# 소스 복사 및 TypeScript 컴파일
COPY . .
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:24.18.0-alpine AS production

WORKDIR /app

# 프로덕션 의존성만 설치
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

# 빌드 결과 복사
COPY --from=builder /app/dist ./dist

# SQL 마이그레이션 파일 복사 (tsc 컴파일 대상 아님)
COPY --from=builder /app/src/db/migrations ./dist/db/migrations

# 비루트 사용자 생성 (먼저 생성해야 chown 가능)
RUN addgroup -S akademiya && adduser -S akademiya -G akademiya

# 업로드 디렉터리 생성 및 소유권을 akademiya로 설정 (named volume 초기화 시 권한 유지)
RUN mkdir -p uploads && chown -R akademiya:akademiya uploads

USER akademiya

EXPOSE 3000

# 마이그레이션 실행 후 서버 시작 (MySQL 준비 안 된 경우 최대 5회 재시도)
CMD ["sh", "-c", "until node dist/db/migrate.js; do echo '[migrate] retry in 5s...'; sleep 5; done && node dist/index.js"]
