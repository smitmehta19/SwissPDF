// Node-side checks on tool outputs: every PDF is reopened in pdf.js (legacy
// build, with cmaps + standard fonts) AND MuPDF, independent of the app code.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import * as mupdf from 'mupdf'
import JSZip from 'jszip'
import { join } from 'node:path'
import { ROOT } from './server.mjs'

const PDFJS_DIR = join(ROOT, 'node_modules', 'pdfjs-dist').replace(/\\/g, '/')
const PDFJS_OPTS = {
  cMapUrl: `${PDFJS_DIR}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${PDFJS_DIR}/standard_fonts/`,
  wasmUrl: `${PDFJS_DIR}/wasm/`,
  iccUrl: `${PDFJS_DIR}/iccs/`,
  verbosity: 0,
  isEvalSupported: false,
  disableFontFace: true,
}

async function openPdfjs(bytes, password) {
  const task = pdfjs.getDocument({ ...PDFJS_OPTS, data: new Uint8Array(bytes), password })
  return task.promise
}

// pdf.js mixes up documents processed concurrently on its fake worker in
// Node, so every pdf.js use goes through one queue.
let chain = Promise.resolve()
function serial(fn) {
  const run = chain.then(fn, fn)
  chain = run.then(
    () => {},
    () => {},
  )
  return run
}

// Opens a document, runs fn(doc), always destroys it. Serialized.
export function withPdfjs(bytes, fn, password) {
  return serial(async () => {
    const doc = await openPdfjs(bytes, password)
    try {
      return await fn(doc)
    } finally {
      await doc.destroy()
    }
  })
}

// Silences MuPDF's stderr warnings for one call (they are expected on quirks files).
function quietly(fn) {
  const orig = process.stderr.write.bind(process.stderr)
  process.stderr.write = () => true
  try {
    return fn()
  } finally {
    process.stderr.write = orig
  }
}

export function openMupdf(bytes, password) {
  return quietly(() => {
    const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
    const needsPassword = doc.needsPassword()
    let authOk = null
    if (needsPassword && password != null) authOk = doc.authenticatePassword(password) > 0
    return { doc, needsPassword, authOk }
  })
}

// Basic facts from both engines. Never throws.
export const probe = (...a) => serial(() => probeUnsafe(...a))
// pageInfo covers the first maxInfoPages pages, texts the first maxTextPages.
async function probeUnsafe(bytes, { password, texts = false, maxTextPages = 40, maxInfoPages = 400 } = {}) {
  const res = { size: bytes.length, pdfjs: { ok: false }, mupdf: { ok: false } }
  let doc
  try {
    doc = await openPdfjs(bytes, password)
    const pages = []
    const limit = Math.min(doc.numPages, maxInfoPages)
    for (let i = 1; i <= limit; i++) {
      const p = await doc.getPage(i)
      const vp = p.getViewport({ scale: 1 })
      pages.push({ view: p.view, rotate: p.rotate, w: vp.width, h: vp.height })
      p.cleanup()
    }
    res.pdfjs = { ok: true, pages: doc.numPages, pageInfo: pages }
    if (texts) res.pdfjs.texts = await pageTexts(doc, maxTextPages)
  } catch (err) {
    res.pdfjs = { ok: false, error: `${err.name}: ${err.message}` }
  } finally {
    await doc?.destroy()
  }
  try {
    quietly(() => {
      const { doc: m, needsPassword, authOk } = openMupdf(bytes, password)
      res.mupdf = {
        ok: !needsPassword || authOk === true,
        needsPassword,
        authOk,
        encryption: m.getMetaData('encryption') ?? 'None',
      }
      if (res.mupdf.ok) res.mupdf.pages = m.countPages()
      m.destroy?.()
    })
  } catch (err) {
    res.mupdf = { ok: false, error: String(err.message ?? err) }
  }
  return res
}

export async function pageTexts(doc, maxPages = 40) {
  const out = []
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const p = await doc.getPage(i)
    const tc = await p.getTextContent()
    out.push(tc.items.map((it) => it.str).join(' '))
    p.cleanup()
  }
  return out
}

