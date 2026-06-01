import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ko from "./locales/ko.json";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";

export type SupportedLang = "ko" | "en" | "ja" | "zh";

const savedLang = localStorage.getItem("lang") as SupportedLang | null;
const browserLang: SupportedLang = navigator.language.startsWith("ko") ? "ko"
  : navigator.language.startsWith("ja") ? "ja"
  : navigator.language.startsWith("zh") ? "zh"
  : "en";

// html[lang] 동적 갱신 — CJKV 한자 이체자 정확 렌더링 목적
i18n.on("languageChanged", (lang: string) => {
  document.documentElement.lang = lang;
});

i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
    zh: { translation: zh },
    ja: { translation: ja },
  },
  lng: savedLang ?? browserLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// 초기 lang 속성 즉시 설정 (languageChanged 이벤트 발화 전 보장)
document.documentElement.lang = savedLang ?? browserLang;

export function setLanguage(lang: SupportedLang) {
  i18n.changeLanguage(lang);
  localStorage.setItem("lang", lang);
}

export function countryToLang(country: string | null | undefined): SupportedLang {
  if (country === "KR") return "ko";
  if (country === "JP") return "ja";
  if (country === "CN" || country === "TW" || country === "HK") return "zh";
  return "en";
}

export default i18n;
