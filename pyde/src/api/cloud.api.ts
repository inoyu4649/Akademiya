import { api } from './client'

/**
 * PyDe의 작업물이 들어가는 Akademiya Cloud 폴더.
 * ⚠️ Cloud는 PyDe 전용이 아니라 계정 단위 범용 저장소다(추후 독립 서비스로 확장 가능).
 *    그래서 우리 파일은 반드시 이 폴더 아래에만 만든다 — 루트를 어지럽히지 않는다.
 */
export const PYDE_FOLDER = 'PyDe Web'

export type ShareRole = 'viewer' | 'editor'
export type FileRole = 'owner' | ShareRole
export type LinkShare = 'none' | ShareRole

export interface CloudFileMeta {
  id: number
  folder: string
  name: string
  sizeBytes: number
  revision: number
  linkShare: LinkShare
  createdAt: string
  updatedAt: string
}

export interface SharedFileMeta extends CloudFileMeta {
  role: ShareRole
  ownerName: string
  ownerEmail: string
}

export interface FileListResponse {
  files: CloudFileMeta[]
  shared: SharedFileMeta[]
  usage: { files: number; bytes: number }
  limits: { maxFileBytes: number; maxTotalBytes: number; maxFiles: number }
}

export interface FileContentResponse {
  file: CloudFileMeta & { ownerName: string | null }
  content: string
  role: FileRole
}

export interface ShareListResponse {
  users: { id: number; role: ShareRole; user_id: number; display_name: string; email: string }[]
  orgs: { id: number; role: ShareRole; org_id: number; name: string; code: string }[]
  link: { share: LinkShare; token: string | null }
}

export interface PublicFileResponse {
  file: CloudFileMeta & { ownerName: string }
  content: string
  role: 'viewer'
  editableWhenSignedIn: boolean
}

export function listFiles(): Promise<FileListResponse> {
  return api<FileListResponse>(`/api/cloud/files?folder=${encodeURIComponent(PYDE_FOLDER)}`)
}

export function createFile(name: string, content: string): Promise<{ file: CloudFileMeta }> {
  return api('/api/cloud/files', {
    method: 'POST',
    body: { name, folder: PYDE_FOLDER, content },
  })
}

export function readFile(id: number, linkToken?: string | null): Promise<FileContentResponse> {
  return api<FileContentResponse>(`/api/cloud/files/${id}`, { linkToken })
}

/**
 * 저장. revision을 함께 보내면 낙관적 잠금이 걸려, 그 사이 다른 사람이 저장했으면
 * 409(REVISION_CONFLICT)가 온다. 사용자가 "덮어쓰기"를 고르면 revision 없이 다시 부른다.
 */
export function writeFile(
  id: number,
  content: string,
  revision: number | null,
  linkToken?: string | null
): Promise<{ revision: number; sizeBytes: number }> {
  return api(`/api/cloud/files/${id}`, {
    method: 'PUT',
    body: revision === null ? { content } : { content, revision },
    linkToken,
  })
}

export function renameFile(id: number, name: string): Promise<{ file: CloudFileMeta }> {
  return api(`/api/cloud/files/${id}`, { method: 'PATCH', body: { name } })
}

export function deleteFile(id: number): Promise<{ message: string }> {
  return api(`/api/cloud/files/${id}`, { method: 'DELETE' })
}

export function listShares(id: number): Promise<ShareListResponse> {
  return api<ShareListResponse>(`/api/cloud/files/${id}/shares`)
}

export function shareWithUser(id: number, email: string, role: ShareRole) {
  return api(`/api/cloud/files/${id}/shares`, {
    method: 'POST',
    body: { type: 'user', email, role },
  })
}

export function shareWithOrg(id: number, orgId: number, role: ShareRole) {
  return api(`/api/cloud/files/${id}/shares`, {
    method: 'POST',
    body: { type: 'org', orgId, role },
  })
}

export function removeShare(id: number, shareId: number) {
  return api(`/api/cloud/files/${id}/shares/${shareId}`, { method: 'DELETE' })
}

export function setLinkShare(id: number, share: LinkShare): Promise<{ share: LinkShare; token: string | null }> {
  return api(`/api/cloud/files/${id}/link`, { method: 'PUT', body: { share } })
}

export function listMyOrgs(): Promise<{ orgs: { id: number; name: string; code: string }[] }> {
  return api('/api/cloud/orgs')
}

/** 링크 공개 파일 — 로그인 없이 읽는다 */
export function readPublicFile(token: string): Promise<PublicFileResponse> {
  return api<PublicFileResponse>(`/api/share/${encodeURIComponent(token)}`)
}
