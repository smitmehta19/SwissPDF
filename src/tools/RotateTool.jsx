import { useEffect, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import FileGroups from '../components/FileGroups.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import PagePreview from '../components/PagePreview.jsx'
import { usePdfFiles, baseName } from '../components/usePdfFiles.js'
import { rotatePdf } from '../lib/pdfOps.js'
import { parseRangeSpec, formatPages } from '../lib/pageRanges.js'
import { deliverOutputs } from '../lib/deliver.js'

export default function RotateTool() {
  const { items, validItems, addFiles, reorder, remove } = usePdfFiles()
  const [angle, setAngle] = useState(90)
  const [scope, setScope] = useState('all') // 'all' | 'ranges'
  const [rangeSpec, setRangeSpec] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const [showAfter, setShowAfter] = useState(true)
  const inspector = useInspector()

  useEffect(() => {
    if (!inspector.target && validItems.length > 0) inspector.inspect(validItems[0], 1)
  }, [validItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Which pages the current settings will rotate, per file (null = parse error).
  const targetsFor = (item) => {
    if (scope === 'all') return new Set(Array.from({ length: item.pageCount }, (_, i) => i + 1))
    if (!rangeSpec.trim()) return new Set()
    try {
      return new Set(parseRangeSpec(rangeSpec, item.pageCount).pages)
    } catch {
      return null
    }
  }

  // Ticking/unticking a page checkbox picks pages directly: it switches to
  // "Only pages" mode and keeps the range box in sync.
  const maxPages = Math.max(0, ...validItems.map((it) => it.pageCount))
  const togglePage = (pageNum) => {
    let current
    if (scope === 'all') {
      current = new Set(Array.from({ length: maxPages }, (_, i) => i + 1))
    } else {
      try {
        current = rangeSpec.trim() ? new Set(parseRangeSpec(rangeSpec, maxPages).pages) : new Set()
      } catch {
        current = new Set()
      }
    }
    if (current.has(pageNum)) current.delete(pageNum)
    else current.add(pageNum)
    setScope('ranges')
    setRangeSpec(formatPages([...current]))
  }

  const rotate = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const outputs = []
      for (const item of validItems) {
        const pages = scope === 'all' ? null : parseRangeSpec(rangeSpec, item.pageCount).pages
        const bytes = await rotatePdf(item.bytes, angle, pages)
        outputs.push({ name: `${baseName(item.file.name)}-rotated.pdf`, bytes })
      }
      setStatus({ kind: 'ok', text: await deliverOutputs(outputs, 'swisspdf-rotated.zip') })
    } catch (err) {
      setStatus({ kind: 'error', text: `Rotate failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />

      {items.length > 0 && (
        <div className="options-panel">
          <div className="option-row">
            <span>Rotate by</span>
            {[90, 180, 270].map((a) => (
              <label key={a} className="option-inline">
                <input type="radio" name="angle" checked={angle === a} onChange={() => setAngle(a)} />
                <span>
                  {a}° {a === 90 ? '(clockwise)' : a === 270 ? '(counter-clockwise)' : ''}
                </span>
              </label>
            ))}
          </div>
          <div className="option-row">
            <label className="option-inline">
              <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} />
              <span>All pages</span>
            </label>
            <label className="option-inline">
              <input
                type="radio"
                name="scope"
                checked={scope === 'ranges'}
                onChange={() => setScope('ranges')}
              />
              <span>Only pages:</span>
            </label>
            <input
              className="text-input text-input-small"
              data-testid="range-input"
              placeholder='e.g. "2, 4-6"'
              value={rangeSpec}
              disabled={scope !== 'ranges'}
              onChange={(e) => setRangeSpec(e.target.value)}
            />
            <button
              className="toggle-btn"
              data-testid="before-after-toggle"
              onClick={() => setShowAfter((v) => !v)}
            >
              {showAfter ? 'Show before' : 'Show after'}
            </button>
          </div>
        </div>
      )}

      <div className="workspace">
        <div className="workspace-main">
          <FileGroups
            items={items}
            onReorder={reorder}
            onRemove={remove}
            onInspectFile={(item) => inspector.inspect(item, 1)}
            cardMeta={(item) => {
              const targets = targetsFor(item)
              if (targets === null) return 'fix the page ranges'
              if (targets.size === 0) return null
              return `${targets.size === item.pageCount ? 'all' : targets.size} page${targets.size === 1 ? '' : 's'} will rotate ${angle}°`
            }}
            renderExpanded={(item) => {
              const targets = targetsFor(item)
              return targets === null ? (
                <p className="option-help">Fix the page ranges above to see the preview.</p>
              ) : (
                <PagePreview
                  fileId={item.id}
                  bytes={item.bytes}
                  pageCount={item.pageCount}
                  onPageClick={(i) => inspector.inspect(item, i + 1)}
                  checkbox={{ checked: (i) => targets.has(i + 1), onToggle: (i) => togglePage(i + 1) }}
                  rotation={(i) => (showAfter && targets.has(i + 1) ? angle : 0)}
                  pageClass={(i) => (showAfter && targets.has(i + 1) ? 'preview-rotating' : '')}
                  badge={(i) => (showAfter && targets.has(i + 1) ? `+${angle}°` : null)}
                />
              )
            }}
          />

          {items.length > 0 && (
            <div className="action-bar">
              <button
                className="primary-btn"
                data-testid="rotate-btn"
                onClick={rotate}
                disabled={busy || validItems.length === 0 || (scope === 'ranges' && !rangeSpec.trim())}
              >
                {busy ? 'Rotating…' : `Rotate ${validItems.length} PDF${validItems.length === 1 ? '' : 's'}`}
              </button>
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
