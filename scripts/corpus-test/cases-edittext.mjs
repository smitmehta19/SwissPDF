// Edit existing text on real corpus files (src/lib/editTextOps.js). Per file
// Node picks a word that is unique in the document and has text after it on
// its line; the page runs three edits through the ops worker (same length,
// longer, letters the file never draws with that font), and Node checks each
// output: old text gone from the text layer (with and without ActualText) and
// from the file bytes, new text extractable, no pixel changed outside the
// edited box, ink in the box, opens in pdf.js and MuPDF, timing.
// Refusal rows: scanned page, vertical text, no Unicode mapping. Synthetic
// files (built here when missing): Devanagari text (udhr-hindi is image
// only) and a signed copy of an invoice.
import * as mupdf from 'mupdf'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { rawScan, redactionLeaks } from './validate.mjs'
import { ROOT } from './server.mjs'
import { USER_PW } from './derive.mjs'
import { pageTextModel } from '../../src/lib/editTextOps.js'

const CORPUS_DIR = join(ROOT, 'test-corpus')
const HINDI = 'derived/edittext-hindi.pdf'
const SIGNED = 'derived/edittext-signed.pdf'

// ---------- synthetic files ----------
async function buildHindi() {
  const dest = join(CORPUS_DIR, HINDI)
  if (existsSync(dest)) return
  const rt = await import('regenerator-runtime')
  globalThis.regeneratorRuntime ??= rt.default ?? rt
  const fontkit = (await import('@pdf-lib/fontkit')).default
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(readFileSync(join(ROOT, 'public', 'fonts', 'NotoSansDevanagari-Regular.ttf')), { subset: true })
  const page = doc.addPage([595, 842])
  const lines = ['\u092e\u093e\u0928\u0935 \u0905\u0927\u093f\u0915\u093e\u0930\u094b\u0902 \u0915\u0940 \u0938\u093e\u0930\u094d\u0935\u092d\u094c\u092e \u0918\u094b\u0937\u0923\u093e', '\u0938\u092d\u0940 \u092e\u0928\u0941\u0937\u094d\u092f\u094b\u0902 \u0915\u094b \u0917\u094c\u0930\u0935 \u0914\u0930 \u0905\u0927\u093f\u0915\u093e\u0930\u094b\u0902 \u0915\u0947 \u092e\u093e\u092e\u0932\u0947 \u092e\u0947\u0902 \u091c\u0928\u094d\u092e\u091c\u093e\u0924 \u0938\u094d\u0935\u0924\u0928\u094d\u0924\u094d\u0930\u0924\u093e \u092a\u094d\u0930\u093e\u092a\u094d\u0924 \u0939\u0948\u0964']
  let y = 760
  for (const l of lines) {
    page.drawText(l, { x: 60, y, size: 14, font })
    y -= 30
  }
  writeFileSync(dest, await doc.save())
}

// A signed signature field (dummy /V) on a copy of the AWS invoice.
function buildSigned() {
  const dest = join(CORPUS_DIR, SIGNED)
  const src = join(CORPUS_DIR, 'invoices/aws-invoice.pdf')
  if (existsSync(dest) || !existsSync(src)) return
  const doc = mupdf.Document.openDocument(new Uint8Array(readFileSync(src)), 'application/pdf').asPDF()
  try {
    const sig = doc.newDictionary()
    sig.put('Type', doc.newName('Sig'))
    sig.put('Filter', doc.newName('Adobe.PPKLite'))
    sig.put('SubFilter', doc.newName('adbe.pkcs7.detached'))
    sig.put('Contents', doc.newByteString(new Uint8Array(64)))
    const page = doc.findPage(0)
    const w = doc.newDictionary()
    w.put('Type', doc.newName('Annot'))
    w.put('Subtype', doc.newName('Widget'))
    w.put('FT', doc.newName('Sig'))
    w.put('T', doc.newString('Signature1'))
    w.put('V', doc.addObject(sig))
    const rect = doc.newArray()
    for (const v of [400, 40, 560, 80]) rect.push(v)
    w.put('Rect', rect)
    w.put('F', 4)
    w.put('P', page)
    const ref = doc.addObject(w)
    let annots = page.get('Annots')
    if (!annots.isArray()) {
      annots = doc.newArray()
      page.put('Annots', annots)
    }
    annots.push(ref)
    const root = doc.getTrailer().get('Root')
    const af = doc.newDictionary()
    const fields = doc.newArray()
    fields.push(ref)
    af.put('Fields', fields)
    af.put('SigFlags', 3)
    root.put('AcroForm', doc.addObject(af))
    writeFileSync(dest, new Uint8Array(doc.saveToBuffer('garbage,compress').asUint8Array()))
  } finally {
    doc.destroy?.()
  }
}

// Helvetica pages from raw content streams (review fixtures).
const ACTUALTEXT = 'derived/edittext-actualtext.pdf'
const WHITEBOX = 'derived/edittext-whitebox.pdf'
const TIGHT = 'derived/edittext-tight.pdf'
const INLINE = 'derived/edittext-inline.pdf'
const TAM = 'derived/edittext-tam.pdf'
const USER_PW_TAM = USER_PW
function buildPages(rel, pages) {
  const dest = join(CORPUS_DIR, rel)
  if (existsSync(dest)) return
  const doc = new mupdf.PDFDocument()
  try {
    const res = doc.newDictionary()
    const fd = doc.newDictionary()
    fd.put('F1', doc.addSimpleFont(new mupdf.Font('Helvetica'), 'Latin'))
    res.put('Font', fd)
    for (const c of pages) doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, res, c))
    writeFileSync(dest, new Uint8Array(doc.saveToBuffer('compress').asUint8Array()))
  } finally {
    doc.destroy?.()
  }
}
const SPLIT_A = 'derived/edittext-split-translate.pdf'
const SPLIT_A2 = 'derived/edittext-split-scale.pdf'
// One page whose /Contents is an array of the given streams.
function buildSplit(rel, parts) {
  const dest = join(CORPUS_DIR, rel)
  if (existsSync(dest)) return
  const doc = new mupdf.PDFDocument()
  try {
    const res = doc.newDictionary()
    const fd = doc.newDictionary()
    fd.put('F1', doc.addSimpleFont(new mupdf.Font('Helvetica'), 'Latin'))
    res.put('Font', fd)
    doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, res, ''))
    const arr = doc.newArray()
    for (const p of parts) arr.push(doc.addStream(p, doc.newDictionary()))
    doc.findPage(0).put('Contents', arr)
    writeFileSync(dest, new Uint8Array(doc.saveToBuffer('compress').asUint8Array()))
  } finally {
    doc.destroy?.()
  }
}
const tightPage = (lead) =>
  ['line one alpha bravo charlie', 'line two delta echo foxtrot', 'Kilo middle Lima word here', 'line four golf hotel india', 'line five juliet mike oscar']
    .map((l, i) => `BT /F1 10 Tf 72 ${700 - i * lead} Td (${l}) Tj ET`)
    .join('\n')