export const textOf = (...a) => serial(() => textOfUnsafe(...a))
async function textOfUnsafe(bytes, { password, maxPages = 40 } = {}) {
  const doc = await openPdfjs(bytes, password)
  try {
    return await pageTexts(doc, maxPages)
  } finally {
    await doc.destroy()
  }
}

// Text of the given 1-based pages (for pages past the probe's text cap).
export const textAt = (...a) => serial(() => textAtUnsafe(...a))
async function textAtUnsafe(bytes, pageNums, { password } = {}) {
  const doc = await openPdfjs(bytes, password)
  try {
    const out = []
    for (const n of pageNums) {
      const p = await doc.getPage(n)
      out.push((await p.getTextContent()).items.map((it) => it.str).join(' '))
      p.cleanup()
    }
    return out
  } finally {
    await doc.destroy()
  }
}

// Text items matching `needle`, positioned as fractions of the VISIBLE page
// (rotation and CropBox applied, y from the top). upright = reads left to right.
export const findTextPositions = (...a) => serial(() => findTextPositionsUnsafe(...a))
async function findTextPositionsUnsafe(bytes, needle, { pages = null } = {}) {
  const doc = await openPdfjs(bytes)
  const hits = []
  try {
    const list = pages ?? Array.from({ length: doc.numPages }, (_, i) => i + 1)
    for (const n of list) {
      const p = await doc.getPage(n)
      const vp = p.getViewport({ scale: 1 })
      const tc = await p.getTextContent()
      for (const it of tc.items) {
        if (!it.str || !it.str.includes(needle)) continue
        const t = pdfjs.Util.transform(vp.transform, it.transform)
        hits.push({
          page: n,
          str: it.str,
          fx: t[4] / vp.width,
          fy: t[5] / vp.height,
          upright: t[0] > 0 && Math.abs(t[1]) < Math.abs(t[0]) * 0.2,
        })
      }
      p.cleanup()
    }
  } finally {
    await doc.destroy()
  }
  return hits
}

// Image draws on a page as visible-page fractions (CTM tracked from the
// operator list). Returns [{ x0, y0, x1, y1, cx, cy }] with y from the top.
export const imagePlacements = (...a) => serial(() => imagePlacementsUnsafe(...a))
async function imagePlacementsUnsafe(bytes, pageNum) {
  const doc = await openPdfjs(bytes)
  try {
    const p = await doc.getPage(pageNum)
    const vp = p.getViewport({ scale: 1 })
    const ops = await p.getOperatorList()
    const O = pdfjs.OPS
    let ctm = [1, 0, 0, 1, 0, 0]
    const stack = []
    const out = []
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i]
      const args = ops.argsArray[i]
      if (fn === O.save) stack.push(ctm)
      else if (fn === O.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
      else if (fn === O.transform) ctm = pdfjs.Util.transform(ctm, args)
      else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintImageMaskXObject) {
        const m = pdfjs.Util.transform(vp.transform, ctm)
        const pts = [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
        const xs = pts.map((q) => q[0] / vp.width)
        const ys = pts.map((q) => q[1] / vp.height)
        const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
        out.push({ ...box, cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2 })
      }
    }
    return out
  } finally {
    await doc.destroy()
  }
}

export const outlineCount = (...a) => serial(() => outlineCountUnsafe(...a))
async function outlineCountUnsafe(bytes) {
  const doc = await openPdfjs(bytes)
  try {
    const walk = (items) => (items ?? []).reduce((n, it) => n + 1 + walk(it.items), 0)
    return walk(await doc.getOutline())
  } finally {
    await doc.destroy()
  }
}

// Form facts: field count (pdf.js), values by name, XFA present (MuPDF).
export const formFacts = (...a) => serial(() => formFactsUnsafe(...a))
async function formFactsUnsafe(bytes) {
  const doc = await openPdfjs(bytes)
  let fields = {}
  let isPureXfa = false
  try {
    fields = (await doc.getFieldObjects()) ?? {}
    isPureXfa = !!doc.isPureXfa
  } finally {
    await doc.destroy()
  }
  let hasXfa = false
  try {
    quietly(() => {
      const m = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf').asPDF()
      const af = m.getTrailer().get('Root').get('AcroForm')
      hasXfa = !!(af && !af.isNull() && af.get('XFA') && !af.get('XFA').isNull())
      m.destroy?.()
    })
  } catch {
    /* no AcroForm */
  }
  // terminal fields only: pdf.js also lists parent nodes without widgets
  const values = {}
  for (const [name, arr] of Object.entries(fields)) {
    if ((arr ?? []).some((o) => o.rect || o.type)) values[name] = arr.find((o) => o.value !== undefined)?.value
  }
  return { count: Object.keys(values).length, values, isPureXfa, hasXfa }
}

