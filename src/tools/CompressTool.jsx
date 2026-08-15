import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import FileDropZone from '../components/FileDropZone.jsx'
import FileGroups from '../components/FileGroups.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import PagePreview from '../components/PagePreview.jsx'
import { usePdfFiles, baseName } from '../components/usePdfFiles.js'
import { deliverOutputs } from '../lib/deliver.js'
import { formatBytes } from '../lib/download.js'

const RASTER_PRESETS = [
  [1300, 0.8, 'Good quality'],
  [1000, 0.7, 'Smaller'],
  [800, 0.6, 'Smallest'],
]

export default function CompressTool() {
  const { items, validItems, addFiles, reorder, remove } = usePdfFiles()
  const [mode, setMode] = useState('clean') // 'clean' | 'raster'
  const [preset, setPreset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [status, setStatus] = useState(null)
  const [results, setResults] = useState([]) // { name, before, after, note }
  const inspector = useInspector()

  useEffect(() => {
    if (!inspector.target && validItems.length > 0) inspector.inspect(validItems[0], 1)
  }, [validItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const compress = async () => {
    setBusy(true)
    setStatus(null)
    setResults([])
    try {
      const outputs = []
      const fileResults = []
      for (const item of validItems) {
        const before = item.bytes.byteLength ?? item.bytes.length
        let bytes
        let note = null
        if (mode === 'clean') {
          setProgress(`${item.file.name} — cleaning`)
          const { cleanPdf } = await import('../lib/mupdfOps.js')
          const res = await cleanPdf(item.bytes)
          bytes = res.bytes
          note = res.note
        } else {
          const [width, quality] = RASTER_PRESETS[preset]
          const { renderPageToImage } = await import('../lib/pdfText.js')
          const { imagesToPdf, normalizeImage } = await import('../lib/imageOps.js')
          const images = []
          for (let n = 1; n <= item.pageCount; n++) {
            setProgress(`${item.file.name} — page ${n} of ${item.pageCount}`)
            const img = await renderPageToImage(item.bytes, n, {
              width,
              format: 'image/jpeg',
              quality,
            })
            images.push(await normalizeImage(img.bytes))
          }
          bytes = await imagesToPdf(images, { pageSize: 'fit' })
          if (bytes.length >= before) {
            bytes = new Uint8Array(item.bytes.slice(0))
            note = 'already smaller than the rasterized version — kept the original'
          }
        }
        outputs.push({ name: `${baseName(item.file.name)}-compressed.pdf`, bytes })
        fileResults.push({ name: item.file.name, before, after: bytes.length, note })
      }
      setResults(fileResults)
      setStatus({ kind: 'ok', text: await deliverOutputs(outputs, 'swisspdf-compressed.zip') })
    } catch (err) {
      setStatus({ kind: 'error', text: `Compress failed: ${err.message}` })
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />

      {items.length > 0 && (
        <div className="options-panel">
          <label className="option-row">
            <input type="radio" name="compress-mode" checked={mode === 'clean'} onChange={() => setMode('clean')} />
            <span>
              <strong>Smart clean</strong> — text stays selectable. Best for normal documents.
            </span>
          </label>
          <label className="option-row">
            <input type="radio" name="compress-mode" checked={mode === 'raster'} onChange={() => setMode('raster')} />
            <span>
              <strong>Maximum</strong> — pages become images. Much smaller, text no longer selectable.
            </span>
          </label>
          {mode === 'raster' && (
            <div className="option-row">
              <span>Quality</span>
              {RASTER_PRESETS.map(([w, q, label], i) => (
                <label key={label} className="option-inline">
                  <input type="radio" name="raster-preset" checked={preset === i} onChange={() => setPreset(i)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
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
              const r = results.find((x) => x.name === item.file.name)
              if (r) {
                return r.after < r.before
                  ? `${formatBytes(r.before)} → ${formatBytes(r.after)} · ${Math.round((1 - r.after / r.before) * 100)}% smaller`
                  : `${formatBytes(r.before)} → no gain`
              }
              return formatBytes(item.file.size)
            }}
            renderExpanded={(item) => (
              <PagePreview
                fileId={item.id}
                bytes={item.bytes}
                pageCount={item.pageCount}
                onPageClick={(i) => inspector.inspect(item, i + 1)}
              />
            )}
          />

          {items.length > 0 && (
            <div className="action-bar">
              <button
                className="primary-btn"
                data-testid="compress-btn"
                onClick={compress}
                disabled={busy || validItems.length === 0}
              >
                {busy
                  ? `Compressing… ${progress}`
                  : `Compress ${validItems.length} PDF${validItems.length === 1 ? '' : 's'}`}
              </button>
              {mode === 'clean' && (
                <span className="action-hint">First run downloads the engine (~10 MB, cached).</span>
              )}
            </div>
          )}

          {results.length > 0 && (
            <div className="size-report" data-testid="compress-results">
              {results.map((r) => {
                const pct = r.before > 0 ? Math.max(0, Math.round((1 - r.after / r.before) * 100)) : 0
                return (
                  <div key={r.name} className="size-row">
                    <div className="size-row-head">
                      <span className="size-name" title={r.name}>{r.name}</span>
                      <span className="size-figures">
                        <span className="size-before">{formatBytes(r.before)}</span>
                        <Icon name="back" size={13} className="size-arrow" />
                        <span className="size-after">{formatBytes(r.after)}</span>
                        {r.after < r.before ? (
                          <span className="size-pct">−{pct}%</span>
                        ) : (
                          <span className="size-pct size-pct-flat">no gain</span>
                        )}
                      </span>
                    </div>
                    <div className="size-bar">
                      <span className="size-bar-fill" style={{ width: `${Math.max(2, (r.after / r.before) * 100)}%` }} />
                    </div>
                    {r.note && <p className="size-note">{r.note}</p>}
                  </div>
                )
              })}
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
