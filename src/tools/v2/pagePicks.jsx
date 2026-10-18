// Page picking for Extract and Remove. The picks are the page editor's
// selection (Pages view: click, Shift-click for a range), mirrored into a
// "1,5-8" field here. The tool's options keep a copy (options.picks) so
// summary() and run() see the same pages the user sees.
import { useEffect, useState } from 'react'
import { Field } from '../../app/controls.jsx'
import { formatPages, parseRangeSpec } from '../../lib/pageRanges.js'
import './organize.css'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// fileId -> 1-based source pages in page order, from the editor selection.
export function picksOf(files, editor) {
  const out = {}
  if (!editor) return out
  for (const f of files) {
    const pages = []
    for (const t of editor.tilesOf(f)) {
      if (t.src !== null && editor.sel.has(`${f.id}|${t.key}`) && !pages.includes(t.src + 1)) pages.push(t.src + 1)
    }
    if (pages.length) out[f.id] = pages
  }
  return out
}

export const picksFor = (options, f) => options.picks?.[f.id] ?? []

const sameSet = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((n, i) => n === [...b].sort((x, y) => x - y)[i])

export function PagePicker({ options, setOptions, files, editor, label }) {
  const picks = picksOf(files, editor)
  const key = JSON.stringify(picks)
  useEffect(() => {
    if (JSON.stringify(options.picks ?? {}) !== key) setOptions({ ...options, picks })
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const specs = files.map((f) => picks[f.id] ?? [])
  const common = specs.every((p) => sameSet(p, specs[0] ?? [])) ? specs[0] ?? [] : null

  // clicks in Pages view rewrite the field, unless it already says the same
  useEffect(() => {
    if (common === null) return
    let typed = []
    try {
      typed = text.trim() ? parseRangeSpec(text, Math.max(1, ...files.map((f) => f.pageCount))).pages : []
    } catch {
      typed = null
    }
    if (!typed || !sameSet(typed, common)) {
      setText(formatPages(common))
      setError(null)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const onType = (v) => {
    setText(v)
    if (!v.trim()) {
      setError(null)
      editor?.actions.clear()
      return
    }
    try {
      for (const f of files) parseRangeSpec(v, f.pageCount)
    } catch (err) {
      setError(err.message)
      return
    }
    setError(null)
    editor?.actions.selectRange(v)
  }

  return (
    <>
      <Field label={label} help="Click pages in the Pages view, Shift-click to pick a run of pages, or type pages and ranges like 1,5-8.">
        {(id) => <input id={id} className="input" placeholder="1,5-8" value={text} onChange={(e) => onType(e.target.value)} data-testid="range-input" />}
      </Field>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {common === null && <p className="field-help">Different pages are picked in each file.</p>}
      <ul className="pick-rows" data-testid="pick-counts">
        {files.map((f) => (
          <li key={f.id} className="pick-row">
            <span className="file-name" title={f.name}>
              {f.name}
            </span>
            <span className="pick-count mono">
              {(picks[f.id] ?? []).length} of {f.pageCount}
            </span>
          </li>
        ))}
      </ul>
      <div className="btn-row">
        <button type="button" className="btn btn-quiet btn-small" onClick={() => editor?.actions.selectAll()}>
          Select all
        </button>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => editor?.actions.clear()} disabled={!Object.keys(picks).length}>
          Clear
        </button>
      </div>
    </>
  )
}

export const pickedLine = (n, files) => `${plural(n, 'page')} picked${files > 1 ? ` in ${plural(files, 'file')}` : ''}`
export { plural }
