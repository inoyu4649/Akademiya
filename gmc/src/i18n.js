import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import ko from './locales/ko.json'
import en from './locales/en.json'
import ja from './locales/ja.json'
import zh from './locales/zh.json'

i18n
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
    supportedLngs: ['ko', 'en', 'ja', 'zh'],
    // "ko-KR", "en-US" 등 지역 코드 포함 언어를 기본 코드(ko, en)로만 로드
    load: 'languageOnly',
    // "ko-KR"이 지원 목록 'ko'와 매칭되도록 허용
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      // 감지 순서: localStorage 캐시 → 브라우저 언어 → html lang 속성
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'gmcauto_lang',
    },
  })

// html[lang] 동적 갱신 — CJKV 폰트 이체자 렌더링 최적화
i18n.on('languageChanged', (lng) => {
  const base = lng.split('-')[0]
  document.documentElement.setAttribute('lang', base)
})

export default i18n
