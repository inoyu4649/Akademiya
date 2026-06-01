import { schedule } from "node-cron";
import { pool } from "../db/pool.js";

// 마감 알림 유형별 설정
const DEADLINE_ALERTS = [
  { type: "deadline_1d",  minutesBefore: 24 * 60 },  // 1440분
  { type: "deadline_3h",  minutesBefore: 3 * 60  },  //  180분
  { type: "deadline_1h",  minutesBefore: 60       },  //   60분
  { type: "deadline_10m", minutesBefore: 10       },  //   10분
] as const;

// 윈도우: ±5분 (5분 간격 실행과 맞춤)
const WINDOW_MIN = 5;

async function checkDeadlines() {
  for (const alert of DEADLINE_ALERTS) {
    const lo = alert.minutesBefore - WINDOW_MIN;  // e.g. 1435
    const hi = alert.minutesBefore + WINDOW_MIN;  // e.g. 1445

    // 마감이 [lo, hi]분 후인 과제 목록
    const [assignments] = await pool.execute(
      `SELECT a.id, a.title, a.class_id
       FROM assignments a
       WHERE a.due_at IS NOT NULL
         AND a.due_at >= DATE_ADD(NOW(), INTERVAL ? MINUTE)
         AND a.due_at <  DATE_ADD(NOW(), INTERVAL ? MINUTE)`,
      [lo, hi]
    ) as any[];

    for (const assignment of assignments as any[]) {
      // 미제출(submitted/returned 포함, approved 제외) 또는 제출 없는 멤버
      const [members] = await pool.execute(
        `SELECT cm.user_id
         FROM class_members cm
         LEFT JOIN submissions s
           ON s.assignment_id = ? AND s.user_id = cm.user_id AND s.status = 'approved'
         WHERE cm.class_id = ? AND s.id IS NULL`,
        [assignment.id, assignment.class_id]
      ) as any[];

      for (const member of members as any[]) {
        // INSERT IGNORE: dedup 테이블에 삽입 시도 (이미 있으면 affectedRows=0)
        const [dedup] = await pool.execute(
          `INSERT IGNORE INTO notification_dedup (assignment_id, user_id, type)
           VALUES (?, ?, ?)`,
          [assignment.id, member.user_id, alert.type]
        ) as any[];

        if ((dedup as any).affectedRows === 0) continue; // 이미 발송됨

        // 알림 생성
        await pool.execute(
          `INSERT INTO notifications (user_id, type, title, link)
           VALUES (?, ?, ?, ?)`,
          [
            member.user_id,
            alert.type,
            assignment.title as string,
            `/assignments/${assignment.id}`,
          ]
        );
      }
    }
  }
}

// 마감 알림 스케줄러 시작 (5분마다 실행)
export function startDeadlineScheduler(): void {
  schedule("*/5 * * * *", async () => {
    try {
      await checkDeadlines();
    } catch (err) {
      console.error("[scheduler] deadline check error:", err);
    }
  });
  console.log("[scheduler] deadline scheduler started (every 5 min)");
}