// Permission facts of an encrypted file opened without a password (MuPDF).
export function permissions(bytes) {
  return quietly(() => {
    const m = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
    const out = { needsPassword: m.needsPassword(), encryption: m.getMetaData('encryption') ?? 'None' }
    if (!out.needsPassword) {
      out.print = m.hasPermission('print')
      out.copy = m.hasPermission('copy')
    }
    m.destroy?.()
    return out
  })
}

// Plain text out of DOCX / XLSX / PPTX (zip of XML) for coverage checks.
export async function officeText(bytes, kind) {
  const zip = await JSZip.loadAsync(bytes)
  const names = Object.keys(zip.files)
  const pick =
    kind === 'docx'
      ? names.filter((n) => /^word\/(document|header\d*|footer\d*|footnotes)\.xml$/.test(n))
      : kind === 'xlsx'
        ? names.filter((n) => /^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/.test(n))
        : names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
  let text = ''
  for (const n of pick) {
    const xml = await zip.file(n).async('string')
    const tag = kind === 'docx' ? 'w:t' : kind === 'pptx' ? 'a:t' : '(?:t|v)'
    const re = new RegExp(`<${tag}(?: [^>]*)?>([^<]*)</${tag}>`, 'g')
    for (const m of xml.matchAll(re)) text += decodeXml(m[1]) + ' '
  }
  const media = names.filter((n) => /\/media\//.test(n)).length
  const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length
  const sheets = names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).length
  return { text, media, slides, sheets, zip }
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&')
}

// Fraction of the source's distinct words (4+ letters) found in `target`.
export function wordCoverage(sourceText, targetText) {
  const norm = (s) => s.normalize('NFKC').toLowerCase()
  // CJK has no spaces between words: compare distinct characters instead
  const cjk = sourceText.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []
  if (cjk.length >= 20 || (cjk.length > 0 && cjk.length >= sourceText.replace(/\s/g, '').length * 0.3)) {
    const chars = [...new Set(cjk)]
    const tset = new Set(targetText)
    const found = chars.filter((c) => tset.has(c)).length
    return { ratio: found / chars.length, words: chars.length, found, cjk: true }
  }
  const words = [...new Set(norm(sourceText).match(/[\p{L}]{4,}/gu) ?? [])]
  if (words.length === 0) return { ratio: null, words: 0 }
  const target = norm(targetText).replace(/\s+/g, ' ')
  const tset = new Set(target.match(/[\p{L}]{4,}/gu) ?? [])
  const found = words.filter((w) => tset.has(w)).length
  return { ratio: found / words.length, words: words.length, found }
}

// Sanity of every page box: positive, finite, under the 14400 pt PDF limit,
// rotation a multiple of 90.
export function boxesSane(pageInfo) {
  for (const [i, p] of pageInfo.entries()) {
    const [x0, y0, x1, y1] = p.view
    const w = x1 - x0
    const h = y1 - y0
    if (!(w > 0 && h > 0 && w < 14400 && h < 14400)) return `page ${i + 1} box ${p.view.map((v) => +v.toFixed(1))}`
    if (p.rotate % 90 !== 0) return `page ${i + 1} rotate ${p.rotate}`
  }
  return null
}

// ---------- raw leak scan ----------

// Joined (...) string literals of a content stream, escapes decoded.
function literals(data) {
  let out = ''
  for (const m of data.matchAll(LITERAL)) out += m[1].replace(ESCAPE, (_, e) => (/^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8)) : e))
  return out
}
const LITERAL = /\(((?:\\[\s\S]|[^\\)])*)\)/g
const ESCAPE = /\\([0-7]{1,3}|[\s\S])/g

