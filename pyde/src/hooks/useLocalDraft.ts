// 비로그인(게스트) 사용자의 작업물 보관.
// 로그인은 선택 사항이므로 게스트도 새로고침으로 코드를 잃으면 안 된다.
// 서버로는 아무것도 보내지 않고 이 브라우저에만 남는다(i18n auth.guestNotice와 같은 약속).
import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'pyde_draft'
const SAVE_DEBOUNCE_MS = 800

export interface Draft {
  name: string
  content: string
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
    return { name: parsed.name, content: parsed.content }
  } catch {
    // 사파리 프라이빗 모드 등 localStorage를 못 쓰는 환경 — 기본값으로 계속 간다
    return DEFAULT_DRAFT
  }
}

export function useLocalDraft() {
  const [draft, setDraft] = useState<Draft>(load)
  const timer = useRef<number | null>(null)

  // 타이핑마다 쓰면 큰 파일에서 버벅인다 — 잠깐 멈췄을 때만 기록한다
  useEffect(() => {
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
  }, [draft])

  const setContent = useCallback((content: string) => {
    setDraft((prev) => (prev.content === content ? prev : { ...prev, content }))
  }, [])

  const setName = useCallback((name: string) => {
    setDraft((prev) => ({ ...prev, name }))
  }, [])

  return { draft, setContent, setName }
}
