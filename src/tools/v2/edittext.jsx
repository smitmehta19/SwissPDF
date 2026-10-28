// Edit PDF > Edit text: change text that is already on the page.
// The engine (lib/editTextOps.js, worker ops editTextModel / editText) reads
// the page as lines and words in view space and rewrites one word or line at
// a time. Each apply makes a new byte version of the file; the versions live
// in the tool options (options.versions[fileId] = { stack, at }) so undo/redo,
// summary() and run() all see them.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { callOp } from '../../app/jobs.js'
import { Dialog } from '../../app/controls.jsx'
import { getBytes, getRecord } from '../../app/fileStore.js'
import Icon from '../../components/Icon.jsx'
import { releasePdf } from '../../lib/pdfText.js'
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
  return s.stack.slice(0, s.at).reduce((n, e) => n + e.report.filter((r) => !r.refused).length, 0)
}
export const signatureRemovedIn = (o, id) => {
  const s = o.versions?.[id]
  return !!s && s.stack.slice(0, s.at).some((e) => e.signatureRemoved)
}
export const fallbackFontsIn = (o, id) => {
  const s = o.versions?.[id]
  if (!s) return []
  return [...new Set(s.stack.slice(0, s.at).flatMap((e) => e.report.filter((r) => !r.refused && r.font === 'fallback' && r.fallbackName).map((r) => r.fallbackName)))]
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

// ---------- page text model ----------
// per bytes buffer, per page: run ids only hold for the bytes they came from
const models = new WeakMap()
function modelOf(bytes, page) {
  let m = models.get(bytes)
  if (!m) models.set(bytes, (m = new Map()))
  if (!m.has(page)) {
    const p = callOp('editTextModel', [bytes, page])
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
  'tight-lines': 'The lines here are too close to change this safely',
  'inline-image': 'This page has an embedded image this edit would damage, so it is left as it is',
  unreadable: "This text can't be read as letters, so it can't be edited",
}
export const reasonText = (why, char) => (why === 'unsupported-char' ? `No font here has the character "${char ?? '?'}"` : WHY[why] ?? "This text can't be edited")

// Text the file has no letter mapping for (MuPDF gives U+FFFD, controls or
// private-use characters): it would show as garbage in the editor.
const UNREADABLE = /[�\u0000-\u0008\u000e-\u001f\u007f-\u009f-]/u
// Characters no bundled font has: caught before a round trip to the engine.
// (emoji drawn as pictures; text symbols such as the copyright sign are fine)
const NO_FONT = /\p{Emoji_Presentation}/u
const NON_LATIN = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u
const isPhone = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 760)

// ---------- geometry (points, view space) ----------
const inBox = (b, p, pad = 0) => p.x >= b[0] - pad && p.x <= b[2] + pad && p.y >= b[1] - pad && p.y <= b[3] + pad
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

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
    size: s,
  }
}

const overlaps = (a, b) => a && b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]

