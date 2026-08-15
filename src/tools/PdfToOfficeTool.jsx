import { useEffect, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import FileGroups from '../components/FileGroups.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import PagePreview from '../components/PagePreview.jsx'
import { usePdfFiles, baseName } from '../components/usePdfFiles.js'
import { deliverOutputs } from '../lib/deliver.js'

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export const PdfToWordTool = () => <PdfToOfficeTool kind="word" />
export const PdfToExcelTool = () => <PdfToOfficeTool kind="excel" />
export const PdfToPptTool = () => <PdfToOfficeTool kind="ppt" />

// Shared UI for PDF -> Word/Excel/PowerPoint.
export default function PdfToOfficeTool({ kind }) {
  const config = {
    word: {
      ext: 'docx',
      note: 'Pick the mode that matches your document. Scanned pages are OCR’d automatically.',
      convert: async (item, onProgress, opts) => {
        const { pdfToDocx } = await import('../lib/officeOps.js')
        const res = await pdfToDocx(item.bytes, onProgress, opts.layout)
        const parts = [`${res.chars.toLocaleString()} characters`]
        if (res.tables) parts.push(`${res.tables} table${res.tables === 1 ? '' : 's'}`)
        if (res.images) parts.push(`${res.images} image${res.images === 1 ? '' : 's'}`)
        if (res.fields) parts.push(`${res.fields} form field${res.fields === 1 ? '' : 's'}`)
        if (res.ocrPages) parts.push(`${res.ocrPages} scanned page${res.ocrPages === 1 ? '' : 's'} OCR'd`)
        return { bytes: res.bytes, detail: parts.join(', ') }
      },
    },
    excel: {
      ext: 'xlsx',
      note: 'One sheet per page. Ruled tables become real rows and columns.',
      convert: async (item, onProgress) => {
        const { pdfToXlsx } = await import('../lib/officeOps.js')
        const res = await pdfToXlsx(item.bytes, onProgress)
        return { bytes: res.bytes, detail: `${res.cells.toLocaleString()} cells` }
      },
    },
    ppt: {
      ext: 'pptx',
      note: 'Each page becomes one full-bleed slide.',
      convert: async (item, onProgress) => {
        const { pdfToPptx } = await import('../lib/officeOps.js')
        const bytes = await pdfToPptx(item.bytes, item.pageCount, onProgress)
        return { bytes, detail: `${item.pageCount} slides` }
      },
    },
  }[kind]

  const { items, validItems, addFiles, reorder, remove } = usePdfFiles()
  const [layout, setLayout] = useState('exact') // 'exact' | 'flow' (word only)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [status, setStatus] = useState(null)
  const inspector = useInspector()

  useEffect(() => {
    if (!inspector.target && validItems.length > 0) inspector.inspect(validItems[0], 1)
  }, [validItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const convert = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const outputs = []
      const details = []
      for (const item of validItems) {
        const res = await config.convert(item, (msg) => setProgress(`${item.file.name} — ${msg}`), { layout })
        outputs.push({
          name: `${baseName(item.file.name)}.${config.ext}`,
          bytes: res.bytes,
          mime: MIME[config.ext],
        })
        details.push(`${item.file.name}: ${res.detail}`)
      }
      const summary = await deliverOutputs(outputs, `swisspdf-${config.ext}.zip`, { kind: 'binary' })
      setStatus({ kind: 'ok', text: `${details.join(' · ')}. ${summary}` })
    } catch (err) {
      setStatus({ kind: 'error', text: `Convert failed: ${err.message}` })
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />
      <p className="option-help">{config.note}</p>

      {kind === 'word' && items.length > 0 && (
        <div className="options-panel">
          <label className="option-row">
            <input type="radio" name="docx-layout" checked={layout === 'exact'} onChange={() => setLayout('exact')} />
            <span>
              <strong>Exact layout</strong> — blocks stay pinned in place. Payslips, invoices, forms.
            </span>
          </label>
          <label className="option-row">
            <input type="radio" name="docx-layout" checked={layout === 'flow'} onChange={() => setLayout('flow')} />
            <span>
              <strong>Flowing text</strong> — paragraphs reflow as you type. Reports and letters.
            </span>
          </label>
        </div>
      )}

      <div className="workspace">
        <div className="workspace-main">
          <FileGroups
            items={items}
            onReorder={reorder}
            onRemove={remove}
            onInspectFile={(item) => inspector.inspect(item, 1)}
            cardMeta={() => null}
            renderExpanded={(item) => (
              <PagePreview
                fileId={item.id}
                bytes={item.bytes}
                pageCount={item.pageCount}
                onPageClick={(i) => inspector.inspect(item, i + 1)}
              />
            )}
          />

          {items.length > 0 && (
            <div className="action-bar">
              <button
                className="primary-btn"
                data-testid="pdf2office-btn"
                onClick={convert}
                disabled={busy || validItems.length === 0}
              >
                {busy
                  ? `Converting… ${progress}`
                  : `Convert ${validItems.length} PDF${validItems.length === 1 ? '' : 's'} to ${config.ext.toUpperCase()}`}
              </button>
            </div>
          )}

          {status && (
            <p className={`status status-${status.kind}`} data-testid="status">
              {status.text}
            </p>
          )}
        </div>

        {items.length > 0 && (
          <Inspector target={inspector.target} onNavigate={inspector.navigate} onClose={inspector.close} />
        )}
      </div>
    </div>
  )
}
