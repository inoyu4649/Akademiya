// ============================================================================
//  Jupyter Notebook (.ipynb) — nbformat v4 읽기/쓰기
// ============================================================================
//  목표는 "Jupyter가 만든 파일을 열 수 있고, 우리가 쓴 파일을 Jupyter가 열 수 있다".
//  그래서 우리가 쓰지 않는 필드(metadata 등)도 **버리지 않고 그대로 보존**한다 —
//  학생이 Colab에서 만든 노트북을 PyDe로 열었다가 저장했을 때 설정이 날아가면 안 된다.
import { PYTHON_VERSION } from '../runtime/pyodideConfig'

export type CellType = 'code' | 'markdown'

/** nbformat의 출력 한 건 (우리가 다루는 종류만 구분하고 나머지는 원본 보존) */
export type NbOutput =
  | { output_type: 'stream'; name: 'stdout' | 'stderr'; text: string[] }
  | { output_type: 'execute_result'; execution_count: number | null; data: NbMimeBundle; metadata: Record<string, unknown> }
  | { output_type: 'display_data'; data: NbMimeBundle; metadata: Record<string, unknown> }
  | { output_type: 'error'; ename: string; evalue: string; traceback: string[] }

export interface NbMimeBundle {
  'text/plain'?: string[]
  'image/png'?: string
  [mime: string]: unknown
}

export interface NbCell {
  id: string
  cell_type: CellType
  source: string
  /** code 셀만 */
  execution_count?: number | null
  outputs?: NbOutput[]
  metadata: Record<string, unknown>
}

export interface Notebook {
  cells: NbCell[]
  metadata: Record<string, unknown>
  nbformat: number
  nbformat_minor: number
}

/** nbformat의 source/text는 문자열이거나 줄 배열이다 — 둘 다 받아준다 */
function joinSource(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw.map((v) => (typeof v === 'string' ? v : '')).join('')
  return ''
}

/**
 * 줄 끝 개행을 유지한 배열로 쪼갠다(Jupyter 관례).
 * 이렇게 저장해야 git diff가 줄 단위로 나오고 Jupyter가 만든 파일과 형태가 같아진다.
 */
function splitSource(text: string): string[] {
  if (!text) return []
  const lines = text.split('\n')
  return lines.map((line, i) => (i === lines.length - 1 ? line : line + '\n')).filter((l, i) => !(i === lines.length - 1 && l === ''))
}

export function newCellId(): string {
  // nbformat 4.5의 cell id 규격: 1~64자, [a-zA-Z0-9-_]
  return crypto.randomUUID().slice(0, 8)
}

export function createCell(cell_type: CellType, source = ''): NbCell {
  return cell_type === 'code'
    ? { id: newCellId(), cell_type, source, execution_count: null, outputs: [], metadata: {} }
    : { id: newCellId(), cell_type, source, metadata: {} }
}

export function createNotebook(): Notebook {
  return {
    cells: [createCell('code', '')],
    metadata: {
      kernelspec: { display_name: 'Python (Pyodide)', language: 'python', name: 'python3' },
      language_info: { name: 'python', version: PYTHON_VERSION, mimetype: 'text/x-python' },
    },
    nbformat: 4,
    nbformat_minor: 5,
  }
}

/**
 * .ipynb 텍스트를 읽는다. 형식이 아니면 null을 반환해 호출자가 안내를 띄우게 한다
 * (여기서 throw하면 파일 하나 잘못 열었다고 앱이 죽는다).
 */
export function parseNotebook(text: string): Notebook | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.cells)) return null

  const cells: NbCell[] = (obj.cells as Record<string, unknown>[]).map((c) => {
    const type: CellType = c.cell_type === 'markdown' ? 'markdown' : 'code'
    const base: NbCell = {
      id: typeof c.id === 'string' && c.id ? c.id : newCellId(),
      cell_type: type,
      source: joinSource(c.source),
      metadata: (c.metadata as Record<string, unknown>) ?? {},
    }
    if (type === 'code') {
      base.execution_count = typeof c.execution_count === 'number' ? c.execution_count : null
      base.outputs = normalizeOutputs(c.outputs)
    }
    return base
  })

  return {
    cells: cells.length ? cells : [createCell('code', '')],
    metadata: (obj.metadata as Record<string, unknown>) ?? {},
    nbformat: typeof obj.nbformat === 'number' ? obj.nbformat : 4,
    nbformat_minor: typeof obj.nbformat_minor === 'number' ? obj.nbformat_minor : 5,
  }
}

