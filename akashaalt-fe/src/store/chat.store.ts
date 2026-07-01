import { create } from "zustand";
import { fetchModels, streamInfer, streamInferApi, type ModelInfo } from "../api/chat.api";
import { getDefaultModel } from "../data/modelCatalog";
import { tryAutoUnlock } from "../lib/autoUnlock";
import { useSettingsStore } from "./settings.store";
import { useAuthStore } from "./auth.store";
import {
  listConversations, createConversation, deleteConversation,
  listMessages, saveMessage, type ConvSummary, type BackendMessage,
} from "../api/history.api";
import { v4 as uuid } from "uuid";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelId?: string;
}

// ── State ──────────────────────────────────────────────────────────────────────

interface ChatState {
  sidebarOpen:      boolean;
  conversations:    ConvSummary[];   // 사이드바 목록 (백엔드 DB)
  currentConvId:    number | null;
  loadedMessages:   ChatMessage[];   // 현재 대화 메시지 (백엔드 DB 로드)
  isStreaming:      boolean;
  streamingContent: string;
  streamError:      string | null;
  _streamAbort:     AbortController | null;
  selectedModel:    string;
  availableModels:  ModelInfo[];

  toggleSidebar:      () => void;
  setSidebarOpen:     (open: boolean) => void;
  setModel:           (modelId: string) => void;
  init:               () => Promise<void>;
  loadConversation:   (id: number) => Promise<void>;
  startNewChat:       () => void;
  sendMessage:        (content: string) => Promise<void>;
  deleteConversation: (id: number) => Promise<void>;
}

// 401 → 인증 초기화 후 로그인 페이지로
function handleUnauthorized() {
  useAuthStore.getState().clearAuth();
  window.location.href = "/auth/login";
}

function getToken(): string | null {
  return useAuthStore.getState().accessToken;
}

