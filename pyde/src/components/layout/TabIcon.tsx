import type { TabLocation } from './tabLocation'

interface Props {
  location: TabLocation
  className?: string
  title?: string
}

/**
 * 이모지 대신 인라인 SVG를 쓴다 — 이모지는 OS마다 모양·크기가 제각각이라
 * 탭 줄의 정렬이 흐트러지고, 색을 현재 텍스트 색에 맞출 수도 없다.
 */
export default function TabIcon({ location, className, title }: Props) {
  const common = {
    className,
    width: 13,
    height: 13,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': title ? undefined : true,
    role: title ? 'img' : undefined,
  }

  if (location === 'cloud') {
    return (
      <svg {...common}>
        {title && <title>{title}</title>}
        <path d="M4.4 12.5h6.9a2.85 2.85 0 0 0 .35-5.68A4 4 0 0 0 4.2 5.9a2.85 2.85 0 0 0 .2 6.6Z" />
      </svg>
    )
  }

  if (location === 'link') {
    return (
      <svg {...common}>
        {title && <title>{title}</title>}
        <path d="M6.6 9.4a2.6 2.6 0 0 0 3.9.3l1.9-1.9a2.6 2.6 0 0 0-3.7-3.7l-1 1" />
        <path d="M9.4 6.6a2.6 2.6 0 0 0-3.9-.3L3.6 8.2a2.6 2.6 0 0 0 3.7 3.7l1-1" />
      </svg>
    )
  }

  // local — 컴퓨터 모니터
  return (
    <svg {...common}>
      {title && <title>{title}</title>}
      <rect x="2" y="3" width="12" height="8" rx="1.2" />
      <path d="M6.2 14h3.6M8 11v3" />
    </svg>
  )
}
