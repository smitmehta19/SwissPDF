// Shown after a run: a review card with a real preview of the first output,
// size before and after, pages and time taken, then Download, Undo and the
// next steps. Outputs already sit in the workspace as new versions, so a
// suggested tool just opens; nothing is re-added.
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

export function formatTime(ms) {
  if (ms == null) return null
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)} min ${s % 60} s`
}

export default function ResultScreen({ tool, result, nextTools, onOpenTool, onBack, onUndo, onStartOver }) {
  const outputs = result.outputs.filter((o) => getRecord(o.id))
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [error, setError] = useState(null)
  const headRef = useRef(null)
  const first = outputs[0]
  const firstRec = first ? getRecord(first.id) : null
  const firstPdf = isPdfRecord(firstRec)
  // made from an unlocked file: kept in memory only, gone after a reload
  const sessionOnly = outputs.some((o) => getRecord(o.id)?.memoryOnly)
  // a password-protected output (Protect) cannot be rendered
  const firstLocked = firstRec?.status === 'locked'
  // tools with a result view (compare, health) get it below the result
  const View = tool.Result && result.view ? tool.Result : null
  const stats = result.stats ?? {}

  useEffect(() => {
    headRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!first || !firstPdf || firstLocked) return undefined
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

  const undo = async () => {
    if (undoing) return
    setUndoing(true)
    try {
      await onUndo()
    } finally {
      setUndoing(false)
    }
  }

  const totalPages = outputs.reduce((n, o) => n + (o.pageCount ?? 0), 0)
  const totalSize = outputs.reduce((n, o) => n + (o.size ?? 0), 0)
  const allPdf = outputs.every((o) => isPdfRecord(getRecord(o.id)))
  const summary =
    outputs.length === 1
      ? `${first?.name}: ${figures(first)}`
      : allPdf
        ? `${outputs.length} PDFs, ${totalPages} pages in total`
        : `${outputs.length} files, ${formatBytes(totalSize)} in total`
  // one output from one input carries its own "before" (compress); else the inputs
  // a conversion (DOCX to PDF, images to PDF) has no fair "smaller": output size only
  const conversion = tool.category === 'Convert'
  const before = conversion ? null : outputs.length === 1 && first?.before ? first.before : stats.beforeSize
  // "% smaller" only where it means something: PDFs in, as many or fewer PDFs out
  // (not for reports or files made next to the input: Compare, Info, Split parts)
  const consumedCount = result.change.consumedIds.length
  const sizeCompares = allPdf && consumedCount > 0 && outputs.length <= consumedCount
  const smaller = sizeCompares && before && totalSize < before ? Math.round((1 - totalSize / before) * 100) : null
  // which files this run replaced in the workspace (they are older versions now)
  const replaced = result.change.consumedIds.map((id) => getRecord(id)?.name).filter(Boolean)

  // a result view and no files at all (health)
  if (!first && View && result.change.outputIds.length === 0) {
    return (
      <section className="result result-viewonly" aria-labelledby="result-title" data-testid="result-screen">
        <div className="result-body">
          <h2 id="result-title" className="result-title" ref={headRef} tabIndex={-1}>
            {tool.name} done
          </h2>
          <View view={result.view} />
          <div className="result-actions">
            <button type="button" className="btn btn-quiet" onClick={onBack} data-testid="result-back">
              Back
            </button>
          </div>
          <p className="result-local">
            <Icon name="shield" size={15} />
            Done on this device. Nothing was uploaded.
          </p>
        </div>
      </section>
    )
  }

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
        ) : firstLocked ? (
          <span className="fc-blank" aria-label="Password protected">
            <Icon name="lock" size={28} />
          </span>
        ) : preview ? (
          <img src={preview} alt={`First page of ${first.name}`} />
        ) : (
          <span className="fc-blank is-loading">PDF</span>
        )}
        {firstRec?.version > 1 && <span className="fc-version mono result-version">v{firstRec.version}</span>}
      </div>
      <div className="result-body">
        <h2 id="result-title" className="result-title" ref={headRef} tabIndex={-1}>
          {tool.name} done
        </h2>
        <p className="result-summary" data-testid="status">
          {summary}
        </p>
        {replaced.length > 0 && (
          <p className="result-replaced" data-testid="result-replaced">
            Replaced {replaced.length === 1 ? replaced[0] : `${replaced.length} files`} with {outputs.length === 1 ? first.name : `${outputs.length} files`}. Undo brings {replaced.length === 1 ? 'it' : 'them'} back.
          </p>
        )}
        <dl className="review-facts" data-testid="review-facts">
          <div>
            <dt>Size</dt>
            <dd className="mono" data-testid="review-size">
              {before && sizeCompares ? (
                <>
                  {formatBytes(before)} to {formatBytes(totalSize)}
                  {smaller ? <span className="review-gain"> {smaller}% smaller</span> : null}
                </>
              ) : (
                formatBytes(totalSize)
              )}
            </dd>
          </div>
          {allPdf && (
            <div>
              <dt>Pages</dt>
              <dd className="mono" data-testid="review-pages">
                {totalPages}
              </dd>
            </div>
          )}
          {stats.ms != null && (
            <div>
              <dt>Time</dt>
              <dd className="mono" data-testid="review-time">
                {formatTime(stats.ms)}
              </dd>
            </div>
          )}
        </dl>
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
          <button type="button" className="btn btn-quiet" onClick={undo} disabled={undoing} data-testid="result-undo">
            <Icon name="undo" size={16} />
            Undo
          </button>
          <button type="button" className="btn btn-quiet" onClick={onBack} data-testid="result-back">
            Back to files
          </button>
        </div>
        {firstLocked && (
          <p className="notice notice-ok result-locked-note" data-testid="result-locked-note">
            Locked with your password. Download gives you the locked file. To keep editing it, unlock it first.
          </p>
        )}
        {sessionOnly && (
          <p className="notice result-session-note" role="status" data-testid="result-session-note">
            Made from an unlocked file, so it is kept for this session only. Download it before you reload or close this tab.
          </p>
        )}
        <p className="result-local" data-testid="result-local">
          <Icon name="shield" size={15} />
          Done on this device. Nothing was uploaded.
        </p>
        {nextTools.length > 0 && (
          <div className="result-next">
            <h3 className="result-next-title">Edit your new file{outputs.length === 1 ? '' : 's'}</h3>
            <p className="field-help">{sessionOnly ? 'The result is in your files for this session and selected for the next tool.' : 'The result is in your files and selected for the next tool.'}</p>
            <div className="next-grid" data-testid="next-tools">
              {nextTools.map((t) => (
                <button key={t.id} type="button" className="next-card" onClick={() => onOpenTool(t.id)} data-testid={`next-${t.id}`}>
                  <span className="next-icon">
                    <Icon name={t.icon} size={18} />
                  </span>
                  <span className="next-name">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <button type="button" className="link link-danger result-over" onClick={onStartOver} data-testid="result-start-over">
          Remove all files and start over
        </button>
      </div>
      {View && (
        <div className="result-view">
          <View view={result.view} />
        </div>
      )}
    </section>
  )
}
