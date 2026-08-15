// 휴대폰 판별 — Pyodide는 수십 MB를 내려받고 무거운 편집기 UI를 띄우는데,
// 휴대폰의 좁은 화면·터치 입력에서는 애초에 코딩이 성립하지 않는다. 그 다운로드가
// 시작되기 전에(usePyodideRuntime이 워커를 띄우기 전에) 걸러내야 트래픽 낭비도 막는다.
// 태블릿(iPad, 안드로이드 태블릿)은 화면이 넓어 코딩이 가능하므로 막지 않는다.

// 안드로이드는 휴대폰 UA에만 "Mobile" 토큰이 붙는다(태블릿은 빠진다).
const ANDROID_PHONE_RE = /Android.*Mobile/i
const OTHER_PHONE_UA_RE = /iPhone|iPod|Windows Phone/i

// iPadOS는 기본 UA가 데스크톱 Safari와 동일하다 — 태블릿이므로 허용 대상이다.
function isIpadOs(): boolean {
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function isMobileDevice(): boolean {
  if (isIpadOs()) return false
  if (OTHER_PHONE_UA_RE.test(navigator.userAgent)) return true
  if (ANDROID_PHONE_RE.test(navigator.userAgent)) return true
  // UA로 못 걸러낸 경우의 보조 판단 — 태블릿 최소 폭(768px) 미만 + 터치 위주 입력
  if (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 768) return true
  return false
}