try {
  await buildHindi()
  buildSigned()
  buildPages(ACTUALTEXT, ['/Span <</ActualText (PATIENTNAME)>> BDC BT /F1 12 Tf 72 700 Td (Johnny) Tj ET EMC BT /F1 12 Tf 72 680 Td (Tail line) Tj ET'])
  buildPages(WHITEBOX, ['BT /F1 12 Tf 72 700 Td (A plain line on top) Tj ET 1 0 0 rg BT /F1 12 Tf 72 620 Td (Visible SECRET123 hidden) Tj ET 1 1 1 rg 150 616 80 16 re f'])
  buildPages(TIGHT, [tightPage(7.5), tightPage(9)])
  // inline images with an abbreviated Indexed colour space and ASCIIHex data
  buildPages(INLINE, ['BT /F1 12 Tf 72 700 Td (Inline image test line here) Tj ET q 200 0 0 10 72 670 cm BI /W 4 /H 1 /BPC 8 /CS [/I /RGB 3 <FF000000FF000000FFFFFFFF>] /F /AHx ID 00010203> EI Q q 200 0 0 10 72 640 cm BI /W 2 /H 1 /BPC 8 /CS /G /F /AHx ID 40C0> EI Q BT /F1 12 Tf 72 620 Td (Second line below images) Tj ET'])
  // /Contents split in two streams: the first sets a translate (A) or a scale
  // (A2) the second's inline image is drawn with (pdf-lib translateContent /
  // scaleContent write this layout). Both put a 4x4 colour image at
  // x 172..272, y 600..650 in user space.
  const IMG = 'BI /W 4 /H 4 /BPC 8 /CS /RGB /F /AHx ID FF0000 00FF00 0000FF FFFF00 FF0000 00FF00 0000FF FFFF00 FF0000 00FF00 0000FF FFFF00 FF0000 00FF00 0000FF FFFF00> EI'
  buildSplit(SPLIT_A, ['q 1 0 0 1 100 0 cm', `100 0 0 50 72 600 cm ${IMG} Q BT /F1 12 Tf 72 700 Td (Split content line) Tj ET`])
  buildSplit(SPLIT_A2, ['q 0.5 0 0 0.5 0 0 cm', `200 0 0 100 344 1200 cm ${IMG} Q BT /F1 12 Tf 72 700 Td (Split content line) Tj ET`])
  // the password copy of the TAM paper, decrypted as the app does before tools run
  if (!existsSync(join(CORPUS_DIR, TAM)) && existsSync(join(CORPUS_DIR, 'derived/user-pw-TAMReview.pdf'))) {
    const d = mupdf.Document.openDocument(new Uint8Array(readFileSync(join(CORPUS_DIR, 'derived/user-pw-TAMReview.pdf'))), 'application/pdf')
    d.authenticatePassword(USER_PW_TAM)
    writeFileSync(join(CORPUS_DIR, TAM), new Uint8Array(d.asPDF().saveToBuffer('encrypt=none').asUint8Array()))
    d.destroy?.()
  }
} catch (err) {
  console.error('edittext: synthetic files not built:', err.message)
}

// ---------- helpers ----------
const seg = new Intl.Segmenter('und', { granularity: 'grapheme' })
const graphemes = (s) => [...seg.segment(s)].map((x) => x.segment)
const count = (hay, needle) => {
  let n = 0
  let i = 0
  while (needle && (i = hay.indexOf(needle, i)) >= 0) {
    n++
    i += needle.length
  }
  return n
}
const squash = (s) => String(s ?? '').replace(/\s+/g, '')
const COMPLEX = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}]/u
const SCRIPT = { latin: /^[\p{Script=Latin}\p{M}]+$/u, arabic: /^[\p{Script=Arabic}\p{M}]+$/u, cjk: /^\p{Script=Han}+$/u, devanagari: /^[\p{Script=Devanagari}\p{M}]+$/u }
const POOL = { latin: 'ZQXJzqxjKWVYkwvy\u00e9\u20ac', arabic: '\u06a4\u06af\u067e\u0686\u0698', cjk: '\u732b\u72d7\u9f99\u9e45\u86d9\u946b', devanagari: '\u090b\u0950\u090c\u091d\u091e' }

// MuPDF text per page (first 40), default (ActualText applied) or raw glyphs
export function docText(bytes, opts = 'preserve-whitespace', max = 40) {
  const d = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  const out = []
  try {
    for (let i = 0; i < Math.min(d.countPages(), max); i++) {
      const p = d.loadPage(i)
      const st = p.toStructuredText(opts)
      out.push(st.asText())
      st.destroy?.()
      p.destroy?.()
    }
  } finally {
    d.destroy?.()
  }
  return out
}

// A word to edit: unique in the document (so "old text gone" is provable),
// in the wanted script, not in the header or footer, with text after it.
export async function pickTarget(bytes, script = 'latin', { pages = 4 } = {}) {
  const texts = docText(bytes, 'preserve-whitespace', pages)
  const all = docText(bytes).join('\n')
  const n = texts.length
  for (let pageNum = 1; pageNum <= Math.min(n, pages); pageNum++) {
    const m = await pageTextModel(bytes, pageNum)
    if (m.page.scanned) continue
    for (const run of m.runs) {
      if (!run.editable || run.bbox[1] < m.page.height * 0.08 || run.bbox[3] > m.page.height * 0.95) continue
      for (const w of run.words) {
        const g = graphemes(w.text)
        if (!SCRIPT[script].test(w.text) || g.length < (script === 'cjk' ? 2 : 4)) continue
        if (w.i === run.words.length - 1) continue
        if (count(squash(all), squash(w.text)) !== 1) continue
        return { pageNum, runId: run.id, wordIndex: w.i, old: w.text, fontName: run.fontName }
      }
    }
  }
  return null
}

// same length (two letters swapped), longer (+3 letters), a letter the file never draws
export function editsFor(old, script, all) {
  const g = graphemes(old)
  let i = g.length < 3 ? 0 : 1
  while (i + 1 < g.length && g[i] === g[i + 1]) i++
  const sw = g.slice()
  ;[sw[i], sw[i + 1]] = [sw[i + 1], sw[i]]
  const same = sw.join('')
  const longer = script === 'cjk' ? same + sw[sw.length - 1] : same + g.slice(0, 3).join('')
  const miss = [...POOL[script]].find((c) => !all.includes(c)) ?? POOL[script][0]
  const m = g.slice()
  m[1] = miss
  return [
    { name: 'same', text: same },
    { name: 'longer', text: longer },
    { name: 'missing', text: m.join(''), char: miss },
  ]
}

function render(bytes, pageIdx, scale = 2) {
  const d = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  try {
    const p = d.loadPage(pageIdx)
    const pix = p.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
    const r = { w: pix.getWidth(), h: pix.getHeight(), px: new Uint8Array(pix.getPixels()) }
    pix.destroy?.()
    p.destroy?.()
    return r
  } finally {
    d.destroy?.()
  }
}

// Pixels changed by more than 32 outside the view-space boxes (+2 px).
export function pixelsOutside(a, b, boxes, scale = 2) {
  if (a.w !== b.w || a.h !== b.h) return { outside: -1, max: -1 }
  const m = boxes.map((r) => [r[0] * scale - 2, r[1] * scale - 2, r[2] * scale + 2, r[3] * scale + 2])
  let outside = 0
  let max = 0
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const i = (y * a.w + x) * 3
      const d = Math.max(Math.abs(a.px[i] - b.px[i]), Math.abs(a.px[i + 1] - b.px[i + 1]), Math.abs(a.px[i + 2] - b.px[i + 2]))
      if (d <= 32 || m.some((r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3])) continue
      outside++
      max = Math.max(max, d)
    }
  }
  return { outside, max }
}

