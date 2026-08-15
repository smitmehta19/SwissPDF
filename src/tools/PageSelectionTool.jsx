import { useEffect, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import FileGroups from '../components/FileGroups.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import PagePreview from '../components/PagePreview.jsx'
import { usePdfFiles, baseName } from '../components/usePdfFiles.js'
import { parseRangeSpec, formatPages } from '../lib/pageRanges.js'
import { deliverOutputs } from '../lib/deliver.js'

// Shared UI for tools that act on a page selection (Extract, Remove).
// operate(bytes, pages) -> output bytes; the selection is applied per file.
// Pages can be picked by typing ranges OR by clicking thumbnails — kept in sync.
// selectionEffect: 'keep' (Extract) or 'drop' (Remove) controls the preview styling.
export default function PageSelectionTool({
  verb,
  verbBusy,
  suffix,
  placeholder,
  operate,
  testId,
  selectionEffect,
}) {
  const { items, validItems, addFiles, reorder, remove } = usePdfFiles()
  const [rangeSpec, setRangeSpec] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const inspector = useInspector()

  useEffect(() => {
    if (!inspector.target && validItems.length > 0) inspector.inspect(validItems[0], 1)
  }, [validItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const maxPages = Math.max(0, ...validItems.map((it) => it.pageCount))

  // Selection parsed against the largest file; per-file validity checked on run.
  let selected = new Set()
  let parseError = null
  if (rangeSpec.trim() && maxPages > 0) {
    try {
      selected = new Set(parseRangeSpec(rangeSpec, maxPages).pages)
    } catch (err) {
      parseError = err.message
    }
  }

  const togglePage = (pageNum) => {
    const next = new Set(parseError ? [] : selected)
    if (next.has(pageNum)) next.delete(pageNum)
    else next.add(pageNum)
    setRangeSpec(formatPages([...next]))
  }

  const run = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const outputs = []
      for (const item of validItems) {
        const { pages } = parseRangeSpec(rangeSpec, item.pageCount)
        const bytes = await operate(item.bytes, pages)
        outputs.push({ name: `${baseName(item.file.name)}-${suffix}.pdf`, bytes })
      }
      setStatus({ kind: 'ok', text: await deliverOutputs(outputs, `swisspdf-${suffix}.zip`) })
    } catch (err) {
      setStatus({ kind: 'error', text: `${verb} failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  // Preview styling: which pages will SURVIVE into the output.
  const survives = (pageNum) =>
    selectionEffect === 'keep' ? selected.has(pageNum) : !selected.has(pageNum)

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />

      {items.length > 0 && (
        <div className="options-panel">
          <input
            className="text-input"
            data-testid="range-input"
            placeholder={placeholder}
            value={rangeSpec}
            onChange={(e) => setRangeSpec(e.target.value)}
          />
          <p className="option-help">
            Type ranges ("3", "1-5", "4-", comma-separated) or expand a file below and tick the
            checkbox on each page. Clicking a page previews it on the right.{' '}
            {selectionEffect === 'keep' ? 'Bright pages are kept.' : 'Crossed-out pages are removed.'}{' '}
            Applied to every file.
          </p>
          {parseError && <p className="status status-error">{parseError}</p>}
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
              if (selected.size === 0 || parseError) return null
              const inFile = [...selected].filter((n) => n <= item.pageCount).length
              const surviving = selectionEffect === 'keep' ? inFile : item.pageCount - inFile
              return `${surviving} of ${item.pageCount} pages will remain`
            }}
            renderExpanded={(item) => (
              <PagePreview
                fileId={item.id}
                bytes={item.bytes}
                pageCount={item.pageCount}
                onPageClick={(i) => inspector.inspect(item, i + 1)}
                checkbox={{ checked: (i) => selected.has(i + 1), onToggle: (i) => togglePage(i + 1) }}
                pageClass={(i) =>
                  selected.size === 0
                    ? ''
                    : survives(i + 1)
                      ? 'preview-survives'
                      : 'preview-dropped'
                }
                badge={(i) =>
                  selected.size === 0
                    ? null
                    : selected.has(i + 1)
                      ? selectionEffect === 'keep'
                        ? 'keep'
                        : 'remove'
                      : null
                }
              />
            )}
          />

          {items.length > 0 && (
            <div className="action-bar">
              <button
                className="primary-btn"
                data-testid={testId}
                onClick={run}
                disabled={busy || validItems.length === 0 || !rangeSpec.trim() || !!parseError}
              >
                {busy
                  ? verbBusy
                  : `${verb} in ${validItems.length} PDF${validItems.length === 1 ? '' : 's'}`}
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
