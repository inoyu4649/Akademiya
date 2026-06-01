/**
 * 한국천문연구원 특일 정보 API — 공휴일 캐시 모듈
 * API: https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo
 * 실패 시 빈 Set 반환 (graceful fallback — 시스템 중단 없음)
 *
 * 주의: axios(Node.js)로 호출 시 서버가 JSON을 반환함 (브라우저/curl은 XML 반환).
 *       → JSON 파싱으로 처리. locdate 필드는 숫자 타입(20260501).
 */
import axios from 'axios';

const SERVICE_KEY = 'aa430448d5a4283c8281d9e5f88b53646ac45fe49a4c8d844916212a667d0aca';
const API_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

// 월별 캐시: 'YYYY-MM' → Set<'YYYY-MM-DD'>
const holidayCache = new Map();

/**
 * 특정 연월의 공휴일을 API에서 가져와 캐싱
 * 이미 캐시에 있으면 즉시 반환
 */
export async function fetchHolidaysForMonth(year, month) {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  if (holidayCache.has(key)) return holidayCache.get(key);

  const holidays = new Set();
  try {
    // responseType 지정 안 함 → axios가 JSON 자동 파싱
    const res = await axios.get(API_URL, {
      params: {
        serviceKey: SERVICE_KEY,
        pageNo: 1,
        numOfRows: 50,
        solYear: year,
        solMonth: String(month).padStart(2, '0'),
      },
      timeout: 10000,
    });

    // axios가 Content-Type에 따라 자동 파싱 → 항상 객체 or 문자열로 올 수 있음
    const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    const header = body?.response?.header;

    if (header?.resultCode !== '00') {
      throw new Error(`API 오류 ${header?.resultCode ?? '?'}: ${header?.resultMsg ?? JSON.stringify(body).slice(0, 100)}`);
    }

    // items.item: 단일 객체일 수도, 배열일 수도 있음
    const itemsRaw = body?.response?.body?.items?.item;
    if (itemsRaw) {
      const list = Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw];
      for (const item of list) {
        if (item.isHoliday !== 'Y') continue; // 기념일(N) 제외, 공휴일(Y)만
        const raw = String(item.locdate); // 숫자(20260501) → 문자열
        if (/^\d{8}$/.test(raw)) {
          holidays.add(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
        }
      }
    }

    holidayCache.set(key, holidays);
    console.log(`[공휴일] ${key}: ${holidays.size}개${holidays.size ? ` (${[...holidays].join(', ')})` : ' (없음)'}`);
  } catch (err) {
    console.error(`[공휴일] ${key} 조회 실패: ${err.message}`);
    holidayCache.set(key, holidays); // 빈 Set도 캐싱 — 반복 실패 방지
  }
  return holidays;
}

/**
 * 캐시에서 공휴일 여부 동기 조회
 * 캐시 미스(로드 전)이면 false 반환 — API 호출 없음
 */
export function isHolidayCached(dateStr) {
  const [y, m] = dateStr.split('-');
  const s = holidayCache.get(`${y}-${m}`);
  return !!(s && s.has(dateStr));
}

/**
 * 서버 시작 시 이번달 + 다음달 공휴일 미리 로드
 */
export async function preloadHolidays() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  await fetchHolidaysForMonth(y, m);
  // 다음달도 로드 (월말 자정 복사 대비)
  const next = new Date(y, m, 1);
  await fetchHolidaysForMonth(next.getFullYear(), next.getMonth() + 1);
}

/**
 * 특정 날짜의 달이 캐시에 없으면 fetch (자정 복사 전 호출용)
 */
export async function ensureMonthLoaded(dateStr) {
  const [y, m] = dateStr.split('-');
  const key = `${y}-${m}`;
  if (!holidayCache.has(key)) {
    await fetchHolidaysForMonth(parseInt(y), parseInt(m));
  }
}
