// AkashaAlt 볼트 언락 세션 캐시 — 프로세스 메모리에만 존재, DB/Redis에는 절대 기록하지 않는다.
// 서버 재시작 시 전부 소멸(의도된 동작). TTL 만료 시 자동 폐기.

const UNLOCK_TTL_MS = 30 * 60 * 1000; // 30분

interface UnlockEntry {
  key: Buffer;
  expiresAt: number;
}

const cache = new Map<number, UnlockEntry>();

function isExpired(entry: UnlockEntry): boolean {
  return Date.now() > entry.expiresAt;
}

/** 언락된 파생 키를 세션 캐시에 저장 (TTL 연장 포함) */
export function setUnlockedKey(userId: number, key: Buffer): void {
  const prev = cache.get(userId);
  if (prev) prev.key.fill(0);
  cache.set(userId, { key, expiresAt: Date.now() + UNLOCK_TTL_MS });
}

/** 캐시에서 파생 키 조회, 없거나 만료됐으면 null */
export function getUnlockedKey(userId: number): Buffer | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (isExpired(entry)) {
    entry.key.fill(0);
    cache.delete(userId);
    return null;
  }
  return entry.key;
}

/** 명시적 잠금(로그아웃/사용자 요청) — 메모리에서 즉시 제거 */
export function clearUnlockedKey(userId: number): void {
  const entry = cache.get(userId);
  if (entry) entry.key.fill(0);
  cache.delete(userId);
}

/** 만료된 항목 주기적 청소 (메모리 누수 방지) */
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of cache) {
    if (now > entry.expiresAt) {
      entry.key.fill(0);
      cache.delete(userId);
    }
  }
}, 5 * 60 * 1000).unref();
