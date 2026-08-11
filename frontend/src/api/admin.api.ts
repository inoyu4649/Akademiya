import client from "./client";
import type { OrgJoinRequest, OrgMember } from "./org.api";

export interface AdminOrg {
  id: number;
  name: string;
  code: string;
  status: string;
  timezone: string;
  google_domain: string | null;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  member_count: number;
  pending_count: number;
}

export interface OAuthQuotaRequest {
  id: number;
  requester_name: string;
  requester_email: string;
  requested_max_apps: number;
  current_max_apps: number;
  reason: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
}

export const adminApi = {
  // ── 조직 운영 (운영자 전용) ─────────────────────────────────────────
  getOrgs: () => client.get<{ orgs: AdminOrg[] }>("/admin/orgs"),

  createOrg: (data: { name: string; code: string; google_domain?: string; timezone?: string }) =>
    client.post<{ id: number }>("/admin/orgs", data),

  updateOrg: (id: number, data: { name?: string; google_domain?: string | null; timezone?: string }) =>
    client.patch(`/admin/orgs/${id}`, data),

  approveOrg: (id: number) => client.post(`/admin/orgs/${id}/approve`),

  deleteOrg: (id: number) => client.delete(`/admin/orgs/${id}`),

  getOrgMembers: (id: number) =>
    client.get<{ members: OrgMember[]; requests: OrgJoinRequest[] }>(`/admin/orgs/${id}/members`),

  // ── OAuth 공개 앱 한도 확장 요청 ────────────────────────────────────
  getOAuthQuotaRequests: (status = "pending") =>
    client.get<{ requests: OAuthQuotaRequest[] }>("/admin/oauth-quota-requests", { params: { status } }),
  approveOAuthQuotaRequest: (id: number, admin_note?: string) =>
    client.post(`/admin/oauth-quota-requests/${id}/approve`, { admin_note }),
  rejectOAuthQuotaRequest: (id: number, admin_note?: string) =>
    client.post(`/admin/oauth-quota-requests/${id}/reject`, { admin_note }),
};
