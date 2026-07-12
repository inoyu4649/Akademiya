// ── 공유 타입 ─────────────────────────────────────────────────────────────────

export interface SessionData {
  sessionId: string;
  studentNo: string;
  studentName: string;
  akademiyaEmail?: string | null;
  role: number;
  developerMode?: boolean;
  needsPrivacyConsent: boolean;
  needsTermsConsent: boolean;
  /** 마지막으로 동의한 처리방침/약관 버전 (미동의 시 0) — 재동의 모달의 변경 요약 표시에 사용 */
  privacyConsentedVersion?: number;
  termsConsentedVersion?: number;
}

/** 알림 센터 항목 (서버 gmc_notifications 행과 1:1 대응) */
export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: number;
  created_at?: string;
}

/** GMCAuto API 키 (개발자 모드) — 시크릿/해시는 목록·상세 응답에 절대 포함되지 않는다 */
export interface ApiKeyItem {
  id: number;
  keyId: string;
  name: string;
  enabledScopes: string;
  requestCount: number;
  lastUsedAt: string | null;
  createdAt?: string;
}

export interface ScheduleInfo {
  time: string;
  timeCode: string;
  teacherId: string;
  reason: string | null;
  executed: boolean;
  result: { success: boolean; message: string | null } | null;
}

/** 예약 현황 타임라인 셀 상세 정보. studentNo는 권한 1 이상에서만 서버가 내려준다. */
export interface TakenSlotDetail {
  time: string;
  studentNo?: string;
}

export interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export interface PassRecord {
  date: string;
  type: string;
  time: string;
  confirmed: string;
  teacher: string;
}

export interface StatRecord {
  id: number;
  student_no: string;
  grade: string;
  class: string;
  number: string;
  time_code: string;
  schedule_time: string;
  apply_date: string;
  success: number | boolean;
  message: string | null;
  updated_at?: string;
  role?: number;
}

export interface UserRecord {
  student_no: string;
  role: number;
  updated_at?: string;
  akademiya_user_id?: number;
  akademiya_email?: string;
}
