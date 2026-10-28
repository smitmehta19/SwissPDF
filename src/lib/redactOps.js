// Redaction that destroys the covered content, not just hides it.
// All boxes are in view space: points from the top-left of the page as it is
// displayed (rotation and CropBox applied), the same space MuPDF uses for its
// page coordinates and pdf.js renders at scale 1.
//
// Two methods:
//   'remove' (default in the app): MuPDF redaction. Text, vector art and image
//            pixels under the boxes are deleted from the file; everything else
//            stays vector and selectable. Each page is checked afterwards: a
//            character or a curved/slanted drawing still under a box, a
//            pattern fill under one, or ActualText that still reads the old
//            text makes that page fall back to 'image'.
//   'image'  the page becomes a picture with the boxes painted in. Nothing on
//            that page survives as text. Largest, but the bluntest guarantee.
//
// Hidden layers are shown while searching and redacting, so their content is
// found and removed too. Both methods also clean what is not page content:
// XFA form data always; deleted comments and fields are unlinked from the
// structure tree, replies and popups; resources the pages no longer draw are
// dropped; with search terms, every string and text stream in the file is
// cleaned of the matches and attachments are dropped. The file is saved with
// garbage collection, so nothing removed stays as a loose object.
//
// Known limit: in 'remove' mode the gap left in a line keeps the width of the
// removed text. For names in running text, 'image' hides even that.
let mupdfPromise = null
const getMupdf = () => (mupdfPromise ??= import('mupdf'))

const copy = (bytes) => new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).slice()

function openMupdf(mupdf, bytes) {
  const doc = mupdf.Document.openDocument(copy(bytes), 'application/pdf')
  const pdf = doc.asPDF()
  if (!pdf) {
    doc.destroy?.()
    throw new Error('Not a PDF file.')
  }
  return pdf
}

// ---------- search ----------

// Built-in patterns. Cards are Luhn-checked so order numbers do not match.
export const PATTERNS = {
  email: { label: 'Email addresses', re: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu },
  phone: {
    label: 'Phone numbers',
    re: /(?<![\p{N}\w+])(?:\+\d{1,3}[ .-]?)?(?:\(\d{1,4}\)[ .-]?)?\d{2,4}(?:[ .-]?\d{2,4}){1,3}(?![\p{N}\w])/gu,
    accept: (m) => {
      const t = m.trim()
      const digits = t.replace(/\D/g, '')
      // a bare run of digits is an id or account number, not a phone number
      if (/^\d{3}[ -]\d{4}$/.test(t)) return true
      return digits.length >= 10 && digits.length <= 15 && /[ .()+-]/.test(t)
    },
  },
  card: {
    label: 'Card numbers',
    re: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
    // card numbers start with 3-6 and have 15, 16 or 19 digits
    accept: (m) => {
      const d = m.replace(/\D/g, '')
      return /^[3-6]/.test(d) && [15, 16, 19].includes(d.length) && luhn(d)
    },
  },
}

function luhn(digits) {
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A typed phrase matches across line breaks, split text items and missing
// spaces: every run of whitespace in it matches any (or no) whitespace.
function phraseRe(term, { caseSensitive, wholeWord }) {
  const body = term
    .trim()
    .split(/\s+/)
    .map(escapeRe)
    .join('\\s*')
  const src = wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body
  return new RegExp(src, `gu${caseSensitive ? '' : 'i'}`)
}

// Page text with a map from each string index to its character (or -1 for
// spaces and line breaks we insert). Characters come with their quads.
function pageText(page) {
  const st = page.toStructuredText('preserve-whitespace')
  const chars = [] // { quad, size }
  let text = ''
  const map = []
  let last = null
  const push = (s, idx) => {
    text += s
    map.push(idx)
  }
  try {
    st.walk({
      beginLine() {
        if (text && !text.endsWith('\n')) push('\n', -1)
        last = null
      },
      onChar(c, origin, font, size, quad) {
        // a visible gap between glyphs with no space glyph reads as a space
        if (last && c !== ' ' && last.c !== ' ') {
          const gap = Math.hypot((quad[0] + quad[4]) / 2 - last.end[0], (quad[1] + quad[5]) / 2 - last.end[1])
          if (gap > size * 0.25) push(' ', -1)
        }
        const idx = chars.length
        chars.push({ quad, size })
        for (const ch of c) push(ch, idx)
        last = { c, end: [(quad[2] + quad[6]) / 2, (quad[3] + quad[7]) / 2] }
      },
    })
  } finally {
    st.destroy?.()
  }
  return { text, map, chars }
}

const quadBox = (q) => {
  const xs = [q[0], q[2], q[4], q[6]]
  const ys = [q[1], q[3], q[5], q[7]]
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// Boxes for one match: one per line it runs over, padded so glyph edges
// (accents, descenders) are covered too.
function matchBoxes(found, start, end, bounds) {
  const boxes = []
  let cur = null
  let lastIdx = -1
  for (let i = start; i < end; i++) {
    const idx = found.map[i]
    if (idx < 0 || idx === lastIdx) continue
    lastIdx = idx
    const ch = found.chars[idx]
    const b = quadBox(ch.quad)
    const pad = Math.max(0.6, ch.size * 0.06)
    const box = [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]
    // same line: vertical overlap with the box being built
    if (cur && box[1] < cur[3] && box[3] > cur[1] && box[0] - cur[2] < ch.size * 1.5) {
      cur[0] = Math.min(cur[0], box[0])
      cur[1] = Math.min(cur[1], box[1])
      cur[2] = Math.max(cur[2], box[2])
      cur[3] = Math.max(cur[3], box[3])
    } else {
      if (cur) boxes.push(cur)
      cur = box
    }
  }
  if (cur) boxes.push(cur)
  // page coordinates may start at a non-zero origin: make them view space
  return boxes.map(([x0, y0, x1, y1]) => ({ x: x0 - bounds[0], y: y0 - bounds[1], w: x1 - x0, h: y1 - y0 }))
}

function buildTests(query) {
  const { terms = [], regex = '', patterns = [], caseSensitive = false, wholeWord = false } = query ?? {}
  const tests = []
  for (const t of terms) if (t && t.trim()) tests.push({ re: phraseRe(t, { caseSensitive, wholeWord }), source: 'text' })
  if (regex && regex.trim()) {
    let re
    try {
      re = new RegExp(regex, `gu${caseSensitive ? '' : 'i'}`)
    } catch (err) {
      throw new Error(`The pattern is not valid: ${err.message}`)
    }
    if (re.test('')) throw new Error('The pattern matches empty text. Make it more specific.')
    tests.push({ re, source: 'regex' })
  }
  for (const p of patterns) if (PATTERNS[p]) tests.push({ ...PATTERNS[p], source: p })
  return tests
}

// First accepted match of any test in `text`, or null.
function firstMatch(tests, text) {
  if (!text || !text.trim()) return null
  for (const t of tests) {
    t.re.lastIndex = 0
    const m = [...text.matchAll(t.re)].find((x) => x[0].trim() && (!t.accept || t.accept(x[0])))
    if (m) return { match: m[0].trim(), source: t.source }
  }
  return null
}

const REDACTED = '[redacted]'
const scrub = (tests, text) => tests.reduce((s, t) => s.replace(t.re, (m) => (m.trim() && (!t.accept || t.accept(m)) ? REDACTED : m)), text)

// Comments carry text outside the page content: the note itself, rich text,
// author and subject, and whatever their appearance draws (FreeText, stamps).
const SKIP_ANNOTS = new Set(['Widget', 'Link', 'Popup', 'Redact'])
function annotText(annot) {
  const obj = annot.getObject()
  const parts = []
  for (const key of ['Contents', 'RC', 'T', 'Subj']) {
    const v = obj.get(key)
    if (v.isString()) parts.push(v.asString())
    else if (v.isStream()) parts.push(new TextDecoder().decode(v.readStream().asUint8Array()))
  }
  try {
    const list = annot.toDisplayList()
    const st = list.toStructuredText('preserve-whitespace')
    parts.push(st.asText())
    st.destroy?.()
    list.destroy?.()
  } catch {
    /* no appearance */
  }
  return parts.join('\n')
}

// Finds every match on every page (or the listed pages): page text, form
// field values and comments.
// query: { terms: string[], regex: string, patterns: ['email'|'phone'|'card'],
//          caseSensitive, wholeWord, pages: number[] | null }
// Returns [{ pageNum, x, y, w, h, match, source, field?, annot? }] in view
// space. annot hits name the comment type; they are deleted, not blacked out.
export async function findMatches(bytes, query = {}, { onPage = null, check = null } = {}) {
  const { pages = null } = query
  const tests = buildTests(query)
  if (tests.length === 0) return []

  const mupdf = await getMupdf()
  const doc = openMupdf(mupdf, bytes)
  const out = []
  try {
    // text in hidden layers is still in the file: search it too
    showAllLayers(doc)
    const n = doc.countPages()
    const list = pages ?? Array.from({ length: n }, (_, i) => i + 1)
    for (const [k, pageNum] of list.entries()) {
      if (pageNum < 1 || pageNum > n) continue
      check?.()
      onPage?.(k, list.length)
      const page = doc.loadPage(pageNum - 1)
      try {
        const bounds = page.getBounds()
        const found = pageText(page)
        for (const t of tests) {
          t.re.lastIndex = 0
          for (const m of found.text.matchAll(t.re)) {
            if (!m[0].trim()) continue
            if (t.accept && !t.accept(m[0])) continue
            for (const box of matchBoxes(found, m.index, m.index + m[0].length, bounds)) {
              out.push({ pageNum, ...box, match: m[0].trim(), source: t.source })
            }
          }
        }
        // filled-in form values are not page text: a match covers the field
        for (const w of page.getWidgets()) {
          let value = ''
          try {
            value = w.getValue() ?? ''
          } catch {
            continue
          }
          const m = firstMatch(tests, value)
          if (!m) continue
          const r = w.getBounds()
          out.push({ pageNum, x: r[0] - bounds[0], y: r[1] - bounds[1], w: r[2] - r[0], h: r[3] - r[1], ...m, field: true })
        }
        for (const a of page.getAnnotations()) {
          const type = a.getType()
          if (SKIP_ANNOTS.has(type)) continue
          const m = firstMatch(tests, annotText(a))
          if (!m) continue
          const r = a.getBounds()
          out.push({ pageNum, x: r[0] - bounds[0], y: r[1] - bounds[1], w: r[2] - r[0], h: r[3] - r[1], ...m, annot: type })
        }
      } finally {
        page.destroy?.()
      }
    }
  } catch (err) {
    throw pageTreeError(err)
  } finally {
    doc.destroy?.()
  }
  return out
}

// Older call shape: literal terms only.
export function findTextBoxes(bytes, terms, { caseSensitive = false, wholeWord = false } = {}) {
  return findMatches(bytes, { terms, caseSensitive, wholeWord })
}

// ---------- content streams ----------

const WS = new Set([0, 9, 10, 12, 13, 32])
const DELIMS = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37])
const latin1 = (b, s, e) => {
  let out = ''
  for (let i = s; i < e; i++) out += String.fromCharCode(b[i])
  return out
}
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/

