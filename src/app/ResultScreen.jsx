// Shown after a run: a real preview of the first output, what was made, and
// the next steps. Outputs already sit in the workspace as new versions, so
// "Continue with another tool" just picks a tool; nothing is re-added.
import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { downloadBytes, formatBytes } from '../lib/download.js'
import { saveZip } from '../lib/deliver.js'
import { renderPageImage } from '../lib/pdfText.js'
import { getBytes, getRecord, isPdfRecord } from './fileStore.js'
import { OtherCover, typeLabel } from './FileGrid.jsx'

// "3 pages, 1.2 MB" for a PDF, "PNG, 240 KB" for anything else.
const figures = (o) =>
  isPdfRecord(getRecord(o.id))
    ? `${o.pageCount} page${o.pageCount === 1 ? '' : 's'}, ${formatBytes(o.size)}`
    : `${typeLabel(o.name)}, ${formatBytes(o.size)}`

const sizeChange = (before, after) => {
  if (!before) return null
  if (after >= before) return 'same size as before'
  return `${Math.round((1 - after / before) * 100)}% smaller than ${formatBytes(before)}`
}

export default function ResultScreen({ tool, result, nextTools, onOpenTool, onBack, onUndo, onStartOver }) {
  const outputs = result.outputs.filter((o) => getRecord(o.id))
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const headRef = useRef(null)
  const first = outputs[0]
  const firstRec = first ? getRecord(first.id) : null
  const firstPdf = isPdfRecord(firstRec)

  useEffect(() => {
    headRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!first || !firstPdf) return undefined
    let active = true
    getBytes(first.id)
      .then((b) => renderPageImage(b, 1, 520))
      .then((url) => active && setPreview(url), () => {})
    return () => {
      active = false
    }
  }, [first?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // one file straight from its stored Blob, no copy in memory
  const downloadOne = (o) => {
    const rec = getRecord(o.id)
    if (!rec?.blob) throw new Error('This file is no longer in your files.')
    downloadBytes(rec.blob, o.name, rec.type || 'application/pdf')
  }

  const download = async () => {
    setBusy(true)
    setError(null)
    try {
      if (outputs.length === 1) {
        downloadOne(first)
      } else {
        // streamed: each entry is read from its stored Blob when the zip gets to it
        const entries = outputs.map((o) => ({ name: o.name, bytes: () => getRecord(o.id)?.blob ?? getBytes(o.id) }))
        await saveZip(entries, `swisspdf-${tool.id}.zip`, { size: outputs.reduce((n, o) => n + (o.size ?? 0), 0) })
      }
    } catch (err) {
      setError(`Download failed: ${err?.message || err}. Check the free disk space and try again.`)
    } finally {
      setBusy(false)
    }
  }

  const totalPages = outputs.reduce((n, o) => n + (o.pageCount ?? 0), 0)
  const allPdf = outputs.every((o) => isPdfRecord(getRecord(o.id)))
  const summary =
    outputs.length === 1
      ? `${first?.name}: ${figures(first)}`
      : allPdf
        ? `${outputs.length} PDFs, ${totalPages} pages in total`
        : `${outputs.length} files, ${formatBytes(outputs.reduce((n, o) => n + o.size, 0))} in total`

  if (!first) {
    return (
      <section className="result" data-testid="result-screen">
        <h2 className="result-title" ref={headRef} tabIndex={-1}>
          The result was undone
        </h2>
        <button type="button" className="btn btn-quiet" onClick={onBack}>
          Back to files
        </button>
      </section>
    )
  }

  return (
    <section className="result" aria-labelledby="result-title" data-testid="result-screen">
      <div className="result-preview">
        {!firstPdf ? (
          <OtherCover file={firstRec} className="result-other" showText />
        ) : preview ? (
          <img src={preview} alt={`First page of ${first.name}`} />
        ) : (
          <span className="fc-blank is-loading">PDF</span>
        )}
      </div>
      <div className="result-body">
        <h2 id="result-title" className="result-title" ref={headRef} tabIndex={-1}>
          {tool.name} done
        </h2>
        <p className="result-summary" data-testid="status">
          {summary}
        </p>
        {outputs.length > 1 && (
          <p className="result-count" id="result-count">
            {outputs.length > 4 ? `Showing ${outputs.length} files. Scroll the list for more.` : `${outputs.length} files`}
          </p>
        )}
        <ul className={`result-list ${outputs.length > 4 ? 'is-long' : ''}`} tabIndex={outputs.length > 4 ? 0 : undefined} aria-label="Output files" data-testid="result-list">
          {outputs.map((o) => (
            <li key={o.id}>
              <span className="result-item-text">
                <span className="file-name" title={o.name}>
                  {o.name}
                </span>
                <span className="mono result-figures">
                  {figures(o)}
                  {o.before ? `, ${sizeChange(o.before, o.size)}` : ''}
                </span>
                {o.note && <span className="result-note">{o.note}</span>}
              </span>
              {outputs.length > 1 && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Download ${o.name}`}
                  title="Download this file"
                  onClick={() => {
                    try {
                      setError(null)
                      downloadOne(o)
                    } catch (err) {
                      setError(`Download failed: ${err.message}`)
                    }
                  }}
                >
                  <Icon name="download" size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {error && (
          <p className="field-error" role="alert" data-testid="download-error">
            {error}
          </p>
        )}
        <div className="result-actions">
          <button type="button" className="btn btn-primary btn-large" onClick={download} disabled={busy} data-testid="result-download">
            <Icon name="download" size={18} />
            {outputs.length === 1 ? 'Download' : 'Download all as ZIP'}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onUndo} data-testid="result-undo">
            <Icon name="undo" size={16} />
            Undo
          </button>
          <button type="button" className="btn btn-quiet" onClick={onBack} data-testid="result-back">
            Back to files
          </button>
        </div>
        <div className="result-next">
          <h3 className="result-next-title">Continue with another tool</h3>
          <p className="field-help">The result stays in your files, selected and ready.</p>
          <div className="chip-row">
            {nextTools.map((t) => (
              <button key={t.id} type="button" className="chip" onClick={() => onOpenTool(t.id)} data-testid={`next-${t.id}`}>
                <Icon name={t.icon} size={15} />
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="link link-danger result-over" onClick={onStartOver} data-testid="result-start-over">
          Remove all files and start over
        </button>
      </div>
    </section>
  )
}