// Ink pixels in a view-space box: far from the box's most common colour.
export function inkIn(img, box, scale = 2) {
  const x0 = Math.max(0, Math.floor(box[0] * scale))
  const y0 = Math.max(0, Math.floor(box[1] * scale))
  const x1 = Math.min(img.w - 1, Math.ceil(box[2] * scale))
  const y1 = Math.min(img.h - 1, Math.ceil(box[3] * scale))
  const freq = new Map()
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.w + x) * 3
      const k = (img.px[i] << 16) | (img.px[i + 1] << 8) | img.px[i + 2]
      freq.set(k, (freq.get(k) ?? 0) + 1)
    }
  }
  const bg = [...freq.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] ?? 0xffffff
  const c = [(bg >> 16) & 255, (bg >> 8) & 255, bg & 255]
  let ink = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * img.w + x) * 3
      if (Math.max(Math.abs(img.px[i] - c[0]), Math.abs(img.px[i + 1] - c[1]), Math.abs(img.px[i + 2] - c[2])) > 80) ink++
    }
  }
  return { ink, area: (x1 - x0 + 1) * (y1 - y0 + 1) }
}

// Every string the page's content draws or labels, decoded and joined: the
// page streams and the forms they draw (nested), and the marked-content
// /Properties. Literal and hex strings, UTF-16BE with BOM or Latin-1.
export function pageStrings(bytes, pageIdx) {
  const d = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf').asPDF()
  const out = []
  const seen = new Set()
  const dec = (arr) => (arr[0] === 0xfe && arr[1] === 0xff ? String.fromCharCode(...Array.from({ length: (arr.length - 2) >> 1 }, (_, i) => (arr[2 + 2 * i] << 8) | arr[3 + 2 * i])) : String.fromCharCode(...arr))
  const ESC = { n: 10, r: 13, t: 9, b: 8, f: 12 }
  const strings = (data) => {
    for (const m of data.matchAll(/\((?:[^()\\]|\\[\s\S])*\)|<([0-9a-fA-F\s]*)>/g)) {
      if (m[1] != null) {
        const h = m[1].replace(/\s/g, '')
        out.push(dec(Array.from({ length: h.length >> 1 }, (_, i) => parseInt(h.slice(2 * i, 2 * i + 2), 16))))
      } else {
        const s = m[0].slice(1, -1).replace(/\\([0-7]{1,3}|[\s\S])/g, (_, e) => (/^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8) & 255) : ESC[e] != null ? String.fromCharCode(ESC[e]) : e))
        out.push(dec(Array.from(s, (c) => c.charCodeAt(0))))
      }
    }
  }
  const stream = (ref) => {
    try {
      strings(Buffer.from(ref.readStream().asUint8Array()).toString('latin1'))
    } catch {
      /* not a stream */
    }
  }
  const walk = (res) => {
    if (!res || !res.isDictionary()) return
    const props = res.get('Properties')
    if (props.isDictionary()) props.forEach((v) => v.isDictionary() && v.forEach((x) => x.isString() && out.push(x.asString())))
    const xo = res.get('XObject')
    if (!xo.isDictionary()) return
    xo.forEach((x) => {
      if (!x.isIndirect() || seen.has(x.asIndirect()) || x.get('Subtype').toString() !== '/Form') return
      seen.add(x.asIndirect())
      stream(x)
      walk(x.get('Resources'))
    })
  }
  try {
    const p = d.findPage(pageIdx)
    const c = p.get('Contents')
    for (const s of c.isArray() ? Array.from({ length: c.length }, (_, i) => c.get(i)) : [c]) stream(s)
    walk(p.getInheritable('Resources'))
  } finally {
    d.destroy?.()
  }
  return out.join('')
}

// Checks one edited output. Returns facts for the metric line.
export async function checkEdit(ctx, { checkPdf, input, inputFacts, rel, target, edit, name, rep, ms, finalizeMs = 0, script, beforeImg, beforeStrings, pjBefore }) {
  const out = ctx.out(`${name}.pdf`)
  const label = name
  ctx.check(`${label}: not refused`, rep && !rep.refused, rep?.refused ?? 'no report')
  if (!rep || rep.refused) return null
  const f = await inputFacts(rel)
  const p = await checkPdf(ctx, `${name}.pdf`, { pages: f.pdfjs.pages, label })
  if (!p?.pdfjs.ok || !p.mupdf.ok) return null
  const idx = target.pageNum - 1
  const old = target.old
  // old text gone, with and without ActualText; it was unique in the file
  const def = docText(out)
  const raw = docText(out, 'preserve-whitespace,ignore-actualtext')
  const left = [count(squash(def.join('')), squash(old)), count(squash(raw.join('')), squash(old))]
  ctx.check(`${label}: old text gone (MuPDF)`, left[0] === 0 && left[1] === 0, `${left[0]} / ${left[1]} left`)
  const pj = p.pdfjs.texts?.[idx] ?? ''
  if (pjBefore > 0) ctx.check(`${label}: old text gone (pdf.js)`, count(squash(pj), squash(old)) === 0, `${pjBefore} -> ${count(squash(pj), squash(old))}`)
  // the replaced word is gone from every string of the page (content,
  // forms, ActualText/Alt/E) unless it is still visible elsewhere on it
  const visible = count(squash(raw[idx]), squash(old))
  const strs = count(pageStrings(out, idx), old)
  ctx.check(`${label}: old word gone from the page bytes`, visible === 0 ? strs === 0 : strs === 0 || strs < beforeStrings, `${beforeStrings} -> ${strs} (visible ${visible})`)
  const scan = rawScan(out, [])
  ctx.check(`${label}: no loose objects`, scan.orphans === 0, `${scan.orphans} orphans`)
  // new text extractable: MuPDF always, pdf.js (no ActualText support) soft for complex scripts
  // right-to-left fallback text: MuPDF can drop a combining mark at the word's end
  const noMarks = (x) => squash(x).replace(/\p{M}/gu, '')
  const exact = squash(def[idx]).includes(squash(edit.text))
  const rtl = /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(edit.text)
  ctx.check(`${label}: new text in MuPDF text`, exact || (rtl && noMarks(def[idx]).includes(noMarks(edit.text))), `"${edit.text}" not found`)
  if (rtl) ctx.check(`${label}: new text in MuPDF text with every mark`, exact, 'a combining mark is missing', { soft: true })
  const inPj = squash(pj).includes(squash(edit.text))
  ctx.check(`${label}: new text in pdf.js text`, inPj, `"${edit.text}" not found`, { soft: COMPLEX.test(edit.text) })
  // nothing changed outside the edited box; ink inside it
  const after = render(out, idx)
  const diff = pixelsOutside(beforeImg, after, [rep.changedBox])
  ctx.check(`${label}: no pixel changed outside the edited box`, diff.outside === 0, `${diff.outside} px (max delta ${diff.max})`)
  const inkNew = inkIn(after, rep.box)
  const inkOld = inkIn(beforeImg, target.box)
  const perNew = inkNew.ink / Math.max(1, graphemes(edit.text).length)
  const perOld = inkOld.ink / Math.max(1, graphemes(old).length)
  ctx.check(`${label}: ink in the edited box`, inkNew.ink > 0 && perNew >= 0.35 * perOld, `${inkNew.ink} px (${perNew.toFixed(0)}/glyph vs ${perOld.toFixed(0)} before)`)
  if (name === 'missing' && script === 'latin') ctx.check(`${label}: letter not in the file uses a fallback font`, rep.font === 'fallback', `font ${rep.font}`)
  if (name === 'same' && script === 'latin') ctx.check(`${label}: same letters keep the original font`, rep.font === 'original', `font ${rep.font} ${rep.fallbackName ?? ''}`, { soft: true })
  ctx.check(`${label}: edit under 3 s`, ms < 3000, `${ms} ms`)
  ctx.check(`${label}: edit under 1.5 s`, ms < 1500, `${ms} ms`, { soft: true })
  ctx.check(`${label}: finalize under 10 s`, finalizeMs < 10000, `${finalizeMs} ms`)
  return `${name} ${ms}+${finalizeMs}ms ${rep.font === 'original' ? 'orig' : rep.fallbackName}${rep.overflow ? ' overflow' : ''}${rep.shift ? ` shift ${rep.shift}` : ''}`
}