// Tokens of a content stream: { type, value, start, end } with type num,
// name, str, hex, kw, '[', ']', '<<', '>>' or data (inline image bytes).
function* lex(b) {
  const n = b.length
  let i = 0
  while (i < n) {
    const c = b[i]
    const s = i
    if (WS.has(c)) {
      i++
    } else if (c === 37) {
      while (i < n && b[i] !== 10 && b[i] !== 13) i++
    } else if (c === 47) {
      i++
      while (i < n && !WS.has(b[i]) && !DELIMS.has(b[i])) i++
      yield { type: 'name', value: latin1(b, s + 1, i).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), start: s, end: i }
    } else if (c === 40) {
      let depth = 1
      i++
      while (i < n && depth) {
        if (b[i] === 92) i++
        else if (b[i] === 40) depth++
        else if (b[i] === 41) depth--
        i++
      }
      yield { type: 'str', start: s, end: i }
    } else if (c === 60 && b[i + 1] === 60) {
      i += 2
      yield { type: '<<', start: s, end: i }
    } else if (c === 60) {
      while (i < n && b[i] !== 62) i++
      i++
      yield { type: 'hex', start: s, end: i }
    } else if (c === 62 && b[i + 1] === 62) {
      i += 2
      yield { type: '>>', start: s, end: i }
    } else if (c === 91 || c === 93) {
      i++
      yield { type: c === 91 ? '[' : ']', start: s, end: i }
    } else if (DELIMS.has(c)) {
      i++
    } else {
      while (i < n && !WS.has(b[i]) && !DELIMS.has(b[i])) i++
      const word = latin1(b, s, i)
      if (NUMBER.test(word)) {
        yield { type: 'num', value: +word, start: s, end: i }
        continue
      }
      yield { type: 'kw', value: word, start: s, end: i }
      if (word !== 'ID') continue
      // inline image data runs to the first EI between white space
      const from = ++i
      let j = from
      while (j < n && !(b[j] === 69 && b[j + 1] === 73 && WS.has(b[j - 1]) && (j + 2 >= n || WS.has(b[j + 2]) || DELIMS.has(b[j + 2])))) j++
      yield { type: 'data', start: from, end: j }
      yield { type: 'kw', value: 'EI', start: j, end: Math.min(n, j + 2) }
      i = j + 2
    }
  }
}

// Operators with their operands; arrays and dicts come as { type, items }.
function* contentOps(b) {
  let operands = []
  const open = []
  const push = (x) => (open.length ? open[open.length - 1].items.push(x) : operands.push(x))
  for (const t of lex(b)) {
    if (t.type === '[' || t.type === '<<') open.push({ type: t.type === '[' ? 'array' : 'dict', items: [], start: t.start })
    else if (t.type === ']' || t.type === '>>') {
      const c = open.pop()
      if (c) push({ ...c, end: t.end })
    } else if (t.type === 'kw' && !open.length && !['true', 'false', 'null'].includes(t.value)) {
      yield { op: t.value, operands, end: t.end }
      operands = []
    } else push(t)
  }
}

const streamBytes = (ref) => ref.readStream().asUint8Array()
const asList = (obj) => (obj.isArray() ? Array.from({ length: obj.length }, (_, k) => obj.get(k)) : obj.isNull() ? [] : [obj])
const isName = (obj, name) => obj.isName() && obj.asName() === name

// Resource names a content stream uses, by resource category.
const NAME_OPS = { Do: 'XObject', Tf: 'Font', gs: 'ExtGState', sh: 'Shading', cs: 'ColorSpace', CS: 'ColorSpace', scn: 'Pattern', SCN: 'Pattern' }
function usedNames(bytes, used) {
  const add = (cat, name) => (used.get(cat) ?? used.set(cat, new Set()).get(cat)).add(name)
  for (const { op, operands } of contentOps(bytes)) {
    const cat = NAME_OPS[op]
    if (cat) {
      const name = op === 'Tf' ? operands[0] : operands[operands.length - 1]
      if (name?.type === 'name') add(cat, name.value)
    } else if ((op === 'BDC' || op === 'DP') && operands[1]?.type === 'name') add('Properties', operands[1].value)
    else if (op === 'ID') {
      for (let k = 0; k + 1 < operands.length; k++) {
        if (operands[k].type === 'name' && (operands[k].value === 'CS' || operands[k].value === 'ColorSpace') && operands[k + 1].type === 'name') add('ColorSpace', operands[k + 1].value)
      }
    }
  }
  return used
}

