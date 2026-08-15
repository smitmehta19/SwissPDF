import { useEffect, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import FileGroups from '../components/FileGroups.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import PagePreview from '../components/PagePreview.jsx'
import { usePdfFiles, baseName } from '../components/usePdfFiles.js'
import { watermarkText, watermarkImage } from '../lib/stampOps.js'
import { normalizeImage } from '../lib/imageOps.js'
import { getPageCount } from '../lib/pdfOps.js'
import { parseRangeSpec } from '../lib/pageRanges.js'
import { deliverOutputs } from '../lib/deliver.js'

export const POSITIONS = [
  ['middle-center', 'Center'],
  ['tile', 'Tiled everywhere'],
  ['top-left', 'Top left'],
  ['top-center', 'Top center'],
  ['top-right', 'Top right'],
  ['middle-left', 'Middle left'],
  ['middle-right', 'Middle right'],
  ['bottom-left', 'Bottom left'],
  ['bottom-center', 'Bottom center'],
  ['bottom-right', 'Bottom right'],
]

let previewSeq = 1

export default function WatermarkTool() {
  const { items, validItems, addFiles, reorder, remove } = usePdfFiles()
  const [kind, setKind] = useState('text') // 'text' | 'image'
  const [text, setText] = useState('CONFIDENTIAL')
  const [fontSize, setFontSize] = useState(48)
  const [color, setColor] = useState('#d92d20')
  const [opacity, setOpacity] = useState(0.25)
  const [rotate, setRotate] = useState(45)
  const [position, setPosition] = useState('middle-center')
  const [logo, setLogo] = useState(null) // normalized image
  const [logoName, setLogoName] = useState('')
  const [widthPct, setWidthPct] = useState(30)
  const [rangeSpec, setRangeSpec] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const inspector = useInspector()

  useEffect(() => {
    if (!inspector.target && validItems.length > 0) inspector.inspect(validItems[0], 1)
  }, [validItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyTo = async (item) => {
    const pages = rangeSpec.trim() ? parseRangeSpec(rangeSpec, item.pageCount).pages : null
    if (kind === 'text') {
      return watermarkText(item.bytes, { text, fontSize, color, opacity, rotate, position, pages })
    }
    if (!logo) throw new Error('Choose a watermark image first.')
    return watermarkImage(item.bytes, logo.bytes, logo.type, { opacity, widthPct, position, pages })
  }

  const preview = async () => {
    setStatus(null)
    try {
      const item = validItems[0]
      const bytes = await applyTo(item)
      const pageCount = await getPageCount(bytes)
      inspector.inspect(
        { id: `wm-preview-${previewSeq++}`, bytes, pageCount, name: `Preview: ${item.file.name}` },
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
        outputs.push({ name: `${baseName(item.file.name)}-watermarked.pdf`, bytes: await applyTo(item) })
      }
      setStatus({ kind: 'ok', text: await deliverOutputs(outputs, 'swisspdf-watermarked.zip') })
    } catch (err) {
      setStatus({ kind: 'error', text: `Watermark failed: ${err.message}` })
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
            <label className="option-inline">
              <input type="radio" name="wm-kind" checked={kind === 'text'} onChange={() => setKind('text')} />
              <span>Text watermark</span>
            </label>
            <label className="option-inline">
              <input type="radio" name="wm-kind" checked={kind === 'image'} onChange={() => setKind('image')} />
              <span>Image watermark (logo)</span>
            </label>
          </div>
          {kind === 'text' ? (
            <>
              <div className="option-row">
                <input
                  className="text-input"
                  style={{ flex: 1 }}
                  data-testid="wm-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Watermark text"
                />
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Color" />
              </div>
              <div className="option-row">
                <span>Size</span>
                <input type="range" min="12" max="120" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
                <span>Rotation</span>
                {[0, 45, 90].map((a) => (
                  <label key={a} className="option-inline">
                    <input type="radio" name="wm-rot" checked={rotate === a} onChange={() => setRotate(a)} />
                    <span>{a}°</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="option-row">
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={async (e) => {
                  const f = e.target.files[0]
                  if (!f) return
                  try {
                    setLogo(await normalizeImage(await f.arrayBuffer()))
                    setLogoName(f.name)
                    setStatus(null)
                  } catch (err) {
                    setStatus({ kind: 'error', text: err.message })
                  }
                }}
              />
              {logoName && <span className="option-help">{logoName}</span>}
              <span>Width</span>
              <input type="range" min="10" max="80" value={widthPct} onChange={(e) => setWidthPct(Number(e.target.value))} />
              <span className="option-help">{widthPct}% of page</span>
            </div>
          )}
          <div className="option-row">
            <span>Opacity</span>
            <input type="range" min="0.05" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
            <span className="option-help">{Math.round(opacity * 100)}%</span>
            <span>Position</span>
            <select className="text-input text-input-small" value={position} onChange={(e) => setPosition(e.target.value)}>
              {POSITIONS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
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
                data-testid="wm-preview-btn"
                onClick={preview}
                disabled={busy || validItems.length === 0}
              >
                Preview result →
              </button>
              <button
                className="primary-btn"
                data-testid="wm-apply-btn"
                onClick={apply}
                disabled={busy || validItems.length === 0}
              >
                {busy ? 'Stamping…' : `Watermark ${validItems.length} PDF${validItems.length === 1 ? '' : 's'}`}
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
