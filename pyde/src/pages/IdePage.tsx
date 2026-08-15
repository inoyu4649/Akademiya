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
import DataUploadModal from '../components/files/DataUploadModal'
import DataManagerModal, { type SessionDataFile } from '../components/files/DataManagerModal'
import ShareModal from '../components/share/ShareModal'
import { kindOf, DEFAULT_DRAFT, type Draft, type FileKind } from '../hooks/useLocalDraft'
import { useWorkspace, MAX_OPEN_TABS, type Doc } from '../hooks/useWorkspace'
import { useCloudSync } from '../hooks/useCloudSync'
import { useAuth } from '../hooks/authContext'
import { usePyodideRuntime } from '../runtime/usePyodideRuntime'
import { useRunner } from '../runtime/useRunner'
import { createNotebook, parseNotebook, serializeNotebook } from '../notebook/nbformat'
import {
  createFile,
  readFile,
  readPublicFile,
  renameFile,
  DATA_FOLDER,
  type CloudFileMeta,
} from '../api/cloud.api'
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

  // ── 데이터 관리 (경로를 한눈에 보여주는 모달 + 업로드 시 로컬/클라우드 선택) ──
  // "데이터 업로드" 버튼을 누르면 파일 선택창이 아니라 이 모달이 먼저 뜬다 — 학생들이
  // 이미 올려둔 데이터의 경로(/data/...)를 코드에 쓰려고 다시 열 때도 쓰는 화면이다.
  const [dataManagerOpen, setDataManagerOpen] = useState(false)
  // 이번 세션에 /data/로 실제로 준비된 파일들 — 새로고침하면 사라지는 휘발성 상태다.
  // 워커 쪽에 "지금 뭐가 있는지" 물어보는 API가 없어서, 우리가 쓴 시점에 직접 기록해 둔다.
  const [sessionDataFiles, setSessionDataFiles] = useState<SessionDataFile[]>([])
  // 업로드/삭제 후 DataManagerModal의 클라우드 목록을 다시 불러오게 하는 트리거
  const [dataReloadToken, setDataReloadToken] = useState(0)

  const [pendingData, setPendingData] = useState<{ name: string; content: string } | null>(null)
  const [dataBusy, setDataBusy] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)

  const rememberSessionFile = useCallback((name: string, path: string) => {
    setSessionDataFiles((prev) => [...prev.filter((f) => f.name !== name), { name, path }])
  }, [])

  const handlePickDataFile = useCallback(async (file: File) => {
    // 텍스트 형식(csv/tsv/json/txt)만 다룬다 — Cloud 본문 칸이 텍스트 저장용이라
    // 이진 파일을 그대로 넣으면 깨진다(base64로 감싸는 건 이번 범위 밖).
    const content = await file.text()
    setDataError(null)
    setPendingData({ name: file.name, content })
  }, [])

  const closeDataUploadModal = useCallback(() => {
    if (dataBusy) return // 처리 중엔 실수로 못 닫게 한다
    setPendingData(null)
    setDataError(null)
  }, [dataBusy])

  /** 두 경로(로컬/클라우드) 모두 이 훅으로 끝난다 — 워커의 /data/에 실제로 써야 코드에서 바로 읽힌다 */
  const loadIntoRuntime = useCallback(
    async (name: string, content: string) => {
      const res = await runtime.writeDataFile(name, content)
      return res
    },
    [runtime]
  )

  const applyDataLocal = useCallback(async () => {
    if (!pendingData) return
    setDataBusy(true)
    const res = await loadIntoRuntime(pendingData.name, pendingData.content)
    setDataBusy(false)
    if (res.ok) {
      rememberSessionFile(pendingData.name, res.path)
      setPendingData(null)
    } else {
      setDataError(res.message)
    }
  }, [pendingData, loadIntoRuntime, rememberSessionFile])

  const applyDataCloud = useCallback(async () => {
    if (!pendingData || !signedIn) return
    setDataBusy(true)
    setDataError(null)
    try {
      await createFile(pendingData.name, pendingData.content, DATA_FOLDER)
      const res = await loadIntoRuntime(pendingData.name, pendingData.content)
      setDataBusy(false)
      if (res.ok) rememberSessionFile(pendingData.name, res.path)
      else window.alert(t('data.cloudSavedButFsFailed'))
      setPendingData(null)
      setDataReloadToken((v) => v + 1) // 매니저 모달의 클라우드 목록에 방금 저장한 파일이 보이게
    } catch (err) {
      setDataBusy(false)
      setDataError(err instanceof ApiError ? err.code : 'SAVE_FAILED')
    }
  }, [pendingData, signedIn, loadIntoRuntime, rememberSessionFile, t])

  /** 데이터 관리 모달에서 "저장된 데이터"를 클릭했을 때 — 이번 세션(/data/)으로 불러온다 */
  const handleLoadCloudDataToSession = useCallback(
    async (file: CloudFileMeta) => {
      try {
        const res = await readFile(file.id)
        const written = await runtime.writeDataFile(file.name, res.content)
        if (written.ok) rememberSessionFile(file.name, written.path)
        else window.alert(written.message)
      } catch (err) {
        window.alert(t([`files.error.${err instanceof ApiError ? err.code : 'LOAD_FAILED'}`, 'common.error']))
      }
    },
    [runtime, rememberSessionFile, t]
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
      onOpenDataManager={() => setDataManagerOpen(true)}
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
      onNew={handleNew}
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
          mobileBlocked={runtime.status === 'mobileBlocked'}
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

      {dataManagerOpen && (
        <DataManagerModal
          onClose={() => setDataManagerOpen(false)}
          signedIn={signedIn}
          sessionFiles={sessionDataFiles}
          onPickFile={(file) => void handlePickDataFile(file)}
          onLoadToSession={handleLoadCloudDataToSession}
          reloadToken={dataReloadToken}
        />
      )}

      {/* 데이터 관리 모달 안에서 파일을 고르면 이 확인 모달이 그 위에 뜬다.
          닫히면(성공/취소) 관리 모달로 돌아간다 — 위 dataManagerOpen을 여기서 건드리지 않는다. */}
      {pendingData && (
        <DataUploadModal
          fileName={pendingData.name}
          sizeBytes={new Blob([pendingData.content]).size}
          busy={dataBusy}
          error={dataError}
          signedIn={signedIn}
          onClose={closeDataUploadModal}
          onUseLocal={() => void applyDataLocal()}
          onUseCloud={() => void applyDataCloud()}
        />
      )}

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
