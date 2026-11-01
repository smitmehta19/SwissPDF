// Edit PDF > Edit text: change text that is already on the page.
// The engine (lib/editTextOps.js, worker ops editTextModel / editText) reads
// the page as lines and words in view space and rewrites one word or line at
// a time. Each apply makes a new byte version of the file; the versions live
// in the tool options (options.versions[fileId] = { stack, at }) so undo/redo,
// summary() and run() all see them. A paragraph (model.paragraphs) is edited
// as one text and re-wrapped by the engine.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { callOp } from '../../app/jobs.js'
import { Dialog } from '../../app/controls.jsx'
import { getBytes, getRecord } from '../../app/fileStore.js'
import Icon from '../../components/Icon.jsx'
import { openPdfDocument, releasePdf, serializedPdfOp } from '../../lib/pdfText.js'
import { plural } from './g3-canvas.jsx'
import './edittext.css'

// ---------- versions in options ----------
const entryOf = (o, id) => {
  const s = o.versions?.[id]
  return s && s.at > 0 ? s.stack[s.at - 1] : null
}
export const textBytesOf = (o, id) => entryOf(o, id)?.bytes ?? null
export const textEditCount = (o, id) => {
  const s = o.versions?.[id]
  if (!s) return 0
  // one per applied edit (a word, a line or a paragraph), whatever the report holds
  return s.stack.slice(0, s.at).reduce((n, e) => n + e.edits.filter((_, i) => !e.report[i]?.refused).length, 0)
}
// a hybrid form's XFA copy was dropped by one of the applied edits
export const xfaRemovedIn = (o, id) => {
  const s = o.versions?.[id]
  return !!s && s.stack.slice(0, s.at).some((e) => e.xfaRemoved)
}
export const signatureRemovedIn = (o, id) => {
  const s = o.versions?.[id]
  return !!s && s.stack.slice(0, s.at).some((e) => e.signatureRemoved)
}
export const fallbackFontsIn = (o, id) => {
  const s = o.versions?.[id]
  if (!s) return []
  // paragraph reports join several names with '+'
  return [...new Set(s.stack.slice(0, s.at).flatMap((e) => e.report.filter((r) => !r.refused && (r.font === 'fallback' || r.font === 'mixed') && r.fallbackName).flatMap((r) => r.fallbackName.split('+').map((x) => x.trim()))))]
}

// Files with applied text edits that are not saved as a version yet. One
// listener for the whole app: the canvas and options unmount on mode or tool
// switches, the edits do not.
const dirty = new Set()
export const markSaved = (id) => dirty.delete(id)
const unsaved = () => [...dirty].some((id) => getRecord(id)?.isLeaf)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (!unsaved()) return
    e.preventDefault()
    e.returnValue = ''
  })
}

// Paragraph editing (re-wrap) is off for this release (review 3: P0 in the
// re-wrap). With false: no paragraph editor, no Paragraph button, no
// Shift+Enter paragraph; a triple-click edits the whole line; the model is
// read without paragraphs.
export const PARAGRAPH_EDIT = false

// ---------- page text model ----------
// per bytes buffer, per page: run ids only hold for the bytes they came from
const models = new WeakMap()
function modelOf(bytes, page) {
  let m = models.get(bytes)
  if (!m) models.set(bytes, (m = new Map()))
  if (!m.has(page)) {
    const p = callOp('editTextModel', [bytes, page, { paragraphs: PARAGRAPH_EDIT }])
    p.catch(() => m.delete(page))
    m.set(page, p)
  }
  return m.get(page)
}

function useModel(file, page, bytes, enabled) {
  const [st, setSt] = useState({ id: null, page: 0, bytes: null, model: null, error: null })
  const fileBytes = file?.bytes
  useEffect(() => {
    if (!enabled || !file) return undefined
    let on = true
    ;(async () => {
      const src = bytes ?? fileBytes ?? (await getBytes(file.id))
      return modelOf(src, page)
    })().then(
      (model) => on && setSt({ id: file.id, page, bytes, model, error: null }),
      (err) => on && !err.cancelled && setSt({ id: file.id, page, bytes, model: null, error: err.message }),
    )
    return () => {
      on = false
    }
  }, [file?.id, page, bytes, enabled]) // eslint-disable-line react-hooks/exhaustive-deps
  return st.id === file?.id && st.page === page && st.bytes === bytes ? st : { model: null, error: null }
}

// ---------- form fields ----------
// Boxes of the page's form fields (view space, as pdf.js draws the page at
// scale 1). Empty fields have no text in the page model, so a click on one
// would do nothing; these say "use Forms" instead.
const widgetCache = new WeakMap()
function widgetsOf(src, pageNum) {
  let m = widgetCache.get(src)
  if (!m) widgetCache.set(src, (m = new Map()))
  if (!m.has(pageNum)) {
    const p = serializedPdfOp(async () => {
      const doc = await openPdfDocument(src)
      const pg = await doc.getPage(pageNum)
      const vp = pg.getViewport({ scale: 1 })
      const annots = await pg.getAnnotations({ intent: 'display' })
      return annots
        .filter((a) => a.subtype === 'Widget' && a.rect && !a.hidden)
        .map((a) => {
          const [x0, y0, x1, y1] = vp.convertToViewportRectangle(a.rect)
          return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]
        })
    })
    p.catch(() => m.delete(pageNum))
    m.set(pageNum, p)
  }
  return m.get(pageNum)
}

function useWidgets(file, page, bytes, enabled) {
  const [st, setSt] = useState({ key: null, boxes: [] })
  const key = `${file?.id}:${page}`
  useEffect(() => {
    if (!enabled || !file) return undefined
    let on = true
    ;(async () => widgetsOf(bytes ?? file.bytes ?? (await getBytes(file.id)), page))().then(
      (boxes) => on && setSt({ key, bytes, boxes }),
      () => on && setSt({ key, bytes, boxes: [] }),
    )
    return () => {
      on = false
    }
  }, [key, bytes, enabled]) // eslint-disable-line react-hooks/exhaustive-deps
  return st.key === key ? st.boxes : []
}

// ---------- plain words ----------
const WHY = {
  scanned: 'Scanned page: run OCR first',
  hidden: 'Hidden text',
  vertical: "Vertical text can't be edited yet",
  'no-unicode': "This text can't be read as letters",
  type3: "This text can't be read as letters",
  'form-field': 'This is a form field: use Forms',
  comment: 'This is a comment',
  'not-found': 'That text is no longer there; click the word again',
  stale: 'The page was updated; click the word again',
  conflict: 'Two edits overlap: change one at a time',
  'no-glyph': 'No font here can draw that text',
  covered: 'Something is drawn over this text, so it is left as it is',
  'no-room': 'No room for this text here, even squeezed: try shorter text',
  'no-room-below': 'No room below this paragraph. Try shorter text, or use PDF to Word for bigger rewrites',
  'tight-lines': 'The lines here are too close to change this safely',
  'inline-image': 'This page has an embedded image this edit would damage, so it is left as it is',
  unreadable: "This text can't be read as letters, so it can't be edited",
  layout: 'These lines sit side by side, like a table: edit them one line at a time',
  encoding: "Some letters here can't be redrawn, so this text is left as it is",
  'render-mode': 'This text is outlined or used as a mask, so it is left as it is',
  'draw-failed': "This text couldn't be redrawn, so it is left as it is",
  decorated: 'Underlined or struck text: keep the change the same length, or edit text outside the underline',
  // same wording as docOps DYNAMIC_XFA_MSG
  'xfa-dynamic': 'This is a dynamic XFA form: the form exists only as XFA, and editing would leave only its "Please wait" page',
}
// paragraphs: the engine looks for room below the paragraph, not on the line
const WHY_PARA = {
  'no-room': 'Not enough room for this text, even squeezed: try shorter text',
}
export const reasonText = (why, char, para = false) =>
  why === 'unsupported-char' ? `No font here has the character "${char ?? '?'}"` : (para && WHY_PARA[why]) || WHY[why] || "This text can't be edited"

