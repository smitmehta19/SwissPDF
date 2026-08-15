import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import FileDropZone from '../components/FileDropZone.jsx'
import { baseName } from '../components/usePdfFiles.js'
import { assertValidOutput } from '../lib/pdfOps.js'
import { deliverOutputs } from '../lib/deliver.js'
import { formatBytes } from '../lib/download.js'

let nextId = 1

// Repair accepts files that FAIL normal validation — that's the whole point —
// so it has its own intake with no pdf-lib gate.
export default function RepairTool() {
  const [items, setItems] = useState([]) // { id, file, bytes, result }
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [status, setStatus] = useState(null)

  const addFiles = async (files) => {
    const newItems = []
    for (const file of files) {
      newItems.push({ id: nextId++, file, bytes: await file.arrayBuffer(), result: null })
    }
    setItems((prev) => [...prev, ...newItems])
  }

  const remove = (id) => setItems((prev) => prev.filter((it) => it.id !== id))

  const repair = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { repairPdf } = await import('../lib/mupdfOps.js')
      const outputs = []
      const updated = []
      for (const item of items) {
        setProgress(item.file.name)
        try {
          const res = await repairPdf(item.bytes)
          await assertValidOutput(res.bytes)
          // Honesty check: pages whose data was physically destroyed graft back
          // as empty pages. Count them so the user knows what to expect.
          const { getPageTexts } = await import('../lib/pdfText.js')
          const texts = await getPageTexts(res.bytes).catch(() => null)
          const emptyPages = texts ? texts.filter((t) => !t.trim()).length : 0
          outputs.push({ name: `${baseName(item.file.name)}-repaired.pdf`, bytes: res.bytes })
          updated.push({ ...item, result: { ok: true, ...res, emptyPages } })
        } catch (err) {
          updated.push({ ...item, result: { ok: false, error: err.message } })
        }
      }
      setItems(updated)
      const okCount = updated.filter((it) => it.result?.ok).length
      if (outputs.length > 0) {
        const summary = await deliverOutputs(outputs, 'swisspdf-repaired.zip')
        setStatus({
          kind: 'ok',
          text: `${okCount} of ${updated.length} file${updated.length === 1 ? '' : 's'} repaired. ${summary}`,
        })
      } else {
        setStatus({
          kind: 'error',
          text: 'No file could be repaired — the details are listed per file below.',
        })
      }
    } catch (err) {
      setStatus({ kind: 'error', text: `Repair failed: ${err.message}` })
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const describeResult = (result) => {
    if (!result) return null
    if (!result.ok) return result.error
    const parts = [`${result.recovered} of ${result.pageCount} pages recovered`]
    if (result.rasterized > 0) parts.push(`${result.rasterized} rebuilt as images`)
    if (result.lost > 0) parts.push(`${result.lost} beyond saving`)
    if (result.emptyPages > 0) {
      parts.push(
        `${result.emptyPages} came back with no visible content — that data was in the destroyed part of the file`,
      )
    }
    return parts.join(', ')
  }

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />
      <p className="option-help">
        For files that won't open. Salvageable pages are recovered intact; partly damaged ones are rebuilt as images.
      </p>

      {items.length > 0 && (
        <ul className="file-list">
          {items.map((item) => (
            <li
              key={item.id}
              className={`file-row ${item.result && !item.result.ok ? 'file-row-error' : ''}`}
            >
              <span className="file-name" title={item.file.name}>
                {item.file.name}
              </span>
              <span className="file-meta" data-testid="repair-result">
                {describeResult(item.result) ?? formatBytes(item.file.size)}
              </span>
              <span className="file-actions">
                <button onClick={() => remove(item.id)} title="Remove file" aria-label="Remove file"><Icon name="close" size={13} /></button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="action-bar">
          <button
            className="primary-btn"
            data-testid="repair-btn"
            onClick={repair}
            disabled={busy || items.length === 0}
          >
            {busy
              ? `Repairing… ${progress}`
              : `Repair ${items.length} PDF${items.length === 1 ? '' : 's'}`}
          </button>
          <span className="action-hint">First run downloads the engine (~10 MB, cached).</span>
        </div>
      )}

      {status && (
        <p className={`status status-${status.kind}`} data-testid="status">
          {status.text}
        </p>
      )}
    </div>
  )
}
