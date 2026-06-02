# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# pnpm 설치
RUN npm install -g pnpm@11.5.0

# 의존성 설치 (캐시 레이어 분리)
# pnpm-lock.yaml은 워크스페이스 루트에 있어 빌드 컨텍스트(./backend)에 없음 → no-frozen-lockfile
COPY package.json ./
RUN pnpm install --no-frozen-lockfile

# 소스 복사 및 TypeScript 컴파일
COPY . .
RUN pnpm build

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

RUN npm install -g pnpm@11.5.0

# 프로덕션 의존성만 설치
COPY package.json ./
RUN pnpm install --no-frozen-lockfile --prod

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
