import { useRef, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import { baseName } from '../components/usePdfFiles.js'
import { loadPdf, assertValidOutput, getPageCount } from '../lib/pdfOps.js'
import { cropPdf } from '../lib/stampOps.js'
import { renderPageImage } from '../lib/pdfText.js'
import { parseRangeSpec } from '../lib/pageRanges.js'
import { downloadBytes, formatBytes } from '../lib/download.js'

// Interactive crop: drag a rectangle on the rendered page; apply to all pages,
// just this page, or a range. Coordinates map from screen to PDF points.
export default function CropTool() {
  const [file, setFile] = useState(null) // { name, bytes, pageCount, pageSizes: [{w,h,rot}] }
  const [pageNum, setPageNum] = useState(1)
  const [pageImg, setPageImg] = useState(null)
  const [rect, setRect] = useState(null) // fractions {fx, fy, fw, fh}
  const [scope, setScope] = useState('all')
  const [rangeSpec, setRangeSpec] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const dragRef = useRef(null)
  const imgBoxRef = useRef(null)

  const loadPage = async (bytes, n) => {
    setPageImg(null)
    setPageImg(await renderPageImage(bytes, n, 900))
  }

  const onFiles = async ([f]) => {
    setStatus(null)
    setRect(null)
    try {
      const bytes = await f.arrayBuffer()
      const doc = await loadPdf(bytes)
      const rotated = doc.getPages().some((p) => p.getRotation().angle % 360 !== 0)
      if (rotated) {
        throw new Error(
          'This PDF has rotated pages — run it through Rotate first to set them upright, then crop.',
        )
      }
      const pageSizes = doc.getPages().map((p) => p.getSize())
      setFile({ name: f.name, bytes, pageCount: doc.getPageCount(), pageSizes })
      setPageNum(1)
      await loadPage(bytes, 1)
    } catch (err) {
      setFile(null)
      setStatus({ kind: 'error', text: err.message })
    }
  }

  const gotoPage = async (n) => {
    if (!file || n < 1 || n > file.pageCount) return
    setPageNum(n)
    await loadPage(file.bytes, n)
  }

  const relPoint = (e) => {
    const box = imgBoxRef.current.getBoundingClientRect()
    return {
      fx: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      fy: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    }
  }

  const onMouseDown = (e) => {
    e.preventDefault()
    dragRef.current = relPoint(e)
    setRect(null)
  }
  const onMouseMove = (e) => {
    if (!dragRef.current) return
    const start = dragRef.current
    const now = relPoint(e)
    setRect({
      fx: Math.min(start.fx, now.fx),
      fy: Math.min(start.fy, now.fy),
      fw: Math.abs(now.fx - start.fx),
      fh: Math.abs(now.fy - start.fy),
    })
  }
  const onMouseUp = () => {
    dragRef.current = null
  }

  const cropBoxPts = () => {
    if (!rect || !file) return null
    const { width: pw, height: ph } = file.pageSizes[pageNum - 1]
    return {
      x: Math.round(rect.fx * pw),
      y: Math.round(rect.fy * ph),
      w: Math.round(rect.fw * pw),
      h: Math.round(rect.fh * ph),
    }
  }

  const apply = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const box = cropBoxPts()
      if (!box) throw new Error('Drag a rectangle on the page first.')
      let pages = null
      if (scope === 'this') pages = [pageNum]
      else if (scope === 'ranges') pages = parseRangeSpec(rangeSpec, file.pageCount).pages
      const bytes = await cropPdf(file.bytes, box, pages)
      await assertValidOutput(bytes)
      const name = `${baseName(file.name)}-cropped.pdf`
      downloadBytes(bytes, name)
      setStatus({
        kind: 'ok',
        text: `Created ${name} (crop ${box.w}×${box.h}pt, ${formatBytes(bytes.length)}) — download started.`,
      })
    } catch (err) {
      setStatus({ kind: 'error', text: `Crop failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  const box = cropBoxPts()

  return (
    <div className="tool-body">
      {!file && <FileDropZone onFiles={onFiles} accept={['.pdf']} multiple={false} />}

      {file && (
        <>
          <div className="options-panel">
            <div className="option-row">
              <strong>{file.name}</strong>
              <button className="back-link" onClick={() => { setFile(null); setRect(null); setStatus(null) }}>
                Choose a different file
              </button>
              <span style={{ flex: 1 }} />
              <button className="toggle-btn" onClick={() => gotoPage(pageNum - 1)} disabled={pageNum <= 1}>
                ← Prev
              </button>
              <span className="option-help">
                Page {pageNum} of {file.pageCount}
              </span>
              <button className="toggle-btn" onClick={() => gotoPage(pageNum + 1)} disabled={pageNum >= file.pageCount}>
                Next →
              </button>
            </div>
            <div className="option-row">
              <span>Apply to</span>
              <label className="option-inline">
                <input type="radio" name="crop-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
                <span>All pages</span>
              </label>
              <label className="option-inline">
                <input type="radio" name="crop-scope" checked={scope === 'this'} onChange={() => setScope('this')} />
                <span>Only page {pageNum}</span>
              </label>
              <label className="option-inline">
                <input type="radio" name="crop-scope" checked={scope === 'ranges'} onChange={() => setScope('ranges')} />
                <span>Pages:</span>
              </label>
              <input
                className="text-input text-input-small"
                placeholder='e.g. "2-5"'
                value={rangeSpec}
                disabled={scope !== 'ranges'}
                onChange={(e) => setRangeSpec(e.target.value)}
              />
              {box && (
                <span className="option-help" data-testid="crop-dims">
                  Selection: {box.w} × {box.h} pt
                </span>
              )}
            </div>
          </div>

          <p className="option-help">Drag a rectangle over the page to choose the crop area.</p>

          {!pageImg ? (
            <p className="preview-loading">Rendering page…</p>
          ) : (
            <div
              ref={imgBoxRef}
              className="crop-stage"
              data-testid="crop-stage"
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              <img src={pageImg} alt={`Page ${pageNum}`} draggable={false} />
              {rect && (
                <div
                  className="crop-rect"
                  data-testid="crop-rect"
                  style={{
                    left: `${rect.fx * 100}%`,
                    top: `${rect.fy * 100}%`,
                    width: `${rect.fw * 100}%`,
                    height: `${rect.fh * 100}%`,
                  }}
                />
              )}
            </div>
          )}

          <div className="action-bar">
            <button className="primary-btn" data-testid="crop-btn" onClick={apply} disabled={busy || !rect}>
              {busy ? 'Cropping…' : 'Crop & download'}
            </button>
            {!rect && <span className="action-hint">Drag on the page to select the area to keep.</span>}
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
