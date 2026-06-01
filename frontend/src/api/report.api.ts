import client from "./client";

export interface Report {
  id: number;
  reason: string;
  stage: "class_leader" | "org_admin" | "akademiya";
  status: "pending" | "resolved" | "escalated";
  created_at: string;
  updated_at: string;
  reporter_name?: string;
  reporter_email?: string;
  reported_name: string;
  reported_email: string;
  class_name?: string | null;
  org_name?: string | null;
  handler_note?: string | null;
  is_banned?: number;
}

export interface ReportEscalation {
  id: number;
  from_stage: string;
  to_stage: string;
  escalated_by_name: string;
  note?: string | null;
  created_at: string;
}

export const reportApi = {
  submit: (data: {
    reported_id: number;
    org_id: number;
    class_id?: number;
    reason: string;
  }) => client.post("/reports", data),

  mine: () => client.get<{ reports: Report[] }>("/reports/mine"),

  handle: () => client.get<{ reports: Report[] }>("/reports/handle"),

  detail: (id: number) =>
    client.get<{ report: Report; escalations: ReportEscalation[] }>(`/reports/${id}`),

  resolve: (id: number, note?: string) =>
    client.post(`/reports/${id}/resolve`, { note }),

  escalate: (id: number, note?: string) =>
    client.post(`/reports/${id}/escalate`, { note }),

  ban: (id: number, note?: string) =>
    client.post(`/reports/${id}/ban`, { note }),

  // Admin
  adminList: () => client.get<{ reports: Report[] }>("/admin/reports"),

  bannedUsers: () =>
    client.get<{ users: { id: number; email: string; display_name: string; banned_at: string; banned_reason: string }[] }>(
      "/admin/users/banned"
    ),

  unban: (userId: number) => client.post(`/admin/users/${userId}/unban`),
};
