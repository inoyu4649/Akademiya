import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChatMode = "local" | "api";
export type AiProvider = "openrouter" | "openai" | "gemini" | "anthropic";

interface SettingsState {
  serverUrl:     string;
  setServerUrl:  (url: string) => void;
  mode:          ChatMode;
  setMode:       (mode: ChatMode) => void;
  apiProvider:   AiProvider;
  setApiProvider: (provider: AiProvider) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      serverUrl:      "",   // 비어 있으면 현재 페이지와 같은 출처 (Local Server에서 서빙 시)
      setServerUrl:   (serverUrl) => set({ serverUrl }),
      mode:           "local",
      setMode:        (mode) => set({ mode }),
      apiProvider:    "openrouter",
      setApiProvider: (apiProvider) => set({ apiProvider }),
    }),
    { name: "akashaalt-settings" }
  )
);
