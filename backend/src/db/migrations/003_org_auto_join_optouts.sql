-- ============================================================
-- 003: Google 도메인 자동 가입 opt-out
-- ============================================================
-- 도메인 자동 가입이 로그인/조직목록 조회 시마다 동작하게 되면서,
-- 사용자가 조직을 "탈퇴"해도 다음 요청에서 곧바로 다시 가입되는 문제가 생긴다.
-- 탈퇴를 명시적 의사표시로 기록해 두고, 자동 가입은 이 기록이 있는 조직을 건너뛴다.
--
-- reason으로 "본인이 나감(left)"과 "강퇴당함(kicked)"을 구분한다.
--   left   : 본인 의사 → 조직 코드로 다시 가입하면 기록을 지우고 자동 가입 대상으로 복귀
--   kicked : 관리자 의사 → 코드를 입력해도 자동 승인하지 않고 가입 신청(승인 대기)으로 보낸다.
--            기록을 지우지 않으므로 강퇴가 도메인 자동 가입으로 무력화되지 않는다.
-- ============================================================

CREATE TABLE IF NOT EXISTS org_auto_join_optouts (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id     INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  reason     ENUM('left', 'kicked') NOT NULL DEFAULT 'left',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_optout (org_id, user_id),
  FOREIGN KEY (org_id)  REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
