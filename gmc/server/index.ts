import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
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
  registerSchedule, getScheduleAt, getMySchedule, getTodaySchedules,
  getPendingSchedule, cancelSchedule, markScheduleExecuted,
  recordUsage, getUsageStats, getUsageStatsByDate, getUsageStatsSummary, getAdminStats,
  updateScheduleSessionId,
  saveCredentials, getCredentials, deleteCredentials,
  getUserRole, setUserRole, getAllCredentials, deleteFailedStats,
  getSchedulesByDate,
  addRetry, getDueRetry, deleteRetry,
  backupDb,
  cleanupOldSchedules,
  saveAkademiyaUser, getByAkademiyaUserId, linkGoingHafsCredentials,
  getPrivacyConsent, savePrivacyConsent,
  getTermsConsent, saveTermsConsent,
  getSuspendPeriods, addSuspendPeriod, deleteSuspendPeriod, getActiveSuspendPeriodForDate,
  serverDir,
} from './db.js';
import type { Session, SubmitPassResult, ScheduleRow } from './types.js';

const GMC_PRIVACY_POLICY_VERSION = 1;
const GMC_TERMS_OF_USE_VERSION = 1;
import { isHolidayCached, preloadHolidays, ensureMonthLoaded } from './holidays.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

const BASE_URL = 'https://going.hafs.hs.kr';
const AKADEMIYA_API_URL = process.env.AKADEMIYA_API_URL || 'https://akademiya.kr/api';

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

// ========== 스케줄러 ==========
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
    const entry = await getPendingSchedule(key, today);
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
    console.log(`${label} ${retry.student_no}: ${result.msg}`);
  } catch (err) {
    const error = err as Error;
    await markScheduleExecuted(retry.origin_time, retry.apply_date, false, error.message);
    await recordUsage(retry.student_no, 'gmcauto', retry.time_code, retry.origin_time, retry.apply_date, false, error.message);
    console.error(`${label} 오류 -`, error.message);
  }
}

