import { useEffect, useRef, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import FileGroups from '../components/FileGroups.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import { useThumbs, LoadMoreThumbsButton } from '../components/PagePreview.jsx'
import { usePdfFiles, baseName } from '../components/usePdfFiles.js'
import { mergePdfs, extractPages, assertValidOutput } from '../lib/pdfOps.js'
import { downloadBytes, formatBytes } from '../lib/download.js'

// Per-file page editor inside an expanded group: drag pages to reorder within
// the file, ✕ deletes a page from the merge, clicking a page previews it.
function MergePageEditor({ item, order, onChange, onInspect }) {
  const thumbState = useThumbs(item.id, item.bytes, item.pageCount)
  const { thumbs } = thumbState
  // Refs, not state: drag events can fire in one batch and state would lag.
  const dragIdxRef = useRef(null)
  const [dragIdx, setDragIdxState] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const setDragIdx = (v) => {
    dragIdxRef.current = v
    setDragIdxState(v)
  }

  const moveTo = (from, to) => {
    if (from === to) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }
  const drop = (idx) => onChange(order.filter((_, i) => i !== idx))
  const edited = order.length !== item.pageCount || order.some((p, i) => p !== i + 1)

  return (
    <>
      <div className="preview-grid">
        {order.map((pageNum, idx) => (
          <div
            key={pageNum}
            className={`preview-page merge-page preview-clickable ${overIdx === idx && dragIdx !== null && dragIdx !== idx ? 'drag-over' : ''} ${dragIdx === idx ? 'dragging' : ''}`}
            data-page={pageNum}
            draggable
            onDragStart={(e) => {
              setDragIdx(idx)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setOverIdx(idx)
            }}
            onDragLeave={() => setOverIdx((v) => (v === idx ? null : v))}
            onDrop={(e) => {
              e.preventDefault()
              if (dragIdxRef.current !== null) moveTo(dragIdxRef.current, idx)
              setDragIdx(null)
              setOverIdx(null)
            }}
            onDragEnd={() => {
              setDragIdx(null)
              setOverIdx(null)
            }}
            onClick={() => onInspect(pageNum)}
            title="Click to preview · drag to reorder"
          >
            <button
              className="page-delete"
              title="Delete this page from the merge"
              onClick={(e) => {
                e.stopPropagation()
                drop(idx)
              }}
            >
              ✕
            </button>
            <div className="preview-thumb-box">
              {thumbs[pageNum - 1] ? (
                <img src={thumbs[pageNum - 1]} alt={`Page ${pageNum}`} />
              ) : (
                <span className="thumb-placeholder">p.{pageNum}</span>
              )}
            </div>
            <span className="preview-page-num">
              {idx + 1}
              {pageNum !== idx + 1 && <em className="was-label"> (was {pageNum})</em>}
            </span>
          </div>
        ))}
      </div>
      <div className="editor-links">
        <LoadMoreThumbsButton fileId={item.id} thumbState={thumbState} />
        {edited && (
          <button
            className="link-btn"
            onClick={() => onChange(Array.from({ length: item.pageCount }, (_, i) => i + 1))}
          >
            Restore all {item.pageCount} pages in original order
          </button>
        )}
      </div>
    </>
  )
}

export default function MergeTool() {
  const { items, validItems, addFiles, reorder, remove } = usePdfFiles()
  const [edits, setEdits] = useState({}) // itemId -> ordered 1-based pageNumbers
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const inspector = useInspector()

  // The inspector opens on its own as soon as the first file is readable.
  useEffect(() => {
    if (!inspector.target && validItems.length > 0) inspector.inspect(validItems[0], 1)
  }, [validItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const orderOf = (item) => edits[item.id] ?? Array.from({ length: item.pageCount }, (_, i) => i + 1)
  const setOrder = (item, order) => setEdits((prev) => ({ ...prev, [item.id]: order }))

  const contributing = validItems.filter((it) => orderOf(it).length > 0)
  const totalPages = contributing.reduce((sum, it) => sum + orderOf(it).length, 0)

  const merge = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const bytes = await mergePdfs(
        contributing.map((it) => ({ bytes: it.bytes, pageNumbers: orderOf(it) })),
      )
      const { pageCount } = await assertValidOutput(bytes)
      downloadBytes(bytes, 'merged.pdf')
      setStatus({
        kind: 'ok',
        text: `Merged ${contributing.length} files (${pageCount} pages, ${formatBytes(bytes.length)}) — download started.`,
      })
    } catch (err) {
      setStatus({ kind: 'error', text: `Merge failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  const saveSingle = async (item) => {
    setStatus(null)
    try {
      const bytes = await extractPages(item.bytes, orderOf(item))
      await assertValidOutput(bytes)
      const name = `${baseName(item.file.name)}-edited.pdf`
      downloadBytes(bytes, name)
      setStatus({ kind: 'ok', text: `Saved ${name} (${orderOf(item).length} pages) — download started.` })
    } catch (err) {
      setStatus({ kind: 'error', text: `Save failed: ${err.message}` })
    }
  }

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />

      <div className="workspace">
        <div className="workspace-main">
          <FileGroups
            items={items}
            onReorder={reorder}
            onRemove={remove}
            onInspectFile={(item) => inspector.inspect(item, 1)}
            cardMeta={(item) =>
              orderOf(item).length !== item.pageCount
                ? `${orderOf(item).length} of ${item.pageCount} pages kept`
                : null
            }
            renderExpanded={(item) => (
              <>
                <MergePageEditor
                  item={item}
                  order={orderOf(item)}
                  onChange={(order) => setOrder(item, order)}
                  onInspect={(pageNum) => inspector.inspect(item, pageNum)}
                />
                <button className="link-btn" onClick={() => saveSingle(item)}>
                  Download just this file with these edits
                </button>
              </>
            )}
          />

          {items.length > 0 && (
            <div className="action-bar">
              <button
                className="primary-btn"
                data-testid="merge-btn"
                onClick={merge}
                disabled={busy || contributing.length < 2}
              >
                {busy
                  ? 'Merging…'
                  : `Merge ${contributing.length} PDF${contributing.length === 1 ? '' : 's'} (${totalPages} pages)`}
              </button>
              {contributing.length < 2 && (
                <span className="action-hint">Add at least 2 valid PDFs (with pages remaining) to merge.</span>
              )}
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
