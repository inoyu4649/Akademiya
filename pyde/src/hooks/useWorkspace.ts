// ============================================================================
//  작업 공간 — VS Code처럼 여러 파일을 탭으로 열어 두고 오간다
// ============================================================================
//  Phase 6까지는 문서가 하나뿐이라 useLocalDraft로 충분했지만, 실제 수업에서는
//  예제 파일과 과제 파일을 나란히 놓고 오가게 된다.
//
//  ⚠️ 모든 탭의 내용을 localStorage에 통째로 넣는다. 개당 5MB 한도가 있고 브라우저
//     저장소는 보통 5~10MB라, 탭 수 상한을 두고 넘으면 새 탭을 막는다(조용히 유실되는
//     것보다 낫다).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_DRAFT, type Draft } from './useLocalDraft'

export interface Doc extends Draft {
  /** 브라우저 안에서만 쓰는 식별자 — 아직 클라우드에 없는 문서도 구분해야 한다 */
  docId: string
}

const STORAGE_KEY = 'pyde_workspace'
/** Phase 6까지 쓰던 단일 문서 키 — 기존 사용자의 작업물을 잃지 않으려고 한 번 이관한다 */
const LEGACY_DRAFT_KEY = 'pyde_draft'
const SAVE_DEBOUNCE_MS = 800

export const MAX_OPEN_TABS = 12

interface Stored {
  docs: Doc[]
  activeId: string
}

function newDocId(): string {
  return crypto.randomUUID()
}

function toDoc(draft: Draft): Doc {
  return {
    cloudId: null,
    revision: null,
    role: null,
    linkToken: null,
    // 새 문서는 "방금 만든 그대로"가 저장된 상태다 — 손대지 않았는데 빨간 점이 뜨면 안 된다
    savedContent: draft.content,
    ...draft,
    docId: newDocId(),
  }
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>
      const docs = (parsed.docs ?? []).filter(
        (d): d is Doc => !!d && typeof d.name === 'string' && typeof d.content === 'string'
      )
      if (docs.length) {
        // linkToken은 저장하지 않는다 — 공유 링크는 URL로 들어올 때만 유효해야 한다
        const clean = docs.map((d) => ({ ...d, docId: d.docId || newDocId(), linkToken: null }))
        const activeId = clean.some((d) => d.docId === parsed.activeId)
          ? parsed.activeId!
          : clean[0].docId
        return { docs: clean, activeId }
      }
    }

    // 구 버전 단일 초안 이관
    const legacy = localStorage.getItem(LEGACY_DRAFT_KEY)
    if (legacy) {
      const draft = JSON.parse(legacy) as Partial<Draft>
      if (typeof draft.name === 'string' && typeof draft.content === 'string') {
        const doc = toDoc({ ...(draft as Draft), linkToken: null })
        return { docs: [doc], activeId: doc.docId }
      }
    }
  } catch {
    // 손상된 저장소 — 기본 문서로 시작한다(편집을 막지 않는 게 우선)
  }
  const doc = toDoc(DEFAULT_DRAFT)
  return { docs: [doc], activeId: doc.docId }
}

interface Options {
  /** 공유 링크(/s/:token)로 들어온 경우 false — 내 작업 공간을 건드리지 않는다 */
  persist?: boolean
}

