import type { Doc } from '../../hooks/useWorkspace'

/**
 * 파일이 "어디에 있는지".
 *   cloud — 내 Akademiya Cloud 파일 (소유자)
 *   link  — 남이 공유해 준 파일 (사본이 아니라 원본을 함께 보는 것)
 *   local — 이 브라우저에만 있는 파일
 *
 * 사본을 만들면 소유자가 나로 바뀌고 cloudId도 새로 생기므로 자동으로 cloud/local이 된다.
 */
export type TabLocation = 'cloud' | 'link' | 'local'

export function locationOf(doc: Doc): TabLocation {
  if (!doc.cloudId) return 'local'
  return doc.role === 'owner' ? 'cloud' : 'link'
}
