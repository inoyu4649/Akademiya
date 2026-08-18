export type ToolbarIconName = 'folder' | 'play' | 'stop' | 'save' | 'download' | 'share' | 'runAll'

interface Props {
  name: ToolbarIconName
  className?: string
}

/**
 * 툴바 아이콘 — TabIcon과 같은 이유로 이모지가 아니라 인라인 SVG를 쓴다
 * (이모지는 OS마다 모양·크기가 달라 줄 정렬이 흐트러지고 현재 텍스트 색을 따라오지 못한다).
 * 휴대폰에서는 라벨 없이 이 아이콘만 남으므로 모양만으로 구분되어야 한다.
 */
export default function ToolbarIcon({ name, className }: Props) {
  const common = {
    className,
    width: 14,
    height: 14,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'folder':
      return (
        <svg {...common}>
          <path d="M1.9 12.4V3.6a.7.7 0 0 1 .7-.7h3.2l1.4 1.6h6.1a.7.7 0 0 1 .7.7v7.2a.7.7 0 0 1-.7.7H2.6a.7.7 0 0 1-.7-.7Z" />
        </svg>
      )
    case 'play':
      // 채워진 삼각형 — 실행은 가장 자주 쓰는 동작이라 무게감을 준다
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M4.6 2.9a.6.6 0 0 1 .92-.5l7 5.1a.6.6 0 0 1 0 1l-7 5.1a.6.6 0 0 1-.92-.5Z" />
        </svg>
      )
    case 'stop':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <rect x="3.4" y="3.4" width="9.2" height="9.2" rx="1.3" />
        </svg>
      )
    case 'runAll':
      // 삼각형 두 개 — "모두 실행"
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M2.2 3.4a.55.55 0 0 1 .85-.46l5 4.15a.55.55 0 0 1 0 .92l-5 4.15a.55.55 0 0 1-.85-.46Z" />
          <path d="M8.4 3.4a.55.55 0 0 1 .85-.46l5 4.15a.55.55 0 0 1 0 .92l-5 4.15a.55.55 0 0 1-.85-.46Z" />
        </svg>
      )
    case 'save':
      // 플로피 디스크
      return (
        <svg {...common}>
          <path d="M2.6 2.6h8.1l2.7 2.7v8.1a.6.6 0 0 1-.6.6H2.6a.6.6 0 0 1-.6-.6V3.2a.6.6 0 0 1 .6-.6Z" />
          <path d="M5 2.6v3.6h5V2.6M4.6 9.6h6.8v4.4H4.6z" />
        </svg>
      )
    case 'download':
      return (
        <svg {...common}>
          <path d="M8 2.4v7.2M5.1 6.9 8 9.8l2.9-2.9M2.6 13.2h10.8" />
        </svg>
      )
    case 'share':
      return (
        <svg {...common}>
          <circle cx="12.1" cy="3.6" r="1.9" />
          <circle cx="3.9" cy="8" r="1.9" />
          <circle cx="12.1" cy="12.4" r="1.9" />
          <path d="M5.6 7.1l4.8-2.6M5.6 8.9l4.8 2.6" />
        </svg>
      )
  }
}
