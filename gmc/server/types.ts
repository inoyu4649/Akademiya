import { RowDataPacket } from 'mysql2/promise';

// ── DB Row 타입 ──────────────────────────────────────────────────────────────

export interface GmcUserRow extends RowDataPacket {
  id: number;
  student_no: string | null;
  password: string | null;
  role: number;
  developer_mode: number;
  akademiya_user_id: number | null;
  akademiya_email: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationRow extends RowDataPacket {
  id: number;
  gmc_user_id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: number;
  created_at?: string;
}

export interface ApiKeyRow extends RowDataPacket {
  id: number;
  owner_gmc_user_id: number;
  key_id: string;
  key_secret_hash: string;
  name: string;
  enabled_scopes: string;
  request_count: number;
  last_used_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleRow extends RowDataPacket {
  time: string;
  date: string;
  session_id: string;
  student_no: string;
  time_code: string;
  teacher_id: string;
  reason: string | null;
  executed: number;
  result_ok: number | null;
  result_msg: string | null;
  registered_at: string;
  executed_at: string | null;
}

export interface RecurringScheduleRow extends RowDataPacket {
  id: number;
  student_no: string;
  time: string;
  time_code: string;
  teacher_id: string;
  reason: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RetryRow extends RowDataPacket {
  id: number;
  retry_at: number;
  student_no: string;
  time_code: string;
  reason: string | null;
  apply_date: string;
  origin_time: string;
  attempt: number;
  created_at?: number;
}

export interface UsageStatRow extends RowDataPacket {
  id: number;
  student_no: string;
  grade: string;
  class: string;
  number: string;
  teacher_id: string;
  time_code: string;
  schedule_time: string;
  apply_date: string;
  success: number;
  message: string | null;
  created_at?: string;
}

export interface ConsentRow extends RowDataPacket {
  version: number;
}

export interface RoleRow extends RowDataPacket {
  role: number;
}

export interface SuspendPeriodRow extends RowDataPacket {
  id: number;
  start_date: string;
  end_date: string;
  created_at?: string;
}

export interface PushSubscriptionRow extends RowDataPacket {
  id: number;
  gmc_user_id: number;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  created_at?: string;
  updated_at?: string;
}

export interface CountRow extends RowDataPacket {
  cnt: number;
}

export interface SummaryRow extends RowDataPacket {
  apply_date: string;
  total: number;
  success_count: number;
  fail_count: number;
}

// ── 서버 내부 타입 ────────────────────────────────────────────────────────────

export interface Session {
  cookies: Record<string, string>;
  studentNo: string;
  loginTime: string;
  akademiyaEmail?: string | null;
}

export interface SubmitPassResult {
  ok: boolean;
  msg: string;
  loginFailed: boolean;
}

export interface ParsedStudentNo {
  grade: string;
  class: string;
  number: string;
}
