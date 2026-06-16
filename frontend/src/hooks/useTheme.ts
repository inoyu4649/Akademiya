import { useState, useEffect, useRef } from "react";

export type Theme = "dark" | "light";

function getSystemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/**
 * 라이트/다크 테마 훅.
 * - `document.documentElement`에 `data-theme` 속성을 설정해 CSS 변수 전환
 * - 재접속/새로고침 시에는 항상 브라우저/PWA의 `prefers-color-scheme`부터 시작
 *   (이전에 토글 버튼으로 고른 값은 저장하지 않으므로 무시됨)
 * - 페이지가 열려 있는 동안에는 토글 버튼으로 즉시 전환 가능하고, 수동 전환 후에는
 *   이번 세션에 한해 시스템 테마 변경을 따라가지 않음 (새로고침하면 다시 시스템 값부터 시작)
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getSystemTheme);
  // 메모리에만 유지되는 플래그 — 새로고침하면 자동으로 초기화됨
  const manualRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 수동 전환 전까지는 시스템 테마 변경을 실시간으로 반영
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const handler = () => {
      if (!manualRef.current) setTheme(getSystemTheme());
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = () => {
    manualRef.current = true;
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  return { theme, toggle };
}
