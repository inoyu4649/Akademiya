// ============================================================================
//  Akademiya Cloud 동기화 — 5분 자동 저장 + 수동 저장 + 충돌 처리
// ============================================================================
//  로그인은 선택 사항이므로 이 훅은 "로그인했을 때만 켜지는 부가 기능"으로 동작한다.
//  게스트는 아무것도 하지 않고 localStorage 초안만 쓴다(useLocalDraft).
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { createFile, writeFile, type CloudFileMeta } from '../api/cloud.api'
import type { Draft } from './useLocalDraft'

/** 요구사항: 로그인 사용자는 5분마다 서버에 자동 저장 */
const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

export interface Conflict {
  currentRevision: number
  updatedAt: string
}

interface Params {
  draft: Draft
  patchMeta: (patch: Partial<Draft>) => void
  /** 로그인하지 않았으면 null — 자동 저장을 켜지 않는다 */
  signedIn: boolean
}

export function useCloudSync({ draft, patchMeta, signedIn }: Params) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)

  // 인터벌 콜백이 옛 draft를 붙잡지 않도록 최신값을 ref로 들고 있는다
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const inFlight = useRef(false)

  const dirty = draft.savedContent !== draft.content
  const readOnly = draft.role === 'viewer'

  /**
   * @param force revision을 무시하고 덮어쓴다(사용자가 충돌 화면에서 "덮어쓰기" 선택)
   */
  const save = useCallback(
    async (force = false): Promise<boolean> => {
      const current = draftRef.current
      if (!signedIn || inFlight.current) return false
      if (current.role === 'viewer') return false
      if (current.savedContent === current.content && current.cloudId) return true

      inFlight.current = true
      setStatus('saving')
      setError(null)
      try {
        if (!current.cloudId) {
          // 처음 저장 — Akademiya Cloud/PyDe Web 아래에 새 파일로 만든다
          const { file }: { file: CloudFileMeta } = await createFile(current.name, current.content)
          patchMeta({
            cloudId: file.id,
            revision: file.revision,
            role: 'owner',
            savedContent: current.content,
          })
        } else {
          const res = await writeFile(
            current.cloudId,
            current.content,
            force ? null : (current.revision ?? null),
            current.linkToken ?? null
          )
          patchMeta({ revision: res.revision, savedContent: current.content })
        }
        setConflict(null)
        setSavedAt(new Date())
        setStatus('saved')
        return true
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          // 그 사이 다른 편집자(또는 다른 탭)가 저장했다 — 사용자가 고르게 한다
          const body = err.body as { currentRevision?: number; updatedAt?: string }
          setConflict({
            currentRevision: body.currentRevision ?? 0,
            updatedAt: body.updatedAt ?? '',
          })
          setStatus('conflict')
          return false
        }
        if (err instanceof ApiError && err.status === 401) {
          // 세션이 끊겼다 — 게스트로 강등되지만 작업물은 localStorage에 남아 있다
          setError('NOT_AUTHENTICATED')
        } else {
          setError(err instanceof ApiError ? err.code : 'SAVE_FAILED')
        }
        setStatus('error')
        return false
      } finally {
        inFlight.current = false
      }
    },
    [signedIn, patchMeta]
  )

  // ── 5분 자동 저장 ────────────────────────────────────────────────────────
  // ⚠️ 아직 클라우드에 없는 문서(cloudId 없음)는 자동으로 만들지 않는다.
  //    사용자가 저장을 누르지도 않았는데 계정에 파일이 생기면 놀란다.
  useEffect(() => {
    if (!signedIn) return
    const timer = window.setInterval(() => {
      const current = draftRef.current
      if (!current.cloudId) return
      if (current.role === 'viewer') return
      if (current.savedContent === current.content) return
      void save()
    }, AUTOSAVE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [signedIn, save])

  // ── 창을 닫으려 할 때 경고 ───────────────────────────────────────────────
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // 최신 브라우저는 문구를 무시하고 기본 경고만 띄운다
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const dismissConflict = useCallback(() => {
    setConflict(null)
    setStatus('idle')
  }, [])

  return {
    status,
    savedAt,
    error,
    conflict,
    dirty,
    readOnly,
    autosaveIntervalMs: AUTOSAVE_INTERVAL_MS,
    save,
    dismissConflict,
  }
}