function normalizeOutputs(raw: unknown): NbOutput[] {
  if (!Array.isArray(raw)) return []
  const out: NbOutput[] = []
  for (const item of raw as Record<string, unknown>[]) {
    switch (item.output_type) {
      case 'stream':
        out.push({
          output_type: 'stream',
          name: item.name === 'stderr' ? 'stderr' : 'stdout',
          text: splitSource(joinSource(item.text)),
        })
        break
      case 'execute_result':
      case 'display_data': {
        const data = (item.data as NbMimeBundle) ?? {}
        // text/plain은 배열/문자열 둘 다 오므로 배열로 통일해 둔다
        if (data['text/plain'] !== undefined) {
          data['text/plain'] = splitSource(joinSource(data['text/plain']))
        }
        out.push(
          item.output_type === 'execute_result'
            ? {
                output_type: 'execute_result',
                execution_count: typeof item.execution_count === 'number' ? item.execution_count : null,
                data,
                metadata: (item.metadata as Record<string, unknown>) ?? {},
              }
            : {
                output_type: 'display_data',
                data,
                metadata: (item.metadata as Record<string, unknown>) ?? {},
              }
        )
        break
      }
      case 'error':
        out.push({
          output_type: 'error',
          ename: typeof item.ename === 'string' ? item.ename : 'Error',
          evalue: typeof item.evalue === 'string' ? item.evalue : '',
          traceback: Array.isArray(item.traceback) ? (item.traceback as string[]) : [],
        })
        break
      // 알 수 없는 output_type은 버린다(다시 저장할 때 형식을 깨뜨리는 것보다 낫다)
    }
  }
  return out
}

/** Jupyter가 쓰는 것과 같은 모양의 JSON으로 직렬화한다 */
export function serializeNotebook(nb: Notebook): string {
  const cells = nb.cells.map((cell) => {
    if (cell.cell_type === 'markdown') {
      return {
        id: cell.id,
        cell_type: 'markdown',
        metadata: cell.metadata,
        source: splitSource(cell.source),
      }
    }
    return {
      id: cell.id,
      cell_type: 'code',
      execution_count: cell.execution_count ?? null,
      metadata: cell.metadata,
      outputs: (cell.outputs ?? []).map(serializeOutput),
      source: splitSource(cell.source),
    }
  })

  return JSON.stringify(
    { cells, metadata: nb.metadata, nbformat: nb.nbformat, nbformat_minor: nb.nbformat_minor },
    null,
    1 // Jupyter가 들여쓰기 1칸을 쓴다 — 같은 파일을 오갈 때 diff가 덜 튄다
  )
}

function serializeOutput(output: NbOutput): Record<string, unknown> {
  return { ...output }
}

// ── 실행 결과 → nbformat 출력 변환 헬퍼 ──────────────────────────────────────

export function streamOutput(name: 'stdout' | 'stderr', text: string): NbOutput {
  return { output_type: 'stream', name, text: splitSource(text) }
}

export function imageOutput(base64: string): NbOutput {
  return { output_type: 'display_data', data: { 'image/png': base64 }, metadata: {} }
}

export function resultOutput(executionCount: number, text: string): NbOutput {
  return {
    output_type: 'execute_result',
    execution_count: executionCount,
    data: { 'text/plain': splitSource(text) },
    metadata: {},
  }
}

export function errorOutput(traceback: string): NbOutput {
  // "NameError: name 'x' is not defined" 마지막 줄에서 예외 이름/메시지를 뽑는다
  const lines = traceback.split('\n').filter(Boolean)
  const last = lines[lines.length - 1] ?? 'Error'
  const match = /^([A-Za-z_][\w.]*)\s*:\s*([\s\S]*)$/.exec(last)
  return {
    output_type: 'error',
    ename: match ? match[1] : 'Error',
    evalue: match ? match[2] : last,
    traceback: lines,
  }
}

/** 출력에서 화면에 그릴 텍스트를 뽑는다 */
export function outputText(output: NbOutput): string {
  if (output.output_type === 'stream') return output.text.join('')
  if (output.output_type === 'error') return output.traceback.join('\n')
  const plain = output.data['text/plain']
  return Array.isArray(plain) ? plain.join('') : ''
}