// Marked-content property lists can carry the text itself (ActualText) or a
// description of it (Alt, E): cut those entries out of BDC/DP operators.
const MC_TEXT = new Set(['ActualText', 'Alt', 'E'])
function stripMarkedText(bytes) {
  const cuts = []
  for (const { op, operands } of contentOps(bytes)) {
    if ((op !== 'BDC' && op !== 'DP') || operands[1]?.type !== 'dict') continue
    const items = operands[1].items
    for (let k = 0; k + 1 < items.length; k += 2) {
      if (items[k].type === 'name' && MC_TEXT.has(items[k].value)) cuts.push([items[k].start, items[k + 1].end])
    }
  }
  if (!cuts.length) return null
  const parts = []
  let at = 0
  for (const [s, e] of cuts) {
    parts.push(bytes.subarray(at, s), new Uint8Array([32]))
    at = e
  }
  parts.push(bytes.subarray(at))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

// Strips marked-content texts from the page streams, every Form XObject the
// page draws (nested too) and its /Properties entries.
function stripPageMarkedText(page) {
  const seen = new Set()
  const fix = (ref) => {
    if (!ref.isStream()) return
    const out = stripMarkedText(streamBytes(ref))
    if (out) ref.writeStream(out)
  }
  const walkRes = (res) => {
    if (!res.isDictionary()) return
    const props = res.get('Properties')
    if (props.isDictionary()) props.forEach((v) => MC_TEXT.forEach((k) => v.isDictionary() && v.delete(k)))
    const xobjects = res.get('XObject')
    if (!xobjects.isDictionary()) return
    xobjects.forEach((x) => {
      if (!x.isIndirect() || seen.has(x.asIndirect()) || !isName(x.get('Subtype'), 'Form')) return
      seen.add(x.asIndirect())
      fix(x)
      walkRes(x.get('Resources'))
    })
  }
  const obj = page.getObject()
  for (const s of asList(obj.get('Contents'))) fix(s)
  walkRes(obj.getInheritable('Resources'))
}

// ---------- apply ----------

const inside = (cx, cy, b) => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h

// Characters still inside any box after redaction (should be none).
function leftovers(page, boxes, bounds) {
  const st = page.toStructuredText('preserve-whitespace')
  const left = []
  try {
    st.walk({
      onChar(c, origin, font, size, quad) {
        if (!c.trim()) return
        const b = quadBox(quad)
        const cx = (b[0] + b[2]) / 2 - bounds[0]
        const cy = (b[1] + b[3]) / 2 - bounds[1]
        if (boxes.some((r) => inside(cx, cy, r))) left.push(c)
      },
    })
  } finally {
    st.destroy?.()
  }
  return left
}

// True when the page text still differs with and without ActualText.
function actualTextLeft(page) {
  const read = (opts) => {
    const st = page.toStructuredText(opts)
    try {
      return st.asText()
    } finally {
      st.destroy?.()
    }
  }
  // the option also changes soft hyphens and white space: compare letters
  const norm = (t) => t.replace(/­/g, '-').replace(/\s+/g, '')
  return norm(read('preserve-whitespace')) !== norm(read('preserve-whitespace,ignore-actualtext'))
}

const pt = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const straight = (p, q) => Math.abs(p[0] - q[0]) < 0.01 || Math.abs(p[1] - q[1]) < 0.01
const overlaps = (a, r) => a[0] < r[2] && a[2] > r[0] && a[1] < r[3] && a[3] > r[1]

// Segment p-q runs through rect r (Liang-Barsky clip).
function segHits(p, q, r) {
  let t0 = 0
  let t1 = 1
  const dx = q[0] - p[0]
  const dy = q[1] - p[1]
  for (const [d, dist] of [[-dx, p[0] - r[0]], [dx, r[2] - p[0]], [-dy, p[1] - r[1]], [dy, r[3] - p[1]]]) {
    if (d === 0) {
      if (dist < 0) return false
      continue
    }
    const t = dist / d
    if (d < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
  }
  return true
}

// Point-in-path test for a clip path in page space (curves flattened).
function insidePath(path, ctm, evenOdd) {
  const edges = []
  let start = null
  let last = null
  const to = (q) => {
    if (last) edges.push([last, q])
    last = q
  }
  path.walk({
    moveTo(x, y) {
      if (start && last) edges.push([last, start])
      start = last = pt(ctm, x, y)
    },
    lineTo(x, y) {
      to(pt(ctm, x, y))
    },
    curveTo(x1, y1, x2, y2, x3, y3) {
      const p0 = last ?? pt(ctm, x1, y1)
      const [c1, c2, p3] = [pt(ctm, x1, y1), pt(ctm, x2, y2), pt(ctm, x3, y3)]
      for (let k = 1; k <= 8; k++) {
        const t = k / 8
        const u = 1 - t
        const f = (i) => u * u * u * p0[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * p3[i]
        to([f(0), f(1)])
      }
    },
    closePath() {
      if (start && last) edges.push([last, start])
      last = start
    },
  })
  if (start && last) edges.push([last, start])
  return (x, y) => {
    let wind = 0
    let cross = 0
    for (const [a, b] of edges) {
      if (a[1] <= y !== b[1] <= y && x < a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) {
        cross++
        wind += b[1] > a[1] ? 1 : -1
      }
    }
    return evenOdd ? cross % 2 === 1 : wind !== 0
  }
}

// Drawings that still run through a box: curves or slanted edges (a vector
// signature, text drawn as outlines), pattern fills and shadings. MuPDF keeps a path
// that is only partly under a box, and it never touches images inside a
// tiling pattern. Straight horizontal and vertical edges (cell borders,
// backgrounds, the black boxes themselves) say nothing about what was there.
function shapesUnder(mupdf, page, rects) {
  let found = false
  const check = (path, ctm, grow) => {
    if (found) return
    const rs = rects.map((r) => [r[0] - grow, r[1] - grow, r[2] + grow, r[3] + grow])
    let start = null
    let last = null
    const seg = (q, curved) => {
      if (!found && last && (curved || !straight(last, q)) && rs.some((r) => segHits(last, q, r))) found = true
      last = q
    }
    path.walk({
      moveTo(x, y) {
        start = last = pt(ctm, x, y)
      },
      lineTo(x, y) {
        seg(pt(ctm, x, y), false)
      },
      curveTo(x1, y1, x2, y2, x3, y3) {
        const p0 = last ?? pt(ctm, x1, y1)
        const [c1, c2, p3] = [pt(ctm, x1, y1), pt(ctm, x2, y2), pt(ctm, x3, y3)]
        for (let k = 1; k <= 8; k++) {
          const t = k / 8
          const u = 1 - t
          const f = (i) => u * u * u * p0[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * p3[i]
          seg([f(0), f(1)], true)
        }
      },
      closePath() {
        if (start) seg(start, false)
        last = start
      },
    })
  }
  // Shadings (gradients, gradient meshes) are drawn inside a clip, and MuPDF
  // leaves a clipped one whole: any shading that reaches into a box counts.
  // Sample points in each box against the shading bounds and every clip.
  const clips = []
  let masking = 0
  const samples = rects.flatMap((r) => {
    const out = []
    for (let i = 1; i < 8; i++) for (let j = 1; j < 8; j++) out.push([r[0] + ((r[2] - r[0]) * i) / 8, r[1] + ((r[3] - r[1]) * j) / 8])
    return out
  })
  const shaded = (shade, ctm) => {
    const b = shade.getBounds()
    const box = Number.isFinite(b[0] + b[1] + b[2] + b[3])
      ? (([a, c, d, e]) => [Math.min(a[0], c[0], d[0], e[0]), Math.min(a[1], c[1], d[1], e[1]), Math.max(a[0], c[0], d[0], e[0]), Math.max(a[1], c[1], d[1], e[1])])([pt(ctm, b[0], b[1]), pt(ctm, b[2], b[1]), pt(ctm, b[0], b[3]), pt(ctm, b[2], b[3])])
      : null
    return samples.some(([x, y]) => (!box || (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3])) && clips.every((c) => c(x, y)))
  }
  const dev = new mupdf.Device({
    fillPath(path, evenOdd, ctm, cs) {
      check(path, ctm, -0.25)
      release(path, cs)
    },
    strokePath(path, stroke, ctm, cs) {
      check(path, ctm, 1.5)
      release(path, stroke, cs)
    },
    beginTile(area) {
      if (rects.some((r) => overlaps(area, r))) found = true
      return 0
    },
    fillShade(shade, ctm) {
      borrowed(mupdf, shade)
      if (!masking && !found && shaded(shade, ctm)) found = true
    },
    clipPath(path, evenOdd, ctm) {
      clips.push(insidePath(path, ctm, evenOdd))
      release(path)
    },
    // text, stroke and mask clips: assume they cover everything
    clipStrokePath(path, stroke) {
      release(path, stroke)
      clips.push(() => true)
    },
    clipText(text) {
      release(text)
      clips.push(() => true)
    },
    clipStrokeText(text, stroke) {
      release(text, stroke)
      clips.push(() => true)
    },
    clipImageMask(image) {
      borrowed(mupdf, image)
      clips.push(() => true)
    },
    beginMask() {
      masking++
    },
    endMask() {
      masking--
      clips.push(() => true)
    },
    popClip() {
      clips.pop()
    },
  })
  try {
    page.runPageContents(dev, mupdf.Matrix.identity)
  } finally {
    dev.close()
    dev.destroy?.()
  }
  return found
}

// Boxes may come as view points { x, y, w, h }, fractions of the visible page
// { fx, fy, fw, fh } (drawn in the UI), or { whole: true }.
function resolve(b, W, H) {
  if (b.whole) return { x: 0, y: 0, w: W, h: H }
  if ('fx' in b) return { x: b.fx * W, y: b.fy * H, w: b.fw * W, h: b.fh * H }
  return b
}

function groupByPage(boxes) {
  const byPage = new Map()
  for (const b of boxes) {
    if (!byPage.has(b.pageNum)) byPage.set(b.pageNum, [])
    byPage.get(b.pageNum).push(b)
  }
  return byPage
}

const rectOf = (arr, ctm) => {
  const v = [0, 1, 2, 3].map((k) => arr.get(k).asNumber())
  const a = pt(ctm, v[0], v[1])
  const b = pt(ctm, v[2], v[3])
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
}
// Object numbers reachable from the trailer. Walking every number instead
// makes MuPDF log each free slot, and unreachable objects go on save anyway.
function reachable(doc) {
  const seen = new Set()
  const stack = [doc.getTrailer()]
  while (stack.length) {
    stack.pop().forEach((v) => {
      if (v.isIndirect()) {
        const n = v.asIndirect()
        if (!seen.has(n)) {
          seen.add(n)
          stack.push(v)
        }
      } else if (v.isDictionary() || v.isArray()) stack.push(v)
    })
  }
  return [...seen].sort((a, b) => a - b)
}

// Page object by index, null when a broken page tree (a loop) hides it.
function pageAt(doc, i) {
  try {
    return doc.findPage(i)
  } catch {
    return null
  }
}
const deadNum = (obj) => (obj.isIndirect() ? obj.asIndirect() : null)
// Never call resolve() on objects here: on a document MuPDF has just
// redacted (mupdf.js 1.28) it drops the data of the new image streams.
// Methods on the reference itself resolve safely.

// Link annotations (MuPDF does not list them as annotations), removed from
// the page by object so they can be unlinked everywhere else too.
function dropLinks(page, keep, dead) {
  const annots = page.getObject().get('Annots')
  if (!annots.isArray()) return 0
  const ctm = page.getTransform()
  let n = 0
  for (let i = annots.length - 1; i >= 0; i--) {
    const a = annots.get(i)
    if (!isName(a.get('Subtype'), 'Link') || keep(a, ctm)) continue
    const num = deadNum(a)
    if (num != null) dead.add(num)
    annots.delete(i)
    n++
  }
  return n
}

// Form fields, comments and links under a box go too: their values and
// contents are not page content, so the redaction itself would miss them.
function dropAnnotations(page, boxes, bounds, dead) {
  const rects = boxes.map((b) => [bounds[0] + b.x, bounds[1] + b.y, bounds[0] + b.x + b.w, bounds[1] + b.y + b.h])
  const hit = (r) => rects.some((b) => overlaps(r, b))
  for (const w of page.getWidgets()) {
    if (!hit(w.getBounds())) continue
    try {
      // clears the field's stored value, not just this widget
      if (w.isText() || w.isChoice()) w.setTextValue('')
    } catch {
      /* value stays empty only on this widget */
    }
    // the default and the rich value can hold the same text
    const field = w.getObject()
    for (const f of [field, field.get('Parent')]) if (f.isDictionary()) ['DV', 'RV'].forEach((k) => f.delete(k))
    dead.add(deadNum(w.getObject()))
    page.deleteAnnotation(w)
  }
  for (const a of page.getAnnotations()) {
    if (a.getType() === 'Redact' || !hit(a.getBounds())) continue
    dead.add(deadNum(a.getObject()))
    page.deleteAnnotation(a)
  }
  dropLinks(page, (a, ctm) => !a.get('Rect').isArray() || !hit(rectOf(a.get('Rect'), ctm)), dead)
}

// Inline images (BI ... EI) of one content stream, as byte ranges in order.
function inlineSegments(b) {
  const out = []
  let start = -1
  for (const { op, end } of contentOps(b)) {
    if (op === 'BI') start = end - 2
    else if (op === 'EI' && start >= 0) {
      out.push({ start, end })
      start = -1
    }
  }
  return out
}
const pageContent = (obj) =>
  asList(obj.get('Contents'))
    .filter((r) => r.isStream())
    .map((r) => [r, new Uint8Array(streamBytes(r))])

// The images a content stream draws, in drawing order: 'inline' (BI on the
// page itself), 'other' (an image XObject, or an inline image inside a
// form, which is followed with its own resources). Null when a draw cannot
// be followed for sure (unknown XObject, deep nesting).
function imageEvents(b, res, depth = 0) {
  const out = []
  for (const { op, operands } of contentOps(b)) {
    if (op === 'BI') out.push(depth ? 'other' : 'inline')
    else if (op === 'Do') {
      const name = operands[0]?.type === 'name' ? operands[0].value : null
      const xo = res?.isDictionary() ? res.get('XObject') : null
      const x = name && xo?.isDictionary() ? xo.get(name) : null
      if (!x || !x.isDictionary()) return null
      if (isName(x.get('Subtype'), 'Image')) out.push('other')
      else if (isName(x.get('Subtype'), 'Form')) {
        if (depth > 6 || !x.isStream()) return null
        const r = x.get('Resources')
        const inner = imageEvents(new Uint8Array(streamBytes(x)), r.isDictionary() ? r : res, depth + 1)
        if (!inner) return null
        out.push(...inner)
      } else return null
    }
  }
  return out
}

// Where MuPDF draws each inline image of the page (page space, in order),
// from a device run with the real transforms. The device sees every image
// draw (image XObjects and inline images inside forms too); they are matched
// to the content's image draws by order. Null when the counts differ (a
// pattern or hidden layer, say): no certainty, the caller makes a picture.
function inlinePlacement(mupdf, page) {
  const obj = page.getObject()
  const res = obj.getInheritable('Resources')
  const events = []
  for (const [, b] of pageContent(obj)) {
    const ev = imageEvents(b, res)
    if (!ev) return null
    events.push(...ev)
  }
  if (!events.includes('inline')) return []
  const boxes = []
  const box = (m) => {
    const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]])
    return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]
  }
  const dev = new mupdf.Device({
    fillImage(image, ctm) {
      borrowed(mupdf, image)
      boxes.push(box(ctm))
    },
    fillImageMask(image, ctm, cs) {
      borrowed(mupdf, image)
      boxes.push(box(ctm))
      release(cs)
    },
    clipImageMask(image, ctm) {
      borrowed(mupdf, image)
      boxes.push(box(ctm))
    },
  })
  try {
    page.runPageContents(dev, mupdf.Matrix.identity)
  } finally {
    dev.close()
    dev.destroy?.()
  }
  if (boxes.length !== events.length) return null
  return events.flatMap((e, i) => (e === 'inline' ? [boxes[i]] : []))
}

