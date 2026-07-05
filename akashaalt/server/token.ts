import crypto from "crypto";
import jwt from "jsonwebtoken";

/** SHA-256 — 볼트 인증코드 해싱용 (평문은 절대 저장하지 않음) */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** 볼트 비밀번호 변경/초기화용 6자리 인증코드 — CSPRNG 사용(Math.random 예측 위험 회피) */
export function generateResetCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export interface AkashaAltSessionPayload {
  id: number;
  email: string | null;
  displayName: string;
}

const JWT_SECRET = process.env.AKASHAALT_JWT_SECRET!;
const SESSION_TTL = "30d";

/** 로그인(OAuth 콜백) 시 발급하는 자체 세션 토큰 — Akademiya 백엔드와 무관, akashaalt만 검증 */
export function generateSessionToken(payload: AkashaAltSessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_TTL });
}

export function verifySessionToken(token: string): AkashaAltSessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AkashaAltSessionPayload;
  } catch {
    return null;
  }
}
