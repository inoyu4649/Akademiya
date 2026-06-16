import { useState, useEffect } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "akademiya_theme";
const MANUAL_KEY = "akademiya_theme_manual";

function getSystemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function isManualOverride(): boolean {
  try {
    return localStorage.getItem(MANUAL_KEY) === "1";
  } catch {
    return false;
  }
}

/** 초기 테마 결정: 사용자가 직접 고른 값(수동 전환 이력 있음) → 브라우저/PWA 선호도 → dark */
function getInitialTheme(): Theme {
  try {
    if (isManualOverride()) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "dark" || saved === "light") return saved;
    }
  } catch { /* ignore */ }
  return getSystemTheme();
}

/**
 * 라이트/다크 테마 훅.
 * - `document.documentElement`에 `data-theme` 속성을 설정해 CSS 변수 전환
 * - 사용자가 토글 버튼으로 직접 전환하기 전까지는 브라우저/PWA의 `prefers-color-scheme`를
 *   실시간으로 따라감 (OS/브라우저 테마가 바뀌면 즉시 반영)
 * - 한 번이라도 수동 전환하면 그 값을 localStorage에 고정 저장하고, 이후로는 시스템 변경을 따라가지 않음
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 수동 전환 이력이 없으면 시스템 테마 변경을 실시간으로 반영
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const handler = () => {
      if (!isManualOverride()) setTheme(getSystemTheme());
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = () => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
        localStorage.setItem(MANUAL_KEY, "1");
      } catch { /* ignore */ }
      return next;
    });
  };

  return { theme, toggle };
}
