import client from "./client";

// 조직(Organization)은 v2.0부터 사용자에게 노출되는 기능이 아니다.
// GMCAuto 3처럼 "특정 학교 재학생만 로그인 가능"한 OAuth 클라이언트를 위한
// 소속 판별 수단이며, 사용자가 하는 일은 계정 센터에서의 가입/탈퇴뿐이다.
// 조직의 생성·수정·삭제는 관리자 API(admin.api.ts)에 있다.

export interface Org {
  id: number;
  name: string;
  code: string;
  status: "pending" | "approved" | "rejected";
  timezone: string;
  permission?: number;
  google_domain?: string | null;
}

export interface OrgPendingJoin {
  id: number;
  org_id: number;
  name: string;
  code: string;
  status: "pending";
  created_at: string;
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
  my: () => client.get<{ orgs: Org[]; pendingJoins: OrgPendingJoin[] }>("/orgs/my"),

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

  leave: (orgId: number) =>
    client.delete(`/orgs/${orgId}/leave`),

  kickMember: (orgId: number, userId: number, reason: string) =>
    client.delete(`/orgs/${orgId}/members/${userId}`, { data: { reason } }),
};
