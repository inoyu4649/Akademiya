import type React from 'react'

export const GMC_PATCH_NOTES_VERSION = 3

interface PatchNoteEntry {
  version: number
  date: string
  title: string
  items: string[]
}

// 새 업데이트를 배포할 때마다 맨 위에 항목을 추가하고 GMC_PATCH_NOTES_VERSION을 올리세요.
const PATCH_NOTES: PatchNoteEntry[] = [
  {
    version: 3,
    date: '2026-07-08',
    title: 'GMCAuto 3.0 업데이트',
    items: [
      '로그인 방식이 "Akademiya로 로그인" 하나로 완전히 통합되었습니다.',
      '권한 관리 기준이 학번에서 Akademiya 계정(이메일)으로 변경되어, Akademiya 계정에서도 권한이 정상적으로 유지됩니다.',
      '자정에 예약을 복사하던 방식을 없애고, 등록해두면 신청 가능한 날마다 자동으로 신청되는 방식으로 개선했습니다.',
      '좌측 메뉴 구조로 전면 개편되었고, 예약 현황을 분 단위 타임라인으로 확인할 수 있습니다.',
      '전체적으로 카드/버튼/모달의 디자인이 더 둥글고 부드러운 스타일로 통일되었고, 다크 모드에도 동일하게 적용되었습니다.',
      '예약 현황에서 시간 블록에 마우스를 올리거나(모바일은 탭) 신청 시간을 바로 확인할 수 있습니다. 통계 열람 이상 권한은 신청자 학번도 함께 표시됩니다.',
      '관리자 통계의 "실패 기록 삭제" 기능을 제거했습니다.',
      '좌측 메뉴 하단에 사용자 정보와 로그아웃 버튼이 화면 크기와 관계없이 항상 표시되도록 개선되었습니다. 개인정보 처리방침·이용약관도 좌측 메뉴에서 전문으로 바로 확인할 수 있습니다.',
      '알림 센터가 추가되어 신청 예약·성공·실패, 중단기간·휴일 안내를 목록으로 확인할 수 있고, PWA 푸시 알림 ON/OFF도 알림 센터 안에서 켜고 끌 수 있습니다.',
      '사용자 메뉴에 계정 설정 화면이 추가되어 Going HAFS 학번·비밀번호 수정과 회원 탈퇴를 이곳에서 처리합니다.',
      '개발자 모드와 GMCAuto API 키 발급 기능이 추가되었습니다. 발급한 키로 조회 가능한 범위(신청 여부/예약 시간/신청 내역)는 보유 권한에 따라 제한됩니다.',
      '서버 실행 환경이 Node.js 24.18.0, 데이터베이스가 MySQL 8.4로 업그레이드되었습니다.',
    ],
  },
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
          <button className="btn btn-primary btn-block" onClick={onClose}>
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
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
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
    borderRadius: 'var(--radius-sm)',
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
}
