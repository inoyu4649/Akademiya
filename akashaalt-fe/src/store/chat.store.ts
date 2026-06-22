import { create } from "zustand";
import { fetchModels, streamInfer, type ModelInfo } from "../api/chat.api";
import { useSettingsStore } from "./settings.store";
import { v4 as uuid } from "uuid";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id:      string;
  role:    "user" | "assistant";
  content: string;
  modelId?: string;
}

export interface InMemoryConv {
  id:        string;
  title:     string;
  messages:  ChatMessage[];
  updatedAt: Date;
}

// ── State ──────────────────────────────────────────────────────────────────────

interface ChatState {
  sidebarOpen:      boolean;
  conversations:    InMemoryConv[];
  currentConvId:    string | null;
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
  loadConversation:   (id: string) => void;
  startNewChat:       () => void;
  sendMessage:        (content: string) => Promise<void>;
  deleteConversation: (id: string) => void;

  // Derived helpers
  currentMessages:    () => ChatMessage[];
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>((set, get) => ({
  sidebarOpen:      true,
  conversations:    [],
  currentConvId:    null,
  isStreaming:      false,
  streamingContent: "",
  streamError:      null,
  _streamAbort:     null,
  selectedModel:    "",
  availableModels:  [],

  toggleSidebar:  () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setModel:       (modelId) => set({ selectedModel: modelId }),

  currentMessages: () => {
    const { conversations, currentConvId } = get();
    if (!currentConvId) return [];
    return conversations.find((c) => c.id === currentConvId)?.messages ?? [];
  },

  init: async () => {
    const { serverUrl } = useSettingsStore.getState();
    try {
      const models = await fetchModels(serverUrl);
      const first  = models[0]?.modelId ?? "";
      set((s) => ({ availableModels: models, selectedModel: s.selectedModel || first }));
    } catch {
      set({ availableModels: [], streamError: null });
    }
  },

  loadConversation: (id) => {
    get()._streamAbort?.abort();
    set({ currentConvId: id, streamError: null, streamingContent: "", isStreaming: false, _streamAbort: null });
  },

  startNewChat: () => {
    get()._streamAbort?.abort();
    set({ currentConvId: null, streamError: null, streamingContent: "", isStreaming: false, _streamAbort: null });
  },

  deleteConversation: (id) => {
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      ...(s.currentConvId === id ? { currentConvId: null } : {}),
    }));
  },

  sendMessage: async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || get().isStreaming) return;

    const { selectedModel, currentConvId } = get();
    const { serverUrl } = useSettingsStore.getState();
    const modelId = selectedModel || get().availableModels[0]?.modelId;
    if (!modelId) { set({ streamError: "MODEL_NOT_FOUND" }); return; }

    // ── 대화 세션 결정 ──────────────────────────────────────────────────────
    let convId = currentConvId;
    if (!convId) {
      convId = uuid();
      const newConv: InMemoryConv = {
        id:        convId,
        title:     trimmed.slice(0, 60),
        messages:  [],
        updatedAt: new Date(),
      };
      set((s) => ({ conversations: [newConv, ...s.conversations], currentConvId: convId }));
    }

    // ── 현재 메시지 히스토리 + 새 메시지 ────────────────────────────────────
    const prevMessages = get().conversations.find((c) => c.id === convId)?.messages ?? [];
    const userMsg: ChatMessage = { id: uuid(), role: "user", content: trimmed };

    // 낙관적 업데이트
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId
          ? { ...c, messages: [...c.messages, userMsg], updatedAt: new Date() }
          : c
      ),
      isStreaming:      true,
      streamingContent: "",
      streamError:      null,
    }));

    const allMessages = [
      ...prevMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: trimmed },
    ];

    const ac = new AbortController();
    set({ _streamAbort: ac });

    // ── fetch ──────────────────────────────────────────────────────────────
    let response: Response;
    try {
      response = await streamInfer(serverUrl, { modelId, messages: allMessages }, ac.signal);
    } catch {
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, messages: c.messages.slice(0, -1) } : c
        ),
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
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, messages: c.messages.slice(0, -1) } : c
        ),
        isStreaming: false,
        streamError: errCode,
        _streamAbort: null,
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
              conversations: s.conversations.map((c) =>
                c.id === convId ? { ...c, messages: c.messages.slice(0, -1) } : c
              ),
              streamingContent: "", isStreaming: false, _streamAbort: null,
              streamError: event.error ?? "INFERENCE_FAILED",
            }));
            reader.releaseLock();
            return;
          }
        }
      }

      // 어시스턴트 메시지 저장
      const assistantMsg: ChatMessage = { id: uuid(), role: "assistant", content: accumulated, modelId };
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, messages: [...c.messages, assistantMsg], updatedAt: new Date() } : c
        ),
        streamingContent: "",
        isStreaming:      false,
        _streamAbort:     null,
      }));
    } catch (err) {
      const isAbort = (err as Error).name === "AbortError";
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, messages: c.messages.slice(0, -1) } : c
        ),
        streamingContent: "", isStreaming: false, _streamAbort: null,
        streamError: isAbort ? null : "STREAM_ERROR",
      }));
    } finally {
      reader.releaseLock();
    }
  },
}));
