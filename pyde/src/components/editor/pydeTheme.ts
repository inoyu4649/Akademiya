import type { Monaco } from '@monaco-editor/react'

/**
 * PyDe 에디터 테마.
 *
 * 요구사항: 배경·크롬은 Akademiya 다크 배색, **글자(토큰) 색은 Monaco의 것**을 쓴다.
 * 그래서 base를 'vs-dark'로 두고 `inherit: true` + `rules: []`로 토큰 색은 손대지 않고,
 * 배경/거터/커서 같은 크롬 색만 Akademiya 토큰 값으로 덮어쓴다.
 *
 * 색값은 src/index.css의 CSS 변수와 같은 값이다(Monaco는 CSS 변수를 못 읽어 하드코딩).
 * index.css의 팔레트를 바꾸면 여기도 같이 바꿔야 한다.
 */
export const PYDE_THEME = 'pyde-dark'

/**
 * 테마 자체는 Monaco 전역이지만 **정의는 누군가 이 함수를 불러야 생긴다.**
 * 정의되지 않은 이름을 theme로 주면 Monaco는 조용히 기본 'vs'(밝은 테마)로 떨어져
 * 에디터 안이 하얗게 뜬다 — 그래서 에디터를 붙이는 곳마다 beforeMount에서 부른다.
 * 노트북은 셀마다 에디터가 하나씩이라 중복 호출이 잦으므로 한 번만 실제로 정의한다.
 */
const defined = new WeakSet<Monaco>()

export function definePydeTheme(monaco: Monaco): void {
  if (defined.has(monaco)) return
  defined.add(monaco)
  monaco.editor.defineTheme(PYDE_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1a1a1a', // --bg-base
      'editor.foreground': '#e8e8e8', // --text-primary
      'editorGutter.background': '#1a1a1a',
      'editorLineNumber.foreground': '#6e6e6e', // --text-muted
      'editorLineNumber.activeForeground': '#e8e8e8',
      'editor.lineHighlightBackground': '#212121', // --bg-card
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': '#13e56a', // --accent
      'editor.selectionBackground': '#0a7a3c66', // --accent-dark + alpha
      'editor.inactiveSelectionBackground': '#0a7a3c33',
      'editor.selectionHighlightBackground': '#0a7a3c33',
      'editorIndentGuide.background1': '#2d2d2d',
      'editorIndentGuide.activeBackground1': '#3a3a3a',
      'editorWhitespace.foreground': '#3a3a3a',
      'editorWidget.background': '#212121', // --bg-sidebar
      'editorWidget.border': '#3a3a3a', // --border
      'editorSuggestWidget.background': '#212121',
      'editorSuggestWidget.border': '#3a3a3a',
      'editorSuggestWidget.selectedBackground': '#2d2d2d',
      'editorHoverWidget.background': '#212121',
      'editorHoverWidget.border': '#3a3a3a',
      'editorError.foreground': '#f44336', // --danger
      'editorWarning.foreground': '#ff9800', // --warning
      'scrollbarSlider.background': '#4a4a4a66',
      'scrollbarSlider.hoverBackground': '#4a4a4a99',
      'scrollbarSlider.activeBackground': '#6e6e6e99',
      'editorOverviewRuler.border': '#00000000',
    },
  })
}
