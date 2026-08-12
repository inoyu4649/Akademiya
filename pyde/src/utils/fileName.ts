// 파일명 규칙.
// ⚠️ Akademiya Cloud 백엔드(backend/src/routes/cloud.ts의 normalizeName)와 같은 규칙을
//    유지해야 한다. 여기서 통과시킨 이름이 서버에서 400으로 튕기면 사용자는 이유를 모른다.
//    제어문자·경로 구분자·윈도우 예약문자 금지, 앞뒤 공백/마침표 금지, 180자 이하.

export const NAME_MAX_LENGTH = 180

const FORBIDDEN_CHARS = /[\p{C}/\\:*?"<>|]/u

export type NameError = 'EMPTY' | 'TOO_LONG' | 'FORBIDDEN_CHARS' | 'EDGE_DOT_OR_SPACE'

export function validateFileName(raw: string): NameError | null {
  const name = raw.normalize('NFC')
  if (!name.trim()) return 'EMPTY'
  if (name.length > NAME_MAX_LENGTH) return 'TOO_LONG'
  if (FORBIDDEN_CHARS.test(name)) return 'FORBIDDEN_CHARS'
  // 서버는 앞뒤 공백/마침표를 거부한다(".." 같은 트릭 차단)
  if (name !== name.trim()) return 'EDGE_DOT_OR_SPACE'
  if (name.startsWith('.') || name.endsWith('.')) return 'EDGE_DOT_OR_SPACE'
  return null
}

/** 확장자(소문자, 점 포함). 없으면 빈 문자열 */
export function extensionOf(name: string): string {
  const match = /\.[^.]+$/.exec(name)
  return match ? match[0].toLowerCase() : ''
}
