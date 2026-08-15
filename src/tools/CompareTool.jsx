import { useEffect, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import { loadPdf } from '../lib/pdfOps.js'
import { renderPageImage } from '../lib/pdfText.js'

// Side-by-side comparison with word-level highlighting.
export default function CompareTool() {
  const [docs, setDocs] = useState({ a: null, b: null })
  const [result, setResult] = useState(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [images, setImages] = useState({ a: null, b: null })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)

  const load = async (slot, [file]) => {
    setStatus(null)
    setResult(null)
    try {
      const bytes = await file.arrayBuffer()
      const doc = await loadPdf(bytes)
      setDocs((prev) => ({ ...prev, [slot]: { name: file.name, bytes, pageCount: doc.getPageCount() } }))
    } catch (err) {
      setStatus({ kind: 'error', text: `${file.name}: ${err.message}` })
    }
  }

  const compare = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { comparePdfs } = await import('../lib/compareOps.js')
      const res = await comparePdfs(docs.a.bytes, docs.b.bytes, (m) => setStatus({ kind: 'ok', text: m }))
      setResult(res)
      setPageIdx(0)
      setStatus({
        kind: res.identical ? 'ok' : 'error',
        text: res.identical
          ? 'The documents are identical — no text differences found.'
          : `${res.added} word${res.added === 1 ? '' : 's'} added, ${res.removed} word${res.removed === 1 ? '' : 's'} removed across ${res.pages.length} page${res.pages.length === 1 ? '' : 's'}.`,
      })
    } catch (err) {
      setStatus({ kind: 'error', text: `Compare failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  // Render the current page pair for the visual view.
  useEffect(() => {
    let active = true
    if (!result || !docs.a || !docs.b) return undefined
    setImages({ a: null, b: null })
    const load = async () => {
      const page = result.pages[pageIdx]
      const a = page.sizeA ? await renderPageImage(docs.a.bytes, pageIdx + 1, 700) : null
      const b = page.sizeB ? await renderPageImage(docs.b.bytes, pageIdx + 1, 700) : null
      if (active) setImages({ a, b })
    }
    load()
    return () => {
      active = false
    }
  }, [result, pageIdx, docs.a, docs.b])

  const page = result?.pages[pageIdx]

  const overlay = (boxes, size, kind) =>
    boxes.map((box, i) => (
      <span
        key={i}
        className={`diff-box diff-${kind}`}
        style={{
          left: `${(box.x / size.w) * 100}%`,
          top: `${((size.h - box.y - box.h) / size.h) * 100}%`,
          width: `${(box.w / size.w) * 100}%`,
          height: `${(box.h / size.h) * 100}%`,
        }}
        title={box.text}
      />
    ))

  return (
    <div className="tool-body">
      <div className="compare-inputs">
        <div>
          <h4 className="preview-file-heading">Original {docs.a ? `— ${docs.a.name}` : ''}</h4>
          <FileDropZone onFiles={(f) => load('a', f)} accept={['.pdf']} multiple={false} />
        </div>
        <div>
          <h4 className="preview-file-heading">Changed version {docs.b ? `— ${docs.b.name}` : ''}</h4>
          <FileDropZone onFiles={(f) => load('b', f)} accept={['.pdf']} multiple={false} />
        </div>
      </div>

      <div className="action-bar">
        <button className="primary-btn" data-testid="compare-btn" onClick={compare} disabled={busy || !docs.a || !docs.b}>
          {busy ? 'Comparing…' : 'Compare documents'}
        </button>
        {(!docs.a || !docs.b) && <span className="action-hint">Drop both versions to compare.</span>}
      </div>

      {status && (
        <p className={`status status-${status.kind}`} data-testid="status">
          {status.text}
        </p>
      )}

      {result && page && (
        <>
          <div className="option-row" style={{ marginTop: 12 }}>
            <button className="toggle-btn" onClick={() => setPageIdx((i) => Math.max(0, i - 1))} disabled={pageIdx === 0}>
              ← Prev
            </button>
            <span className="option-help" data-testid="compare-page-label">
              Page {pageIdx + 1} of {result.pages.length} — {page.added} added, {page.removed} removed
              {page.onlyInA ? ' (missing from the changed version)' : ''}
              {page.onlyInB ? ' (new page)' : ''}
            </span>
            <button
              className="toggle-btn"
              onClick={() => setPageIdx((i) => Math.min(result.pages.length - 1, i + 1))}
              disabled={pageIdx >= result.pages.length - 1}
            >
              Next →
            </button>
          </div>

          <div className="compare-view">
            <div className="compare-side">
              <div className="compare-label">Original — <span className="diff-legend diff-removed" /> removed</div>
              {images.a ? (
                <div className="compare-stage">
                  <img src={images.a} alt="original page" />
                  {page.sizeA && overlay(page.removedBoxes, page.sizeA, 'removed')}
                </div>
              ) : (
                <p className="preview-loading">{page.sizeA ? 'Rendering…' : 'No such page'}</p>
              )}
            </div>
            <div className="compare-side">
              <div className="compare-label">Changed — <span className="diff-legend diff-added" /> added</div>
              {images.b ? (
                <div className="compare-stage">
                  <img src={images.b} alt="changed page" />
                  {page.sizeB && overlay(page.addedBoxes, page.sizeB, 'added')}
                </div>
              ) : (
                <p className="preview-loading">{page.sizeB ? 'Rendering…' : 'No such page'}</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
