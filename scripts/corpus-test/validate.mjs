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

// Looks at every object in the file, not just what viewers show: objects not
// reachable from the trailer (orphans, such as pages unlinked from the page
// tree), every string (Info, outline titles, annotation contents, field
// values, alt texts), every decoded stream except images (content, XMP, XFA,
// JavaScript), page text of every page, and the XFA entry.
// terms: strings that must not appear (case and whitespace ignored).
// Returns { objects, orphans, orphanPages, xfa, xfaStreams, hits: [{ term, where }] }.
export function rawScan(bytes, terms = []) {
  const want = terms.map((t) => String(t).toLowerCase().replace(/\s+/g, '')).filter(Boolean)
  const res = { objects: 0, orphans: 0, orphanPages: 0, xfa: false, xfaStreams: 0, hits: [] }
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

      const strings = (o, where) => {
        const st = [o]
        while (st.length) {
          const x = st.pop()
          if (x.isIndirect()) continue
          if (x.isString()) look(x.asString(), where)
          else if (x.isDictionary() || x.isArray()) x.forEach((v) => st.push(v))
        }
      }
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
        if (!reach.has(i) && typeName !== 'ObjStm' && typeName !== 'XRef' && !r.isNumber()) {
          res.orphans++
          if (typeName === 'Page') res.orphanPages++
        }
        const where = `obj ${i}${typeName ? ` /${typeName}` : ''}${reach.has(i) ? '' : ' (orphan)'}`
        if (r.isString()) look(r.asString(), where)
        else if (r.isDictionary() || r.isArray()) r.forEach((v) => strings(v, where))
        if (ref.isStream()) {
          const sub = r.get('Subtype')
          if (sub && sub.isName() && sub.asName() === 'Image') continue
          let data
          try {
            data = Buffer.from(ref.readStream().asUint8Array()).toString('latin1')
          } catch {
            continue
          }
          if (/xfa\.org\/schema|<xdp:xdp|xfa:datasets/i.test(data) && typeName !== 'Metadata') res.xfaStreams++
          look(data, `${where} stream`)
          // text shown with TJ arrays is split into pieces: join the literals
          if (/T[Jj*'"]/.test(data)) look(literals(data), `${where} stream text`)
          if (typeName === 'Metadata') look(Buffer.from(data, 'latin1').toString('utf8'), `${where} stream`)
        }
      }
      // what a viewer extracts from every page
      for (let p = 0; p < doc.countPages(); p++) {
        const page = doc.loadPage(p)
        try {
          const st = page.toStructuredText('preserve-whitespace')
          look(st.asText(), `page ${p + 1} text`)
          st.destroy?.()
        } finally {
          page.destroy?.()
        }
      }
    } finally {
      doc.destroy?.()
    }
  })
  return res
}
