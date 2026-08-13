import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import {
  deleteFile,
  listFiles,
  readFile,
  type CloudFileMeta,
  type FileListResponse,
  type SharedFileMeta,
} from '../../api/cloud.api'
import { ApiError } from '../../api/client'
import type { Draft } from '../../hooks/useLocalDraft'
import styles from './FileBrowser.module.css'

interface Props {
  onClose: () => void
  onOpen: (draft: Draft) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function FileBrowserModal({ onClose, onOpen }: Props) {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<FileListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setData(await listFiles())
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'LOAD_FAILED')
    } finally {
      // ⚠️ 실패했는데 "불러오는 중"이 계속 떠 있으면 사용자는 기다리기만 한다 —
      //    로딩 상태와 데이터 유무를 따로 관리한다
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // queueMicrotask는 이 저장소 관례 — 이펙트 본문에서 곧바로 setState로 이어지는
    // 호출을 하면 react-hooks/set-state-in-effect가 걸린다
    queueMicrotask(() => void refresh())
  }, [refresh])

  const open = async (file: CloudFileMeta | SharedFileMeta) => {
    setBusyId(file.id)
    try {
      const res = await readFile(file.id)
      onOpen({
        name: res.file.name,
        content: res.content,
        cloudId: res.file.id,
        revision: res.file.revision,
        role: res.role,
        savedContent: res.content,
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'LOAD_FAILED')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (file: CloudFileMeta) => {
    // 되돌릴 수 없는 동작이라 반드시 확인을 받는다
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
    <Modal title={t('files.cloud')} onClose={onClose} width={620}>
      {error && <div className={styles.error}>{t([`files.error.${error}`, 'common.error'])}</div>}

      {loading ? (
        <div className={styles.muted}>{t('common.loading')}</div>
      ) : !data ? null : (
        <>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {t('files.myFiles')}
              <span className={styles.path}>Akademiya Cloud / PyDe Web</span>
            </h3>
            {data.files.length === 0 ? (
              <div className={styles.muted}>{t('files.empty')}</div>
            ) : (
              <ul className={styles.list}>
                {data.files.map((file) => (
                  <li key={file.id} className={styles.row}>
                    <button
                      className={styles.rowMain}
                      onClick={() => void open(file)}
                      disabled={busyId === file.id}
                    >
                      <span className={styles.name}>{file.name}</span>
                      <span className={styles.meta}>
                        {formatSize(file.sizeBytes)} · {formatTime(file.updatedAt)}
                      </span>
                    </button>
                    {file.linkShare !== 'none' && (
                      <span className={styles.badge}>{t('share.byLink')}</span>
                    )}
                    <button
                      className={styles.deleteBtn}
                      onClick={() => void remove(file)}
                      disabled={busyId === file.id}
                      aria-label={t('common.delete')}
                    >
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.shared.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t('files.sharedWithMe')}</h3>
              <ul className={styles.list}>
                {data.shared.map((file) => (
                  <li key={file.id} className={styles.row}>
                    <button
                      className={styles.rowMain}
                      onClick={() => void open(file)}
                      disabled={busyId === file.id}
                    >
                      <span className={styles.name}>{file.name}</span>
                      <span className={styles.meta}>
                        {file.ownerName} · {formatTime(file.updatedAt)}
                      </span>
                    </button>
                    {/* 어느 경로로 받은 공유인지 — 이메일 지정과 조직 공유는 동시에도 가능하다 */}
                    {file.viaEmail && <span className={styles.badge}>{t('share.byEmail')}</span>}
                    {file.viaOrg && <span className={styles.badge}>{t('share.byOrg')}</span>}
                    <span className={styles.badge}>
                      {file.role === 'editor' ? t('share.roleEditor') : t('share.roleViewer')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className={styles.usage}>
            {t('files.usage', {
              files: data.usage.files,
              maxFiles: data.limits.maxFiles,
              used: formatSize(data.usage.bytes),
              total: formatSize(data.limits.maxTotalBytes),
            })}
          </div>
        </>
      )}
    </Modal>
  )
}
