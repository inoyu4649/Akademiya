// 휴대폰 판별 — Pyodide는 수십 MB를 내려받는다. 예전엔 휴대폰을 아예 막았지만,
// 지금은 코드 보기/실행 자체는 허용하고 대신 **최초 접속 시 1회** 데이터 사용량 안내 +
// Wi-Fi 권장 모달을 띄운 뒤 사용자가 계속하기를 눌러야 다운로드(워커 부팅)가 시작된다.
// 태블릿(iPad, 안드로이드 태블릿)은 화면이 넓어 애초에 이 안내 대상이 아니다.

/** 안내를 이미 확인했다는 표시. 값 자체는 의미 없고 키 존재 여부만 본다. */
const MOBILE_DATA_ACK_KEY = 'pyde_mobile_data_ack'

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

/**
 * 이 세션이 휴대폰인지 — UI 분기용으로 한 번만 계산해 고정한다.
 * 화면 회전으로 폭이 바뀌어도 기기 종류가 바뀌는 건 아니므로 재평가하지 않는다
 * (EditorToolbar의 IS_MAC과 같은 방식).
 */
export const IS_MOBILE = isMobileDevice()

/** 휴대폰이면서 아직 데이터 사용량 안내를 확인한 적이 없으면 true */
export function needsMobileDataNotice(): boolean {
  if (!isMobileDevice()) return false
  try {
    return localStorage.getItem(MOBILE_DATA_ACK_KEY) !== '1'
  } catch {
    // 프라이빗 모드 등으로 localStorage 접근이 막히면 매번 안내하는 쪽이 안전하다
    return true
  }
}

/** 안내 모달에서 "계속"을 눌렀을 때 호출 — 이후 접속부터는 다시 뜨지 않는다 */
export function acknowledgeMobileDataNotice(): void {
  try {
    localStorage.setItem(MOBILE_DATA_ACK_KEY, '1')
  } catch {
    // 저장에 실패해도 이번 세션 진행 자체는 막지 않는다(호출자가 상태를 별도로 넘긴다)
  }
}
