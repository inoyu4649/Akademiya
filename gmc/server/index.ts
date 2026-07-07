import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import https from 'https';
import { readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as setCookieParser from 'set-cookie-parser';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { generateRecaptchaToken, findChromePath } from './recaptcha.js';
import {
  initDb,
  registerSchedule, getScheduleAt, getMySchedule,
  markScheduleExecuted,
  recordUsage, getUsageStats, getUsageStatsByDate, getUsageStatsSummary, getUsageStatsByStudent, getAdminStats,
  getCredentials, deleteCredentials,
  getAllCredentials, deleteFailedStats,
  getUserRoleByEmail, setUserRoleByEmail,
  upsertRecurringSchedule, getRecurringByStudent, getRecurringByTime, getAllRecurring, deleteRecurringByStudent,
  addRetry, getDueRetry, deleteRetry,
  backupDb,
  cleanupOldSchedules,
  saveAkademiyaUser, getByAkademiyaUserId, getByAkademiyaEmail, linkGoingHafsCredentials,
  getPrivacyConsent, savePrivacyConsent,
  getTermsConsent, saveTermsConsent,
  getSuspendPeriods, addSuspendPeriod, deleteSuspendPeriod, getActiveSuspendPeriodForDate,
  savePushSubscription, deletePushSubscription,
  serverDir,
} from './db.js';
import { vapidPublicKey, sendPushToStudent } from './webpush.js';
import type { Session, SubmitPassResult, ScheduleRow } from './types.js';

const GMC_PRIVACY_POLICY_VERSION = 1;
const GMC_TERMS_OF_USE_VERSION = 1;
import { isHolidayCached, preloadHolidays, ensureMonthLoaded } from './holidays.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ── CORS (L-3): 전면 허용(cors()) 대신 알려진 origin만 허용 ──────────────
// 운영: gmc.akademiya.kr에서 express.static으로 같은 출처 서빙(불필요하나 방어적으로 포함).
// 개발: vite dev server(5174)에서 별도 포트(3001) API 호출.
const allowedOrigins = [
  'https://gmc.akademiya.kr',
  'http://localhost:5174',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));
app.use(express.json());

const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

const BASE_URL = 'https://going.hafs.hs.kr';
const AKADEMIYA_API_URL = process.env.AKADEMIYA_API_URL || 'https://akademiya.kr/api';

// ── Akademiya OpenOAuth ("Akademiya로 로그인") ────────────────────────────
// GMCAuto는 Akademiya OpenOAuth(/api/openoauth)의 서드파티 클라이언트로 등록되어 있음.
// Client ID/Secret은 Akademiya 개발자 도구에서 발급받아 .env로 주입한다 (Akademiya 코드는 수정하지 않음).
const AKADEMIYA_OAUTH_CLIENT_ID     = process.env.AKADEMIYA_OAUTH_CLIENT_ID || '';
const AKADEMIYA_OAUTH_CLIENT_SECRET = process.env.AKADEMIYA_OAUTH_CLIENT_SECRET || '';
const AKADEMIYA_OAUTH_AUTHORIZE_URL = process.env.AKADEMIYA_OAUTH_AUTHORIZE_URL || 'https://akademiya.kr/oauth/authorize';
const AKADEMIYA_OAUTH_REDIRECT_URI  = process.env.AKADEMIYA_OAUTH_REDIRECT_URI || 'https://gmc.akademiya.kr/auth/callback';
const AKADEMIYA_OAUTH_SCOPE = 'openid profile email';

// ── GMCAuto 공개 API (서버-서버, 다른 서비스가 학교 사이트를 직접 두드리지 않도록) ──
const GMC_PUBLIC_API_KEY = process.env.GMC_PUBLIC_API_KEY || '';

const chromePath = findChromePath();
console.log(chromePath ? `Chrome 발견: ${chromePath}` : 'Chrome 미발견');

// DB 초기화 (비동기)
initDb().catch(err => console.error('[DB 초기화 실패]', err));

// 공휴일 미리 로드
preloadHolidays().catch(err => console.error('[공휴일 초기화 실패]', (err as Error).message));

// 세션 저장소 (메모리)
const sessions = new Map<string, Session>();

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayStr(): string {
  return dateStr(new Date());
}

function findNextWorkday(startDate: Date): string {
  const d = new Date(startDate);
  for (let i = 0; i < 14; i++) {
    const day = d.getDay();
    const ds = dateStr(d);
    if (day !== 0 && day !== 6 && !isHolidayCached(ds)) return ds;
    d.setDate(d.getDate() + 1);
  }
  return dateStr(d);
}

function effectiveDate(): string {
  const now = new Date();
  const day = now.getDay();
  const today = dateStr(now);
  if (day === 5 || day === 6 || day === 0 || isHolidayCached(today)) {
    const start = new Date(now);
    if (day === 5) start.setDate(start.getDate() + 3);
    else if (day === 6) start.setDate(start.getDate() + 2);
    else if (day === 0) start.setDate(start.getDate() + 1);
    else start.setDate(start.getDate() + 1);
    return findNextWorkday(start);
  }
  return today;
}

function isWeekend(): boolean {
  const now = new Date();
  const d = now.getDay();
  return d === 5 || d === 6 || d === 0 || isHolidayCached(dateStr(now));
}

interface TargetDateInfo {
  date: string;
  suspended: boolean;
  suspendEnd: string | null;
  resumeDate: string | null;
}

async function getTargetDateInfo(): Promise<TargetDateInfo> {
  const candidate = effectiveDate();
  const period = await getActiveSuspendPeriodForDate(candidate);
  if (period) {
    const afterEnd = new Date(period.end_date);
    afterEnd.setDate(afterEnd.getDate() + 1);
    const resumeDate = findNextWorkday(afterEnd);
    return { date: resumeDate, suspended: true, suspendEnd: period.end_date, resumeDate };
  }
  return { date: candidate, suspended: false, suspendEnd: null, resumeDate: null };
}

function findNextRetryAt(prevAtMs: number, date: string, _ourStudentNo: string): number | null {
  const [Y, M, D] = date.split('-').map(Number);
  const maxAt = new Date(Y, M - 1, D, 17, 40, 0, 0).getTime();
  const candidate = prevAtMs + 30_000;
  if (candidate <= maxAt) return candidate;
  return null;
}

function formatTimeMs(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

function createClient(): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL,
    maxRedirects: 0,
    validateStatus: (status) => status < 400 || status === 302,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    responseType: 'arraybuffer',
    timeout: 15000,
  });
}

function decodeResponse(response: AxiosResponse): string {
  const ct = (response.headers['content-type'] as string) || '';
  const buf = Buffer.from(response.data as ArrayBuffer);
  if (ct.includes('utf-8') || ct.includes('utf8')) return buf.toString('utf-8');
  return new TextDecoder('euc-kr').decode(buf);
}

