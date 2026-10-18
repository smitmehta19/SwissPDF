// Workbench "Viewer" mode: one page at reading size, with file and page
// navigation. Arrow keys page through while the viewer has focus.
import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { renderPageImage } from '../lib/pdfText.js'
import { getBytes } from './fileStore.js'

export default function Viewer({ files, target, onTarget }) {
  const ready = files.filter((f) => f.status === 'ready')
  const file = ready.find((f) => f.id === target?.id) ?? ready[0]
  const page = file ? Math.min(Math.max(1, target?.id === file.id ? target.page : 1), file.pageCount) : 1
  const [img, setImg] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!file) return undefined
    let active = true
    setImg(null)
    setError(null)
    getBytes(file.id)
      .then((bytes) => renderPageImage(bytes, page, 1400))
      .then(
        (url) => active && setImg(url),
        (err) => active && setError(err.message),
      )
    return () => {
      active = false
    }
  }, [file?.id, page]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!file) return <p className="empty-line">Add a PDF to view it here.</p>
  const go = (n) => onTarget({ id: file.id, page: Math.min(Math.max(1, n), file.pageCount) })
  return (
    <section
      className="viewer"
      aria-label="Viewer"
      tabIndex={0}
      data-testid="viewer"
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'ArrowRight' || e.key === 'PageDown') go(page + 1)
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(page - 1)
      }}
    >
      <div className="viewer-bar">
        <select className="input input-small viewer-file" aria-label="File" value={file.id} onChange={(e) => onTarget({ id: e.target.value, page: 1 })}>
          {ready.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <div className="viewer-nav">
          <button type="button" className="icon-btn" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <Icon name="left" size={16} />
          </button>
          <label className="viewer-page">
            <span className="sr-only">Page</span>
            <input
              className="input input-small mono"
              type="number"
              min="1"
              max={file.pageCount}
              value={page}
              onChange={(e) => go(Number(e.target.value) || 1)}
            />
            <span className="mono">/ {file.pageCount}</span>
          </label>
          <button type="button" className="icon-btn" onClick={() => go(page + 1)} disabled={page >= file.pageCount} aria-label="Next page">
            <Icon name="right" size={16} />
          </button>
        </div>
      </div>
      <div className="viewer-stage">
        {error && <p className="field-error">{error}</p>}
        {!error && !img && <p className="empty-line">Rendering page {page}…</p>}
        {img && <img src={img} alt={`Page ${page} of ${file.name}`} data-testid="viewer-image" />}
      </div>
    </section>
  )
}
