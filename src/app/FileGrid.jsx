// Workbench "Files" mode: one card per workspace file. Click selects, the
// card buttons rotate, open, step back a version or remove. Drag reorders;
// the move buttons do the same without dragging.
import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { formatBytes } from '../lib/download.js'
import { renderPageImage } from '../lib/pdfText.js'
import { getBytes, getRecord, isPdfRecord, remove, reorder, revertVersion, sortBy, submitPassword, historyOf, siblingsOf, subscribe, undoPreview, undoProblem } from './fileStore.js'
import { Dialog } from './controls.jsx'

const coverCache = new Map() // file id -> Promise<dataUrl>
const imageCovers = new Map() // file id -> Promise<object URL> (HEIC, TIFF)

// Covers of files that left the workspace (removed, wiped, now an older
// version) are dropped with them.
subscribe(() => {
  for (const id of coverCache.keys()) if (!getRecord(id)?.isLeaf) coverCache.delete(id)
  for (const [id, p] of imageCovers) {
    if (getRecord(id)?.isLeaf) continue
    imageCovers.delete(id)
    p.then((url) => URL.revokeObjectURL(url), () => {})
  }
})

// HEIC and TIFF: the browser cannot show them, so the cover is the first
// frame decoded the way Images to PDF decodes it, scaled to 240 px.
function imageCoverOf(file) {
  if (!imageCovers.has(file.id)) {
    const p = (async () => {
      const { normalizeImage } = await import('../lib/imageOps.js')
      const frame = await normalizeImage(new Uint8Array(await file.blob.arrayBuffer()), { quality: 'small' })
      const bitmap = await createImageBitmap(new Blob([frame.bytes]), { resizeWidth: 240, resizeQuality: 'medium' })
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d').drawImage(bitmap, 0, 0)
      bitmap.close?.()
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
      return URL.createObjectURL(blob)
    })()
    p.catch(() => imageCovers.delete(file.id))
    imageCovers.set(file.id, p)
  }
  return imageCovers.get(file.id)
}
const decodedImage = (file) => /\.(heic|heif|tiff?)$/i.test(file.name) || /^image\/(heic|heif|tiff)$/.test(file.type)

function coverOf(id) {
  if (!coverCache.has(id)) {
    coverCache.set(
      id,
      getBytes(id)
        .then((bytes) => renderPageImage(bytes, 1, 240))
        .catch((err) => {
          coverCache.delete(id)
          throw err
        }),
    )
  }
  return coverCache.get(id)
}

// Label for a non-PDF file: its extension ("DOCX").
export const typeLabel = (name) => (/\.([^.]+)$/.exec(name)?.[1] ?? 'file').toUpperCase()

// Images the browser can show directly get their own picture as the cover.
// With showText, text files (Markdown) show their first lines.
export function OtherCover({ file, className = 'fc-cover', showText = false }) {
  const [src, setSrc] = useState(null)
  const [text, setText] = useState(null)
  useEffect(() => {
    if (!file.blob) return undefined
    if (showText && /^text\//.test(file.type)) {
      let active = true
      file.blob
        .slice(0, 4000)
        .text()
        .then((t) => active && setText(t))
      return () => {
        active = false
      }
    }
    if (decodedImage(file)) {
      let active = true
      imageCoverOf(file).then(
        (url) => active && setSrc(url),
        () => {},
      )
      return () => {
        active = false
      }
    }
    if (!/^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(file.type)) return undefined
    const url = URL.createObjectURL(file.blob)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (text) return <pre className="result-text">{text}</pre>
  return (
    <span className={className} aria-hidden="true">
      {src ? <img src={src} alt="" onError={() => setSrc(null)} /> : <span className="fc-blank">{typeLabel(file.name)}</span>}
      {src && decodedImage(file) && <span className="fc-badge mono">{typeLabel(file.name)}</span>}
    </span>
  )
}

function Cover({ file }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    if (file.status !== 'ready' || !isPdfRecord(file)) return undefined
    let active = true
    coverOf(file.id).then(
      (url) => active && setSrc(url),
      () => {},
    )
    return () => {
      active = false
    }
  }, [file.id, file.status])
  return (
    <span className="fc-cover" aria-hidden="true">
      {src ? <img src={src} alt="" /> : <span className={`fc-blank ${file.status === 'reading' ? 'is-loading' : ''}`}>PDF</span>}
    </span>
  )
}

