import { useRef, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import { useImageFiles } from '../components/useImageFiles.js'
import { baseName } from '../components/usePdfFiles.js'
import { imagesToPdf } from '../lib/imageOps.js'
import { assertValidOutput } from '../lib/pdfOps.js'
import { deliverOutputs } from '../lib/deliver.js'
import { downloadBytes, formatBytes } from '../lib/download.js'

export default function ImageToPdfTool() {
  const { items, validItems, addFiles, reorder, remove } = useImageFiles()
  const [pageSize, setPageSize] = useState('fit') // 'fit' | 'a4' | 'a4-landscape'
  const [margin, setMargin] = useState(24)
  const [output, setOutput] = useState('combined') // 'combined' | 'separate'
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const inspector = useInspector()

  // Refs, not state: drag events can fire in one batch and state would lag.
  const dragIdxRef = useRef(null)
  const [dragIdx, setDragIdxState] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const setDragIdx = (v) => {
    dragIdxRef.current = v
    setDragIdxState(v)
  }

  const convert = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const opts = { pageSize, margin: pageSize === 'fit' ? 0 : margin }
      if (output === 'combined') {
        const bytes = await imagesToPdf(validItems.map((it) => it.normalized), opts)
        const { pageCount } = await assertValidOutput(bytes)
        downloadBytes(bytes, 'images.pdf')
        setStatus({
          kind: 'ok',
          text: `Created images.pdf (${pageCount} pages, ${formatBytes(bytes.length)}) — download started.`,
        })
      } else {
        const outputs = []
        for (const it of validItems) {
          const bytes = await imagesToPdf([it.normalized], opts)
          outputs.push({ name: `${baseName(it.file.name).replace(/\.(jpe?g|png|webp|gif|bmp)$/i, '')}.pdf`, bytes })
        }
        setStatus({ kind: 'ok', text: await deliverOutputs(outputs, 'swisspdf-images.zip') })
      }
    } catch (err) {
      setStatus({ kind: 'error', text: `Convert failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool-body">
      <FileDropZone
        onFiles={addFiles}
        accept={['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']}
        multiple
      />

      {items.length > 0 && (
        <div className="options-panel">
          <div className="option-row">
            <span>Page size</span>
            {[
              ['fit', 'Fit to image'],
              ['a4', 'A4 portrait'],
              ['a4-landscape', 'A4 landscape'],
            ].map(([v, label]) => (
              <label key={v} className="option-inline">
                <input type="radio" name="page-size" checked={pageSize === v} onChange={() => setPageSize(v)} />
                <span>{label}</span>
              </label>
            ))}
            {pageSize !== 'fit' && (
              <>
                <span>· Margin</span>
                {[
                  [0, 'None'],
                  [24, 'Small'],
                  [56, 'Big'],
                ].map(([v, label]) => (
                  <label key={v} className="option-inline">
                    <input type="radio" name="margin" checked={margin === v} onChange={() => setMargin(v)} />
                    <span>{label}</span>
                  </label>
                ))}
              </>
            )}
          </div>
          <div className="option-row">
            <label className="option-inline">
              <input type="radio" name="img-output" checked={output === 'combined'} onChange={() => setOutput('combined')} />
              <span>One PDF with all images (in this order)</span>
            </label>
            <label className="option-inline">
              <input type="radio" name="img-output" checked={output === 'separate'} onChange={() => setOutput('separate')} />
              <span>A separate PDF per image</span>
            </label>
          </div>
        </div>
      )}

      <div className="workspace">
        <div className="workspace-main">
          {items.length > 0 && (
            <div className="preview-grid" data-testid="image-grid">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className={`preview-page preview-clickable ${item.error ? 'file-row-error' : ''} ${overIdx === idx && dragIdx !== null && dragIdx !== idx ? 'drag-over' : ''} ${dragIdx === idx ? 'dragging' : ''}`}
                  data-image={item.file.name}
                  draggable
                  onDragStart={(e) => {
                    setDragIdx(idx)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOverIdx(idx)
                  }}
                  onDragLeave={() => setOverIdx((v) => (v === idx ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIdxRef.current !== null) reorder(dragIdxRef.current, idx)
                    setDragIdx(null)
                    setOverIdx(null)
                  }}
                  onDragEnd={() => {
                    setDragIdx(null)
                    setOverIdx(null)
                  }}
                  onClick={() => inspector.inspect(item)}
                  title="Click to preview · drag to reorder"
                >
                  <button
                    className="page-delete"
                    title="Remove this image"
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(item.id)
                    }}
                  >
                    ✕
                  </button>
                  <div className="preview-thumb-box">
                    <img src={item.imageUrl} alt={item.file.name} />
                  </div>
                  <span className="preview-page-num">{idx + 1}</span>
                  <span className="image-caption" title={item.file.name}>
                    {item.error ?? item.file.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <div className="action-bar">
              <button
                className="primary-btn"
                data-testid="img2pdf-btn"
                onClick={convert}
                disabled={busy || validItems.length === 0}
              >
                {busy
                  ? 'Converting…'
                  : `Convert ${validItems.length} image${validItems.length === 1 ? '' : 's'} to PDF`}
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