const hitsAny = (box, rects) => rects.some((r) => box[0] < r[2] && box[2] > r[0] && box[1] < r[3] && box[3] > r[1])

// MuPDF's redaction filter re-writes every inline image of the page and
// breaks some (an abbreviated Indexed colour space /CS [/I /RGB ...] comes
// out as /CS /I true: the image is lost, the stream has syntax errors).
// Puts the original bytes back when no inline image touches a box. False
// (the page becomes a picture) when one does (it must be blanked), when the
// images cannot be placed for sure, when the counts differ, or when a second
// placement run on the restored page puts an inline image under a box.
// placed: inlinePlacement of the original page.
function restoreInline(mupdf, page, before, rects, placed) {
  const orig = before.flatMap(([, b]) => inlineSegments(b).map((x) => b.slice(x.start, x.end)))
  if (!orig.length) return true
  if (!placed || placed.length !== orig.length || placed.some((b) => hitsAny(b, rects))) return false
  const now = pageContent(page.getObject()).map(([r, b]) => ({ r, b, segs: inlineSegments(b) }))
  if (now.reduce((n, x) => n + x.segs.length, 0) !== orig.length) return false
  let k = 0
  for (const x of now) {
    if (!x.segs.length) continue
    const parts = []
    let at = 0
    for (const s of x.segs) {
      parts.push(x.b.subarray(at, s.start), orig[k++])
      at = s.end
    }
    parts.push(x.b.subarray(at))
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let o = 0
    for (const p of parts) {
      out.set(p, o)
      o += p.length
    }
    x.r.writeStream(out)
  }
  // safety net: place them again on the page as it is now
  const again = inlinePlacement(mupdf, page)
  return !!again && again.length === orig.length && !again.some((b) => hitsAny(b, rects))
}

