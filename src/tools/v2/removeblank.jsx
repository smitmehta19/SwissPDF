import { useState } from 'react'
import { Field } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { formatPages } from '../../lib/pageRanges.js'
import { plural } from './layoutShared.jsx'

// Scan results are only valid for the settings they were made with.
const keyOf = (o) => `${o.threshold}|${o.whitePercent}`
const scanOf = (o, f) => (o.found?.[f.id]?.key === keyOf(o) ? o.found[f.id] : null)
// Detected pages the user did not untick.
const removeOf = (o, f) => (scanOf(o, f)?.pages ?? []).filter((p) => !o.keep?.[`${f.id}|${p.page}`]).map((p) => p.page)

function Options({ options: o, setOptions, files }) {
  const set = (fields) => setOptions((prev) => ({ ...prev, ...fields }))
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const scan = async () => {
    setError(null)
    try {
      const { findBlankPages } = await import('../../lib/layoutOps.js')
      const found = {}
      for (const f of files) {
        const pages = await findBlankPages(f.bytes, {
          threshold: o.threshold,
          whitePercent: o.whitePercent,
          onPage: (n, total) => setBusy(`${f.name}: page ${n} of ${total}`),
        })
        found[f.id] = { key: keyOf(o), pages }
      }
      setOptions((prev) => ({ ...prev, found: { ...prev.found, ...found }, keep: {} }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }
  const scanned = files.filter((f) => scanOf(o, f))
  return (
    <>
      <Field label={`Ink threshold ${o.threshold}`} help="How much darker than the paper a mark must be to count as ink (0-255). The paper tone of scans is measured per page. Lower it to keep pages with very faint marks.">
        {(id) => <input id={id} type="range" data-testid="blank-threshold" min="5" max="120" value={o.threshold} onChange={(e) => set({ threshold: Number(e.target.value) })} />}
      </Field>
      <Field label={`Clean area ${o.whitePercent}%`} help="A page counts as blank when at least this share of it is free of ink. Pages with any text, and dark covers, are never blank.">
        {(id) => <input id={id} type="range" data-testid="blank-white" min="95" max="100" step="0.1" value={o.whitePercent} onChange={(e) => set({ whitePercent: Number(e.target.value) })} />}
      </Field>
      <Field label="Removed pages">
        {(id) => (
          <label className="check-line">
            <input id={id} type="checkbox" data-testid="blank-save-removed" checked={!!o.saveRemoved} onChange={(e) => set({ saveRemoved: e.target.checked })} />
            Also save them as a separate PDF
          </label>
        )}
      </Field>
      <div className="btn-row">
        <button type="button" className="btn btn-small" data-testid="blank-scan" disabled={!!busy || files.length === 0} onClick={scan}>
          {scanned.length === files.length && files.length > 0 ? 'Scan again' : 'Find blank pages'}
        </button>
      </div>
      {busy && (
        <p className="field-help" role="status">
          Checking {busy}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {scanned.length > 0 && (
        <div className="field">
          <span className="field-label">Blank pages found</span>
          <ul className="pick-rows" data-testid="blank-found">
            {scanned.map((f) => {
              const pages = scanOf(o, f).pages
              return (
                <li key={f.id} className="pick-row" style={{ flexWrap: 'wrap' }}>
                  <span className="file-name" title={f.name}>
                    {f.name}
                  </span>
                  {pages.length === 0 ? (
                    <span className="field-help">none</span>
                  ) : (
                    pages.map((p) => {
                      const k = `${f.id}|${p.page}`
                      return (
                        <label key={k} className="check-line" title={`${p.white}% white`}>
                          <input type="checkbox" checked={!o.keep?.[k]} onChange={(e) => set({ keep: { ...o.keep, [k]: !e.target.checked } })} />
                          <span className="mono">p. {p.page}</span>
                        </label>
                      )
                    })
                  )}
                </li>
              )
            })}
          </ul>
          <p className="field-help">Untick a page to keep it.</p>
        </div>
      )}
    </>
  )
}

export default {
  id: 'removeblank',
  name: 'Remove blank pages',
  io: 'PDF → PDF without blanks',
  description: 'Find empty pages, check the list, remove them.',
  category: 'Organize',
  icon: 'blank',
  accepts: { min: 1 },
  defaults: { threshold: 30, whitePercent: 99.9, saveRemoved: false, found: {}, keep: {} },
  next: ['compress', 'ocr', 'merge'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Remove blank pages' }
    const unscanned = files.filter((f) => !scanOf(o, f))
    if (unscanned.length) {
      return { ready: true, line: `Blank pages will be found and removed. Press Find blank pages to check the list first.`, runLabel: 'Remove blank pages' }
    }
    const n = files.reduce((s, f) => s + removeOf(o, f).length, 0)
    if (n === 0) return { ready: false, line: 'No blank pages to remove.', runLabel: 'Remove blank pages' }
    const one = files.length === 1 ? ` (${formatPages(removeOf(o, files[0]))})` : ''
    return { ready: true, line: `${plural(n, 'blank page')}${one} will be removed.`, runLabel: `Remove ${plural(n, 'page')}` }
  },
  async run(files, o, ctx) {
    const { findBlankPages } = await import('../../lib/layoutOps.js')
    const { removePages, extractPages } = await import('../../lib/pdfOps.js')
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Checking ${f.name}`)
      let pages = removeOf(o, f)
      if (!scanOf(o, f)) {
        const found = await findBlankPages(f.bytes, {
          threshold: o.threshold,
          whitePercent: o.whitePercent,
          check: ctx.check,
          onPage: (n, total) => ctx.progress(i, files.length, `${f.name}: page ${n} of ${total}`),
        })
        pages = found.map((p) => p.page)
      }
      if (pages.length === 0) continue
      if (pages.length >= f.pageCount) throw new Error(`Every page of ${f.name} looks blank: nothing would be left.`)
      const bytes = await removePages(f.bytes, pages)
      outputs.push({ name: `${baseName(f.name)}-no-blanks.pdf`, bytes, parentIds: [f.id], note: `Removed ${pages.length === 1 ? 'page' : 'pages'} ${formatPages(pages)}` })
      if (o.saveRemoved) outputs.push({ name: `${baseName(f.name)}-blank-pages.pdf`, bytes: await extractPages(f.bytes, pages), parentIds: [f.id], note: `The removed ${pages.length === 1 ? 'page' : 'pages'}` })
    }
    if (outputs.length === 0) throw new Error('No blank pages found.')
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
