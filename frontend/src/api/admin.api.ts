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

export const adminApi = {
  getOrgs: () => client.get<{ orgs: PendingOrg[] }>("/admin/orgs"),
  approveOrg: (id: number) => client.post(`/admin/orgs/${id}/approve`),
  rejectOrg: (id: number) => client.post(`/admin/orgs/${id}/reject`),
};
