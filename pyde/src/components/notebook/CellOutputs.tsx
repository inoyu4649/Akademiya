import { outputText, type NbOutput } from '../../notebook/nbformat'
import styles from './Notebook.module.css'

interface Props {
  outputs: NbOutput[]
}

export default function CellOutputs({ outputs }: Props) {
  if (!outputs.length) return null

  return (
    <div className={styles.outputs}>
      {outputs.map((output, i) => {
        if (output.output_type === 'error') {
          return (
            <pre key={i} className={styles.outputError}>
              {output.traceback.join('\n')}
            </pre>
          )
        }

        if (output.output_type === 'stream') {
          return (
            <pre
              key={i}
              className={output.name === 'stderr' ? styles.outputStderr : styles.outputStream}
            >
              {outputText(output)}
            </pre>
          )
        }

        // execute_result / display_data — 이미지가 있으면 이미지, 없으면 text/plain
        const png = output.data['image/png']
        if (typeof png === 'string') {
          return (
            <div key={i} className={styles.outputImageWrap}>
              <img className={styles.outputImage} src={`data:image/png;base64,${png}`} alt="" />
            </div>
          )
        }
        const text = outputText(output)
        if (!text) return null
        return (
          <pre key={i} className={styles.outputResult}>
            {text}
          </pre>
        )
      })}
    </div>
  )
}
