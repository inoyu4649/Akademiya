import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import "./config/passport.js";
import authRouter from "./routes/auth.js";
import orgsRouter from "./routes/orgs.js";
import classesRouter from "./routes/classes.js";
import reportsRouter from "./routes/reports.js";
import adminRouter from "./routes/admin.js";
import assignmentsRouter from "./routes/assignments.js";
import submissionsRouter from "./routes/submissions.js";
import commentsRouter from "./routes/comments.js";
import notificationsRouter from "./routes/notifications.js";
import calendarRouter from "./routes/calendar.js";
import statsRouter from "./routes/stats.js";
import bugReportsRouter from "./routes/bugReports.js";
import { startDeadlineScheduler } from "./scheduler/deadlines.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config();

// ── 글로벌 에러 안전망 ────────────────────────────────────────────────────────
// Node.js 15+에서는 unhandledRejection이 기본으로 프로세스를 종료함.
// 로그를 남기고 서버가 계속 동작하도록 캐치.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] 서버를 죽이지 않고 로그 기록:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] 서버를 죽이지 않고 로그 기록:", reason);
});

const app: Express = express();
const PORT = process.env.PORT ?? 3000;
const isProd = process.env.NODE_ENV === "production";

// ── 보안 헤더 (Helmet) ─────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc:     ["'self'"],
            scriptSrc:      ["'self'"],
            styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc:        ["'self'", "https://fonts.gstatic.com"],
            imgSrc:         ["'self'", "data:", "blob:"],
            connectSrc:     ["'self'"],
            frameSrc:       ["'none'"],
            objectSrc:      ["'none'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,  // 개발 환경에서는 CSP 비활성화 (Vite HMR 충돌 방지)
    crossOriginEmbedderPolicy: false,  // Google OAuth 팝업 허용
    hsts: isProd
      ? { maxAge: 31536000, includeSubDomains: true }
      : false,
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
  })
);

// ── 전역 Rate Limiter (모든 API): 15분 / 200req ───────────────────────────
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS" },
  })
);

// ── 인증 엔드포인트 전용 Rate Limiter: 15분 / 20req (브루트포스 방지) ─────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_AUTH_REQUESTS" },
  skipSuccessfulRequests: true,  // 성공한 요청은 카운트 제외
});

// ── 파서 ──────────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// ── 정적 파일: 업로드 ────────────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ── 라우터 등록 ──────────────────────────────────────────────────────────────
app.use("/api/auth",         authLimiter, authRouter);   // 인증 엔드포인트: 엄격한 rate limit
app.use("/api/orgs",         orgsRouter);
app.use("/api/classes",      classesRouter);
app.use("/api/reports",      reportsRouter);
app.use("/api/admin",        adminRouter);
app.use("/api/assignments",  assignmentsRouter);
app.use("/api/submissions",  submissionsRouter);
app.use("/api/comments",     commentsRouter);
app.use("/api/notifications",notificationsRouter);
app.use("/api/calendar",     calendarRouter);
app.use("/api/stats",        statsRouter);
app.use("/api/bug-reports",  bugReportsRouter);

// ── 헬스체크 ─────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Express 글로벌 에러 미들웨어 ─────────────────────────────────────────────
// 반드시 라우터 등록 이후, app.listen 이전에 위치해야 함 (인수 4개 필수)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[express error]", err);
  if (!res.headersSent) {
    const status = (err as any)?.status ?? (err as any)?.statusCode ?? 500;
    const message = (err as any)?.message ?? "SERVER_ERROR";
    res.status(status).json({ error: message });
  }
});

// ── 서버 시작 ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Akademiya backend running on port ${PORT} [${isProd ? "production" : "development"}]`);
  startDeadlineScheduler();
});

export default app;
