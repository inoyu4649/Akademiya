import jwt from "jsonwebtoken";
import crypto from "crypto";

export function generateAccessToken(payload: Express.User): string {
  // 900초 = 15분 (숫자 사용으로 StringValue 타입 이슈 회피)
  return jwt.sign(payload as object, process.env.JWT_ACCESS_SECRET!, { expiresIn: 900 });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString("hex");
}

/** SHA-256 — 리프레시 토큰 및 비밀번호 재설정 코드 해싱용 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateResetCode(): string {
  // CSPRNG 사용 — Math.random()은 시퀀스 복원이 가능해 코드 예측 위험
  return String(crypto.randomInt(100000, 1000000));
}

/** OAuth 리다이렉트 핸드오프용 단기 코드 (in-memory, 60초 TTL) */
const oauthCodes = new Map<string, { userId: number; expiresAt: number }>();

export function createOAuthCode(userId: number): string {
  const code = crypto.randomBytes(16).toString("hex");
  oauthCodes.set(code, { userId, expiresAt: Date.now() + 60_000 });
  return code;
}

export function consumeOAuthCode(code: string): number | null {
  const entry = oauthCodes.get(code);
  if (!entry || Date.now() > entry.expiresAt) {
    oauthCodes.delete(code);
    return null;
  }
  oauthCodes.delete(code);
  return entry.userId;
}
