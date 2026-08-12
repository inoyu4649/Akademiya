import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import { ApiError } from '../../api/client'
import {
  listMyOrgs,
  listShares,
  removeShare,
  setLinkShare,
  shareWithOrg,
  shareWithUser,
  type LinkShare,
  type ShareListResponse,
  type ShareRole,
} from '../../api/cloud.api'
import styles from './Share.module.css'

interface Props {
  fileId: number
  fileName: string
  onClose: () => void
  /** 링크 공개 상태가 바뀌면 알려 파일 목록 배지를 맞춘다 */
  onLinkShareChange?: (share: LinkShare) => void
}

type Org = { id: number; name: string; code: string }

export default function ShareModal({ fileId, fileName, onClose, onLinkShareChange }: Props) {
  const { t } = useTranslation()
  const [shares, setShares] = useState<ShareListResponse | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [email, setEmail] = useState('')
  const [emailRole, setEmailRole] = useState<ShareRole>('viewer')
  const [orgId, setOrgId] = useState<string>('')
  const [orgRole, setOrgRole] = useState<ShareRole>('viewer')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setShares(await listShares(fileId))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'LOAD_FAILED')
    }
  }, [fileId])

  useEffect(() => {
    // queueMicrotask는 이 저장소 관례(react-hooks/set-state-in-effect 회피)
    queueMicrotask(() => {
      void refresh()
      // 조직 목록은 실패해도 치명적이지 않다(조직 미가입 사용자가 대부분)
      listMyOrgs()
        .then((res) => setOrgs(res.orgs))
        .catch(() => setOrgs([]))
    })
  }, [refresh])

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'SHARE_FAILED')
    } finally {
      setBusy(false)
    }
  }

  const linkUrl = shares?.link.token ? `${window.location.origin}/s/${shares.link.token}` : null

  const copyLink = async () => {
    if (!linkUrl) return
    try {
      await navigator.clipboard.writeText(linkUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // 클립보드 권한이 없으면 사용자가 직접 복사할 수 있게 입력창을 그대로 둔다
    }
  }

  return (
    <Modal title={`${t('share.title')} — ${fileName}`} onClose={onClose} width={560}>
      {error && <div className={styles.error}>{t([`share.error.${error}`, 'common.error'])}</div>}

      {/* ── 1) 이메일로 지정 ───────────────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('share.byEmail')}</h3>
        <form
          className={styles.row}
          onSubmit={(e) => {
            e.preventDefault()
            if (!email.trim()) return
            void run(async () => {
              await shareWithUser(fileId, email.trim(), emailRole)
              setEmail('')
            })
          }}
        >
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('share.emailPlaceholder')}
            disabled={busy}
          />
          <select
            className={styles.select}
            value={emailRole}
            onChange={(e) => setEmailRole(e.target.value as ShareRole)}
            disabled={busy}
          >
            <option value="viewer">{t('share.roleViewer')}</option>
            <option value="editor">{t('share.roleEditor')}</option>
          </select>
          <button className="btn btnPrimary" type="submit" disabled={busy || !email.trim()}>
            {t('share.add')}
          </button>
        </form>

        {shares?.users.length ? (
          <ul className={styles.list}>
            {shares.users.map((u) => (
              <li key={u.id} className={styles.item}>
                <span className={styles.itemName}>
                  {u.display_name}
                  <span className={styles.itemSub}>{u.email}</span>
                </span>
                <span className={styles.roleTag}>
                  {u.role === 'editor' ? t('share.roleEditor') : t('share.roleViewer')}
                </span>
                <button
                  className={styles.removeBtn}
                  onClick={() => void run(() => removeShare(fileId, u.id))}
                  disabled={busy}
                >
                  {t('share.remove')}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ── 2) 조직 단위 ──────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('share.byOrg')}</h3>
        {orgs.length === 0 ? (
          <div className={styles.muted}>{t('share.noOrgs')}</div>
        ) : (
          <form
            className={styles.row}
            onSubmit={(e) => {
              e.preventDefault()
              if (!orgId) return
              void run(async () => {
                await shareWithOrg(fileId, Number(orgId), orgRole)
                setOrgId('')
              })
            }}
          >
            <select
              className={styles.input}
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              disabled={busy}
            >
              <option value="">{t('share.selectOrg')}</option>
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} [{org.code}]
                </option>
              ))}
            </select>
            <select
              className={styles.select}
              value={orgRole}
              onChange={(e) => setOrgRole(e.target.value as ShareRole)}
              disabled={busy}
            >
              <option value="viewer">{t('share.roleViewer')}</option>
              <option value="editor">{t('share.roleEditor')}</option>
            </select>
            <button className="btn btnPrimary" type="submit" disabled={busy || !orgId}>
              {t('share.add')}
            </button>
          </form>
        )}

        {shares?.orgs.length ? (
          <ul className={styles.list}>
            {shares.orgs.map((o) => (
              <li key={o.id} className={styles.item}>
                <span className={styles.itemName}>
                  {o.name}
                  <span className={styles.itemSub}>[{o.code}]</span>
                </span>
                <span className={styles.roleTag}>
                  {o.role === 'editor' ? t('share.roleEditor') : t('share.roleViewer')}
                </span>
                <button
                  className={styles.removeBtn}
                  onClick={() => void run(() => removeShare(fileId, o.id))}
                  disabled={busy}
                >
                  {t('share.remove')}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ── 3) 링크 공개 ──────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('share.byLink')}</h3>
        <div className={styles.linkOptions}>
          {(['none', 'viewer', 'editor'] as LinkShare[]).map((option) => (
            <label key={option} className={styles.radio}>
              <input
                type="radio"
                name="linkShare"
                checked={(shares?.link.share ?? 'none') === option}
                disabled={busy}
                onChange={() =>
                  void run(async () => {
                    await setLinkShare(fileId, option)
                    onLinkShareChange?.(option)
                  })
                }
              />
              <span>
                {option === 'none'
                  ? t('share.linkOff')
                  : option === 'viewer'
                    ? t('share.roleViewer')
                    : t('share.roleEditor')}
              </span>
            </label>
          ))}
        </div>

        {linkUrl && (
          <div className={styles.row}>
            <input className={styles.input} value={linkUrl} readOnly onFocus={(e) => e.target.select()} />
            <button className="btn btnGhost" onClick={() => void copyLink()}>
              {copied ? t('common.copied') : t('share.copyLink')}
            </button>
          </div>
        )}

        {/* 익명 방문자는 링크가 editor여도 항상 읽기 전용이라는 점을 분명히 알린다 */}
        {(shares?.link.share ?? 'none') !== 'none' && (
          <p className={styles.notice}>{t('share.anonymousReadOnly')}</p>
        )}
      </section>
    </Modal>
  )
}
