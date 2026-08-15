import { useEffect, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import FileGroups from '../components/FileGroups.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import PagePreview from '../components/PagePreview.jsx'
import { usePdfFiles, baseName } from '../components/usePdfFiles.js'
import { renderPageToImage } from '../lib/pdfText.js'
import { parseRangeSpec, formatPages } from '../lib/pageRanges.js'
import { deliverOutputs } from '../lib/deliver.js'

const RESOLUTIONS = [
  [1000, 'Normal (1000px wide)'],
  [1600, 'High (1600px)'],
  [2400, 'Ultra (2400px)'],
]

export default function PdfToImageTool() {
  const { items, validItems, addFiles, reorder, remove } = usePdfFiles()
  const [format, setFormat] = useState('image/jpeg') // 'image/jpeg' | 'image/png'
  const [width, setWidth] = useState(1600)
  const [rangeSpec, setRangeSpec] = useState('') // empty = every page
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [status, setStatus] = useState(null)
  const inspector = useInspector()

  useEffect(() => {
    if (!inspector.target && validItems.length > 0) inspector.inspect(validItems[0], 1)
  }, [validItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const maxPages = Math.max(0, ...validItems.map((it) => it.pageCount))

  // Empty spec = all pages. Checkboxes keep the range box in sync.
  const selectedFor = (pageCount) => {
    if (!rangeSpec.trim()) return new Set(Array.from({ length: pageCount }, (_, i) => i + 1))
    try {
      return new Set(parseRangeSpec(rangeSpec, pageCount).pages.filter((n) => n <= pageCount))
    } catch {
      return null
    }
  }

  const togglePage = (pageNum) => {
    let current = selectedFor(maxPages)
    if (current === null) current = new Set()
    if (current.has(pageNum)) current.delete(pageNum)
    else current.add(pageNum)
    setRangeSpec(
      current.size === maxPages && maxPages > 0 ? '' : formatPages([...current]),
    )
  }

  const ext = format === 'image/png' ? 'png' : 'jpg'

  const convert = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const outputs = []
      for (const item of validItems) {
        const pages = rangeSpec.trim()
          ? parseRangeSpec(rangeSpec, item.pageCount).pages
          : Array.from({ length: item.pageCount }, (_, i) => i + 1)
        const base = baseName(item.file.name)
        for (const n of pages) {
          setProgress(`${item.file.name} — page ${n}`)
          const img = await renderPageToImage(item.bytes, n, { width, format, quality: 0.9 })
          outputs.push({ name: `${base}-page${n}.${ext}`, bytes: img.bytes, mime: format })
        }
      }
      setStatus({
        kind: 'ok',
        text: await deliverOutputs(outputs, 'swisspdf-images.zip', { kind: 'binary' }),
      })
    } catch (err) {
      setStatus({ kind: 'error', text: `Convert failed: ${err.message}` })
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const totalSelected = validItems.reduce((sum, it) => {
    const s = selectedFor(it.pageCount)
    return sum + (s ? s.size : 0)
  }, 0)

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />

      {items.length > 0 && (
        <div className="options-panel">
          <div className="option-row">
            <span>Format</span>
            <label className="option-inline">
              <input type="radio" name="img-format" checked={format === 'image/jpeg'} onChange={() => setFormat('image/jpeg')} />
              <span>JPG</span>
            </label>
            <label className="option-inline">
              <input type="radio" name="img-format" checked={format === 'image/png'} onChange={() => setFormat('image/png')} />
              <span>PNG</span>
            </label>
            <span>· Quality</span>
            {RESOLUTIONS.map(([w, label]) => (
              <label key={w} className="option-inline">
                <input type="radio" name="img-width" checked={width === w} onChange={() => setWidth(w)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="option-row">
            <span>Pages</span>
            <input
              className="text-input"
              style={{ flex: 1 }}
              data-testid="range-input"
              placeholder="All pages — or type ranges / untick pages below"
              value={rangeSpec}
              onChange={(e) => setRangeSpec(e.target.value)}
            />
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
              const s = selectedFor(item.pageCount)
              if (s === null) return 'fix the page ranges'
              return `${s.size} page${s.size === 1 ? '' : 's'} → ${s.size} ${ext.toUpperCase()} image${s.size === 1 ? '' : 's'}`
            }}
            renderExpanded={(item) => {
              const s = selectedFor(item.pageCount)
              return s === null ? (
                <p className="option-help">Fix the page ranges above to see the selection.</p>
              ) : (
                <PagePreview
                  fileId={item.id}
                  bytes={item.bytes}
                  pageCount={item.pageCount}
                  onPageClick={(i) => inspector.inspect(item, i + 1)}
                  checkbox={{ checked: (i) => s.has(i + 1), onToggle: (i) => togglePage(i + 1) }}
                  pageClass={(i) => (s.has(i + 1) ? '' : 'preview-dropped')}
                  badge={(i) => (s.has(i + 1) ? ext.toUpperCase() : null)}
                />
              )
            }}
          />

          {items.length > 0 && (
            <div className="action-bar">
              <button
                className="primary-btn"
                data-testid="pdf2img-btn"
                onClick={convert}
                disabled={busy || validItems.length === 0 || totalSelected === 0}
              >
                {busy
                  ? `Converting… ${progress}`
                  : `Convert ${totalSelected} page${totalSelected === 1 ? '' : 's'} to ${ext.toUpperCase()}`}
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
