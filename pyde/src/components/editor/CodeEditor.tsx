import { useCallback, useEffect, useRef } from 'react'
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react'
import { definePydeTheme, PYDE_THEME } from './pydeTheme'
import styles from './CodeEditor.module.css'

interface Props {
  value: string
  onChange: (value: string) => void
  /** Ctrl/Cmd+Enter — 에디터에 포커스가 있어도 실행되게 하려고 여기서도 잡는다 */
  onRun?: () => void
  readOnly?: boolean
  language?: 'python' | 'json'
}

export default function CodeEditor({
  value,
  onChange,
  onRun,
  readOnly = false,
  language = 'python',
}: Props) {
  // 최신 onRun을 담아두는 ref — Monaco 커맨드는 마운트 시 한 번만 등록되므로
  // 클로저에 옛 핸들러가 갇히면 단축키가 오래된 코드를 돌리게 된다.
  // (렌더 중에 ref를 쓰면 react-hooks 규칙 위반이라 이펙트에서 갱신한다)
  const onRunRef = useRef(onRun)
  useEffect(() => {
    onRunRef.current = onRun
  }, [onRun])

  const beforeMount = useCallback((monaco: Monaco) => {
    definePydeTheme(monaco)
  }, [])

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current?.()
    })
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
      onRunRef.current?.()
    })
  }, [])

  return (
    <div className={styles.wrap}>
      <Editor
        language={language}
        theme={PYDE_THEME}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        beforeMount={beforeMount}
        onMount={handleMount}
        loading={<div className={styles.loading} />}
        options={{
          readOnly,
          fontFamily: "'D2Coding', 'Cascadia Code', Consolas, monospace",
          fontSize: 14,
          lineHeight: 22,
          // 교육용이라 화면을 좁게 쓰는 노트북·태블릿이 많다 — 미니맵은 방해만 된다
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          insertSpaces: true,
          renderWhitespace: 'selection',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          padding: { top: 12, bottom: 12 },
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
          // 파이썬은 들여쓰기가 문법이라 가이드를 켜 두는 편이 학습에 낫다
          guides: { indentation: true, bracketPairs: true },
          bracketPairColorization: { enabled: true },
        }}
      />
    </div>
  )
}
