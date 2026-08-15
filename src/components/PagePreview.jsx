import { useEffect, useState } from 'react'
import { renderThumbnails } from '../lib/pdfText.js'

// Thumbnails render in batches so a huge PDF can't overwhelm the page; the
// user explicitly loads the next batch. Cached per file across all tools.
export const THUMB_BATCH = 100

const cache = new Map() // fileId -> entry

function notify(entry) {
  const snapshot = {
    thumbs: entry.thumbs,
    loadedTo: entry.loadedTo,
    target: entry.target,
    pageCount: entry.pageCount,
    error: entry.error,
  }
  entry.listeners.forEach((l) => l(snapshot))
}

function pump(entry) {
  if (entry.busy || entry.error || entry.loadedTo >= entry.target) return
  entry.busy = true
  const from = entry.loadedTo + 1
  const to = entry.target
  renderThumbnails(
    entry.bytes,
    110,
    (i0, url) => {
      entry.thumbs[i0] = url
      notify(entry)
    },
    from,
    to,
  ).then(
    () => {
      entry.loadedTo = to
      entry.busy = false
      notify(entry)
      pump(entry) // target may have grown while we rendered
    },
    (err) => {
      entry.error = err.message
      entry.busy = false
      notify(entry)
    },
  )
}

export function subscribeThumbs(fileId, bytes, pageCount, cb) {
  let entry = cache.get(fileId)
  if (!entry) {
    entry = {
      bytes,
      pageCount,
      thumbs: [],
      loadedTo: 0,
      target: Math.min(THUMB_BATCH, pageCount),
      busy: false,
      error: null,
      listeners: new Set(),
    }
    cache.set(fileId, entry)
    pump(entry)
  }
  entry.listeners.add(cb)
  cb({
    thumbs: entry.thumbs,
    loadedTo: entry.loadedTo,
    target: entry.target,
    pageCount: entry.pageCount,
    error: entry.error,
  })
  return () => entry.listeners.delete(cb)
}

export function loadMoreThumbs(fileId) {
  const entry = cache.get(fileId)
  if (!entry) return
  entry.target = Math.min(entry.pageCount, entry.target + THUMB_BATCH)
  notify(entry)
  pump(entry)
}

// Promise form: resolves with the currently-targeted batch fully rendered.
export function getThumbs(fileId, bytes, pageCount) {
  return new Promise((resolve, reject) => {
    const unsub = subscribeThumbs(fileId, bytes, pageCount, (e) => {
      if (e.error) {
        unsub()
        reject(new Error(e.error))
      } else if (e.loadedTo >= e.target) {
        unsub()
        resolve(e.thumbs)
      }
    })
  })
}

export function useThumbs(fileId, bytes, pageCount) {
  const [state, setState] = useState({ thumbs: [], loadedTo: 0, target: 0, pageCount: 0, error: null })
  useEffect(() => {
    if (!bytes || !pageCount) return undefined
    let active = true
    const unsub = subscribeThumbs(fileId, bytes, pageCount, (e) => active && setState(e))
    return () => {
      active = false
      unsub()
    }
  }, [fileId, bytes, pageCount])
  return state
}

// "Load next batch" affordance shared by the page grids.
export function LoadMoreThumbsButton({ fileId, thumbState }) {
  const { loadedTo, target, pageCount } = thumbState
  if (!pageCount || target >= pageCount) return null
  const remaining = pageCount - target
  return (
    <button className="link-btn" data-testid="load-more-thumbs" onClick={() => loadMoreThumbs(fileId)} disabled={loadedTo < target}>
      {loadedTo < target
        ? `Rendering pages ${loadedTo + 1}–${target}…`
        : `Load next ${Math.min(THUMB_BATCH, remaining)} page previews (${remaining} left)`}
    </button>
  )
}

// Page-thumbnail grid for one file. Clicking a page opens it in the inspector
// (onPageClick). Optional per-page decorations:
//   pageClass(i), badge(i), rotation(i) -> extra CSS degrees,
//   checkbox: { checked(i), onToggle(i) } -> selection checkbox in the corner.
export default function PagePreview({
  fileId,
  bytes,
  pageCount,
  pageClass,
  badge,
  onPageClick,
  rotation,
  checkbox,
}) {
  const thumbState = useThumbs(fileId, bytes, pageCount)
  const { thumbs, target, error } = thumbState

  if (error) return <p className="status status-error">Preview failed: {error}</p>

  const shown = Math.min(pageCount, target)
  return (
    <>
      <div className="preview-grid" data-testid="preview-grid">
        {Array.from({ length: shown }, (_, i) => (
          <div
            key={i}
            className={`preview-page ${pageClass?.(i) ?? ''} ${onPageClick ? 'preview-clickable' : ''}`}
            data-page={i + 1}
            onClick={onPageClick ? () => onPageClick(i) : undefined}
          >
            <div className="preview-thumb-box">
              {thumbs[i] ? (
                <img
                  src={thumbs[i]}
                  alt={`Page ${i + 1}`}
                  style={
                    rotation && rotation(i)
                      ? { transform: `rotate(${rotation(i)}deg) scale(0.72)` }
                      : undefined
                  }
                />
              ) : (
                <span className="thumb-placeholder">p.{i + 1}</span>
              )}
            </div>
            <span className="preview-page-num">{i + 1}</span>
            {badge?.(i) != null && <span className="preview-page-badge">{badge(i)}</span>}
            {checkbox && (
              <input
                type="checkbox"
                className="page-check"
                checked={checkbox.checked(i)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => checkbox.onToggle(i)}
                title="Select this page"
              />
            )}
          </div>
        ))}
      </div>
      <LoadMoreThumbsButton fileId={fileId} thumbState={thumbState} />
    </>
  )
}