// ========== 자정 스케줄 자동 복사 ==========
let lastCopiedDate = '';
setInterval(async () => {
  const now = new Date();
  if (now.getHours() !== 0 || now.getMinutes() !== 0) return;

  const today = todayStr();
  if (lastCopiedDate === today) return;
  lastCopiedDate = today;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  await ensureMonthLoaded(dateStr(tomorrow));

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = dateStr(yesterday);

  // 중단 기간 체크: 오늘이 중단 기간 시작일이면 종료일 다음 첫 평일로 복사
  const suspendPeriod = await getActiveSuspendPeriodForDate(today);
  let targetStr: string;
  if (suspendPeriod) {
    const afterEnd = new Date(suspendPeriod.end_date);
    afterEnd.setDate(afterEnd.getDate() + 1);
    targetStr = findNextWorkday(afterEnd);
    console.log(`[자정 복사] 중단 기간 (${suspendPeriod.start_date}~${suspendPeriod.end_date}) → 재개일 ${targetStr}로 복사`);
  } else {
    targetStr = effectiveDate();
  }

  const prevSchedules = await getSchedulesByDate(yesterdayStr);
  if (prevSchedules.length === 0) {
    console.log(`[자정 복사] 전날(${yesterdayStr}) 스케줄 없음`);
    return;
  }

  let copied = 0;
  for (const entry of prevSchedules) {
    if (entry.session_id === 'auto_retry') continue;
    const existing = await getScheduleAt(entry.time, targetStr);
    if (existing) continue;
    await registerSchedule(entry.time, targetStr, 'auto_copy', entry.student_no, entry.time_code, 'gmcauto', entry.reason || '');
    copied++;
  }
  console.log(`[자정 복사] ${yesterdayStr} → ${targetStr}: ${copied}개 복사됨`);

  const cleaned = await cleanupOldSchedules();
  if (cleaned > 0) console.log(`[자정 정리] 7일 지난 스케줄 ${cleaned}개 삭제`);
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

// ========== 로그인 (GMCAuto 계정) ==========
app.post('/api/login', async (req: Request, res: Response) => {
  const { studentNo, password } = req.body as { studentNo: string; password: string };

  if (!studentNo || !password) {
    return res.status(400).json({ success: false, message: '학번과 비밀번호를 입력하세요.' });
  }

  if (/^0\d{5}$/.test(studentNo)) {
    return res.json({ success: false, message: '고유번호가 아닌 학번을 입력해주세요!' });
  }

  try {
    const client = createClient();
    const cookies: Record<string, string> = {};

    console.log(`[${studentNo}] 로그인 시도 - reCAPTCHA v3 토큰 생성 중...`);

    let recaptchaToken: string;
    try {
      recaptchaToken = await generateRecaptchaToken(chromePath);
      console.log(`[${studentNo}] reCAPTCHA 토큰 OK (${recaptchaToken.length}자)`);
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
      console.log(`[${studentNo}] 로그인 응답: "${loginAlert}"`);
      return res.json({ success: false, message: loginAlert });
    }

    const gmcRes = await client.get('/mobile/gmc/gmc_list.html', {
      headers: { 'Cookie': cookieStr(cookies) },
    });
    extractCookies(gmcRes).forEach(c => { cookies[c.name] = c.value; });
    const gmcBody = decodeResponse(gmcRes);

    if (isLoginRedirect(gmcBody)) {
      return res.json({ success: false, message: '로그인에 실패했습니다. 학번과 비밀번호를 확인하세요.' });
    }

    let studentName = '';
    const nameFromLogin = loginBody.match(/([가-힣]{2,4})\s*학생/);
    if (nameFromLogin) {
      studentName = nameFromLogin[1];
    } else {
      const $gmc = cheerio.load(gmcBody);
      const headerText = $gmc('.header, .top_area, .user_info, #header').text();
      const nameFromHeader = headerText.match(/([가-힣]{2,4})\s*학생/);
      if (nameFromHeader) studentName = nameFromHeader[1];
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessions.set(sessionId, { cookies, studentNo, loginTime: new Date().toISOString() });

    await saveCredentials(studentNo, password);

    const existing = await getMySchedule(studentNo, todayStr());
    if (existing) {
      await updateScheduleSessionId(studentNo, todayStr(), sessionId);
      console.log(`[${studentNo}] 기존 스케줄 세션 갱신 (${existing.time})`);
    }

    const role = await getUserRole(studentNo);
    const dbUser = await getCredentials(studentNo);
    const privacyConsentedVersion = dbUser ? await getPrivacyConsent(dbUser.id) : 0;
    const termsConsentedVersion   = dbUser ? await getTermsConsent(dbUser.id) : 0;
    const needsPrivacyConsent = privacyConsentedVersion < GMC_PRIVACY_POLICY_VERSION;
    const needsTermsConsent   = termsConsentedVersion   < GMC_TERMS_OF_USE_VERSION;
    console.log(`[${studentNo}] 로그인 성공 ${studentName ? `(${studentName})` : ''} (권한 ${role})`);
    return res.json({ success: true, message: '로그인 성공', sessionId, studentName, studentNo, role, needsPrivacyConsent, needsTermsConsent });

  } catch (error) {
    console.error('Login error:', (error as Error).message);
    return res.status(500).json({ success: false, message: `서버 오류: ${(error as Error).message}` });
  }
});

// ========== Akademiya OAuth 연동 ==========

app.post('/api/akademiya/verify', async (req: Request, res: Response) => {
  const { code } = req.body as { code: string };
  if (!code) return res.status(400).json({ success: false, message: 'code 파라미터 필요' });

  try {
    const verifyRes = await axios.post(
      `${AKADEMIYA_API_URL}/oauth/gmcauto-verify`,
      { code },
      { timeout: 10000 }
    );
    const { userId, displayName, email, hafsOrgPerm } = verifyRes.data as {
      userId: number; displayName: string; email: string; hafsOrgPerm: number;
    };

    if (!userId) {
      return res.status(401).json({ success: false, message: '유효하지 않은 코드입니다.' });
    }

    const gmcRole = hafsOrgPerm >= 3 ? 3 : hafsOrgPerm >= 1 ? 1 : 0;
    const gmcUser = await getByAkademiyaUserId(userId);

    if (gmcUser && gmcUser.student_no && gmcUser.password) {
      console.log(`[Akademiya OAuth] 기존 연동 사용자: ${email} → ${gmcUser.student_no}`);

      if (gmcUser.role !== gmcRole) {
        await setUserRole(gmcUser.student_no, gmcRole);
      }

      const loginResult = await autoLogin(gmcUser.student_no);
      if (!loginResult) {
        return res.json({
          success: true,
          linked: true,
          loginFailed: true,
          userInfo: { displayName, email, hafsOrgPerm, gmcRole },
          studentNo: gmcUser.student_no,
        });
      }

      const sessionId = `ak_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      sessions.set(sessionId, {
        cookies: loginResult.cookies,
        studentNo: gmcUser.student_no,
        loginTime: new Date().toISOString(),
      });

      const existing = await getMySchedule(gmcUser.student_no, todayStr());
      if (existing) await updateScheduleSessionId(gmcUser.student_no, todayStr(), sessionId);

      const privacyConsentedVer = await getPrivacyConsent(gmcUser.id);
      const termsConsentedVer   = await getTermsConsent(gmcUser.id);
      return res.json({
        success: true,
        linked: true,
        sessionId,
        studentNo: gmcUser.student_no,
        studentName: displayName || '',
        role: gmcRole,
        needsPrivacyConsent: privacyConsentedVer < GMC_PRIVACY_POLICY_VERSION,
        needsTermsConsent:   termsConsentedVer   < GMC_TERMS_OF_USE_VERSION,
      });
    }

    if (!gmcUser) {
      await saveAkademiyaUser({ akademiyaUserId: userId, akademiyaEmail: email, studentNo: null, password: null, role: gmcRole });
    }

    return res.json({
      success: true,
      linked: false,
      userInfo: { displayName, email, hafsOrgPerm, gmcRole, akademiyaUserId: userId },
    });

  } catch (err) {
    console.error('[Akademiya OAuth 검증 오류]', (err as Error).message);
    if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 400)) {
      return res.status(401).json({ success: false, message: '코드가 만료되었거나 유효하지 않습니다.' });
    }
    return res.status(500).json({ success: false, message: `서버 오류: ${(err as Error).message}` });
  }
});

app.post('/api/akademiya/link', async (req: Request, res: Response) => {
  const { akademiyaUserId, akademiyaEmail, studentNo, password, gmcRole } = req.body as {
    akademiyaUserId: number; akademiyaEmail: string; studentNo: string; password: string; gmcRole?: number;
  };

  if (!akademiyaUserId || !studentNo || !password) {
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

    await saveAkademiyaUser({
      akademiyaUserId,
      akademiyaEmail,
      studentNo,
      password,
      role: gmcRole ?? 0,
    });

    const sessionId = `ak_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessions.set(sessionId, { cookies, studentNo, loginTime: new Date().toISOString() });

    console.log(`[Akademiya 연동 완료] ${akademiyaEmail} → ${studentNo} (role ${gmcRole ?? 0})`);
    return res.json({ success: true, sessionId, studentNo, studentName, role: gmcRole ?? 0, needsPrivacyConsent: true, needsTermsConsent: true });

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

  const { date: targetDate, suspended } = await getTargetDateInfo();
  const weekend = isWeekend();
  const existing = await getScheduleAt(time, targetDate);
  if (existing && existing.student_no !== session.studentNo) {
    return res.json({ success: false, message: `${time}에 이미 다른 사용자가 등록되어 있습니다.` });
  }

  await registerSchedule(time, targetDate, sessionId, session.studentNo, timeCode, 'gmcauto', reason || '');
  console.log(`[스케줄] ${session.studentNo} → ${time} 등록 (${targetDate})`);
  const suffix = suspended ? ` (재개일: ${targetDate})` : weekend ? ` (다음 평일: ${targetDate})` : '';
  return res.json({ success: true, message: `${time}에 자동 신청이 등록되었습니다${suffix}.` });
});

app.post('/api/schedule/cancel', async (req: Request, res: Response) => {
  const { sessionId, time } = req.body as { sessionId: string; time: string };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });

  const { date: cancelDate } = await getTargetDateInfo();
  const result = await cancelSchedule(time, cancelDate, session.studentNo);
  if (result.changes === 0) return res.json({ success: false, message: '스케줄을 찾을 수 없습니다.' });
  return res.json({ success: true, message: `${time} 해제 완료` });
});

app.get('/api/schedule/status', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });

  const { date: target, suspended, suspendEnd, resumeDate } = await getTargetDateInfo();
  const weekend = isWeekend();
  const my = await getMySchedule(session.studentNo, target);
  const all = await getTodaySchedules(target);
  const takenSlots = all.map(e => e.time);

  let mySchedule = null;
  if (my) {
    mySchedule = {
      time: my.time,
      timeCode: my.time_code,
      teacherId: my.teacher_id,
      reason: my.reason,
      executed: !!my.executed,
      result: my.executed ? { success: !!my.result_ok, message: my.result_msg } : null,
    };
  }

  return res.json({ success: true, mySchedule, takenSlots, targetDate: target, isWeekend: weekend, suspended, suspendEnd, resumeDate });
});

