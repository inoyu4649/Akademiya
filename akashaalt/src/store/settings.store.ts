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
  // "기기에 저장(LocalStorage)" — 켜져 있으면 AkashaAlt API 비밀번호를 이 기기의
  // 브라우저 LocalStorage에 평문으로 저장해 매번 입력하지 않아도 자동 언락한다.
  savePasswordLocally:    boolean;
  setSavePasswordLocally: (v: boolean) => void;
  savedVaultPassword:     string | null;
  setSavedVaultPassword:  (password: string | null) => void;
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

      savePasswordLocally:    false,
      setSavePasswordLocally: (savePasswordLocally) => set({ savePasswordLocally }),
      savedVaultPassword:     null,
      setSavedVaultPassword:  (savedVaultPassword) => set({ savedVaultPassword }),
    }),
    { name: "akashaalt-settings" }
  )
);
