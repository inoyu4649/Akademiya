# Akademiya 배포 가이드

> OCI Ampere A1 (ARM64) · Ubuntu 22.04 · Docker Compose 기준  
> 작성 기준: 2026-06-01 (Phase 8 완료 + GMCAuto v2.5 통합 포함)

---

## 목차

1. [로컬 개발 환경 테스트](#1-로컬-개발-환경-테스트)
2. [OCI 서버 사전 준비](#2-oci-서버-사전-준비)
3. [MySQL 8.0 설치 및 설정](#3-mysql-80-설치-및-설정)
4. [SSL 인증서 발급](#4-ssl-인증서-발급)
5. [환경변수 .env 작성](#5-환경변수-env-작성)
6. [Docker Compose 배포](#6-docker-compose-배포)
7. [배포 후 검증](#7-배포-후-검증)
8. [운영 관리 명령어](#8-운영-관리-명령어)
9. [트러블슈팅](#9-트러블슈팅)
10. [AkashaAlt(ai.akademiya.kr) 배포](#10-akashaaltaiakademiyakr-배포)

---

## 1. 로컬 개발 환경 테스트

### 1-1. 의존성 설치

```bash
# 루트 — 스크립트만 있는 경우 개별 설치
cd backend  && pnpm install
cd ../frontend && pnpm install
cd ../gmc      && npm install --legacy-peer-deps
```

### 1-2. 로컬 MySQL 실행 (Docker)

프로덕션 MySQL을 건드리지 않고 로컬에서 테스트할 때 사용합니다.

```bash
docker run -d \
  --name akademiya-mysql-dev \
  -e MYSQL_ROOT_PASSWORD=root1234 \
  -e MYSQL_DATABASE=akademiya \
  -e MYSQL_USER=akademiya \
  -e MYSQL_PASSWORD=dev_password \
  -p 3306:3306 \
  mysql:8.0

# 컨테이너 준비 대기 (약 15초)
docker exec akademiya-mysql-dev mysqladmin ping -u root -proot1234 --wait=30
```

### 1-3. 로컬 .env 설정

`backend/.env`를 개발용으로 작성합니다 (아래 **5장** 참고).  
핵심 차이점: `NODE_ENV=development`, `DB_HOST=localhost`.

### 1-4. DB 마이그레이션 실행

```bash
cd backend
pnpm migrate          # package.json의 "migrate" 스크립트 실행
# 또는 직접:
node --loader ts-node/esm src/db/migrate.ts
```

성공 출력 예시:
```
✓ 001_init.sql
✓ 002_oauth_nullable.sql
✓ 003_user_reports.sql
✓ 004_code_resize.sql
✓ 005_notification_dedup.sql
✓ 006_bug_reports.sql
Migration complete.
```

### 1-5. 서버 시작 (개발 모드)

```bash
# 터미널 1: Backend
cd backend && pnpm dev          # ts-node-dev, 포트 3000

# 터미널 2: Frontend
cd frontend && pnpm dev         # Vite, 포트 5173

# 터미널 3: GMCAuto (선택)
cd gmc && npm run dev           # Vite, 포트 5174 (서버는 3001)
```

### 1-6. 로컬 테스트 체크리스트

```
[ ] http://localhost:5173 — Akademiya 메인 접속
[ ] 회원가입 → 이메일 발송 (SMTP 설정 필요)
[ ] 로그인 (이메일 + Google OAuth)
[ ] 조직 생성 → 가입 신청 → 승인
[ ] 클래스 생성 → 과제 생성 → 제출
[ ] 알림 수신 확인
[ ] http://localhost:5174 — GMCAuto 접속 (gmc/ 디렉토리 별도 실행)
```

### 1-7. TypeScript 타입 검사

```bash
cd frontend
npx tsc --noEmit          # 에러 없이 종료되면 OK

cd ../backend
npx tsc --noEmit
```

---

## 2. OCI 서버 사전 준비

### 2-1. 시스템 업데이트

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ufw
```

### 2-2. Docker & Docker Compose 설치 (ARM64)

```bash
# Docker 공식 설치 스크립트
curl -fsSL https://get.docker.com | sudo sh

# 현재 사용자를 docker 그룹에 추가 (sudo 없이 실행)
sudo usermod -aG docker $USER
newgrp docker

# 버전 확인
docker --version            # Docker 24+ 권장
docker compose version      # v2.x 필요
```

### 2-3. 방화벽 설정

```bash
sudo ufw allow 22/tcp     # SSH (절대 닫지 마세요!)
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable

# OCI 보안 목록에서도 80, 443 인바운드 허용 필요
# OCI 콘솔 → Networking → VCN → Security Lists
```

### 2-4. 프로젝트 복사

```bash
# 방법 A: git clone
git clone <your-repo-url> /home/ubuntu/Akademiya

# 방법 B: scp (로컬에서)
scp -r ./Akademiya ubuntu@<OCI_IP>:/home/ubuntu/Akademiya
```

---

## 3. MySQL 설정 (Docker 컨테이너)

> Akademiya의 MySQL은 **docker-compose의 `mysql` 서비스**로 운영합니다.  
> 데이터는 `mysql_data` named volume에 영속화되므로 컨테이너 재생성에 안전합니다.

### 3-1. 루트 `.env` 파일 작성

`docker-compose.yml`과 같은 위치에 `.env`를 생성합니다 (`.env.example` 참고).

```bash
cp .env.example .env
nano .env
```

```dotenv
MYSQL_ROOT_PASSWORD=강력한_루트_비밀번호_변경필수
MYSQL_APP_USER=akademiya_app
MYSQL_APP_PASSWORD=강력한_앱_비밀번호_변경필수
```

### 3-2. mysql 컨테이너만 먼저 기동

```bash
docker compose up -d mysql

# 준비 완료까지 대기 (약 30초)
until docker compose exec mysql mysqladmin ping -u root -p"$MYSQL_ROOT_PASSWORD" --silent 2>/dev/null; do
  echo "mysql 대기 중..."; sleep 5
done
echo "mysql 준비 완료"
```

### 3-3. 기존 데이터 마이그레이션 (첫 배포 시만)

호스트에 기존 `akademiya` MySQL DB가 있는 경우 마이그레이션 스크립트를 실행합니다.

```bash
# 마이그레이션 스크립트 실행 (소스 DB 접속 정보 필요)
SRC_USER=root SRC_PASS=기존_루트_비밀번호 \
  bash scripts/migrate-to-unified-mysql.sh
```

스크립트는 다음을 자동 처리합니다:
- 소스 MySQL에서 `akademiya` 덤프
- `mysql` 컨테이너로 복원
- 행 수 검증 및 롤백 가이드 출력

**최초 배포 (데이터 없음)** 라면 이 단계를 건너뜁니다.  
Backend 컨테이너가 시작될 때 `migrate.js`가 스키마를 자동 생성합니다.

### 3-4. 마이그레이션 검증

```bash
docker compose exec mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" \
  -e "USE akademiya; SHOW TABLES;"
```

---

## 4. SSL 인증서 발급

> Nginx가 SSL을 처리하고, 인증서 파일을 `nginx/ssl/` 폴더에 배치합니다.

### 4-1. Certbot 설치

```bash
sudo apt install -y certbot
```

### 4-2. 인증서 발급

> **주의**: 발급 전에 DNS A 레코드가 이미 서버 IP를 가리키고 있어야 합니다.

```bash
# 포트 80 사용 중인 서비스 중지 (첫 발급 시)
sudo systemctl stop nginx 2>/dev/null || true
docker compose down 2>/dev/null || true

# 3개 도메인 한 번에 발급
sudo certbot certonly --standalone \
  -d akademiya.kr \
  -d www.akademiya.kr \
  -d gmc.akademiya.kr \
  --email lmg1152@naver.com \
  --agree-tos \
  --no-eff-email
```

성공 시 인증서 위치:
```
/etc/letsencrypt/live/akademiya.kr/fullchain.pem
/etc/letsencrypt/live/akademiya.kr/privkey.pem
```

### 4-3. nginx/ssl/ 폴더에 복사

```bash
# ssl 폴더 생성
mkdir -p /home/ubuntu/Akademiya/nginx/ssl

# 인증서 복사
sudo cp /etc/letsencrypt/live/akademiya.kr/fullchain.pem \
        /home/ubuntu/Akademiya/nginx/ssl/fullchain.pem

sudo cp /etc/letsencrypt/live/akademiya.kr/privkey.pem \
        /home/ubuntu/Akademiya/nginx/ssl/privkey.pem

# 읽기 권한 부여 (Docker nginx 컨테이너가 읽을 수 있도록)
sudo chmod 644 /home/ubuntu/Akademiya/nginx/ssl/fullchain.pem
sudo chmod 640 /home/ubuntu/Akademiya/nginx/ssl/privkey.pem
sudo chown $USER:$USER /home/ubuntu/Akademiya/nginx/ssl/*
```

### 4-4. 자동 갱신 설정

Let's Encrypt 인증서는 90일마다 만료됩니다. 자동 갱신 크론을 설정합니다.

```bash
sudo crontab -e
```

아래 줄 추가:
```cron
# 매월 1일 새벽 3시: 인증서 갱신 → nginx/ssl 폴더 갱신 → Docker nginx 재시작
0 3 1 * * certbot renew --quiet && \
  cp /etc/letsencrypt/live/akademiya.kr/fullchain.pem /home/ubuntu/Akademiya/nginx/ssl/fullchain.pem && \
  cp /etc/letsencrypt/live/akademiya.kr/privkey.pem /home/ubuntu/Akademiya/nginx/ssl/privkey.pem && \
  chmod 644 /home/ubuntu/Akademiya/nginx/ssl/fullchain.pem && \
  chmod 640 /home/ubuntu/Akademiya/nginx/ssl/privkey.pem && \
  docker exec akademiya-frontend-1 nginx -s reload
```

---

## 5. 환경변수 .env 작성

`backend/.env.example`을 복사하여 `backend/.env`를 만듭니다.

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

### 완성된 프로덕션 .env 예시

```dotenv
# ── 서버 ────────────────────────────────────────────────────────────────────────
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://akademiya.kr

# ── MySQL 데이터베이스 ─────────────────────────────────────────────────────────
# docker-compose.yml이 DB_HOST=mysql / DB_USER / DB_PASSWORD를 override하므로
# 여기서는 기본값만 작성해도 됩니다. (compose .env에서 MYSQL_APP_* 가 주입됨)
DB_HOST=mysql
DB_PORT=3306
DB_USER=akademiya_app
DB_PASSWORD=compose_.env의_MYSQL_APP_PASSWORD와_동일
DB_NAME=akademiya

# ── JWT 시크릿 ────────────────────────────────────────────────────────────────
# 반드시 32자 이상의 무작위 문자열! 절대 기본값 그대로 사용 금지
JWT_ACCESS_SECRET=여기에_최소32자_무작위문자열_입력_ACCESS
JWT_REFRESH_SECRET=여기에_최소32자_무작위문자열_입력_REFRESH
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Google OAuth ──────────────────────────────────────────────────────────────
# Google Cloud Console → API & Services → Credentials → OAuth 2.0 Client IDs
GOOGLE_CLIENT_ID=xxxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxx
GOOGLE_CALLBACK_URL=https://akademiya.kr/api/auth/google/callback

# ── 이메일 (Gmail SMTP) ───────────────────────────────────────────────────────
# Gmail 2단계 인증 활성화 후 앱 비밀번호 발급 필요
# Google 계정 → 보안 → 앱 비밀번호
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx     # 앱 비밀번호 (띄어쓰기 포함 16자)
EMAIL_FROM=Akademiya <noreply@akademiya.kr>
```

### JWT 시크릿 무작위 생성 방법

```bash
# 방법 1: openssl (권장)
openssl rand -base64 48    # 실행 두 번 → ACCESS용, REFRESH용 각각 사용

# 방법 2: /dev/urandom
cat /dev/urandom | tr -dc 'A-Za-z0-9!@#$%' | head -c 48 && echo
```

### Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. **OAuth 2.0 Client ID** 생성 (웹 애플리케이션)
3. **승인된 리디렉션 URI** 추가:
   - `https://akademiya.kr/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback` (개발용)
4. **승인된 JavaScript 원본** 추가:
   - `https://akademiya.kr`
   - `http://localhost:5173` (개발용)

### Gmail 앱 비밀번호 발급

1. [Google 계정](https://myaccount.google.com) → 보안 → 2단계 인증 활성화
2. 보안 → 앱 비밀번호 → 앱 선택: "메일" → 기기: "기타(Akademiya)"
3. 생성된 16자리 비밀번호를 `SMTP_PASS`에 입력

---

## 6. Docker Compose 배포

### 6-1. 최종 파일 구조 확인

```bash
cd /home/ubuntu/Akademiya
ls -la

# 필수 파일 체크
[ -f backend/.env ]             && echo "✓ backend/.env" || echo "✗ backend/.env 없음"
[ -f nginx/ssl/fullchain.pem ]  && echo "✓ SSL 인증서"  || echo "✗ SSL 인증서 없음"
[ -f nginx/ssl/privkey.pem ]    && echo "✓ SSL 개인키"  || echo "✗ SSL 개인키 없음"
[ -f docker-compose.yml ]       && echo "✓ compose 파일" || echo "✗ compose 파일 없음"
```

### 6-2. GMCAuto Chromium 추가 (필수)

reCAPTCHA v3 처리를 위해 Playwright가 Chromium을 필요로 합니다.  
`gmc/Dockerfile`에 아래 내용을 추가합니다:

```bash
nano gmc/Dockerfile
```

`FROM node:20-alpine AS production` 블록에 추가:
```dockerfile
# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Playwright용 Chromium 설치 (reCAPTCHA v3 필수)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV CHROME_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

### 6-3. 첫 빌드 및 시작

```bash
cd /home/ubuntu/Akademiya

# 전체 빌드 (처음 실행, 15~20분 소요 가능)
docker compose up -d --build

# 빌드 로그 실시간 확인
docker compose logs -f
```

### 6-4. 서비스별 빌드 상태 확인

```bash
docker compose ps

# 예상 출력 (모두 healthy/running):
# NAME                          STATUS              PORTS
# akademiya-backend-1           running (healthy)   3000/tcp
# akademiya-frontend-1          running             0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
# akademiya-gmcauto-1           running (healthy)   3001/tcp
```

### 6-5. DB 마이그레이션 (첫 배포 시)

```bash
# backend 컨테이너 안에서 마이그레이션 실행
docker compose exec backend node dist/db/migrate.js

# 또는 별도 컨테이너로 실행 후 종료
docker compose run --rm backend node dist/db/migrate.js
```

---

## 7. 배포 후 검증

### 7-1. 서비스 헬스체크

```bash
# Backend 헬스체크
curl https://akademiya.kr/api/health
# → {"status":"ok","timestamp":"2026-06-01T..."}

# GMCAuto 헬스체크
curl https://gmc.akademiya.kr/api/health
# → {"status":"ok","version":"2.5.0"}
```

### 7-2. HTTPS 인증서 검증

```bash
# SSL 인증서 정보 확인
curl -vI https://akademiya.kr 2>&1 | grep -E "subject:|issuer:|expire"
curl -vI https://gmc.akademiya.kr 2>&1 | grep -E "subject:|issuer:|expire"
```

### 7-3. HTTP → HTTPS 리다이렉트 확인

```bash
curl -I http://akademiya.kr
# → HTTP/1.1 301 Moved Permanently
# → Location: https://akademiya.kr/

curl -I http://gmc.akademiya.kr
# → HTTP/1.1 301 Moved Permanently
# → Location: https://gmc.akademiya.kr/
```

### 7-4. 기능별 체크리스트

```
[ ] https://akademiya.kr 접속 → 로그인 화면 표시
[ ] 회원가입 → 이메일 수신 확인
[ ] Google OAuth 로그인 정상 동작
[ ] 조직/클래스 생성
[ ] 과제 생성 → 파일 업로드 (최대 10MB)
[ ] 알림 벨 → 드롭다운 표시
[ ] HAFS 조직 가입 후 좌측 메뉴 'GMCAuto ↗' 표시
[ ] https://gmc.akademiya.kr 접속 → GMCAuto v2.5 화면
[ ] GMCAuto 언어 전환 (ko/en/ja/zh)
[ ] 다국어 (한국어/영어/일본어/중국어) 전환
[ ] 모바일 반응형 레이아웃 확인 (768px 이하)
```

---

## 8. 운영 관리 명령어

### 로그 확인

```bash
# 전체 서비스 로그
docker compose logs -f

# 서비스별 로그
docker compose logs -f backend
docker compose logs -f gmcauto
docker compose logs -f frontend

# 마지막 100줄만
docker compose logs --tail=100 backend
```

### 서비스 재시작

```bash
# 특정 서비스만 재시작
docker compose restart backend
docker compose restart gmcauto

# 전체 재시작
docker compose restart
```

### 코드 업데이트 후 재배포

```bash
cd /home/ubuntu/Akademiya
git pull

# 특정 서비스만 재빌드
docker compose up -d --build backend
docker compose up -d --build gmcauto
docker compose up -d --build frontend

# 전체 재빌드
docker compose up -d --build
```

### DB 백업

```bash
# MySQL 덤프 (호스트에서)
sudo mysqldump -u root -p akademiya \
  > /backup/akademiya_$(date +%Y%m%d_%H%M%S).sql

# GMCAuto SQLite 백업 (Docker 볼륨에서)
docker compose exec gmcauto cp /app/data/gmcauto.db /app/backup/gmcauto_$(date +%Y%m%d).db

# 볼륨에서 로컬로 파일 꺼내기
docker cp akademiya-gmcauto-1:/app/backup/ ./gmc-backup/
```

### 컨테이너 내부 접속

```bash
docker compose exec backend sh
docker compose exec gmcauto sh
```

### 디스크 정리

```bash
# 미사용 이미지/컨테이너 정리
docker system prune -f

# 빌드 캐시까지 정리 (재빌드 시 시간 더 걸림)
docker builder prune -f
```

---

## 9. 트러블슈팅

### `ERROR 1410 (42000): You are not allowed to create a user with GRANT`

`GRANT ... TO '${MYSQL_APP_USER}'@'%'` 같은 명령을 셸에 직접 타이핑해서 실행했는데, `.env`를
그 셸에 먼저 로드하지 않아 변수가 빈 문자열로 치환되면서 `TO ''@'%'`가 되어 발생한다(MySQL 8부터는
GRANT가 존재하지 않는 사용자를 암묵적으로 만들어주지 않음). `docker compose exec`는 프로젝트 `.env`를
자동으로 읽지 않으므로, 수동으로 SQL을 실행하기 전에 반드시 먼저 로드해야 한다:

```bash
set -a; source .env; set +a
echo "$MYSQL_APP_USER"   # 빈 값이 아닌지 먼저 확인
```

[10-3](#10-3-mysql-akashaalt-스키마-생성)의 akashaalt 스키마 수동 생성 명령이 대표적인 예시.

### DB 연결 실패 (`ECONNREFUSED`)

```bash
# Docker → 호스트 MySQL 연결 불가 시
# 1. MySQL이 0.0.0.0을 리스닝하는지 확인
sudo ss -tlnp | grep 3306

# 2. Docker bridge IP 재확인
docker network inspect bridge | grep Gateway

# 3. 해당 IP로 DB_HOST 수정 후 재시작
docker compose restart backend
```

### SSL 인증서 오류

```bash
# 인증서 유효기간 확인
openssl x509 -enddate -noout -in nginx/ssl/fullchain.pem

# 인증서 도메인 확인
openssl x509 -text -noout -in nginx/ssl/fullchain.pem | grep -A1 "Subject Alternative Name"

# 수동 갱신
sudo certbot renew --force-renewal
sudo cp /etc/letsencrypt/live/akademiya.kr/fullchain.pem nginx/ssl/fullchain.pem
sudo cp /etc/letsencrypt/live/akademiya.kr/privkey.pem   nginx/ssl/privkey.pem
docker compose exec frontend nginx -s reload
```

### GMCAuto 로그인 실패 (reCAPTCHA)

```bash
# Chromium 설치 여부 확인
docker compose exec gmcauto which chromium-browser
docker compose exec gmcauto chromium-browser --version

# 환경변수 확인
docker compose exec gmcauto env | grep CHROME

# reCAPTCHA 로그 확인
docker compose logs gmcauto | grep -i "recaptcha\|playwright\|chrome"
```

### frontend depends_on gmcauto로 인한 시작 지연

GMCAuto 빌드에 시간이 걸려 frontend가 시작되지 않는 경우:

```bash
# gmcauto 먼저 헬시 상태로 만들기
docker compose up -d gmcauto
docker compose logs -f gmcauto   # healthy 될 때까지 대기

# 그 다음 전체 시작
docker compose up -d
```

### 업로드 파일이 재시작 후 사라짐

`uploads_data` 볼륨이 제대로 마운트되었는지 확인:

```bash
docker volume ls | grep uploads
docker volume inspect akademiya_uploads_data
```

### 포트 80/443 이미 사용 중

```bash
sudo lsof -i :80
sudo lsof -i :443

# 기존 nginx 서비스 중지 (호스트에 설치된 경우)
sudo systemctl stop nginx
sudo systemctl disable nginx
```

---

## 10. AkashaAlt(ai.akademiya.kr) 배포

AkashaAlt는 GMCAuto와 동일한 구조로 Akademiya 본체와 완전히 독립된 앱이다(별도 폴더 `akashaalt/`,
별도 MySQL 스키마 `akashaalt`, 별도 세션). Akademiya OpenOAuth의 서드파티 클라이언트로만 연동된다.

### 10-1. Akademiya OpenOAuth App 등록 (필수, 배포 전)

1. `akademiya.kr`에 로그인 → 회원정보 수정에서 "개발자 모드" 활성화
2. 좌측 "개발자 도구 → Akademiya OAuth → 새 OAuth App 만들기"에서 등록:
   - 로그인 허용 수단: 자유롭게 선택(둘 다 허용 권장)
   - 로그인 허용 범위: 전체(all)
   - 신뢰할 수 있는 출처(redirect_uri)에 `https://ai.akademiya.kr/auth/callback` 등록
3. 발급된 **Client ID / Client Secret**을 안전한 곳에 저장 (이 화면을 닫으면 다시 볼 수 없음)

### 10-2. `akashaalt/.env` 작성

`akashaalt/.env.example`을 복사해 `akashaalt/.env`를 만들고 채운다:
- `AKASHAALT_DB_USER`/`AKASHAALT_DB_PASSWORD` — 루트 `.env`의 `MYSQL_APP_USER`/`MYSQL_APP_PASSWORD`와 **동일한 값**(env_file은 변수 치환이 안 되므로 직접 복사 필요, gmc/.env와 동일한 관례)
- `AKASHAALT_JWT_SECRET` — 32자 이상 무작위 문자열 (Akademiya의 JWT 시크릿과는 별개)
- `AI_OAUTH_CLIENT_ID`/`AI_OAUTH_CLIENT_SECRET` — 10-1에서 발급받은 값
- `SMTP_*`/`EMAIL_FROM` — API Key Vault 비밀번호 변경 인증코드 발송용 (Akademiya 본체와 같은 Gmail 계정을 재사용해도 무방)

### 10-3. MySQL `akashaalt` 스키마 생성

**신규 배포**(MySQL 볼륨을 처음 만드는 경우)라면 `mysql-init/init.sh`가 컨테이너 최초 기동 시
`akashaalt` DB와 권한을 자동 생성하므로 이 단계를 건너뛴다.

**기존 운영 중인 MySQL 볼륨**에 추가하는 경우 수동 생성이 필요하다.

⚠️ **먼저 루트 `.env`를 현재 셸에 로드해야 한다** — `docker compose exec`로 직접 타이핑하는 명령은
`.env`를 자동으로 읽어오지 않는다. `${MYSQL_APP_USER}` 등이 빈 문자열로 치환되면 `GRANT ... TO ''@'%'`가
되어 `ERROR 1410 (42000): You are not allowed to create a user with GRANT`가 발생한다(MySQL 8부터 GRANT가
존재하지 않는 사용자를 암묵적으로 생성해주지 않기 때문 — 실제로 겪은 오류):

```bash
set -a; source .env; set +a   # MYSQL_ROOT_PASSWORD / MYSQL_APP_USER 를 현재 셸에 로드

docker compose exec mysql mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "
  CREATE DATABASE IF NOT EXISTS akashaalt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  GRANT ALL PRIVILEGES ON akashaalt.* TO '${MYSQL_APP_USER}'@'%';
  FLUSH PRIVILEGES;
"
```

실행 후 `'${MYSQL_APP_USER}'@'%'`로 실제 치환됐는지 확인하려면 명령 실행 직전에 `echo "$MYSQL_APP_USER"`로
빈 값이 아닌지 먼저 확인한다.

테이블 자체는 `akashaalt` 컨테이너가 처음 기동할 때 `initDb()`가 자동 생성한다(마이그레이션 파일 불필요).

### 10-4. ⚠️ 기존 AkashaAlt 채팅 데이터 이관 (구버전에서 업그레이드하는 경우만)

이전 버전의 AkashaAlt는 Akademiya 본체 DB(`akademiya` 스키마)의 `ai_conversations`,
`ai_messages`, `ai_vaults`, `ai_api_keys`, `ai_vault_reset_tokens` 테이블을 사용했다.
이번 개편으로 이 테이블들은 더 이상 Akademiya 백엔드 코드에서 참조되지 않지만, **기존 프로덕션
DB에는 여전히 남아 있으며 자동으로 삭제되지 않는다.** 기존 사용자 데이터를 보존하려면:

1. Akademiya `users.id`(정수)를 새 `akashaalt.akashaalt_users.akademiya_user_id`로 매핑하는
   행을 먼저 생성(로그인 이력이 있는 사용자만 신규 로그인 시 자동 생성되므로, 데이터 보존이
   꼭 필요하지 않다면 이 단계 전체를 건너뛰고 사용자가 재로그인 후 새로 채팅을 시작하게 해도 무방)
2. 필요 시 `mysqldump`로 위 5개 테이블만 덤프 후, `user_id` 값을 `akashaalt_users.id`로
   치환하는 변환 스크립트를 작성해 `akashaalt` DB로 import
3. 이관 완료 후 Akademiya `akademiya` DB에서 다음을 실행해 기존 테이블 삭제:
   ```sql
   DROP TABLE IF EXISTS ai_vault_reset_tokens, ai_api_keys, ai_vaults, ai_messages, ai_conversations;
   ```

**데이터 보존이 중요하지 않다면(예: 아직 실사용자가 적은 초기 단계) 위 이관 절차를 생략하고
바로 3번의 `DROP TABLE`만 실행해도 된다.**

### 10-5. 빌드 및 배포

```bash
docker compose up -d --build akashaalt
docker compose logs -f akashaalt   # "[akashaalt] listening on port 3003" 확인
curl -s https://ai.akademiya.kr/api/health
```

---

## 부록: DNS 설정

OCI DNS 또는 사용 중인 도메인 레지스트라에서 아래 A 레코드를 추가합니다.

| 레코드 타입 | 호스트명 | 값 | TTL |
|---|---|---|---|
| A | `akademiya.kr` | OCI 서버 공인 IP | 300 |
| A | `www` | OCI 서버 공인 IP | 300 |
| A | `gmc` | OCI 서버 공인 IP | 300 |

> OCI 공인 IP 확인: OCI 콘솔 → Compute → Instances → 인스턴스 선택 → Public IP
