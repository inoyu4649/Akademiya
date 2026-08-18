import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import styles from './PolicyFooter.module.css'

/**
 * 휴대폰 전용 하단 줄 — 처리방침·약관 링크.
 *
 * 데스크톱에서는 이 링크가 헤더 오른쪽에 있지만(AppHeader), 좁은 화면에서는 헤더에
 * 브랜드·언어·계정까지 함께 들어가 줄이 무너진다. 「개인정보 처리방침 작성지침」이
 * 요구하는 "첫 화면에서 바로 찾을 수 있을 것"은 스크롤 없이 보이는 이 자리로도 충족된다.
 */
export default function PolicyFooter() {
  const { t } = useTranslation()

  return (
    <nav className={styles.footer}>
      <Link className={styles.link} to="/privacy">
        {t('policy.privacyShort')}
      </Link>
      <span aria-hidden="true">·</span>
      <Link className={styles.link} to="/terms">
        {t('policy.termsShort')}
      </Link>
    </nav>
  )
}