function extractCookies(response: AxiosResponse): setCookieParser.Cookie[] {
  const h = response.headers['set-cookie'] as string[] | string | undefined;
  return h ? setCookieParser.parse(Array.isArray(h) ? h : [h]) : [];
}

function cookieStr(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

function eucKrPercentEncode(str: string): string {
  const buf = iconv.encode(str, 'euc-kr');
  let result = '';
  for (const byte of buf) {
    if ((byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x5A) ||
        (byte >= 0x61 && byte <= 0x7A) ||
        byte === 0x2D || byte === 0x5F || byte === 0x2E || byte === 0x7E) {
      result += String.fromCharCode(byte);
    } else {
      result += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return result;
}

function buildEucKrBody(params: Record<string, string | number | null | undefined>): string {
  return Object.entries(params)
    .map(([k, v]) => `${eucKrPercentEncode(k)}=${eucKrPercentEncode(String(v ?? ''))}`)
    .join('&');
}

function isLoginRedirect(body: string): boolean {
  return body.includes("location.href='/mobile/login") ||
         body.includes("/login/login") ||
         body.includes("location.href='/'");
}

function extractAlert(body: string): string | null {
  const m = body.match(/alert\s*\(\s*['"](.+?)['"]\s*\)/s);
  return m ? m[1].trim() : null;
}

// ========== 자동 로그인 ==========
async function autoLogin(studentNo: string): Promise<{ client: AxiosInstance; cookies: Record<string, string> } | null> {
  const cred = await getCredentials(studentNo);
  if (!cred) return null;

  const client = createClient();
  const cookies: Record<string, string> = {};

  let recaptchaToken: string;
  try {
    recaptchaToken = await generateRecaptchaToken(chromePath);
  } catch (err) {
    console.error(`[자동로그인 ${studentNo}] reCAPTCHA 실패: ${(err as Error).message}`);
    return null;
  }

  const pageRes = await client.get('/mobile/login/login.html');
  extractCookies(pageRes).forEach(c => { cookies[c.name] = c.value; });

  const loginData = buildEucKrBody({
    student_no: studentNo,
    student_pw: cred.password,
    login_type: 'S',
    'g-recaptcha': recaptchaToken,
    auto_id: '',
  });

  const loginRes = await client.post('/mobile/login/login_process.php', loginData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieStr(cookies),
      'Referer': `${BASE_URL}/mobile/login/login.html`,
      'Origin': BASE_URL,
    },
  });
  extractCookies(loginRes).forEach(c => { cookies[c.name] = c.value; });
  const loginBody = decodeResponse(loginRes);

  const loginAlert = extractAlert(loginBody);
  if (loginAlert && !loginAlert.includes('성공')) {
    console.error(`[자동로그인 ${studentNo}] 실패: ${loginAlert}`);
    return null;
  }

  const gmcRes = await client.get('/mobile/gmc/gmc_list.html', {
    headers: { 'Cookie': cookieStr(cookies) },
  });
  extractCookies(gmcRes).forEach(c => { cookies[c.name] = c.value; });
  const gmcBody = decodeResponse(gmcRes);

  if (isLoginRedirect(gmcBody)) {
    console.error(`[자동로그인 ${studentNo}] GMC 접근 실패`);
    return null;
  }

  console.log(`[자동로그인 ${studentNo}] 성공`);
  return { client, cookies };
}

// ========== PASS 제출 ==========
async function submitPassWithLogin(studentNo: string, applyDate: string, timeCode: string, reason: string): Promise<SubmitPassResult> {
  const loginResult = await autoLogin(studentNo);
  if (!loginResult) {
    return { ok: false, msg: '자동 로그인 실패 (저장된 비밀번호 확인 필요)', loginFailed: true };
  }

  const { client, cookies } = loginResult;

  try {
    const formRes = await client.get('/mobile/gmc/gmc_write.html', {
      headers: { 'Cookie': cookieStr(cookies), 'Referer': `${BASE_URL}/mobile/gmc/gmc_list.html` },
    });
    extractCookies(formRes).forEach(c => { cookies[c.name] = c.value; });
    const formBody = decodeResponse(formRes);

    if (isLoginRedirect(formBody)) {
      return { ok: false, msg: '폼 로드 시 세션 만료', loginFailed: false };
    }

    const $ = cheerio.load(formBody);
    const formParams: Record<string, string> = {};
    $('input[type="hidden"]').each((_, el) => {
      const name = $(el).attr('name');
      if (name) formParams[name] = $(el).attr('value') || '';
    });

    const [Y, M, D] = applyDate.split('-');
    formParams['submit_type'] = 'insert';
    formParams['r_year']  = Y;
    formParams['r_month'] = M;
    formParams['r_day']   = D;
    formParams['pass_gubun'] = '5';
    formParams['time_code']  = timeCode;
    formParams['teacher_id'] = 'gmcauto';
    formParams['reason']     = reason || '';

    let actionUrl = $('form').attr('action') || 'gmc_write.php';
    if (!actionUrl.startsWith('/')) actionUrl = '/mobile/gmc/' + actionUrl;

    const submitRes = await client.post(actionUrl, buildEucKrBody(formParams), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr(cookies),
        'Referer': `${BASE_URL}/mobile/gmc/gmc_write.html`,
        'Origin': BASE_URL,
      },
    });
    extractCookies(submitRes).forEach(c => { cookies[c.name] = c.value; });
    const submitBody = decodeResponse(submitRes);
    const alertMsg = extractAlert(submitBody);

    let ok = false;
    let msg = '신청 요청 전송됨';
    if (alertMsg) {
      ok = /완료|성공|등록|처리/.test(alertMsg);
      msg = alertMsg;
    } else if (submitRes.status === 302 || submitBody.includes('gmc_list')) {
      ok = true;
      msg = 'GMC PASS 신청 완료';
    }
    return { ok, msg, loginFailed: false };
  } finally {
    try {
      await client.get('/mobile/login/logout.php', { headers: { 'Cookie': cookieStr(cookies) } });
    } catch { /* ignore */ }
  }
}

// ========== 스케줄러 (DB 기반 반복 등록 — 자정 복사 없음) ==========
// 오늘이 신청 가능일이면, 현재 분(HH:MM)에 해당하는 반복 등록을 찾아 "그 자리에서"
// 오늘 날짜의 schedules 행을 만들고 곧바로 실행한다. 미리 다음날 행을 만들어두지
// 않으므로 중단 기간이 뒤늦게 바뀌어도 잘못된 날짜가 열려 있는 문제가 생기지 않는다.
let schedulerBusy = false;
setInterval(async () => {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    if (isWeekend()) return;
    const todaySuspend = await getActiveSuspendPeriodForDate(todayStr());
    if (todaySuspend) return;

    const retry = await getDueRetry();
    if (retry) { await processRetry(retry); return; }

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const key = `${hh}:${mm}`;
    const today = todayStr();

    // 같은 분(HH:MM) 안에서 5초마다 여러 번 tick이 도는 것을 방지 (이미 오늘자 행이 있으면 skip)
    const already = await getScheduleAt(key, today);
    if (already) return;

    const recurring = await getRecurringByTime(key);
    if (!recurring) return;

    await registerSchedule(key, today, 'auto_recurring', recurring.student_no, recurring.time_code, recurring.teacher_id, recurring.reason || '');
    const entry = await getScheduleAt(key, today);
    if (entry) await processSchedule(entry, key, today);
  } catch (err) {
    console.error('[스케줄러] 예외:', (err as Error).message);
  } finally {
    schedulerBusy = false;
  }
}, 5000);

async function processSchedule(entry: ScheduleRow, key: string, today: string): Promise<void> {
  console.log(`[스케줄 ${key}] 자동 신청 시작 - ${entry.student_no}`);
  try {
    const result = await submitPassWithLogin(entry.student_no, today, entry.time_code, entry.reason || '');

    if (result.loginFailed) {
      const nextAt = findNextRetryAt(Date.now(), today, entry.student_no);
      let retryNote = '';
      if (nextAt) {
        await addRetry(nextAt, entry.student_no, entry.time_code, entry.reason || '', today, key, 1);
        retryNote = ` → ${formatTimeMs(nextAt)} 재시도 예약 (1/5)`;
        console.log(`[스케줄 ${key}] ${entry.student_no} 자동 로그인 실패${retryNote}`);
      } else {
        retryNote = ' (재시도 가능 시간 없음)';
      }
      await markScheduleExecuted(key, today, false, result.msg + retryNote);
      await recordUsage(entry.student_no, 'gmcauto', entry.time_code, key, today, false, result.msg + retryNote);
      return;
    }

    await markScheduleExecuted(key, today, result.ok, result.msg);
    await recordUsage(entry.student_no, 'gmcauto', entry.time_code, key, today, result.ok, result.msg);
    // 트리거 #2: 신청 성공 푸시
    if (result.ok) {
      await sendPushToStudent(entry.student_no, 'GMCAuto', `[${entry.student_no}] ${key} 신청되었습니다.`);
    }
    console.log(`[스케줄 ${key}] ${entry.student_no}: ${result.msg}`);
  } catch (err) {
    const error = err as Error;
    await markScheduleExecuted(key, today, false, error.message);
    await recordUsage(entry.student_no, 'gmcauto', entry.time_code, key, today, false, error.message);
    console.error(`[스케줄 ${key}] ${entry.student_no}: 오류 -`, error.message);
  }
}

async function processRetry(retry: Awaited<ReturnType<typeof getDueRetry>> & object): Promise<void> {
  if (!retry) return;
  const label = `[재시도#${retry.attempt} ${formatTimeMs(retry.retry_at)}]`;
  console.log(`${label} 처리 시작 - ${retry.student_no} (origin ${retry.origin_time})`);
  await deleteRetry(retry.id);

  try {
    const result = await submitPassWithLogin(retry.student_no, retry.apply_date, retry.time_code, retry.reason || '');

    if (result.loginFailed) {
      if (retry.attempt >= 5) {
        const note = ` (재시도 한도 초과 - 5회)`;
        await markScheduleExecuted(retry.origin_time, retry.apply_date, false, result.msg + note);
        await recordUsage(retry.student_no, 'gmcauto', retry.time_code, retry.origin_time, retry.apply_date, false, result.msg + note);
        // 트리거 #3: 5회 모두 실패 푸시
        await sendPushToStudent(retry.student_no, 'GMCAuto',
          `[${retry.student_no}] ${retry.origin_time} 신청 실패하였습니다. 비밀번호를 확인한 후 수동으로 신청 바랍니다.`
        );
        return;
      }
      const nextAt = findNextRetryAt(retry.retry_at, retry.apply_date, retry.student_no);
      if (nextAt) {
        await addRetry(nextAt, retry.student_no, retry.time_code, retry.reason || '', retry.apply_date, retry.origin_time, retry.attempt + 1);
        const note = ` → ${formatTimeMs(nextAt)} 재시도 예약 (${retry.attempt + 1}/5)`;
        await markScheduleExecuted(retry.origin_time, retry.apply_date, false, result.msg + note);
        await recordUsage(retry.student_no, 'gmcauto', retry.time_code, retry.origin_time, retry.apply_date, false, result.msg + note);
      } else {
        const note = ' (재시도 가능 시간 없음 - 17:40 초과)';
        await markScheduleExecuted(retry.origin_time, retry.apply_date, false, result.msg + note);
        await recordUsage(retry.student_no, 'gmcauto', retry.time_code, retry.origin_time, retry.apply_date, false, result.msg + note);
      }
      return;
    }

    await markScheduleExecuted(retry.origin_time, retry.apply_date, result.ok, result.msg);
    await recordUsage(retry.student_no, 'gmcauto', retry.time_code, retry.origin_time, retry.apply_date, result.ok, result.msg);
    // 트리거 #2: 재시도 성공 푸시
    if (result.ok) {
      await sendPushToStudent(retry.student_no, 'GMCAuto', `[${retry.student_no}] ${retry.origin_time} 신청되었습니다.`);
    }
    console.log(`${label} ${retry.student_no}: ${result.msg}`);
  } catch (err) {
    const error = err as Error;
    await markScheduleExecuted(retry.origin_time, retry.apply_date, false, error.message);
    await recordUsage(retry.student_no, 'gmcauto', retry.time_code, retry.origin_time, retry.apply_date, false, error.message);
    console.error(`${label} 오류 -`, error.message);
  }
}

// ========== 매일 1회: 휴일·중단기간 개시 안내 + 정리 (자정 복사 없음) ==========
// 반복 등록은 스케줄러 tick이 그날그날 직접 실행하므로 여기서는 아무 행도 만들지
// 않는다. 휴일/중단기간이 "오늘부터" 시작되는 경우에만 반복 등록자 전원에게
// 1회 안내 푸시를 보내고, 7일 지난 실행 기록을 정리한다.
let lastDailyCheckDate = '';
setInterval(async () => {
  const now = new Date();
  if (now.getHours() !== 0 || now.getMinutes() !== 0) return;

  const today = todayStr();
  if (lastDailyCheckDate === today) return;
  lastDailyCheckDate = today;

  await ensureMonthLoaded(today);

  const suspendPeriod = await getActiveSuspendPeriodForDate(today);
  const isSuspendStart = suspendPeriod !== null && suspendPeriod.start_date === today;

  let isFirstHolidayDay = false;
  if (!isSuspendStart) {
    const todayDay = now.getDay();
    const todayIsHoliday = todayDay === 5 || todayDay === 6 || todayDay === 0 || isHolidayCached(today);
    if (todayIsHoliday) {
      const yDate = new Date(now);
      yDate.setDate(yDate.getDate() - 1);
      const yDay = yDate.getDay();
      const yesterdayWasHoliday = yDay === 5 || yDay === 6 || yDay === 0 || isHolidayCached(dateStr(yDate));
      isFirstHolidayDay = !yesterdayWasHoliday;
    }
  }

  if (isSuspendStart || isFirstHolidayDay) {
    let targetStr: string;
    if (isSuspendStart && suspendPeriod) {
      const afterEnd = new Date(suspendPeriod.end_date);
      afterEnd.setDate(afterEnd.getDate() + 1);
      targetStr = findNextWorkday(afterEnd);
    } else {
      targetStr = effectiveDate();
    }

    const recurringUsers = await getAllRecurring();
    for (const r of recurringUsers) {
      if (isSuspendStart && suspendPeriod) {
        await sendPushToStudent(r.student_no, 'GMCAuto',
          `[${r.student_no}] ${suspendPeriod.start_date}부터 중단 기간입니다. 재개일(${targetStr})부터 자동으로 다시 신청됩니다.`
        );
      } else {
        await sendPushToStudent(r.student_no, 'GMCAuto',
          `[${r.student_no}] ${today}부터 금요일/휴일입니다. 다음 신청 가능일(${targetStr})에 자동으로 신청됩니다.`
        );
      }
    }
  }

  const cleaned = await cleanupOldSchedules();
  if (cleaned > 0) console.log(`[정리] 7일 지난 스케줄 ${cleaned}개 삭제`);
}, 15000);

// ========== 매일 08:00 DB 백업 ==========
const BACKUP_DIR = join(serverDir, '..', 'backup');
mkdirSync(BACKUP_DIR, { recursive: true });

let lastBackupDate = '';
setInterval(async () => {
  const now = new Date();
  if (now.getHours() !== 8 || now.getMinutes() !== 0) return;
  const today = todayStr();
  if (lastBackupDate === today) return;
  lastBackupDate = today;

  const filename = `gmcauto-${today}.json`;
  const dest = join(BACKUP_DIR, filename);
  try {
    await backupDb(dest);
    console.log(`[백업] ${filename} 생성 완료`);
    cleanupOldBackups();
  } catch (err) {
    console.error(`[백업] 실패: ${(err as Error).message}`);
  }
}, 30000);

function cleanupOldBackups(): void {
  const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const f of readdirSync(BACKUP_DIR)) {
    const fp = join(BACKUP_DIR, f);
    if (statSync(fp).mtimeMs < cutoffMs) { unlinkSync(fp); removed++; }
  }
  if (removed) console.log(`[백업] 오래된 백업 ${removed}개 삭제`);
}
cleanupOldBackups();