// Facts about the input the output checks compare against.
export async function beforeFacts(input, target, inputFacts, rel) {
  const f = await inputFacts(rel)
  const pj = f.pdfjs.texts?.[target.pageNum - 1] ?? ''
  return { beforeImg: render(input, target.pageNum - 1), beforeStrings: count(pageStrings(input, target.pageNum - 1), target.old), pjBefore: count(squash(pj), squash(target.old)) }
}

const short = (rel) => rel.split('/').pop().replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 24)

// First run on a page with this word.
export async function findWord(bytes, word, pageNum = 1) {
  const m = await pageTextModel(bytes, pageNum)
  for (const r of m.runs) {
    const w = r.words.find((x) => x.text === word)
    if (r.editable && w) return { pageNum, runId: r.id, wordIndex: w.i, old: word, line: r.text }
  }
  return null
}

// The widest line of a body paragraph on page 1: runs that share a left
// edge and font size (4 or more), the one reaching furthest right.
export async function widestLine(bytes) {
  const m = await pageTextModel(bytes, 1)
  const groups = new Map()
  for (const r of m.runs) {
    if (!r.editable || r.words.length < 4) continue
    const k = `${Math.round(r.bbox[0])}:${r.fontSize}`
    ;(groups.get(k) ?? groups.set(k, []).get(k)).push(r)
  }
  const best = [...groups.values()].filter((g) => g.length >= 4).sort((a, b) => b.length - a.length)[0]
  if (!best) return null
  const r = best.sort((a, b) => b.bbox[2] - a.bbox[2])[0]
  const w = r.words.find((x) => /^\p{L}{3,}$/u.test(x.text))
  if (!w) return null
  return { pageNum: 1, runId: r.id, wordIndex: w.i, old: w.text, text: `${w.text}abcdefgh`, line: r.text }
}