// The same word or line in a fresh page model (ids can move after an edit).
function remap(model, e) {
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
function InlineEditor({ ed, scale, size, busy, onCommit, onCancel, onLine }) {
  const ref = useRef(null)
  const done = useRef(false)
  const [value, setValue] = useState(ed.text)
  useEffect(() => {
    const el = ref.current
    el?.focus({ preventScroll: true })
    el?.select()
  }, [])
  // removed without Enter, Esc or a click away (page change): nothing applies
  // (StrictMode mounts twice, so the flag is reset on mount)
  useLayoutEffect(() => {
    done.current = false
    return () => {
      done.current = true
    }
  }, [])
  const [problem, setProblem] = useState(null)
  const g = ed.geom
  const run = ed.run
  const family = familyOf(run.fontName, NON_LATIN.test(ed.text) ? 'other' : run.script)
  // phones: at least 16 px, or iOS zooms the page when the input gets focus
  const textPx = g.size * scale
  const fontPx = isPhone() ? Math.max(16, textPx) : textPx
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
  return (
    <div className="g3-ov et-anchor" style={{ left: pct(g.x, size.width), top: pct(g.y, size.height), transform: `rotate(${g.angle}deg)` }} data-g3-control>
      <input
        ref={ref}
        className="et-input"
        data-testid="et-input"
        dir="auto"
        spellCheck={false}
        autoComplete="off"
        aria-label={ed.wordIndex == null ? 'Edit line' : 'Edit word'}
        value={value}
        disabled={busy}
        aria-invalid={problem ? 'true' : undefined}
        aria-describedby={problem ? 'et-input-error' : undefined}
        style={{
          left: `calc(var(--pt) * ${g.start})`,
          top: `calc(var(--pt) * ${-g.hi * grow})`,
          height: `calc(var(--pt) * ${(g.hi - g.lo) * grow})`,
          width: `${widthPx}px`,
          fontSize: `${fontPx}px`,
          fontFamily: family,
          fontWeight: run.bold ? 700 : 400,
          fontStyle: run.italic ? 'italic' : 'normal',
          color: colorOf(run.color),
        }}
        onChange={(e) => {
          setValue(e.target.value)
          if (problem && !NO_FONT.test(e.target.value)) setProblem(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
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
        onBlur={() => finish('commit', { blur: true })}
        onDoubleClick={(e) => {
          // a double click on a word that is not changed yet edits the whole line
          if (ed.wordIndex == null || value !== ed.text) return
          e.preventDefault()
          done.current = true
          onLine()
        }}
      />
      {problem && (
        <span className="et-input-error" id="et-input-error" role="alert" data-testid="et-input-error" style={{ left: `calc(var(--pt) * ${g.start})`, top: `calc(var(--pt) * ${-g.lo * grow} + 6px)` }}>
          {problem}
        </span>
      )}
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
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState(null) // { bytes, page, notes } of an apply that changed nothing
  const [hidden, setHidden] = useState(() => new Set()) // dismissed notes
  const [ask, setAsk] = useState(null) // signed file: the activation waiting for a yes
  const [timing, setTiming] = useState(null) // { engine, total } ms of the last apply
  const [live, setLive] = useState('')
  const pendingRender = useRef(null)
  const pendingOpen = useRef(null) // a click that came while an apply ran
  const focusIdx = useRef(null)
  const lineEls = useRef([])
  const stageRef = useRef(null)

  const runs = model ? readingOrder(model.runs) : []
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

  // keyboard focus survives the re-read after an apply
  useEffect(() => {
    if (!model || focusIdx.current == null || editing) return
    const el = lineEls.current[Math.min(focusIdx.current, runs.length - 1)]
    focusIdx.current = null
    el?.focus({ preventScroll: false })
  }, [model]) // eslint-disable-line react-hooks/exhaustive-deps

  // a click made while the last apply ran opens once the page is re-read
  useEffect(() => {
    if (!model || !pendingOpen.current) return
    const p = pendingOpen.current
    pendingOpen.current = null
    const run = runs.find((r) => r.editable && inBox(r.bbox, p, 0.5))
    if (run) open(run, p.line ? null : wordAt(run, p))
  }, [model]) // eslint-disable-line react-hooks/exhaustive-deps

  const setStack = (fid, fn) =>
    setOptions((x) => {
      const cur = x.versions?.[fid] ?? { stack: [], at: 0 }
      const next = fn(cur)
      if (next.at > 0) dirty.add(fid)
      else dirty.delete(fid)
      return { ...x, versions: { ...x.versions, [fid]: next } }
    })

  const stackNow = () => oRef.current.versions?.[id] ?? { stack: [], at: 0 }

  async function apply(edits, { fit = false, replace = false } = {}) {
    const s = stackNow()
    const top = s.at > 0 ? s.stack[s.at - 1] : null
    const parent = replace ? top.parentBytes : (top?.bytes ?? file.bytes ?? (await getBytes(id)))
    setBusy(true)
    setRefused(null)
    setLive('Applying')
    const t0 = performance.now()
    try {
      const send = (list) => callOp('editText', [parent, list.map(({ anchor, ...e }) => e), { fit }])
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
      const notes = res.report.map((r, i) => ({ ...r, anchor: edits[i].anchor }))
      if (!notes.some((r) => !r.refused)) {
        setRefused({ id: ++entrySeq, bytes: parent, page, notes })
        setLive(`Not changed: ${reasonText(notes[0].refused, notes[0].char)}`)
        return
      }
      const entry = { id: ++entrySeq, bytes: res.bytes, parentBytes: parent, edits, report: notes, page, fit, signatureRemoved: !!res.signatureRemoved, ms: engine }
      // versions dropped from the redo tail are released from pdf.js
      const dropped = replace ? s.stack.slice(s.at - 1) : s.stack.slice(s.at)
      for (const e of dropped) if (e.bytes !== parent) releasePdf(e.bytes)
      pendingRender.current = { bytes: res.bytes, t0, engine }
      setStack(id, (cur) => {
        const keep = cur.stack.slice(0, replace ? cur.at - 1 : cur.at)
        return { stack: [...keep, entry], at: keep.length + 1 }
      })
      setLive(res.signatureRemoved ? 'Edit applied. The digital signature was removed.' : 'Edit applied')
    } catch (err) {
      if (!err.cancelled) setRefused({ id: ++entrySeq, bytes: parent, page, notes: [{ refused: 'error', message: err.message, anchor: edits[0]?.anchor }] })
    } finally {
      setBusy(false)
    }
  }

  const onRendered = (src) => {
    const p = pendingRender.current
    if (!p || src !== p.bytes) return
    pendingRender.current = null
    setTiming({ engine: Math.round(p.engine ?? 0), total: Math.round(performance.now() - p.t0) })
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
    if (UNREADABLE.test(word ? word.text : run.text)) {
      setRefused({ id: ++entrySeq, bytes, page, notes: [{ refused: 'unreadable', anchor: box }] })
      setLive(`Not changed: ${reasonText('unreadable')}`)
      return
    }
    setEditing({ run, wordIndex: word ? word.i : null, text: word ? word.text : run.text, box, geom: lineGeom(run, box) })
  }

  const commit = (ed, value, extra) => {
    setEditing(null)
    const idx = runs.indexOf(ed.run)
    if (extra?.tab != null) {
      focusIdx.current = clamp(idx + extra.tab, 0, runs.length - 1)
      if (value === ed.text) {
        lineEls.current[focusIdx.current]?.focus()
        focusIdx.current = null
      }
    }
    if (value === ed.text) return
    apply([{ pageNum: page, runId: ed.run.id, wordIndex: ed.wordIndex, text: value, old: ed.text, anchor: ed.box }])
  }

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
    ...(top && top.page === page ? top.report.map((r, i) => ({ ...r, key: `${top.id}:${i}`, i, entry: top })) : []),
    ...(refused && refused.page === page && refused.bytes === (bytes ?? refused.bytes) ? refused.notes.map((r, i) => ({ ...r, key: `${refused.id}:${i}`, i, entry: null })) : []),
  ].filter((n) => !hidden.has(n.key) && noteworthy(n))

  const fitTop = () => top && apply(top.edits, { fit: true, replace: true })

  const layer = ({ size, scale }) => {
    lineEls.current = []
    if (!model) return null
    // taps near a line count as on it: every line gets a target at least
    // 24 px tall (WCAG 2.5.8) without covering its neighbours' own boxes
    const near = (e) => {
      const r = e.currentTarget.parentElement.getBoundingClientRect()
      const p = { x: ((e.clientX - r.left) / r.width) * size.width, y: ((e.clientY - r.top) / r.height) * size.height }
      let best = null
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
    return (
      <>
        <span
          className="g3-ov et-catch"
          data-g3-control
          aria-hidden="true"
          onClick={(e) => {
            const hit = near(e)
            if (!hit) return
            if (!hit.run.editable) return lineEls.current[hit.i]?.focus()
            if (busy) {
              pendingOpen.current = hit.p
              return
            }
            open(hit.run, wordAt(hit.run, hit.p))
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
              className={`g3-ov et-line ${run.editable ? '' : 'is-locked'} ${editing?.run === run ? 'is-editing' : ''}`}
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
                if (!run.editable) return
                const r = e.currentTarget.parentElement.getBoundingClientRect()
                const p = { x: ((e.clientX - r.left) / r.width) * size.width, y: ((e.clientY - r.top) / r.height) * size.height }
                if (busy) {
                  pendingOpen.current = p
                  return
                }
                open(run, wordAt(run, p))
              }}
              onDoubleClick={() => run.editable && !busy && open(run, null)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && run.editable) {
                  e.preventDefault()
                  focusIdx.current = null
                  open(run, null)
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
          const b = n.box ?? n.changedBox ?? n.anchor
          if (!b) return null
          return (
            <div key={n.key} className={`g3-ov et-note ${n.refused ? 'is-refused' : n.overflow || squeezed(n) ? 'is-warn' : ''}`} style={{ left: pct(b[0], size.width), top: `calc(${pct(b[3], size.height)} + 4px)` }} data-g3-control data-testid="et-note">
              <span className="et-note-text">{noteText(n, !!n.entry?.fit)}</span>
              {n.overflow && !n.refused && n.entry && !n.entry.fit && (
                <button type="button" className="et-note-btn" data-testid="et-fit" onClick={fitTop} disabled={busy}>
                  Fit to width
                </button>
              )}
              <button type="button" className="et-note-x" aria-label="Dismiss note" onClick={() => setHidden((h) => new Set([...h, n.key]))}>
                <Icon name="close" size={12} />
              </button>
            </div>
          )
        })}
        {editing && (
          <InlineEditor
            key={`${editing.run.id}:${editing.wordIndex}`}
            ed={editing}
            scale={scale}
            size={size}
            busy={busy}
            onCommit={(value, extra) => commit(editing, value, extra)}
            onCancel={() => {
              const idx = runs.indexOf(editing.run)
              setEditing(null)
              lineEls.current[idx]?.focus({ preventScroll: true })
            }}
            onLine={() => open(editing.run, null)}
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
              open(a.run, a.word)
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
  }
}

const signedOk = new Set()
let entrySeq = 0

const squeezed = (n) => n.fit != null && n.fit < 0.995
// a note is worth showing: a refusal, a stand-in font, overflow or squeezing
const noteworthy = (n) => n.refused || (n.font === 'fallback' && n.fallbackName) || n.overflow || squeezed(n)

function noteText(n, byUser = false) {
  if (n.refused === 'error') return `Not changed: ${n.message}`
  if (n.refused) return `Not changed: ${reasonText(n.refused, n.char)}`
  const parts = []
  // squeezed because it would run into the next column: say why, then what
  const beforeColumn = n.noPush === 'collision' && squeezed(n)
  if (n.overflow) parts.push('Runs past the margin or into the next text')
  if (squeezed(n)) parts.push(byUser ? 'Squeezed to the old width' : beforeColumn ? 'Squeezed to fit before the next column' : n.noPush && n.noPush !== 'rtl' && n.noPush !== 'aligned' ? 'Squeezed to fit: the rest of the line could not move' : 'Squeezed to fit before the next column')
  if (n.align === 'centre' && !n.refused && n.fit == null && n.font) parts.push('Kept centred')
  if (n.font === 'fallback' && n.fallbackName) parts.push(`Closest match: ${n.fallbackName}`)
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
