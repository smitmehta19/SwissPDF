import { useEffect, useState } from 'react'
import { renderPageImage } from '../lib/pdfText.js'

const imageCache = new Map() // `${fileId}:${pageNum}` -> Promise<dataUrl>

function getPageImage(fileId, bytes, pageNum) {
  const key = `${fileId}:${pageNum}`
  if (!imageCache.has(key)) {
    imageCache.set(
      key,
      renderPageImage(bytes, pageNum, 620).catch((err) => {
        imageCache.delete(key)
        throw err
      }),
    )
  }
  return imageCache.get(key)
}

// Right-side detail panel: a large, readable render of one page of one file,
// with prev/next navigation through the whole document.
// target: { item: {id, bytes, pageCount, name}, pageNum } or null.
export default function Inspector({ target, onNavigate, onClose }) {
  const [image, setImage] = useState(null)
  const [error, setError] = useState(null)

  const item = target?.item
  const pageNum = target?.pageNum

  useEffect(() => {
    if (!item) return undefined
    let active = true
    setImage(null)
    setError(null)
    // Plain images (JPG→PDF tool) display directly; PDF pages render via pdf.js.
    if (item.imageUrl) {
      setImage(item.imageUrl)
      return undefined
    }
    getPageImage(item.id, item.bytes, pageNum).then(
      (img) => active && setImage(img),
      (err) => active && setError(err.message),
    )
    return () => {
      active = false
    }
  }, [item, pageNum])

  return (
    <aside className="inspector" data-testid="inspector">
      {!target ? (
        <p className="inspector-empty">
          Click a file or a page (🔍) to preview it here at full size.
        </p>
      ) : (
        <>
          <div className="inspector-header">
            <span className="inspector-name" title={item.name}>
              {item.name}
            </span>
            <button className="inspector-close" onClick={onClose} title="Close preview">
              ✕
            </button>
          </div>
          <div className="inspector-nav">
            <button
              onClick={() => onNavigate(pageNum - 1)}
              disabled={pageNum <= 1}
              data-testid="inspector-prev"
            >
              ← Prev
            </button>
            <span data-testid="inspector-page-label">
              Page {pageNum} of {item.pageCount}
            </span>
            <button
              onClick={() => onNavigate(pageNum + 1)}
              disabled={pageNum >= item.pageCount}
              data-testid="inspector-next"
            >
              Next →
            </button>
          </div>
          <div className="inspector-body">
            {error && <p className="status status-error">{error}</p>}
            {!error && !image && <p className="preview-loading">Rendering page {pageNum}…</p>}
            {image && <img src={image} alt={`Page ${pageNum} of ${item.name}`} data-testid="inspector-image" />}
          </div>
        </>
      )}
    </aside>
  )
}

// Small helper hook shared by every tool page.
export function useInspector() {
  const [target, setTarget] = useState(null)
  return {
    target,
    inspect: (item, pageNum = 1) =>
      setTarget({
        item: {
          id: item.id,
          bytes: item.bytes,
          pageCount: item.pageCount ?? 1,
          name: item.file?.name ?? item.name,
          imageUrl: item.imageUrl ?? null,
        },
        pageNum,
      }),
    navigate: (pageNum) => setTarget((t) => (t ? { ...t, pageNum } : t)),
    close: () => setTarget(null),
  }
}
