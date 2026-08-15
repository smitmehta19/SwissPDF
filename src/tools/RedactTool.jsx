import { useRef, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import { baseName } from '../components/usePdfFiles.js'
import { loadPdf, assertValidOutput } from '../lib/pdfOps.js'
import { renderPageImage } from '../lib/pdfText.js'
import { downloadBytes, formatBytes } from '../lib/download.js'

export default function RedactTool() {
  const [file, setFile] = useState(null) // { name, bytes, pageCount, sizes }
  const [pageNum, setPageNum] = useState(1)
  const [pageImg, setPageImg] = useState(null)
  const [boxes, setBoxes] = useState([]) // { pageNum, x, y, w, h } in points (y from top)
  const [searchTerm, setSearchTerm] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const dragRef = useRef(null)
  const [dragRect, setDragRect] = useState(null)
  const stageRef = useRef(null)

  const onFiles = async ([f]) => {
    setStatus(null)
    setBoxes([])
    try {
      const bytes = await f.arrayBuffer()
      const doc = await loadPdf(bytes)
      const sizes = doc.getPages().map((p) => p.getSize())
      setFile({ name: f.name, bytes, pageCount: doc.getPageCount(), sizes })
      setPageNum(1)
      setPageImg(await renderPageImage(bytes, 1, 900))
    } catch (err) {
      setFile(null)
      setStatus({ kind: 'error', text: err.message })
    }
  }

  const gotoPage = async (n) => {
    if (!file || n < 1 || n > file.pageCount) return
    setPageNum(n)
    setPageImg(null)
    setPageImg(await renderPageImage(file.bytes, n, 900))
  }

  const relPoint = (e) => {
    const box = stageRef.current.getBoundingClientRect()
    return {
      fx: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      fy: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    }
  }

  const onMouseUp = () => {
    if (dragRef.current && dragRect) {
      const size = file.sizes[pageNum - 1]
      const box = {
        pageNum,
        x: dragRect.fx * size.width,
        y: dragRect.fy * size.height,
        w: dragRect.fw * size.width,
        h: dragRect.fh * size.height,
      }
      if (box.w > 3 && box.h > 3) setBoxes((prev) => [...prev, box])
    }
    dragRef.current = null
    setDragRect(null)
  }

  const findAndMark = async () => {
    setStatus(null)
    try {
      const { findTextBoxes } = await import('../lib/redactOps.js')
      const found = await findTextBoxes(
        file.bytes,
        searchTerm.split(',').map((t) => t.trim()),
      )
      if (found.length === 0) {
        setStatus({ kind: 'error', text: `No matches found for "${searchTerm}".` })
        return
      }
      setBoxes((prev) => [...prev, ...found])
      setStatus({ kind: 'ok', text: `Marked ${found.length} occurrence${found.length === 1 ? '' : 's'} for redaction.` })
    } catch (err) {
      setStatus({ kind: 'error', text: err.message })
    }
  }

  const apply = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { redactPdf } = await import('../lib/redactOps.js')
      const bytes = await redactPdf(file.bytes, boxes, {
        onProgress: (m) => setStatus({ kind: 'ok', text: m }),
      })
      await assertValidOutput(bytes)
      const name = `${baseName(file.name)}-redacted.pdf`
      downloadBytes(bytes, name)
      setStatus({
        kind: 'ok',
        text: `Created ${name} (${formatBytes(bytes.length)}). The hidden content is permanently destroyed — it cannot be copied, searched, or recovered.`,
      })
    } catch (err) {
      setStatus({ kind: 'error', text: `Redact failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  const pageBoxes = boxes.filter((b) => b.pageNum === pageNum)
  const size = file?.sizes[pageNum - 1]

  return (
    <div className="tool-body">
      {!file && <FileDropZone onFiles={onFiles} accept={['.pdf']} multiple={false} />}
      {!file && (
        <p className="option-help">
          The covered content is destroyed in the output — not just hidden behind a black box.
        </p>
      )}

      {file && (
        <>
          <div className="options-panel">
            <div className="option-row">
              <strong>{file.name}</strong>
              <button className="back-link" onClick={() => { setFile(null); setBoxes([]); setStatus(null) }}>
                Choose a different file
              </button>
              <span style={{ flex: 1 }} />
              <button className="toggle-btn" onClick={() => gotoPage(pageNum - 1)} disabled={pageNum <= 1}>
                ← Prev
              </button>
              <span className="option-help">Page {pageNum} of {file.pageCount}</span>
              <button className="toggle-btn" onClick={() => gotoPage(pageNum + 1)} disabled={pageNum >= file.pageCount}>
                Next →
              </button>
            </div>
            <div className="option-row">
              <input
                className="text-input"
                style={{ flex: 1 }}
                data-testid="redact-search"
                placeholder='Find and mark every occurrence — e.g. "John Smith, 555-0100"'
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button className="toggle-btn" data-testid="redact-find-btn" onClick={findAndMark} disabled={!searchTerm.trim()}>
                Find &amp; mark
              </button>
              <span className="option-help" data-testid="redact-count">
                {boxes.length} area{boxes.length === 1 ? '' : 's'} marked
              </span>
              {boxes.length > 0 && (
                <button className="link-btn" onClick={() => setBoxes([])}>
                  Clear all
                </button>
              )}
            </div>
          </div>

          <p className="option-help">Drag over anything you want removed. Click a marked area to unmark it.</p>

          {!pageImg ? (
            <p className="preview-loading">Rendering page…</p>
          ) : (
            <div
              ref={stageRef}
              className="crop-stage"
              data-testid="redact-stage"
              onMouseDown={(e) => {
                e.preventDefault()
                dragRef.current = relPoint(e)
                setDragRect(null)
              }}
              onMouseMove={(e) => {
                if (!dragRef.current) return
                const start = dragRef.current
                const now = relPoint(e)
                setDragRect({
                  fx: Math.min(start.fx, now.fx),
                  fy: Math.min(start.fy, now.fy),
                  fw: Math.abs(now.fx - start.fx),
                  fh: Math.abs(now.fy - start.fy),
                })
              }}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              <img src={pageImg} alt={`Page ${pageNum}`} draggable={false} />
              {size &&
                pageBoxes.map((b, i) => (
                  <span
                    key={i}
                    className="redact-box"
                    data-testid="redact-box"
                    style={{
                      left: `${(b.x / size.width) * 100}%`,
                      top: `${(b.y / size.height) * 100}%`,
                      width: `${(b.w / size.width) * 100}%`,
                      height: `${(b.h / size.height) * 100}%`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setBoxes((prev) => prev.filter((x) => x !== b))
                    }}
                  />
                ))}
              {dragRect && (
                <span
                  className="redact-box redact-box-draft"
                  style={{
                    left: `${dragRect.fx * 100}%`,
                    top: `${dragRect.fy * 100}%`,
                    width: `${dragRect.fw * 100}%`,
                    height: `${dragRect.fh * 100}%`,
                  }}
                />
              )}
            </div>
          )}

          <div className="action-bar">
            <button className="primary-btn" data-testid="redact-btn" onClick={apply} disabled={busy || boxes.length === 0}>
              {busy ? 'Redacting…' : `Redact ${boxes.length} area${boxes.length === 1 ? '' : 's'} & download`}
            </button>
            <span className="action-hint">Redacted pages become images so the removed content is unrecoverable.</span>
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
