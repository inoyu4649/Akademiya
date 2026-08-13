import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import { deleteFile, listFiles, DATA_FOLDER, type CloudFileMeta } from '../../api/cloud.api'
import { ApiError } from '../../api/client'
import { formatBytes } from '../../utils/bytes'
import styles from './FileBrowser.module.css'

export interface SessionDataFile {
  name: string
  /** Pyodide 가상 파일시스템 경로 — 코드에서 그대로 열 수 있다 (예: /data/scores.csv) */
  path: string
}

interface Props {
  onClose: () => void
  signedIn: boolean
  /** 이번 세션에서 이미 /data/에 준비된 파일들 — IdePage가 들고 있는 상태를 그대로 받는다 */
  sessionFiles: SessionDataFile[]
  /** 파일 선택 즉시 — 로컬/클라우드 선택은 부모(IdePage)의 DataUploadModal이 맡는다 */
  onPickFile: (file: File) => void
  /** Cloud에 저장된 데이터 파일을 이번 세션(/data/)으로 불러온다 */
  onLoadToSession: (file: CloudFileMeta) => Promise<void>
  /** 업로드/삭제 등으로 목록을 다시 불러와야 할 때마다 값을 바꿔서 넘긴다 */
  reloadToken: number
}

/**
 * "데이터 관리" 모달.
 *
 * ⚠️ 새로 디자인하지 않고 FileBrowserModal(Akademiya Cloud 모달)과 똑같은 재료
 *    (Modal + FileBrowser.module.css의 section/row/badge/muted/error)를 그대로 썼다 —
 *    "내 파일 목록을 보여주고 연다"는 모양 자체가 이미 있어서 새로 만들 이유가 없다.
 *
 * 두 구획으로 나눈다.
 *   1) 이번 세션 — 지금 당장 코드에서 열 수 있는 경로(/data/...). 새로고침하면 사라진다.
 *   2) Akademiya Cloud(PyDe Web/data) — 영구 저장된 데이터. "불러오기"를 눌러야 세션에 들어온다.
 */
export default function DataManagerModal({
  onClose,
  signedIn,
  sessionFiles,
  onPickFile,
  onLoadToSession,
  reloadToken,
}: Props) {
  const { t, i18n } = useTranslation()
  const [cloudFiles, setCloudFiles] = useState<CloudFileMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!signedIn) return
    try {
      const res = await listFiles(DATA_FOLDER)
      setCloudFiles(res.files)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'LOAD_FAILED')
    }
  }, [signedIn])

  useEffect(() => {
    // queueMicrotask는 이 저장소 관례 — 이펙트 본문에서 곧바로 setState로 이어지는
    // 호출을 하면 react-hooks/set-state-in-effect가 걸린다
    queueMicrotask(() => void refresh())
  }, [refresh, reloadToken])

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      setCopiedPath(path)
      window.setTimeout(() => setCopiedPath((cur) => (cur === path ? null : cur)), 1500)
    } catch {
      // 클립보드 권한이 없으면 조용히 둔다 — 경로는 화면에 이미 보이니 손으로도 복사 가능
    }
  }

  const load = async (file: CloudFileMeta) => {
    setBusyId(file.id)
    try {
      await onLoadToSession(file)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (file: CloudFileMeta) => {
    if (!window.confirm(t('files.confirmDelete', { name: file.name }))) return
    setBusyId(file.id)
    try {
      await deleteFile(file.id)
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'DELETE_FAILED')
    } finally {
      setBusyId(null)
    }
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })

  return (
    <Modal
      title={t('data.manager.title')}
      onClose={onClose}
      width={620}
      footer={
        <label className="btn btnPrimary">
          {t('data.manager.upload')}
          <input
            type="file"
            accept=".csv,.tsv,.json,.txt,text/csv,text/tab-separated-values,application/json,text/plain"
            className={styles.hiddenInput}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onPickFile(file)
              e.target.value = ''
            }}
          />
        </label>
      }
    >
      {error && <div className={styles.error}>{t([`files.error.${error}`, 'common.error'])}</div>}

      {/* ── 1) 이번 세션 ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('data.manager.session')}</h3>
        {sessionFiles.length === 0 ? (
          <div className={styles.muted}>{t('data.manager.sessionEmpty')}</div>
        ) : (
          <ul className={styles.list}>
            {sessionFiles.map((f) => (
              <li key={f.path} className={styles.row}>
                <div className={styles.rowMain} style={{ cursor: 'default' }}>
                  <span className={styles.name}>{f.name}</span>
                  <span className={styles.meta}>{f.path}</span>
                </div>
                <button className={styles.deleteBtn} onClick={() => void copyPath(f.path)} aria-label={t('data.manager.copyPath')}>
                  {copiedPath === f.path ? t('common.copied') : t('data.manager.copyPath')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.muted}>{t('data.manager.sessionHint')}</p>
      </section>

      {/* ── 2) Akademiya Cloud ───────────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {t('data.manager.cloud')}
          <span className={styles.path}>Akademiya Cloud / PyDe Web / data</span>
        </h3>
        {!signedIn ? (
          <div className={styles.muted}>{t('data.signInRequired')}</div>
        ) : cloudFiles === null ? (
          <div className={styles.muted}>{t('common.loading')}</div>
        ) : cloudFiles.length === 0 ? (
          <div className={styles.muted}>{t('data.manager.cloudEmpty')}</div>
        ) : (
          <ul className={styles.list}>
            {cloudFiles.map((file) => {
              const inSession = sessionFiles.some((f) => f.name === file.name)
              return (
                <li key={file.id} className={styles.row}>
                  <button
                    className={styles.rowMain}
                    onClick={() => void load(file)}
                    disabled={busyId === file.id}
                  >
                    <span className={styles.name}>{file.name}</span>
                    <span className={styles.meta}>
                      {formatBytes(file.sizeBytes)} · {formatTime(file.updatedAt)}
                    </span>
                  </button>
                  {inSession && <span className={styles.badge}>{t('data.manager.loaded')}</span>}
                  <button
                    className={styles.deleteBtn}
                    onClick={() => void remove(file)}
                    disabled={busyId === file.id}
                    aria-label={t('common.delete')}
                  >
                    🗑
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <p className={styles.muted}>{t('data.manager.cloudHint')}</p>
      </section>
    </Modal>
  )
}
