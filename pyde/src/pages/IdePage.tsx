import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import AppHeader from '../components/layout/AppHeader'
import IdeLayout from '../components/layout/IdeLayout'
import layout from '../components/layout/IdeLayout.module.css'
import BootSplash from '../components/boot/BootSplash'
import { usePyodideRuntime } from '../runtime/usePyodideRuntime'

/**
 * Phase 3: Pyodide 런타임 + 부팅 스플래시까지.
 *  - Phase 4에서 editor/terminal/canvas 자리표시자가 실제 컴포넌트로 교체된다
 */
export default function IdePage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const runtime = usePyodideRuntime()

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

  // 개발 중에만 콘솔에서 런타임을 두드려 볼 수 있게 열어둔다.
  // import.meta.env.DEV 가드라 프로덕션 번들에는 들어가지 않는다.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__pyde = runtime
  }, [runtime])

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

      <IdeLayout
        header={<AppHeader />}
        editor={
          <div className={layout.placeholder}>
            <span className={layout.placeholderTitle}>Monaco Editor</span>
            <span>
              Python {runtime.pythonVersion ?? '—'} · {t('boot.ready')}
            </span>
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
    </>
  )
}
