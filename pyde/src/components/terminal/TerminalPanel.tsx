import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import type { OutputKind, OutputListener, RunStatus } from '../../runtime/useRunner'
import { loadXterm } from './xtermLoader'
import styles from './TerminalPanel.module.css'

interface Props {
  /** useRunner의 onOutput — 마운트 중에만 구독하고 언마운트 시 해지한다 */
  onOutput: (listener: OutputListener) => () => void
  status: RunStatus
  elapsedMs: number | null
  /** Python이 input()에서 한 줄을 기다리는 중 — 터미널이 입력을 받는 모드로 바뀐다 */
  waitingForInput: boolean
  onSendStdin: (text: string) => void
  onStop: () => void
  onClear: () => void
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Akademiya 다크 테마 색상을 xterm ANSI 팔레트로 옮긴다(라이트 모드는 없다 — index.css 참고) */
function buildTheme() {
  const accent = cssVar('--accent') || '#13e56a'
  const danger = cssVar('--danger') || '#f44336'
  const warning = cssVar('--warning') || '#ff9800'
  return {
    background: cssVar('--bg-sidebar') || '#212121',
    foreground: cssVar('--text-primary') || '#e8e8e8',
    cursor: accent,
    cursorAccent: cssVar('--bg-sidebar') || '#212121',
    selectionBackground: 'rgba(19, 229, 106, 0.25)',
    black: '#1a1a1a',
    red: danger,
    green: accent,
    yellow: warning,
    blue: '#4aa3ff',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: cssVar('--text-primary') || '#e8e8e8',
    brightBlack: cssVar('--text-muted') || '#6e6e6e',
    brightRed: danger,
    brightGreen: cssVar('--accent-hover') || accent,
    brightYellow: warning,
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff',
  }
}

const BACKSPACE = '\x7f'
const CTRL_C = '\x03'
const ESC = '\x1b'

/** 출력 종류별 ANSI 색 래핑. 'out'은 손대지 않는다(기본 전경색 그대로) */
function colorize(kind: OutputKind, text: string): string {
  switch (kind) {
    case 'err':
      return `${ESC}[33m${text}${ESC}[0m`
    case 'result':
      return `${ESC}[32m${text}${ESC}[0m\r\n`
    case 'traceback':
      return `\r\n${ESC}[31m${text}${ESC}[0m\r\n`
    default:
      return text
  }
}

export default function TerminalPanel({
  onOutput,
  status,
  elapsedMs,
  waitingForInput,
  onSendStdin,
  onStop,
  onClear,
}: Props) {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [ready, setReady] = useState(false)

  // onData 클로저는 마운트 시 한 번만 등록되므로, 매 렌더 바뀌는 값들은 ref로 최신화한다
  // (CodeEditor.tsx의 onRunRef와 같은 패턴).
  const waitingRef = useRef(waitingForInput)
  const statusRef = useRef(status)
  const onSendStdinRef = useRef(onSendStdin)
  const onStopRef = useRef(onStop)
  useEffect(() => {
    waitingRef.current = waitingForInput
    // 입력을 기다리는 순간 커서를 터미널로 옮긴다 — 그래야 바로 타이핑할 수 있고,
    // 휴대폰에서는 이때 화면 키보드가 올라온다(포커스 없이는 아예 입력할 방법이 없다).
    if (waitingForInput) termRef.current?.focus()
  }, [waitingForInput])
  useEffect(() => {
    statusRef.current = status
  }, [status])
  useEffect(() => {
    onSendStdinRef.current = onSendStdin
  }, [onSendStdin])
  useEffect(() => {
    onStopRef.current = onStop
  }, [onStop])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let unsubscribeOutput: (() => void) | null = null

    void loadXterm().then(({ Terminal: TerminalCtor, FitAddon: FitAddonCtor }) => {
      if (disposed) return

      const term = new TerminalCtor({
        theme: buildTheme(),
        fontFamily: "'D2Coding', 'Cascadia Code', Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        scrollback: 5000,
        // Python stdout은 LF만 쓴다 — CR 없이도 다음 줄 맨 앞으로 가게 한다
        convertEol: true,
      })
      const fitAddon = new FitAddonCtor()
      term.loadAddon(fitAddon)
      term.open(host)

      termRef.current = term
      fitRef.current = fitAddon
      setReady(true)
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__pydeTerm = term

      // 안내 문구 — 실제 출력이 오면 스크롤에 밀려 자연스럽게 사라진다
      term.write(`\x1b[90m${t('terminal.hint')}\x1b[0m\r\n`)

      requestAnimationFrame(() => fitAddon.fit())

      // 사용자가 타이핑한 줄을 직접 조립한다 — xterm은 셸이 아니라서 에코를 대신 해주지 않는다
      let lineBuf = ''
      term.onData((data) => {
        if (data === CTRL_C) {
          if (statusRef.current === 'running') onStopRef.current()
          return
        }
        if (!waitingRef.current) return // 입력 대기 중이 아니면 읽기 전용
        for (const ch of data) {
          if (ch === '\r' || ch === '\n') {
            const line = lineBuf
            lineBuf = ''
            term.write('\r\n')
            onSendStdinRef.current(line)
          } else if (ch === BACKSPACE || ch === '\b') {
            if (lineBuf.length > 0) {
              lineBuf = lineBuf.slice(0, -1)
              term.write('\b \b')
            }
          } else if (ch >= ' ' || ch === '\t') {
            // 그 외 제어문자(화살표 등의 이스케이프 시퀀스 포함)는 무시한다
            lineBuf += ch
            term.write(ch)
          }
        }
      })

      unsubscribeOutput = onOutput((kind, text) => term.write(colorize(kind, text)))

      resizeObserver = new ResizeObserver(() => fitAddon.fit())
      resizeObserver.observe(host)
    })

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      unsubscribeOutput?.()
      termRef.current?.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // onOutput/t는 마운트 시점 값으로 충분하다 — 매 렌더 재구독할 이유가 없다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClear = () => {
    onClear()
    termRef.current?.clear()
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>{t('terminal.title')}</span>

        <span className={`${styles.badge} ${styles[status]}`} role="status" aria-live="polite">
          <span className={styles.dot} aria-hidden="true" />
          {t(`terminal.status.${status}`)}
        </span>

        {waitingForInput && (
          <span className={styles.inputBadge}>
            <span className={styles.inputDot} aria-hidden="true" />
            {t('terminal.waitingInput')}
          </span>
        )}

        {elapsedMs !== null && (
          <span className={styles.elapsed}>
            {t('terminal.elapsed', { seconds: (elapsedMs / 1000).toFixed(2) })}
          </span>
        )}

        <span className={styles.spacer} />
        <button className={styles.clearBtn} onClick={handleClear}>
          {t('terminal.clear')}
        </button>
      </div>

      <div className={styles.termWrap}>
        <div className={styles.termHost} ref={hostRef} />
        {!ready && <div className={styles.loading} />}
      </div>
    </div>
  )
}