// MuPDF redaction of one page. False when the page is not provably clean:
// a character still inside a box, a drawing still running through one,
// ActualText that still reads differently, or MuPDF failed. That page then
// becomes an image.
function removeOnPage(mupdf, doc, pageNum, list, dead) {
  const page = doc.loadPage(pageNum - 1)
  try {
    const bounds = page.getBounds()
    const boxes = list.map((b) => resolve(b, bounds[2] - bounds[0], bounds[3] - bounds[1]))
    dropAnnotations(page, boxes, bounds, dead)
    const rects = boxes.map((b) => [bounds[0] + b.x, bounds[1] + b.y, bounds[0] + b.x + b.w, bounds[1] + b.y + b.h])
    for (const r of rects) page.createAnnotation('Redact').setRect(r)
    // the page as it was, for the inline images (and to picture it whole)
    const obj = page.getObject()
    const before = pageContent(obj)
    const placed = inlinePlacement(mupdf, page)
    const snapContents = obj.get('Contents')
    const snapResources = obj.get('Resources')
    page.applyRedactions(
      true,
      mupdf.PDFPage.REDACT_IMAGE_PIXELS,
      mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
      mupdf.PDFPage.REDACT_TEXT_REMOVE,
    )
    if (!restoreInline(mupdf, page, before, rects, placed)) {
      // back to the original page so the picture keeps its inline images;
      // the picture paints the boxes and nothing under them survives
      for (const [r, b] of before) r.writeStream(b)
      obj.put('Contents', snapContents)
      if (snapResources.isNull()) obj.delete('Resources')
      else obj.put('Resources', snapResources)
      page.destroy?.()
      return false
    }
    stripPageMarkedText(page)
  } catch {
    page.destroy?.()
    return false
  }
  page.destroy?.()
  // a fresh load sees the rewritten content
  const after = doc.loadPage(pageNum - 1)
  try {
    const bounds = after.getBounds()
    const boxes = list.map((b) => resolve(b, bounds[2] - bounds[0], bounds[3] - bounds[1]))
    const rects = boxes.map((b) => [bounds[0] + b.x, bounds[1] + b.y, bounds[0] + b.x + b.w, bounds[1] + b.y + b.h])
    return leftovers(after, boxes, bounds).length === 0 && !actualTextLeft(after) && !shapesUnder(mupdf, after, rects)
  } catch {
    return false
  } finally {
    after.destroy?.()
  }
}

// mupdf.js 1.28 hands images and shadings to Device callbacks without taking
// a reference, yet frees them when the JS object is collected: a double
// free that corrupts WASM memory later (then "memory access out of bounds").
// Unhook that and use the object only inside the callback.
function borrowed(mupdf, obj) {
  for (const cls of [mupdf.Image, mupdf.Shade]) if (obj instanceof cls) cls._finalizer?.unregister(obj)
}

// Paths, stroke states, colour spaces and text that MuPDF hands to Device
// callbacks are kept references: drop them at once instead of waiting for
// the garbage collector.
function release(...objs) {
  for (const o of objs) o?.destroy?.()
}

// A scan: images cover half the page or more and little visible text is
// drawn on top of them. An OCR layer is invisible (MuPDF ignores it) or sits
// under the scan (the fax). A page number, Bates number or stamp on a scan
// is small; a born-digital page with a full-page background picture has its
// text on top, covering more than 2% of the page. -> { heavy (images cover
// half the page), scan }
function scanFacts(mupdf, page) {
  const b = page.getBounds()
  const pageArea = (b[2] - b[0]) * (b[3] - b[1])
  let area = 0
  let onTop = 0
  const count = (text, ctm) => {
    if (area < 0.5 * pageArea) return
    const r = text.getBounds(null, ctm)
    if (r.every(Number.isFinite)) onTop += Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1])
  }
  const dev = new mupdf.Device({
    fillImage(image, m) {
      borrowed(mupdf, image)
      area += Math.abs(m[0] * m[3] - m[1] * m[2])
    },
    fillText(text, ctm, cs) {
      count(text, ctm)
      release(text, cs)
    },
    strokeText(text, stroke, ctm, cs) {
      count(text, ctm)
      release(text, stroke, cs)
    },
  })
  try {
    page.runPageContents(dev, mupdf.Matrix.identity)
  } finally {
    dev.close()
    dev.destroy?.()
  }
  const heavy = area >= 0.5 * pageArea
  return { heavy, scan: heavy && onTop < 0.02 * pageArea }
}

function pageScanFacts(mupdf, doc, pageNum) {
  const page = doc.loadPage(pageNum - 1)
  try {
    return scanFacts(mupdf, page)
  } finally {
    page.destroy?.()
  }
}

// Stored bytes of the page's image XObjects. Methods on the references only:
// resolve() after a redaction drops new image data on save.
function imageBytes(doc, pageNum) {
  const res = pageAt(doc, pageNum - 1)?.getInheritable('Resources')
  if (!res || !res.isDictionary()) return 0
  const xo = res.get('XObject')
  if (!xo.isDictionary()) return 0
  let n = 0
  xo.forEach((v) => {
    if (!v.isIndirect() || !v.isStream() || !isName(v.get('Subtype'), 'Image')) return
    const raw = v.readRawStream()
    n += raw.getLength()
    raw.destroy?.()
  })
  return n
}

