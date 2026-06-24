import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AkashaUser {
  id: number;
  email: string;
  displayName: string;
  role: "user" | "admin";
}

interface AuthState {
  user: AkashaUser | null;
  accessToken: string | null;
  setAuth: (user: AkashaUser, token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (user, accessToken) => set({ user, accessToken }),
      clearAuth: () => set({ user: null, accessToken: null }),
    }),
    { name: "akasha-auth" }
  )
);
