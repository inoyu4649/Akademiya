import client from "./client";

export interface ClassItem {
  id: number;
  name: string;
  code: string;
  org_id: number;
  org_name: string;
  org_code: string;
  status: "pending" | "approved" | "rejected";
  permission?: number;
}

export interface ClassMember {
  id: number;
  display_name: string;
  email: string;
  permission: number;
  joined_at: string;
}

export interface ClassJoinRequest {
  id: number;
  user_id: number;
  display_name: string;
  email: string;
  created_at: string;
}

export interface ClassDetail {
  id: number;
  name: string;
  code: string;
  org_id: number;
  org_name: string;
  org_code: string;
  status: string;
}

export interface ClassRequest {
  id: number;
  name: string;
  code: string;
  owner_name: string;
  owner_email: string;
  created_at: string;
}

export const classApi = {
  apply: (data: { org_id: number; name: string; code: string }) =>
    client.post("/classes/apply", data),

  my: () =>
    client.get<{ classes: ClassItem[]; applications: ClassItem[] }>("/classes/my"),

  join: (code: string) =>
    client.post<{ message: string; className: string }>("/classes/join", { code }),

  detail: (id: number) =>
    client.get<{ class: ClassDetail; members: ClassMember[]; myPermission: number }>(
      `/classes/${id}`
    ),

  joinRequests: (id: number) =>
    client.get<{ requests: ClassJoinRequest[] }>(`/classes/${id}/join-requests`),

  approveRequest: (classId: number, requestId: number) =>
    client.post(`/classes/${classId}/join-requests/${requestId}/approve`),

  rejectRequest: (classId: number, requestId: number) =>
    client.post(`/classes/${classId}/join-requests/${requestId}/reject`),

  updatePermission: (classId: number, userId: number, permission: number) =>
    client.patch(`/classes/${classId}/members/${userId}/permission`, { permission }),

  leave: (classId: number) =>
    client.delete(`/classes/${classId}/leave`),

  // Org admin: class creation requests
  orgClassRequests: (orgId: number) =>
    client.get<{ requests: ClassRequest[] }>(`/orgs/${orgId}/class-requests`),

  approveClassRequest: (orgId: number, classId: number) =>
    client.post(`/orgs/${orgId}/class-requests/${classId}/approve`),

  rejectClassRequest: (orgId: number, classId: number) =>
    client.post(`/orgs/${orgId}/class-requests/${classId}/reject`),
};
