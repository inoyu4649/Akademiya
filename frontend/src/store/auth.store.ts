import { create } from "zustand";
import { setLanguage, countryToLang } from "../i18n";

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  country: string | null;
  phone: string | null;
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
    const lang = countryToLang(user.country);
    setLanguage(lang);
    set({ user, accessToken, initialized: true });
  },
  clearAuth: () => set({ user: null, accessToken: null }),
  updateUser: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),
  setInitialized: (v) => set({ initialized: v }),
}));