// Paints the boxes (view space) black on a page picture.
function paintBoxes(pix, boxes, bounds, scale) {
  const W = pix.getWidth()
  const H = pix.getHeight()
  const ox = pix.getX()
  const oy = pix.getY()
  const n = pix.getNumberOfComponents() + pix.getAlpha()
  const stride = pix.getStride()
  const clamp = (v, max) => Math.max(0, Math.min(max, v))
  const rects = boxes.map((b) => [
    clamp(Math.floor((bounds[0] + b.x) * scale - ox), W),
    clamp(Math.floor((bounds[1] + b.y) * scale - oy), H),
    clamp(Math.ceil((bounds[0] + b.x + b.w) * scale - ox), W),
    clamp(Math.ceil((bounds[1] + b.y + b.h) * scale - oy), H),
  ])
  // a view on WASM memory: no MuPDF calls between getting and writing it
  const px = pix.getPixels()
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++) px.fill(0, y * stride + x0 * n, y * stride + x1 * n)
  }
}

const num = (v) => String(Math.round(v * 1e6) / 1e6)

// Turns the page into a picture of its content with the boxes painted black.
// The page object stays (bookmarks, links and the structure tree point at
// it), only its content and resources are replaced, so the old content
// streams lose their last reference and are dropped on save. Comments and
// fields outside the boxes stay live on top. `layers` restores the layer
// visibility the file asks for, so hidden layers stay out of the picture.
function rasterizePage(mupdf, doc, pageNum, list, maxScale, dead, layers) {
  const page = doc.loadPage(pageNum - 1)
  try {
    const bounds = page.getBounds()
    const W = bounds[2] - bounds[0]
    const H = bounds[3] - bounds[1]
    // a scanned page is stored as JPEG at 144 dpi: as flat RGB, a long scanned
    // book runs out of memory
    // the memory rule: a page that is mostly picture is stored as JPEG
    const scan = scanFacts(mupdf, page).heavy
    // posters and plans: at most about 25 megapixels per page
    const scale = Math.min(scan ? 2 : maxScale, Math.sqrt(25e6 / Math.max(1, W * H)))
    const boxes = list.map((b) => resolve(b, W, H))
    dropAnnotations(page, boxes, bounds, dead)
    // page content only: comments are not baked into the picture
    layers.show(false)
    let pix
    try {
      pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, false)
    } finally {
      layers.show(true)
    }
    let image = null
    let jpeg = null
    try {
      paintBoxes(pix, boxes, bounds, scale)
      jpeg = scan ? pix.asJPEG(85) : null
      image = new mupdf.Image(jpeg ?? pix)
      const ref = doc.addImage(image)
      const x0 = pix.getX() / scale
      const y0 = pix.getY() / scale
      const w = pix.getWidth() / scale
      const h = pix.getHeight() / scale
      // image square -> page space (y down) -> PDF user space of this page
      const m = mupdf.Matrix.concat([w, 0, 0, -h, x0, y0 + h], mupdf.Matrix.invert(page.getTransform()))
      const xobjects = doc.newDictionary()
      xobjects.put('RedactedPage', ref)
      const resources = doc.newDictionary()
      resources.put('XObject', xobjects)
      const obj = page.getObject()
      obj.put('Resources', resources)
      obj.put('Contents', doc.addStream(new TextEncoder().encode(`q ${m.map(num).join(' ')} cm /RedactedPage Do Q`), doc.newDictionary()))
      obj.delete('StructParents')
    } finally {
      image?.destroy?.()
      jpeg?.destroy?.()
      pix.destroy?.()
    }
  } finally {
    page.destroy?.()
  }
}

// ---------- after the pages ----------

// Every object that still points at a deleted annotation would keep it (and
// its text and appearance) in the file: structure-tree OBJR entries, popups,
// replies (/IRT), field /Kids. Cuts those links until nothing new dies.
function unlinkDead(doc, dead) {
  dead.delete(null)
  if (!dead.size) return
  const dies = (d) =>
    (isName(d.get('Type'), 'OBJR') && d.get('Obj').isIndirect() && dead.has(d.get('Obj').asIndirect())) ||
    (isName(d.get('Subtype'), 'Popup') && d.get('Parent').isIndirect() && dead.has(d.get('Parent').asIndirect()))
  const deadRef = (v) => v.isIndirect() && dead.has(v.asIndirect())
  const cut = (c) => {
    if (c.isArray()) {
      for (let k = c.length - 1; k >= 0; k--) {
        const v = c.get(k)
        if (deadRef(v) || (!v.isIndirect() && v.isDictionary() && dies(v))) c.delete(k)
        else if (!v.isIndirect() && (v.isArray() || v.isDictionary())) cut(v)
      }
    } else {
      const keys = []
      c.forEach((v, key) => keys.push([key, v]))
      for (const [key, v] of keys) {
        if (deadRef(v) || (!v.isIndirect() && v.isDictionary() && dies(v))) c.delete(key)
        else if (!v.isIndirect() && (v.isArray() || v.isDictionary())) cut(v)
      }
    }
  }
  let grew = true
  while (grew) {
    grew = false
    for (const i of reachable(doc)) {
      if (dead.has(i)) continue
      const obj = doc.newIndirect(i)
      if (obj.isDictionary() && dies(obj)) {
        dead.add(i)
        grew = true
      } else if (obj.isDictionary() || obj.isArray()) cut(obj)
    }
  }
}

// Fields whose widgets all went: their /V, /DV and tooltip stay otherwise.
function pruneFields(doc) {
  const af = doc.getTrailer().get('Root').get('AcroForm')
  if (!af.isDictionary()) return
  const prune = (list) => {
    if (!list.isArray()) return
    for (let k = list.length - 1; k >= 0; k--) {
      const f = list.get(k)
      if (!f.isDictionary()) continue
      const kids = f.get('Kids')
      if (kids.isArray()) {
        prune(kids)
        if (kids.length === 0) list.delete(k)
      }
    }
  }
  prune(af.get('Fields'))
}

const PRUNED = new Set(['Font', 'XObject', 'Pattern', 'Shading', 'ExtGState', 'ColorSpace', 'Properties'])

// Resources reachable but no longer drawn (shared by pages, inherited from
// /Pages, or left behind by the redaction) keep the original images and
// forms in the file. Gives each listed page a resource dict holding only
// what its content names, then does the same for the forms and patterns
// it draws.
function pruneResources(doc, pageIndexes) {
  const seen = new Set()
  const collect = (bytes, res, used) => {
    usedNames(bytes, used)
    // a Type3 font without resources of its own draws its glyphs with ours
    const fonts = res.isDictionary() ? res.get('Font') : null
    if (fonts?.isDictionary()) {
      for (const name of [...(used.get('Font') ?? [])]) {
        const f = fonts.get(name)
        const key = `t3|${deadNum(f)}|${deadNum(res)}`
        if (!isName(f.get('Subtype'), 'Type3') || !f.get('Resources').isNull() || seen.has(key)) continue
        seen.add(key)
        f.get('CharProcs').forEach((cp) => cp.isStream() && collect(streamBytes(cp), res, used))
      }
    }
    for (const [cat, key] of [['XObject', 'Form'], ['Pattern', null]]) {
      const dict = res.isDictionary() ? res.get(cat) : null
      if (!dict?.isDictionary()) continue
      for (const name of used.get(cat) ?? []) {
        const x = dict.get(name)
        if (!x.isStream() || (key && !isName(x.get('Subtype'), key))) continue
        if (x.get('Resources').isDictionary()) pruneOwner(x)
        else if (!seen.has(`${deadNum(x)}|${deadNum(res)}`)) {
          // no own resources: its names come from ours
          seen.add(`${deadNum(x)}|${deadNum(res)}`)
          collect(streamBytes(x), res, used)
        }
      }
    }
    return used
  }
  const build = (res, used) => {
    const out = doc.newDictionary()
    res.forEach((v, key) => {
      if (!PRUNED.has(key)) return out.put(key, v)
      if (!v.isDictionary()) return
      const sub = doc.newDictionary()
      let any = false
      for (const name of used.get(key) ?? []) {
        const x = v.get(name)
        if (!x.isNull()) {
          sub.put(name, x)
          any = true
        }
      }
      if (any) out.put(key, sub)
    })
    return out
  }
  const pruneOwner = (x) => {
    const n = deadNum(x)
    if (n == null || seen.has(n)) return
    seen.add(n)
    const res = x.get('Resources')
    x.put('Resources', build(res, collect(streamBytes(x), res, new Map())))
  }
  for (const i of pageIndexes) {
    const obj = pageAt(doc, i)
    if (!obj) continue
    const res = obj.getInheritable('Resources')
    if (!res.isDictionary()) continue
    // an operator may sit in the next part of a split content stream
    const parts = asList(obj.get('Contents')).filter((s) => s.isStream()).map(streamBytes)
    const all = new Uint8Array(parts.reduce((k, p) => k + p.length + 1, 0)).fill(32)
    parts.reduce((at, p) => (all.set(p, at), at + p.length + 1), 0)
    obj.put('Resources', build(res, collect(all, res, new Map())))
  }
}

