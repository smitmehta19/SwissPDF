import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import FileDropZone from '../components/FileDropZone.jsx'
import { baseName } from '../components/usePdfFiles.js'
import { assertValidOutput } from '../lib/pdfOps.js'
import { deliverOutputs } from '../lib/deliver.js'
import { formatBytes } from '../lib/download.js'

let nextId = 1

export const WordToPdfTool = () => <OfficeToPdfTool kind="word" />
export const ExcelToPdfTool = () => <OfficeToPdfTool kind="excel" />
export const PptToPdfTool = () => <OfficeToPdfTool kind="ppt" />

// Shared UI for Word/Excel/PowerPoint -> PDF. config decides intake + converter.
export default function OfficeToPdfTool({ kind }) {
  const config = {
    word: {
      accept: ['.docx', '.doc', '.odt', '.rtf'],
      note: 'Converts Word documents to PDF.',
      quick: async (buf, name, onProgress) => (await import('../lib/officeOps.js')).docxToPdf(buf, onProgress),
      quickAccepts: /\.docx$/i,
    },
    excel: {
      accept: ['.xlsx', '.xls', '.ods', '.csv'],
      note: 'Converts spreadsheets to PDF — one page per sheet.',
      quick: async (buf, name, onProgress) => (await import('../lib/officeOps.js')).xlsxToPdf(buf, onProgress),
      quickAccepts: /\.(xlsx|xls|csv)$/i,
    },
    ppt: {
      accept: ['.pptx', '.ppt', '.odp'],
      note: 'Converts presentations to PDF — one page per slide.',
      quick: async (buf, name, onProgress) => (await import('../lib/officeOps.js')).pptxToPdf(buf, onProgress),
      quickAccepts: /\.pptx$/i,
    },
  }[kind]

  const [items, setItems] = useState([]) // { id, file, bytes, result }
  const [engine, setEngine] = useState('hifi') // 'hifi' | 'quick'
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [status, setStatus] = useState(null)

  const addFiles = async (files) => {
    for (const file of files) {
      setItems((prev) => [...prev, { id: nextId++, file, result: null }])
    }
  }
  const remove = (id) => setItems((prev) => prev.filter((it) => it.id !== id))

  const convert = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const outputs = []
      const updated = []
      for (const item of items) {
        try {
          const buf = await item.file.arrayBuffer()
          const onProgress = (msg) => setProgress(`${item.file.name} — ${msg}`)
          let bytes
          if (engine === 'hifi') {
            const { convertToPdfHiFi } = await import('../lib/libreOffice.js')
            bytes = await convertToPdfHiFi(buf, item.file.name, onProgress)
          } else {
            if (!config.quickAccepts.test(item.file.name)) {
              throw new Error('Quick mode only handles modern formats — use the high-fidelity engine for this file.')
            }
            bytes = await config.quick(buf, item.file.name, onProgress)
          }
          const { pageCount } = await assertValidOutput(bytes)
          outputs.push({
            name: `${baseName(item.file.name).replace(/\.(docx?|xlsx?|ods|csv|pptx?|odp|odt|rtf)$/i, '')}.pdf`,
            bytes,
          })
          updated.push({ ...item, result: { ok: true, pageCount } })
        } catch (err) {
          updated.push({ ...item, result: { ok: false, error: err.message } })
        }
      }
      setItems(updated)
      const okCount = updated.filter((it) => it.result?.ok).length
      if (outputs.length > 0) {
        setStatus({
          kind: 'ok',
          text: `${okCount} of ${updated.length} converted. ${await deliverOutputs(outputs, 'swisspdf-converted.zip')}`,
        })
      } else {
        setStatus({ kind: 'error', text: 'Nothing converted — see the per-file notes.' })
      }
    } catch (err) {
      setStatus({ kind: 'error', text: `Convert failed: ${err.message}` })
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={config.accept} multiple />
      <p className="option-help">{config.note}</p>

      {items.length > 0 && (
        <div className="options-panel">
          <label className="option-row">
            <input type="radio" name="office-engine" checked={engine === 'hifi'} onChange={() => setEngine('hifi')} />
            <span>
              <strong>High fidelity</strong> — LibreOffice engine: true layout, selectable text,
              legacy formats. One-time ~200 MB download, cached.
            </span>
          </label>
          <label className="option-row">
            <input type="radio" name="office-engine" checked={engine === 'quick'} onChange={() => setEngine('quick')} />
            <span>
              <strong>Quick</strong> — instant, no download. Pages become images.
            </span>
          </label>
        </div>
      )}

      {items.length > 0 && (
        <ul className="file-list">
          {items.map((item) => (
            <li key={item.id} className={`file-row ${item.result && !item.result.ok ? 'file-row-error' : ''}`}>
              <span className="file-name" title={item.file.name}>
                {item.file.name}
              </span>
              <span className="file-meta" data-testid="office-result">
                {item.result
                  ? item.result.ok
                    ? `Converted · ${item.result.pageCount} pages`
                    : item.result.error
                  : formatBytes(item.file.size)}
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
          <button className="primary-btn" data-testid="office2pdf-btn" onClick={convert} disabled={busy || items.length === 0}>
            {busy ? `Converting… ${progress}` : `Convert ${items.length} file${items.length === 1 ? '' : 's'} to PDF`}
          </button>
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
