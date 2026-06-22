import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  serverUrl:    string;
  setServerUrl: (url: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl:    "",   // 비어 있으면 현재 페이지와 같은 출처 (Local Server에서 서빙 시)
      setServerUrl: (serverUrl) => set({ serverUrl }),
    }),
    { name: "akashaalt-settings" }
  )
);
