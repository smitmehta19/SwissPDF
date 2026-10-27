// Shared page canvas for the Edit-group tools (edit, sign, crop, redact,
// forms, page numbers). Shows one page of one selected file at reading size
// with file and page navigation, and maps pointer input to the visible page:
// points from its top-left (rotation and CropBox applied, the space the ops
// use) and fractions of its width and height.
import { useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { getBytes } from '../../app/fileStore.js'
import { openPdfDocument, renderPageImage, serializedPdfOp } from '../../lib/pdfText.js'
import './g3.css'

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

// Percent box for an overlay given in fractions.
export const fracStyle = (r) => ({
  left: `${r.fx * 100}%`,
  top: `${r.fy * 100}%`,
  width: `${(r.fw ?? 0) * 100}%`,
  height: `${(r.fh ?? 0) * 100}%`,
})

// Percent box for an overlay given in points on a page of `size`.
export const ptStyle = (r, size) => ({
  left: `${(r.x / size.width) * 100}%`,
  top: `${(r.y / size.height) * 100}%`,
  width: `${((r.w ?? 0) / size.width) * 100}%`,
  height: `${((r.h ?? 0) / size.height) * 100}%`,
})

// Normalised rectangle between two pointer positions (fractions and points).
export function dragRect(a, b) {
  return {
    fx: Math.min(a.fx, b.fx),
    fy: Math.min(a.fy, b.fy),
    fw: Math.abs(b.fx - a.fx),
    fh: Math.abs(b.fy - a.fy),
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

// The file and page the canvas shows: the target if it is one of the
// selected files, else the first selected file.
export function currentOf(files, target) {
  const file = files.find((f) => f.id === target?.id) ?? files[0] ?? null
  if (!file) return { file: null, page: 1 }
  const page = Math.min(Math.max(1, target?.id === file.id ? target.page : 1), file.pageCount || 1)
  return { file, page }
}

// Rendered image and visible size (points) of one page. A new `width` keeps
// the old image on screen until the sharper one is ready.
export function usePageView(file, page, width = 1400) {
  const [view, setView] = useState({ img: null, size: null, error: null, key: null })
  const key = file ? `${file.id}:${page}` : null
  const loaded = useRef(null)
  useEffect(() => {
    if (!file) return undefined
    let active = true
    setView((v) => (v.key === key ? v : { img: null, size: null, error: null, key }))
    // only a re-render of the page already shown waits, so zoom steps batch
    const t = setTimeout(
      () =>
        (async () => {
          const bytes = await getBytes(file.id)
          const size = await serializedPdfOp(async () => {
            const doc = await openPdfDocument(bytes)
            const vp = (await doc.getPage(page)).getViewport({ scale: 1 })
            return { width: vp.width, height: vp.height }
          })
          const img = await renderPageImage(bytes, page, width)
          return { img, size }
        })().then(
          (res) => {
            if (!active) return
            loaded.current = key
            setView({ ...res, error: null, key })
          },
          (err) => active && setView({ img: null, size: null, error: err.message, key }),
        ),
      loaded.current === key ? 180 : 0,
    )
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [key, width]) // eslint-disable-line react-hooks/exhaustive-deps
  return view
}

const PX = 96 / 72 // CSS px per point at 100%, as in the Viewer
const ZOOM_MIN = 25
const ZOOM_MAX = 400
// Smallest start scale (px per point) on a narrow pane: fit width on a phone
// drew W-9 fields about 7 px high (inner width 356 px). Wider panes start at
// fit width; the Fit width button always fits.
const READABLE = 1
const NARROW = 480

// One page with overlays. Pointer handlers get { x, y } in points and
// { fx, fy } fractions of the visible page.
export function PageStage({
  files,
  target,
  onTarget,
  testId = 'g3-stage',
  cursor = 'crosshair',
  hint,
  toolbar,
  onDown,
  onMove,
  onUp,
  children,
  empty = 'Select a PDF in Files to work on it here.',
  zoom = false,
}) {
  const { file, page } = currentOf(files, target)
  const [renderW, setRenderW] = useState(1400)
  const view = usePageView(file, page, renderW)
  const boxRef = useRef(null)
  const wrapRef = useRef(null)
  const dragging = useRef(false)
  // displayed pixels per PDF point, so overlays (text, signatures) scale
  const [scale, setScale] = useState(1)
  const [zoomAt, setZoom] = useState({ fit: 'auto', value: 100 })
  const [wrapW, setWrapW] = useState(0)
  const shown = !!(view.img && view.size && file && view.key === `${file.id}:${page}`)
  useEffect(() => {
    if (!shown || !boxRef.current) return undefined
    const measure = () => {
      const w = boxRef.current?.clientWidth
      if (w) setScale(w / view.size.width)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(boxRef.current)
    return () => ro.disconnect()
  }, [shown, view.size?.width]) // eslint-disable-line react-hooks/exhaustive-deps

  // the inner width of the scroll area drives "fit width"
  useEffect(() => {
    const el = wrapRef.current
    if (!zoom || !el) return undefined
    const measure = () => {
      const cs = getComputedStyle(el)
      setWrapW(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [zoom, !!file]) // eslint-disable-line react-hooks/exhaustive-deps

  const pageW = view.size?.width
  const fitScale = wrapW > 0 && pageW ? Math.max(0.1, wrapW / pageW) : PX
  const fitted = zoomAt.fit === true || (zoomAt.fit === 'auto' && (fitScale >= READABLE || wrapW >= NARROW))
  const zoomScale = zoom && pageW ? (zoomAt.fit ? (fitted ? fitScale : READABLE) : (zoomAt.value / 100) * PX) : null
  const pct = zoomScale ? Math.round((zoomScale / PX) * 100) : 100
  const dispW = zoomScale ? Math.round(pageW * zoomScale) : null
  // sharper bitmap when zoomed in, in steps so each zoom click does not re-render
  const wantW = dispW ? Math.min(2400, Math.max(1400, Math.ceil((dispW * Math.min(window.devicePixelRatio || 1, 2)) / 400) * 400)) : 1400
  useEffect(() => setRenderW(wantW), [wantW])

  if (!file) return <p className="empty-line">{empty}</p>
  const go = (n) => onTarget({ id: file.id, page: Math.min(Math.max(1, n), file.pageCount) })
  const setPct = (v) => setZoom({ fit: false, value: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v))) })

  const toPoint = (e) => {
    const r = boxRef.current.getBoundingClientRect()
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    return { fx, fy, x: fx * view.size.width, y: fy * view.size.height }
  }
  const ctx = { file, page, size: view.size, scale }

  return (
    <section className="viewer g3-viewer" aria-label="Page canvas" data-testid="g3-viewer">
      <div className="viewer-bar">
        {files.length > 1 ? (
          <select className="input input-small viewer-file" aria-label="File" value={file.id} onChange={(e) => onTarget({ id: e.target.value, page: 1 })}>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="g3-file-name">{file.name}</span>
        )}
        {toolbar}
        <div className="viewer-nav">
          <button type="button" className="icon-btn" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page" data-testid="g3-prev">
            <Icon name="left" size={16} />
          </button>
          <label className="viewer-page">
            <span className="sr-only">Page</span>
            <input className="input input-small mono" type="number" min="1" max={file.pageCount} value={page} onChange={(e) => go(Number(e.target.value) || 1)} data-testid="g3-page" />
            <span className="mono">/ {file.pageCount}</span>
          </label>
          <button type="button" className="icon-btn" onClick={() => go(page + 1)} disabled={page >= file.pageCount} aria-label="Next page" data-testid="g3-next">
            <Icon name="right" size={16} />
          </button>
        </div>
      </div>
      {hint && <p className="field-help g3-hint">{hint}</p>}
      <div className="viewer-stage g3-stage-wrap" ref={wrapRef}>
        {view.error && <p className="field-error">{view.error}</p>}
        {!view.error && !shown && <p className="empty-line">Rendering page {page}…</p>}
        {shown && (
          <div
            ref={boxRef}
            className={`g3-stage ${dispW ? 'is-zoom' : ''}`}
            data-testid={testId}
            data-page={page}
            style={{ cursor, '--pt': `${scale}px`, ...(dispW ? { width: dispW } : {}), ...(zoom && !onDown ? { touchAction: 'pan-x pan-y' } : {}) }}
            onPointerDown={(e) => {
              if (!onDown || e.button !== 0) return
              if (e.target.closest('[data-g3-control]')) return
              e.preventDefault()
              dragging.current = true
              e.currentTarget.setPointerCapture?.(e.pointerId)
              onDown(toPoint(e), e, ctx)
            }}
            onPointerMove={(e) => {
              if (dragging.current) onMove?.(toPoint(e), e, ctx)
            }}
            onPointerUp={(e) => {
              if (!dragging.current) return
              dragging.current = false
              onUp?.(toPoint(e), e, ctx)
            }}
            onPointerCancel={(e) => {
              if (!dragging.current) return
              dragging.current = false
              onUp?.(toPoint(e), e, ctx)
            }}
          >
            <img src={view.img} alt={`Page ${page} of ${file.name}`} draggable={false} />
            {children?.(ctx)}
          </div>
        )}
      </div>
      {zoom && shown && (
        <div className="viewer-pill" role="toolbar" aria-label="Zoom">
          <div className="viewer-zoom">
            <button type="button" className="icon-btn" onClick={() => setPct(pct - 10)} disabled={pct <= ZOOM_MIN} aria-label="Zoom out" data-testid="g3-zoom-out">
              <Icon name="zoomout" size={16} />
            </button>
            <input
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step="5"
              value={Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pct))}
              onChange={(e) => setPct(Number(e.target.value))}
              aria-label="Zoom"
              aria-valuetext={`${pct}%`}
              data-testid="g3-zoom"
            />
            <button type="button" className="icon-btn" onClick={() => setPct(pct + 10)} disabled={pct >= ZOOM_MAX} aria-label="Zoom in" data-testid="g3-zoom-in">
              <Icon name="zoomin" size={16} />
            </button>
            <span className="mono viewer-pct" data-testid="g3-pct">
              {pct}%
            </span>
            <button type="button" className={`btn btn-quiet btn-small ${fitted ? 'is-on' : ''}`} aria-pressed={fitted} onClick={() => setZoom((z) => ({ ...z, fit: true }))} data-testid="g3-fit">
              <Icon name="fitwidth" size={15} />
              Fit width
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// Removable chip list used by several option panels.
export function ItemList({ items, onRemove, empty, testId }) {
  if (!items.length) return empty ? <p className="field-help">{empty}</p> : null
  return (
    <ul className="g3-list" data-testid={testId}>
      {items.map((it) => (
        <li key={it.key}>
          <span className="g3-list-label">{it.label}</span>
          {it.meta && <span className="g3-list-meta mono">{it.meta}</span>}
          <button type="button" className="icon-btn g3-list-x" aria-label={`Remove ${it.label}`} onClick={() => onRemove(it.key)}>
            <Icon name="close" size={14} />
          </button>
        </li>
      ))}
    </ul>
  )
}
