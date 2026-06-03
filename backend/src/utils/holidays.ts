/**
 * 한국천문연구원 특일 정보 API — 공휴일 캐시 모듈 (Akademiya 백엔드용)
 * API: https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo
 * 실패 시 빈 배열 반환 (graceful fallback)
 */

const SERVICE_KEY =
  process.env.HOLIDAY_API_KEY ??
  "aa430448d5a4283c8281d9e5f88b53646ac45fe49a4c8d844916212a667d0aca";
const API_URL =
  "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

// 월별 캐시: 'YYYY-MM' → Set<'YYYY-MM-DD'>
const holidayCache = new Map<string, Set<string>>();

export async function fetchHolidaysForMonth(
  year: number,
  month: number
): Promise<Set<string>> {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  if (holidayCache.has(key)) return holidayCache.get(key)!;

  const holidays = new Set<string>();
  try {
    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      pageNo: "1",
      numOfRows: "50",
      solYear: String(year),
      solMonth: String(month).padStart(2, "0"),
    });

    const res = await fetch(`${API_URL}?${params}`, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json" },
    });

    const body = await res.json() as any;
    const header = body?.response?.header;

    if (header?.resultCode !== "00") {
      throw new Error(
        `API 오류 ${header?.resultCode ?? "?"}: ${header?.resultMsg ?? ""}`
      );
    }

    const itemsRaw = body?.response?.body?.items?.item;
    if (itemsRaw) {
      const list = Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw];
      for (const item of list) {
        if (item.isHoliday !== "Y") continue;
        const raw = String(item.locdate);
        if (/^\d{8}$/.test(raw)) {
          holidays.add(
            `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
          );
        }
      }
    }

    holidayCache.set(key, holidays);
    console.log(
      `[공휴일] ${key}: ${holidays.size}개${
        holidays.size ? ` (${[...holidays].join(", ")})` : ""
      }`
    );
  } catch (err: any) {
    console.error(`[공휴일] ${key} 조회 실패: ${err.message}`);
    holidayCache.set(key, holidays);
  }
  return holidays;
}

/** 공휴일 목록을 배열로 반환 */
export async function getHolidays(
  year: number,
  month: number
): Promise<string[]> {
  const set = await fetchHolidaysForMonth(year, month);
  return [...set];
}

/** 서버 시작 시 이번달+다음달 미리 로드 */
export async function preloadHolidays(): Promise<void> {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  await fetchHolidaysForMonth(y, m);
  const next = new Date(y, m, 1);
  await fetchHolidaysForMonth(next.getFullYear(), next.getMonth() + 1);
}
