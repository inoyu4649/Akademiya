import { create } from "zustand";
import { setLanguage, type SupportedLang } from "../i18n";

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  country: string | null;
  phone: string | null;
  language: string | null;
  role: "user" | "admin";
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  initialized: boolean;
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  updateUser: (updates: Partial<AuthUser>) => void;
  setInitialized: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  initialized: false,
  setAuth: (user, accessToken) => {
    if (user.language) {
      setLanguage(user.language as SupportedLang);
    }
    set({ user, accessToken, initialized: true });
  },
  clearAuth: () => set({ user: null, accessToken: null }),
  updateUser: (updates) =>
    set((state) => {
      if (updates.language) {
        setLanguage(updates.language as SupportedLang);
      }
      return { user: state.user ? { ...state.user, ...updates } : null };
    }),
  setInitialized: (v) => set({ initialized: v }),
}));
