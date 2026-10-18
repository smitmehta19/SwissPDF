// Redaction that destroys the covered content, not just hides it.
// All boxes are in view space: points from the top-left of the page as it is
// displayed (rotation and CropBox applied), the same space MuPDF uses for its
// page coordinates and pdf.js renders at scale 1.
//
// Two methods:
//   'remove' (default in the app): MuPDF redaction. Text, vector art and image
//            pixels under the boxes are deleted from the file; everything else
//            stays vector and selectable. Each page is checked afterwards: if
//            any character is still inside a box, that page falls back to
//            'image'.
//   'image'  the page becomes a picture with the boxes painted in. Nothing on
//            that page survives as text. Largest, but the bluntest guarantee.
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

// Finds every match on every page (or the listed pages).
// query: { terms: string[], regex: string, patterns: ['email'|'phone'|'card'],
//          caseSensitive, wholeWord, pages: number[] | null }
// Returns [{ pageNum, x, y, w, h, match, source }] in view space.
export async function findMatches(bytes, query = {}, { onPage = null, check = null } = {}) {
  const { terms = [], regex = '', patterns = [], caseSensitive = false, wholeWord = false, pages = null } = query
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
  if (tests.length === 0) return []

  const mupdf = await getMupdf()
  const doc = openMupdf(mupdf, bytes)
  const out = []
  try {
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
          if (!value.trim()) continue
          for (const t of tests) {
            t.re.lastIndex = 0
            const m = [...value.matchAll(t.re)].find((x) => x[0].trim() && (!t.accept || t.accept(x[0])))
            if (!m) continue
            const r = w.getBounds()
            out.push({ pageNum, x: r[0] - bounds[0], y: r[1] - bounds[1], w: r[2] - r[0], h: r[3] - r[1], match: m[0].trim(), source: t.source, field: true })
            break
          }
        }
      } finally {
        page.destroy?.()
      }
    }
  } finally {
    doc.destroy?.()
  }
  return out
}

// Older call shape: literal terms only.
export function findTextBoxes(bytes, terms, { caseSensitive = false, wholeWord = false } = {}) {
  return findMatches(bytes, { terms, caseSensitive, wholeWord })
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

// Form fields, comments and links under a box go too: their values and
// contents are not page content, so the redaction itself would miss them.
function dropAnnotations(page, boxes, bounds) {
  const hit = (r) => boxes.some((b) => r[0] < bounds[0] + b.x + b.w && r[2] > bounds[0] + b.x && r[1] < bounds[1] + b.y + b.h && r[3] > bounds[1] + b.y)
  for (const w of page.getWidgets()) {
    if (!hit(w.getBounds())) continue
    try {
      // clears the field's stored value, not just this widget
      if (w.isText() || w.isChoice()) w.setTextValue('')
    } catch {
      /* value stays empty only on this widget */
    }
    page.deleteAnnotation(w)
  }
  for (const a of page.getAnnotations()) {
    if (a.getType() !== 'Redact' && hit(a.getBounds())) page.deleteAnnotation(a)
  }
}

// MuPDF pass. Returns { bytes, rasterPages } where rasterPages failed the
// leftover check (or MuPDF could not redact them).
async function removeWithMupdf(bytes, byPage, { onPage, check }) {
  const mupdf = await getMupdf()
  const doc = openMupdf(mupdf, bytes)
  const rasterPages = []
  try {
    const n = doc.countPages()
    let k = 0
    for (const [pageNum, list] of byPage) {
      check?.()
      onPage?.(k++, byPage.size)
      if (pageNum < 1 || pageNum > n) continue
      const page = doc.loadPage(pageNum - 1)
      try {
        const bounds = page.getBounds()
        const boxes = list.map((b) => resolve(b, bounds[2] - bounds[0], bounds[3] - bounds[1]))
        dropAnnotations(page, boxes, bounds)
        for (const b of boxes) {
          const annot = page.createAnnotation('Redact')
          annot.setRect([bounds[0] + b.x, bounds[1] + b.y, bounds[0] + b.x + b.w, bounds[1] + b.y + b.h])
        }
        page.applyRedactions(
          true,
          mupdf.PDFPage.REDACT_IMAGE_PIXELS,
          mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
          mupdf.PDFPage.REDACT_TEXT_REMOVE,
        )
        if (leftovers(page, boxes, bounds).length > 0) rasterPages.push(pageNum)
      } catch {
        rasterPages.push(pageNum)
      } finally {
        page.destroy?.()
      }
    }
    // garbage collection drops the old content streams, so the removed text
    // is not left behind as an unreferenced object
    const out = doc.saveToBuffer('garbage=compact,compress,encrypt=none').asUint8Array().slice()
    return { bytes: out, rasterPages }
  } finally {
    doc.destroy?.()
  }
}

// Replaces the listed pages of `target` with pictures of the same pages of
// `source` (original content) with the boxes painted black. Browser only.
async function rasterizePages(target, source, byPage, pageNums, { scale = 2.5, check } = {}) {
  const { openPdfDocument, serializedPdfOp } = await import('./pdfText.js')
  const { loadPdf } = await import('./pdfOps.js')
  const doc = await loadPdf(target)
  await serializedPdfOp(async () => {
    const src = await openPdfDocument(source)
    for (const n of pageNums) {
      check?.()
      const page = await src.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(vp.width)
      canvas.height = Math.ceil(vp.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise
      page.cleanup()
      // the painted boxes are the only copy of what was under them
      ctx.fillStyle = '#000000'
      for (const raw of byPage.get(n) ?? []) {
        const b = resolve(raw, base.width, base.height)
        ctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale)
      }
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
      const png = await doc.embedPng(new Uint8Array(await blob.arrayBuffer()))
      const fresh = doc.insertPage(n - 1, [base.width, base.height])
      fresh.drawImage(png, { x: 0, y: 0, width: base.width, height: base.height })
      doc.removePage(n)
    }
  })
  return doc.save()
}

// boxes: [{ pageNum, x, y, w, h }] in view points, { pageNum, fx, fy, fw, fh }
// in fractions of the visible page, or { pageNum, whole: true }. Returns the bytes; with { report: true } returns
// { bytes, pages, rasterPages }.
export async function redactPdf(bytes, boxes, { method = 'image', onProgress = () => {}, onPage = null, check = null, report = false } = {}) {
  if (!boxes?.length) throw new Error('Mark at least one area to redact first.')
  const byPage = groupByPage(boxes)
  let out
  let rasterPages
  if (method === 'remove') {
    const res = await removeWithMupdf(bytes, byPage, { onPage, check })
    rasterPages = res.rasterPages
    out = rasterPages.length ? await rasterizePages(res.bytes, bytes, byPage, rasterPages, { check }) : res.bytes
  } else {
    rasterPages = [...byPage.keys()].sort((a, b) => a - b)
    onProgress(`redacting ${rasterPages.length} page(s)`)
    out = await rasterizePages(copy(bytes), bytes, byPage, rasterPages, { check })
  }
  return report ? { bytes: out, pages: [...byPage.keys()], rasterPages } : out
}