// ========== 헬스체크 ==========
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== Akademiya OpenOAuth 연동 ==========

// [보안] 계정연동(/link)은 반드시 OpenOAuth 콜백에서 토큰으로 검증된 akademiyaUserId에만
// 수행되어야 한다. 과거처럼 그 값을 클라이언트가 되돌려 보내게 하면, 인가 없이 임의 사용자의
// 연동을 덮어써 그 계정의 role(관리자 포함)이 실린 세션까지 탈취할 수 있다. 따라서 콜백에서
// 1회용 서버측 링크 티켓을 발급하고, /link는 이 티켓에서만 연동 대상 id를 얻는다.
const AK_LINK_TICKET_TTL_MS = 10 * 60_000; // 10분
const linkTickets = new Map<string, { akademiyaUserId: number; email: string | null; expiresAt: number }>();

function issueLinkTicket(akademiyaUserId: number, email: string | null): string {
  const ticket = `lt_${crypto.randomBytes(24).toString('hex')}`;
  linkTickets.set(ticket, { akademiyaUserId, email, expiresAt: Date.now() + AK_LINK_TICKET_TTL_MS });
  return ticket;
}

// 유효하면 연동 대상(검증된 akademiyaUserId)을 반환. HAFS 비밀번호 오타 등으로 재시도할 수
// 있도록 실제 연동이 성공한 뒤에만 티켓을 삭제한다(여기서는 만료된 것만 폐기).
function peekLinkTicket(ticket: unknown): { akademiyaUserId: number; email: string | null } | null {
  if (typeof ticket !== 'string' || !ticket) return null;
  const entry = linkTickets.get(ticket);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { linkTickets.delete(ticket); return null; }
  return { akademiyaUserId: entry.akademiyaUserId, email: entry.email };
}

