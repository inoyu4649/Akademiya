import { useEffect, type MutableRefObject } from 'react'
import { useNotebook } from '../../notebook/useNotebook'
import type { RunEvent } from '../../runtime/usePyodideRuntime'
import NotebookView from './NotebookView'

export type NotebookApi = ReturnType<typeof useNotebook>

interface Runtime {
  run: (code: string) => number
  interrupt: () => void
  subscribe: (listener: (e: RunEvent) => void) => () => void
}

interface Props {
  runtime: Runtime
  initialSource: string
  onChange: (text: string) => void
  /** 툴바가 실행/중지를 호출할 수 있게 노트북 API를 위로 넘긴다 */
  apiRef: MutableRefObject<NotebookApi | null>
  /** 실행 중 여부는 버튼 모양을 바꿔야 하므로 상태로 올린다 */
  onRunningChange: (running: boolean) => void
}

/**
 * 노트북 상태를 **문서에 종속시키기 위한** 껍데기.
 *
 * ⚠️ 이 컴포넌트는 반드시 `key={docId}`로 렌더해야 한다. 예전처럼 useNotebook을
 *    페이지 수준에 두면, 탭을 옮긴 뒤에도 이전 노트북의 직렬화 결과가 "현재 활성
 *    문서"에 기록되어 .py 파일이 노트북 JSON으로 덮어써질 수 있었다.
 *    탭마다 마운트/언마운트되면 그 사고가 구조적으로 불가능해지고, 별도의 reset 호출도
 *    필요 없어진다.
 */
export default function NotebookPane({
  runtime,
  initialSource,
  onChange,
  apiRef,
  onRunningChange,
}: Props) {
  const nb = useNotebook(runtime, initialSource, onChange)

  useEffect(() => {
    apiRef.current = nb
    return () => {
      apiRef.current = null
    }
  }, [nb, apiRef])

  useEffect(() => {
    onRunningChange(nb.runningCellId !== null)
  }, [nb.runningCellId, onRunningChange])

  return <NotebookView nb={nb} />
}
