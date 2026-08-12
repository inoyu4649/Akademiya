// ============================================================================
//  Pyodide 배포 설정
// ============================================================================
//  ⚠️ 버전은 반드시 고정한다. jsDelivr의 @latest 별칭은 캐시 수명이 짧고, 어느 날
//     갑자기 새 런타임으로 바뀌면 사용자 브라우저 캐시가 통째로 무효화된다.
//
//  Pyodide는 0.29.x 이후 **CPython 버전을 따라가는 새 버전 체계**로 바뀌었다
//  (0.29.4 → 314.0.x = CPython 3.14). npm dist-tag `latest`가 가리키는 값을 쓴다.
//  올릴 때는 아래 세 가지를 함께 확인할 것:
//    1) https://cdn.jsdelivr.net/pyodide/v<버전>/full/pyodide-lock.json 이 열리는지
//    2) 그 lock의 packages에 아래 PRELOAD_PACKAGES가 전부 있는지
//    3) info.python 이 기대한 파이썬 버전인지
export const PYODIDE_VERSION = '314.0.3'

/** 이 버전이 담고 있는 CPython 버전 — 부팅 화면과 터미널 배너에 표시한다 */
export const PYTHON_VERSION = '3.14.0'

export const PYODIDE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

/**
 * 첫 접속에 미리 받아둘 라이브러리.
 * 사용자가 요구한 5종이며, 의존성(numpy·pillow·fonttools 등 12개)은 pyodide-lock.json에서
 * 자동으로 펼친다 — 여기에 직접 나열하면 버전이 올라갈 때마다 어긋난다.
 */
export const PRELOAD_PACKAGES = ['numpy', 'pandas', 'matplotlib', 'scipy', 'scikit-learn'] as const

/** Matplotlib 한글 렌더링용 폰트 (PyDe 서버가 직접 서빙) */
export const KOREAN_FONT_URL = '/fonts/D2Coding-1.3.3.ttf'
export const KOREAN_FONT_FAMILY = 'D2Coding'

/**
 * 캐시 세대 표시. 이 값이 바뀌면 부팅 화면이 "새 버전을 받는 중"으로 안내한다.
 * (localStorage에 저장해 두고 비교 — 실제 파일 캐시는 브라우저 HTTP 캐시가 관리한다)
 */
export const RUNTIME_CACHE_KEY = 'pyde_runtime_version'
export const RUNTIME_CACHE_VALUE = `${PYODIDE_VERSION}+d2coding-1.3.3`