export default function register({ add, checkPdf, inputFacts, readRel, MIN }) {
  // ----- edit rows -----
  const editRows = (group, files, script = 'latin') => {
    for (const rel of files) {
      let target = null
      let edits = null
      add({
        id: `edittext-${group}-${short(rel)}`,
        tool: 'edittext',
        op: 'edittext:edit',
        files: [rel],
        timeout: 3 * MIN,
        quick: rel === files[0],
        async prepare() {
          const bytes = readRel(rel)
          target = await pickTarget(bytes, script)
          if (!target) return { skip: 'no unique editable word found' }
          const m = await pageTextModel(bytes, target.pageNum)
          target.box = m.runs.find((r) => r.id === target.runId).words[target.wordIndex].bbox
          edits = editsFor(target.old, script, docText(bytes).join('\n'))
          return { ...target, edits }
        },
        async validate(ctx) {
          const meta = ctx.meta
          ctx.check('browser model agrees with Node', meta?.word === target.old && !meta.why, `browser "${meta?.word}" why ${meta?.why}`)
          const input = readRel(rel)
          const before = await beforeFacts(input, target, inputFacts, rel)
          const facts = []
          for (const [k, ed] of edits.entries()) {
            const e = meta.edits[k]
            const fact = await checkEdit(ctx, { checkPdf, input, inputFacts, rel, target, edit: ed, name: ed.name, rep: e?.report, ms: e?.ms ?? 0, finalizeMs: e?.finalizeMs ?? 0, script, ...before })
            if (fact) facts.push(fact)
          }
          ctx.metric(`"${target.old}" p${target.pageNum} (${target.fontName}); model ${meta.modelMs}ms; ${facts.join('; ')}`)
        },
      })
    }
  }
  editRows('invoice', ['invoices/aws-invoice.pdf', 'invoices/flipkart-invoice.pdf', 'invoices/azure-interior.pdf'])
  editRows('report', ['reports/pdfjs-tracemonkey.pdf', 'reports/arxiv-1706.03762-attention.pdf', 'reports/us-budget-2024.pdf'])
  editRows('rotated', ['forms/irs-fw9.pdf', 'derived/rot90-cropbox-bert.pdf', 'derived/c-rot270-cropbox.pdf'])
  editRows('intl', ['intl/udhr-arabic.pdf'], 'arabic')
  editRows('intl', ['intl/udhr-chinese-simplified.pdf'], 'cjk')
  editRows('intl', [HINDI], 'devanagari')

  // ----- refusals: the model marks the run, the edit is refused, bytes stay -----
  const refuseRow = (rel, why, pick) => {
    add({
      id: `edittext-refuse-${why}-${short(rel)}`,
      tool: 'edittext',
      op: 'edittext:refuse',
      files: [rel],
      timeout: 2 * MIN,
      async prepare() {
        const m = await pageTextModel(readRel(rel), 1)
        const run = pick(m)
        if (!run) return { skip: `no run marked ${why} on page 1 (${m.runs.length} runs)` }
        return { pageNum: 1, runId: run.id, wordIndex: null }
      },
      async validate(ctx) {
        const meta = ctx.meta
        ctx.check(`model marks the text ${why}`, meta.why === why, `why ${meta.why}`)
        ctx.check(`edit refused as ${why}`, meta.report?.refused === why, `refused ${meta.report?.refused}`)
        ctx.check('file unchanged', meta.unchanged)
        if (why === 'scanned') ctx.check('page reported as scanned', meta.scanned === true)
        ctx.metric(`model ${meta.modelMs}ms, ${meta.runs} runs, refused "${meta.report?.refused}" in ${meta.ms}ms`)
      },
    })
  }
  refuseRow('scanned/fax-jean-schmidt-doe.pdf', 'scanned', (m) => m.runs.find((r) => r.why === 'scanned'))
  refuseRow('intl/pdfjs-vertical.pdf', 'vertical', (m) => m.runs.find((r) => r.why === 'vertical'))
  refuseRow('intl/udhr-hebrew.pdf', 'no-unicode', (m) => m.runs.find((r) => r.why === 'no-unicode'))

  // ----- several edits in one call: two words on one line, one on another -----
  {
    const rel = 'invoices/aws-invoice.pdf'
    let batch = null
    add({
      id: 'edittext-batch-aws-invoice',
      tool: 'edittext',
      op: 'edittext:batch',
      files: [rel],
      timeout: 2 * MIN,
      async prepare() {
        const bytes = readRel(rel)
        const all = docText(bytes).join('\n')
        const m = await pageTextModel(bytes, 1)
        const ok = (w) => /^\p{L}{4,}$/u.test(w.text) && count(all, w.text) === 1
        const two = m.runs.find((r) => r.editable && r.words.filter(ok).length >= 2)
        const one = m.runs.find((r) => r.editable && r !== two && r.words.some(ok))
        if (!two || !one) return { skip: 'no suitable words' }
        const [w1, w2] = two.words.filter(ok)
        const w3 = one.words.find(ok)
        batch = [
          { runId: two.id, wordIndex: w1.i, old: w1.text, text: `${w1.text}xyz`, box: w1.bbox },
          { runId: two.id, wordIndex: w2.i, old: w2.text, text: w2.text.toUpperCase(), box: w2.bbox },
          { runId: one.id, wordIndex: w3.i, old: w3.text, text: w3.text.slice(0, 2), box: w3.bbox },
        ]
        return { pageNum: 1, batch: batch.map(({ box, ...e }) => e) }
      },
      async validate(ctx) {
        const reps = ctx.meta.report
        ctx.check('all three applied', reps.every((r) => !r.refused), reps.map((r) => r.refused).join(','))
        const p = await checkPdf(ctx, 'batch.pdf', { pages: (await inputFacts(rel)).pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const out = ctx.out('batch.pdf')
        const def = docText(out)
        for (const e of batch) {
          ctx.check(`"${e.old}" gone`, count(def.join('\n'), e.old) === 0 || e.text.includes(e.old), `${count(def.join('\n'), e.old)} left`)
          ctx.check(`"${e.text}" found`, squash(def[0]).includes(squash(e.text)))
        }
        const diff = pixelsOutside(render(readRel(rel), 0), render(out, 0), reps.map((r) => r.changedBox))
        ctx.check('no pixel changed outside the edited boxes', diff.outside === 0, `${diff.outside} px (max ${diff.max})`)
        ctx.metric(`3 edits in ${ctx.meta.ms}ms; ${reps.map((r) => `${r.font}${r.shift ? ` shift ${r.shift}` : ''}`).join(', ')}`)
      },
    })
  }

  // ----- fit: longer text squeezed into the old width, nothing moves -----
  {
    const rel = 'reports/pdfjs-tracemonkey.pdf'
    let target = null
    add({
      id: 'edittext-fit-pdfjs-tracemonkey',
      tool: 'edittext',
      op: 'edittext:edit',
      files: [rel],
      timeout: 2 * MIN,
      async prepare() {
        const bytes = readRel(rel)
        target = await pickTarget(bytes)
        if (!target) return { skip: 'no word' }
        return { ...target, edits: [{ name: 'fit', text: `${target.old}abc`, fit: true }] }
      },
      async validate(ctx) {
        const e = ctx.meta.edits[0]
        const rep = e.report
        ctx.check('applied', !rep.refused, rep.refused)
        ctx.check('squeezed', rep.fit != null && rep.fit < 1, `fit ${rep.fit}`)
        ctx.check('nothing moved, no overflow', !rep.shift && !rep.overflow, `shift ${rep.shift} overflow ${rep.overflow}`)
        const out = ctx.out('fit.pdf')
        const diff = pixelsOutside(render(readRel(rel), target.pageNum - 1), render(out, target.pageNum - 1), [rep.changedBox])
        ctx.check('no pixel changed outside the old word', diff.outside === 0, `${diff.outside} px`)
        ctx.check('new text found', squash(docText(out)[target.pageNum - 1]).includes(squash(`${target.old}abc`)))
        ctx.metric(`"${target.old}" -> +abc at ${rep.fit} in ${e.ms}ms`)
      },
    })
  }

  // ----- overflow: a short line that grows is fine; the widest line of a paragraph is not -----
  const withText = (t, text) => t && { ...t, text }
  const overflowRow = (id, rel, pick, want) => {
    let target = null
    add({
      id: `edittext-overflow-${id}`,
      tool: 'edittext',
      op: 'edittext:edit',
      files: [rel],
      timeout: 2 * MIN,
      async prepare() {
        target = await pick(readRel(rel))
        if (!target) return { skip: 'no target' }
        return { ...target, edits: [{ name: 'grow', text: target.text }] }
      },
      async validate(ctx) {
        const e = ctx.meta.edits[0]
        const rep = e.report
        // a line that cannot be pushed (a glyph that does not re-encode) is
        // squeezed instead; too narrow is refused 'no-room': both are fine
        // for the widest line, never a silent overlap
        const stayed = want && rep.noPush && (rep.fit || rep.refused === 'no-room')
        ctx.check('applied', !rep.refused || stayed, rep.refused)
        ctx.check(want ? 'overflow reported (or squeezed / no-room when the line cannot move)' : 'no overflow reported', rep.overflow === want || stayed, `overflow ${rep.overflow} noPush ${rep.noPush} fit ${rep.fit} refused ${rep.refused}`)
        const ms = e.engineMs
        ctx.check('ms { edit, save, total } numbers through the worker', ms && ['edit', 'save', 'total'].every((k) => typeof ms[k] === 'number'), JSON.stringify(ms))
        ctx.metric(`"${target.old}" -> "${target.text}" in "${target.line.slice(0, 40)}": overflow ${rep.overflow}, pushed ${rep.pushed}, ${rep.font}, ms ${JSON.stringify(ms)}`)
      },
    })
  }
  overflowRow('short-usage', 'invoices/aws-invoice.pdf', async (b) => withText(await findWord(b, 'Usage'), 'UQage'), false)
  overflowRow('short-check', 'invoices/aws-invoice.pdf', async (b) => withText(await findWord(b, 'Check'), 'Checkabc'), false)
  overflowRow('widest-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', widestLine, true)
  overflowRow('widest-attention', 'reports/arxiv-1706.03762-attention.pdf', widestLine, true)

  // ----- review fixes (2026-10-28) -----
  // A row on the generic edit op: pick(bytes) -> target, edits, check(ctx, target, meta, outs).
  const fixRow = (id, rel, pick, edits, check) => {
    let target = null
    add({
      id: `edittext-${id}`,
      tool: 'edittext',
      op: 'edittext:edit',
      files: [rel],
      timeout: 3 * MIN,
      async prepare() {
        target = await pick(readRel(rel))
        if (!target) return { skip: 'no target' }
        return { ...target, edits }
      },
      async validate(ctx) {
        await check(ctx, target, ctx.meta)
        ctx.metric(`"${target.old}" p${target.pageNum}: ${ctx.meta.edits.map((e) => `${e.name} ${e.report.refused ?? e.report.font}${e.report.fit ? ` fit ${e.report.fit}` : ''}${e.report.noPush ? ` noPush ${e.report.noPush}` : ''} ${e.ms}+${e.finalizeMs}ms`).join('; ')}`)
      },
    })
  }
  const strs = (bytes, idx) => pageStrings(bytes, idx)

  // P0-1: old text inside an ActualText span must not survive (edit and delete)
  fixRow('actualtext-synthetic', ACTUALTEXT, (b) => findWord(b, 'PATIENTNAME'), [{ name: 'jane', text: 'Jane' }, { name: 'delete', text: '' }], async (ctx, t, meta) => {
    for (const e of meta.edits) {
      ctx.check(`${e.name}: applied`, !e.report.refused, e.report.refused)
      const out = ctx.out(`${e.name}.pdf`)
      const s = strs(out, 0)
      ctx.check(`${e.name}: PATIENTNAME and Johnny gone from the page bytes`, !s.includes('PATIENTNAME') && !s.includes('Johnny'), s.slice(0, 80))
      const txt = docText(out)[0]
      ctx.check(`${e.name}: other line kept`, txt.includes('Tail line'))
      if (e.name === 'jane') ctx.check('jane: new text extracts', squash(txt).includes('Jane'), txt)
    }
  })
  // us-budget puts ActualText (UTF-16 literals) on pieces of words ("ssag"
  // in a word): edit a unique word that holds such a piece
  const actualTextWord = async (b) => {
    const d = mupdf.Document.openDocument(new Uint8Array(b), 'application/pdf').asPDF()
    const frags = []
    const utf = (lit) => {
      const s = lit.replace(/\\([0-7]{1,3}|[\s\S])/g, (_, e) => (/^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8) & 255) : e))
      if (s.charCodeAt(0) !== 0xfe || s.charCodeAt(1) !== 0xff) return s
      let o = ''
      for (let i = 2; i + 1 < s.length; i += 2) o += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1))
      return o
    }
    try {
      for (let i = 2; i < Math.min(d.countPages(), 30); i++) {
        const c = d.findPage(i).get('Contents')
        const data = (c.isArray() ? Array.from({ length: c.length }, (_, k) => c.get(k)) : [c]).map((x) => Buffer.from(x.readStream().asUint8Array()).toString('latin1')).join('\n')
        for (const m of data.matchAll(/\/ActualText\s*\(((?:[^()\\]|\\[\s\S])*)\)/g)) {
          const v = utf(m[1])
          if (/^\p{L}{3,}$/u.test(v)) frags.push([i + 1, v])
        }
      }
    } finally {
      d.destroy?.()
    }
    const all = squash(docText(b).join(''))
    for (const [p, f] of frags) {
      const m = await pageTextModel(b, p)
      for (const r of m.runs) {
        const w = r.editable && r.words.find((x) => x.text.includes(f) && /^\p{L}{5,}$/u.test(x.text) && count(all, x.text) === 1)
        if (w) return { pageNum: p, runId: r.id, wordIndex: w.i, old: w.text, frag: f, line: r.text }
      }
    }
    return null
  }
  fixRow('actualtext-us-budget', 'reports/us-budget-2024.pdf', actualTextWord, [{ name: 'at', text: 'Qwerty' }], async (ctx, t, meta) => {
    const e = meta.edits[0]
    ctx.check('applied', !e.report.refused, e.report.refused)
    const out = ctx.out('at.pdf')
    const idx = t.pageNum - 1
    const left = [count(squash(docText(out)[idx]), t.old), count(squash(docText(out, 'preserve-whitespace,ignore-actualtext')[idx]), t.old)]
    ctx.check('old word gone from the text, with and without ActualText', left[0] === 0 && left[1] === 0, left.join(' / '))
    const before = count(strs(readRel('reports/us-budget-2024.pdf'), idx), t.frag)
    const after = count(strs(out, idx), t.frag)
    ctx.check(`its ActualText piece "${t.frag}" is cut from the page strings`, after < before, `${before} -> ${after}`)
    ctx.check('new text extracts', squash(docText(out)[idx]).includes('Qwerty'))
    ctx.check('edit under 3 s, finalize under 10 s', e.ms < 3000 && e.finalizeMs < 10000, `${e.ms} + ${e.finalizeMs} ms`)
  })

  // P0-2: a white box drawn over the end of the line keeps hiding it
  fixRow('whitebox-no-push', WHITEBOX, (b) => findWord(b, 'Visible'), [{ name: 'grow', text: 'Visibles' }], async (ctx, t, meta) => {
    const r = meta.edits[0].report
    ctx.check('applied squeezed or refused no-room', !r.refused || r.refused === 'no-room', r.refused)
    ctx.check('rest of the line not pushed', !r.pushed && r.noPush === 'covered', `pushed ${r.pushed} noPush ${r.noPush}`)
    const diff = pixelsOutside(render(readRel(WHITEBOX), 0), render(ctx.out('grow.pdf'), 0), r.changedBox ? [r.changedBox] : [])
    ctx.check('hidden text stays hidden (no pixel changed outside the old word)', diff.outside === 0, `${diff.outside} px`)
  })

  // P1-4: tight line spacing; 0.75 em is refused unchanged, 0.9 em edits without touching neighbours
  const tightRow = (id, pageNum, expectApplied) =>
    fixRow(id, TIGHT, (b) => findWord(b, 'Kilo', pageNum), [{ name: 'grow', text: 'KiloWide' }], async (ctx, t, meta) => {
      const e = meta.edits[0]
      if (!expectApplied) {
        ctx.check('refused as tight-lines', e.report.refused === 'tight-lines', e.report.refused)
        ctx.check('page unchanged', e.unchanged)
        return
      }
      ctx.check('applied', !e.report.refused, e.report.refused)
      const txt = docText(ctx.out('grow.pdf'))[pageNum - 1]
      const keep = ['line one alpha bravo charlie', 'line two delta echo foxtrot', 'line four golf hotel india', 'line five juliet mike oscar']
      ctx.check('neighbour lines unchanged', keep.every((l) => txt.includes(l)), JSON.stringify(txt))
      const diff = pixelsOutside(render(readRel(TIGHT), pageNum - 1), render(ctx.out('grow.pdf'), pageNum - 1), [e.report.changedBox])
      ctx.check('no pixel changed outside the edited line', diff.outside === 0, `${diff.outside} px`)
    })
  tightRow('tight-075', 1, false)
  tightRow('tight-090', 2, true)

  // ----- blind test fixes (2026-10-28) -----
  // Inline images (BI ... EI) of a page's content streams, as text.
  const inlineOf = (bytes, idx) => {
    const d = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf').asPDF()
    try {
      const c = d.findPage(idx).get('Contents')
      const data = (c.isArray() ? Array.from({ length: c.length }, (_, k) => c.get(k)) : [c]).map((x) => Buffer.from(x.readStream().asUint8Array()).toString('latin1')).join('\n')
      return [...data.matchAll(/(?:^|[\s>\]])(BI[\s/][\s\S]*?\sID\s[\s\S]*?\sEI)(?=[\s]|$)/g)].map((m) => m[1])
    } finally {
      d.destroy?.()
    }
  }
  // P0: an edit on a page with inline images keeps every image byte for byte
  const inlineRow = (id, rel, word, text) =>
    fixRow(id, rel, (b) => findWord(b, word), [{ name: 'ed', text }], async (ctx, t, meta) => {
      const e = meta.edits[0]
      ctx.check('applied', !e.report.refused, e.report.refused)
      const out = ctx.out('ed.pdf')
      const before = inlineOf(readRel(rel), 0)
      const after = inlineOf(out, 0)
      ctx.check('inline images unchanged, byte for byte', before.length > 0 && before.length === after.length && before.every((x, i) => x === after[i]), `${before.length} -> ${after.length}`)
      const diff = pixelsOutside(render(readRel(rel), 0), render(out, 0), [e.report.changedBox])
      ctx.check('no pixel changed outside the edited box', diff.outside === 0, `${diff.outside} px (max ${diff.max})`)
    })
  inlineRow('inline-synthetic', INLINE, 'image', 'picture')
  inlineRow('inline-tam-password', TAM, 'Indiana', 'Purdue')
  inlineRow('inline-tam', 'reports/pdfjs-TAMReview.pdf', 'Indiana', 'Purdue')

  // Redact remove mode has the same MuPDF inline-image damage (redactOps.js):
  // a box away from the inline images keeps them byte for byte; a box over
  // one sends the page to the picture path, box painted, nothing leaks.
  const redactRow = (id, boxOf, check, rel = 'reports/pdfjs-TAMReview.pdf') => {
    let boxes = null
    add({
      id: `edittext-redact-${id}`,
      tool: 'redact',
      op: 'edittext:redact',
      files: [rel],
      timeout: 2 * MIN,
      async prepare() {
        boxes = [{ pageNum: 1, ...boxOf() }]
        return { boxes }
      },
      async validate(ctx) {
        const out = ctx.out('redacted.pdf')
        ctx.check('output written', !!out)
        if (!out) return
        const { bad } = redactionLeaks(out, [], { pages: 'all', boxes })
        ctx.check('nothing left under the box (leak checks)', bad.length === 0, bad.join('; '))
        await check(ctx, out, boxes[0])
        ctx.metric(`raster pages ${JSON.stringify(ctx.meta.rasterPages)} in ${ctx.meta.ms} ms`)
      },
    })
  }
  // the inline images of TAM page 1: grey logo at [72, 38, 178, 69], the indexed rule at [72, 69.2, 536.3, 74.5]
  redactRow('inline-away', () => ({ x: 300, y: 500, w: 80, h: 20 }), async (ctx, out, box) => {
    ctx.check('page stays vector', !(ctx.meta.rasterPages ?? []).includes(1), JSON.stringify(ctx.meta.rasterPages))
    const before = inlineOf(readRel('reports/pdfjs-TAMReview.pdf'), 0)
    const after = inlineOf(out, 0)
    ctx.check('inline images unchanged, byte for byte', before.length === 2 && before.length === after.length && before.every((x, i) => x === after[i]), `${before.length} -> ${after.length}`)
    // glyphs that touch the box go whole, so allow 12 pt around it; the header
    // bar (inline images, y 38 to 75) is far away and must render the same
    const diff = pixelsOutside(render(readRel('reports/pdfjs-TAMReview.pdf'), 0), render(out, 0), [[box.x - 12, box.y - 12, box.x + box.w + 12, box.y + box.h + 12]])
    ctx.check('header bar and everything away from the box render the same', diff.outside === 0, `${diff.outside} px`)
  })
  redactRow('inline-over', () => ({ x: 72, y: 68, w: 464, h: 8 }), async (ctx, out, box) => {
    ctx.check('page becomes a picture', (ctx.meta.rasterPages ?? []).includes(1), JSON.stringify(ctx.meta.rasterPages))
    const img = render(out, 0)
    let dark = 0
    let n = 0
    for (let y = Math.ceil(box.y * 2) + 1; y < Math.floor((box.y + box.h) * 2) - 1; y++) {
      for (let x = Math.ceil(box.x * 2) + 1; x < Math.floor((box.x + box.w) * 2) - 1; x++) {
        const i = (y * img.w + x) * 3
        n++
        if (img.px[i] < 40 && img.px[i + 1] < 40 && img.px[i + 2] < 40) dark++
      }
    }
    ctx.check('box painted black', n > 0 && dark / n > 0.98, `${dark}/${n}`)
  })

  // split /Contents (round 4 review): the image's transform is set in an
  // earlier stream; half of the image under the box must not survive
  const blackBox = (ctx, out, box) => {
    const img = render(out, 0)
    let dark = 0
    let n = 0
    for (let y = Math.ceil(box.y * 2) + 1; y < Math.floor((box.y + box.h) * 2) - 1; y++) {
      for (let x = Math.ceil(box.x * 2) + 1; x < Math.floor((box.x + box.w) * 2) - 1; x++) {
        const i = (y * img.w + x) * 3
        n++
        if (img.px[i] < 40 && img.px[i + 1] < 40 && img.px[i + 2] < 40) dark++
      }
    }
    ctx.check('box painted black', n > 0 && dark / n > 0.98, `${dark}/${n}`)
  }
  const half = () => ({ x: 172, y: 142, w: 50, h: 50 }) // left half of the image (view space)
  for (const [id, rel] of [['split-translate-half', SPLIT_A], ['split-scale-half', SPLIT_A2]]) {
    redactRow(
      id,
      half,
      async (ctx, out, box) => {
        ctx.check('page becomes a picture', (ctx.meta.rasterPages ?? []).includes(1), JSON.stringify(ctx.meta.rasterPages))
        ctx.check('no inline image data left on the page', inlineOf(out, 0).length === 0, `${inlineOf(out, 0).length} inline images`)
        blackBox(ctx, out, box)
      },
      rel,
    )
  }
  redactRow(
    'split-translate-away',
    () => ({ x: 400, y: 300, w: 60, h: 20 }),
    async (ctx, out) => {
      ctx.check('page stays vector', !(ctx.meta.rasterPages ?? []).includes(1), JSON.stringify(ctx.meta.rasterPages))
      const before = inlineOf(readRel(SPLIT_A), 0)
      const after = inlineOf(out, 0)
      ctx.check('inline image unchanged, byte for byte', before.length === 1 && after.length === 1 && before[0] === after[0], `${before.length} -> ${after.length}`)
    },
    SPLIT_A,
  )

  // P1: longer text that would run into the next column is squeezed (or refused), never overprinted
  const wholeLine = async (b, pred, pageNum = 1) => {
    const m = await pageTextModel(b, pageNum)
    const r = m.runs.find((x) => x.editable && pred(x.text))
    return r && { pageNum, runId: r.id, wordIndex: null, old: r.text, line: r.text }
  }
  const noOverprint = (rel) => async (ctx, t, meta) => {
    const e = meta.edits[0]
    const r = e.report
    ctx.check('squeezed or refused no-room, overflow reported', (r.noPush === 'collision' && r.fit && r.fit < 1 && r.overflow) || r.refused === 'no-room', JSON.stringify({ noPush: r.noPush, fit: r.fit, refused: r.refused, overflow: r.overflow }))
    if (r.refused) return
    const m = await pageTextModel(readRel(rel), t.pageNum)
    const hit = m.runs.filter((x) => x.id !== t.runId).flatMap((x) => x.words).find((w) => {
      const ix = Math.min(w.bbox[2], r.box[2]) - Math.max(w.bbox[0], r.box[0])
      const iy = Math.min(w.bbox[3], r.box[3]) - Math.max(w.bbox[1], r.box[1])
      return ix > 0.5 && iy > 0.3 * (w.bbox[3] - w.bbox[1])
    })
    ctx.check('new text does not overlap other text', !hit, hit ? `over "${hit.text}"` : '')
    const diff = pixelsOutside(render(readRel(rel), t.pageNum - 1), render(ctx.out('ed.pdf'), t.pageNum - 1), [r.changedBox])
    ctx.check('no pixel changed outside the edited box', diff.outside === 0, `${diff.outside} px`)
  }
  fixRow('collision-flipkart-billing', 'invoices/flipkart-invoice.pdf', (b) => wholeLine(b, (s) => s.includes('near Fun republic')), [{ name: 'ed', text: 'near Fun republic mall and nehru place extra words' }], noOverprint('invoices/flipkart-invoice.pdf'))
  fixRow('collision-attention-email', 'reports/arxiv-1706.03762-attention.pdf', (b) => findWord(b, 'noam@google.com'), [{ name: 'ed', text: 'noam@example.org' }], noOverprint('reports/arxiv-1706.03762-attention.pdf'))

  // P1: a whole-line edit with the line text the model shows as `old` applies
  fixRow('whole-line-flipkart-soldby', 'invoices/flipkart-invoice.pdf', (b) => wholeLine(b, (s) => s.includes('WS Retail Services')), [{ name: 'ed', text: 'WS Retail' }], async (ctx, t, meta) => {
    const e = meta.edits[0]
    ctx.check('applied (not stale)', !e.report.refused, e.report.refused)
    // the seller name is printed more than once on the page: one copy fewer
    const n = (bytes) => count(squash(docText(bytes)[0]), 'WSRetailServices')
    const n0 = n(readRel('invoices/flipkart-invoice.pdf'))
    const n1 = n(ctx.out('ed.pdf'))
    ctx.check('line replaced', n1 === n0 - 1, `${n0} -> ${n1}`)
  })

  // P2: text under a faint (transparent) seal is editable, the model says so up front
  fixRow('covered-faint-us-budget', 'reports/us-budget-2024.pdf', (b) => findWord(b, 'OFFICE'), [{ name: 'ed', text: 'BUREAU' }], async (ctx, t, meta) => {
    const e = meta.edits[0]
    ctx.check('model: editable, not covered', !meta.why, `why ${meta.why}`)
    ctx.check('applied', !e.report.refused, e.report.refused)
  })

  // P2: shorter text pulls the rest of a left-aligned line back (no gap)
  fixRow('pull-left-flipkart', 'invoices/flipkart-invoice.pdf', (b) => findWord(b, 'Services'), [{ name: 'ed', text: 'Stores' }], async (ctx, t, meta) => {
    const r = meta.edits[0].report
    ctx.check('applied, rest of the line pulled left', !r.refused && r.pushed < -0.3, `pushed ${r.pushed}`)
    const gapOf = async (bytes, word) => {
      const m = await pageTextModel(bytes, 1)
      for (const run of m.runs) {
        const k = run.words.findIndex((w) => w.text === word)
        if (k >= 0 && run.words[k + 1]) return run.words[k + 1].bbox[0] - run.words[k].bbox[2]
      }
      return null
    }
    const g0 = await gapOf(readRel('invoices/flipkart-invoice.pdf'), 'Services')
    const g1 = await gapOf(ctx.out('ed.pdf'), 'Stores')
    ctx.check('word gap kept', g0 != null && g1 != null && Math.abs(g1 - g0) < 1, `${g0?.toFixed(2)} -> ${g1?.toFixed(2)}`)
  })

  // P2: a centred title stays centred when the whole line changes
  fixRow('centred-attention-title', 'reports/arxiv-1706.03762-attention.pdf', (b) => wholeLine(b, (s) => s.includes('Attention Is All You Need')), [{ name: 'ed', text: 'Attention Is Everything We Want' }], async (ctx, t, meta) => {
    const r = meta.edits[0].report
    ctx.check('applied, kept centred', !r.refused && r.align === 'centre', `align ${r.align}`)
    const m = await pageTextModel(readRel('reports/arxiv-1706.03762-attention.pdf'), 1)
    const old = m.runs.find((x) => x.id === t.runId).bbox
    const c0 = (old[0] + old[2]) / 2
    const c1 = (r.box[0] + r.box[2]) / 2
    ctx.check('new line centred on the old centre', Math.abs(c1 - c0) < 1.5, `${c0.toFixed(1)} vs ${c1.toFixed(1)}`)
  })

  // P1-3: ten edits of the same word, re-reading the model each time
  {
    const rel = 'invoices/aws-invoice.pdf'
    const TEXTS = ['Wqqqq', 'Zqxvjk', '\u0928\u092e\u0938\u094d\u0924\u0947', 'Final', 'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']
    add({
      id: 'edittext-repeat-aws-invoice',
      tool: 'edittext',
      op: 'edittext:repeat',
      files: [rel],
      timeout: 3 * MIN,
      async prepare() {
        const t = await findWord(readRel(rel), 'estimated')
        return t ? { ...t, texts: TEXTS } : { skip: 'no word' }
      },
      async validate(ctx) {
        const m = ctx.meta
        ctx.check('all 10 edits applied', m.steps.length === TEXTS.length && m.steps.every((s) => s.report && !s.report.refused), JSON.stringify(m.steps.map((s) => s.lost ?? s.report?.refused ?? 'ok')))
        ctx.check('no growth: within 4 KB of one direct edit', m.size <= m.oneSize + 4096, `${m.size} vs ${m.oneSize}`)
        const out = ctx.out('repeat.pdf')
        const s = strs(out, 0)
        const txt = squash(docText(out)[0])
        const left = ['estimated', ...TEXTS.slice(0, -1)].filter((w) => s.includes(w) || txt.includes(w))
        ctx.check('earlier values gone from the page text and bytes', left.length === 0, left.join(', '))
        ctx.check('last value shown', txt.includes('Foxtrot'))
        const boxes = m.steps.map((x) => x.report.changedBox).filter(Boolean)
        const diff = pixelsOutside(render(readRel(rel), 0), render(out, 0), boxes)
        ctx.check('no stray glyphs outside the edited boxes', diff.outside === 0, `${diff.outside} px`)
        ctx.metric(`10 edits ${m.steps.map((x) => x.ms).join('/')} ms, finalize ${m.finalizeMs} ms, ${m.size} B vs ${m.oneSize} B`)
      },
    })
  }

  // ----- signed file: allowed, the signature field is dropped -----
  {
    let target = null
    add({
      id: 'edittext-signed-aws-invoice',
      tool: 'edittext',
      op: 'edittext:edit',
      files: [SIGNED],
      timeout: 2 * MIN,
      async prepare() {
        target = await pickTarget(readRel(SIGNED))
        if (!target) return { skip: 'no word' }
        return { ...target, edits: [{ name: 'signed', text: `${target.old}s` }] }
      },
      async validate(ctx) {
        const e = ctx.meta.edits[0]
        ctx.check('model says signed', ctx.meta.signed === true)
        ctx.check('edit applied', !e.report.refused, e.report.refused)
        ctx.check('signatureRemoved reported', e.signatureRemoved === true)
        const out = ctx.out('signed.pdf')
        const d = mupdf.Document.openDocument(new Uint8Array(out), 'application/pdf').asPDF()
        let sigs = 0
        try {
          const af = d.getTrailer().get('Root').get('AcroForm')
          const fields = af.isDictionary() ? af.get('Fields') : null
          if (fields?.isArray()) for (let i = 0; i < fields.length; i++) if (fields.get(i).get('FT').toString() === '/Sig') sigs++
          const annots = d.findPage(0).get('Annots')
          if (annots.isArray()) for (let i = 0; i < annots.length; i++) if (annots.get(i).get('FT').toString() === '/Sig') sigs++
        } finally {
          d.destroy?.()
        }
        ctx.check('signature field and widget gone', sigs === 0, `${sigs} left`)
        ctx.metric(`"${target.old}" edited in ${e.ms}ms, signature removed`)
      },
    })
  }
}
