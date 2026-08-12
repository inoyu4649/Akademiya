import type { ReactNode } from 'react'
import styles from './IdeLayout.module.css'

interface Props {
  header: ReactNode
  editor: ReactNode
  canvas: ReactNode
  terminal: ReactNode
}

/**
 * IDE 셸의 뼈대. 각 영역의 내용은 페이지가 주입한다.
 * 영역 크기는 CSS 변수(--canvas-width / --terminal-height)로 조절되므로
 * Phase 4의 드래그 분할선은 이 변수만 바꾸면 된다.
 */
export default function IdeLayout({ header, editor, canvas, terminal }: Props) {
  return (
    <div className={styles.layout}>
      {header}
      <main className={styles.editor}>{editor}</main>
      <aside className={styles.canvas}>{canvas}</aside>
      <section className={styles.terminal}>{terminal}</section>
    </div>
  )
}
