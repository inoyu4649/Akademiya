import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router-dom'
import AppHeader from '../components/layout/AppHeader'
import EditorToolbar from '../components/layout/EditorToolbar'
import IdeLayout from '../components/layout/IdeLayout'
import TabBar from '../components/layout/TabBar'
import BootSplash from '../components/boot/BootSplash'
import CodeEditor from '../components/editor/CodeEditor'
import TerminalPanel from '../components/terminal/TerminalPanel'
import CanvasPanel from '../components/canvas/CanvasPanel'
import NotebookPane, { type NotebookApi } from '../components/notebook/NotebookPane'
import FileBrowserModal from '../components/files/FileBrowserModal'
import ConflictModal from '../components/files/ConflictModal'
import ShareModal from '../components/share/ShareModal'
import { kindOf, DEFAULT_DRAFT, type Draft, type FileKind } from '../hooks/useLocalDraft'
import { useWorkspace, MAX_OPEN_TABS, type Doc } from '../hooks/useWorkspace'
import { useCloudSync } from '../hooks/useCloudSync'
import { useAuth } from '../hooks/authContext'
import { usePyodideRuntime } from '../runtime/usePyodideRuntime'
import { useRunner } from '../runtime/useRunner'
import { createNotebook, parseNotebook, serializeNotebook } from '../notebook/nbformat'
import { readFile, readPublicFile, renameFile } from '../api/cloud.api'
import { ApiError } from '../api/client'
import { extensionOf, validateFileName } from '../utils/fileName'

