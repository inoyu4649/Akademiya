// Akademiya / GMCAuto와 동일한 4개 언어 체계 (ko / en / ja / zh).
// 계정 언어를 알 수 없는 비로그인 사용자도 쓰는 앱이라 브라우저 로케일 감지를 기본으로 둔다.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ko from './locales/ko.json'
import en from './locales/en.json'
import ja from './locales/ja.json'
import zh from './locales/zh.json'

export const SUPPORTED_LANGS = ['ko', 'en', 'ja', 'zh'] as const
export type SupportedLang = (typeof SUPPORTED_LANGS)[number]

const STORAGE_KEY = 'pyde_lang'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
      ja: { translation: ja },
      zh: { translation: zh },
    },
    fallbackLng: 'ko',
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    nonExplicitSupportedLngs: true, // ko-KR → ko
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
  })

// CJKV 폰트 스택이 html[lang] 선택자에 걸려 있으므로 언어 전환 시 갱신해야 한다
// (Akademiya·GMCAuto와 동일한 관례)
function syncHtmlLang(lang: string) {
  document.documentElement.lang = lang.split('-')[0]
}
syncHtmlLang(i18n.language ?? 'ko')
i18n.on('languageChanged', syncHtmlLang)

export function setLanguage(lang: SupportedLang): void {
  void i18n.changeLanguage(lang)
}

export default i18n
