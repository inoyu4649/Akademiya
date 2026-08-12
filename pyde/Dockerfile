# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:24.18.0-alpine AS builder
WORKDIR /build

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:24.18.0-alpine AS production
WORKDIR /app

# tzdata: Alpine에서 TZ 환경변수(KST) 적용에 필요
RUN apk add --no-cache tzdata

# 프로덕션 의존성만 설치
COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

# 빌드 결과(dist에 public/의 pyde_logo.png·fonts/D2Coding TTF 포함) + 서버 코드
COPY --from=builder /build/dist ./dist
COPY server ./server

# 비루트 사용자
RUN addgroup -S pyde && adduser -S pyde -G pyde
RUN chown -R pyde:pyde /app
USER pyde

EXPOSE 3002

ENV PORT=3002 \
    NODE_ENV=production \
    TZ=Asia/Seoul

# ⚠️ 이 컨테이너는 Python 런타임을 담지 않는다. 사용자 코드는 브라우저의
#    Pyodide(Web Worker)에서만 실행되며, 서버는 정적 파일과 Cloud 대리 호출만 한다.
CMD ["node_modules/.bin/tsx", "server/index.ts"]
