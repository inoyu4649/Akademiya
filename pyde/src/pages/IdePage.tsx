import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import AppHeader from '../components/layout/AppHeader'
import IdeLayout from '../components/layout/IdeLayout'
import layout from '../components/layout/IdeLayout.module.css'

/**
 * Phase 2: 셸만 세운 상태.
 *  - Phase 3에서 부팅 스플래시 + Pyodide 워커가 이 위에 얹힌다
 *  - Phase 4에서 editor/terminal/canvas 자리표시자가 실제 컴포넌트로 교체된다
 */
export default function IdePage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()

  // 로그인 실패 시 서버가 /?authError=... 로 되돌려 보낸다.
  // 최초 렌더에서 한 번만 읽어 두고(지연 초기화) URL에서는 지운다 —
  // 이펙트 안에서 setState로 옮기면 react-hooks/set-state-in-effect에 걸린다.
  const [authError] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('authError')
  )

  useEffect(() => {
    if (!params.has('authError')) return
    const next = new URLSearchParams(params)
    next.delete('authError')
    setParams(next, { replace: true })
  }, [params, setParams])

  return (
    <IdeLayout
      header={<AppHeader />}
      editor={
        <div className={layout.placeholder}>
          <span className={layout.placeholderTitle}>Monaco Editor</span>
          <span>{t('boot.subtitle')}</span>
          {authError && (
            <span style={{ color: 'var(--danger)' }}>
              {t([`auth.error.${authError}`, 'common.error'])}
            </span>
          )}
        </div>
      }
      canvas={<div className={layout.placeholder}>{t('canvas.empty')}</div>}
      terminal={<div className={layout.placeholder}>{t('terminal.status.idle')}</div>}
    />
  )
}
