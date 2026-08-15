import { useEffect, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import FileGroups from '../components/FileGroups.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import PagePreview from '../components/PagePreview.jsx'
import { usePdfFiles, baseName } from '../components/usePdfFiles.js'
import { splitByRanges } from '../lib/pdfOps.js'
import { parseRangeSpec, everyNRanges } from '../lib/pageRanges.js'
import { deliverOutputs } from '../lib/deliver.js'

// Live preview data: which output part (0-based) each page belongs to, or null.
function planParts(mode, rangeSpec, everyN, pageCount) {
  try {
    let ranges
    if (mode === 'ranges') {
      if (!rangeSpec.trim()) return { error: 'Type ranges above to see the parts.' }
      ranges = parseRangeSpec(rangeSpec, pageCount).ranges
    } else if (mode === 'every') {
      ranges = everyNRanges(everyN, pageCount)
    } else {
      ranges = everyNRanges(1, pageCount)
    }
    const partOf = Array(pageCount).fill(null)
    ranges.forEach(({ from, to }, part) => {
      for (let n = from; n <= to; n++) partOf[n - 1] = part
    })
    return { partOf, partCount: ranges.length }
  } catch (err) {
    return { error: err.message }
  }
}

export default function SplitTool() {
  const { items, validItems, addFiles, reorder, remove } = usePdfFiles()
  const [mode, setMode] = useState('ranges') // 'ranges' | 'every' | 'single'
  const [rangeSpec, setRangeSpec] = useState('')
  const [everyN, setEveryN] = useState('1')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const inspector = useInspector()

  useEffect(() => {
    if (!inspector.target && validItems.length > 0) inspector.inspect(validItems[0], 1)
  }, [validItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const split = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const outputs = []
      for (const item of validItems) {
        const base = baseName(item.file.name)
        let ranges
        if (mode === 'ranges') {
          ranges = parseRangeSpec(rangeSpec, item.pageCount).ranges
        } else if (mode === 'every') {
          ranges = everyNRanges(everyN, item.pageCount)
        } else {
          ranges = everyNRanges(1, item.pageCount)
        }
        const parts = await splitByRanges(item.bytes, ranges)
        for (const part of parts) {
          const label = part.from === part.to ? `page${part.from}` : `pages${part.from}-${part.to}`
          outputs.push({ name: `${base}-${label}.pdf`, bytes: part.bytes })
        }
      }
      setStatus({ kind: 'ok', text: await deliverOutputs(outputs, 'swisspdf-split.zip') })
    } catch (err) {
      setStatus({ kind: 'error', text: `Split failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />

      {items.length > 0 && (
        <div className="options-panel">
          <label className="option-row">
            <input
              type="radio"
              name="split-mode"
              checked={mode === 'ranges'}
              onChange={() => setMode('ranges')}
            />
            <span>Custom ranges — each range becomes its own PDF</span>
          </label>
          {mode === 'ranges' && (
            <input
              className="text-input"
              data-testid="range-input"
              placeholder='e.g. "1-3, 4-8, 9" (open-ended "5-" runs to the last page)'
              value={rangeSpec}
              onChange={(e) => setRangeSpec(e.target.value)}
            />
          )}
          <label className="option-row">
            <input
              type="radio"
              name="split-mode"
              checked={mode === 'every'}
              onChange={() => setMode('every')}
            />
            <span>Every</span>
            <input
              className="text-input text-input-small"
              data-testid="every-n-input"
              type="number"
              min="1"
              value={everyN}
              disabled={mode !== 'every'}
              onChange={(e) => setEveryN(e.target.value)}
            />
            <span>pages</span>
          </label>
          <label className="option-row">
            <input
              type="radio"
              name="split-mode"
              checked={mode === 'single'}
              onChange={() => setMode('single')}
            />
            <span>Every page as a separate PDF</span>
          </label>
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
              const plan = planParts(mode, rangeSpec, everyN, item.pageCount)
              return plan.error ? null : `will produce ${plan.partCount} file${plan.partCount === 1 ? '' : 's'}`
            }}
            renderExpanded={(item) => {
              const plan = planParts(mode, rangeSpec, everyN, item.pageCount)
              return plan.error ? (
                <p className="option-help">{plan.error}</p>
              ) : (
                <PagePreview
                  fileId={item.id}
                  bytes={item.bytes}
                  pageCount={item.pageCount}
                  onPageClick={(i) => inspector.inspect(item, i + 1)}
                  pageClass={(i) =>
                    plan.partOf[i] === null ? 'preview-excluded' : `preview-part-${plan.partOf[i] % 6}`
                  }
                  badge={(i) =>
                    plan.partOf[i] === null ? 'not included' : `file ${plan.partOf[i] + 1}`
                  }
                />
              )
            }}
          />

          {items.length > 0 && (
            <div className="action-bar">
              <button
                className="primary-btn"
                data-testid="split-btn"
                onClick={split}
                disabled={busy || validItems.length === 0 || (mode === 'ranges' && !rangeSpec.trim())}
              >
                {busy ? 'Splitting…' : `Split ${validItems.length} PDF${validItems.length === 1 ? '' : 's'}`}
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
