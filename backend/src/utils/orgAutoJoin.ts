/**
 * Google Workspace 도메인 기반 조직 자동 가입
 *
 * 조직에 `google_domain`이 설정돼 있고 사용자의 Google 계정 이메일 도메인이 일치하면,
 * 가입 코드 입력이나 관리자 승인 없이 즉시 org_members에 추가한다.
 *
 * ⚠️ **Google로 이메일 소유가 검증된 계정(`users.google_id` 보유)에만 적용한다.**
 * 이메일/비밀번호 가입은 이메일 소유를 검증하지 않아 도메인을 스푸핑하면
 * 남의 학교 조직에 무단 편입될 수 있다.
 *
 * 멱등(idempotent)하므로 반복 호출해도 안전하다. 로그인 시점뿐 아니라
 * 조직 목록을 조회할 때도 호출해서, 사용자가 가입한 뒤에 조직이 새로 만들어지거나
 * 도메인이 나중에 설정된 경우에도 자동으로 따라붙게 한다.
 */
import type { Pool, PoolConnection } from "mysql2/promise";
import { pool } from "../db/pool.js";

type Db = Pool | PoolConnection;

export interface AutoJoinedOrg {
  id: number;
  name: string;
  code: string;
}

/**
 * @param userId  대상 사용자
 * @param email   사용자 이메일 (도메인 추출용)
 * @param db      트랜잭션 중이면 해당 커넥션, 아니면 기본 pool
 * @returns       이번 호출로 **새로 가입된** 조직 목록 (이미 멤버였으면 빈 배열)
 */
export async function autoJoinOrgsByGoogleDomain(
  userId: number,
  email: string,
  db: Db = pool
): Promise<AutoJoinedOrg[]> {
  const domain = email?.toLowerCase().split("@")[1];
  if (!domain) return [];

  // 도메인이 일치하면서 (1) 아직 가입하지 않았고 (2) 직접 탈퇴한 적 없는 승인된 조직만 추린다.
  // google_domain은 관리자 API에서 소문자로 저장하지만, 과거 데이터를 위해 LOWER()로 한 번 더 정규화.
  // opt-out 조인이 없으면 탈퇴한 사용자가 다음 요청에서 곧바로 다시 가입돼버린다(003 마이그레이션 참조).
  const [rows] = await db.query(
    `SELECT o.id, o.name, o.code
     FROM organizations o
     LEFT JOIN org_members om           ON om.org_id  = o.id AND om.user_id  = ?
     LEFT JOIN org_auto_join_optouts oo ON oo.org_id  = o.id AND oo.user_id  = ?
     WHERE o.status = 'approved'
       AND o.google_domain IS NOT NULL
       AND LOWER(o.google_domain) = ?
       AND om.id IS NULL
       AND oo.id IS NULL`,
    [userId, userId, domain]
  );
  const orgs = rows as AutoJoinedOrg[];
  if (orgs.length === 0) return [];

  const joined: AutoJoinedOrg[] = [];
  for (const org of orgs) {
    // INSERT IGNORE: 동시 요청이 겹쳐도 UNIQUE(org_id,user_id)로 중복이 생기지 않는다
    const [result] = await db.query(
      "INSERT IGNORE INTO org_members (org_id, user_id, permission) VALUES (?, ?, 0)",
      [org.id, userId]
    );
    if ((result as { affectedRows?: number }).affectedRows) joined.push(org);
  }

  // 가입 사실을 알림으로 남긴다 (조용히 편입되면 사용자가 이유를 알 수 없으므로)
  for (const org of joined) {
    await db
      .query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES (?, 'broadcast', ?, ?)`,
        [
          userId,
          `${org.name} 조직에 가입되었습니다`,
          `학교 Google 계정(@${domain}) 확인으로 자동 가입되었습니다. 계정 센터에서 언제든 탈퇴할 수 있습니다.`,
        ]
      )
      .catch(() => { /* 알림 실패가 가입 자체를 막지는 않는다 */ });
  }

  return joined;
}

/** users.google_id를 먼저 확인한 뒤 자동 가입을 시도한다 (Google 검증 계정 전용) */
export async function autoJoinIfGoogleVerified(userId: number, email: string): Promise<AutoJoinedOrg[]> {
  const [rows] = await pool.query("SELECT google_id FROM users WHERE id = ?", [userId]);
  const verified = !!(rows as { google_id: string | null }[])[0]?.google_id;
  if (!verified) return [];
  return autoJoinOrgsByGoogleDomain(userId, email);
}
