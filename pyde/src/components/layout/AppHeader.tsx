import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/authContext'
import { SUPPORTED_LANGS, setLanguage, type SupportedLang } from '../../i18n'
import UsagePanel from './UsagePanel'
import styles from './AppHeader.module.css'

const LANG_LABELS: Record<SupportedLang, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  zh: '中文',
}

interface Props {
  /** 파일/실행/저장/공유 등 편집기 액션 — Phase 4 이후 채워진다 */
  children?: React.ReactNode
}

export default function AppHeader({ children }: Props) {
  const { t, i18n } = useTranslation()
  const { user, signIn, signOut } = useAuth()
  const [usageOpen, setUsageOpen] = useState(false)
  const userRef = useRef<HTMLDivElement>(null)

  // 바깥을 누르거나 Esc를 누르면 닫는다(탭 바의 + 메뉴와 같은 규칙)
  useEffect(() => {
    if (!usageOpen) return
    const onDown = (e: MouseEvent) => {
      if (!userRef.current?.contains(e.target as Node)) setUsageOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUsageOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [usageOpen])

  const currentLang = (SUPPORTED_LANGS as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLang)
    : 'ko'

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <img className={styles.logo} src="/pyde_logo.png" alt="" />
        <span className={styles.brandName}>{t('app.name')}</span>
      </div>

      {children ? (
        <>
          <div className={styles.divider} />
          <div className={styles.actions}>{children}</div>
        </>
      ) : null}

      <div className={styles.spacer} />

      <div className={styles.right}>
        {/* 개인정보 처리방침은 「개인정보 처리방침 작성지침」상 로그인 여부와 관계없이
            첫 화면에서 바로 찾을 수 있어야 한다 — 그래서 헤더에 상시 노출한다. */}
        <nav className={styles.policyLinks}>
          <Link className={styles.policyLink} to="/privacy">
            {t('policy.privacyShort')}
          </Link>
          <span aria-hidden="true">·</span>
          <Link className={styles.policyLink} to="/terms">
            {t('policy.termsShort')}
          </Link>
        </nav>

        <select
          className={styles.langSelect}
          value={currentLang}
          onChange={(e) => setLanguage(e.target.value as SupportedLang)}
          aria-label={t('common.language')}
        >
          {SUPPORTED_LANGS.map((lang) => (
            <option key={lang} value={lang}>
              {LANG_LABELS[lang]}
            </option>
          ))}
        </select>

        {user === undefined ? null : user ? (
          <div className={styles.user} ref={userRef}>
            {/* 프로필을 누르면 PyDe Cloud 사용량이 열린다 */}
            <button
              className={styles.profileBtn}
              onClick={() => setUsageOpen((v) => !v)}
              aria-expanded={usageOpen}
              aria-haspopup="dialog"
              title={t('usage.title')}
            >
              {/* 아바타는 Akademiya가 공개 서빙하는 URL이라 인증 없이 로드된다 */}
              <img
                className={styles.avatar}
                src={user.picture ?? 'https://akademiya.kr/default-avatar.svg'}
                alt=""
              />
              <span className={styles.userName}>{user.name || user.email}</span>
            </button>
            <button
              className={`btn btnGhost ${styles.signInBtn}`}
              onClick={() => {
                // 다음에 다시 로그인했을 때 패널이 열린 채로 뜨지 않도록 여기서 닫는다
                setUsageOpen(false)
                void signOut()
              }}
            >
              {t('auth.signOut')}
            </button>

            {usageOpen && <UsagePanel />}
          </div>
        ) : (
          <>
            <span className={styles.guestBadge}>{t('auth.guestMode')}</span>
            {/* 공식 브랜드 아이콘 — OpenOAuth 가이드 "브랜드 아이콘" 절.
                로고의 비율·색상은 변경하지 않는다. 고배율 화면용 2x는 srcset으로. */}
            <button className={styles.akademiyaBtn} onClick={() => signIn()}>
              <img
                src="https://akademiya.kr/brand/akademiya-icon-32.png"
                srcSet="https://akademiya.kr/brand/akademiya-icon-64.png 2x"
                width={18}
                height={18}
                alt=""
              />
              <span>{t('auth.signIn')}</span>
            </button>
          </>
        )}
      </div>
    </header>
  )
}
