import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { NotificationItem } from '../types'
import styles from './NotificationBell.module.css'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

type OsType = 'ios' | 'ipados' | 'android' | 'windows' | 'mac' | 'linux' | 'unknown'

function detectOs(): OsType {
  const ua = navigator.userAgent
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ipados'
  if (/iPhone/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Windows/.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac'
  if (/Linux/.test(ua)) return 'linux'
  return 'unknown'
}

function InstallGuide({ os }: { os: OsType }) {
  const { t } = useTranslation()
  const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(navigator.userAgent)

  if (os === 'ios' || os === 'ipados') {
    const device = os === 'ipados' ? 'iPad' : 'iPhone'
    return (
      <div>
        <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text)' }}>{t('install.iosTitle', { device })}</p>
        {!isSafari && (
          <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', marginBottom: '12px', fontSize: '13px', color: 'var(--text)' }}
            dangerouslySetInnerHTML={{ __html: t('install.iosNotSafari') }} />
        )}
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text)', lineHeight: 2 }}>
          <li dangerouslySetInnerHTML={{ __html: t('install.step1') }} />
          {os === 'ipados' ? (
            <>
              <li dangerouslySetInnerHTML={{ __html: t('install.iosIpadStep2') }} />
              <li dangerouslySetInnerHTML={{ __html: t('install.iosIpadStep3') }} />
            </>
          ) : (
            <>
              <li dangerouslySetInnerHTML={{ __html: t('install.iosStep2') }} />
              <li dangerouslySetInnerHTML={{ __html: t('install.iosStep3') }} />
              <li dangerouslySetInnerHTML={{ __html: t('install.iosStep4') }} />
            </>
          )}
          <li dangerouslySetInnerHTML={{ __html: t('install.iosStep5') }} />
          <li dangerouslySetInnerHTML={{ __html: t('install.iosStep6') }} />
        </ol>
      </div>
    )
  }

  if (os === 'android') {
    return (
      <div>
        <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text)' }}>{t('install.androidTitle')}</p>
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text)', lineHeight: 2 }}>
          <li dangerouslySetInnerHTML={{ __html: t('install.androidStep1') }} />
          <li dangerouslySetInnerHTML={{ __html: t('install.androidStep2') }} />
          <li dangerouslySetInnerHTML={{ __html: t('install.androidStep3') }} />
          <li dangerouslySetInnerHTML={{ __html: t('install.androidStep4') }} />
        </ol>
      </div>
    )
  }

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text)' }}>{t('install.pcTitle')}</p>
      <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text)', lineHeight: 2 }}>
        <li dangerouslySetInnerHTML={{ __html: t('install.pcStep1') }} />
        <li dangerouslySetInnerHTML={{ __html: t('install.pcStep2') }} />
        <li dangerouslySetInnerHTML={{ __html: t('install.pcStep3') }} />
        <li dangerouslySetInnerHTML={{ __html: t('install.pcStep4') }} />
      </ol>
    </div>
  )
}

function IconBell() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

const TYPE_BADGE_CLASS: Record<string, string> = {
  schedule_registered: 'badgeScheduled',
  apply_success: 'badgeSuccess',
  apply_failed_final: 'badgeFailed',
  suspend_start: 'badgeSuspend',
  holiday_start: 'badgeHoliday',
}

function timeAgo(t: (key: string, opts?: Record<string, unknown>) => string, iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso.replace(' ', 'T'))
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return t('notification.justNow')
  if (diffMin < 60) return t('notification.minutesAgo', { n: diffMin })
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return t('notification.hoursAgo', { n: diffHour })
  const diffDay = Math.floor(diffHour / 24)
  return t('notification.daysAgo', { n: diffDay })
}

const POLL_INTERVAL_MS = 60000

interface NotificationBellProps {
  sessionId: string
}

