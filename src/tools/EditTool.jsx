import { useRef, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import PageCanvas, { pctBox } from '../components/PageCanvas.jsx'
import { baseName } from '../components/usePdfFiles.js'
import { loadPdf, assertValidOutput } from '../lib/pdfOps.js'
import { normalizeImage } from '../lib/imageOps.js'
import { downloadBytes, formatBytes } from '../lib/download.js'

const TOOLS = [
  ['text', 'Text', 'Click where the text should start'],
  ['highlight', 'Highlight', 'Drag across what you want highlighted'],
  ['rect', 'Rectangle', 'Drag to draw a box'],
  ['ellipse', 'Ellipse', 'Drag to draw an ellipse'],
  ['line', 'Line', 'Drag from start to end'],
  ['ink', 'Draw', 'Draw freehand with the mouse'],
  ['image', 'Image', 'Drag to place the chosen image'],
  ['erase', 'White-out', 'Drag over anything you want to hide'],
]

let nextId = 1

export default function EditTool() {
  const [file, setFile] = useState(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [tool, setTool] = useState('text')
  const [color, setColor] = useState('#d92d20')
  const [size, setSize] = useState(16)
  const [thickness, setThickness] = useState(2)
  const [textValue, setTextValue] = useState('Your text here')
  const [image, setImage] = useState(null)
  const [elements, setElements] = useState([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const dragRef = useRef(null)
  // Draft geometry lives in a ref as well as state: pointer events can fire in
  // a single React batch, so mouse-up must not read a stale value.
  const draftRef = useRef(null)
  const [draft, setDraftState] = useState(null)
  const setDraft = (v) => {
    draftRef.current = typeof v === 'function' ? v(draftRef.current) : v
    setDraftState(draftRef.current)
  }

  const onFiles = async ([f]) => {
    setStatus(null)
    try {
      const bytes = await f.arrayBuffer()
      const doc = await loadPdf(bytes)
      setFile({
        name: f.name,
        bytes,
        pageCount: doc.getPageCount(),
        sizes: doc.getPages().map((p) => p.getSize()),
      })
      setElements([])
      setPageIdx(0)
    } catch (err) {
      setFile(null)
      setStatus({ kind: 'error', text: err.message })
    }
  }

  const pageSize = file?.sizes[pageIdx]
  const pageElements = elements.filter((e) => e.pageIndex === pageIdx)

  const addElement = (el) => setElements((prev) => [...prev, { ...el, id: nextId++, pageIndex: pageIdx }])

  const onDown = (p) => {
    if (tool === 'text') {
      if (!textValue.trim()) {
        setStatus({ kind: 'error', text: 'Type the text to place in the box above first.' })
        return
      }
      addElement({ type: 'text', x: p.x, y: p.y, text: textValue, size, color, font: 'helvetica' })
      return
    }
    if (tool === 'image' && !image) {
      setStatus({ kind: 'error', text: 'Choose an image file first.' })
      return
    }
    dragRef.current = p
    setDraft(tool === 'ink' ? { points: [p] } : null)
  }

  const onMove = (p) => {
    if (!dragRef.current) return
    if (tool === 'ink') {
      setDraft((d) => ({ points: [...(d?.points ?? []), p] }))
      return
    }
    const s = dragRef.current
    setDraft({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
      x1: s.x,
      y1: s.y,
      x2: p.x,
      y2: p.y,
    })
  }

  const onUp = () => {
    const start = dragRef.current
    const draft = draftRef.current
    dragRef.current = null
    if (!start || !draft) {
      setDraft(null)
      return
    }
    if (tool === 'ink') {
      if (draft.points.length > 2) addElement({ type: 'ink', points: draft.points, color, borderWidth: thickness })
    } else if (tool === 'line') {
      addElement({ type: 'line', x: draft.x1, y: draft.y1, x2: draft.x2, y2: draft.y2, color, borderWidth: thickness })
    } else if (draft.w > 4 && draft.h > 4) {
      const base = { x: draft.x, y: draft.y, w: draft.w, h: draft.h }
      if (tool === 'highlight') addElement({ type: 'highlight', ...base, color: '#ffe066', opacity: 0.4 })
      else if (tool === 'erase') addElement({ type: 'rect', ...base, color: '#ffffff', fill: '#ffffff', borderWidth: 0 })
      else if (tool === 'image')
        addElement({ type: 'image', ...base, bytes: image.bytes, imgType: image.type, preview: image.url })
      else addElement({ type: tool, ...base, color, borderWidth: thickness })
    }
    setDraft(null)
  }

  const save = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { applyEdits } = await import('../lib/editOps.js')
      const bytes = await applyEdits(file.bytes, elements)
      await assertValidOutput(bytes)
      const name = `${baseName(file.name)}-edited.pdf`
      downloadBytes(bytes, name)
      setStatus({
        kind: 'ok',
        text: `Created ${name} (${elements.length} edit${elements.length === 1 ? '' : 's'} applied, ${formatBytes(bytes.length)}) — download started.`,
      })
    } catch (err) {
      setStatus({ kind: 'error', text: `Save failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  const renderElement = (el) => {
    const common = { key: el.id, 'data-testid': 'edit-element', className: 'edit-el' }
    if (el.type === 'text') {
      return (
        <span
          {...common}
          className="edit-el edit-el-text"
          style={{
            left: `${(el.x / pageSize.width) * 100}%`,
            top: `${(el.y / pageSize.height) * 100}%`,
            color: el.color,
            fontSize: `calc(var(--page-scale, 1) * ${el.size}px)`,
          }}
          onDoubleClick={() => setElements((prev) => prev.filter((x) => x.id !== el.id))}
          title="Double-click to remove"
        >
          {el.text}
        </span>
      )
    }
    if (el.type === 'line') {
      const x1 = (el.x / pageSize.width) * 100
      const y1 = (el.y / pageSize.height) * 100
      const x2 = (el.x2 / pageSize.width) * 100
      const y2 = (el.y2 / pageSize.height) * 100
      return (
        <svg {...common} className="edit-el edit-el-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={el.color} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
        </svg>
      )
    }
    if (el.type === 'ink') {
      const pts = el.points.map((p) => `${(p.x / pageSize.width) * 100},${(p.y / pageSize.height) * 100}`).join(' ')
      return (
        <svg {...common} className="edit-el edit-el-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points={pts} fill="none" stroke={el.color} strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
        </svg>
      )
    }
    if (el.type === 'image') {
      return <img {...common} className="edit-el" style={pctBox(el, pageSize)} src={el.preview} alt="" />
    }
    return (
      <span
        {...common}
        className={`edit-el edit-el-${el.type}`}
        style={{
          ...pctBox(el, pageSize),
          borderColor: el.color,
          background:
            el.type === 'highlight' ? el.color : el.fill === '#ffffff' ? '#fff' : 'transparent',
          opacity: el.type === 'highlight' ? 0.45 : 1,
          borderRadius: el.type === 'ellipse' ? '50%' : 0,
        }}
        onDoubleClick={() => setElements((prev) => prev.filter((x) => x.id !== el.id))}
        title="Double-click to remove"
      />
    )
  }

  return (
    <div className="tool-body">
      {!file && <FileDropZone onFiles={onFiles} accept={['.pdf']} multiple={false} />}
      {!file && (
        <p className="option-help">
          Pick a tool, then click or drag on the page. Nothing is written until you apply.
        </p>
      )}

      {file && pageSize && (
        <>
          <div className="options-panel">
            <div className="option-row">
              <strong>{file.name}</strong>
              <button className="back-link" onClick={() => { setFile(null); setStatus(null) }}>
                Choose a different file
              </button>
              <span style={{ flex: 1 }} />
              <button className="toggle-btn" onClick={() => setPageIdx((i) => Math.max(0, i - 1))} disabled={pageIdx === 0}>
                ← Prev
              </button>
              <span className="option-help">Page {pageIdx + 1} of {file.pageCount}</span>
              <button
                className="toggle-btn"
                onClick={() => setPageIdx((i) => Math.min(file.pageCount - 1, i + 1))}
                disabled={pageIdx >= file.pageCount - 1}
              >
                Next →
              </button>
            </div>
            <div className="option-row">
              {TOOLS.map(([v, label]) => (
                <button
                  key={v}
                  className={`tool-chip ${tool === v ? 'tool-chip-active' : ''}`}
                  data-testid={`edit-tool-${v}`}
                  onClick={() => setTool(v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="option-row">
              {tool === 'text' && (
                <>
                  <input
                    className="text-input"
                    style={{ flex: 1 }}
                    data-testid="edit-text-input"
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder="Text to place"
                  />
                  <span>Size</span>
                  <input type="range" min="8" max="48" value={size} onChange={(e) => setSize(Number(e.target.value))} />
                </>
              )}
              {tool === 'image' && (
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  onChange={async (e) => {
                    const f = e.target.files[0]
                    if (!f) return
                    const norm = await normalizeImage(await f.arrayBuffer())
                    setImage({
                      bytes: norm.bytes,
                      type: norm.type,
                      url: URL.createObjectURL(new Blob([norm.bytes])),
                    })
                  }}
                />
              )}
              {['rect', 'ellipse', 'line', 'ink'].includes(tool) && (
                <>
                  <span>Thickness</span>
                  <input type="range" min="1" max="10" value={thickness} onChange={(e) => setThickness(Number(e.target.value))} />
                </>
              )}
              {tool !== 'erase' && tool !== 'highlight' && (
                <>
                  <span>Colour</span>
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                </>
              )}
              <span className="option-help">{TOOLS.find(([v]) => v === tool)?.[2]}</span>
            </div>
          </div>

          <PageCanvas
            bytes={file.bytes}
            pageNum={pageIdx + 1}
            pageSize={pageSize}
            testId="edit-canvas"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            {pageElements.map(renderElement)}
            {draft && !draft.points && draft.w > 0 && (
              <span className="edit-el edit-draft" style={pctBox(draft, pageSize)} />
            )}
            {draft?.points && (
              <svg className="edit-el edit-el-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline
                  points={draft.points.map((p) => `${(p.x / pageSize.width) * 100},${(p.y / pageSize.height) * 100}`).join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.4}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
          </PageCanvas>

          <div className="action-bar">
            <button className="primary-btn" data-testid="edit-save-btn" onClick={save} disabled={busy || elements.length === 0}>
              {busy ? 'Applying…' : `Apply ${elements.length} edit${elements.length === 1 ? '' : 's'} & download`}
            </button>
            {elements.length > 0 && (
              <>
                <button className="link-btn" onClick={() => setElements((prev) => prev.slice(0, -1))}>
                  Undo last
                </button>
                <button className="link-btn" onClick={() => setElements([])}>
                  Clear all
                </button>
              </>
            )}
            <span className="action-hint">Double-click any element on the page to remove it.</span>
          </div>

          {status && (
            <p className={`status status-${status.kind}`} data-testid="status">
              {status.text}
            </p>
          )}
        </>
      )}

      {!file && status && (
        <p className={`status status-${status.kind}`} data-testid="status">
          {status.text}
        </p>
      )}
    </div>
  )
}