export function useWorkspace({ persist = true }: Options = {}) {
  const [state, setState] = useState<Stored>(load)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!persist) return
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
        // 이관이 끝났으면 구 키는 지워 혼선을 없앤다
        localStorage.removeItem(LEGACY_DRAFT_KEY)
      } catch {
        // 용량 초과·프라이빗 모드 — 저장만 포기하고 편집은 계속 가능해야 한다
      }
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [state, persist])

  const active = useMemo(
    () => state.docs.find((d) => d.docId === state.activeId) ?? state.docs[0],
    [state]
  )

  const patchDoc = useCallback((docId: string, patch: Partial<Doc>) => {
    setState((prev) => ({
      ...prev,
      docs: prev.docs.map((d) => (d.docId === docId ? { ...d, ...patch } : d)),
    }))
  }, [])

  const setContent = useCallback(
    (content: string) => {
      setState((prev) => ({
        ...prev,
        docs: prev.docs.map((d) =>
          d.docId === prev.activeId ? (d.content === content ? d : { ...d, content }) : d
        ),
      }))
    },
    []
  )

  /**
   * 특정 문서의 내용을 바꾼다.
   * ⚠️ 노트북처럼 "탭이 바뀐 뒤에 마지막 편집을 흘려보내는" 경우에는 반드시 이 함수를
   *    써야 한다. setContent는 **현재 활성 문서**에 쓰므로, 탭 전환 직후 호출하면
   *    엉뚱한 파일(.py)을 노트북 JSON으로 덮어쓴다(실제로 그렇게 깨뜨렸다).
   */
  const setDocContent = useCallback((docId: string, content: string) => {
    setState((prev) => ({
      ...prev,
      docs: prev.docs.map((d) => (d.docId === docId ? (d.content === content ? d : { ...d, content }) : d)),
    }))
  }, [])

  const patchMeta = useCallback(
    (patch: Partial<Draft>) => {
      setState((prev) => ({
        ...prev,
        docs: prev.docs.map((d) => (d.docId === prev.activeId ? { ...d, ...patch } : d)),
      }))
    },
    []
  )

  const activate = useCallback((docId: string) => {
    setState((prev) => (prev.activeId === docId ? prev : { ...prev, activeId: docId }))
  }, [])

  /**
   * 문서를 연다. 같은 클라우드 파일이 이미 열려 있으면 새 탭을 만들지 않고 그 탭으로 간다
   * (VS Code와 같은 동작 — 같은 파일이 두 탭에 열려 서로 덮어쓰는 사고를 막는다).
   * @returns 실패 사유. 성공이면 null
   */
  const openDoc = useCallback((draft: Draft): 'TOO_MANY_TABS' | null => {
    let result: 'TOO_MANY_TABS' | null = null
    setState((prev) => {
      if (draft.cloudId) {
        const existing = prev.docs.find((d) => d.cloudId === draft.cloudId)
        if (existing) {
          // 이미 열려 있으면 서버에서 막 읽어온 내용으로 갱신하고 그 탭을 띄운다
          return {
            docs: prev.docs.map((d) => (d.docId === existing.docId ? { ...d, ...draft } : d)),
            activeId: existing.docId,
          }
        }
      }
      if (prev.docs.length >= MAX_OPEN_TABS) {
        result = 'TOO_MANY_TABS'
        return prev
      }
      const doc = toDoc(draft)
      return { docs: [...prev.docs, doc], activeId: doc.docId }
    })
    return result
  }, [])

  /** @returns 닫으려는 탭이 마지막 하나면 기본 문서로 대체한다 */
  const closeDoc = useCallback((docId: string) => {
    setState((prev) => {
      const index = prev.docs.findIndex((d) => d.docId === docId)
      if (index < 0) return prev
      const rest = prev.docs.filter((d) => d.docId !== docId)
      if (!rest.length) {
        const doc = toDoc(DEFAULT_DRAFT)
        return { docs: [doc], activeId: doc.docId }
      }
      // 닫은 탭이 활성 탭이었으면 오른쪽(없으면 왼쪽) 탭으로 옮긴다 — VS Code와 동일
      const activeId =
        prev.activeId === docId ? rest[Math.min(index, rest.length - 1)].docId : prev.activeId
      return { docs: rest, activeId }
    })
  }, [])

  const renameActive = useCallback(
    (name: string) => {
      patchDoc(state.activeId, { name })
    },
    [patchDoc, state.activeId]
  )

  /** 특정 탭의 이름을 바꾼다(활성 탭이 아니어도 된다 — 탭을 더블클릭해 고칠 수 있으므로) */
  const renameDoc = useCallback(
    (docId: string, name: string) => {
      patchDoc(docId, { name })
    },
    [patchDoc]
  )

  return {
    docs: state.docs,
    activeId: state.activeId,
    active,
    setContent,
    setDocContent,
    patchMeta,
    openDoc,
    closeDoc,
    activate,
    renameActive,
    renameDoc,
  }
}