export function metaLine(file) {
  if (file.status === 'reading') return 'Reading…'
  if (file.status === 'error') return file.error
  if (file.status === 'locked') return 'Password needed to open this file'
  if (!isPdfRecord(file)) return `${typeLabel(file.name)}, ${formatBytes(file.size)}`
  return `${file.pageCount} page${file.pageCount === 1 ? '' : 's'}, ${formatBytes(file.size)}`
}

function PasswordPrompt({ file }) {
  const [pw, setPw] = useState('')
  return (
    <form
      className="fc-pw"
      data-testid="pw-prompt"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault()
        if (pw && !file.unlocking) submitPassword(file.id, pw)
      }}
    >
      <p className="fc-lock-hint" data-testid="pw-hint">
        <Icon name="lock" size={13} />
        Locked: type the password here, or open Unlock.
      </p>
      <input
        className="input"
        type="password"
        autoComplete="off"
        placeholder="Password"
        aria-label={`Password for ${file.name}`}
        data-testid="pw-unlock-input"
        value={pw}
        disabled={file.unlocking}
        onChange={(e) => setPw(e.target.value)}
      />
      <button type="submit" className="btn btn-quiet" data-testid="pw-unlock-btn" disabled={!pw || file.unlocking}>
        {file.unlocking ? 'Unlocking…' : 'Unlock'}
      </button>
      {file.passwordError && (
        <p className="field-error" role="alert" data-testid="pw-error">
          {file.passwordError}
        </p>
      )}
    </form>
  )
}

// Cards rendered at once; more on request.
const GRID_WINDOW = 120

// What a card says when a file cannot be opened; the engine text sits behind Details.
const BROKEN = "Can't open this PDF. The file looks damaged or incomplete."

