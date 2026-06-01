import client from "./client";
import axios from "axios";
import type { AuthUser } from "../store/auth.store";

interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export const authApi = {
  register: (data: {
    email: string;
    password: string;
    displayName: string;
    country: string;
    phone: string;
  }) => client.post<AuthResponse>("/auth/register", data),

  login: (data: { email: string; password: string }) =>
    client.post<AuthResponse>("/auth/login", data),

  logout: () => client.post("/auth/logout"),

  me: () => client.get<AuthUser>("/auth/me"),

  forgotPassword: (email: string) =>
    client.post("/auth/forgot-password", { email }),

  resetPassword: (data: { email: string; code: string; newPassword: string }) =>
    client.post("/auth/reset-password", data),

  updateProfile: (data: {
    currentPassword?: string;
    displayName?: string;
    country?: string;
    phone?: string;
    newPassword?: string;
  }) => client.patch<AuthUser>("/auth/profile", data),

  oauthExchange: (code: string) =>
    axios.post<AuthResponse>("/api/auth/oauth-exchange", { code }, { withCredentials: true }),

  // 페이지 리프레시 시 세션 복원용 (인터셉터 없이 직접 호출)
  refresh: () =>
    axios.post<AuthResponse>("/api/auth/refresh", {}, { withCredentials: true }),
};
