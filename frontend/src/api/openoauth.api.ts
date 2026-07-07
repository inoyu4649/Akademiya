import client from "./client";

export type LoginMeans = "akademiya" | "google" | "both";
export type ScopeRange = "all" | "org" | "class" | "google_workspace";
// 필수 scope(이름·이메일)는 항상 부여되며 설정 대상이 아니다.
// 선택 scope만 개발자 화면 체크박스로 켜고 끌 수 있다.
export type OptionalScope = "picture" | "org_membership" | "class_membership";

export interface OAuthApp {
  id: number;
  codeName: string;
  displayName: string;
  mainSiteUrl: string;
  loginMeans: LoginMeans;
  scopeRange: ScopeRange;
  scopeOrgId: number | null;
  scopeClassId: number | null;
  scopeGoogleDomain: string | null;
  enabledScopes: OptionalScope[];
  clientId: string;
  createdAt: string;
}

export interface OAuthAppOrigin {
  id: number;
  origin: string;
}

export interface OAuthAppCreatedSecret {
  id: number;
  clientId: string;
  clientSecret: string;
  codeName: string;
}

export interface OAuthAppCreate {
  codeName: string;
  displayName: string;
  mainSiteUrl: string;
  loginMeans: LoginMeans;
  scopeRange: ScopeRange;
  scopeOrgId?: number;
  scopeClassId?: number;
  scopeGoogleDomain?: string;
  enabledScopes?: OptionalScope[];
}

export interface OAuthAppUpdate {
  displayName?: string;
  mainSiteUrl?: string;
  loginMeans?: LoginMeans;
  scopeRange?: ScopeRange;
  scopeOrgId?: number | null;
  scopeClassId?: number | null;
  scopeGoogleDomain?: string | null;
  enabledScopes?: OptionalScope[];
}

export interface OAuthStatsSeriesPoint {
  date: string;
  requests: number;
  users: number;
}

export interface OAuthStats {
  uniqueUsers: number;
  requestCount: number;
  series: OAuthStatsSeriesPoint[];
}

export interface OAuthBan {
  user_id: number;
  email: string;
  display_name: string;
  reason: string | null;
  banned_at: string;
}

export interface OAuthUserSearchResult {
  id: number;
  email: string;
  display_name: string;
}

export interface OAuthAppQuota {
  used: number;
  max: number;
}

export interface AuthorizeInfo {
  clientId: string;
  displayName: string;
  mainSiteUrl: string;
  loginMeans: LoginMeans;
  scopeRange: ScopeRange;
  scopeOrg: { name: string; code: string } | null;
  scopeClass: { name: string; code: string } | null;
  scopeGoogleDomain: string | null;
  enabledScopes: OptionalScope[];
}

export const openoauthApi = {
  // ── 앱 관리 ──────────────────────────────────────────────────────────
  listApps: () => client.get<{ apps: OAuthApp[] }>("/openoauth/apps"),

  createApp: (data: OAuthAppCreate) =>
    client.post<OAuthAppCreatedSecret>("/openoauth/apps", data),

  // ── 공개(Public) 앱 개수 한도 ────────────────────────────────────────
  getQuota: () => client.get<OAuthAppQuota>("/openoauth/apps/quota"),

  requestQuota: (requestedMaxApps: number, reason?: string) =>
    client.post("/openoauth/quota-requests", { requestedMaxApps, reason }),

  getApp: (id: number) =>
    client.get<{ app: OAuthApp; origins: OAuthAppOrigin[] }>(`/openoauth/apps/${id}`),

  updateApp: (id: number, data: OAuthAppUpdate) =>
    client.patch<{ app: OAuthApp }>(`/openoauth/apps/${id}`, data),

  deleteApp: (id: number) => client.delete(`/openoauth/apps/${id}`),

  regenerateSecret: (id: number) =>
    client.post<{ clientSecret: string }>(`/openoauth/apps/${id}/regenerate-secret`),

  addOrigin: (id: number, origin: string) =>
    client.post<OAuthAppOrigin>(`/openoauth/apps/${id}/origins`, { origin }),

  removeOrigin: (id: number, originId: number) =>
    client.delete(`/openoauth/apps/${id}/origins/${originId}`),

  // ── 통계 ─────────────────────────────────────────────────────────────
  getStats: (id: number, period: "today" | "7d" | "30d" | "custom", from?: string, to?: string) =>
    client.get<OAuthStats>(`/openoauth/apps/${id}/stats`, { params: { period, from, to } }),

  // ── BAN ──────────────────────────────────────────────────────────────
  searchUsers: (id: number, q: string) =>
    client.get<{ users: OAuthUserSearchResult[] }>(`/openoauth/apps/${id}/user-search`, { params: { q } }),

  listBans: (id: number) => client.get<{ bans: OAuthBan[] }>(`/openoauth/apps/${id}/bans`),

  banUser: (id: number, userId: number, reason: string) =>
    client.post(`/openoauth/apps/${id}/bans`, { userId, reason }),

  unbanUser: (id: number, userId: number) =>
    client.delete(`/openoauth/apps/${id}/bans/${userId}`),

  // ── 제공자 (로그인 화면용) ───────────────────────────────────────────
  authorizeInfo: (clientId: string, redirectUri: string, scope: string) =>
    client.get<AuthorizeInfo>(
      "/openoauth/authorize-info",
      { params: { client_id: clientId, redirect_uri: redirectUri, scope } }
    ),

  authorize: (data: {
    clientId: string;
    redirectUri: string;
    state?: string;
    scope: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
  }) => client.post<{ redirectUrl: string }>("/openoauth/authorize", data),
};
