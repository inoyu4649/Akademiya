import client from "./client";

export interface PendingOrg {
  id: number;
  name: string;
  code: string;
  status: string;
  timezone: string;
  google_domain: string | null;
  created_at: string;
  owner_id: number;
  owner_name: string;
  owner_email: string;
}

export interface LimitRequest {
  id: number;
  assignment_id: number;
  assignment_title: string;
  class_name: string;
  requester_name: string;
  requester_email: string;
  requested_max_files: number;
  requested_max_size_mb: number;
  current_max_files: number;
  current_max_size_mb: number;
  reason: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
}

export const adminApi = {
  getOrgs: () => client.get<{ orgs: PendingOrg[] }>("/admin/orgs"),
  approveOrg: (id: number) => client.post(`/admin/orgs/${id}/approve`),
  rejectOrg: (id: number) => client.post(`/admin/orgs/${id}/reject`),

  getLimitRequests: (status = "pending") =>
    client.get<{ requests: LimitRequest[] }>("/admin/limit-requests", { params: { status } }),
  approveLimitRequest: (id: number, admin_note?: string) =>
    client.post(`/admin/limit-requests/${id}/approve`, { admin_note }),
  rejectLimitRequest: (id: number, admin_note?: string) =>
    client.post(`/admin/limit-requests/${id}/reject`, { admin_note }),
};