function FileCard({ file, index, count, selected: picked, scope, onToggle, onOpen, onRotate, onConfirm, onRemove, drag }) {
  const ready = file.status === 'ready'
  const pdf = isPdfRecord(file)
  const versions = file.version > 1 ? historyOf(file.id).length : 0
  // a file the open tool cannot use is never shown as going into the run
  const unused = !!scope && file.status !== 'reading' && file.status !== 'error' && !scope.uses(file)
  const selected = picked && !unused
  const meta = file.status === 'error' ? BROKEN : metaLine(file)
  const label = `${file.name}, ${meta}${versions > 0 ? `, version ${file.version}` : ''}${unused ? `, not used by ${scope.name}` : ''}`
  return (
    <li
      className={`fc ${selected ? 'is-selected' : ''} ${unused ? 'is-unused' : ''} ${file.status === 'error' ? 'is-error' : ''} ${drag.over === index ? 'is-over' : ''} ${drag.from === index ? 'is-dragging' : ''}`}
      data-testid="file-card"
      draggable
      onDragStart={(e) => {
        drag.start(index)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => {
        e.preventDefault()
        drag.hover(index)
      }}
      onDrop={(e) => {
        e.preventDefault()
        drag.drop(index)
      }}
      onDragEnd={drag.end}
    >
      <button
        type="button"
        className="fc-main"
        aria-pressed={selected}
        aria-label={label}
        disabled={!ready && file.status !== 'locked'}
        onClick={() => onToggle(file.id)}
        onDoubleClick={() => ready && pdf && onOpen(file.id)}
        title={ready ? (pdf ? 'Click to select, double click to open' : 'Click to select') : undefined}
      >
        {pdf ? <Cover file={file} /> : <OtherCover file={file} />}
        <span className="fc-check" aria-hidden="true">
          <Icon name="check" size={13} />
        </span>
        {(ready || versions > 0) && (
          <span className={`fc-version mono ${file.version > 1 ? 'is-new' : ''}`} title={`Version ${file.version}`}>
            v{file.version}
          </span>
        )}
      </button>
      <div className="fc-text">
        <span className="file-name" title={file.name}>
          {file.name}
        </span>
        <span className={`file-meta ${file.status === 'error' ? 'is-error' : ''}`} role={file.status === 'error' ? 'alert' : undefined}>
          {meta}
        </span>
        {file.status === 'error' && (
          <details className="fc-details">
            <summary>Details</summary>
            <span data-testid="file-error-details">
              {[file.error, file.errorDetails !== file.error ? file.errorDetails : null].filter(Boolean).join('. ')}
            </span>
          </details>
        )}
        {unused && (
          <span className="fc-unused" data-testid="file-unused">
            {file.status === 'locked' ? 'Locked: unlock it first' : `Not used by ${scope.name}`}
          </span>
        )}
        {ready && file.notices?.length > 0 && (
          <span className="file-meta fc-detail fc-notice" data-testid="file-notice" title={file.notices.join('. ')}>
            {file.notices.join('. ')}
          </span>
        )}
      </div>
      {file.status === 'locked' && <PasswordPrompt file={file} />}
      <div className="fc-actions">
        <button type="button" className="icon-btn" onClick={() => onOpen(file.id)} disabled={!ready || !pdf} aria-label={`Open ${file.name}`} title="Open in viewer">
          <Icon name="viewer" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={() => onRotate(file.id)} disabled={!ready || !pdf} aria-label={`Rotate ${file.name}`} title="Rotate all pages right">
          <Icon name="rotate" size={16} />
        </button>
        {file.parentIds?.length > 0 && (
          <button type="button" className="icon-btn" onClick={() => onConfirm({ kind: 'undo', file })} aria-label={`Undo last change to ${file.name}`} title="Back to the previous version">
            <Icon name="undo" size={16} />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={() => reorder(index, index - 1)} disabled={index === 0} aria-label={`Move ${file.name} earlier`} title="Move earlier">
          <Icon name="left" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={() => reorder(index, index + 1)} disabled={index === count - 1} aria-label={`Move ${file.name} later`} title="Move later">
          <Icon name="right" size={16} />
        </button>
        <button type="button" className="icon-btn icon-btn-danger" onClick={() => (file.version > 1 ? onConfirm({ kind: 'remove', file }) : onRemove(file))} aria-label={`Remove ${file.name}`} title="Remove file">
          <Icon name="close" size={16} />
        </button>
      </div>
    </li>
  )
}

// Hidden picker shared by the add tile, the start area and the bar button.
export function AddFilesInput({ inputRef, onFiles, accept = '.pdf,application/pdf' }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple
      hidden
      data-testid="add-files-input"
      onChange={(e) => {
        onFiles(e.target.files)
        e.target.value = ''
      }}
    />
  )
}

export default function FileGrid({ files, selection, onToggle, onSelectAll, onOpen, onRotate, onAdd, onWipe, scope = null, onStatus, onRestored }) {
  const fromRef = useRef(null)
  const [from, setFrom] = useState(null)
  const [over, setOver] = useState(null)
  const drag = {
    from,
    over,
    start: (i) => {
      fromRef.current = i
      setFrom(i)
    },
    hover: (i) => setOver(i),
    drop: (i) => {
      if (fromRef.current !== null && fromRef.current !== i) reorder(fromRef.current, i)
      drag.end()
    },
    end: () => {
      fromRef.current = null
      setFrom(null)
      setOver(null)
    },
  }
  const [confirm, setConfirm] = useState(null) // { kind: 'remove' | 'undo', file }
  // a 956-part split must not mount 956 cards in one frame: show a window first
  const [limit, setLimit] = useState(GRID_WINDOW)
  const shown = files.length > limit ? files.slice(0, limit) : files
  // with a tool open, only the files it can use count
  const usable = scope ? files.filter((f) => scope.uses(f)) : files.filter((f) => f.status === 'ready')
  const selectedCount = usable.filter((f) => selection.has(f.id)).length
  const doRemove = async (file) => {
    await remove(file.id)
    onStatus?.(`Removed ${file.name}.`)
  }
  const doUndo = async (file) => {
    const name = file.name
    const back = await revertVersion(file.id)
    // the files that came back are selected again, ready for another try
    if (back?.length) onRestored?.(back)
    onStatus?.(`Undid the last change to ${name}.`)
  }
  const blocked = confirm?.kind === 'undo' ? undoProblem(confirm.file.id) : null
  const preview = confirm?.kind === 'undo' && !blocked ? undoPreview(confirm.file.id) : null
  return (
    <section className="file-grid-wrap" aria-label="Files">
      <div className="grid-toolbar">
        <span className="grid-count" data-testid="grid-count">
          {scope ? (
            <>
              <span className="mono">{scope.count}</span> of <span className="mono">{files.length}</span> file{files.length === 1 ? '' : 's'} go into {scope.name}
            </>
          ) : (
            <>
              <span className="mono">{selectedCount}</span> of <span className="mono">{usable.length}</span> selected
            </>
          )}
        </span>
        <button type="button" className="link" onClick={() => onSelectAll(selectedCount < usable.length)}>
          {selectedCount < usable.length ? 'Select all' : 'Select none'}
        </button>
        <label className="sort">
          <span>Sort by</span>
          <select
            className="input input-small"
            value=""
            data-testid="sort-select"
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':')
              if (key) sortBy(key, dir)
            }}
          >
            <option value="">Order added</option>
            <option value="name:asc">Name A to Z</option>
            <option value="name:desc">Name Z to A</option>
            <option value="size:asc">Smallest first</option>
            <option value="size:desc">Largest first</option>
            <option value="date:asc">Oldest first</option>
            <option value="date:desc">Newest first</option>
          </select>
        </label>
        <button type="button" className="link link-danger" onClick={onWipe} data-testid="wipe-all">
          Remove all
        </button>
      </div>
      <ul className="file-grid" data-testid="file-grid">
        {shown.map((f, i) => (
          <FileCard
            key={f.id}
            file={f}
            index={i}
            count={files.length}
            selected={selection.has(f.id)}
            scope={scope}
            onToggle={onToggle}
            onOpen={onOpen}
            onRotate={onRotate}
            onConfirm={setConfirm}
            onRemove={doRemove}
            drag={drag}
          />
        ))}
        {shown.length < files.length && (
          <li className="fc fc-add">
            <button type="button" className="fc-add-btn" onClick={() => setLimit((n) => n + GRID_WINDOW)} data-testid="grid-more">
              <span>
                Show {Math.min(GRID_WINDOW, files.length - shown.length)} more of {files.length - shown.length}
              </span>
            </button>
          </li>
        )}
        <li className="fc fc-add">
          <button type="button" className="fc-add-btn" onClick={onAdd} data-testid="add-files-tile">
            <Icon name="plus" size={22} />
            <span>Add files</span>
          </button>
        </li>
      </ul>
      {confirm && (
        <Dialog
          title={confirm.kind === 'remove' ? 'Remove this file?' : blocked ? 'Cannot undo this yet' : 'Undo the last change?'}
          onClose={() => setConfirm(null)}
          testId="file-confirm"
          actions={
            blocked ? (
              <button type="button" className="btn btn-quiet" onClick={() => setConfirm(null)}>
                OK
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-quiet" onClick={() => setConfirm(null)}>
                  {confirm.kind === 'remove' ? 'Keep file' : 'Keep this version'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  data-testid="file-confirm-ok"
                  onClick={() => {
                    const { kind, file } = confirm
                    setConfirm(null)
                    if (kind === 'remove') doRemove(file)
                    else doUndo(file)
                  }}
                >
                  {confirm.kind === 'remove' ? 'Remove file' : 'Undo change'}
                </button>
              </>
            )
          }
        >
          <p>
            {confirm.kind === 'remove'
              ? `${confirm.file.name} and its ${confirm.file.version - 1} earlier version${confirm.file.version === 2 ? '' : 's'} are deleted from this browser.`
              : blocked
                ? blocked
                : preview.restores.length
                  ? `Undo deletes ${preview.removes.join(', ')} and brings back ${preview.restores.join(', ')}.`
                  : `Undo deletes ${preview.removes.join(', ')}. No other file changes.`}
          </p>
        </Dialog>
      )}
    </section>
  )
}