// Object numbers of a page's resource dicts, to find pages sharing them.
function resourceKeys(obj) {
  const keys = new Set()
  if (obj.get('Resources').isNull()) keys.add('inherited')
  const res = obj.getInheritable('Resources')
  if (res.isIndirect()) keys.add(res.asIndirect())
  if (res.isDictionary()) res.forEach((v) => v.isIndirect() && keys.add(v.asIndirect()))
  return keys
}

// Moves inherited resources down onto every page and off the /Pages nodes
// (left in place when a broken page tree hides some pages).
function flattenResources(doc) {
  for (let i = 0; i < doc.countPages(); i++) {
    const obj = pageAt(doc, i)
    if (!obj) return
    if (obj.get('Resources').isNull()) {
      const res = obj.getInheritable('Resources')
      if (!res.isNull()) obj.put('Resources', res)
    }
  }
  const stack = [doc.getTrailer().get('Root').get('Pages')]
  const seen = new Set()
  while (stack.length) {
    const node = stack.pop()
    if (!node.isDictionary() || !isName(node.get('Type'), 'Pages')) continue
    if (node.isIndirect()) {
      if (seen.has(node.asIndirect())) continue
      seen.add(node.asIndirect())
    }
    node.delete('Resources')
    for (const kid of asList(node.get('Kids'))) stack.push(kid)
  }
}

// Alt texts in the structure tree on hit pages: they may describe what was
// removed. (Matches elsewhere are cleaned with every other string.)
function cleanStructTree(treeRoot, hitRefs) {
  if (!treeRoot.isDictionary() || !hitRefs.size) return 0
  let count = 0
  const seen = new Set()
  const stack = [[treeRoot.get('K'), null]]
  while (stack.length) {
    const [node, pg] = stack.pop()
    if (node.isIndirect()) {
      const n = node.asIndirect()
      if (seen.has(n)) continue
      seen.add(n)
    }
    if (node.isArray()) {
      node.forEach((v) => stack.push([v, pg]))
      continue
    }
    if (!node.isDictionary()) continue
    const own = node.get('Pg')
    const page = own.isIndirect() ? own.asIndirect() : pg
    if (page != null && hitRefs.has(page)) {
      for (const key of MC_TEXT) {
        if (node.get(key).isString()) {
          node.delete(key)
          count++
        }
      }
    }
    const kids = node.get('K')
    if (kids.isArray() || kids.isDictionary()) stack.push([kids, page])
  }
  return count
}

// Every string in the file outside the page content (document properties,
// bookmark titles and actions, names of destinations and scripts, page
// labels, layer names, field values, alt texts...) and the text streams
// (XMP, scripts, rich text): matches are replaced. Returns counts by place.
// Name values chosen by the author: GoTo destinations and appearance states.
const NAME_VALUES = new Set(['D', 'Dest', 'AS'])

function scrubStrings(doc, tests, cleaned, dead) {
  const trailer = doc.getTrailer()
  const infoNum = deadNum(trailer.get('Info'))
  const kindOf = (num, obj) => {
    if (num === infoNum) return 'properties'
    if (obj.isDictionary() && obj.get('Title').isString() && !obj.get('Parent').isNull() && obj.get('Type').isNull()) return 'bookmarks'
    if (obj.isDictionary() && (isName(obj.get('Type'), 'StructElem') || (!obj.get('S').isNull() && !obj.get('P').isNull() && obj.get('Type').isNull()))) return 'altTexts'
    return 'other'
  }
  const fixStream = (ref) => {
    if (!ref.isStream()) return false
    const text = new TextDecoder().decode(streamBytes(ref))
    if (!firstMatch(tests, text)) return false
    ref.writeStream(new TextEncoder().encode(scrub(tests, text)))
    return true
  }
  const walk = (c, onHit) => {
    const fix = (v, set) => {
      if (v.isString()) {
        const s = v.asString()
        if (firstMatch(tests, s)) {
          set(doc.newString(scrub(tests, s)))
          onHit()
        }
      } else if (!v.isIndirect() && (v.isArray() || v.isDictionary())) walk(v, onHit)
    }
    if (c.isArray()) {
      for (let k = 0; k < c.length; k++) fix(c.get(k), (x) => c.put(k, x))
    } else {
      const entries = []
      c.forEach((v, key) => entries.push([key, v]))
      for (const [key, v] of entries) {
        if ((key === 'JS' || key === 'RC') && v.isStream()) {
          if (fixStream(v)) onHit()
        } else if (NAME_VALUES.has(key) && v.isName() && firstMatch(tests, v.asName())) {
          c.put(key, doc.newName(scrubName(v.asName())))
          onHit()
        } else {
          // keys that are names chosen by the author: destinations (old-style
          // catalog /Dests) and appearance states
          if ((key === 'Dests' || key === 'AP') && v.isDictionary()) {
            for (const d of key === 'AP' ? ['N', 'D', 'R'].map((k) => v.get(k)) : [v]) if (d.isDictionary() && !d.isStream()) renameKeys(d, onHit)
          }
          fix(v, (x) => c.put(key, x))
        }
      }
    }
  }
  // a name cannot hold brackets or spaces
  const scrubName = (n) => scrub(tests, n).split(REDACTED).join('redacted')
  const renameKeys = (d, onHit) => {
    const keys = []
    d.forEach((v, key) => firstMatch(tests, key) && keys.push([key, v]))
    for (const [key, v] of keys) {
      d.delete(key)
      d.put(scrubName(key), v)
      onHit()
    }
  }
  for (const i of reachable(doc)) {
    // deleted comments go with the garbage collection
    if (dead.has(i)) continue
    const obj = doc.newIndirect(i)
    const ref = obj
    if (ref.isStream() && isName(obj.get('Type'), 'Metadata')) {
      if (fixStream(ref)) cleaned.xmp = true
      continue
    }
    if (!obj.isDictionary() && !obj.isArray()) {
      if (obj.isString() && firstMatch(tests, obj.asString())) {
        ref.writeObject(doc.newString(scrub(tests, obj.asString())))
        cleaned.other++
      }
      continue
    }
    const kind = kindOf(i, obj)
    walk(obj, () => cleaned[kind]++)
  }
}

