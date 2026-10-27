import { useEffect, useRef, useState } from 'react'
import { Field, OptionCards } from '../../app/controls.jsx'
import Icon from '../../components/Icon.jsx'
import { getBytes } from '../../app/fileStore.js'
import { baseName } from '../../components/usePdfFiles.js'
import { PageStage, currentOf, dragRect, fracStyle, plural } from './g3-canvas.jsx'

const PATTERN_LIST = [
  ['email', 'Email addresses'],
  ['phone', 'Phone numbers'],
  ['card', 'Card numbers'],
]

const termsOf = (o) =>
  o.terms
    .split(/\n/)
    .map((t) => t.trim())
    .filter(Boolean)
const queryOf = (o) => ({ terms: termsOf(o), patterns: o.patterns, regex: o.regex, caseSensitive: o.caseSensitive, wholeWord: o.wholeWord })
const hasQuery = (o) => termsOf(o).length > 0 || o.patterns.length > 0 || !!o.regex.trim()

// What the redaction removed outside the page content, for the result note.
function cleanedParts(c) {
  if (!c) return []
  return [
    c.properties > 0 && plural(c.properties, 'document property', 'document properties'),
    c.xmp && 'XMP metadata',
    c.bookmarks > 0 && plural(c.bookmarks, 'bookmark'),
    c.comments > 0 && plural(c.comments, 'comment'),
    c.links > 0 && plural(c.links, 'link'),
    c.attachments > 0 && plural(c.attachments, 'attachment'),
    c.altTexts > 0 && plural(c.altTexts, 'alt text'),
    c.other > 0 && plural(c.other, 'other text item'),
    c.xfa && (c.xfaMatch ? 'XFA form data (where the search also matched)' : 'XFA form data'),
  ].filter(Boolean)
}

