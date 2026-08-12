// 비로그인(게스트) 사용자의 작업물 보관.
// 로그인은 선택 사항이므로 게스트도 새로고침으로 코드를 잃으면 안 된다.
// 서버로는 아무것도 보내지 않고 이 브라우저에만 남는다(i18n auth.guestNotice와 같은 약속).
import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'pyde_draft'
const SAVE_DEBOUNCE_MS = 800

export interface Draft {
  name: string
  content: string
  /** Akademiya Cloud에 저장된 파일이면 그 id — 게스트/미저장 문서는 null */
  cloudId?: number | null
  /** 낙관적 잠금용 최근 revision */
  revision?: number | null
  /** 공유받은 파일이면 내 권한. 소유자면 'owner' */
  role?: 'owner' | 'editor' | 'viewer' | null
  /** 링크로 열었을 때만 채워진다(편집 권한 승격에 필요) */
  linkToken?: string | null
  /** 마지막으로 서버에 저장된 내용 — 이것과 다르면 '저장되지 않음' */
  savedContent?: string | null
}

export type FileKind = 'py' | 'ipynb'

/** 확장자로 편집 방식을 정한다 — .ipynb만 노트북, 나머지는 일반 소스로 다룬다 */
export function kindOf(name: string): FileKind {
  return name.toLowerCase().endsWith('.ipynb') ? 'ipynb' : 'py'
}

export const DEFAULT_DRAFT: Draft = {
  name: 'main.py',
  content: `# PyDe Web에 오신 것을 환영합니다.
# 이 코드는 서버가 아니라 여러분의 브라우저 안에서 실행됩니다.
# Ctrl+Enter(맥은 ⌘+Enter) 또는 위의 실행 버튼을 눌러보세요.

import matplotlib.pyplot as plt

과목 = ["국어", "수학", "영어", "과학"]
점수 = [88, 95, 72, 91]

for name, score in zip(과목, 점수):
    print(f"{name}: {score}점")

print(f"평균: {sum(점수) / len(점수):.1f}점")

plt.figure(figsize=(5, 3))
plt.bar(과목, 점수, color="#13e56a")
plt.title("과목별 점수")
plt.ylabel("점수")
plt.ylim(0, 100)
plt.show()
`,
}

function load(): Draft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DRAFT
    const parsed = JSON.parse(raw) as Partial<Draft>
    if (typeof parsed.content !== 'string' || typeof parsed.name !== 'string') return DEFAULT_DRAFT
    return {
      name: parsed.name,
      content: parsed.content,
      cloudId: typeof parsed.cloudId === 'number' ? parsed.cloudId : null,
      revision: typeof parsed.revision === 'number' ? parsed.revision : null,
      role: parsed.role ?? null,
      // ⚠️ linkToken은 일부러 복원하지 않는다. 공유 링크는 URL로 들어올 때만 유효해야
      //    하고, 브라우저에 남겨두면 링크가 회수된 뒤에도 권한이 남은 것처럼 보인다.
      linkToken: null,
      savedContent: typeof parsed.savedContent === 'string' ? parsed.savedContent : null,
    }
  } catch {
    // 사파리 프라이빗 모드 등 localStorage를 못 쓰는 환경 — 기본값으로 계속 간다
    return DEFAULT_DRAFT
  }
}

interface Options {
  /**
   * false면 localStorage에 쓰지 않는다.
   * 공유 링크(/s/:token)로 들어온 경우가 그렇다 — 남의 파일을 열었다고 해서
   * 내가 쓰던 초안이 덮어써지면 안 된다.
   */
  persist?: boolean
}

export function useLocalDraft({ persist = true }: Options = {}) {
  const [draft, setDraft] = useState<Draft>(load)
  const timer = useRef<number | null>(null)

  // 타이핑마다 쓰면 큰 파일에서 버벅인다 — 잠깐 멈췄을 때만 기록한다
  useEffect(() => {
    if (!persist) return
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
      } catch {
        // 용량 초과·프라이빗 모드 — 저장만 포기하고 편집은 계속 가능해야 한다
      }
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [draft, persist])

  const setContent = useCallback((content: string) => {
    setDraft((prev) => (prev.content === content ? prev : { ...prev, content }))
  }, [])

  const setName = useCallback((name: string) => {
    setDraft((prev) => ({ ...prev, name }))
  }, [])

  /** 새 파일 만들기 / 내 컴퓨터에서 열기 — 이름과 내용을 한꺼번에 바꾼다 */
  const replace = useCallback((next: Draft) => {
    setDraft({ cloudId: null, revision: null, role: null, linkToken: null, savedContent: null, ...next })
  }, [])

  /** 저장 성공처럼 내용은 그대로 두고 메타데이터만 갱신할 때 */
  const patchMeta = useCallback((patch: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
  }, [])

  return { draft, setContent, setName, replace, patchMeta }
}