// XFA always goes (it keeps its own copy of every filled value). Hit pages
// lose their thumbnail, app data, XMP and alt texts, which show or describe
// the old page. With search terms: matching comments and links go, every
// attachment goes (its content cannot be searched reliably), and matches
// are replaced in every string and text stream left in the file.
function cleanDocument(doc, tests, hitPages, dead, check) {
  const cleaned = { xfa: false, xfaMatch: false, properties: 0, xmp: false, bookmarks: 0, comments: 0, links: 0, attachments: 0, altTexts: 0, other: 0 }
  const trailer = doc.getTrailer()
  const root = trailer.get('Root')
  const af = root.get('AcroForm')
  if (af.isDictionary() && !af.get('XFA').isNull()) {
    // Acrobat shows the XFA values: tell the user when the search hit them
    for (const part of asList(af.get('XFA'))) {
      if (part.isStream() && firstMatch(tests, new TextDecoder().decode(streamBytes(part)))) cleaned.xfaMatch = true
    }
    af.delete('XFA')
    cleaned.xfa = true
  }
  if (!root.get('NeedsRendering').isNull()) root.delete('NeedsRendering')

  const hitRefs = new Set()
  for (const n of hitPages) {
    const obj = pageAt(doc, n - 1)
    if (!obj) continue
    for (const key of ['Thumb', 'PieceInfo', 'Metadata']) obj.delete(key)
    if (obj.isIndirect()) hitRefs.add(obj.asIndirect())
  }
  cleaned.altTexts = cleanStructTree(root.get('StructTreeRoot'), hitRefs)
  if (!tests.length) return cleaned

  const files = Object.keys(doc.getEmbeddedFiles())
  for (const name of files) doc.deleteEmbeddedFile(name)
  cleaned.attachments = files.length

  for (let i = 0; i < doc.countPages(); i++) {
    check?.()
    const page = doc.loadPage(i)
    try {
      for (const a of page.getAnnotations()) {
        const type = a.getType()
        const hit = type === 'FileAttachment' || (!SKIP_ANNOTS.has(type) && firstMatch(tests, annotText(a)))
        if (!hit) continue
        dead.add(deadNum(a.getObject()))
        page.deleteAnnotation(a)
        cleaned[type === 'FileAttachment' ? 'attachments' : 'comments']++
      }
      cleaned.links += dropLinks(
        page,
        (a) => {
          const uri = a.get('A').isDictionary() ? a.get('A').get('URI') : a.get('A')
          return !(uri.isString() && firstMatch(tests, uri.asString()))
        },
        dead,
      )
    } finally {
      page.destroy?.()
    }
  }
  // associated files hang off the catalog, pages, annotations and more
  for (const i of reachable(doc)) {
    const obj = doc.newIndirect(i)
    if (obj.isDictionary() && !obj.get('AF').isNull()) {
      cleaned.attachments += Math.max(1, asList(obj.get('AF')).length)
      obj.delete('AF')
    }
  }
  return cleaned
}

// Exact text of every search hit, so the cleaning finds the same strings
// even when the caller passes only boxes.
function matchTests(boxes) {
  const seen = new Set((boxes ?? []).map((b) => b.match).filter((m) => m && m.trim()))
  return [...seen].map((m) => ({ re: phraseRe(m, {}), source: 'text' }))
}

// Hidden content: shown while searching, redacting and checking (so it is
// found and removed too), hidden again for pictures of a page and on save.
// Layers that are off are switched on; membership dicts (OCMD) that hide
// content by policy (/P AllOff, AnyOff, a /VE expression) are made to show
// it while any layer is on.
function showAllLayers(doc) {
  const n = doc.countLayers()
  const was = Array.from({ length: n }, (_, i) => doc.isLayerVisible(i))
  const ocmds = []
  const hasOC = !doc.getTrailer().get('Root').get('OCProperties').isNull()
  if (hasOC) {
    const seen = new Set()
    const stack = [doc.getTrailer()]
    while (stack.length) {
      stack.pop().forEach((v) => {
        if (v.isIndirect()) {
          if (seen.has(v.asIndirect())) return
          seen.add(v.asIndirect())
        }
        if (v.isDictionary() && isName(v.get('Type'), 'OCMD')) ocmds.push([v, v.get('P'), v.get('VE')])
        if (v.isDictionary() || v.isArray()) stack.push(v)
      })
    }
  }
  const show = (all) => {
    was.forEach((v, i) => !v && doc.setLayerVisible(i, all))
    for (const [d, P, VE] of ocmds) {
      if (all) {
        d.put('P', doc.newName('AnyOn'))
        d.delete('VE')
      } else {
        if (P.isNull()) d.delete('P')
        else d.put('P', P)
        if (!VE.isNull()) d.put('VE', VE)
      }
    }
  }
  show(true)
  return { show }
}

// boxes: [{ pageNum, x, y, w, h }] in view points, { pageNum, fx, fy, fw, fh }
// in fractions of the visible page, or { pageNum, whole: true }. Boxes from
// findMatches with `annot` are comments: deleted, not blacked out.
// query (optional): the search, for cleaning text outside the pages even when
// no page matched. Returns the bytes; with { report: true } returns
// { bytes, pages, rasterPages, cleaned }.
export async function redactPdf(bytes, boxes, { method = 'image', query = null, scale = 2.5, onProgress = () => {}, onPage = null, check = null, report = false } = {}) {
  const tests = [...buildTests(query), ...matchTests(boxes)]
  if (!boxes?.length && !tests.length) throw new Error('Mark at least one area to redact first.')
  const byPage = groupByPage((boxes ?? []).filter((b) => !b.annot))
  const mupdf = await getMupdf()
  const doc = openMupdf(mupdf, bytes)
  const dead = new Set()
  try {
    const n = doc.countPages()
    const pages = [...byPage.keys()].filter((p) => p >= 1 && p <= n).sort((a, b) => a - b)
    const layers = showAllLayers(doc)
    // pages sharing resources with a hit page get theirs pruned afterwards
    const keysAt = (i) => {
      const obj = pageAt(doc, i)
      return obj ? [...resourceKeys(obj)] : []
    }
    const shared = new Set(pages.flatMap((p) => keysAt(p - 1)))
    const prune = new Set(pages.map((p) => p - 1))
    for (let i = 0; i < n; i++) if (keysAt(i).some((k) => shared.has(k))) prune.add(i)

    const rasterPages = []
    if (method !== 'remove') onProgress(`redacting ${pages.length} page(s)`)
    for (const [k, pageNum] of pages.entries()) {
      check?.()
      onPage?.(k, pages.length)
      const list = byPage.get(pageNum)
      try {
        // a scanned page goes straight to a (JPEG) picture: MuPDF would store
        // the blanked scan as a full-size flat image, and long books run out
        // of memory
        if (method === 'remove') {
          const facts = pageScanFacts(mupdf, doc, pageNum)
          const before = facts.heavy ? imageBytes(doc, pageNum) : 0
          // a mostly-picture page with text on top (watermark, stamp) whose
          // pictures grew past 2x when blanked goes on to the JPEG picture
          if (!facts.scan && removeOnPage(mupdf, doc, pageNum, list, dead) && (!facts.heavy || imageBytes(doc, pageNum) <= 2 * before + 65536)) continue
        }
        rasterizePage(mupdf, doc, pageNum, list, scale, dead, layers)
        rasterPages.push(pageNum)
        // decoded page images are cached: let go of them between pictures
        mupdf.emptyStore()
      } catch (err) {
        // fail closed, with a message that says what to do
        if (/malloc|memory|decode/i.test(err.message)) {
          throw new Error(`Ran out of memory after ${k} of ${pages.length} pages to redact. Split the file into smaller parts, redact each, then merge them.`)
        }
        throw err
      }
    }
    const cleaned = cleanDocument(doc, tests, pages, dead, check)
    unlinkDead(doc, dead)
    pruneFields(doc)
    if (pages.length) {
      flattenResources(doc)
      pruneResources(doc, [...prune])
    }
    if (tests.length) scrubStrings(doc, tests, cleaned, dead)
    layers.show(false)
    // garbage collection drops the old content streams, the XFA and all else
    // unlinked above, so none of it stays behind as an unreferenced object
    const buf = doc.saveToBuffer('garbage=compact,compress,objstms,encrypt=none')
    const out = buf.asUint8Array().slice()
    buf.destroy?.()
    return report ? { bytes: out, pages, rasterPages, cleaned } : out
  } catch (err) {
    throw pageTreeError(err)
  } finally {
    doc.destroy?.()
    // fonts and images this file left in MuPDF's cache
    mupdf.emptyStore()
  }
}

// A page list that loops back on itself: fail with a message that helps.
function pageTreeError(err) {
  return /cycle in page tree/i.test(err?.message ?? '') ? new Error("This PDF's page list is damaged. Run Repair first, then redact.") : err
}