// ========== 관리자 API ==========

app.get('/api/admin/stats', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const role = await getUserRole(session.studentNo);
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
  const role = await getUserRole(session.studentNo);
  if (role < 3) return res.status(403).json({ success: false, message: '권한 없음 (권한 3 필요)' });

  const deleted = await deleteFailedStats({ grade:grade||null, cls:cls||null, dateFrom:dateFrom||null, dateTo:dateTo||null });
  console.log(`[관리자] ${session.studentNo} 실패 기록 ${deleted}건 삭제`);
  return res.json({ success: true, deleted });
});

app.get('/api/admin/users', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const role = await getUserRole(session.studentNo);
  if (role < 3) return res.status(403).json({ success: false, message: '권한 없음' });

  const users = await getAllCredentials();
  return res.json({ success: true, users });
});

app.post('/api/admin/users/role', async (req: Request, res: Response) => {
  const { sessionId, studentNo, role } = req.body as { sessionId: string; studentNo: string; role: number };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const myRole = await getUserRole(session.studentNo);
  if (myRole < 3) return res.status(403).json({ success: false, message: '권한 없음' });

  if (!studentNo) return res.json({ success: false, message: '학번을 입력하세요.' });
  const newRole = parseInt(String(role), 10);
  if (isNaN(newRole) || newRole < 0 || newRole > 3) {
    return res.json({ success: false, message: '유효하지 않은 권한 값입니다.' });
  }
  if (studentNo === session.studentNo) {
    return res.json({ success: false, message: '자신의 권한은 변경할 수 없습니다.' });
  }

  await setUserRole(studentNo, newRole);
  console.log(`[관리자] ${session.studentNo} → ${studentNo} 권한 ${newRole} 설정`);
  return res.json({ success: true, message: `${studentNo} 권한이 ${newRole}으로 설정되었습니다.` });
});