// 프론트엔드가 인가 URL을 직접 구성할 수 있도록 클라이언트 설정(비밀 정보 제외) 제공
app.get('/api/akademiya/oauth-config', (_req: Request, res: Response) => {
  res.json({
    clientId:     AKADEMIYA_OAUTH_CLIENT_ID,
    authorizeUrl: AKADEMIYA_OAUTH_AUTHORIZE_URL,
    redirectUri:  AKADEMIYA_OAUTH_REDIRECT_URI,
    scope:        AKADEMIYA_OAUTH_SCOPE,
  });
});

app.post('/api/akademiya/oauth-callback', async (req: Request, res: Response) => {
  const { code, codeVerifier } = req.body as { code?: string; codeVerifier?: string };
  if (!code || !codeVerifier) {
    return res.status(400).json({ success: false, message: 'code/codeVerifier 파라미터 필요' });
  }

  try {
    const tokenRes = await axios.post(
      `${AKADEMIYA_API_URL}/openoauth/token`,
      {
        grantType:    'authorization_code',
        clientId:     AKADEMIYA_OAUTH_CLIENT_ID,
        clientSecret: AKADEMIYA_OAUTH_CLIENT_SECRET,
        code,
        redirectUri:  AKADEMIYA_OAUTH_REDIRECT_URI,
        codeVerifier,
      },
      { timeout: 10000 }
    );
    const accessToken = (tokenRes.data as { access_token: string }).access_token;

    const userinfoRes = await axios.get(`${AKADEMIYA_API_URL}/openoauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    });
    const { sub, name, email } = userinfoRes.data as { sub: string; name?: string; email?: string };
    const userId = Number(sub);
    if (!userId) {
      return res.status(401).json({ success: false, message: '사용자 정보를 가져오지 못했습니다.' });
    }
    const displayName = name || email?.split('@')[0] || '';

    // 이메일이 Primary Identifier이므로, akademiya_user_id로 못 찾으면 이메일로도 조회한다
    // (관리자가 아직 한 번도 로그인하지 않은 이메일에 미리 권한을 부여해둔 경우를 위함)
    let gmcUser = await getByAkademiyaUserId(userId);
    if (!gmcUser && email) gmcUser = await getByAkademiyaEmail(email);

    // 기존 연동 사용자: role은 GMCAuto 관리자 화면에서만 관리하며 여기서는 절대 재계산하지 않는다
    // (Akademiya 계정 로그인 시 권한이 초기화되던 버그 수정 — hafsOrgPerm 기반 재계산 로직 제거)
    if (gmcUser && gmcUser.student_no && gmcUser.password) {
      console.log(`[Akademiya OpenOAuth] 기존 연동 사용자: ${email} → ${gmcUser.student_no}`);

      const loginResult = await autoLogin(gmcUser.student_no);
      if (!loginResult) {
        return res.json({
          success: true,
          linked: true,
          loginFailed: true,
          userInfo: { displayName, email },
          linkTicket: issueLinkTicket(userId, email ?? null),
          studentNo: gmcUser.student_no,
        });
      }

      const sessionId = `ak_${crypto.randomBytes(24).toString('hex')}`;
      sessions.set(sessionId, {
        cookies: loginResult.cookies,
        studentNo: gmcUser.student_no,
        akademiyaEmail: email ?? null,
        loginTime: new Date().toISOString(),
      });

      const privacyConsentedVer = await getPrivacyConsent(gmcUser.id);
      const termsConsentedVer   = await getTermsConsent(gmcUser.id);
      return res.json({
        success: true,
        linked: true,
        sessionId,
        studentNo: gmcUser.student_no,
        studentName: displayName || '',
        akademiyaEmail: email ?? null,
        role: gmcUser.role,
        needsPrivacyConsent: privacyConsentedVer < GMC_PRIVACY_POLICY_VERSION,
        needsTermsConsent:   termsConsentedVer   < GMC_TERMS_OF_USE_VERSION,
      });
    }

    // 신규(또는 아직 Going HAFS 계정 미연동) Akademiya 사용자 — 기존 role(관리자가 이메일로
    // 미리 부여해둔 값)이 있으면 그대로 보존하고, 없으면 0(일반)으로 시작한다.
    await saveAkademiyaUser({
      akademiyaUserId: userId,
      akademiyaEmail: email || null,
      studentNo: gmcUser?.student_no ?? null,
      password: gmcUser?.password ?? null,
      role: gmcUser?.role ?? 0,
    });

    return res.json({
      success: true,
      linked: false,
      userInfo: { displayName, email },
      linkTicket: issueLinkTicket(userId, email ?? null),
    });

  } catch (err) {
    console.error('[Akademiya OpenOAuth 콜백 오류]', axios.isAxiosError(err) ? (err.response?.data ?? err.message) : (err as Error).message);
    if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 400)) {
      return res.status(401).json({ success: false, message: '코드가 만료되었거나 유효하지 않습니다.' });
    }
    return res.status(500).json({ success: false, message: `서버 오류: ${(err as Error).message}` });
  }
});

app.post('/api/akademiya/link', async (req: Request, res: Response) => {
  const { linkTicket, studentNo, password } = req.body as {
    linkTicket?: string; studentNo?: string; password?: string;
  };

  // [보안] akademiyaUserId는 클라이언트 입력이 아니라, OpenOAuth 콜백에서 토큰으로 검증된 뒤
  // 발급된 1회용 서버측 티켓에서만 얻는다. (임의 계정 연동 덮어쓰기/권한상승 방지)
  const ticket = peekLinkTicket(linkTicket);
  if (!ticket) {
    return res.status(401).json({ success: false, message: '연동 세션이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.' });
  }
  const { akademiyaUserId, email: akademiyaEmail } = ticket;

  if (!studentNo || !password) {
    return res.status(400).json({ success: false, message: '필수 파라미터 누락' });
  }

  if (/^0\d{5}$/.test(studentNo)) {
    return res.json({ success: false, message: '고유번호가 아닌 학번을 입력해주세요!' });
  }

  try {
    const client = createClient();
    const cookies: Record<string, string> = {};

    let recaptchaToken: string;
    try {
      recaptchaToken = await generateRecaptchaToken(chromePath);
    } catch (err) {
      return res.json({ success: false, message: `reCAPTCHA 토큰 생성 실패: ${(err as Error).message}` });
    }

    const pageRes = await client.get('/mobile/login/login.html');
    extractCookies(pageRes).forEach(c => { cookies[c.name] = c.value; });

    const loginData = buildEucKrBody({
      student_no: studentNo,
      student_pw: password,
      login_type: 'S',
      'g-recaptcha': recaptchaToken,
      auto_id: '',
    });

    const loginRes = await client.post('/mobile/login/login_process.php', loginData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr(cookies),
        'Referer': `${BASE_URL}/mobile/login/login.html`,
        'Origin': BASE_URL,
      },
    });
    extractCookies(loginRes).forEach(c => { cookies[c.name] = c.value; });
    const loginBody = decodeResponse(loginRes);

    const loginAlert = extractAlert(loginBody);
    if (loginAlert && !loginAlert.includes('성공')) {
      return res.json({ success: false, message: loginAlert });
    }

    const gmcRes = await client.get('/mobile/gmc/gmc_list.html', {
      headers: { 'Cookie': cookieStr(cookies) },
    });
    extractCookies(gmcRes).forEach(c => { cookies[c.name] = c.value; });
    if (isLoginRedirect(decodeResponse(gmcRes))) {
      return res.json({ success: false, message: '학번 또는 비밀번호가 올바르지 않습니다.' });
    }

    let studentName = '';
    const nameMatch = loginBody.match(/([가-힣]{2,4})\s*학생/);
    if (nameMatch) studentName = nameMatch[1];

    // role은 클라이언트 입력을 신뢰하지 않고 기존 DB 값을 그대로 보존한다 (없으면 0)
    const existingUser = await getByAkademiyaUserId(akademiyaUserId);
    const role = existingUser?.role ?? 0;

    await saveAkademiyaUser({
      akademiyaUserId,
      akademiyaEmail,
      studentNo,
      password,
      role,
    });
    linkTickets.delete(linkTicket!); // 연동 성공 → 티켓 1회용 폐기

    const sessionId = `ak_${crypto.randomBytes(24).toString('hex')}`;
    sessions.set(sessionId, { cookies, studentNo, akademiyaEmail, loginTime: new Date().toISOString() });

    console.log(`[Akademiya 연동 완료] ${akademiyaEmail} → ${studentNo} (role ${role})`);
    return res.json({ success: true, sessionId, studentNo, studentName, akademiyaEmail, role, needsPrivacyConsent: true, needsTermsConsent: true });

  } catch (err) {
    console.error('[Akademiya 연동 오류]', (err as Error).message);
    return res.status(500).json({ success: false, message: `서버 오류: ${(err as Error).message}` });
  }
});

// ========== GMC PASS 신청 폼 ==========
app.get('/api/pass/form', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });

  try {
    const client = createClient();
    const formRes = await client.get('/mobile/gmc/gmc_write.html', {
      headers: { 'Cookie': cookieStr(session.cookies), 'Referer': `${BASE_URL}/mobile/gmc/gmc_list.html` },
    });
    extractCookies(formRes).forEach(c => { session.cookies[c.name] = c.value; });
    const body = decodeResponse(formRes);

    if (isLoginRedirect(body)) {
      sessions.delete(req.query.sessionId as string);
      return res.json({ success: false, message: '세션 만료' });
    }

    const $ = cheerio.load(body);
    const hiddenFields: Record<string, string> = {};
    $('input[type="hidden"]').each((_, el) => {
      const name = $(el).attr('name');
      if (name) hiddenFields[name] = $(el).attr('value') || '';
    });
    const selectFields: Record<string, { value: string; label: string }[]> = {};
    $('select').each((_, el) => {
      const name = $(el).attr('name') || $(el).attr('id');
      if (name) {
        selectFields[name] = [];
        $(el).find('option').each((_, opt) => {
          const val = $(opt).attr('value');
          if (val !== undefined && val !== '') {
            selectFields[name].push({ value: val, label: $(opt).text().trim() });
          }
        });
      }
    });
    const textareas: Record<string, string> = {};
    $('textarea').each((_, el) => {
      const name = $(el).attr('name');
      if (name) textareas[name] = $(el).text().trim();
    });

    return res.json({ success: true, hiddenFields, selectFields, textareas, formAction: $('form').attr('action') || '' });

  } catch (error) {
    return res.status(500).json({ success: false, message: `폼 로드 실패: ${(error as Error).message}` });
  }
});

// ========== GMC PASS 즉시 신청 ==========
app.post('/api/pass/apply', async (req: Request, res: Response) => {
  const { sessionId, date, timeCode, reason } = req.body as {
    sessionId: string; date?: string; timeCode?: string; reason?: string;
  };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });

  try {
    const client = createClient();
    const formRes = await client.get('/mobile/gmc/gmc_write.html', {
      headers: { 'Cookie': cookieStr(session.cookies), 'Referer': `${BASE_URL}/mobile/gmc/gmc_list.html` },
    });
    extractCookies(formRes).forEach(c => { session.cookies[c.name] = c.value; });
    const formBody = decodeResponse(formRes);

    if (isLoginRedirect(formBody)) {
      sessions.delete(sessionId);
      return res.json({ success: false, message: '세션 만료' });
    }

    const $ = cheerio.load(formBody);
    const formParams: Record<string, string> = {};
    $('input[type="hidden"]').each((_, el) => {
      const name = $(el).attr('name');
      if (name) formParams[name] = $(el).attr('value') || '';
    });

    const applyDate = date || todayStr();
    const [Y, M, D] = applyDate.split('-');
    formParams['submit_type'] = 'insert';
    formParams['r_year']  = Y;
    formParams['r_month'] = M;
    formParams['r_day']   = D;
    formParams['pass_gubun'] = '5';
    if (timeCode) formParams['time_code'] = timeCode;
    formParams['teacher_id'] = 'gmcauto';
    formParams['reason'] = reason || '';

    let actionUrl = $('form').attr('action') || 'gmc_write.php';
    if (!actionUrl.startsWith('/')) actionUrl = '/mobile/gmc/' + actionUrl;

    const submitRes = await client.post(actionUrl, buildEucKrBody(formParams), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieStr(session.cookies),
        'Referer': `${BASE_URL}/mobile/gmc/gmc_write.html`,
        'Origin': BASE_URL,
      },
    });
    extractCookies(submitRes).forEach(c => { session.cookies[c.name] = c.value; });
    const submitBody = decodeResponse(submitRes);
    const alertMsg = extractAlert(submitBody);

    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    let ok = true, msg = '신청 요청 전송됨';
    if (alertMsg) {
      ok = /완료|성공|등록|처리/.test(alertMsg);
      msg = alertMsg;
    } else if (submitRes.status === 302 || submitBody.includes('gmc_list')) {
      msg = 'GMC PASS 신청 완료';
    }
    await recordUsage(session.studentNo, 'gmcauto', timeCode || '', hhmm, applyDate, ok, msg);
    return res.json({ success: ok, message: msg });

  } catch (error) {
    return res.status(500).json({ success: false, message: `신청 실패: ${(error as Error).message}` });
  }
});

// ========== GMC PASS 내역 ==========
app.get('/api/pass/list', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });

  try {
    const client = createClient();
    const listRes = await client.get('/mobile/gmc/gmc_list.html', {
      headers: { 'Cookie': cookieStr(session.cookies), 'Referer': `${BASE_URL}/mobile/gmc/gmc_list.html` },
    });
    const body = decodeResponse(listRes);
    if (isLoginRedirect(body)) {
      sessions.delete(req.query.sessionId as string);
      return res.json({ success: false, message: '세션 만료' });
    }

    const $ = cheerio.load(body);
    const records: { date: string; type: string; time: string; confirmed: string; teacher: string }[] = [];
    $('table tr').each((i, el) => {
      if (i === 0) return;
      const cells: string[] = [];
      $(el).find('td').each((_, td) => { cells.push($(td).text().trim()) });
      if (cells.length >= 3) {
        records.push({ date: cells[0], type: cells[1], time: cells[2], confirmed: cells[3] || '', teacher: cells[4] || '' });
      }
    });
    return res.json({ success: true, records });

  } catch (error) {
    return res.status(500).json({ success: false, message: `내역 조회 실패: ${(error as Error).message}` });
  }
});

// ========== 자동 신청 스케줄 ==========
app.post('/api/schedule/register', async (req: Request, res: Response) => {
  const { sessionId, time, timeCode, reason } = req.body as {
    sessionId: string; time: string; timeCode: string; reason?: string;
  };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });

  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return res.json({ success: false, message: '시간 형식이 올바르지 않습니다. (HH:MM)' });
  }
  const [hh, mm] = time.split(':').map(Number);
  const totalMin = hh * 60 + mm;
  if (totalMin < 540 || totalMin > 1059) {
    return res.json({ success: false, message: '09:00 ~ 17:39 사이만 등록 가능합니다.' });
  }
  if (!timeCode) return res.json({ success: false, message: '야자 시간을 선택하세요.' });

  const existing = await getRecurringByTime(time);
  if (existing && existing.student_no !== session.studentNo) {
    return res.json({ success: false, message: `${time}에 이미 다른 사용자가 등록되어 있습니다.` });
  }

  await upsertRecurringSchedule(session.studentNo, time, timeCode, 'gmcauto', reason || '');
  console.log(`[반복등록] ${session.studentNo} → ${time} 등록`);
  // 트리거 #1: 신청 예약 푸시
  await sendPushToStudent(session.studentNo, 'GMCAuto', `[${session.studentNo}] ${time} 자동 신청이 등록되었습니다.`);
  return res.json({
    success: true,
    message: `${time}에 자동 신청이 등록되었습니다. 앞으로 매 신청 가능일(평일/중단기간 제외)에 자동으로 신청됩니다.`,
  });
});

app.post('/api/schedule/cancel', async (req: Request, res: Response) => {
  const { sessionId } = req.body as { sessionId: string };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });

  const result = await deleteRecurringByStudent(session.studentNo);
  if (result.changes === 0) return res.json({ success: false, message: '등록된 자동 신청이 없습니다.' });
  return res.json({ success: true, message: '자동 신청이 해제되었습니다.' });
});

app.get('/api/schedule/status', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });

  const { date: targetDate, suspended, suspendEnd, resumeDate } = await getTargetDateInfo();
  const weekend = isWeekend();
  const validToday = targetDate === todayStr();

  const recurring = await getRecurringByStudent(session.studentNo);
  const allRecurring = await getAllRecurring();
  const takenSlots = allRecurring.map(r => r.time);

  let mySchedule = null;
  if (recurring) {
    const todayRow = validToday ? await getMySchedule(session.studentNo, todayStr()) : null;
    mySchedule = {
      time: recurring.time,
      timeCode: recurring.time_code,
      teacherId: recurring.teacher_id,
      reason: recurring.reason,
      executed: !!todayRow?.executed,
      result: todayRow?.executed ? { success: !!todayRow.result_ok, message: todayRow.result_msg } : null,
    };
  }

  return res.json({ success: true, mySchedule, takenSlots, targetDate, isWeekend: weekend, suspended, suspendEnd, resumeDate });
});

// ========== 관리자 API ==========

app.get('/api/admin/stats', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const role = await getUserRoleByEmail(session.akademiyaEmail);
  if (role < 1) return res.status(403).json({ success: false, message: '권한 없음' });

  const { grade, cls, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
  const records = await getAdminStats({ grade: grade||null, cls: cls||null, dateFrom: dateFrom||null, dateTo: dateTo||null });
  return res.json({ success: true, records, role });
});

app.post('/api/admin/stats/delete-failures', async (req: Request, res: Response) => {
  const { sessionId, grade, cls, dateFrom, dateTo } = req.body as {
    sessionId: string; grade?: string; cls?: string; dateFrom?: string; dateTo?: string;
  };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const role = await getUserRoleByEmail(session.akademiyaEmail);
  if (role < 3) return res.status(403).json({ success: false, message: '권한 없음 (권한 3 필요)' });

  const deleted = await deleteFailedStats({ grade:grade||null, cls:cls||null, dateFrom:dateFrom||null, dateTo:dateTo||null });
  console.log(`[관리자] ${session.studentNo} 실패 기록 ${deleted}건 삭제`);
  return res.json({ success: true, deleted });
});

app.get('/api/admin/users', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const role = await getUserRoleByEmail(session.akademiyaEmail);
  if (role < 3) return res.status(403).json({ success: false, message: '권한 없음' });

  const users = await getAllCredentials();
  return res.json({ success: true, users });
});

app.post('/api/admin/users/role', async (req: Request, res: Response) => {
  const { sessionId, email, role } = req.body as { sessionId: string; email: string; role: number };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const myRole = await getUserRoleByEmail(session.akademiyaEmail);
  if (myRole < 3) return res.status(403).json({ success: false, message: '권한 없음' });

  if (!email) return res.json({ success: false, message: '이메일을 입력하세요.' });
  const newRole = parseInt(String(role), 10);
  if (isNaN(newRole) || newRole < 0 || newRole > 3) {
    return res.json({ success: false, message: '유효하지 않은 권한 값입니다.' });
  }
  if (email === session.akademiyaEmail) {
    return res.json({ success: false, message: '자신의 권한은 변경할 수 없습니다.' });
  }

  await setUserRoleByEmail(email, newRole);
  console.log(`[관리자] ${session.akademiyaEmail} → ${email} 권한 ${newRole} 설정`);
  return res.json({ success: true, message: `${email} 권한이 ${newRole}으로 설정되었습니다.` });
});

// ========== GMC PASS 중단 기간 API ==========

app.get('/api/admin/suspend', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const role = await getUserRoleByEmail(session.akademiyaEmail);
  if (role < 3) return res.status(403).json({ success: false, message: '권한 없음' });
  const periods = await getSuspendPeriods();
  return res.json({ success: true, periods });
});

app.post('/api/admin/suspend', async (req: Request, res: Response) => {
  const { sessionId, startDate, endDate } = req.body as { sessionId: string; startDate: string; endDate: string };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const role = await getUserRoleByEmail(session.akademiyaEmail);
  if (role < 3) return res.status(403).json({ success: false, message: '권한 없음' });
  if (!startDate || !endDate || startDate > endDate) {
    return res.json({ success: false, message: '유효하지 않은 날짜 범위입니다.' });
  }
  await addSuspendPeriod(startDate, endDate);
  console.log(`[관리자] ${session.studentNo} 중단 기간 추가: ${startDate} ~ ${endDate}`);
  return res.json({ success: true });
});

app.delete('/api/admin/suspend/:id', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const role = await getUserRoleByEmail(session.akademiyaEmail);
  if (role < 3) return res.status(403).json({ success: false, message: '권한 없음' });
  const periodId = parseInt(req.params.id as string, 10);
  await deleteSuspendPeriod(periodId);
  console.log(`[관리자] ${session.studentNo} 중단 기간 ${periodId} 삭제`);
  return res.json({ success: true });
});

// ========== 통계 API ==========
app.get('/api/stats', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const role = await getUserRoleByEmail(session.akademiyaEmail);
  if (role < 1) return res.status(403).json({ success: false, message: '권한 없음' });

  const { date, limit } = req.query as Record<string, string | undefined>;
  if (date) {
    return res.json({ success: true, records: await getUsageStatsByDate(date) });
  } else {
    return res.json({ success: true, records: await getUsageStats(Number(limit) || 100) });
  }
});

app.get('/api/stats/summary', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  return res.json({ success: true, summary: await getUsageStatsSummary() });
});

// ========== 푸시 구독 ==========

app.get('/api/push/vapid-public-key', (_req: Request, res: Response) => {
  return res.json({ publicKey: vapidPublicKey });
});

app.post('/api/push/subscribe', async (req: Request, res: Response) => {
  const { sessionId, endpoint, p256dh, auth } = req.body as {
    sessionId: string; endpoint: string; p256dh: string; auth: string;
  };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const user = await getCredentials(session.studentNo);
  if (!user) return res.status(404).json({ success: false, message: '사용자 없음' });
  await savePushSubscription(user.id, endpoint, p256dh, auth);
  return res.json({ success: true });
});

app.post('/api/push/unsubscribe', async (req: Request, res: Response) => {
  const { sessionId } = req.body as { sessionId: string };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const user = await getCredentials(session.studentNo);
  if (!user) return res.status(404).json({ success: false, message: '사용자 없음' });
  await deletePushSubscription(user.id);
  return res.json({ success: true });
});

// ========== 세션 관련 ==========
app.get('/api/session/check', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const session = sessions.get(sessionId);
  if (!session) return res.json({ valid: false });

  try {
    const client = createClient();
    const probeRes = await client.get('/mobile/gmc/gmc_list.html', {
      headers: { 'Cookie': cookieStr(session.cookies) },
    });
    extractCookies(probeRes).forEach(c => { session.cookies[c.name] = c.value; });
    const body = decodeResponse(probeRes);

    if (isLoginRedirect(body)) {
      sessions.delete(sessionId);
      console.log(`[${session.studentNo}] 세션 만료 감지 → 자동 로그아웃`);
      return res.json({ valid: false, expired: true });
    }

    const role = await getUserRoleByEmail(session.akademiyaEmail);
    const dbUser = await getCredentials(session.studentNo);
    const privacyVer = dbUser ? await getPrivacyConsent(dbUser.id) : 0;
    const termsVer   = dbUser ? await getTermsConsent(dbUser.id)   : 0;
    return res.json({ valid: true, studentNo: session.studentNo, loginTime: session.loginTime, role,
      needsPrivacyConsent: privacyVer < GMC_PRIVACY_POLICY_VERSION,
      needsTermsConsent:   termsVer   < GMC_TERMS_OF_USE_VERSION });
  } catch (err) {
    console.warn(`[세션 확인] 네트워크 오류 (skip deep check): ${(err as Error).message}`);
    const role = await getUserRoleByEmail(session.akademiyaEmail);
    const dbUser = await getCredentials(session.studentNo);
    const privacyVer = dbUser ? await getPrivacyConsent(dbUser.id) : 0;
    const termsVer   = dbUser ? await getTermsConsent(dbUser.id)   : 0;
    return res.json({ valid: true, studentNo: session.studentNo, loginTime: session.loginTime, role,
      needsPrivacyConsent: privacyVer < GMC_PRIVACY_POLICY_VERSION,
      needsTermsConsent:   termsVer   < GMC_TERMS_OF_USE_VERSION });
  }
});

app.post('/api/logout', (req: Request, res: Response) => {
  const { sessionId } = req.body as { sessionId: string };
  sessions.delete(sessionId);
  return res.json({ success: true });
});

// ── 개인정보 처리방침 버전 확인
app.get('/api/privacy/version', (_req: Request, res: Response) => {
  return res.json({ version: GMC_PRIVACY_POLICY_VERSION });
});

// ── 이용약관 버전 확인
app.get('/api/terms/version', (_req: Request, res: Response) => {
  return res.json({ version: GMC_TERMS_OF_USE_VERSION });
});

// ── 개인정보 처리방침 동의 저장
app.post('/api/privacy/consent', async (req: Request, res: Response) => {
  const { sessionId, version } = req.body as { sessionId: string; version: number };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  if (version !== GMC_PRIVACY_POLICY_VERSION) {
    return res.status(400).json({ success: false, message: 'INVALID_VERSION' });
  }
  try {
    const user = (session.akademiyaEmail ? await getByAkademiyaEmail(session.akademiyaEmail) : null)
      || await getCredentials(session.studentNo);
    if (!user) return res.status(404).json({ success: false, message: '사용자 없음' });
    await savePrivacyConsent(user.id, version);
    return res.json({ success: true });
  } catch (err) {
    console.error('[privacy/consent]', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR' });
  }
});

// ── 이용약관 동의 저장
app.post('/api/terms/consent', async (req: Request, res: Response) => {
  const { sessionId, version } = req.body as { sessionId: string; version: number };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  if (version !== GMC_TERMS_OF_USE_VERSION) {
    return res.status(400).json({ success: false, message: 'INVALID_VERSION' });
  }
  try {
    const user = (session.akademiyaEmail ? await getByAkademiyaEmail(session.akademiyaEmail) : null)
      || await getCredentials(session.studentNo);
    if (!user) return res.status(404).json({ success: false, message: '사용자 없음' });
    await saveTermsConsent(user.id, version);
    return res.json({ success: true });
  } catch (err) {
    console.error('[terms/consent]', err);
    return res.status(500).json({ success: false, message: 'SERVER_ERROR' });
  }
});

app.post('/api/account/delete', async (req: Request, res: Response) => {
  const { sessionId } = req.body as { sessionId: string };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });

  await deleteCredentials(session.studentNo);
  sessions.delete(sessionId);
  console.log(`[${session.studentNo}] 계정 탈퇴 (credentials 삭제)`);
  return res.json({ success: true, message: '저장된 인증 정보가 삭제되었습니다.' });
});

// ========== GMCAuto 공개 API v1 ==========
// 다른 서비스(Akademiya 등)가 학교 홈페이지를 직접 조회해 동시접속 차단을 유발하지 않도록,
// 서버-서버 전용으로 신청 여부/예약 시간/신청 내역을 제공한다. 세션이 아닌 API Key로 인증.
app.get('/api/public/v1/status/:studentNo', async (req: Request, res: Response) => {
  const apiKey = req.header('X-Api-Key');
  if (!GMC_PUBLIC_API_KEY || apiKey !== GMC_PUBLIC_API_KEY) {
    return res.status(401).json({ success: false, message: 'API Key가 유효하지 않습니다.' });
  }

  const studentNo = req.params.studentNo as string;
  try {
    const recurring = await getRecurringByStudent(studentNo);
    const todayRow = await getMySchedule(studentNo, todayStr());
    const history = await getUsageStatsByStudent(studentNo, 20);

    return res.json({
      success: true,
      data: {
        studentNo,
        hasApplied: !!(todayRow?.executed && todayRow.result_ok),
        reservedTime: recurring?.time ?? null,
        history: history.map(h => ({
          applyDate: h.apply_date,
          scheduleTime: h.schedule_time,
          timeCode: h.time_code,
          success: !!h.success,
          message: h.message,
        })),
      },
    });
  } catch (err) {
    console.error('[공개 API]', (err as Error).message);
    return res.status(500).json({ success: false, message: `서버 오류: ${(err as Error).message}` });
  }
});

// SPA fallback
if (existsSync(distPath)) {
  app.get('/{*splat}', (_req: Request, res: Response) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof URIError) return res.status(400).end('Bad Request');
  _next(err);
});

// HTTPS or HTTP
const PORT = Number(process.env.PORT) || 3001;
const SSL_KEY  = process.env.SSL_KEY  || '/etc/letsencrypt/live/gmc.akademiya.kr/privkey.pem';
const SSL_CERT = process.env.SSL_CERT || '/etc/letsencrypt/live/gmc.akademiya.kr/fullchain.pem';

if (existsSync(SSL_KEY) && existsSync(SSL_CERT)) {
  https.createServer({ key: readFileSync(SSL_KEY), cert: readFileSync(SSL_CERT) }, app)
    .listen(PORT, '0.0.0.0', () => console.log(`\n🚀 GMCAuto 3 (HTTPS) → https://0.0.0.0:${PORT}\n`));
} else {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 GMCAuto 3 (HTTP) → http://0.0.0.0:${PORT}`);
    console.log(`   SSL 인증서 없음 → HTTP 모드\n`);
  });
}

// linkGoingHafsCredentials is imported but only used in future API; keep the import to avoid tree-shaking
void linkGoingHafsCredentials;
