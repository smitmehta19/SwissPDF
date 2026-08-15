import { useEffect, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import FileGroups from '../components/FileGroups.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import PagePreview from '../components/PagePreview.jsx'
import { usePdfFiles, baseName } from '../components/usePdfFiles.js'
import { addPageNumbers } from '../lib/stampOps.js'
import { getPageCount } from '../lib/pdfOps.js'
import { parseRangeSpec } from '../lib/pageRanges.js'
import { deliverOutputs } from '../lib/deliver.js'

const NUM_POSITIONS = [
  ['bottom-center', 'Bottom center'],
  ['bottom-right', 'Bottom right'],
  ['bottom-left', 'Bottom left'],
  ['top-center', 'Top center'],
  ['top-right', 'Top right'],
  ['top-left', 'Top left'],
]

let previewSeq = 1

export default function PageNumbersTool() {
  const { items, validItems, addFiles, reorder, remove } = usePdfFiles()
  const [format, setFormat] = useState('n')
  const [position, setPosition] = useState('bottom-center')
  const [fontSize, setFontSize] = useState(11)
  const [start, setStart] = useState('1')
  const [rangeSpec, setRangeSpec] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const inspector = useInspector()

  useEffect(() => {
    if (!inspector.target && validItems.length > 0) inspector.inspect(validItems[0], 1)
  }, [validItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyTo = (item) => {
    const pages = rangeSpec.trim() ? parseRangeSpec(rangeSpec, item.pageCount).pages : null
    return addPageNumbers(item.bytes, {
      format,
      position,
      fontSize,
      start: Math.max(0, Number(start) || 1),
      pages,
    })
  }

  const preview = async () => {
    setStatus(null)
    try {
      const item = validItems[0]
      const bytes = await applyTo(item)
      inspector.inspect(
        {
          id: `pn-preview-${previewSeq++}`,
          bytes,
          pageCount: await getPageCount(bytes),
          name: `Preview: ${item.file.name}`,
        },
        1,
      )
    } catch (err) {
      setStatus({ kind: 'error', text: `Preview failed: ${err.message}` })
    }
  }

  const apply = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const outputs = []
      for (const item of validItems) {
        outputs.push({ name: `${baseName(item.file.name)}-numbered.pdf`, bytes: await applyTo(item) })
      }
      setStatus({ kind: 'ok', text: await deliverOutputs(outputs, 'swisspdf-numbered.zip') })
    } catch (err) {
      setStatus({ kind: 'error', text: `Numbering failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />

      {items.length > 0 && (
        <div className="options-panel">
          <div className="option-row">
            <span>Style</span>
            {[
              ['n', '1'],
              ['page-n', 'Page 1'],
              ['n-of-total', '1 of N'],
            ].map(([v, label]) => (
              <label key={v} className="option-inline">
                <input type="radio" name="pn-format" checked={format === v} onChange={() => setFormat(v)} />
                <span>{label}</span>
              </label>
            ))}
            <span>Position</span>
            <select className="text-input text-input-small" value={position} onChange={(e) => setPosition(e.target.value)}>
              {NUM_POSITIONS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="option-row">
            <span>Size</span>
            <input type="range" min="8" max="24" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
            <span className="option-help">{fontSize}pt</span>
            <span>Start at</span>
            <input
              className="text-input text-input-small"
              type="number"
              min="0"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <span>Pages</span>
            <input
              className="text-input text-input-small"
              data-testid="range-input"
              placeholder="All"
              value={rangeSpec}
              onChange={(e) => setRangeSpec(e.target.value)}
            />
          </div>
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
                className="toggle-btn"
                data-testid="pn-preview-btn"
                onClick={preview}
                disabled={busy || validItems.length === 0}
              >
                Preview result →
              </button>
              <button
                className="primary-btn"
                data-testid="pn-apply-btn"
                onClick={apply}
                disabled={busy || validItems.length === 0}
              >
                {busy ? 'Numbering…' : `Add numbers to ${validItems.length} PDF${validItems.length === 1 ? '' : 's'}`}
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