// Text the file has no letter mapping for (MuPDF gives U+FFFD, controls or
// private-use characters): it would show as garbage in the editor.
const UNREADABLE = /[�\u0000-\u0008\u000e-\u001f\u007f-\u009f-]/u
// Characters no bundled font has: caught before a round trip to the engine.
// (emoji drawn as pictures; text symbols such as the copyright sign are fine)
const NO_FONT = /\p{Emoji_Presentation}/u
const NON_LATIN = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u
const isPhone = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 760)
// right-to-left: the paragraph says so, else the first letter of the text
// (run.dir is the line's direction vector, not this)
const RTL_LETTER = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u
const isRtl = (text, para) => (para?.dir ? para.dir === 'rtl' : RTL_LETTER.test(text.match(/\p{L}/u)?.[0] ?? ''))

// Narrow screens edit in a bar at the bottom, so the bigger text does not
// cover the words around the one being changed.
const NARROW = '(max-width: 767px)'
function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(NARROW).matches)
  useEffect(() => {
    const m = window.matchMedia?.(NARROW)
    if (!m) return undefined
    const on = () => setNarrow(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

// Height the on-screen keyboard takes from the bottom of the window.
function useKeyboardInset(on) {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!on || !vv) return undefined
    const measure = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    measure()
    vv.addEventListener('resize', measure)
    vv.addEventListener('scroll', measure)
    return () => {
      vv.removeEventListener('resize', measure)
      vv.removeEventListener('scroll', measure)
    }
  }, [on])
  return inset
}

// ---------- geometry (points, view space) ----------
const inBox = (b, p, pad = 0) => p.x >= b[0] - pad && p.x <= b[2] + pad && p.y >= b[1] - pad && p.y <= b[3] + pad
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
// distance from a point to a box (0 inside)
const boxDist = (b, p) => Math.hypot(Math.max(b[0] - p.x, 0, p.x - b[2]), Math.max(b[1] - p.y, 0, p.y - b[3]))
// a finger tap picks the closest editable line this many CSS px away
const TAP_PX = 22

function wordAt(run, p) {
  const hit = run.words.find((w) => inBox(w.bbox, p, 0.6))
  if (hit) return hit
  let best = null
  for (const w of run.words) {
    const d = Math.hypot((w.bbox[0] + w.bbox[2]) / 2 - p.x, (w.bbox[1] + w.bbox[3]) / 2 - p.y)
    if (!best || d < best.d) best = { w, d }
  }
  return best?.w ?? null
}

// The box along the line's direction: start and length from its origin,
// height above (hi) and below (lo) the baseline.
function lineGeom(run, box) {
  const d = run.dir
  const o = run.origin
  const s = run.fontSize || 10
  const up = [d[1], -d[0]]
  const corners = [
    [box[0], box[1]],
    [box[2], box[1]],
    [box[0], box[3]],
    [box[2], box[3]],
  ]
  const along = corners.map((c) => (c[0] - o[0]) * d[0] + (c[1] - o[1]) * d[1])
  const perp = corners.map((c) => (c[0] - o[0]) * up[0] + (c[1] - o[1]) * up[1])
  return {
    x: o[0],
    y: o[1],
    angle: (Math.atan2(d[1], d[0]) * 180) / Math.PI,
    start: Math.min(...along),
    len: Math.max(...along) - Math.min(...along),
    hi: clamp(Math.max(...perp), 0.8 * s, 1.25 * s),
    lo: clamp(Math.min(...perp), -0.4 * s, -0.18 * s),
    // the box itself, above and below the baseline (paragraphs)
    top: Math.max(...perp),
    bottom: Math.min(...perp),
    size: s,
  }
}

// A paragraph's box from its first line, its main text size and the distance
// between its baselines (the editor's line height). Several runs can share a
// baseline (a bold label, then text): the next baseline is the first one
// half a line or more away.
function paraGeom(para, lines) {
  const first = lines[0]
  const g = lineGeom(first, para.bbox)
  const size = para.fontSize || g.size
  const d = first.dir
  const gap = (r) => Math.abs((r.origin[0] - first.origin[0]) * d[1] - (r.origin[1] - first.origin[1]) * d[0])
  const next = lines.find((r) => r.origin && gap(r) > 0.5 * size)
  const lead = next ? gap(next) : 0
  return { ...g, size, lead: lead > 0.5 * size && lead < 3 * size ? lead : 1.2 * size }
}

const overlaps = (a, b) => a && b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]

const fold = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
// what an editor edits, for its draft after a refusal
const draftKey = (ed) => (ed.kind === 'para' ? `p:${ed.para.id}` : `${ed.kind}:${ed.run.id}:${ed.wordIndex}`)

// The paragraph editor's look: the style that covers most of its text (font,
// bold, italic, weighted by letters); a tie goes to the plain one, so an
// italic or bold lead-in does not set the look of the whole paragraph.
function bodyLook(lines) {
  const by = new Map()
  for (const r of lines) {
    const k = `${r.fontName}|${!!r.bold}|${!!r.italic}`
    const e = by.get(k) ?? { run: r, n: 0 }
    e.n += r.text.length
    by.set(k, e)
  }
  const plain = (r) => (r.italic ? 0 : 1) + (r.bold ? 0 : 1)
  return [...by.values()].sort((a, b) => b.n - a.n || plain(b.run) - plain(a.run))[0]?.run ?? lines[0]
}

// The same word, line or paragraph in a fresh page model (ids can move after
// an edit).
function remap(model, e) {
  if (e.paragraphId) {
    const p = model.paragraphs?.find((x) => x.editable && fold(x.text) === fold(e.old) && overlaps(x.bbox, e.anchor))
    return p ? { ...e, paragraphId: p.id } : null
  }
  for (const run of model.runs) {
    if (!run.editable) continue
    if (e.wordIndex == null) {
      if (run.text === e.old && overlaps(run.bbox, e.anchor)) return { ...e, runId: run.id }
    } else {
      const w = run.words.find((x) => x.text === e.old && overlaps(x.bbox, e.anchor))
      if (w) return { ...e, runId: run.id, wordIndex: w.i }
    }
  }
  return null
}