// ========== GMC PASS 중단 기간 API ==========

app.get('/api/admin/suspend', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const role = await getUserRole(session.studentNo);
  if (role < 3) return res.status(403).json({ success: false, message: '권한 없음' });
  const periods = await getSuspendPeriods();
  return res.json({ success: true, periods });
});

app.post('/api/admin/suspend', async (req: Request, res: Response) => {
  const { sessionId, startDate, endDate } = req.body as { sessionId: string; startDate: string; endDate: string };
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ success: false, message: '세션 만료' });
  const role = await getUserRole(session.studentNo);
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
  const role = await getUserRole(session.studentNo);
  if (role < 3) return res.status(403).json({ success: false, message: '권한 없음' });
  const periodId = parseInt(req.params.id as string, 10);
  await deleteSuspendPeriod(periodId);
  console.log(`[관리자] ${session.studentNo} 중단 기간 ${periodId} 삭제`);
  return res.json({ success: true });
});

// ========== 통계 API ==========
app.get('/api/stats', async (req: Request, res: Response) => {
  const { date, limit } = req.query as Record<string, string | undefined>;
  if (date) {
    return res.json({ success: true, records: await getUsageStatsByDate(date) });
  } else {
    return res.json({ success: true, records: await getUsageStats(Number(limit) || 100) });
  }
});

app.get('/api/stats/summary', async (_req: Request, res: Response) => {
  return res.json({ success: true, summary: await getUsageStatsSummary() });
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

    const role = await getUserRole(session.studentNo);
    const dbUser = await getCredentials(session.studentNo);
    const privacyVer = dbUser ? await getPrivacyConsent(dbUser.id) : 0;
    const termsVer   = dbUser ? await getTermsConsent(dbUser.id)   : 0;
    return res.json({ valid: true, studentNo: session.studentNo, loginTime: session.loginTime, role,
      needsPrivacyConsent: privacyVer < GMC_PRIVACY_POLICY_VERSION,
      needsTermsConsent:   termsVer   < GMC_TERMS_OF_USE_VERSION });
  } catch (err) {
    console.warn(`[세션 확인] 네트워크 오류 (skip deep check): ${(err as Error).message}`);
    const role = await getUserRole(session.studentNo);
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
    const user = (session.akademiyaUserId ? await getByAkademiyaUserId(session.akademiyaUserId) : null)
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
    const user = (session.akademiyaUserId ? await getByAkademiyaUserId(session.akademiyaUserId) : null)
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

app.get('/api/debug/page', async (req: Request, res: Response) => {
  const session = sessions.get(req.query.sessionId as string);
  if (!session) return res.status(401).json({ error: '세션 없음' });
  try {
    const client = createClient();
    const r = await client.get(req.query.path as string, { headers: { 'Cookie': cookieStr(session.cookies) } });
    extractCookies(r).forEach(c => { session.cookies[c.name] = c.value; });
    return res.type('html').send(decodeResponse(r));
  } catch (e) { return res.status(500).send((e as Error).message); }
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
    .listen(PORT, '0.0.0.0', () => console.log(`\n🚀 GMCAuto 2 (HTTPS) → https://0.0.0.0:${PORT}\n`));
} else {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 GMCAuto 2 (HTTP) → http://0.0.0.0:${PORT}`);
    console.log(`   SSL 인증서 없음 → HTTP 모드\n`);
  });
}

// linkGoingHafsCredentials is imported but only used in future API; keep the import to avoid tree-shaking
void linkGoingHafsCredentials;
