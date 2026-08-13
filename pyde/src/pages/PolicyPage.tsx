// 개인정보 처리방침·이용약관 전문 페이지.
//
// 「개인정보 처리방침 작성지침」(2026.4.)에 맞춰:
//  · 제목 → 서문 → 목차 → 본문 순으로 구성하고
//  · 목차 항목을 누르면 해당 조항으로 이동하며
//  · 로그인 여부와 관계없이 첫 화면(헤더 링크)에서 바로 닿을 수 있게 했다.
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { pydePrivacyPolicy, pydeTermsOfUse } from '../policyContent'
import styles from './PolicyPage.module.css'

interface Props {
  kind: 'privacy' | 'terms'
}

export default function PolicyPage({ kind }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const policy = kind === 'privacy' ? pydePrivacyPolicy : pydeTermsOfUse

  return (
    <div className={styles.page}>
      <div className={styles.sheet}>
        <header className={styles.head}>
          <img className={styles.logo} src="/pyde_logo.png" alt="" />
          <div className={styles.headText}>
            <h1 className={styles.title}>{policy.title}</h1>
            <span className={styles.meta}>
              v{policy.version} · {t('policy.effective', { date: policy.effectiveDate })}
            </span>
          </div>
        </header>

        <div className={styles.actions}>
          {/* 직접 URL로 들어온 경우 history가 없을 수 있어 홈으로도 갈 수 있게 둔다 */}
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            {t('policy.back')}
          </button>
          <Link className={styles.backBtn} to="/">
            {t('policy.home')}
          </Link>
          <Link
            className={styles.backBtn}
            to={kind === 'privacy' ? '/terms' : '/privacy'}
          >
            {kind === 'privacy' ? t('policy.termsShort') : t('policy.privacyShort')}
          </Link>
        </div>

        <p className={styles.preamble}>{policy.preamble}</p>

        <nav className={styles.toc} aria-label={t('policy.toc')}>
          <h2 className={styles.tocTitle}>{t('policy.toc')}</h2>
          <ol className={styles.tocList}>
            {policy.sections.map((sec) => (
              <li key={sec.id}>
                <a className={styles.tocLink} href={`#${sec.id}`}>
                  {sec.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {policy.sections.map((sec) => (
          <section key={sec.id} id={sec.id} className={styles.section}>
            <h2 className={styles.sectionTitle}>{sec.title}</h2>
            {sec.content.split('\n').map((line, i) =>
              line === '' ? (
                <div key={i} className={styles.blank} />
              ) : (
                <p key={i} className={styles.line}>
                  {line}
                </p>
              )
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
