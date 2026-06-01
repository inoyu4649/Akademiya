import client from "./client";

export interface Org {
  id: number;
  name: string;
  code: string;
  status: "pending" | "approved" | "rejected";
  timezone: string;
  permission?: number;
  google_domain?: string | null;
}

export interface OrgMember {
  id: number;
  display_name: string;
  email: string;
  permission: number;
  joined_at: string;
}

export interface OrgJoinRequest {
  id: number;
  user_id: number;
  display_name: string;
  email: string;
  created_at: string;
}

export const orgApi = {
  apply: (data: { name: string; code: string; google_domain?: string; timezone: string }) =>
    client.post("/orgs/apply", data),

  my: () => client.get<{ orgs: Org[]; applications: Org[] }>("/orgs/my"),

  join: (code: string) =>
    client.post<{ message: string; orgName: string }>("/orgs/join", { code }),

  detail: (id: number) =>
    client.get<{ org: Org; members: OrgMember[]; myPermission: number }>(`/orgs/${id}`),

  joinRequests: (id: number) =>
    client.get<{ requests: OrgJoinRequest[] }>(`/orgs/${id}/join-requests`),

  approveRequest: (orgId: number, requestId: number) =>
    client.post(`/orgs/${orgId}/join-requests/${requestId}/approve`),

  rejectRequest: (orgId: number, requestId: number) =>
    client.post(`/orgs/${orgId}/join-requests/${requestId}/reject`),

  updatePermission: (orgId: number, userId: number, permission: number) =>
    client.patch(`/orgs/${orgId}/members/${userId}/permission`, { permission }),
};