function toLocalMsg(m: BackendMessage): ChatMessage {
  return { id: String(m.id), role: m.role, content: m.content, modelId: m.model_id ?? undefined };
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => ({
  sidebarOpen:      true,
  conversations:    [],
  currentConvId:    null,
  loadedMessages:   [],
  isStreaming:      false,
  streamingContent: "",
  streamError:      null,
  _streamAbort:     null,
  selectedModel:    "",
  availableModels:  [],

  toggleSidebar:  () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setModel:       (modelId) => set({ selectedModel: modelId }),

  // 앱 초기화: 대화 목록 + 모델 목록 로드
  init: async () => {
    const token = getToken();
    if (!token) return;
    const { serverUrl, mode, apiProvider } = useSettingsStore.getState();

    // 대화 목록
    try {
      const convs = await listConversations(token);
      set({ conversations: convs });
    } catch (err) {
      if ((err as { status?: number }).status === 401) { handleUnauthorized(); return; }
    }

    // 모델 목록 — API 모드는 로컬 카탈로그(자체 UI)를 사용하므로 네트워크 호출 불필요
    if (mode === "api") {
      const def = getDefaultModel(apiProvider);
      set((s) => ({ availableModels: [], selectedModel: s.selectedModel || def }));
      void tryAutoUnlock(); // "기기에 저장" 옵션이 켜져 있으면 조용히 미리 언락 시도
      return;
    }
    try {
      if (serverUrl) {
        const models = await fetchModels(token, serverUrl);
        const first  = models[0]?.modelId ?? "";
        set((s) => ({ availableModels: models, selectedModel: s.selectedModel || first }));
      } else {
        set({ availableModels: [] });
      }
    } catch {
      set({ availableModels: [] });
    }
  },

  // 대화 전환: 메시지 로드
  loadConversation: async (id) => {
    get()._streamAbort?.abort();
    set({ currentConvId: id, loadedMessages: [], streamError: null, streamingContent: "", isStreaming: false, _streamAbort: null });
    const token = getToken();
    if (!token) return;
    try {
      const msgs = await listMessages(token, id);
      set({ loadedMessages: msgs.map(toLocalMsg) });
    } catch (err) {
      if ((err as { status?: number }).status === 401) handleUnauthorized();
    }
  },

  // 새 대화 시작 (DB 생성은 첫 메시지 전송 시)
  startNewChat: () => {
    get()._streamAbort?.abort();
    set({ currentConvId: null, loadedMessages: [], streamError: null, streamingContent: "", isStreaming: false, _streamAbort: null });
  },

  // 대화 삭제
  deleteConversation: async (id) => {
    const token = getToken();
    if (!token) return;
    try {
      await deleteConversation(token, id);
    } catch (err) {
      if ((err as { status?: number }).status === 401) { handleUnauthorized(); return; }
    }
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      ...(s.currentConvId === id ? { currentConvId: null, loadedMessages: [] } : {}),
    }));
  },

  // 메시지 전송: 생성 → 저장 → LLM 스트리밍 → 저장
  sendMessage: async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || get().isStreaming) return;

    const token = getToken();
    if (!token) { handleUnauthorized(); return; }

    const { serverUrl, mode, apiProvider } = useSettingsStore.getState();
    if (mode === "local" && !serverUrl) {
      set({ streamError: "SERVER_URL_MISSING" });
      return;
    }

    const { selectedModel, availableModels } = get();
    const modelId = selectedModel || availableModels[0]?.modelId;
    if (!modelId) { set({ streamError: "MODEL_NOT_FOUND" }); return; }

    // ── 대화 세션 결정 ──────────────────────────────────────────────────────
    let convId = get().currentConvId;
    if (!convId) {
      try {
        const convLabel = mode === "api" ? `api:${apiProvider}` : serverUrl;
        const conv = await createConversation(token, trimmed.slice(0, 60), convLabel, modelId);
        convId = conv.id;
        set((s) => ({ conversations: [conv, ...s.conversations], currentConvId: conv.id }));
      } catch (err) {
        if ((err as { status?: number }).status === 401) { handleUnauthorized(); return; }
        set({ streamError: "SERVER_ERROR" });
        return;
      }
    }

    // ── 사용자 메시지 낙관적 표시 ───────────────────────────────────────────
    const userMsg: ChatMessage = { id: uuid(), role: "user", content: trimmed };
    set((s) => ({
      loadedMessages: [...s.loadedMessages, userMsg],
      isStreaming: true, streamingContent: "", streamError: null,
    }));

    // ── 사용자 메시지 DB 저장 ───────────────────────────────────────────────
    try {
      await saveMessage(token, convId, "user", trimmed, modelId);
    } catch (err) {
      if ((err as { status?: number }).status === 401) { handleUnauthorized(); return; }
      // 저장 실패해도 스트리밍은 계속
    }

    // ── LLM 스트리밍 ────────────────────────────────────────────────────────
    const historyMsgs = get().loadedMessages.map((m) => ({ role: m.role, content: m.content }));

    const ac = new AbortController();
    set({ _streamAbort: ac });

    let response: Response;
    try {
      response = mode === "api"
        ? await streamInferApi(token, apiProvider, { modelId, messages: historyMsgs }, ac.signal)
        : await streamInfer(token, serverUrl, { modelId, messages: historyMsgs }, ac.signal);
    } catch {
      set((s) => ({
        loadedMessages: s.loadedMessages.slice(0, -1),
        isStreaming: false,
        streamError: ac.signal.aborted ? null : "NETWORK_ERROR",
        _streamAbort: null,
      }));
      return;
    }

    if (!response.ok) {
      let errCode = "UNKNOWN";
      try { const b = await response.json() as { error?: string }; errCode = b.error ?? "UNKNOWN"; } catch { /**/ }
      set((s) => ({
        loadedMessages: s.loadedMessages.slice(0, -1),
        isStreaming: false, streamError: errCode, _streamAbort: null,
      }));
      return;
    }

    // ── SSE 읽기 ──────────────────────────────────────────────────────────
    const reader  = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    try {
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let event: { type: string; content?: string; error?: string };
          try { event = JSON.parse(raw) as typeof event; } catch { continue; }

          if (event.type === "chunk" && event.content) {
            accumulated += event.content;
            set({ streamingContent: accumulated });
          } else if (event.type === "done") {
            break outer;
          } else if (event.type === "error") {
            set((s) => ({
              loadedMessages: s.loadedMessages.slice(0, -1),
              streamingContent: "", isStreaming: false, _streamAbort: null,
              streamError: event.error ?? "INFERENCE_FAILED",
            }));
            reader.releaseLock();
            return;
          }
        }
      }

      // ── 어시스턴트 메시지 저장 ──────────────────────────────────────────────
      const assistantMsg: ChatMessage = { id: uuid(), role: "assistant", content: accumulated, modelId };
      const now = new Date().toISOString();
      set((s) => ({
        loadedMessages: [...s.loadedMessages, assistantMsg],
        streamingContent: "", isStreaming: false, _streamAbort: null,
        // 대화 목록의 updated_at 업데이트
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, updated_at: now } : c
        ),
      }));

      // DB 저장 (비동기, 실패해도 무시)
      saveMessage(token, convId!, "assistant", accumulated, modelId).catch(() => {});
    } catch (err) {
      const isAbort = (err as Error).name === "AbortError";
      set((s) => ({
        loadedMessages: s.loadedMessages.slice(0, -1),
        streamingContent: "", isStreaming: false, _streamAbort: null,
        streamError: isAbort ? null : "STREAM_ERROR",
      }));
    } finally {
      reader.releaseLock();
    }
  },
}));