// Reading order: lines from the top of the text, then along the line.
function readingOrder(runs) {
  const key = (r) => {
    const d = r.dir ?? [1, 0]
    // form fields and comments have no origin: their box corner stands in
    const o = r.origin ?? [r.bbox[0], r.bbox[3]]
    const up = [d[1], -d[0]]
    return [Math.round(-(o[0] * up[0] + o[1] * up[1]) / 2), o[0] * d[0] + o[1] * d[1]]
  }
  return runs
    .map((r) => ({ r, k: key(r) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1])
    .map((x) => x.r)
}

// Closest web font to the PDF font name. Sans names first: "HelveticaNeue-Roman"
// is a sans face with Roman as its weight.
function familyOf(name = '', script = 'latin') {
  const n = name.replace(/^[A-Z]{6}\+/, '')
  // other scripts: a face that has the letters, not the Latin one by name
  if (script && script !== 'latin') return '"Noto Sans Arabic", "Noto Sans", "Segoe UI", Tahoma, "Arial Unicode MS", system-ui, sans-serif'
  if (/courier|mono|consol|cmtt|typewriter/i.test(n)) return '"Courier New", Courier, monospace'
  if (/sans|helvet|arial|gothic|verdana|tahoma|segoe|calibri|frutiger|univers|myriad|futura|franklin|din|roboto|lato|source/i.test(n)) return 'Helvetica, Arial, sans-serif'
  if (/times|roman|serif|georgia|garamond|cmr|cmbx|cmti|nimbusrom|minion|cambria|palatino|book|caslon|baskerville/i.test(n)) return '"Times New Roman", Times, serif'
  return 'Helvetica, Arial, sans-serif'
}

const colorOf = (c) => (!c || c.every((v) => v > 0.85) ? '#101828' : `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`)

let measureCtx = null
function textWidth(text, font) {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  measureCtx.font = font
  return measureCtx.measureText(text).width
}

const pct = (v, total) => `${(v / total) * 100}%`

// ---------- inline editor ----------
// Word or line: an input over the text. Paragraph: a text area over the
// paragraph (Enter = new line, Ctrl+Enter applies). Narrow screens (bar):
// the same field in a bar at the bottom, above the keyboard; the page shows
// a highlight of what is being edited.
const keepFocus = (e) => e.preventDefault() // bar buttons must not blur the field (blur applies)

function InlineEditor({ ed, scale, size, busy, bar, onCommit, onCancel, onLine, onPara, onDirty }) {
  const ref = useRef(null)
  const barRef = useRef(null)
  const done = useRef(false)
  // a refused try comes back with what was typed and why it was refused
  const [value, setValue] = useState(ed.draft ?? ed.text)
  const para = ed.kind === 'para'
  const inset = useKeyboardInset(bar)
  useEffect(() => {
    const el = ref.current
    el?.focus({ preventScroll: true })
    // a paragraph, or text brought back after a refusal, keeps its text: the
    // caret goes to the end (selecting it would let one key wipe it)
    if (para || ed.draft != null) el?.setSelectionRange?.(el.value.length, el.value.length)
    else el?.select()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onDirty?.(value !== ed.text), [value !== ed.text]) // eslint-disable-line react-hooks/exhaustive-deps
  // the text area grows with its text
  useLayoutEffect(() => {
    const el = ref.current
    if (!para || !el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value, para])
  // removed without Enter, Esc or a click away (page change): nothing applies
  // (StrictMode mounts twice, so the flag is reset on mount)
  useLayoutEffect(() => {
    done.current = false
    return () => {
      done.current = true
    }
  }, [])
  const [problem, setProblem] = useState(ed.problem ?? null)
  const g = ed.geom
  const run = ed.look ?? ed.run
  const rtl = ed.rtl
  const family = familyOf(run.fontName, NON_LATIN.test(ed.text) ? 'other' : run.script)
  // phones: at least 16 px, or iOS zooms the page when the input gets focus
  const textPx = g.size * scale
  const fontPx = bar ? 16 : isPhone() ? Math.max(16, textPx) : textPx
  const grow = fontPx / textPx
  const font = `${run.italic ? 'italic ' : ''}${run.bold ? '700 ' : '400 '}${fontPx}px ${family}`
  const widthPx = Math.max(g.len * scale, textWidth(value || ' ', font) + 6)
  const finish = (how, extra) => {
    if (done.current) return
    // no bundled font has it: say so now and keep what was typed (a click
    // away still sends it, and the engine's refusal note says the same)
    const bad = how !== 'cancel' && !extra?.blur && value.match(NO_FONT)
    if (bad) {
      setProblem(`No font here has the character "${bad[0]}": remove it, or press Esc.`)
      return
    }
    done.current = true
    if (how === 'cancel') onCancel()
    else onCommit(value, extra)
  }
  const toPara = () => {
    done.current = true
    onPara()
  }
  const label = para ? 'Edit paragraph' : ed.wordIndex == null ? 'Edit line' : 'Edit word'
  const Field = para ? 'textarea' : 'input'
  // on the page: the text's own look, over the text (right-to-left text is
  // anchored at its right end and grows to the left)
  const onPage = para
    ? {
        left: `calc(var(--pt) * ${g.start})`,
        top: `calc(var(--pt) * ${-g.top})`,
        width: `calc(var(--pt) * ${g.len} + 4px)`,
        minHeight: `calc(var(--pt) * ${g.top - g.bottom})`,
        lineHeight: `calc(var(--pt) * ${g.lead * grow})`,
      }
    : {
        left: rtl ? `calc(var(--pt) * ${g.start + g.len} - ${widthPx}px)` : `calc(var(--pt) * ${g.start})`,
        top: `calc(var(--pt) * ${-g.hi * grow})`,
        height: `calc(var(--pt) * ${(g.hi - g.lo) * grow})`,
        width: `${widthPx}px`,
      }
  const field = (
    <Field
      ref={ref}
      className={`et-input ${para ? 'et-para' : ''}`}
      data-testid={para ? 'et-para' : 'et-input'}
      dir={rtl ? 'rtl' : 'auto'}
      spellCheck={false}
      autoComplete="off"
      aria-label={label}
      value={value}
      disabled={busy}
      aria-invalid={problem ? 'true' : undefined}
      aria-describedby={problem ? 'et-input-error' : undefined}
      style={{
        ...(bar ? {} : onPage),
        fontSize: `${fontPx}px`,
        fontFamily: family,
        fontWeight: run.bold ? 700 : 400,
        fontStyle: run.italic ? 'italic' : 'normal',
        color: bar ? undefined : colorOf(run.color),
        textAlign: rtl ? 'right' : undefined,
      }}
      onChange={(e) => {
        setValue(e.target.value)
        if (problem && !NO_FONT.test(e.target.value)) setProblem(null)
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter' && (!para || e.ctrlKey || e.metaKey)) {
          // a paragraph takes Enter as a new line; Ctrl+Enter applies
          e.preventDefault()
          finish('commit', { tab: 0 })
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          finish('cancel')
        } else if (e.key === 'Tab') {
          e.preventDefault()
          finish('commit', { tab: e.shiftKey ? -1 : 1 })
        }
      }}
      onBlur={(e) => {
        if (barRef.current?.contains(e.relatedTarget)) return
        finish('commit', { blur: true })
      }}
      onDoubleClick={(e) => {
        // a double click on a word that is not changed yet edits the whole line
        if (para || ed.wordIndex == null || value !== ed.text) return
        e.preventDefault()
        done.current = true
        onLine()
      }}
      onClick={(e) => {
        // the third click of a triple click lands here: edit the paragraph
        if (e.detail >= 3 && !para && onPara && value === ed.text) toPara()
      }}
    />
  )
  const error = problem && (
    <span
      className="et-input-error"
      id="et-input-error"
      role="alert"
      data-testid="et-input-error"
      // a paragraph's reason goes above it (the text area grows downwards)
      style={bar ? undefined : para ? { left: `calc(var(--pt) * ${g.start})`, top: `calc(var(--pt) * ${-g.top} - 6px)`, transform: 'translateY(-100%)' } : { left: `calc(var(--pt) * ${g.start})`, top: `calc(var(--pt) * ${-g.lo * grow} + 6px)` }}
    >
      {problem}
    </span>
  )
  if (bar) {
    return createPortal(
      <div className="et-sheet" ref={barRef} role="group" aria-label={label} data-testid="et-bar" style={{ bottom: inset }}>
        {error}
        {field}
        <div className="et-sheet-actions">
          {onPara && !para && (
            <button type="button" className="btn btn-quiet et-sheet-para" onMouseDown={keepFocus} onClick={toPara} disabled={busy || value !== ed.text} data-testid="et-para-btn">
              Paragraph
            </button>
          )}
          <button type="button" className="btn btn-quiet" onMouseDown={keepFocus} onClick={() => finish('cancel')} data-testid="et-cancel">
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onMouseDown={keepFocus} onClick={() => finish('commit', { tab: 0 })} disabled={busy} data-testid="et-apply">
            Apply
          </button>
        </div>
      </div>,
      document.body,
    )
  }
  return (
    <div className="g3-ov et-anchor" style={{ left: pct(g.x, size.width), top: pct(g.y, size.height), transform: `rotate(${g.angle}deg)` }} data-g3-control>
      {field}
      {error}
    </div>
  )
}

// Notes sit under the edit; one that would be cut off by the edge of the
// visible canvas (a heading at the right edge, the page bottom) moves left
// or above the text.
function Note({ n, b, size, scale, className, children }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    const wrap = el?.closest('.g3-stage-wrap')
    const stage = el?.parentElement
    if (!el || !wrap || !stage) return undefined
    const fit = () => {
      el.style.translate = ''
      const w = wrap.getBoundingClientRect()
      const s = stage.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const left = Math.max(w.left + wrap.clientLeft, s.left, 0) + 4
      const right = Math.min(w.left + wrap.clientLeft + wrap.clientWidth, s.right, window.innerWidth) - 4
      let dx = 0
      if (r.right > right) dx = right - r.right
      if (r.left + dx < left) dx = left - r.left
      // past the page bottom: above the text instead
      const boxPx = (b[3] - b[1]) * scale
      const dy = r.bottom > s.bottom - 2 && r.top - boxPx - r.height - 8 >= s.top ? -(boxPx + r.height + 8) : 0
      if (dx || dy) el.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(stage)
    ro.observe(wrap)
    wrap.addEventListener('scroll', fit, { passive: true })
    window.addEventListener('resize', fit)
    return () => {
      ro.disconnect()
      wrap.removeEventListener('scroll', fit)
      window.removeEventListener('resize', fit)
    }
  }, [n.key, b[0], b[1], b[3], scale]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className={`g3-ov et-note ${className}`} style={{ left: pct(b[0], size.width), top: `calc(${pct(b[3], size.height)} + 4px)` }} data-g3-control data-testid="et-note">
      {children}
    </div>
  )
}

// ---------- the hook used by edit.jsx's canvas ----------
export function useTextEdit({ file, page, options: o, setOptions, active }) {
  const oRef = useRef(o)
  oRef.current = o
  const id = file?.id
  const bytes = id ? textBytesOf(o, id) : null
  const { model, error } = useModel(file, page, bytes, !!file && (active || o.mode === 'auto'))
  const [editing, setEditing] = useState(null) // { kind: word | line | para, run, wordIndex, text, box, geom, para, rtl }
  const [edDirty, setEdDirty] = useState(false) // the open editor has typed changes
  const narrow = useNarrow()
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState(null) // { bytes, page, notes } of an apply that changed nothing
  const [hidden, setHidden] = useState(() => new Set()) // dismissed notes
  const [ask, setAsk] = useState(null) // signed file: the activation waiting for a yes
  const [timing, setTiming] = useState(null) // { engine, total } ms of the last apply
  const [live, setLive] = useState('')
  const pendingRender = useRef(null)
  const pendingOpen = useRef(null) // a click that came while an apply ran
  const focusIdx = useRef(null)
  const focusAnchor = useRef(null) // box of the last applied edit: focus goes back there
  const drafts = useRef(new Map()) // typed text of refused edits, per target
  const lineEls = useRef([])
  const stageRef = useRef(null)
  const hlRef = useRef(null)

  const widgets = useWidgets(file, page, bytes, !!file && active && !!model)
  const runs = model ? readingOrder(model.runs) : []
  const paras = PARAGRAPH_EDIT ? (model?.paragraphs ?? []) : []
  const paraOf = (run) => (run ? paras.find((p) => p.runIds.includes(run.id)) : null)
  const scanned = !!model?.page.scanned
  const editable = runs.some((r) => r.editable)
  const autoMode = model ? (editable || scanned ? 'text' : 'add') : null

  // auto mode follows the page: Edit text when it has text to edit (or is a
  // scan, to say why not), else Add
  useEffect(() => {
    if (o.mode === 'auto' && autoMode && o.autoMode !== autoMode) setOptions((x) => ({ ...x, autoMode }))
  }, [o.mode, autoMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // what the page offers, for the panel and the Run line
  const pageKind = model ? (scanned ? 'scanned' : editable ? 'text' : 'none') : null
  useEffect(() => {
    if (pageKind && o.pageKind !== pageKind) setOptions((x) => ({ ...x, pageKind }))
  }, [pageKind]) // eslint-disable-line react-hooks/exhaustive-deps

  // files that left the workspace (saved by Run, removed) drop their versions
  useEffect(() => {
    const gone = Object.keys(o.versions ?? {}).filter((fid) => !getRecord(fid)?.isLeaf)
    if (!gone.length) return
    for (const fid of gone) {
      dirty.delete(fid)
      for (const e of o.versions[fid].stack) releasePdf(e.bytes)
    }
    setOptions((x) => {
      const versions = { ...x.versions }
      for (const fid of gone) delete versions[fid]
      return { ...x, versions }
    })
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // a page or version change closes the editor
  useEffect(() => setEditing(null), [id, page, bytes])

  // keyboard focus survives the re-read after an apply: back on the edited
  // text (by place, never scrolling the page), or Tab's next line
  useEffect(() => {
    if (!model || editing) return
    const a = focusAnchor.current
    if (a) {
      focusAnchor.current = null
      const area = (b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
      let best = -1
      runs.forEach((r, i) => {
        if (area(r.bbox) > 0 && (best < 0 || area(r.bbox) > area(runs[best].bbox))) best = i
      })
      if (best >= 0) lineEls.current[best]?.focus({ preventScroll: true })
      return
    }
    if (focusIdx.current == null) return
    const el = lineEls.current[Math.min(focusIdx.current, runs.length - 1)]
    focusIdx.current = null
    el?.focus({ preventScroll: false })
  }, [model]) // eslint-disable-line react-hooks/exhaustive-deps

  // what Run must wait for (edit.jsx summary): typed text in an open editor
  // (a Run click commits it), or a refused edit back in its editor
  const typedOpen = active && !!editing && edDirty
  const heldRefusal = active && !!editing?.problem
  useEffect(() => {
    setOptions((x) => (!!x.textOpen === typedOpen && !!x.textHold === heldRefusal ? x : { ...x, textOpen: typedOpen, textHold: heldRefusal }))
  }, [typedOpen, heldRefusal]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setOptions((x) => (x.textOpen || x.textHold ? { ...x, textOpen: false, textHold: false } : x)), []) // eslint-disable-line react-hooks/exhaustive-deps

  // drafts belong to the bytes they were typed on
  useEffect(() => drafts.current.clear(), [id, page, bytes])

  // a click made while the last apply ran opens once the page is re-read
  // (or at once when that apply was refused)
  const [refusedTick, setRefusedTick] = useState(0)
  useEffect(() => {
    if (!model || !pendingOpen.current || busy) return
    const p = pendingOpen.current
    pendingOpen.current = null
    const run = runs.find((r) => r.editable && inBox(r.bbox, p, 0.5))
    if (run) open(run, p.line ? null : wordAt(run, p))
  }, [model, refusedTick]) // eslint-disable-line react-hooks/exhaustive-deps

  const setStack = (fid, fn) =>
    setOptions((x) => {
      const cur = x.versions?.[fid] ?? { stack: [], at: 0 }
      const next = fn(cur)
      if (next.at > 0) dirty.add(fid)
      else dirty.delete(fid)
      return { ...x, versions: { ...x.versions, [fid]: next } }
    })

  const stackNow = () => oRef.current.versions?.[id] ?? { stack: [], at: 0 }
  // Run waits while an edit is applied: it would save the file without it
  const setTextBusy = (on) => setOptions((x) => (!!x.textBusy === on ? x : { ...x, textBusy: on }))

  // A refused edit keeps what was typed: the editor comes back with it and
  // the reason (also after a click away, e.g. on Run, which then waits).
  // When the click away opened other text, the draft waits until this text
  // is opened again.
  const refusedWith = (notes, parent, from) => {
    const why = noteText(notes[0])
    setLive(why)
    focusAnchor.current = null // the page is not read again
    if (from) {
      drafts.current.set(draftKey(from.ed), { text: from.value, problem: why })
      if (!pendingOpen.current) {
        focusIdx.current = null
        // in the same render as busy going off: a held Run click is dropped
        setOptions((x) => ({ ...x, textHold: true }))
        setEditing({ ...from.ed, draft: from.value, problem: why })
        return
      }
    }
    setRefused({ id: ++entrySeq, bytes: parent, page, notes })
    // the page is not read again: a click held during the apply opens now
    if (pendingOpen.current) setRefusedTick((n) => n + 1)
  }

  async function apply(edits, { fit = false, replace = false, from = null, oneLine = false } = {}) {
    const s = stackNow()
    const top = s.at > 0 ? s.stack[s.at - 1] : null
    // busy before any wait: a Run click right after this must be held
    setBusy(true)
    setTextBusy(true)
    const parent = replace ? top.parentBytes : (top?.bytes ?? file.bytes ?? (await getBytes(id)))
    setRefused(null)
    setLive('Applying')
    const t0 = performance.now()
    try {
      const send = (list) => callOp('editText', [parent, list.map(({ anchor, ...e }) => e), { fit, spill: !oneLine }])
      let res = await send(edits)
      // stale run ids: read the page again and retry once with the same word
      if (res.report.some((r) => r.refused === 'stale' || r.refused === 'not-found')) {
        models.get(parent)?.delete(page)
        const fresh = await modelOf(parent, page)
        const again = edits.map((e) => remap(fresh, e) ?? e)
        if (again.some((e, i) => e !== edits[i])) {
          res = await send(again)
          edits = again
        }
      }
      const engine = typeof res.ms?.total === 'number' ? res.ms.total : performance.now() - t0
      // a line or paragraph refused for unreadable letters: say when single
      // words of it can still be edited
      const wordsOk = (e) => {
        const ids = e?.paragraphId ? (paras.find((p) => p.id === e.paragraphId)?.runIds ?? []) : e?.wordIndex == null && e?.runId ? [e.runId] : []
        return ids.some((rid) => runs.find((r) => r.id === rid)?.words.some((w) => !UNREADABLE.test(w.text) && !w.covered))
      }
      // a character the user did not type (it was in the old text): say so
      const wasThere = (r, e) => r.refused === 'unsupported-char' && !!r.char && String(e?.old ?? '').includes(r.char)
      const notes = res.report.map((r, i) => ({ ...r, anchor: edits[i]?.anchor ?? edits[0]?.anchor, ...(UNREAD_WHY.has(r.refused) && wordsOk(edits[i]) ? { wordsOk: true } : {}), ...(wasThere(r, edits[i]) ? { charWasThere: true } : {}) }))
      if (!notes.some((r) => !r.refused)) {
        refusedWith(notes, parent, from)
        // the page is not read again: keyboard focus goes back now
        if (focusIdx.current != null) {
          lineEls.current[focusIdx.current]?.focus({ preventScroll: true })
          focusIdx.current = null
        }
        return
      }
      const entry = { id: ++entrySeq, bytes: res.bytes, parentBytes: parent, edits, report: notes, page, fit, signatureRemoved: !!res.signatureRemoved, xfaRemoved: !!res.xfaRemoved, ms: engine }
      // versions dropped from the redo tail are released from pdf.js
      const dropped = replace ? s.stack.slice(s.at - 1) : s.stack.slice(s.at)
      for (const e of dropped) if (e.bytes !== parent) releasePdf(e.bytes)
      pendingRender.current = { bytes: res.bytes, t0, engine }
      setStack(id, (cur) => {
        const keep = cur.stack.slice(0, replace ? cur.at - 1 : cur.at)
        return { stack: [...keep, entry], at: keep.length + 1 }
      })
      setLive(res.signatureRemoved ? 'Edit applied. The digital signature was removed.' : res.xfaRemoved ? `Edit applied. ${XFA_NOTE}` : 'Edit applied')
    } catch (err) {
      if (!err.cancelled) refusedWith([{ refused: 'error', message: err.message, anchor: edits[0]?.anchor }], parent, from)
    } finally {
      setBusy(false)
      setTextBusy(false)
    }
  }

  const onRendered = (src) => {
    const p = pendingRender.current
    if (!p || src !== p.bytes) return
    pendingRender.current = null
    setTiming({ engine: Math.round(p.engine ?? 0), total: Math.round(performance.now() - p.t0) })
  }

  // a note on the page right away (nothing was sent to the engine); an open
  // editor closes, so a note and an editor never show together
  const refuseNow = (why, anchor, para = false, extra = {}) => {
    setEditing(null)
    setRefused({ id: ++entrySeq, bytes, page, notes: [{ refused: why, anchor, ...(para ? { paragraphId: true } : {}), ...extra }] })
    setLive(noteText({ refused: why, ...(para ? { paragraphId: true } : {}), ...extra }))
  }
  // a form field (empty, or its value): say where it is filled in
  const formHint = (box) => refuseNow('form-field', box, false, { action: 'forms' })
  // an editor for a target, with the text of an earlier refused try
  const withDraft = (ed) => {
    const d = drafts.current.get(draftKey(ed))
    return d ? { ...ed, draft: d.text, problem: d.problem } : ed
  }

  function open(run, word) {
    if (!run.editable || busy) return
    if (model.signed && !signedOk.has(id)) {
      setAsk({ run, word })
      return
    }
    const box = word ? word.bbox : run.bbox
    // notes of the last change make way for the next one (the panel keeps them)
    if (notes.length) setHidden((h) => new Set([...h, ...notes.map((n) => n.key)]))
    // no letter mapping: the editor would show garbage, and the engine refuses it
    if (UNREADABLE.test(word ? word.text : run.text)) return refuseNow('unreadable', box, false, !word && readableWords([run]) ? { wordsOk: true } : {})
    const text = word ? word.text : run.text
    setEdDirty(false)
    setEditing(withDraft({ kind: word ? 'word' : 'line', run, wordIndex: word ? word.i : null, text, box, geom: lineGeom(run, box), rtl: isRtl(run.text, paraOf(run)) }))
  }

  // the whole paragraph a line belongs to
  function openPara(para) {
    if (!para || busy) return
    const lines = para.runIds.map((rid) => runs.find((r) => r.id === rid)).filter((r) => r?.origin)
    const first = lines[0]
    if (!first) return
    if (model.signed && !signedOk.has(id)) {
      setAsk({ para })
      return
    }
    if (notes.length) setHidden((h) => new Set([...h, ...notes.map((n) => n.key)]))
    const why = !para.editable ? (para.why ?? 'unreadable') : UNREADABLE.test(para.text) ? 'unreadable' : null
    if (why) return refuseNow(why, para.bbox, true, UNREAD_WHY.has(why) && readableWords(lines) ? { wordsOk: true } : {})
    setEdDirty(false)
    setEditing(withDraft({ kind: 'para', run: first, look: bodyLook(lines), para, wordIndex: null, text: para.text, box: para.bbox, geom: paraGeom(para, lines), rtl: isRtl(para.text, para) }))
  }

  const commit = (ed, value, extra) => {
    setEditing(null)
    const idx = runs.indexOf(ed.run)
    if (extra?.tab === 0) {
      // Enter / Apply: focus goes back to the edited text once the page is
      // read again, found by place (line order can change), without scrolling
      if (value === ed.text) lineEls.current[idx]?.focus({ preventScroll: true })
      else focusAnchor.current = ed.box
    } else if (extra?.tab != null) {
      focusIdx.current = clamp(idx + extra.tab, 0, runs.length - 1)
      if (value === ed.text) {
        lineEls.current[focusIdx.current]?.focus({ preventScroll: narrow })
        focusIdx.current = null
      }
    }
    if (value === ed.text) return drafts.current.delete(draftKey(ed))
    const from = { ed, value }
    if (ed.kind === 'para') apply([{ pageNum: page, paragraphId: ed.para.id, text: value, old: ed.text, anchor: ed.box }], { from })
    else apply([{ pageNum: page, runId: ed.run.id, wordIndex: ed.wordIndex, text: value, old: ed.text, anchor: ed.box }], { from })
  }

  // the bar editor: the edited text in view above it (only as far as needed)
  useEffect(() => {
    if (editing && narrow) hlRef.current?.scrollIntoView({ block: 'nearest' })
  }, [editing, narrow])

  const undo = () => {
    const s = stackNow()
    if (s.at === 0 || busy) return
    setRefused(null)
    setStack(id, (cur) => ({ ...cur, at: Math.max(0, cur.at - 1) }))
    setLive('Undone')
  }
  const redo = () => {
    const s = stackNow()
    if (s.at >= s.stack.length || busy) return
    setRefused(null)
    setStack(id, (cur) => ({ ...cur, at: Math.min(cur.stack.length, cur.at + 1) }))
    setLive('Redone')
  }

  // Ctrl+Z / Ctrl+Y while not typing
  useEffect(() => {
    if (!active) return undefined
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const t = document.activeElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (document.querySelector('[role=dialog]')) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const s = id ? (o.versions?.[id] ?? { stack: [], at: 0 }) : { stack: [], at: 0 }
  const top = s.at > 0 ? s.stack[s.at - 1] : null
  const notes = [
    ...(top && top.page === page ? top.report.map((r, i) => ({ ...r, key: `${top.id}:${i}`, i, entry: top, ...(top.xfaRemoved && i === 0 ? { xfa: true } : {}) })) : []),
    ...(refused && refused.page === page && refused.bytes === (bytes ?? refused.bytes) ? refused.notes.map((r, i) => ({ ...r, key: `${refused.id}:${i}`, i, entry: null })) : []),
  ].filter((n) => !hidden.has(n.key) && noteworthy(n))

  const fitTop = () => top && apply(top.edits, { fit: true, replace: true })
  // a spilled edit again, on its own line as before
  const oneLineTop = () => top && apply(top.edits, { replace: true, oneLine: true })

  const layer = ({ size, scale }) => {
    lineEls.current = []
    if (!model) return null
    // Mouse: clicks near a line count as on it: every line gets a target at
    // least 24 px tall (WCAG 2.5.8) without covering its neighbours' own
    // boxes. Finger (or a narrow screen): the closest editable line within
    // 22 px, measured to its box, so dense 6 to 10 px lines can be hit.
    const pointOf = (e) => {
      const r = e.currentTarget.parentElement.getBoundingClientRect()
      return { x: ((e.clientX - r.left) / r.width) * size.width, y: ((e.clientY - r.top) / r.height) * size.height }
    }
    const near = (e) => {
      const p = pointOf(e)
      let best = null
      if (e.nativeEvent?.pointerType === 'touch' || narrow) {
        for (const [i, run] of runs.entries()) {
          if (!run.editable && !inBox(run.bbox, p)) continue
          const d = boxDist(run.bbox, p) * scale
          if (d <= TAP_PX && (!best || d < best.d || (d === best.d && run.editable && !best.run.editable))) best = { run, i, d }
        }
        // the word under the finger's height on that line
        return best && { ...best, p: { x: p.x, y: clamp(p.y, best.run.bbox[1], best.run.bbox[3]) } }
      }
      for (const [i, run] of runs.entries()) {
        const b = run.bbox
        const padY = Math.max(0, (24 / scale - (b[3] - b[1])) / 2)
        const padX = 4 / scale
        if (!inBox([b[0] - padX, b[1] - padY, b[2] + padX, b[3] + padY], p)) continue
        const d = Math.abs((b[1] + b[3]) / 2 - p.y)
        if (!best || d < best.d) best = { run, i, d }
      }
      return best && { ...best, p }
    }
    const editingRuns = editing ? (editing.kind === 'para' ? editing.para.runIds : [editing.run.id]) : []
    // what the bar edits, shown on the page
    const hlBoxes = editing && narrow ? [editing.box] : []
    return (
      <>
        <span
          className="g3-ov et-catch"
          data-g3-control
          aria-hidden="true"
          onClick={(e) => {
            // an empty form field (no text on the page there): say to use Forms
            const p = pointOf(e)
            const field = widgets.find((w) => inBox(w, p)) && !runs.some((r) => inBox(r.bbox, p))
            if (field && !busy) return formHint(widgets.find((w) => inBox(w, p)))
            const hit = near(e)
            if (!hit) return
            if (!hit.run.editable) {
              if (hit.run.why === 'form-field' && !busy) formHint(hit.run.bbox)
              return lineEls.current[hit.i]?.focus()
            }
            if (busy) {
              pendingOpen.current = hit.p
              return
            }
            if (e.detail >= 3) paraOf(hit.run) ? openPara(paraOf(hit.run)) : open(hit.run, null)
            else open(hit.run, wordAt(hit.run, hit.p))
          }}
          onDoubleClick={(e) => {
            const hit = near(e)
            if (hit?.run.editable && !busy) open(hit.run, null)
          }}
        />
        {runs.map((run, i) => {
          const tipId = run.editable ? undefined : `et-tip-${i}`
          return (
            <span
              key={run.id}
              ref={(el) => (lineEls.current[i] = el)}
              className={`g3-ov et-line ${run.editable ? '' : 'is-locked'} ${editingRuns.includes(run.id) ? 'is-editing' : ''}`}
              style={{ left: pct(run.bbox[0], size.width), top: pct(run.bbox[1], size.height), width: pct(run.bbox[2] - run.bbox[0], size.width), height: pct(run.bbox[3] - run.bbox[1], size.height) }}
              role="button"
              tabIndex={0}
              data-g3-control
              data-testid="et-line"
              data-run={run.id}
              data-why={run.why ?? undefined}
              aria-disabled={run.editable ? undefined : 'true'}
              aria-label={run.editable ? `Edit: ${run.text}` : run.text}
              aria-describedby={tipId}
              onClick={(e) => {
                if (!run.editable) return run.why === 'form-field' && !busy && formHint(run.bbox)
                const p = pointOf(e)
                if (busy) {
                  pendingOpen.current = p
                  return
                }
                if (e.detail >= 3) paraOf(run) ? openPara(paraOf(run)) : open(run, null)
                else open(run, wordAt(run, p))
              }}
              onDoubleClick={() => run.editable && !busy && open(run, null)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && run.why === 'form-field' && !busy) {
                  e.preventDefault()
                  formHint(run.bbox)
                } else if ((e.key === 'Enter' || e.key === ' ') && run.editable) {
                  e.preventDefault()
                  focusIdx.current = null
                  // Shift+Enter: the whole paragraph
                  if (e.key === 'Enter' && e.shiftKey && paraOf(run)) openPara(paraOf(run))
                  else open(run, null)
                }
              }}
            >
              {!run.editable && (
                <span className="et-tip" role="tooltip" id={tipId} data-testid="et-tip">
                  {reasonText(run.why)}
                </span>
              )}
            </span>
          )
        })}
        {notes.map((n) => {
          // outside everything the edit changed (old and new text, moved
          // text), so the note never hides the change
          const boxes = [n.box, n.changedBox, n.anchor].filter((x) => Array.isArray(x) && x.length === 4)
          if (!boxes.length) return null
          const b = boxes.reduce((u, x) => [Math.min(u[0], x[0]), Math.min(u[1], x[1]), Math.max(u[2], x[2]), Math.max(u[3], x[3])])
          return (
            <Note key={n.key} n={n} b={b} size={size} scale={scale} className={n.action ? '' : n.refused ? 'is-refused' : n.overflow || squeezed(n) ? 'is-warn' : ''}>
              <span className="et-note-text">{noteText(n, !!n.entry?.fit)}</span>
              {n.action === 'forms' && (
                <button
                  type="button"
                  className="et-note-btn"
                  data-testid="et-open-forms"
                  onClick={() => {
                    location.hash = '#/forms'
                  }}
                >
                  Open Forms
                </button>
              )}
              {n.spill?.lines > 0 && !n.refused && n.entry && !n.paragraphId && (
                <button type="button" className="et-note-btn" data-testid="et-one-line" onClick={oneLineTop} disabled={busy}>
                  Keep on one line
                </button>
              )}
              {n.overflow && !n.refused && n.entry && !n.entry.fit && !n.paragraphId && (
                <button type="button" className="et-note-btn" data-testid="et-fit" onClick={fitTop} disabled={busy}>
                  Fit to width
                </button>
              )}
              <button type="button" className="et-note-x" aria-label="Dismiss note" onClick={() => setHidden((h) => new Set([...h, n.key]))}>
                <Icon name="close" size={12} />
              </button>
            </Note>
          )
        })}
        {hlBoxes.map((b, i) => (
          <span
            key={i}
            ref={i === 0 ? hlRef : undefined}
            className="g3-ov et-hl"
            data-testid="et-hl"
            aria-hidden="true"
            style={{ left: pct(b[0], size.width), top: pct(b[1], size.height), width: pct(b[2] - b[0], size.width), height: pct(b[3] - b[1], size.height) }}
          />
        ))}
        {editing && (
          <InlineEditor
            key={`${editing.kind}:${editing.run.id}:${editing.wordIndex}`}
            ed={editing}
            scale={scale}
            size={size}
            busy={busy}
            bar={narrow}
            onCommit={(value, extra) => commit(editing, value, extra)}
            onCancel={() => {
              const idx = runs.indexOf(editing.run)
              drafts.current.delete(draftKey(editing))
              setEditing(null)
              lineEls.current[idx]?.focus({ preventScroll: true })
            }}
            onLine={() => open(editing.run, null)}
            onPara={editing.kind !== 'para' && paraOf(editing.run) ? () => openPara(paraOf(editing.run)) : null}
            onDirty={setEdDirty}
          />
        )}
        {busy && <span className="g3-ov et-busy" aria-hidden="true" />}
        <span className="sr-only" role="status" aria-live="polite" data-testid="et-live" data-version={s.at} data-apply-ms={timing?.total} data-engine-ms={timing?.engine}>
          {live}
        </span>
      </>
    )
  }

  const banner = !active ? null : error ? (
    <p className="notice notice-warn et-banner">{error}</p>
  ) : scanned ? (
    <div className="et-banner" role="status" data-testid="et-scanned">
      <Icon name="ocr" size={18} />
      <span>Scanned page: run OCR first to edit its text.</span>
      <button
        type="button"
        className="btn btn-small"
        data-testid="et-open-ocr"
        onClick={() => {
          location.hash = '#/ocr'
        }}
      >
        Open OCR
      </button>
    </div>
  ) : model && !editable ? (
    <div className="et-banner" role="status" data-testid="et-none">
      <Icon name="info" size={18} />
      <span>{runs.length ? 'No text on this page can be edited here. Hover a line to see why.' : 'No text on this page. Switch to Add to put new text on it.'}</span>
    </div>
  ) : null

  const dialog = ask && (
    <Dialog
      title="Edit a signed PDF?"
      testId="et-signed"
      onClose={() => setAsk(null)}
      actions={
        <>
          <button type="button" className="btn btn-quiet" onClick={() => setAsk(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="et-signed-ok"
            onClick={() => {
              const a = ask
              signedOk.add(id)
              setAsk(null)
              if (a.para) openPara(a.para)
              else open(a.run, a.word)
            }}
          >
            Edit anyway
          </button>
        </>
      }
    >
      <p>Editing removes the digital signature. The saved file will no longer show it as signed.</p>
    </Dialog>
  )

  return {
    bytes,
    model,
    autoMode,
    busy,
    canUndo: s.at > 0,
    canRedo: s.at < s.stack.length,
    undo,
    redo,
    layer,
    banner,
    dialog,
    onRendered,
    stageRef,
    timing,
    narrow,
    hasParagraphs: paras.length > 0,
    // the toolbar's Paragraph button: switches an open word or line editor
    // (nothing typed yet) to its paragraph
    canParagraph: !!editing && editing.kind !== 'para' && !edDirty && !!paraOf(editing.run) && !busy,
    openParagraph: () => editing && openPara(paraOf(editing.run)),
  }
}

// refusals for letters that can't be read: single words may still be fine
const UNREAD_WHY = new Set(['unreadable', 'no-unicode'])
const readableWords = (lines) => lines.some((r) => r?.editable !== false && r?.words?.some((w) => !UNREADABLE.test(w.text) && !w.covered))
const WORDS_OK = 'You can still click single words that read correctly.'
const XFA_NOTE = "This form also had an XFA copy; it was removed so the old text can't be read from it."

const signedOk = new Set()
let entrySeq = 0

const squeezed = (n) => n.fit != null && n.fit < 0.995
// a stand-in font was used ('mixed': for some words of a paragraph)
const usedFallback = (n) => (n.font === 'fallback' || n.font === 'mixed') && !!n.fallbackName
// a note is worth showing: a refusal, a stand-in font, overflow or squeezing
const noteworthy = (n) => n.refused || n.xfa || usedFallback(n) || n.overflow || squeezed(n) || !!n.spill?.lines

// the XFA note (hybrid form, copy removed) goes once, after the apply that removed it
function noteText(n, byUser = false) {
  const body = noteBody(n, byUser)
  return n.xfa ? [body, XFA_NOTE].filter(Boolean).join('. ') : body
}

function noteBody(n, byUser = false) {
  if (n.action === 'forms') return reasonText('form-field')
  if (n.refused && n.wordsOk) return `Not changed: ${reasonText(n.refused, n.char, !!n.paragraphId)}. ${WORDS_OK}`
  if (n.refused === 'error') return `Not changed: ${n.message}`
  if (n.charWasThere) return `Not changed: this line already has a character no font here can draw again ("${n.char}"). Edit single words around it instead`
  if (n.refused) return `Not changed: ${reasonText(n.refused, n.char, !!n.paragraphId)}`
  const parts = []
  if (n.paragraphId) {
    // paragraph overflow: it took free lines below, or was squeezed; it is
    // never drawn over other text
    if (squeezed(n)) parts.push('Squeezed to fit the room there')
    else if (n.overflow) parts.push('Uses free space below the paragraph')
    if (usedFallback(n)) parts.push(`${n.font === 'mixed' ? 'New words in the closest match' : 'Closest match'}: ${n.fallbackName.split('+').map((x) => x.trim()).join(', ')}`)
    return parts.join('. ')
  }
  // squeezed because it would run into the next column: say why, then what
  const beforeColumn = n.noPush === 'collision' && squeezed(n)
  // a long line went on below it; an emptied line closed up
  const k = n.spill?.lines ?? 0
  if (k > 0) parts.push(`Continued on ${k} new line${k > 1 ? 's' : ''}${n.spill.moved ? '; the lines below moved down' : ''}`)
  if (k < 0) parts.push('The lines below moved up')
  if (n.overflow) parts.push('Runs past the margin or into the next text')
  if (squeezed(n)) parts.push(byUser ? 'Squeezed to the old width' : beforeColumn ? 'Squeezed to fit before the next column' : n.noPush && n.noPush !== 'rtl' && n.noPush !== 'aligned' ? 'Squeezed to fit: the rest of the line could not move' : 'Squeezed to fit before the next column')
  if (n.align === 'centre' && !n.refused && n.fit == null && n.font) parts.push('Kept centred')
  if (n.font === 'fallback' && n.fallbackName) parts.push(`Closest match: ${n.fallbackName}`)
  // a spill keeps the moved words; only new ones may take a stand-in
  if (n.font === 'mixed' && n.fallbackName) parts.push(`New words in the closest match: ${n.fallbackName}`)
  return parts.join('. ')
}

// ---------- options panel part ----------
export function TextPanel({ options: o, setOptions, files }) {
  const count = files.reduce((n, f) => n + textEditCount(o, f.id), 0)
  const signed = files.some((f) => signatureRemovedIn(o, f.id))
  // notes of the last change per file
  const last = files
    .map((f) => entryOf(o, f.id))
    .filter(Boolean)
    .flatMap((e) => e.report.filter((r) => !r.refused && noteworthy(r)).map((r, i) => ({ key: `${e.id}:${i}`, text: noteText(r, e.fit) })))
  return (
    <div className="et-panel" data-testid="et-panel">
      <p className="field-help">
        {o.pageKind === 'scanned'
          ? 'This page is a scan: its text is a picture. Run OCR first to edit it.'
          : PARAGRAPH_EDIT
            ? 'Click a word to change it. Double-click a line, or press Enter on it, to change the whole line. Triple-click, or Shift+Enter, for the whole paragraph. Enter or click away applies, Esc cancels. In a paragraph, Enter starts a new line and Ctrl+Enter applies.'
            : 'Click a word to change it. Double-click a line, or press Enter on it, to change the whole line. Enter or click away applies, Esc cancels.'}
      </p>
      <p className="field-help" data-testid="et-count">
        {count ? `${plural(count, 'text edit')} applied, not saved yet. Run saves the edited PDF.` : 'No text changed yet.'}
      </p>
      {last.length > 0 && (
        <ul className="et-notes" data-testid="et-panel-notes">
          {last.map((n) => (
            <li key={n.key}>Last change: {n.text}</li>
          ))}
        </ul>
      )}
      {signed && <p className="notice notice-warn">The digital signature was removed.</p>}
      {count > 0 && (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => {
              for (const f of files) {
                const s = o.versions?.[f.id]
                if (s) for (const e of s.stack) releasePdf(e.bytes)
                dirty.delete(f.id)
              }
              setOptions((x) => {
                const versions = { ...x.versions }
                for (const f of files) delete versions[f.id]
                return { ...x, versions }
              })
            }}
          >
            Discard text edits
          </button>
        </div>
      )}
    </div>
  )
}