export default function NotificationBell({ sessionId }: NotificationBellProps) {
  const { t } = useTranslation()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const [notifEnabled, setNotifEnabled] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const [isPwa, setIsPwa] = useState(false)
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [installOs, setInstallOs] = useState<OsType>('unknown')

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?sessionId=${encodeURIComponent(sessionId)}`)
      const data = await res.json() as { success: boolean; notifications?: NotificationItem[]; unreadCount?: number }
      if (data.success) {
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      }
    } catch { /* ignore */ }
  }, [sessionId])

  useEffect(() => {
    queueMicrotask(() => fetchNotifications())
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  useEffect(() => {
    const pwa =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    queueMicrotask(() => setIsPwa(pwa))
    if (pwa && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => setNotifEnabled(!!sub))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleToggleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const width = Math.min(320, window.innerWidth - 16)
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
      setDropStyle({ position: 'fixed', top: rect.bottom + 6, left, width })
      fetchNotifications()
    }
    setOpen(v => !v)
  }

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
    setUnreadCount(0)
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } catch { /* ignore */ }
  }

  const handleItemClick = async (n: NotificationItem) => {
    if (n.is_read) return
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: 1 } : x))
    setUnreadCount(c => Math.max(0, c - 1))
    try {
      await fetch(`/api/notifications/${n.id}/read`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
    } catch { /* ignore */ }
  }

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    const wasUnread = notifications.find(n => n.id === id)?.is_read === 0
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (wasUnread) setUnreadCount(c => Math.max(0, c - 1))
    try {
      await fetch(`/api/notifications/${id}?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
    } catch { /* ignore */ }
  }

  const handleNotifToggle = useCallback(async () => {
    if (!isPwa) {
      setInstallOs(detectOs())
      setShowInstallModal(true)
      return
    }
    if (notifLoading) return
    setNotifLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      if (notifEnabled) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) await sub.unsubscribe()
        await fetch('/api/push/unsubscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        setNotifEnabled(false)
      } else {
        if (!('Notification' in window) || Notification.permission === 'denied') return
        const vapidRes = await fetch('/api/push/vapid-public-key')
        const { publicKey } = await vapidRes.json() as { publicKey: string }
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        })
        const subJSON = JSON.parse(JSON.stringify(sub)) as { endpoint: string; keys?: { p256dh?: string; auth?: string } }
        await fetch('/api/push/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, endpoint: subJSON.endpoint, p256dh: subJSON.keys?.p256dh ?? '', auth: subJSON.keys?.auth ?? '' }),
        })
        setNotifEnabled(true)
      }
    } catch { /* 무시 */ }
    finally { setNotifLoading(false) }
  }, [isPwa, notifEnabled, notifLoading, sessionId])

  return (
    <div className={styles.container} ref={containerRef}>
      {showInstallModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>{t('install.modalTitle')}</h3>
            <InstallGuide os={installOs} />
            <button className="btn btn-primary" onClick={() => setShowInstallModal(false)} style={{ marginTop: '20px', width: '100%' }}>
              {t('install.modalClose')}
            </button>
          </div>
        </div>
      )}

      <button
        ref={buttonRef}
        className={styles.iconBtn}
        onClick={handleToggleOpen}
        title={t('notification.title')}
        aria-label={t('notification.title')}
      >
        <IconBell />
        {unreadCount > 0 && (
          <span className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown} style={dropStyle}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>{t('notification.title')}</span>
            <div className={styles.headerRight}>
              {unreadCount > 0 && (
                <button className={styles.markAllBtn} onClick={handleMarkAllRead}>
                  {t('notification.markAllRead')}
                </button>
              )}
              <button
                className={`${styles.pushToggle} ${notifEnabled ? styles.pushToggleOn : ''}`}
                onClick={handleNotifToggle}
                disabled={notifLoading}
              >
                {notifLoading ? '...' : notifEnabled ? t('notification.pushOn') : t('notification.pushOff')}
              </button>
            </div>
          </div>

          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>{t('notification.empty')}</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  className={`${styles.item} ${!n.is_read ? styles.itemUnread : ''}`}
                  onClick={() => handleItemClick(n)}
                >
                  <div className={styles.itemTop}>
                    <span className={`${styles.typeBadge} ${styles[TYPE_BADGE_CLASS[n.type] || 'badgeScheduled']}`}>
                      {t(`notification.type.${n.type}`, n.type)}
                    </span>
                    <span className={styles.itemTime}>{timeAgo(t, n.created_at)}</span>
                    <button className={styles.deleteBtn} onClick={e => handleDelete(e, n.id)} aria-label="delete">×</button>
                  </div>
                  {n.body && <div className={styles.itemBody}>{n.body}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
