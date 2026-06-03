import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 50,          // 무한 대기 방지: 50개 초과 시 즉시 에러 반환
  enableKeepAlive: true,   // 유휴 연결 TCP 킵얼라이브 (방화벽 드롭 방지)
  keepAliveInitialDelay: 30_000, // 30초 후 첫 킵얼라이브 패킷 전송
  timezone: '+00:00',      // DATETIME 을 항상 UTC 로 해석 (서버 로컬 타임존 무관)
  // host.docker.internal → 로컬 MySQL (SSL 미설정) → undefined
  ssl: undefined,
});