// Joined <...> hex strings of a stream, as bytes; UTF-16 zero bytes dropped.
function hexStrings(data) {
  let out = ''
  for (const m of data.matchAll(/<([0-9a-fA-F\s]{2,})>/g)) {
    const h = m[1].replace(/\s+/g, '')
    out += Buffer.from(h.length % 2 ? `${h}0` : h, 'hex').toString('latin1')
  }
  return out.replace(/\0/g, '')
}

// Names drawn by a content stream (independent of the app's own parser):
// tokens, skipping strings, comments and inline image data.
function drawnNames(data) {
  const names = { XObject: new Set(), Pattern: new Set() }
  const s = data.replace(/\((?:\\[\s\S]|[^\\)])*\)/g, ' ').replace(/%[^\r\n]*/g, ' ').replace(/\bID\s[\s\S]*?\sEI\b/g, ' ')
  for (const m of s.matchAll(/\/([^\s/<>[\]()%{}]+)\s+(Do|scn|SCN)\b/g)) names[m[2] === 'Do' ? 'XObject' : 'Pattern'].add(m[1].replace(/#([0-9a-fA-F]{2})/g, (_, x) => String.fromCharCode(parseInt(x, 16))))
  return names
}
const streamText = (ref) => Buffer.from(ref.readStream().asUint8Array()).toString('latin1')
const listOf = (o) => (o.isArray() ? Array.from({ length: o.length }, (_, k) => o.get(k)) : o.isNull() ? [] : [o])
const nameIs = (o, n) => o.isName() && o.asName() === n

// Images, forms and patterns listed in a page's resources (or in a form or
// pattern it draws) that nothing draws: what a redaction left of a picture
// or a drawing under a box.
function undrawnResources(doc, pageIndex) {
  const out = []
  const seen = new Set()
  const visit = (data, res, where) => {
    if (!res.isDictionary()) return
    const used = drawnNames(data)
    // forms and patterns without resources of their own use these
    const inner = []
    const grow = (cat, name) => {
      const v = res.get(cat).isDictionary() ? res.get(cat).get(name) : null
      if (!v?.isStream() || !v.get('Resources').isNull() || !v.isIndirect() || inner.includes(v.asIndirect())) return
      inner.push(v.asIndirect())
      const more = drawnNames(streamText(v))
      for (const c of ['XObject', 'Pattern']) for (const n of more[c]) if (!used[c].has(n)) (used[c].add(n), grow(c, n))
    }
    for (const c of ['XObject', 'Pattern']) for (const n of [...used[c]]) grow(c, n)
    // Type3 glyphs without resources of their own draw with these too
    const fonts = res.get('Font')
    if (fonts.isDictionary()) {
      fonts.forEach((f) => {
        if (!nameIs(f.get('Subtype'), 'Type3') || !f.get('Resources').isNull()) return
        f.get('CharProcs').forEach((cp) => {
          if (!cp.isStream()) return
          const more = drawnNames(streamText(cp))
          for (const c of ['XObject', 'Pattern']) for (const n of more[c]) used[c].add(n)
        })
      })
    }
    const xo = res.get('XObject')
    if (xo.isDictionary()) {
      xo.forEach((v, name) => {
        if (!v.isStream()) return
        const sub = v.get('Subtype')
        if (!used.XObject.has(name)) out.push(`${where}: ${nameIs(sub, 'Image') ? 'image' : 'form'} /${name} listed, not drawn`)
        else if (nameIs(sub, 'Form') && v.get('Resources').isDictionary() && v.isIndirect() && !seen.has(v.asIndirect())) {
          seen.add(v.asIndirect())
          visit(streamText(v), v.get('Resources'), `${where} form /${name}`)
        }
      })
    }
    const pats = res.get('Pattern')
    if (pats.isDictionary()) {
      pats.forEach((v, name) => {
        if (!used.Pattern.has(name)) return out.push(`${where}: pattern /${name} listed, not drawn`)
        if (!v.isStream() || !v.get('Resources').isDictionary() || !v.isIndirect() || seen.has(v.asIndirect())) return
        seen.add(v.asIndirect())
        visit(streamText(v), v.get('Resources'), `${where} pattern /${name}`)
      })
    }
  }
  const page = doc.findPage(pageIndex)
  visit(listOf(page.get('Contents')).map(streamText).join('\n'), page.getInheritable('Resources'), `page ${pageIndex + 1}`)
  return out
}

const pointIn = (x, y, r) => x > r[0] && x < r[2] && y > r[1] && y < r[3]

// What is still under each box on the page (view-space boxes, shrunk by a
// point): characters, and image pixels that are not one flat colour.
function underBoxes(page, boxes) {
  const b0 = page.getBounds()
  const rects = boxes
    .map((b) => (b.whole ? { x: 0, y: 0, w: b0[2] - b0[0], h: b0[3] - b0[1] } : b))
    .map((b) => [b0[0] + b.x + 1, b0[1] + b.y + 1, b0[0] + b.x + b.w - 1, b0[1] + b.y + b.h - 1])
    .filter((r) => r[2] > r[0] && r[3] > r[1])
  const out = []
  const st = page.toStructuredText('preserve-whitespace')
  try {
    st.walk({
      onChar(c, origin, font, size, q) {
        const cx = (q[0] + q[2] + q[4] + q[6]) / 4
        const cy = (q[1] + q[3] + q[5] + q[7]) / 4
        if (c.trim() && rects.some((r) => pointIn(cx, cy, r))) out.push(`character "${c}" under a box`)
      },
    })
  } finally {
    st.destroy?.()
  }
  const clipBoxes = []
  let masks = 0
  const boundsOf = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]
  // a drawing edge that is curved or slanted and crosses a box: shape
  // information under the black (straight edges are borders and fills)
  const at = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
  const crosses = (p, q) => {
    for (let k = 0; k <= 16; k++) {
      const x = p[0] + ((q[0] - p[0]) * k) / 16
      const y = p[1] + ((q[1] - p[1]) * k) / 16
      if (rects.some((r) => pointIn(x, y, r))) return true
    }
    return false
  }
  const shape = (path, ctm, what) => {
    let first = null
    let last = null
    let hit = false
    const edge = (q, curved) => {
      if (last && (curved || (Math.abs(q[0] - last[0]) > 0.01 && Math.abs(q[1] - last[1]) > 0.01)) && crosses(last, q)) hit = true
      last = q
    }
    path.walk({
      moveTo: (x, y) => (first = last = at(ctm, x, y)),
      lineTo: (x, y) => edge(at(ctm, x, y), false),
      curveTo: (x1, y1, x2, y2, x3, y3) => [at(ctm, x1, y1), at(ctm, x2, y2), at(ctm, x3, y3)].forEach((q) => edge(q, true)),
      closePath: () => first && edge(first, false),
    })
    if (hit) out.push(`${what} with curved or slanted edges under a box`)
  }
  const imageUnder = (image, ctm) => {
    const inv = mupdf.Matrix.invert(ctm)
    let pix
    try {
      pix = image.toPixmap()
    } catch {
      return
    }
    const W = pix.getWidth()
    const H = pix.getHeight()
    const n = pix.getNumberOfComponents() + pix.getAlpha()
    const px = Uint8Array.from(pix.getPixels())
    const stride = pix.getStride()
    for (const r of rects) {
      const pts = [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]].map(([x, y]) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]])
      const us = pts.map((p) => p[0])
      const vs = pts.map((p) => p[1])
      const x0 = Math.max(0, Math.ceil(Math.min(...us) * W))
      const x1 = Math.min(W, Math.floor(Math.max(...us) * W))
      // in MuPDF device space the unit square's (0,0) is the image's first pixel
      const y0 = Math.max(0, Math.ceil(Math.min(...vs) * H))
      const y1 = Math.min(H, Math.floor(Math.max(...vs) * H))
      if (x1 <= x0 || y1 <= y0) continue
      const lo = new Array(n).fill(255)
      const hi = new Array(n).fill(0)
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          for (let k = 0; k < n; k++) {
            const v = px[y * stride + x * n + k]
            if (v < lo[k]) lo[k] = v
            if (v > hi[k]) hi[k] = v
          }
        }
      }
      if (hi.some((v, k) => v - lo[k] > 24)) out.push(`image pixels under a box (${W}x${H} image)`)
    }
  }
  const dev = new mupdf.Device({
    // mupdf.js 1.28 passes images and shadings without a reference of their
    // own: unhook the finalizer and use them only inside the callback
    fillImage(image, ctm) {
      mupdf.Image._finalizer?.unregister(image)
      imageUnder(image, ctm)
    },
    fillPath(path, evenOdd, ctm) {
      shape(path, ctm, 'filled shape')
    },
    strokePath(path, stroke, ctm) {
      shape(path, ctm, 'stroked line')
    },
    beginTile(area) {
      if (rects.some((r) => area[0] < r[2] && area[2] > r[0] && area[1] < r[3] && area[3] > r[1])) out.push('pattern fill under a box')
      return 0
    },
    // a shading (gradient, gradient mesh) reaching into a box, within the
    // bounding boxes of the clips around it
    fillShade(shade, ctm) {
      mupdf.Shade._finalizer?.unregister(shade)
      if (masks) return
      const b = shade.getBounds()
      let area = Number.isFinite(b[0] + b[1] + b[2] + b[3]) ? boundsOf([at(ctm, b[0], b[1]), at(ctm, b[2], b[1]), at(ctm, b[0], b[3]), at(ctm, b[2], b[3])]) : [-Infinity, -Infinity, Infinity, Infinity]
      for (const c of clipBoxes) area = [Math.max(area[0], c[0]), Math.max(area[1], c[1]), Math.min(area[2], c[2]), Math.min(area[3], c[3])]
      if (rects.some((r) => area[0] < r[2] && area[2] > r[0] && area[1] < r[3] && area[3] > r[1])) out.push('shading under a box')
    },
    clipPath(path, evenOdd, ctm) {
      const pts = []
      path.walk({ moveTo: (x, y) => pts.push(at(ctm, x, y)), lineTo: (x, y) => pts.push(at(ctm, x, y)), curveTo: (x1, y1, x2, y2, x3, y3) => pts.push(at(ctm, x1, y1), at(ctm, x2, y2), at(ctm, x3, y3)) })
      clipBoxes.push(pts.length ? boundsOf(pts) : [0, 0, 0, 0])
    },
    clipStrokePath: () => clipBoxes.push([-Infinity, -Infinity, Infinity, Infinity]),
    clipText: () => clipBoxes.push([-Infinity, -Infinity, Infinity, Infinity]),
    clipStrokeText: () => clipBoxes.push([-Infinity, -Infinity, Infinity, Infinity]),
    clipImageMask: (image) => {
      mupdf.Image._finalizer?.unregister(image)
      clipBoxes.push([-Infinity, -Infinity, Infinity, Infinity])
    },
    beginMask: () => masks++,
    endMask: () => {
      masks--
      clipBoxes.push([-Infinity, -Infinity, Infinity, Infinity])
    },
    popClip: () => clipBoxes.pop(),
  })
  try {
    page.runPageContents(dev, mupdf.Matrix.identity)
  } finally {
    dev.close()
  }
  return [...new Set(out)]
}

