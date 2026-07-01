// AI Provider 사전설정 모델 카탈로그 — 가격은 2026년 7월 2일 기준(100만 토큰당 USD)
// OpenRouter 목록을 기준으로 하며, OpenAI/Gemini/Anthropic 직접 연동 목록은
// 같은 모델을 vendor별로 필터링해 provider 고유 ID(접두사 없음)로 사용한다.

export type AiProvider = "openrouter" | "openai" | "gemini" | "anthropic";
export type Vendor = "openai" | "google" | "anthropic" | "deepseek" | "qwen" | "sakana" | "z-ai";

export interface CatalogModel {
  /** OpenRouter에서 사용하는 ID (vendor 접두사 포함) */
  openrouterId: string;
  /** 각 vendor 직접 연동 API에서 사용하는 네이티브 모델 ID (접두사 없음) */
  nativeId: string;
  displayName: string;
  vendor: Vendor;
  /** $ / 100만 토큰 (입력) */
  priceIn: number;
  /** $ / 100만 토큰 (출력) */
  priceOut: number;
}

export const PRICE_AS_OF = "2026년 7월 2일";

export const MODEL_CATALOG: CatalogModel[] = [
  { openrouterId: "openai/gpt-5.5-pro",         nativeId: "gpt-5.5-pro",              displayName: "GPT-5.5 Pro",          vendor: "openai",    priceIn: 30,    priceOut: 180 },
  { openrouterId: "openai/gpt-5.5",             nativeId: "gpt-5.5",                  displayName: "GPT-5.5",              vendor: "openai",    priceIn: 5,     priceOut: 30 },
  { openrouterId: "openai/gpt-5.4",             nativeId: "gpt-5.4",                  displayName: "GPT-5.4",              vendor: "openai",    priceIn: 2.5,   priceOut: 15 },
  { openrouterId: "openai/gpt-5.4-mini",        nativeId: "gpt-5.4-mini",             displayName: "GPT-5.4-mini",         vendor: "openai",    priceIn: 0.75,  priceOut: 4.5 },
  { openrouterId: "google/gemini-3.1-pro-preview", nativeId: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro",      vendor: "google",    priceIn: 2,     priceOut: 12 },
  { openrouterId: "google/gemini-3.5-flash",    nativeId: "gemini-3.5-flash",         displayName: "Gemini 3.5 Flash",     vendor: "google",    priceIn: 1.5,   priceOut: 9 },
  { openrouterId: "google/gemini-3.1-flash-lite", nativeId: "gemini-3.1-flash-lite",  displayName: "Gemini 3.1 Flash Lite", vendor: "google",   priceIn: 0.25,  priceOut: 1.5 },
  { openrouterId: "anthropic/claude-fable-5",   nativeId: "claude-fable-5",           displayName: "Claude Fable 5",       vendor: "anthropic", priceIn: 10,    priceOut: 50 },
  { openrouterId: "anthropic/claude-opus-4.8",  nativeId: "claude-opus-4.8",          displayName: "Claude Opus 4.8",      vendor: "anthropic", priceIn: 5,     priceOut: 25 },
  { openrouterId: "anthropic/claude-sonnet-5",  nativeId: "claude-sonnet-5",          displayName: "Claude Sonnet 5",      vendor: "anthropic", priceIn: 2,     priceOut: 10 },
  { openrouterId: "anthropic/claude-haiku-4.5", nativeId: "claude-haiku-4.5",         displayName: "Claude Haiku 4.5",     vendor: "anthropic", priceIn: 1,     priceOut: 5 },
  { openrouterId: "deepseek/deepseek-v4-pro",   nativeId: "deepseek-v4-pro",          displayName: "DeepSeek V4 Pro",      vendor: "deepseek",  priceIn: 0.435, priceOut: 0.87 },
  { openrouterId: "deepseek/deepseek-v4-flash", nativeId: "deepseek-v4-flash",        displayName: "DeepSeek V4 Flash",    vendor: "deepseek",  priceIn: 0.09,  priceOut: 0.18 },
  { openrouterId: "deepseek/deepseek-r1-0528",  nativeId: "deepseek-r1-0528",         displayName: "DeepSeek R1 0528",     vendor: "deepseek",  priceIn: 0.50,  priceOut: 2.15 },
  { openrouterId: "qwen/qwen3.7-max",           nativeId: "qwen3.7-max",              displayName: "Qwen3.7 Max",          vendor: "qwen",      priceIn: 1.25,  priceOut: 3.75 },
  { openrouterId: "qwen/qwen3.7-plus",          nativeId: "qwen3.7-plus",             displayName: "Qwen3.7 Plus",         vendor: "qwen",      priceIn: 0.32,  priceOut: 1.28 },
  { openrouterId: "qwen/qwen3.6-flash",         nativeId: "qwen3.6-flash",            displayName: "Qwen3.6 Flash",        vendor: "qwen",      priceIn: 0.32,  priceOut: 1.28 },
  { openrouterId: "sakana/fugu-ultra",          nativeId: "fugu-ultra",               displayName: "Fugu Ultra",           vendor: "sakana",    priceIn: 5,     priceOut: 30 },
  { openrouterId: "z-ai/glm-5.2",               nativeId: "glm-5.2",                  displayName: "GLM 5.2",              vendor: "z-ai",      priceIn: 0.93,  priceOut: 3 },
  { openrouterId: "z-ai/glm-4.7",               nativeId: "glm-4.7",                  displayName: "GLM 4.7",              vendor: "z-ai",      priceIn: 0.40,  priceOut: 1.75 },
  { openrouterId: "z-ai/glm-4.7-flash",         nativeId: "glm-4.7-flash",            displayName: "GLM 4.7 Flash",        vendor: "z-ai",      priceIn: 0.06,  priceOut: 0.40 },
];

const VENDOR_BY_PROVIDER: Record<Exclude<AiProvider, "openrouter">, Vendor> = {
  openai: "openai",
  gemini: "google",
  anthropic: "anthropic",
};

/** provider별 사전설정 모델 목록 — OpenRouter는 vendor 접두사 포함 ID, 나머지는 네이티브 ID */
export function getPresetModels(provider: AiProvider): Array<{ id: string; displayName: string; vendor: Vendor; priceIn: number; priceOut: number }> {
  if (provider === "openrouter") {
    return MODEL_CATALOG.map((m) => ({ id: m.openrouterId, displayName: m.displayName, vendor: m.vendor, priceIn: m.priceIn, priceOut: m.priceOut }));
  }
  const vendor = VENDOR_BY_PROVIDER[provider];
  return MODEL_CATALOG.filter((m) => m.vendor === vendor)
    .map((m) => ({ id: m.nativeId, displayName: m.displayName, vendor: m.vendor, priceIn: m.priceIn, priceOut: m.priceOut }));
}

/** 선택된 modelId의 가격 정보 조회 (사전설정 목록에 없으면 null — 직접 입력한 모델) */
export function findModelPricing(provider: AiProvider, modelId: string) {
  const preset = getPresetModels(provider).find((m) => m.id === modelId);
  return preset ? { priceIn: preset.priceIn, priceOut: preset.priceOut, displayName: preset.displayName } : null;
}

export const VENDOR_LABELS: Record<Vendor, string> = {
  openai: "OpenAI",
  google: "Google",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  sakana: "Sakana AI",
  "z-ai": "Z.ai",
};
