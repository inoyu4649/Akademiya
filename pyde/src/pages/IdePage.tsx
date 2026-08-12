import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router-dom'
import AppHeader from '../components/layout/AppHeader'
import EditorToolbar from '../components/layout/EditorToolbar'
import IdeLayout from '../components/layout/IdeLayout'
import BootSplash from '../components/boot/BootSplash'
import CodeEditor from '../components/editor/CodeEditor'
import TerminalPanel from '../components/terminal/TerminalPanel'
import CanvasPanel from '../components/canvas/CanvasPanel'
import NotebookView from '../components/notebook/NotebookView'
import FileBrowserModal from '../components/files/FileBrowserModal'
import ConflictModal from '../components/files/ConflictModal'
import ShareModal from '../components/share/ShareModal'
import { kindOf, useLocalDraft, DEFAULT_DRAFT, type Draft, type FileKind } from '../hooks/useLocalDraft'
import { useCloudSync } from '../hooks/useCloudSync'
import { useAuth } from '../hooks/authContext'
import { usePyodideRuntime } from '../runtime/usePyodideRuntime'
import { useRunner } from '../runtime/useRunner'
import { useNotebook } from '../notebook/useNotebook'
import { createNotebook, parseNotebook, serializeNotebook } from '../notebook/nbformat'
import { readFile, readPublicFile } from '../api/cloud.api'

export default function IdePage() {
  const { t } = useTranslation()
  const { token: shareToken } = useParams<{ token?: string }>()
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const signedIn = !!user

  const runtime = usePyodideRuntime()
  const runner = useRunner(runtime)
  // 공유 링크로 들어왔으면 내 초안을 덮어쓰지 않는다(읽기만 하고 지나가는 경우가 대부분)
  const { draft, setContent, replace, patchMeta } = useLocalDraft({ persist: !shareToken })
  const cloud = useCloudSync({ draft, patchMeta, signedIn })

  const kind = kindOf(draft.name)
  const nb = useNotebook(runtime, kind === 'ipynb' ? draft.content : '', setContent)

  const [browsing, setBrowsing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const [authError] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('authError')
  )

  useEffect(() => {
    if (!params.has('authError')) return
    const next = new URLSearchParams(params)
    next.delete('authError')
    setParams(next, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__pyde = runtime
  }, [runtime])

  /** 문서를 통째로 바꾸는 모든 경로가 거쳐야 하는 지점 — 노트북 상태 리셋을 빠뜨리지 않도록 */
  const openDocument = useCallback(
    (next: Draft) => {
      replace(next)
      runner.clear()
      if (kindOf(next.name) === 'ipynb') nb.reset(next.content)
    },
    [replace, runner, nb]
  )

  // ── 공유 링크(/s/:token)로 들어온 경우 ───────────────────────────────────
  const [shareLoaded, setShareLoaded] = useState(false)
  useEffect(() => {
    if (!shareToken || shareLoaded) return
    let cancelled = false
    readPublicFile(shareToken)
      .then(async (res) => {
        if (cancelled) return
        // 로그인 상태이고 링크가 편집 허용이면, 인증 경로로 다시 읽어 실제 권한을 받는다
        // (익명은 링크가 editor여도 서버가 항상 viewer로 내려준다)
        if (signedIn && res.editableWhenSignedIn) {
          try {
            const authed = await readFile(res.file.id, shareToken)
            if (cancelled) return
            openDocument({
              name: authed.file.name,
              content: authed.content,
              cloudId: authed.file.id,
              revision: authed.file.revision,
              role: authed.role,
              linkToken: shareToken,
              savedContent: authed.content,
            })
            setShareLoaded(true)
            return
          } catch {
            // 권한 승격 실패 — 아래의 읽기 전용 경로로 계속 간다
          }
        }
        openDocument({
          name: res.file.name,
          content: res.content,
          cloudId: res.file.id,
          revision: res.file.revision,
          role: 'viewer',
          linkToken: shareToken,
          savedContent: res.content,
        })
        setShareLoaded(true)
      })
      .catch(() => {
        if (!cancelled) {
          setShareError('NOT_FOUND')
          setShareLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [shareToken, shareLoaded, signedIn, openDocument])

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

  // Ctrl/⌘+S — 브라우저의 "페이지 저장"을 막고 클라우드 저장으로 돌린다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (signedIn) void cloud.save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [signedIn, cloud])

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
      openDocument(
        next === 'ipynb'
          ? { name: 'notebook.ipynb', content: serializeNotebook(createNotebook()) }
          : DEFAULT_DRAFT
      )
    },
    [openDocument]
  )

  const handleOpenFile = useCallback(
    async (file: File) => {
      const text = await file.text()
      if (kindOf(file.name) === 'ipynb' && !parseNotebook(text)) {
        window.alert(t('notebook.invalidFile'))
        return
      }
      openDocument({ name: file.name, content: text })
    },
    [openDocument, t]
  )

  /** 읽기 전용으로 열린 파일을 내 계정 사본으로 만든다 */
  const handleMakeCopy = useCallback(() => {
    const base = draft.name.replace(/(\.[^.]+)$/, '')
    const ext = kind === 'ipynb' ? '.ipynb' : '.py'
    openDocument({ name: `${base} (copy)${ext}`, content: draft.content })
  }, [draft, kind, openDocument])

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
      signedIn={signedIn}
      saveStatus={cloud.status}
      savedAt={cloud.savedAt}
      dirty={cloud.dirty}
      readOnly={cloud.readOnly}
      canShare={!!draft.cloudId && draft.role === 'owner'}
      onSave={() => void cloud.save()}
      onShare={() => setSharing(true)}
      onBrowse={() => setBrowsing(true)}
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
        <IdeLayout header={<AppHeader>{toolbar}</AppHeader>} editor={<NotebookView nb={nb} />} />
      ) : (
        <IdeLayout
          header={<AppHeader>{toolbar}</AppHeader>}
          editor={
            <CodeEditor
              value={draft.content}
              onChange={setContent}
              onRun={handleRun}
              readOnly={cloud.readOnly}
            />
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
      )}

      {browsing && <FileBrowserModal onClose={() => setBrowsing(false)} onOpen={openDocument} />}

      {sharing && draft.cloudId && (
        <ShareModal
          fileId={draft.cloudId}
          fileName={draft.name}
          onClose={() => setSharing(false)}
        />
      )}

      {cloud.conflict && (
        <ConflictModal
          conflict={cloud.conflict}
          onClose={cloud.dismissConflict}
          onOverwrite={() => {
            cloud.dismissConflict()
            void cloud.save(true)
          }}
          onReload={() => {
            cloud.dismissConflict()
            if (!draft.cloudId) return
            void readFile(draft.cloudId, draft.linkToken).then((res) =>
              openDocument({
                name: res.file.name,
                content: res.content,
                cloudId: res.file.id,
                revision: res.file.revision,
                role: res.role,
                linkToken: draft.linkToken,
                savedContent: res.content,
              })
            )
          }}
        />
      )}

      {/* 읽기 전용으로 열렸으면 사본을 만들 길을 열어준다 */}
      {cloud.readOnly && (
        <div className="srOnly" role="status">
          {t('files.readOnly')}
        </div>
      )}

      {(authError || shareError) && (
        <div className="srOnly" role="alert">
          {shareError ? t('files.error.LOAD_FAILED') : t([`auth.error.${authError}`, 'common.error'])}
        </div>
      )}

      {cloud.readOnly && (
        <button
          className="btn btnPrimary"
          style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 60 }}
          onClick={handleMakeCopy}
        >
          {t('files.makeCopy')}
        </button>
      )}
    </>
  )
}
