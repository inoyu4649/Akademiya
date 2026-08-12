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
import NotebookView from '../components/notebook/NotebookView'
import { kindOf, useLocalDraft, DEFAULT_DRAFT, type FileKind } from '../hooks/useLocalDraft'
import { usePyodideRuntime } from '../runtime/usePyodideRuntime'
import { useRunner } from '../runtime/useRunner'
import { useNotebook } from '../notebook/useNotebook'
import { createNotebook, parseNotebook, serializeNotebook } from '../notebook/nbformat'

export default function IdePage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const runtime = usePyodideRuntime()
  const runner = useRunner(runtime)
  const { draft, setContent, replace } = useLocalDraft()

  const kind = kindOf(draft.name)

  // 노트북 훅은 항상 살려 둔다(조건부 훅 호출은 React 규칙 위반).
  // .py 모드일 때는 상태만 갖고 있고 화면에는 쓰이지 않는다.
  const notebookSource = kind === 'ipynb' ? draft.content : ''
  const nb = useNotebook(runtime, notebookSource, setContent)

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
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__pyde = runtime
  }, [runtime])

  const ready = runtime.status === 'ready'
  const running = kind === 'ipynb' ? nb.runningCellId !== null : runner.status === 'running'

  const handleRun = useCallback(() => {
    if (!ready || running) return
    if (kind === 'ipynb') nb.runCell(nb.selectedId)
    else runner.run(draft.content)
  }, [ready, running, kind, nb, runner, draft.content])

  const handleStop = useCallback(() => {
    if (kind === 'ipynb') nb.interrupt()
    else runner.stop()
  }, [kind, nb, runner])

  const handleDownload = useCallback(() => {
    // 브라우저 안에서만 처리한다 — 코드가 서버로 나가지 않는다
    const text = kind === 'ipynb' ? serializeNotebook(nb.notebook) : draft.content
    const mime = kind === 'ipynb' ? 'application/json' : 'text/x-python'
    const blob = new Blob([text], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = draft.name
    a.click()
    URL.revokeObjectURL(url)
  }, [kind, nb.notebook, draft])

  const handleNew = useCallback(
    (next: FileKind) => {
      if (next === 'ipynb') {
        replace({ name: 'notebook.ipynb', content: serializeNotebook(createNotebook()) })
      } else {
        replace(DEFAULT_DRAFT)
      }
      runner.clear()
    },
    [replace, runner]
  )

  const handleOpenFile = useCallback(
    async (file: File) => {
      const text = await file.text()
      if (kindOf(file.name) === 'ipynb' && !parseNotebook(text)) {
        window.alert(t('notebook.invalidFile'))
        return
      }
      replace({ name: file.name, content: text })
      runner.clear()
    },
    [replace, runner, t]
  )

  const toolbar = (
    <EditorToolbar
      fileName={draft.name}
      kind={kind}
      running={running}
      ready={ready}
      onRun={handleRun}
      onRunAll={nb.runAll}
      onStop={handleStop}
      onDownload={handleDownload}
      onNew={handleNew}
      onOpenFile={handleOpenFile}
    />
  )

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

      {kind === 'ipynb' ? (
        // 노트북은 셀마다 출력이 붙으므로 아래 터미널·오른쪽 캔버스를 쓰지 않는다
        <IdeLayout
          key="notebook"
          header={<AppHeader>{toolbar}</AppHeader>}
          editor={<NotebookView nb={nb} />}
        />
      ) : (
        <IdeLayout
          key="script"
          header={<AppHeader>{toolbar}</AppHeader>}
          editor={<CodeEditor value={draft.content} onChange={setContent} onRun={handleRun} />}
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
      )}

      {/* 로그인 실패는 화면을 막지 않고 조용히 알린다 */}
      {authError && (
        <div className="srOnly" role="alert">
          {t([`auth.error.${authError}`, 'common.error'])}
        </div>
      )}
    </>
  )
}
