import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Modal.module.css'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}

export default function Modal({ title, onClose, children, footer, width }: Props) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Esc로 닫기 + 열릴 때 다이얼로그로 포커스 이동(키보드 사용자)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        className={styles.dialog}
        style={width ? ({ '--modal-width': `${width}px` } as React.CSSProperties) : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={dialogRef}
        // 다이얼로그 안을 눌렀을 때 오버레이의 닫기가 발동하지 않게 막는다
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <span className={styles.title}>{title}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.foot}>{footer}</div>}
      </div>
    </div>
  )
}