export default function IdePage() {
  const { t } = useTranslation()
  const { token: shareToken } = useParams<{ token?: string }>()
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const signedIn = !!user

  const runtime = usePyodideRuntime()
  const runner = useRunner(runtime)
  // 공유 링크로 들어왔으면 내 작업 공간을 건드리지 않는다(읽고 지나가는 경우가 대부분)
  const ws = useWorkspace({ persist: !shareToken })
  const draft = ws.active
  const cloud = useCloudSync({ draft, patchMeta: ws.patchMeta, signedIn })

  const kind = kindOf(draft.name)
  // 노트북 상태는 NotebookPane이 문서 단위로 들고 있다(탭 사이 오염 방지).
  // 툴바가 실행/중지를 부를 수 있게 API만 ref로 받아 둔다.
  const nbApi = useRef<NotebookApi | null>(null)
  const [nbRunning, setNbRunning] = useState(false)

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

  /** 문서를 새로 여는 모든 경로가 거쳐야 하는 지점 */
  const openDocument = useCallback(
    (next: Draft) => {
      const failure = ws.openDoc(next)
      if (failure === 'TOO_MANY_TABS') {
        window.alert(t('files.tooManyTabs', { max: MAX_OPEN_TABS }))
        return
      }
      runner.clear()
    },
    [ws, runner, t]
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
            // 권한 승격 실패 — 아래 읽기 전용 경로로 계속 간다
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
  const running = kind === 'ipynb' ? nbRunning : runner.status === 'running'

  const handleRun = useCallback(() => {
    if (!ready || running) return
    if (kind === 'ipynb') {
      const api = nbApi.current
      if (api) api.runCell(api.selectedId)
    } else {
      runner.run(draft.content)
    }
  }, [ready, running, kind, runner, draft.content])

  const handleStop = useCallback(() => {
    if (kind === 'ipynb') nbApi.current?.interrupt()
    else runner.stop()
  }, [kind, runner])

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
    // 노트북도 draft.content에 직렬화된 상태로 들어 있다(NotebookPane이 갱신)
    const mime = kind === 'ipynb' ? 'application/json' : 'text/x-python'
    const text = draft.content
    const blob = new Blob([text], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = draft.name
    a.click()
    URL.revokeObjectURL(url)
  }, [kind, draft])

  /** 새 파일은 항상 새 탭으로 연다(VS Code와 동일) */
  const handleNew = useCallback(
    (next: FileKind) => {
      openDocument(
        next === 'ipynb'
          ? { name: 'notebook.ipynb', content: serializeNotebook(createNotebook()) }
          : { ...DEFAULT_DRAFT, name: 'untitled.py', content: '' }
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

  /**
   * 빨간 점 = 저장되지 않은 변경.
   * 게스트는 localStorage에 자동 보관되어 잃을 것이 없으므로 점을 띄우지 않는다 —
   * 손쓸 방법이 없는 경고는 소음일 뿐이다. 로그인 사용자에게만 "클라우드와 다름"을 알린다.
   */
  const isDirty = useCallback(
    (doc: Doc) => signedIn && doc.content !== doc.savedContent,
    [signedIn]
  )

  /**
   * 탭 더블클릭으로 이름 바꾸기.
   * 클라우드 파일이면 서버에도 반영한다. 응답을 기다리지 않고 화면부터 바꾸되,
   * 실패하면 되돌리고 알린다 — 이름 바꾸기는 자주 하는 동작이라 왕복을 기다리게 하면 답답하다.
   * @returns 거절 사유(i18n 키 뒷부분). 성공이면 null
   */
  const handleRename = useCallback(
    (docId: string, rawName: string): string | null => {
      const doc = ws.docs.find((d) => d.docId === docId)
      if (!doc) return 'EMPTY'

      const name = rawName.normalize('NFC')
      const invalid = validateFileName(name)
      if (invalid) return invalid

      // ⚠️ .py ↔ .ipynb 를 오가는 이름 변경은 막는다. 확장자가 편집기 종류를 결정하는데
      //    내용은 그대로라, 예컨대 .py 내용을 .ipynb로 만들면 노트북으로 열리지 않고
      //    사용자는 파일이 깨진 것처럼 느낀다. 형식을 바꾸려면 새로 만들어 옮겨야 한다.
      const wasNotebook = extensionOf(doc.name) === '.ipynb'
      const willBeNotebook = extensionOf(name) === '.ipynb'
      if (wasNotebook !== willBeNotebook) return 'KIND_CHANGE'

      // 공유받은 파일의 이름은 원본 소유자의 것이라 바꾸지 않는다
      if (doc.cloudId && doc.role !== 'owner') return 'NOT_OWNER'

      const previous = doc.name
      ws.renameDoc(docId, name)

      if (doc.cloudId && doc.role === 'owner') {
        void renameFile(doc.cloudId, name).catch((err) => {
          ws.renameDoc(docId, previous)
          const code = err instanceof ApiError ? err.code : 'RENAME_FAILED'
          window.alert(t([`files.error.${code}`, 'files.error.RENAME_FAILED']))
        })
      }
      return null
    },
    [ws, t]
  )

  const handleCloseTab = useCallback(
    (docId: string) => {
      const doc = ws.docs.find((d) => d.docId === docId)
      if (doc && isDirty(doc) && !window.confirm(t('files.confirmClose', { name: doc.name }))) return
      ws.closeDoc(docId)
    },
    [ws, isDirty, t]
  )

  const toolbar = (
    <EditorToolbar
      fileName={draft.name}
      kind={kind}
      running={running}
      ready={ready}
      onRun={handleRun}
      onRunAll={() => nbApi.current?.runAll()}
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

  const tabs = (
    <TabBar
      docs={ws.docs}
      activeId={ws.activeId}
      isDirty={isDirty}
      onActivate={ws.activate}
      onClose={handleCloseTab}
      onNew={() => handleNew('py')}
      onRename={handleRename}
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
          header={<AppHeader>{toolbar}</AppHeader>}
          tabs={tabs}
          editor={
            <NotebookPane
              // 문서마다 새 인스턴스 — 탭 사이에 노트북 상태가 섞이지 않게 한다
              key={draft.docId}
              runtime={runtime}
              initialSource={draft.content}
              // ⚠️ 반드시 문서를 지정해 쓴다. 노트북은 언마운트(탭 전환) 시 마지막 편집을
              //    한 번 더 흘려보내는데, 그때 활성 문서는 이미 다른 파일이다.
              onChange={(text) => ws.setDocContent(draft.docId, text)}
              apiRef={nbApi}
              onRunningChange={setNbRunning}
            />
          }
        />
      ) : (
        <IdeLayout
          header={<AppHeader>{toolbar}</AppHeader>}
          tabs={tabs}
          editor={
            <CodeEditor
              // 탭을 옮기면 에디터를 새로 만든다 — 실행 취소 이력이 문서 사이에 섞이면 안 된다
              key={draft.docId}
              value={draft.content}
              onChange={ws.setContent}
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
        <ShareModal fileId={draft.cloudId} fileName={draft.name} onClose={() => setSharing(false)} />
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

      {(authError || shareError) && (
        <div className="srOnly" role="alert">
          {shareError ? t('files.error.NOT_FOUND') : t([`auth.error.${authError}`, 'common.error'])}
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
