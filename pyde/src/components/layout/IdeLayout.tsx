import type { ReactNode } from 'react'
import styles from './IdeLayout.module.css'

interface Props {
  header: ReactNode
  /** 열려 있는 파일 탭 줄 */
  tabs: ReactNode
  editor: ReactNode
  /** 노트북 모드에서는 출력이 셀 안에 붙으므로 두 패널을 쓰지 않는다 */
  canvas?: ReactNode
  terminal?: ReactNode
  /** 맨 아래 한 줄(휴대폰의 처리방침·약관). 없으면 그 행 자체가 생기지 않는다 */
  footer?: ReactNode
}

/**
 * IDE 셸의 뼈대. 각 영역의 내용은 페이지가 주입한다.
 * 영역 크기는 CSS 변수(--canvas-width / --terminal-height)로 조절된다.
 */
export default function IdeLayout({ header, tabs, editor, canvas, terminal, footer }: Props) {
  // 노트북은 Jupyter처럼 셀마다 출력을 달고 있어 아래·오른쪽 패널이 오히려 방해가 된다
  const split = canvas !== undefined && terminal !== undefined
  const base = split ? styles.layout : styles.layoutFull

  return (
    <div className={`${base} ${footer ? styles.withFooter : ''}`}>
      {header}
      {tabs}
      <main className={styles.editor}>{editor}</main>
      {split && (
        <>
          <aside className={styles.canvas}>{canvas}</aside>
          <section className={styles.terminal}>{terminal}</section>
        </>
      )}
      {footer}
    </div>
  )
}
