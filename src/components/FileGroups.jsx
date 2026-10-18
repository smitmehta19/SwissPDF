import { useRef, useState } from 'react'
import { useThumbs } from './PagePreview.jsx'
import Icon from './Icon.jsx'
import { formatBytes } from '../lib/download.js'

// Second meta line (notices, error cause): one line, cut with an ellipsis.
const detailStyle = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

function CoverThumb({ item }) {
  const { thumbs } = useThumbs(item.id, item.bytes, item.pageCount)
  return (
    <span className="group-cover">
      {thumbs[0] ? <img src={thumbs[0]} alt="" /> : <span className="group-cover-blank">PDF</span>}
    </span>
  )
}

// Inline unlock for a file that needs its open password.
function PasswordPrompt({ item, onSubmit }) {
  const [password, setPassword] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (password && !item.unlocking) onSubmit(password)
  }
  return (
    <form className="group-body" onSubmit={submit} data-testid="pw-prompt">
      <div className="option-row">
        <input
          className="text-input"
          style={{ flex: 1, minWidth: 160 }}
          type="password"
          autoComplete="off"
          placeholder="Password"
          aria-label={`Password for ${item.file.name}`}
          data-testid="pw-unlock-input"
          value={password}
          disabled={item.unlocking}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="toggle-btn" data-testid="pw-unlock-btn" disabled={!password || item.unlocking}>
          {item.unlocking ? 'Unlocking…' : 'Unlock'}
        </button>
      </div>
      {item.passwordError && (
        <p className="option-help" role="alert" style={{ color: 'var(--err)', marginTop: 8 }} data-testid="pw-error">
          {item.passwordError}
        </p>
      )}
    </form>
  )
}

// Collapsed-by-default file cards shared by every tool. Click the header to
// expand a file into the tool's page view; drag cards to reorder files.
export default function FileGroups({
  items,
  onReorder,
  onRemove,
  onInspectFile,
  renderExpanded,
  cardMeta,
  onSubmitPassword,
}) {
  const [expanded, setExpanded] = useState(() => new Set())
  // Refs, not state: drag events can fire in one batch and state would lag.
  const dragIdxRef = useRef(null)
  const [dragIdx, setDragIdxState] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const setDragIdx = (v) => {
    dragIdxRef.current = v
    setDragIdxState(v)
  }

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (items.length === 0) return null
  return (
    <div className="group-list" data-testid="group-list">
      {items.map((item, i) => {
        const usable = !item.error && item.pageCount !== null
        const isOpen = expanded.has(item.id) && usable
        const unlock = item.needsPassword
          ? (pw) => (onSubmitPassword ? onSubmitPassword(item.id, pw) : item.submitPassword?.(pw))
          : null
        return (
          <section
            key={item.id}
            className={`group-card ${item.error ? 'group-card-error' : ''} ${overIdx === i && dragIdx !== null && dragIdx !== i ? 'drag-over' : ''} ${dragIdx === i ? 'dragging' : ''}`}
            data-testid="group-card"
          >
            <header
              className="group-header"
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
                const from = dragIdxRef.current
                if (from !== null && from !== i) onReorder(from, i)
                setDragIdx(null)
                setOverIdx(null)
              }}
              onDragEnd={() => {
                setDragIdx(null)
                setOverIdx(null)
              }}
              onClick={() => {
                if (usable) {
                  toggle(item.id)
                  onInspectFile?.(item)
                }
              }}
              title={usable ? 'Click to open · drag to reorder' : undefined}
            >
              <span className="group-chevron">{isOpen ? '▾' : '▸'}</span>
              <span className="file-order">{i + 1}</span>
              <CoverThumb item={item} />
              <span className="group-title">
                <span className="file-name" title={item.file.name}>
                  {item.file.name}
                </span>
                <span className="file-meta">
                  {item.error
                    ? item.error
                    : item.needsPassword
                      ? 'Password needed to open this file'
                      : item.pageCount === null
                        ? 'Reading…'
                        : `${item.pageCount} page${item.pageCount === 1 ? '' : 's'} · ${formatBytes(item.file.size)}`}
                  {usable && cardMeta?.(item) && (
                    <em className="group-meta-extra"> — {cardMeta(item)}</em>
                  )}
                </span>
                {item.error && item.errorDetails && item.errorDetails !== item.error && (
                  <span className="file-meta" title={item.errorDetails} data-testid="file-error-details" style={detailStyle}>
                    {item.errorDetails}
                  </span>
                )}
                {usable && item.notices?.length > 0 && (
                  <span className="file-meta" data-testid="file-notice" style={detailStyle}>
                    {item.notices.join('. ')}
                  </span>
                )}
              </span>
              <span className="file-actions" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => onRemove(item.id)} title="Remove file" aria-label="Remove file">
                  <Icon name="close" size={13} />
                </button>
              </span>
            </header>
            {unlock && <PasswordPrompt item={item} onSubmit={unlock} />}
            {isOpen && <div className="group-body">{renderExpanded(item)}</div>}
          </section>
        )
      })}
      {items.length > 1 && (
        <p className="option-help">Drag files to change their order.</p>
      )}
    </div>
  )
}
