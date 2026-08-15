import { useRef, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import { baseName } from '../components/usePdfFiles.js'
import { reorderPages, loadPdf, assertValidOutput } from '../lib/pdfOps.js'
import { renderThumbnails } from '../lib/pdfText.js'
import { downloadBytes, formatBytes } from '../lib/download.js'

// Visual page organizer: thumbnails of every page, move left/right, save.
// Single-file tool — reordering is inherently per-document.
export default function OrganizeTool() {
  const [file, setFile] = useState(null) // { id, name, bytes, pageCount }
  const inspector = useInspector()
  // Refs, not state: drag events can fire in one batch and state would lag.
  const dragIdxRef = useRef(null)
  const [dragIdx, setDragIdxState] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const setDragIdx = (v) => {
    dragIdxRef.current = v
    setDragIdxState(v)
  }
  const [pages, setPages] = useState([]) // { srcIndex, thumb }
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)

  const onFiles = async ([f]) => {
    setStatus(null)
    setLoading(true)
    setPages([])
    try {
      const bytes = await f.arrayBuffer()
      const doc = await loadPdf(bytes) // validate (clear error for corrupt/encrypted)
      const thumbs = await renderThumbnails(bytes, 140)
      const loaded = { id: `organize-${f.name}-${f.size}`, name: f.name, bytes, pageCount: doc.getPageCount() }
      setFile(loaded)
      setPages(thumbs.map((thumb, i) => ({ srcIndex: i, thumb })))
      inspector.inspect(loaded, 1)
    } catch (err) {
      setFile(null)
      setStatus({ kind: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const movePageTo = (from, to) => {
    setPages((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const isChanged = pages.some((p, i) => p.srcIndex !== i)

  const save = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const bytes = await reorderPages(file.bytes, pages.map((p) => p.srcIndex))
      const { pageCount } = await assertValidOutput(bytes)
      const name = `${baseName(file.name)}-organized.pdf`
      downloadBytes(bytes, name)
      setStatus({
        kind: 'ok',
        text: `Created ${name} (${pageCount} pages, ${formatBytes(bytes.length)}) — download started.`,
      })
    } catch (err) {
      setStatus({ kind: 'error', text: `Save failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool-body">
      {!file && <FileDropZone onFiles={onFiles} accept={['.pdf']} multiple={false} />}
      {loading && <p className="status">Rendering page previews…</p>}

      {file && pages.length > 0 && (
        <div className="workspace">
        <div className="workspace-main">
          <div className="organize-header">
            <strong>{file.name}</strong> — {pages.length} pages. Drag pages to reorder, click to preview.
            <button className="back-link" onClick={() => { setFile(null); setPages([]); setStatus(null) }}>
              Choose a different file
            </button>
          </div>
          <div className="page-grid" data-testid="page-grid">
            {pages.map((page, i) => (
              <div
                key={page.srcIndex}
                className={`page-card preview-clickable ${overIdx === i && dragIdx !== null && dragIdx !== i ? 'drag-over' : ''} ${dragIdx === i ? 'dragging' : ''}`}
                data-src-index={page.srcIndex}
                draggable
                onDragStart={(e) => {
                  setDragIdx(i)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOverIdx(i)
                }}
                onDragLeave={() => setOverIdx((v) => (v === i ? null : v))}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIdxRef.current !== null) movePageTo(dragIdxRef.current, i)
                  setDragIdx(null)
                  setOverIdx(null)
                }}
                onDragEnd={() => {
                  setDragIdx(null)
                  setOverIdx(null)
                }}
                onClick={() => inspector.inspect(file, page.srcIndex + 1)}
                title="Click to preview · drag to reorder"
              >
                <img src={page.thumb} alt={`Page ${page.srcIndex + 1}`} />
                <div className="page-card-bar">
                  <span className="page-card-label">
                    {i + 1}
                    {page.srcIndex !== i && <em> (was {page.srcIndex + 1})</em>}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="action-bar">
            <button
              className="primary-btn"
              data-testid="organize-save-btn"
              onClick={save}
              disabled={busy || !isChanged}
            >
              {busy ? 'Saving…' : 'Save reordered PDF'}
            </button>
            {!isChanged && <span className="action-hint">Move at least one page to enable saving.</span>}
          </div>
        </div>
        <Inspector target={inspector.target} onNavigate={inspector.navigate} onClose={inspector.close} />
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
