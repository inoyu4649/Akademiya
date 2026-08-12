// ============================================================================
//  마크다운 렌더러 (안전한 부분집합)
// ============================================================================
//  ⚠️ 왜 라이브러리를 안 쓰나:
//   1) 마크다운 셀의 내용은 **남이 만든 노트북**에서 올 수 있다(공유·링크 열람).
//      HTML을 문자열로 만들어 주입하는 방식(dangerouslySetInnerHTML)은 그 자체로
//      저장형 XSS 통로가 된다. 이 저장소는 "프론트에 dangerouslySetInnerHTML 없음"을
//      보안 점검에서 확인해 온 원칙이 있어 그걸 깨지 않는다.
//   2) marked+DOMPurify를 넣으면 번들이 커져 서버 egress가 늘어난다.
//  그래서 **React 엘리먼트만 만들어 반환**한다 — 구조적으로 스크립트가 실행될 수 없다.
//  지원 범위는 교육용 노트북에서 실제로 쓰는 것들로 한정한다.
import type { JSX, ReactNode } from 'react'
import styles from './markdown.module.css'

/** javascript:, data:text/html 같은 스킴을 막는다. 상대경로와 앵커는 허용. */
function safeUrl(raw: string): string | null {
  const url = raw.trim()
  if (!url) return null
  if (/^(https?:\/\/|mailto:|#|\/|\.\/|\.\.\/)/i.test(url)) return url
  // 이미지용 data:image/*만 예외로 허용(노트북 첨부 이미지)
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/i.test(url)) return url
  return null
}

let keySeq = 0
const nextKey = () => `md${keySeq++}`

/** 인라인 문법: `code`, **bold**, *italic*, [text](url), ![alt](url) */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // 코드 → 이미지 → 링크 → 굵게 → 기울임 순으로 한 번에 훑는다.
  // 코드가 가장 앞이라 `**foo**` 같은 것이 코드 안에서 강조로 해석되지 않는다.
  const pattern =
    /(`[^`\n]+`)|(!\[([^\]]*)\]\(([^)\s]+)\))|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*)|(\*([^*\n]+)\*)/g

  let last = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))

    if (m[1]) {
      nodes.push(<code key={nextKey()} className={styles.inlineCode}>{m[1].slice(1, -1)}</code>)
    } else if (m[2]) {
      const src = safeUrl(m[4])
      // 스킴이 수상하면 이미지를 그리지 않고 원문을 그대로 보여준다(조용히 삼키지 않음)
      nodes.push(
        src ? (
          <img key={nextKey()} className={styles.image} src={src} alt={m[3]} />
        ) : (
          <span key={nextKey()}>{m[2]}</span>
        )
      )
    } else if (m[5]) {
      const href = safeUrl(m[7])
      nodes.push(
        href ? (
          // 외부 링크는 새 탭 + noopener — opener를 통한 탭 탈취 방지
          <a key={nextKey()} href={href} target="_blank" rel="noopener noreferrer">
            {m[6]}
          </a>
        ) : (
          <span key={nextKey()}>{m[5]}</span>
        )
      )
    } else if (m[8]) {
      nodes.push(<strong key={nextKey()}>{m[9]}</strong>)
    } else if (m[10]) {
      nodes.push(<em key={nextKey()}>{m[11]}</em>)
    }
    last = pattern.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function renderMarkdown(source: string): ReactNode {
  const lines = source.split('\n')
  const blocks: ReactNode[] = []
  let i = 0

  const flushList = (items: string[], ordered: boolean) => {
    if (!items.length) return
    const children = items.map((item) => <li key={nextKey()}>{renderInline(item)}</li>)
    blocks.push(
      ordered ? (
        <ol key={nextKey()} className={styles.list}>{children}</ol>
      ) : (
        <ul key={nextKey()} className={styles.list}>{children}</ul>
      )
    )
  }

  while (i < lines.length) {
    const line = lines[i]

    // 코드 블록 (``` 또는 ```python)
    if (/^\s*```/.test(line)) {
      const fence: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        fence.push(lines[i])
        i++
      }
      i++ // 닫는 ```
      blocks.push(
        <pre key={nextKey()} className={styles.codeBlock}>
          <code>{fence.join('\n')}</code>
        </pre>
      )
      continue
    }

    // 제목
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const Tag = `h${level}` as keyof JSX.IntrinsicElements
      blocks.push(
        <Tag key={nextKey()} className={styles.heading}>
          {renderInline(heading[2])}
        </Tag>
      )
      i++
      continue
    }

    // 수평선
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      blocks.push(<hr key={nextKey()} className={styles.hr} />)
      i++
      continue
    }

    // 인용
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote key={nextKey()} className={styles.quote}>
          {renderInline(quoted.join(' '))}
        </blockquote>
      )
      continue
    }

    // 목록
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const ordered = !!numbered
      const items: string[] = []
      while (i < lines.length) {
        const b = /^\s*[-*+]\s+(.*)$/.exec(lines[i])
        const n = /^\s*\d+[.)]\s+(.*)$/.exec(lines[i])
        if (ordered && n) items.push(n[1])
        else if (!ordered && b) items.push(b[1])
        else break
        i++
      }
      flushList(items, ordered)
      continue
    }

    // 빈 줄
    if (!line.trim()) {
      i++
      continue
    }

    // 문단 — 빈 줄이 나올 때까지 이어 붙인다
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,6}\s|>|[-*+]\s|\d+[.)]\s)/.test(lines[i])) {
      para.push(lines[i])
      i++
    }
    if (para.length) {
      blocks.push(
        <p key={nextKey()} className={styles.paragraph}>
          {renderInline(para.join('\n'))}
        </p>
      )
    } else {
      i++
    }
  }

  return <>{blocks}</>
}
