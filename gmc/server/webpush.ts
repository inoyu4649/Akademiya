import webpush from 'web-push';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getPushSubscriptionByStudentNo, deletePushSubscriptionByStudentNo } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAPID_KEYS_PATH = join(__dirname, '..', '.vapid_keys.json');

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

function loadOrCreateVapidKeys(): VapidKeys {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  if (existsSync(VAPID_KEYS_PATH)) {
    return JSON.parse(readFileSync(VAPID_KEYS_PATH, 'utf8')) as VapidKeys;
  }
  const keys = webpush.generateVAPIDKeys();
  try {
    writeFileSync(VAPID_KEYS_PATH, JSON.stringify(keys, null, 2));
  } catch { /* 쓰기 실패해도 이번 세션에서는 사용 가능 */ }
  console.log('[VAPID] 새 키가 생성되었습니다. .env에 고정을 권장합니다:');
  console.log(`  VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`  VAPID_PRIVATE_KEY=${keys.privateKey}`);
  return keys;
}

const vapidKeys = loadOrCreateVapidKeys();
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:022207@hafs.hs.kr';
webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);

export const vapidPublicKey = vapidKeys.publicKey;

export async function sendPushToStudent(studentNo: string, title: string, body: string): Promise<void> {
  try {
    const sub = await getPushSubscriptionByStudentNo(studentNo);
    if (!sub) return;
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
      JSON.stringify({ title, body })
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410 || status === 404) {
      await deletePushSubscriptionByStudentNo(studentNo).catch(() => {});
    } else {
      console.error(`[Push] ${studentNo} 발송 실패:`, (err as Error).message);
    }
  }
}