// Search hits on one page of the file in view, for the live preview.
function useHits(file, page, o) {
  const [state, setState] = useState({ key: null, boxes: [], error: null, total: 0 })
  const key = file && hasQuery(o) ? `${file.id}|${JSON.stringify(queryOf(o))}` : null
  useEffect(() => {
    if (!key) return setState({ key: null, boxes: [], error: null, total: 0 })
    let active = true
    const timer = setTimeout(async () => {
      try {
        const { findMatches } = await import('../../lib/redactOps.js')
        const boxes = await findMatches(await getBytes(file.id), queryOf(o))
        if (active) setState({ key, boxes, error: null, total: boxes.length })
      } catch (err) {
        if (active) setState({ key, boxes: [], error: err.message, total: 0 })
      }
    }, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, page: state.boxes.filter((b) => b.pageNum === page) }
}

let seq = 1

function Canvas({ files, options: o, setOptions, target, onTarget }) {
  const start = useRef(null)
  const [draft, setDraft] = useState(null)
  const { file, page } = currentOf(files, target)
  const fileId = file?.id
  const hits = useHits(file, page, o)
  const drawn = o.boxes[fileId] ?? []
  const whole = o.wholePages[fileId] ?? []
  const setFile = (key, list) => setOptions((x) => ({ ...x, [key]: { ...x[key], [fileId]: list } }))
  const isWhole = whole.includes(page)

  return (
    <PageStage
      files={files}
      target={target}
      onTarget={onTarget}
      testId="redact-stage"
      hint="Drag over anything to remove it. Search matches show in red outline."
      toolbar={
        <>
          {hasQuery(o) && (
            <span className="field-help mono" data-testid="redact-hits" aria-live="polite">
              {hits.error ? hits.error : `${plural(hits.total, 'match', 'matches')} in this file`}
            </span>
          )}
          <button
            type="button"
            className={`btn btn-quiet btn-small ${isWhole ? 'is-on' : ''}`}
            aria-pressed={isWhole}
            data-testid="redact-whole-page"
            onClick={() => setFile('wholePages', isWhole ? whole.filter((p) => p !== page) : [...whole, page].sort((a, b) => a - b))}
          >
            {isWhole ? 'Keep this page' : 'Redact whole page'}
          </button>
        </>
      }
      onDown={(p) => {
        start.current = p
        setDraft(null)
      }}
      onMove={(p) => start.current && setDraft(dragRect(start.current, p))}
      onUp={(p, _e, ctx) => {
        const r = start.current && dragRect(start.current, p)
        start.current = null
        setDraft(null)
        if (r && r.w > 3 && r.h > 3) setFile('boxes', [...drawn, { id: seq++, page: ctx.page, fx: r.fx, fy: r.fy, fw: r.fw, fh: r.fh }])
      }}
    >
      {({ page: pg, size }) => (
        <>
          {hits.page.map((b, i) => (
            <span key={`h${i}`} className="g3-ov g3-redact-hit" style={{ left: `${(b.x / size.width) * 100}%`, top: `${(b.y / size.height) * 100}%`, width: `${(b.w / size.width) * 100}%`, height: `${(b.h / size.height) * 100}%` }} data-testid="redact-hit" />
          ))}
          {drawn
            .filter((b) => b.page === pg)
            .map((b) => (
              <span key={b.id} className="g3-ov g3-redact" style={fracStyle(b)} data-testid="redact-box">
                <button type="button" className="g3-remove" data-g3-control aria-label="Remove this box" onClick={() => setFile('boxes', drawn.filter((x) => x.id !== b.id))}>
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          {draft && <span className="g3-ov g3-draft" style={fracStyle(draft)} />}
          {isWhole && <span className="g3-ov g3-redact-page">Whole page will be blacked out</span>}
        </>
      )}
    </PageStage>
  )
}

function Options({ options: o, setOptions, files }) {
  const set = (fields) => setOptions((x) => ({ ...x, ...fields }))
  const drawnCount = files.reduce((n, f) => n + (o.boxes[f.id]?.length ?? 0), 0)
  const pageCount = files.reduce((n, f) => n + (o.wholePages[f.id]?.length ?? 0), 0)
  return (
    <>
      <Field label="Find text" help="One word or phrase per line. Phrases match across line breaks and split text.">
        {(id) => <textarea id={id} className="input g3-textarea" rows={3} data-testid="redact-search" value={o.terms} placeholder={'Jane Doe\nAccount 4455'} onChange={(e) => set({ terms: e.target.value })} />}
      </Field>
      <div className="field">
        <span className="field-label">Also find</span>
        {PATTERN_LIST.map(([id, label]) => (
          <label key={id} className="check-line">
            <input
              type="checkbox"
              data-testid={`redact-pattern-${id}`}
              checked={o.patterns.includes(id)}
              onChange={(e) => set({ patterns: e.target.checked ? [...o.patterns, id] : o.patterns.filter((p) => p !== id) })}
            />
            {label}
          </label>
        ))}
      </div>
      <details className="g3-details" open={!!o.regex}>
        <summary>Search options</summary>
        <Field label="Pattern (regular expression)" help="For example \d{3}-\d{2}-\d{4} for US social security numbers.">
          {(id) => <input id={id} className="input mono" data-testid="redact-regex" value={o.regex} onChange={(e) => set({ regex: e.target.value })} />}
        </Field>
        <label className="check-line">
          <input type="checkbox" checked={o.caseSensitive} onChange={(e) => set({ caseSensitive: e.target.checked })} />
          Match upper and lower case
        </label>
        <label className="check-line">
          <input type="checkbox" checked={o.wholeWord} onChange={(e) => set({ wholeWord: e.target.checked })} />
          Whole words only
        </label>
      </details>
      <div className="field">
        <span className="field-label">Marked by hand</span>
        <p className="field-help" data-testid="redact-count">
          {plural(drawnCount, 'box', 'boxes')}, {plural(pageCount, 'whole page')}.
        </p>
        {(drawnCount > 0 || pageCount > 0) && (
          <div className="btn-row">
            <button type="button" className="btn btn-quiet btn-small" onClick={() => set({ boxes: {}, wholePages: {} })}>
              Clear all
            </button>
          </div>
        )}
      </div>
      <OptionCards
        label="How to redact"
        testId="redact-method"
        value={o.method}
        onChange={(method) => set({ method })}
        options={[
          { value: 'remove', title: 'Remove what is marked', caption: 'Text, images and drawings under the boxes are deleted. The rest stays sharp and selectable. A page that cannot be cleaned this way becomes an image. The gap keeps the length of what was removed: for names, use images.' },
          { value: 'image', title: 'Turn marked pages into images', caption: 'Nothing on those pages stays as text, not even the width of a removed word. Bigger file.' },
        ]}
      />
      <p className="g3-note">Scanned pages have no text to search. Draw boxes over them, or run OCR first.</p>
    </>
  )
}

export default {
  id: 'redact',
  name: 'Redact',
  io: 'PDF → redacted PDF',
  description: 'Destroys the content, not just covers it.',
  category: 'Security',
  icon: 'redact',
  accepts: { min: 1 },
  defaults: { terms: '', patterns: [], regex: '', caseSensitive: false, wholeWord: false, boxes: {}, wholePages: {}, method: 'remove' },
  next: ['protect', 'compress', 'pagenumbers'],
  Canvas,
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Redact' }
    const marked = files.some((f) => (o.boxes[f.id]?.length ?? 0) + (o.wholePages[f.id]?.length ?? 0) > 0)
    if (!marked && !hasQuery(o)) return { ready: false, line: 'Type text to find, pick a pattern, or drag boxes on the page.', runLabel: 'Redact' }
    const n = files.length
    const what = [hasQuery(o) && 'every match', marked && 'the marked areas'].filter(Boolean).join(' and ')
    // a search also cleans properties, bookmarks and comments, and drops attachments
    const also = hasQuery(o) ? ' Attachments in the file are removed too.' : ''
    return { ready: true, line: `${plural(n, 'redacted PDF')} will be created: ${what} removed for good.${also}`, runLabel: `Redact ${plural(n, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const { findMatches } = await import('../../lib/redactOps.js')
    const outputs = []
    const empty = []
    const total = files.reduce((n, f) => n + f.pageCount, 0) * 2
    let done = 0
    for (const f of files) {
      ctx.check()
      const found = hasQuery(o)
        ? await findMatches(f.bytes, queryOf(o), {
            check: ctx.check,
            onPage: (k) => ctx.progress(done + k, total, `Searching ${f.name}`),
          })
        : []
      done += f.pageCount
      const boxes = [
        ...found,
        ...(o.boxes[f.id] ?? []).map((b) => ({ pageNum: b.page, fx: b.fx, fy: b.fy, fw: b.fw, fh: b.fh })),
        ...(o.wholePages[f.id] ?? []).map((p) => ({ pageNum: p, whole: true })),
      ].filter((b) => b.pageNum <= f.pageCount)
      // with a search, the file is still cleaned when no page matched: the
      // text may sit in its properties, bookmarks or attachments
      const query = hasQuery(o) ? queryOf(o) : null
      if (boxes.length === 0 && !query) {
        empty.push(f.name)
        done += f.pageCount
        continue
      }
      // runs in its own worker lane, recycled every few jobs (MuPDF memory);
      // no per-page callback crosses into the worker, so progress is per file
      ctx.progress(done, total, `Redacting ${f.name}`)
      const res = await ctx.callIn('redact', 'redact', f.bytes, boxes, { method: o.method, query, report: true })
      done += f.pageCount
      const extra = cleanedParts(res.cleaned)
      // attachments and XFA go on every search: they alone are not a match,
      // unless the search hit the XFA data (Acrobat shows those values)
      const c = res.cleaned ?? {}
      if (boxes.length === 0 && !(c.properties || c.xmp || c.bookmarks || c.comments || c.links || c.altTexts || c.other || c.xfaMatch)) {
        empty.push(f.name)
        continue
      }
      const areas = boxes.filter((b) => !b.annot).length
      const parts = areas ? [`${plural(areas, 'area')} removed on ${plural(res.pages.length, 'page')}`] : []
      if (o.method === 'remove' && res.rasterPages.length) parts.push(`${plural(res.rasterPages.length, 'page')} turned into images to be safe`)
      const lines = [parts.join(', '), extra.length && `Also cleaned: ${extra.join(', ')}`].filter(Boolean)
      outputs.push({ name: `${baseName(f.name)}-redacted.pdf`, bytes: res.bytes, parentIds: [f.id], note: lines.map((l) => `${l}.`).join(' ') })
    }
    if (outputs.length === 0) throw new Error(files.length === 1 ? 'Nothing found to redact. Check the search text, or draw boxes on the page.' : 'Nothing found to redact in the selected files.')
    if (empty.length) outputs[0].note += ` Nothing found in ${empty.join(', ')}.`
    ctx.progress(total, total, 'Done')
    return outputs
  },
}
