import { useState, useEffect } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "akademiya_theme";

/** 초기 테마 결정: localStorage 저장값 → 브라우저 선호도 → dark */
function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* ignore */ }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/**
 * 라이트/다크 테마 훅.
 * - `document.documentElement`에 `data-theme` 속성을 설정해 CSS 변수 전환
 * - localStorage에 선택 값 저장
 * - 기본값: localStorage 저장값 → 브라우저 선호도 → dark
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch { /* ignore */ }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggle };
}
