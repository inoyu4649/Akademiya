// ============================================================================
//  Monaco 로딩 설정 — 번들이 아니라 CDN에서 가져온다
// ============================================================================
//  왜 번들하지 않나:
//   · Monaco를 번들에 넣으면 우리 서버(OCI 무료 egress)가 접속자마다 1MB 안팎을
//     내보내야 한다. PyDe는 이미 Pyodide 때문에 jsDelivr에 의존하므로, 에디터까지
//     같은 CDN에서 받는 편이 의존성은 늘리지 않으면서 서버 전송량만 줄인다.
//   · @monaco-editor/react의 기본 동작이 원래 이 AMD 로더 방식이다. 다만 기본값은
//     버전이 떠 있으므로 여기서 **버전을 고정**한다(어느 날 갑자기 바뀌면 캐시가
//     통째로 무효화되고 동작도 달라진다).
import { loader } from '@monaco-editor/react'

/** package.json의 devDependency(monaco-editor)와 같은 버전으로 유지할 것 — 타입과 런타임 불일치 방지 */
export const MONACO_VERSION = '0.52.2'

export function configureMonacoLoader(): void {
  loader.config({
    paths: { vs: `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs` },
    // Monaco 자체 UI 문자열은 영어로 둔다. 한국어 로케일 번들을 추가로 받아야 하는데
    // 학생이 보는 문자열은 대부분 우리 UI라 이득이 적다.
  })
}
