import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import AppHeader from '../components/layout/AppHeader'
import EditorToolbar from '../components/layout/EditorToolbar'
import IdeLayout from '../components/layout/IdeLayout'
import BootSplash from '../components/boot/BootSplash'
import CodeEditor from '../components/editor/CodeEditor'
import TerminalPanel from '../components/terminal/TerminalPanel'
import CanvasPanel from '../components/canvas/CanvasPanel'
import { useLocalDraft } from '../hooks/useLocalDraft'
import { usePyodideRuntime } from '../runtime/usePyodideRuntime'
import { useRunner } from '../runtime/useRunner'

export default function IdePage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const runtime = usePyodideRuntime()
  const runner = useRunner(runtime)
  const { draft, setContent } = useLocalDraft()

  // 로그인 실패 시 서버가 /?authError=... 로 되돌려 보낸다.
  // 최초 렌더에서 한 번만 읽어 두고(지연 초기화) URL에서는 지운다 —
  // 이펙트 안에서 setState로 옮기면 react-hooks/set-state-in-effect에 걸린다.
  const [authError] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('authError')
  )

  useEffect(() => {
    if (!params.has('authError')) return
    const next = new URLSearchParams(params)
    next.delete('authError')
    setParams(next, { replace: true })
  }, [params, setParams])

  // 개발 중에만 콘솔에서 런타임을 두드려 볼 수 있게 열어둔다.
  // import.meta.env.DEV 가드라 프로덕션 번들에는 들어가지 않는다.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__pyde = runtime
  }, [runtime])

  // 로그인 오류는 한 번만 알리고 터미널 기록으로 남긴다(모달로 막지 않는다 —
  // 로그인은 선택 사항이라 게스트로 계속 쓸 수 있어야 한다)
  useEffect(() => {
    if (!authError) return
    console.warn('[PyDe] 로그인 실패:', authError)
  }, [authError])

  const ready = runtime.status === 'ready'
  const running = runner.status === 'running'

  const handleRun = useCallback(() => {
    if (!ready || running) return
    runner.run(draft.content)
  }, [ready, running, runner, draft.content])

  const handleDownload = useCallback(() => {
    // 브라우저 안에서만 처리한다 — 코드가 서버로 나가지 않는다
    const blob = new Blob([draft.content], { type: 'text/x-python;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = draft.name
    a.click()
    URL.revokeObjectURL(url)
  }, [draft])

  return (
    <>
      {runtime.status !== 'ready' && (
        <BootSplash
          progress={runtime.progress}
          logs={runtime.logs}
          error={runtime.error}
          onRetry={() => window.location.reload()}
        />
      )}

      <IdeLayout
        header={
          <AppHeader>
            <EditorToolbar
              fileName={draft.name}
              dirty={false}
              running={running}
              ready={ready}
              onRun={handleRun}
              onStop={runner.stop}
              onDownload={handleDownload}
            />
          </AppHeader>
        }
        editor={
          <CodeEditor value={draft.content} onChange={setContent} onRun={handleRun} />
        }
        canvas={<CanvasPanel artifacts={runner.artifacts} />}
        terminal={
          <TerminalPanel
            lines={runner.lines}
            status={runner.status}
            elapsedMs={runner.elapsedMs}
            onClear={runner.clear}
          />
        }
      />

      {/* 로그인 실패는 화면을 막지 않고 조용히 알린다 */}
      {authError && (
        <div className="srOnly" role="alert">
          {t([`auth.error.${authError}`, 'common.error'])}
        </div>
      )}
    </>
  )
}