// Looks at every object in the file, not just what viewers show: objects not
// reachable from the trailer (orphans), page objects outside the page tree
// (orphanPages, reachable or not), every string (Info, outline titles,
// annotation contents, field values, alt texts), every decoded stream except
// images (content, XMP, XFA, JavaScript) as plain text, joined literals, hex
// and UTF-16, the text of every Form XObject and tiling pattern drawn on a
// scratch page (CID fonts), page text with hidden layers shown, and the XFA
// entry. With opts.pages (1-based): images those pages list but do not draw.
// With opts.boxes ({ pageNum, x, y, w, h } view space): characters and image
// pixels still under them.
// terms: strings that must not appear (case and whitespace ignored).
// Returns { objects, orphans, orphanPages, xfa, xfaStreams, hits: [{ term, where }], undrawn: [], under: [] }.
export function rawScan(bytes, terms = [], { pages = [], boxes = [] } = {}) {
  const want = terms.map((t) => String(t).toLowerCase().replace(/\s+/g, '')).filter(Boolean)
  const res = { objects: 0, orphans: 0, orphanPages: 0, xfa: false, xfaStreams: 0, hits: [], undrawn: [], under: [] }
  const seen = new Set()
  const look = (text, where) => {
    if (!want.length || !text) return
    const flat = text.toLowerCase().replace(/\s+/g, '')
    for (const t of want) {
      if (flat.includes(t) && !seen.has(`${t}|${where}`)) {
        seen.add(`${t}|${where}`)
        res.hits.push({ term: t, where })
      }
    }
  }
  quietly(() => {
    const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf').asPDF()
    try {
      // reachability from the trailer
      const reach = new Set()
      const stack = [doc.getTrailer()]
      while (stack.length) {
        const o = stack.pop()
        if (o.isIndirect()) {
          const num = o.asIndirect()
          if (reach.has(num)) continue
          reach.add(num)
        }
        const r = o.resolve()
        if (r.isDictionary() || r.isArray()) r.forEach((v) => (v.isIndirect() || v.isDictionary() || v.isArray()) && stack.push(v))
      }
      const af = doc.getTrailer().get('Root').get('AcroForm')
      res.xfa = !!(af && !af.isNull() && af.get('XFA') && !af.get('XFA').isNull())
      // page objects in the page tree; any other /Type /Page is a detached
      // page, even when a bookmark or link still points at it
      // (a looping page tree hides pages: count what can be reached)
      const tree = new Set()
      let reachable = 0
      for (let p = 0; p < doc.countPages(); p++) {
        let obj
        try {
          obj = doc.findPage(p)
        } catch {
          break
        }
        reachable++
        if (obj.isIndirect()) tree.add(obj.asIndirect())
      }

      // strings anywhere; names only where the author picks them: values of
      // /D, /Dest and /AS, keys of a catalog /Dests dict and of appearance
      // state dicts (/AP /N, /D, /R)
      const strings = (o, where, key = null) => {
        const st = [[o, key]]
        while (st.length) {
          const [x, k] = st.pop()
          if (x.isIndirect()) continue
          if (x.isString()) look(x.asString(), where)
          else if (x.isName() && (k === 'D' || k === 'Dest' || k === 'AS')) look(x.asName(), `${where} name`)
          else if (x.isArray()) x.forEach((v) => st.push([v, null]))
          else if (x.isDictionary()) x.forEach((v, kk) => {
            if (k === 'Dests' || k === 'N' || k === 'D' || k === 'R') look(kk, `${where} name key`)
            st.push([v, kk])
          })
        }
      }
      const dests = doc.getTrailer().get('Root').get('Dests')
      const destsNum = dests.isIndirect() ? dests.asIndirect() : null
      const drawable = [] // [num, kind]
      const n = doc.countObjects()
      for (let i = 1; i < n; i++) {
        const ref = doc.newIndirect(i)
        let r
        try {
          r = ref.resolve()
        } catch {
          continue
        }
        if (r.isNull()) continue
        res.objects++
        const type = r.isDictionary() ? r.get('Type') : null
        const typeName = type && type.isName() ? type.asName() : ''
        // object streams, xref streams and bare numbers (old /Length values)
        // are file structure, not content
        if (!reach.has(i) && typeName !== 'ObjStm' && typeName !== 'XRef' && !r.isNumber()) res.orphans++
        if (typeName === 'Page' && !tree.has(i)) res.orphanPages++
        const where = `obj ${i}${typeName ? ` /${typeName}` : ''}${reach.has(i) ? '' : ' (orphan)'}`
        if (r.isString()) look(r.asString(), where)
        else if (r.isDictionary() || r.isArray()) r.forEach((v, k) => strings(v, where, typeof k === 'string' ? k : null))
        // an old-style catalog /Dests dict kept as its own object
        if (i === destsNum) r.forEach((v, k) => look(k, `${where} name key`))
        if (ref.isStream()) {
          const sub = r.get('Subtype')
          if (sub && sub.isName() && sub.asName() === 'Image') continue
          // object streams hold the objects scanned one by one above (their
          // raw text is full of key names like /First)
          if (typeName === 'ObjStm' || typeName === 'XRef') continue
          if (nameIs(sub, 'Form')) drawable.push([i, 'form'])
          if (typeName === 'Pattern' && r.get('PatternType').isNumber() && r.get('PatternType').asNumber() === 1) drawable.push([i, 'pattern'])
          let data
          try {
            data = Buffer.from(ref.readStream().asUint8Array()).toString('latin1')
          } catch {
            continue
          }
          if (/xfa\.org\/schema|<xdp:xdp|xfa:datasets/i.test(data) && typeName !== 'Metadata') res.xfaStreams++
          look(data, `${where} stream`)
          look(data.replace(/\0/g, ''), `${where} stream (UTF-16)`)
          // text shown with TJ arrays is split into pieces: join the literals
          if (/T[Jj*'"]|BDC/.test(data)) {
            look(literals(data), `${where} stream text`)
            look(hexStrings(data), `${where} stream hex`)
          }
          if (typeName === 'Metadata') look(Buffer.from(data, 'latin1').toString('utf8'), `${where} stream`)
        }
      }
      // what a viewer extracts from every page, hidden layers included
      for (let l = 0; l < doc.countLayers(); l++) doc.setLayerVisible(l, true)
      for (let p = 0; p < reachable; p++) {
        const page = doc.loadPage(p)
        try {
          const st = page.toStructuredText('preserve-whitespace')
          look(st.asText(), `page ${p + 1} text`)
          st.destroy?.()
          const pageBoxes = boxes.filter((b) => b.pageNum === p + 1)
          if (pageBoxes.length) res.under.push(...underBoxes(page, pageBoxes).map((u) => `page ${p + 1}: ${u}`))
        } finally {
          page.destroy?.()
        }
      }
      const all = Array.from({ length: Math.min(reachable, 400) }, (_, k) => k + 1)
      for (const p of pages === 'all' ? all : pages) if (p >= 1 && p <= reachable) res.undrawn.push(...undrawnResources(doc, p - 1))
      // every form and tiling pattern drawn on a scratch page: catches text
      // in CID fonts that no plain scan reads
      if (want.length) {
        for (const [i, kind] of drawable) {
          try {
            let ref = doc.newIndirect(i)
            if (kind === 'pattern') {
              const fd = doc.newDictionary()
              fd.put('Type', doc.newName('XObject'))
              fd.put('Subtype', doc.newName('Form'))
              fd.put('BBox', ref.get('BBox'))
              if (!ref.get('Resources').isNull()) fd.put('Resources', ref.get('Resources'))
              ref = doc.addStream(ref.readStream().asUint8Array(), fd)
            }
            const xo = doc.newDictionary()
            xo.put('X', ref)
            const rd = doc.newDictionary()
            rd.put('XObject', xo)
            doc.insertPage(-1, doc.addPage([-5000, -5000, 5000, 5000], 0, rd, '/X Do'))
            const page = doc.loadPage(doc.countPages() - 1)
            const st = page.toStructuredText('preserve-whitespace')
            look(st.asText(), `obj ${i} ${kind} drawn`)
            st.destroy?.()
            page.destroy?.()
            doc.deletePage(doc.countPages() - 1)
          } catch {
            /* not drawable */
          }
        }
      }
    } finally {
      doc.destroy?.()
    }
  })
  return res
}

// Shared check for every redaction output: no page object outside the page
// tree, no unreferenced objects, no XFA, none of `terms` anywhere in the file
// (see rawScan), no undrawn images on the hit pages and nothing left under
// the boxes. opts: { pages, boxes } as for rawScan.
// Returns { scan, bad: [problem] }, bad is empty when the file is clean.
export function redactionLeaks(bytes, terms = [], opts = {}) {
  const scan = rawScan(bytes, terms, opts)
  const bad = []
  if (scan.orphanPages) bad.push(`${scan.orphanPages} page object(s) outside the page tree`)
  if (scan.orphans) bad.push(`${scan.orphans} unreferenced object(s)`)
  if (scan.xfa || scan.xfaStreams) bad.push(`XFA left (${scan.xfaStreams} stream(s))`)
  for (const h of scan.hits.slice(0, 4)) bad.push(`"${h.term}" in ${h.where}`)
  if (scan.hits.length > 4) bad.push(`${scan.hits.length - 4} more hit(s)`)
  bad.push(...scan.undrawn.slice(0, 3), ...scan.under.slice(0, 3))
  return { scan, bad }
}
