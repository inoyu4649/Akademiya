import webpush from "web-push";
import { pool } from "../db/pool.js";

const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail      = process.env.VAPID_EMAIL ?? "mailto:admin@akademiya.kr";

let initialized = false;

function init() {
  if (initialized) return;
  if (!vapidPublicKey || !vapidPrivateKey) return;
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
  initialized = true;
}

export { vapidPublicKey };

/** 특정 userId의 모든 구독에 푸시 알림 전송 (실패는 조용히 무시) */
export async function sendPushToUser(
  userId: number,
  payload: { title: string; body?: string; link?: string }
): Promise<void> {
  init();
  if (!initialized) return;

  const [rows] = await pool.execute(
    "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
    [userId]
  ) as any[];

  const subs = rows as { id: number; endpoint: string; p256dh: string; auth: string }[];
  if (!subs.length) return;

  const data = JSON.stringify(payload);
  const staleIds: number[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data
        );
      } catch (err: any) {
        // 410 Gone / 404 Not Found → 구독이 만료됨, 삭제
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleIds.push(sub.id);
        }
      }
    })
  );

  if (staleIds.length) {
    await pool.execute(
      `DELETE FROM push_subscriptions WHERE id IN (${staleIds.map(() => "?").join(",")})`,
      staleIds
    ).catch(() => { /* ignore */ });
  }
}
