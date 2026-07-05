import type React from 'react'

export const GMC_PATCH_NOTES_VERSION = 2

interface PatchNoteEntry {
  version: number
  date: string
  title: string
  items: string[]
}

// 새 업데이트를 배포할 때마다 맨 위에 항목을 추가하고 GMC_PATCH_NOTES_VERSION을 올리세요.
const PATCH_NOTES: PatchNoteEntry[] = [
  {
    version: 2,
    date: '2026-07-05',
    title: 'GMCAuto v2.9.1 업데이트',
    items: [
      'Akademiya 계정 연동 과정의 보안을 강화했습니다. 이제 연동은 로그인으로 검증된 본인 계정에 대해서만 처리됩니다.',
      '연동 화면을 오래 열어둔 경우, 안전을 위해 다시 로그인하도록 변경되었습니다.',
    ],
  },
  {
    version: 1,
    date: '2026-07-04',
    title: 'GMCAuto v2.9 업데이트',
    items: [
      'Akademiya 로그인 방식이 Akademiya OpenOAuth 표준 방식으로 변경되었습니다.',
      'Akademiya 계정으로 로그인할 때 권한이 초기화되던 문제를 수정했습니다.',
      '2학기 GMCAuto 3 업데이트 관련 안내가 홈 화면 상단에 추가되었습니다. 꼭 확인해주세요.',
    ],
  },
]

interface PatchNotesModalProps {
  onClose: () => void
}

export default function PatchNotesModal({ onClose }: PatchNotesModalProps) {
  const latest = PATCH_NOTES[0]

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>업데이트 안내</h2>
          <p style={styles.subtitle}>새로운 업데이트 내용을 확인해주세요.</p>
          <span style={styles.version}>{latest.title} · {latest.date}</span>
        </div>

        <div style={styles.content}>
          <ul style={styles.list}>
            {latest.items.map((item, i) => (
              <li key={i} style={styles.listItem}>{item}</li>
            ))}
          </ul>
        </div>

        <div style={styles.footer}>
          <button style={styles.btn} onClick={onClose}>
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modal: {
    background: 'var(--card-bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '20px 24px 14px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  title: {
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--text)',
    margin: '0 0 5px',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text-secondary, #9ca3af)',
    margin: '0 0 6px',
  },
  version: {
    fontSize: '11px',
    color: 'var(--text-secondary, #9ca3af)',
    background: 'var(--bg, #1e1e1e)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '2px 8px',
    display: 'inline-block',
  },
  content: {
    overflowY: 'auto',
    flex: 1,
    padding: '18px 24px',
  },
  list: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '13px',
    lineHeight: 1.9,
    color: 'var(--text)',
  },
  listItem: {
    marginBottom: '4px',
  },
  footer: {
    padding: '14px 24px 18px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  btn: {
    width: '100%',
    padding: '10px',
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
}
