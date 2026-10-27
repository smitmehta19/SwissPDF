// Helpers shared by the page layout tools (group U5-A).
import { Field } from '../../app/controls.jsx'
import { parseRangeSpec } from '../../lib/pageRanges.js'

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

// What happens to fields, comments, links and bookmarks when pages are put
// onto new sheets (N-up, booklet, single page).
export function ImposeHelp() {
  return (
    <p className="field-help">
      Form fields and comments are drawn onto the page: their values stay visible but can no longer be edited. Links and accessibility tags are not kept. Bookmarks, title and language are kept.
    </p>
  )
}

// Result note from an imposition report, or null when nothing changed.
export function keptNote(r) {
  if (!r) return null
  const parts = []
  if (r.bookmarks) parts.push(`Kept ${plural(r.bookmarks, 'bookmark')}.`)
  const drawn = [r.fields && plural(r.fields, 'form field'), r.comments && plural(r.comments, 'comment')].filter(Boolean)
  if (drawn.length) parts.push(`${drawn.join(' and ')} drawn in, no longer editable.`)
  const lost = [r.links && plural(r.links, 'link'), r.tags && 'accessibility tags'].filter(Boolean)
  if (lost.length) parts.push(`Not kept: ${lost.join(', ')}.`)
  return parts.length ? parts.join(' ') : null
}

export const SHEET_CHOICES = [
  ['a4', 'A4'],
  ['letter', 'Letter'],
  ['a3', 'A3'],
  ['a5', 'A5'],
  ['legal', 'Legal'],
]

// Paper size select; `first` labels the "same as the pages" choice.
export function SheetSelect({ label = 'Sheet size', value, onChange, first = 'Same as the first page', testId }) {
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} className="input" data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="auto">{first}</option>
          {SHEET_CHOICES.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

// Range slider with its value in the label.
export function Slider({ label, unit = 'pt', value, min, max, step = 1, onChange, testId }) {
  return (
    <Field label={`${label} ${value}${unit ? ` ${unit}` : ''}`}>
      {(id) => <input id={id} type="range" data-testid={testId} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />}
    </Field>
  )
}

// Page list from a range spec for one file; empty = null (all pages).
export function pagesOf(spec, pageCount) {
  if (!String(spec ?? '').trim()) return null
  return parseRangeSpec(spec, pageCount).pages
}

// First range error over the files, or null.
export function rangeError(spec, files) {
  try {
    for (const f of files) pagesOf(spec, f.pageCount ?? 0)
    return null
  } catch (err) {
    return err.message
  }
}

export function PagesField({ value, onChange, files }) {
  const error = rangeError(value, files)
  return (
    <>
      <Field label="Pages" help="Leave empty for every page, or type ranges like 1-3, 8.">
        {(id) => <input id={id} className="input" data-testid="range-input" placeholder="All pages" value={value} onChange={(e) => onChange(e.target.value)} />}
      </Field>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
