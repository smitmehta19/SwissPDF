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
import { pageTextModel as readModel, editText as nodeEdit } from '../../src/lib/editTextOps.js'

// the paragraph rows need the paragraph model (opt-in since the ship prep)
const pageTextModel = (bytes, pageNum) => readModel(bytes, pageNum, { paragraphs: true })

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
// A page that draws a form XObject holding an inline image with an
// abbreviated Indexed colour space (the kind MuPDF's redaction filter breaks).
const FORM_INLINE = 'derived/edittext-form-inline.pdf'
function buildFormInline() {
  const dest = join(CORPUS_DIR, FORM_INLINE)
  if (existsSync(dest)) return
  const doc = new mupdf.PDFDocument()
  try {
    const res = doc.newDictionary()
    const fd = doc.newDictionary()
    fd.put('F1', doc.addSimpleFont(new mupdf.Font('Helvetica'), 'Latin'))
    res.put('Font', fd)
    const fdict = doc.newDictionary()
    fdict.put('Type', doc.newName('XObject'))
    fdict.put('Subtype', doc.newName('Form'))
    const bb = doc.newArray()
    for (const v of [0, 0, 300, 40]) bb.push(v)
    fdict.put('BBox', bb)
    // the edited text sits in the same form, so the redaction filters it
    fdict.put('Resources', res)
    const form = doc.addStream('BT /F1 12 Tf 0 20 Td (Form image test line here) Tj ET q 200 0 0 10 0 0 cm BI /W 4 /H 1 /BPC 8 /CS [/I /RGB 3 <FF000000FF000000FFFFFFFF>] /F /AHx ID 00010203> EI Q', fdict)
    const xo = doc.newDictionary()
    xo.put('Fm1', form)
    const pres = doc.newDictionary()
    pres.put('Font', fd)
    pres.put('XObject', xo)
    doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, pres, 'q 1 0 0 1 72 650 cm /Fm1 Do Q BT /F1 12 Tf 72 600 Td (Text below the form) Tj ET'))
    writeFileSync(dest, new Uint8Array(doc.saveToBuffer('compress').asUint8Array()))
  } finally {
    doc.destroy?.()
  }
}
// Review fixtures (2026-10-28): a tagged paragraph whose StructElem carries
// the text in /ActualText and /Alt, and a paragraph inside a frame, a table
// grid and with an underline drawn after it.
const STRUCT = 'derived/edittext-struct.pdf'
const P_LINES = ['The quick brown fox jumps over the lazy dog and keeps', 'running across the field until the sun goes down at', 'last, tired but happy with the long day it had today.']
const pText = (lines, x, y0, lead) => lines.map((l, i) => `BT /F1 10 Tf ${x} ${y0 - i * lead} Td (${l}) Tj ET`).join('\n')
const DECOR = {
  frame: `0 0 0 RG 1 w 66 610 300 52 re S\n${pText(P_LINES, 72, 650, 12)}`,
  grid: `0 0 0 RG 0.5 w 66 662 m 366 662 l 66 612 m 366 612 l 66 520 m 366 520 l 66 662 m 66 520 l 366 662 m 366 520 l S\n${pText(P_LINES, 72, 650, 12)}\nBT /F1 10 Tf 72 530 Td (Next row cell text) Tj ET`,
  underline: `${pText(P_LINES, 72, 650, 12)}\n0 0 1 RG 0.5 w 72 636 m 200 636 l S`,
  // report-style white field boxes under each line (unseen on the page)
  whitefill: `1 1 1 rg 70 646 250 14 re f 70 634 250 14 re f 70 622 250 14 re f 0 g\n${pText(P_LINES, 72, 650, 12)}`,
}
function buildStruct() {
  const dest = join(CORPUS_DIR, STRUCT)
  if (existsSync(dest)) return
  const doc = new mupdf.PDFDocument()
  try {
    const res = doc.newDictionary()
    const fd = doc.newDictionary()
    fd.put('F1', doc.addSimpleFont(new mupdf.Font('Helvetica'), 'Latin'))
    res.put('Font', fd)
    const lines = ['Patient Johnsonwell was seen today for a routine', 'check and all results came back fine and normal', 'so no further visits are needed this year at all.']
    doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, res, `/P <</MCID 0>> BDC\n${pText(lines, 72, 650, 12)}\nEMC\nBT /F1 10 Tf 72 400 Td (Another paragraph stays here) Tj ET`))
    const pobj = doc.findPage(0)
    const root = doc.getTrailer().get('Root')
    const str = doc.addObject(doc.newDictionary())
    str.put('Type', doc.newName('StructTreeRoot'))
    const el = doc.newDictionary()
    el.put('Type', doc.newName('StructElem'))
    el.put('S', doc.newName('P'))
    el.put('P', str)
    el.put('Pg', pobj)
    el.put('K', 0)
    el.put('ActualText', doc.newString('Patient Johnsonwell was seen today'))
    el.put('Alt', doc.newString('Note about Johnsonwell'))
    const k = doc.newArray()
    k.push(doc.addObject(el))
    str.put('K', k)
    root.put('StructTreeRoot', str)
    const mi = doc.newDictionary()
    mi.put('Marked', true)
    root.put('MarkInfo', mi)
    pobj.put('StructParents', 0)
    writeFileSync(dest, new Uint8Array(doc.saveToBuffer('').asUint8Array()))
  } finally {
    doc.destroy?.()
  }
}
// review-2 N2: a tagged page whose figure Alt shares words with the edited
// paragraph, plus a page-2 element without /Pg (an MCR points to page 2)
const STRUCT2 = 'derived/edittext-struct2.pdf'
function buildStruct2() {
  const dest = join(CORPUS_DIR, STRUCT2)
  if (existsSync(dest)) return
  const doc = new mupdf.PDFDocument()
  try {
    const res = doc.newDictionary()
    const fd = doc.newDictionary()
    fd.put('F1', doc.addSimpleFont(new mupdf.Font('Helvetica'), 'Latin'))
    res.put('Font', fd)
    const para = ['Results came back with normal values for the', 'patient and nothing more was needed after the', 'visit, so the file was closed for this year.']
    doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, res, `/P <</MCID 0>> BDC\n${pText(para, 72, 650, 12)}\nEMC\n/Figure <</MCID 1>> BDC 0 0 1 rg 72 400 200 100 re f EMC\n/P <</MCID 2>> BDC BT /F1 10 Tf 72 300 Td (Other paragraph that stays as it was.) Tj ET EMC`))
    doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, res, '/P <</MCID 0>> BDC BT /F1 10 Tf 72 700 Td (Page two text without the patient name.) Tj ET EMC'))
    const p1 = doc.findPage(0)
    const p2 = doc.findPage(1)
    const root = doc.getTrailer().get('Root')
    const str = doc.addObject(doc.newDictionary())
    str.put('Type', doc.newName('StructTreeRoot'))
    const mk = (s, pg, k, extra) => {
      const e = doc.newDictionary()
      e.put('Type', doc.newName('StructElem'))
      e.put('S', doc.newName(s))
      e.put('P', str)
      if (pg) e.put('Pg', pg)
      e.put('K', k)
      for (const [kk, v] of Object.entries(extra)) e.put(kk, doc.newString(v))
      return doc.addObject(e)
    }
    const mcr = doc.newDictionary()
    mcr.put('Type', doc.newName('MCR'))
    mcr.put('Pg', p2)
    mcr.put('MCID', 0)
    const k = doc.newArray()
    k.push(mk('P', p1, 0, { ActualText: 'Results came back with normal values' }))
    k.push(mk('Figure', p1, 1, { Alt: 'Chart without values, drawn in blue' }))
    k.push(mk('P', p1, 2, { T: 'Closing notes', ActualText: 'Other paragraph that stays as it was.' }))
    k.push(mk('P', null, mcr, { ActualText: 'Page two text without the patient name.' }))
    str.put('K', k)
    root.put('StructTreeRoot', str)
    writeFileSync(dest, new Uint8Array(doc.saveToBuffer('').asUint8Array()))
  } finally {
    doc.destroy?.()
  }
}
// spill guards: the same paragraph with a link on its last line (page 1), a
// highlight drawn under its last line (page 2), and plain (page 3, control)
const SPILL = 'derived/edittext-spill-guards.pdf'
function buildSpill() {
  const dest = join(CORPUS_DIR, SPILL)
  if (existsSync(dest)) return
  buildPages(SPILL, [pText(P_LINES, 72, 650, 12), `1 1 0 rg 70 622 260 13 re f\n0 g\n${pText(P_LINES, 72, 650, 12)}`, pText(P_LINES, 72, 650, 12)])
  const doc = mupdf.Document.openDocument(new Uint8Array(readFileSync(dest)), 'application/pdf').asPDF()
  try {
    doc.loadPage(0).createLink([72, 156, 330, 170], 'https://example.org/')
    writeFileSync(dest, new Uint8Array(doc.saveToBuffer('compress').asUint8Array()))
  } finally {
    doc.destroy?.()
  }
}
// unit A: a centred title alone in its block, and a right-aligned address
// block ending at x 540 (its last line the shortest)
const ALIGNED = 'derived/edittext-aligned.pdf'
function buildAligned() {
  const font = new mupdf.Font('Helvetica')
  const width = (t, size) => [...t].reduce((w, ch) => w + font.advanceGlyph(font.encodeCharacter(ch.charCodeAt(0)), 0), 0) * size
  const title = 'A Centred Title For Testing'
  const tx = 306 - width(title, 14) / 2
  const addr = ['Accounts Department Building Two', '221 Long Street, Floor 4', 'London']
  const lines = addr.map((l, i) => `BT /F1 10 Tf ${(540 - width(l, 10)).toFixed(3)} ${600 - i * 12} Td (${l}) Tj ET`)
  buildPages(ALIGNED, [[`BT /F1 14 Tf ${tx.toFixed(3)} 720 Td (${title}) Tj ET`, ...lines].join('\n')])
}
// the same paragraph with its last line drawn at half opacity
const SPILL_ALPHA = 'derived/edittext-spill-alpha.pdf'
function buildSpillAlpha() {
  const dest = join(CORPUS_DIR, SPILL_ALPHA)
  if (existsSync(dest)) return
  const doc = new mupdf.PDFDocument()
  try {
    const res = doc.newDictionary()
    const fd = doc.newDictionary()
    fd.put('F1', doc.addSimpleFont(new mupdf.Font('Helvetica'), 'Latin'))
    res.put('Font', fd)
    const gs = doc.newDictionary()
    const a = doc.newDictionary()
    a.put('ca', 0.5)
    a.put('CA', 0.5)
    gs.put('GS1', a)
    res.put('ExtGState', gs)
    const c = `${pText(P_LINES.slice(0, 2), 72, 650, 12)}\nq /GS1 gs ${pText(P_LINES.slice(2), 72, 626, 12)} Q`
    doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, res, c))
    writeFileSync(dest, new Uint8Array(doc.saveToBuffer('compress').asUint8Array()))
  } finally {
    doc.destroy?.()
  }
}
// a 3-line ragged paragraph in a stroked box (page 1), on a filled panel
// (2), in a 2-cell grid stroked as one path (3), and beside a second column
// with a gap at its middle row (4); a header far right on each page. Lines
// that grow must not run through the border, panel edge, cell line or into
// the other column. R_BOX: right end of the widest line
const RANGE_BOX = 'derived/edittext-range-box.pdf'
const R_LINES = ['Alpha beta gamma delta', 'epsilon zeta eta theta iota', 'kappa lambda']
const R_BOX = (() => {
  const font = new mupdf.Font('Helvetica')
  return 72 + Math.max(...R_LINES.map((t) => [...t].reduce((w, ch) => w + font.advanceGlyph(font.encodeCharacter(ch.charCodeAt(0)), 0), 0) * 12))
})()
function buildRangeBox() {
  const text = `${R_LINES.map((l, i) => `BT /F1 12 Tf 72 ${700 - 14 * i} Td (${l}) Tj ET`).join('\n')}\nBT /F1 10 Tf 470 760 Td (Header far right) Tj ET`
  const w = (R_BOX - 72 + 20).toFixed(2)
  buildPages(RANGE_BOX, [
    `0 G 1 w 66 620 ${w} 100 re S\n${text}`,
    `0.85 0.9 1 rg 66 620 ${w} 100 re f\n0 g\n${text}`,
    `0 G 1 w 66 620 ${w} 100 re ${(66 + +w).toFixed(2)} 620 200 100 re S\n${text}`,
    `${text}\nBT /F1 12 Tf ${(R_BOX + 30).toFixed(2)} 714 Td (Right column first line here) Tj ET\nBT /F1 12 Tf ${(R_BOX + 30).toFixed(2)} 658 Td (Right column after gap) Tj ET`,
  ])
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
  buildFormInline()
  buildStruct()
  buildStruct2()
  buildSpill()
  buildSpillAlpha()
  buildAligned()
  buildRangeBox()
  for (const [k, c] of Object.entries(DECOR)) buildPages(`derived/edittext-decor-${k}.pdf`, [c])
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
        return { ...target, edits: [{ name: 'grow', text: target.text, spill: false }] }
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
  fixRow('collision-flipkart-billing', 'invoices/flipkart-invoice.pdf', (b) => wholeLine(b, (s) => s.includes('near Fun republic')), [{ name: 'ed', text: 'near Fun republic mall and nehru place extra words', spill: false }], noOverprint('invoices/flipkart-invoice.pdf'))
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

  // ----- spill / close (2026-11-01) -----
  // A line edit that does not fit goes on below it, the rest of its
  // paragraph moving down whole; an emptied line closes up. Checks: nothing
  // outside the changed box moved, every glyph below moved by one offset
  // (same x, font), text reads in order, a second edit works.
  const lineRow = async (b, pred, pageNum = 1) => {
    const m = await pageTextModel(b, pageNum)
    const r = m.runs.find((x) => x.editable && pred(x.text))
    if (!r) return null
    const g = m.paragraphs.find((p) => p.runIds.includes(r.id))
    const k = g ? g.runIds.indexOf(r.id) : -1
    const next = k >= 0 && k + 1 < g.runIds.length ? m.runs.find((x) => x.id === g.runIds[k + 1]).text : null
    const prev = k > 0 ? m.runs.find((x) => x.id === g.runIds[k - 1]).text : null
    return { pageNum, runId: r.id, wordIndex: null, old: r.text, line: r.text, bbox: r.bbox, next, prev }
  }
  const spillCheck = (rel, want) => async (ctx, t, meta) => {
    const e = meta.edits[0]
    const r = e.report
    const idx = t.pageNum - 1
    const input = readRel(rel)
    const out = ctx.out(`${e.name}.pdf`)
    // every character on the page: before, minus the old line, plus the new text
    // (text that runs off the page does not read back: count skipped)
    const charsCheck = (counted = true) => {
      const count = (txt, m = new Map(), k = 1) => {
        for (const ch of squash(txt).normalize('NFKC')) m.set(ch, (m.get(ch) ?? 0) + k)
        return m
      }
      const wantChars = count(e.text, count(t.old, count(docText(input)[idx]), -1))
      const gotChars = count(docText(out)[idx])
      const off = [...new Set([...wantChars.keys(), ...gotChars.keys()])].filter((ch) => (gotChars.get(ch) ?? 0) !== (wantChars.get(ch) ?? 0))
      if (counted) ctx.check('page characters = before - old line + new text', off.length === 0, off.slice(0, 8).map((ch) => `${ch}:${(gotChars.get(ch) ?? 0) - (wantChars.get(ch) ?? 0)}`).join(' '))
      // words kept apart (a count cannot see "Euros -B")
      const flat = String(docText(out)[idx]).replace(/\s+/g, ' ')
      for (const ph of want.reads ?? []) ctx.check(`reads "${ph}"`, flat.includes(ph), flat.slice(Math.max(0, flat.indexOf(ph.split(' ')[0]) - 10), 80))
    }
    // either way is fine; when it spills, the checks below run
    if (want.either && !r.spill) {
      ctx.check('applied as before (no spill)', !r.refused, r.refused)
      charsCheck(!r.overflow)
      return
    }
    if (want.fallback) {
      ctx.check(`no spill (${want.fallback})`, !r.spill, JSON.stringify(r.spill))
      if (want.refused) {
        ctx.check(`refused ${want.refused}`, r.refused === want.refused, r.refused)
        ctx.check('file unchanged', e.unchanged === true, `unchanged ${e.unchanged}`)
      } else ctx.check('applied as before', !r.refused, r.refused)
      return
    }
    ctx.check('applied', !r.refused, r.refused)
    if (want.lines === 0) ctx.check('laid out again on its own line', r.spill?.lines === 0, JSON.stringify(r.spill))
    else ctx.check(want.close ? 'closed up a line' : `spilled onto ${want.lines ?? '1+'} new line(s)`, want.close ? r.spill?.lines === -1 : r.spill?.lines >= (want.lines ?? 1), JSON.stringify(r.spill))
    if (want.moved != null) ctx.check(`moved ${want.moved}+ rows`, r.spill?.moved >= want.moved, JSON.stringify(r.spill))
    ctx.check('no overflow, no squeeze', !r.overflow && !r.fit, JSON.stringify({ overflow: r.overflow, fit: r.fit }))
    charsCheck()
    if (!r.changedBox) return
    // a justified line that still fits stays justified: it ends at the column edge
    if (want.lines === 0) {
      const m2 = await pageTextModel(ctx.out(`${e.name}.pdf`), t.pageNum)
      const run = m2.runs.find((x) => x.text === e.text)
      ctx.check('still ends at the column edge', !!run && Math.abs(run.bbox[2] - t.bbox[2]) < 0.6, run ? `${run.bbox[2].toFixed(2)} vs ${t.bbox[2].toFixed(2)}` : 'line not found')
    }
    // nothing outside the changed box moved or vanished
    const before = glyphsOf(input, idx)
    const after = glyphsOf(out, idx)
    const bounds = pageBounds(input, idx)
    const lost = movedOutside(before, after, r.changedBox, bounds)
    ctx.check('no glyph outside the changed box moved', lost.length === 0, lost.slice(0, 5).map((g) => g.c).join(''))
    const diff = pixelsOutside(render(input, idx), render(out, idx), [r.changedBox])
    ctx.check('no pixel changed outside the changed box', diff.outside === 0, `${diff.outside} px`)
    // glyphs below the edited line inside the box: one offset for all, same x and font
    const lineBottom = t.bbox[3] + bounds[1]
    const cb = [r.changedBox[0] + bounds[0], r.changedBox[1] + bounds[1], r.changedBox[2] + bounds[0], r.changedBox[3] + bounds[1]]
    let below = before.filter((g) => g.y > lineBottom + 0.5 && g.x >= cb[0] - 1 && g.x <= cb[2] + 1 && g.y <= cb[3] + 1)
    // a word with a ligature ("fi" read as two chars at one x) is drawn as
    // its letters (so it reads back whole): its glyphs may sit a little apart
    const words = []
    for (const g of below.slice().sort((p, q) => p.y - q.y || p.x - q.x)) {
      const w = words[words.length - 1]
      const last = w?.[w.length - 1]
      if (last && Math.abs(last.y - g.y) < 0.1 && g.x - last.x < 8) w.push(g)
      else words.push([g])
    }
    const lig = new Set(words.filter((w) => w.some((g, i) => i > 0 && Math.abs(g.x - w[i - 1].x) < 0.01)).flat())
    below = below.filter((g) => !lig.has(g))
    if (below.length) {
      const dys = new Set()
      for (const a of after) if (a.c === below[0].c && Math.abs(a.x - below[0].x) <= 0.15) dys.add(Math.round((a.y - below[0].y) * 10) / 10)
      const fits = (d) => below.filter((g) => after.some((a) => a.c === g.c && a.font === g.font && Math.abs(a.x - g.x) < 0.15 && Math.abs(a.y - g.y - d) < 0.15)).length
      const d = [...dys].filter((x) => (want.close ? x < -0.5 : x > 0.5)).sort((p, q) => fits(q) - fits(p))[0]
      const n = d == null ? 0 : fits(d)
      ctx.check(`${below.length} glyphs below moved whole (same x and font, one offset; ${lig.size} in ligature words left out)`, n === below.length, `${n}/${below.length} at dy ${d}`)
    }
    // reading order: the edited line (or the line above a closed one), then the next line
    const txt = squash(docText(out)[idx])
    const head = want.close ? t.prev : e.text
    // drawn in place it reads in order; drawn after the page content (the
    // known limit, as for any edit) the moved lines still read together
    if (head && t.next && r.order === 'inline') ctx.check('text reads in order', txt.includes(squash(`${head}${t.next}`).slice(-60)), `${squash(head).slice(-20)} | ${squash(t.next).slice(0, 20)}`)
    else if (t.next) ctx.check(`moved text reads whole (order ${r.order})`, txt.includes(squash(t.next)), squash(t.next).slice(0, 30))
    // a second edit of the same paragraph (on a moved line)
    if (!t.next) return
    const m2 = await pageTextModel(out, t.pageNum)
    const first = t.next.split(/\s+/).filter(Boolean)[0]
    const run = m2.runs.find((x) => x.editable && x.text.startsWith(first) && x.words.length)
    if (!run) return ctx.check('second edit: moved line found', false, first)
    const w = run.words.find((x) => /^\p{L}{3,}$/u.test(x.text)) ?? run.words[0]
    const res = await nodeEdit(out, [{ pageNum: t.pageNum, runId: run.id, wordIndex: w.i, text: 'Zed', old: w.text }])
    ctx.check('second edit applies', !res.report[0].refused, res.report[0].refused)
    ctx.check('second edit reads back', squash(docText(res.bytes)[idx]).includes('Zed'))
  }
  // grow(target) -> new line text
  const spillRow = (id, rel, pred, grow, want, pageNum = 1) => {
    let target = null
    add({
      id: `edittext-spill-${id}`,
      tool: 'edittext',
      op: 'edittext:edit',
      files: [rel],
      timeout: 3 * MIN,
      quick: id === 'justified-tracemonkey' || id === 'guard-link',
      async prepare() {
        target = await lineRow(readRel(rel), pred, pageNum)
        if (!target) return { skip: 'no target' }
        const text = grow(target)
        // Fit to width after a refusal: the same text squeezed on its line
        return { ...target, edits: [{ name: 'ed', text }, ...(want.fitAfter ? [{ name: 'fit', text, fit: true }] : [])] }
      },
      async validate(ctx) {
        await spillCheck(rel, want)(ctx, target, ctx.meta)
        const f = ctx.meta.edits[1]?.report
        if (want.fitAfter) ctx.check('Fit to width applies it squeezed', f && !f.refused && f.fit > 0 && f.fit < 1, JSON.stringify({ refused: f?.refused, fit: f?.fit }))
        const r = ctx.meta.edits[0].report
        ctx.metric(`"${target.old.slice(0, 30)}": ${r.refused ?? 'ok'} spill ${JSON.stringify(r.spill)} fit ${r.fit} ${ctx.meta.edits[0].ms}+${ctx.meta.edits[0].finalizeMs}ms`)
      },
    })
  }
  const plus = (s) => (t) => `${t.old}${s}`
  spillRow('justified-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', (s) => s.startsWith('ular since they are expressive'), plus(' and more words'), { moved: 3 })
  spillRow('address-saeco', 'invoices/saeco.pdf', (s) => s === 'Strategic Corp', plus(' plus several extra words to spill'), { lines: 2, moved: 4 })
  spillRow('heading-fdic', 'reports/fdic-quarterly-banking-profile-2023q4.pdf', (s) => s.startsWith('FULL-YEAR NET INCOME DECLINED'), plus(' AND MORE WORDS'), { moved: 2 })
  spillRow('last-row-tam', 'reports/pdfjs-TAMReview.pdf', (s) => s.startsWith('Indiana University'), plus(' plus several extra words'), {})
  spillRow('close-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', (s) => s.startsWith('is available, traditional compilers'), () => '', { close: true, moved: 10 })
  spillRow('close-saeco', 'invoices/saeco.pdf', (s) => s === 'T.a.v. bosd', () => '', { close: true, moved: 2 })
  spillRow('guard-control', SPILL, (s) => s.startsWith('The quick brown'), plus(' plus several extra words'), { moved: 2 }, 3)
  spillRow('guard-link', SPILL, (s) => s.startsWith('The quick brown'), plus(' plus several extra words'), { fallback: 'link on a moved line' }, 1)
  spillRow('guard-highlight', SPILL, (s) => s.startsWith('The quick brown'), plus(' plus several extra words'), { fallback: 'highlight under a moved line' }, 2)
  // review round 1: a new word equal to a later row's word, a closed line
  // whose next line starts with its last word, a ligature word moved
  spillRow('grow-next-word-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', (s) => s.startsWith('ular since they are expressive'), () => 'ular since they are expressive, accessible to all, and make the deployment of code more plain', {})
  spillRow('close-attention', 'reports/arxiv-1706.03762-attention.pdf', (s) => s.startsWith('reduced to a constant number of operations'), () => '', { close: true, either: true }, 2)
  spillRow('close-ligature-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', (s) => s.startsWith('iteration of a loop. Some variables'), () => '', { close: true, either: true }, 5)
  // unit A: no spill room and the line would run off the page or through a
  // box border: refused, nothing changed
  spillRow('off-page-free-fiber', 'invoices/free-fiber.pdf', (s) => s.startsWith('Les montants unitaires'), plus(' plus several more inserted words here to push it over'), { fallback: 'runs off the page', refused: 'off-page' })
  // unit C: words on spilled rows have real spaces between them, so a gap
  // after a wide glyph still reads apart (this spill fell back before)
  spillRow('words-apart-free-fiber', 'invoices/free-fiber.pdf', (s) => s.startsWith('Free SAS au capital'), (t) => t.old.replace('capital', 'capital plus several more inserted words here to push it over'), { lines: 1, reads: ['Euros − B 421', 'Paris − Siège', '− N° de TVA'] })
  spillRow('refused-crosses-frame', 'derived/edittext-decor-frame.pdf', (s) => s.startsWith('running across'), plus(' plus more words here'), { fallback: 'box border', refused: 'crosses-drawing', fitAfter: true })
  // centred and right-aligned lines grow where they are drawn (both sides, or
  // to the left): these fit on the page and apply
  spillRow('centred-title-grows', ALIGNED, (s) => s.startsWith('A Centred Title'), plus(' With Many More Words Added Here Too'), { fallback: 'centred' })
  spillRow('right-aligned-grows', ALIGNED, (s) => s === 'London', plus(', United Kingdom EC1A 1BB and more'), { fallback: 'right-aligned' })
  spillRow('grows-inside-frame', 'derived/edittext-decor-frame.pdf', (s) => s.startsWith('running across'), plus(' ok'), { either: true })
  spillRow('grows-past-white-fill', 'derived/edittext-decor-whitefill.pdf', (s) => s.startsWith('running across'), plus(' and on'), { either: true })
  // review 2: a justified line that still fits after re-laying, and a word
  // replaced mid-line
  spillRow('same-line-justified-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', (s) => s.startsWith('Dynamic languages such as JavaScript are more'), (t) => t.old.replace(' such as ', ' such ases '), { lines: 0, reads: ['such ases JavaScript'] })
  spillRow('mid-line-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', (s) => s.startsWith('deployment as easy as distributing'), (t) => t.old.replace(' easy ', ' easy, fast and safe for everyone, '), { moved: 1, reads: ['easy, fast and safe for everyone, as distributing'] })
  spillRow('guard-opacity', SPILL_ALPHA, (s) => s.startsWith('The quick brown'), plus(' plus several extra words'), { fallback: 'half-opacity line below' })
  spillRow('fallback-no-room-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', (s) => s.startsWith('is available, traditional compilers'), plus(' plus a lot of extra words'), { fallback: 'no blank space below' })
  spillRow('refused-no-room-below', 'reports/pdfjs-tracemonkey.pdf', (s) => s.startsWith('Categories and Subject Descriptors'), plus(' plus a lot of extra words to spill over the edge'), { fallback: 'no room', refused: 'no-room-below' })
  spillRow('fallback-arabic', 'intl/udhr-arabic.pdf', (s) => /[\u0600-\u06ff]{3}/u.test(s) && s.length > 20 && !/[\ufffd\ue000-\uf8ff\u0000-\u001f]/u.test(s), plus(' \u0643\u0644\u0645\u0627\u062a \u0623\u062e\u0631\u0649 \u0643\u062b\u064a\u0631\u0629 \u062c\u062f\u0627'), { fallback: 'right to left' })
  // unit D: several lines of a block edited as one (rows r0..r1), laid out
  // again; the lines below move whole. edit(old) -> new text
  const rangeRow = (id, rel, start, count, edit, want, pageNum = 1) => {
    let t = null
    add({
      id: `edittext-range-${id}`,
      tool: 'edittext',
      op: 'edittext:range',
      files: [rel],
      timeout: 3 * MIN,
      quick: id === 'grow-saeco' || id === 'link',
      async prepare() {
        const m = await pageTextModel(readRel(rel), pageNum)
        for (const b of m.blocks) {
          const k = b.rows.findIndex((x) => x.text.startsWith(start))
          if (k < 0 || k + count > b.rows.length) continue
          const r1 = k + count - 1
          const old = b.rows.slice(k, r1 + 1).map((x, j) => x.text + (j < r1 - k ? x.sep : '')).join('')
          t = { pageNum, blockId: b.id, rows: [k, r1], old, next: b.rows[r1 + 1]?.text ?? null }
          return { ...t, old: want.stale ? `${old} x` : old, edits: [{ name: 'ed', text: edit(old) }] }
        }
        return { skip: 'no target' }
      },
      async validate(ctx) {
        const e = ctx.meta.edits[0]
        const r = e.report
        ctx.metric(`${t.blockId} rows ${t.rows.join('-')}: ${r.refused ?? 'ok'} spill ${JSON.stringify(r.spill)} ${e.ms}+${e.finalizeMs}ms`)
        if (want.refused) {
          ctx.check(`refused ${want.refused}`, r.refused === want.refused, r.refused)
          ctx.check('file unchanged', e.unchanged === true, `unchanged ${e.unchanged}`)
          return
        }
        ctx.check('applied', !r.refused, r.refused)
        ctx.check(`lines ${want.lines >= 0 ? '+' : ''}${want.lines}`, r.spill?.lines === want.lines, JSON.stringify(r.spill))
        ctx.check('no overflow, no squeeze', !r.overflow && !r.fit, JSON.stringify({ overflow: r.overflow, fit: r.fit }))
        if (want.maxRight != null) ctx.check(`new lines end by x ${want.maxRight.toFixed(1)}`, r.box && r.box[2] <= want.maxRight, `${r.box?.[2]?.toFixed(1)}`)
        const idx = pageNum - 1
        const input = readRel(rel)
        const out = ctx.out('ed.pdf')
        // every character on the page: before, minus the old lines, plus the new text
        const count = (txt, m = new Map(), k = 1) => {
          for (const ch of squash(txt).normalize('NFKC')) m.set(ch, (m.get(ch) ?? 0) + k)
          return m
        }
        const wantChars = count(e.text, count(t.old, count(docText(input)[idx]), -1))
        const gotChars = count(docText(out)[idx])
        const off = [...new Set([...wantChars.keys(), ...gotChars.keys()])].filter((ch) => (gotChars.get(ch) ?? 0) !== (wantChars.get(ch) ?? 0))
        ctx.check('page characters = before - old lines + new text', off.length === 0, off.slice(0, 8).map((ch) => `${ch}:${(gotChars.get(ch) ?? 0) - (wantChars.get(ch) ?? 0)}`).join(' '))
        const flat = String(docText(out)[idx]).replace(/\s+/g, ' ')
        for (const ph of want.reads ?? []) ctx.check(`reads "${ph}"`, flat.includes(ph), flat.slice(Math.max(0, flat.indexOf(ph.split(' ')[0]) - 10), 80))
        if (t.next) ctx.check('the next line reads whole', squash(flat).includes(squash(t.next)), t.next.slice(0, 30))
        if (!r.changedBox) return
        const lost = movedOutside(glyphsOf(input, idx), glyphsOf(out, idx), r.changedBox, pageBounds(input, idx))
        ctx.check('no glyph outside the changed box moved', lost.length === 0, lost.slice(0, 5).map((g) => g.c).join(''))
        const diff = pixelsOutside(render(input, idx), render(out, idx), [r.changedBox])
        ctx.check('no pixel changed outside the changed box', diff.outside === 0, `${diff.outside} px`)
      },
    })
  }
  // a ragged line runs into the clear space to its right (up to an em before
  // the other address), then wraps
  rangeRow('wide-saeco', 'invoices/saeco.pdf', 'Strategic Corp', 3, (o) => o.replace('Corp', 'Corp International Holdings Group plus more'), { lines: 0, reads: ['Strategic Corp International Holdings Group plus more T.a.v. bosd'] })
  rangeRow('grow-saeco', 'invoices/saeco.pdf', 'Strategic Corp', 3, (o) => o.replace('Corp', 'Corp International Holdings Group with a much longer name that goes on and on past the other column'), { lines: 1, reads: ['T.a.v. bosd', 'Fakestreet 46'] })
  rangeRow('wide-aws', 'invoices/aws-invoice.pdf', 'ATTN', 2, (o) => `${o.replace('\n', ' ')} and more`, { lines: 0, reads: ['ATTN: iViveLabs Limited 93B Sai Yu Chung'] })
  // ...but not through a box border, panel edge or cell line, nor into the
  // next column (review of the wider wrap: these ran through)
  const boxGrow = (o) => o.replace('delta', 'delta plus some more words that run on')
  for (const [k, page, lines, maxRight] of [['box', 1, 2, R_BOX + 3], ['panel', 2, 2, R_BOX + 3], ['grid', 3, 2, R_BOX + 3], ['cols', 4, 1, R_BOX + 30 - 11]]) {
    rangeRow(`inside-${k}`, RANGE_BOX, 'Alpha', 3, boxGrow, { lines, maxRight }, page)
  }
  // taking out a shown line break joins the lines (review round 1)
  rangeRow('join-tam', 'reports/pdfjs-TAMReview.pdf', 'in TAM lacks', 2, (o) => o.replace('sufficient rigor and ', '').replace('\n', ' '), { lines: -1, reads: ['theory for the IS community'] })
  rangeRow('grow-fdic', 'reports/fdic-quarterly-banking-profile-2023q4.pdf', 'FULL-YEAR NET INCOME DECLINED', 2, (o) => `${o} AND MORE WORDS HERE`, { lines: 1 })
  // a ragged block keeps its line breaks: a longer line still fits on its row
  rangeRow('breaks-kept-tam', 'reports/pdfjs-TAMReview.pdf', 'regarding its theoretical', 3, (o) => o.replace(' lacks', ' still lacks'), { lines: 0, reads: ['in TAM still lacks'] })
  rangeRow('shrink-attention', 'reports/arxiv-1706.03762-attention.pdf', 'to-German translation task', 3, (o) => o.replace(/, including ensembles, by over 2 BLEU/, '').replace(/ On the WMT[^]*?task,/, ''), { lines: -1 })
  rangeRow('close-attention', 'reports/arxiv-1706.03762-attention.pdf', 'best models from the literature', 2, () => '', { lines: -2 })
  rangeRow('guard-control', SPILL, 'The quick brown', 2, (o) => o.replace(' keeps', ' keeps plus several extra words'), { lines: 1 }, 3)
  rangeRow('link', SPILL, 'The quick brown', 2, (o) => o.replace(' keeps', ' keeps plus several extra words'), { refused: 'range-blocked' }, 1)
  rangeRow('highlight', SPILL, 'The quick brown', 2, (o) => o.replace(/ and keeps[^]*/, ''), { refused: 'range-blocked' }, 2)
  rangeRow('split-word-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', 'pile than statically', 2, (o) => o.replace('pile', 'piles'), { refused: 'split-word' })
  rangeRow('no-room-free-fiber', 'invoices/free-fiber.pdf', 'Pour vous informer', 2, (o) => `${o} plus several more inserted words here to push it over the edge`, { refused: 'no-room-below' })
  rangeRow('stale', 'invoices/saeco.pdf', 'Strategic Corp', 3, (o) => o.replace('Corp', 'Corp B.V.'), { refused: 'stale', stale: true })

  // a whole line starts where it started: a leading space is dropped
  fixRow('trim-leading-space-saeco', 'invoices/saeco.pdf', (b) => lineRow(b, (s) => s === 'T.a.v. bosd'), [{ name: 'ed', text: '   bosd' }], async (ctx, t, meta) => {
    const r = meta.edits[0].report
    ctx.check('applied', !r.refused, r.refused)
    ctx.check('starts at the line start', r.box && Math.abs(r.box[0] - t.bbox[0]) < 0.6, `${r.box?.[0]} vs ${t.bbox[0]}`)
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

  // ----- paragraphs (phase 2) -----
  paragraphRows({ add, checkPdf, inputFacts, readRel, MIN })

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

// ---------- paragraphs (phase 2) ----------
// Glyphs of a page from MuPDF (raw, no ActualText): { c, x, y } origins.
function glyphsOf(bytes, idx) {
  const d = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  const out = []
  try {
    const st = d.loadPage(idx).toStructuredText('preserve-whitespace,ignore-actualtext')
    st.walk({
      onChar(c, origin, font, size, quad) {
        font.constructor._finalizer?.unregister(font)
        if (c.trim()) out.push({ c, x: origin[0], y: origin[1], q: [...quad], font: font.getName() })
      },
    })
    st.destroy?.()
  } finally {
    d.destroy?.()
  }
  return out
}
// Glyphs outside `box` (view space; page origin may be offset) that moved or vanished.
function movedOutside(before, after, box, bounds) {
  const key = (g) => `${g.c}@${Math.round(g.x * 5)},${Math.round(g.y * 5)}`
  const have = new Set()
  for (const g of after) for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) have.add(`${g.c}@${Math.round(g.x * 5) + dx},${Math.round(g.y * 5) + dy}`)
  const b = [box[0] + bounds[0] - 1, box[1] + bounds[1] - 1, box[2] + bounds[0] + 1, box[3] + bounds[1] + 1]
  return before.filter((g) => {
    const cx = (g.q[0] + g.q[2] + g.q[4] + g.q[6]) / 4
    const cy = (g.q[1] + g.q[3] + g.q[5] + g.q[7]) / 4
    if (cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3]) return false
    return !have.has(key(g))
  })
}
function pageBounds(bytes, idx) {
  const d = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  try {
    return [...d.loadPage(idx).getBounds()]
  } finally {
    d.destroy?.()
  }
}

// First paragraph on pages 1..pages that is editable and passes pred(g, m).
export async function pickPara(bytes, pred, { pages = 3 } = {}) {
  const d = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  const n = d.countPages()
  d.destroy?.()
  for (let p = 1; p <= Math.min(n, pages); p++) {
    const m = await pageTextModel(bytes, p)
    for (const g of m.paragraphs) if (g.editable && (await pred(g, m))) return { pageNum: p, paragraphId: g.id, old: g.text, g, m }
  }
  return null
}

// Text below the paragraph within `k` line gaps in its x range (view space).
const roomBelow = (g, m, k) => {
  const lead = (g.bbox[3] - g.bbox[1]) / Math.max(1, g.lines)
  const zone = [g.bbox[0], g.bbox[3] + 0.5, g.bbox[2], g.bbox[3] + k * lead]
  const hit = m.runs.some((r) => !g.runIds.includes(r.id) && r.bbox[0] < zone[2] && r.bbox[2] > zone[0] && r.bbox[1] < zone[3] && r.bbox[3] > zone[1])
  return !hit && zone[3] < m.page.height - 30
}
const wordsOf = (s) => s.split(/\s+/).filter(Boolean)

function paragraphRows({ add, checkPdf, inputFacts, readRel, MIN }) {
  // pick(bytes) -> target; edits(target, all doc text) -> [{ name, text, fit, want }]
  // want: { refused, grows, squeezed } expectations; check(ctx, target, rec) extra checks
  const row = (id, rel, pick, edits, extra) => {
    let target = null
    let eds = null
    add({
      id: `edittext-para-${id}`,
      tool: 'edittext',
      op: 'edittext:para',
      files: [rel],
      timeout: 3 * MIN,
      async prepare() {
        const bytes = readRel(rel)
        target = await pick(bytes)
        if (!target) return { skip: 'no suitable paragraph' }
        target.input = bytes
        eds = edits(target, docText(bytes).join('\n'))
        return { pageNum: target.pageNum, paragraphId: target.paragraphId, old: target.old, edits: eds.map(({ want, ...e }) => e) }
      },
      async validate(ctx) {
        const meta = ctx.meta
        ctx.check('browser model agrees with Node', meta.para?.text === target.old && meta.para.editable, `${meta.para?.why ?? ''} ${meta.para?.text?.slice(0, 40)}`)
        const input = readRel(rel)
        const idx = target.pageNum - 1
        const facts = []
        for (const [k, ed] of eds.entries()) {
          const rec = meta.edits[k]
          const rep = rec?.report
          const want = ed.want ?? {}
          if (want.refused) {
            ctx.check(`${ed.name}: refused ${want.refused}`, rep?.refused === want.refused, `refused ${rep?.refused}`)
            ctx.check(`${ed.name}: file unchanged`, rec?.unchanged === true)
            facts.push(`${ed.name} refused ${rep?.refused} ${rec?.ms}ms`)
            continue
          }
          ctx.check(`${ed.name}: not refused`, rep && !rep.refused, rep?.refused ?? 'no report')
          if (!rep || rep.refused) continue
          const p = await checkPdf(ctx, `${ed.name}.pdf`, { pages: (await inputFacts(rel)).pdfjs.pages, label: ed.name })
          if (!p?.pdfjs.ok || !p.mupdf.ok) continue
          const out = ctx.out(`${ed.name}.pdf`)
          // removed words that were unique in the file are gone (text layer, raw
          // glyphs, page bytes); a word hyphenated across lines in the source
          // or still inside a new word is not counted
          const all = squash(docText(input).join(''))
          const rawPara = squash(target.m.runs.filter((r) => target.g.runIds.includes(r.id)).map((r) => r.text).join(''))
          const left = new Map()
          for (const w of wordsOf(ed.text)) left.set(w, (left.get(w) ?? 0) + 1)
          const gone = wordsOf(target.old).filter((w) => {
            if (left.get(w) > 0) {
              left.set(w, left.get(w) - 1)
              return false
            }
            return w.length >= 4 && count(all, squash(w)) === 1 && count(rawPara, squash(w)) === 1 && !squash(ed.text).includes(squash(w))
          })
          const def = docText(out)
          const raw = docText(out, 'preserve-whitespace,ignore-actualtext')
          const still = gone.filter((w) => count(squash(def.join('')), squash(w)) + count(squash(raw.join('')), squash(w)) > 0)
          ctx.check(`${ed.name}: removed words gone (MuPDF, with and without ActualText)`, still.length === 0, `${gone.length} checked, left: ${still.join(', ')}`)
          const strs = pageStrings(out, idx)
          const inBytes = gone.filter((w) => strs.includes(w))
          ctx.check(`${ed.name}: removed words gone from the page bytes`, inBytes.length === 0, inBytes.join(', '))
          // new text extractable in order
          const rtl = /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(ed.text)
          const noMarks = (x) => squash(x).replace(/\p{M}/gu, '')
          // real output, hyphens as printed (no hyphen folding: it hid moved breaks)
          const dehyph = (x) => squash(x)
          const okMu = dehyph(def[idx]).includes(dehyph(ed.text)) || (rtl && noMarks(def[idx]).includes(noMarks(ed.text)))
          if (want.deleted) {
            ctx.check(`${ed.name}: deleted (no font, no lines, no box)`, rep.font === null && rep.lines === 0 && rep.box === null, JSON.stringify({ font: rep.font, lines: rep.lines }))
            const words = wordsOf(target.old).filter((w) => /^\p{L}{4,}$/u.test(w) && count(squash(docText(input)[idx]), w) === 1 && count(rawPara, w) === 1)
            const leftover = words.filter((w) => squash(def[idx]).includes(w) || squash(raw[idx]).includes(w) || strs.includes(w))
            ctx.check(`${ed.name}: paragraph text gone (text layer, raw glyphs, page bytes)`, words.length > 0 && leftover.length === 0, `${words.length} checked, left: ${leftover.join(', ')}`)
          } else {
            // MuPDF's page order can put a line next to another paragraph's
            // text on the same row; word order is checked on the model below
            const hadMu = new Map()
            for (const w of wordsOf(target.old)) hadMu.set(w, (hadMu.get(w) ?? 0) + 1)
            const addedMu = wordsOf(ed.text).filter((w) => (hadMu.get(w) > 0 ? (hadMu.set(w, hadMu.get(w) - 1), false) : true))
            const missMu = addedMu.filter((w) => !dehyph(def[idx]).includes(dehyph(w)) && !(rtl && noMarks(def[idx]).includes(noMarks(w))))
            ctx.check(`${ed.name}: added words in MuPDF text`, missMu.length === 0, missMu.join(' '))
            ctx.check(`${ed.name}: new text in MuPDF text, in order`, okMu, `"${ed.text.slice(0, 50)}" not found`, { soft: true })
          }
          const pj = p.pdfjs.texts?.[idx] ?? ''
          // pdf.js: every added word must read back; the whole text in order is
          // soft (pdf.js splits raised marks like author stars into their own items)
          if (!want.deleted) {
            const had = new Map()
            for (const w of wordsOf(target.old)) had.set(w, (had.get(w) ?? 0) + 1)
            const added = wordsOf(ed.text).filter((w) => (had.get(w) > 0 ? (had.set(w, had.get(w) - 1), false) : true))
            const miss = added.filter((w) => !dehyph(pj).includes(dehyph(w)))
            ctx.check(`${ed.name}: added words in pdf.js text`, miss.length === 0, miss.join(' '), { soft: COMPLEX.test(ed.text) })
            ctx.check(`${ed.name}: new text in pdf.js text, in order`, dehyph(pj).includes(dehyph(ed.text)), 'not found', { soft: true })
          }
          // nothing outside the paragraph changed or moved; ink in the new box
          const beforeImg = render(input, idx)
          const after = render(out, idx)
          const diff = pixelsOutside(beforeImg, after, [rep.changedBox])
          ctx.check(`${ed.name}: no pixel changed outside the paragraph box`, diff.outside === 0, `${diff.outside} px (max delta ${diff.max})`)
          const moved = movedOutside(glyphsOf(input, idx), glyphsOf(out, idx), rep.changedBox, pageBounds(input, idx))
          ctx.check(`${ed.name}: other glyphs unmoved`, moved.length === 0, `${moved.length} moved: ${moved.slice(0, 5).map((g) => g.c).join('')}`)
          if (want.deleted) {
            ctx.check(`${ed.name}: no ink left in the old box`, inkIn(after, rep.changedBox).ink === 0, `${inkIn(after, rep.changedBox).ink} px`)
            facts.push(`${ed.name} deleted ${rec.ms}+${rec.finalizeMs}ms`)
            continue
          }
          ctx.check(`${ed.name}: ink in the new box`, inkIn(after, rep.box).ink > 0)
          // the UI can open the result as a paragraph again
          // (right-to-left lines with wide spacing come back as one paragraph per line)
          const again = rec.after?.find((x) => squash(x.text).includes(squash(ed.text).slice(0, 40)))
          ctx.check(`${ed.name}: re-read as an editable paragraph`, !!again && again.editable, again ? `${again.id} ${again.lines} lines` : 'not found', { soft: rtl })
          // words read back as words, spaces kept ("diffi cult" fails here; squash() hid it)
          const fold = (x) => String(x).replace(/\s+/g, ' ').trim()
          const allAfter = fold((rec.after ?? []).map((x) => x.text).join(' '))
          const pool = new Map()
          for (const w of allAfter.split(' ')) pool.set(w, (pool.get(w) ?? 0) + 1)
          const broken = wordsOf(ed.text).filter((w) => (pool.get(w) > 0 ? (pool.set(w, pool.get(w) - 1), false) : true))
          ctx.check(`${ed.name}: every word reads back whole (model, spaces kept)`, broken.length === 0, broken.slice(0, 6).join(' | '), { soft: rtl })
          // the paragraph reads back as one, exactly the new text (words outside
          // the edit unchanged, hyphen breaks as they were)
          const whole = (rec.after ?? []).some((x) => fold(x.text) === fold(ed.text))
          ctx.check(`${ed.name}: re-read paragraph is exactly the new text (model)`, whole || allAfter.includes(fold(ed.text)), `"${fold(ed.text).slice(0, 60)}"`, { soft: rtl })
          // no source line-end hyphen moved mid-line: "com-" + "pile" never reads "com-pile" on one line
          const srcRuns = target.m.runs.filter((r) => target.g.runIds.includes(r.id))
          const pairs = srcRuns.slice(0, -1).flatMap((r, k) => {
            const w = r.text.trim().split(/\s+/).pop()
            const nx = srcRuns[k + 1].text.trim().split(/\s+/)[0]
            return /[-‐]$/.test(w) && nx ? [`${w}${nx}`] : []
          })
          const outLines = docText(out)[idx].split('\n')
          // (a real compound, kept with its hyphen in the paragraph text, may)
          const midHyph = pairs.filter((pp) => !target.old.includes(pp) && outLines.some((l) => l.includes(pp)))
          ctx.check(`${ed.name}: no line-end hyphen moved mid-line`, midHyph.length === 0, midHyph.join(', '))
          if (want.grows) ctx.check(`${ed.name}: used free space below (more lines, not squeezed)`, rep.lines > target.g.lines && !rep.fit, `${target.g.lines} -> ${rep.lines} lines, fit ${rep.fit}`)
          if (want.fewer) ctx.check(`${ed.name}: fewer lines`, rep.lines < target.g.lines, `${target.g.lines} -> ${rep.lines}`)
          ctx.check(`${ed.name}: edit under 5 s`, rec.ms < 5000, `${rec.ms} ms`)
          ctx.check(`${ed.name}: edit under 2.5 s`, rec.ms < 2500, `${rec.ms} ms`, { soft: true })
          if (extra) await extra(ctx, target, ed, rec, out)
          facts.push(`${ed.name} ${rep.lines}L ${rep.font}${rep.fit ? ` fit ${rep.fit}` : ''} ${rec.ms}+${rec.finalizeMs}ms`)
        }
        ctx.metric(`${target.paragraphId} (${target.g.align}, ${target.g.lines} lines): ${facts.join('; ')}`)
      },
    })
  }

  const longPara = (minLines) => (g) => g.dir === 'ltr' && g.lines >= minLines && wordsOf(g.text).length >= 20
  // shorter: first half of the words
  const shorter = (t) => {
    const w = wordsOf(t.old)
    return [{ name: 'shorter', text: w.slice(0, Math.ceil(w.length * 0.5)).join(' ') + '.', want: { fewer: true } }]
  }
  for (const rel of ['reports/pdfjs-tracemonkey.pdf', 'reports/arxiv-1706.03762-attention.pdf', 'reports/arxiv-1810.04805-bert.pdf']) row(`shorter-${short(rel)}`, rel, (b) => pickPara(b, longPara(4)), shorter)

  // longer into free space below (no squeeze)
  const EXTRA = 'This added sentence makes the paragraph longer than it was before.'
  const longer = (t) => [{ name: 'longer', text: `${t.old} ${EXTRA}`, want: { grows: true } }]
  const freeBelow = (g, m) => g.dir === 'ltr' && g.lines >= 2 && wordsOf(g.text).length >= 10 && roomBelow(g, m, 4)
  for (const rel of ['reports/pdfjs-tracemonkey.pdf', 'reports/arxiv-1512.03385-resnet.pdf', 'invoices/aws-invoice.pdf']) row(`longer-${short(rel)}`, rel, (b) => pickPara(b, freeBelow), longer)

  // justified: a word in the middle gets longer; the result is still justified
  const justified = (g) => g.align === 'justify' && g.lines >= 4 && g.dir === 'ltr'
  const midWord = (t, all) => {
    const w = wordsOf(t.old)
    const k = w.findIndex((x, i) => i > w.length / 3 && /^\p{L}{5,}$/u.test(x) && count(squash(all), x) === 1)
    const k2 = k >= 0 ? k : Math.floor(w.length / 2)
    const nw = w.slice()
    nw[k2] = `${w[k2]}ness`
    return [{ name: 'justified', text: nw.join(' ') }]
  }
  const stillJustified = async (ctx, t, ed, rec) => {
    const again = rec.after?.find((x) => squash(x.text).includes(squash(ed.text).slice(0, 40)))
    ctx.check(`${ed.name}: still justified`, again?.align === 'justify', `align ${again?.align}`)
  }
  for (const rel of ['reports/pdfjs-tracemonkey.pdf', 'reports/arxiv-1810.04805-bert.pdf', 'reports/arxiv-1512.03385-resnet.pdf']) row(`justified-${short(rel)}`, rel, (b) => pickPara(b, justified), midWord, stillJustified)

  // a bold word next to edited regular words stays bold
  const boldPara = (g, m) => {
    if (g.dir !== 'ltr') return false
    const runs = m.runs.filter((r) => g.runIds.includes(r.id))
    return runs.some((r) => r.bold) && runs.some((r) => !r.bold && r.words.length >= 3)
  }
  const boldEdit = (t, all) => {
    const runs = t.m.runs.filter((r) => t.g.runIds.includes(r.id))
    t.bold = runs.find((r) => r.bold).words.map((w) => w.text)
    const reg = runs.filter((r) => !r.bold).flatMap((r) => r.words.map((w) => w.text)).find((x) => /^\p{L}{4,}$/u.test(x) && count(squash(all), x) === 1)
    const w = wordsOf(t.old)
    const k = w.indexOf(reg)
    const nw = w.slice()
    if (k >= 0) nw[k] = 'Changed'
    else nw.push('Changed')
    return [{ name: 'bold', text: nw.join(' ') }]
  }
  // bold glyphs of the word on the page, before and after
  const boldCount = (bytes, idx, word) => {
    const gs = glyphsOf(bytes, idx)
    let n = 0
    for (let i = 0; i + word.length <= gs.length; i++) {
      if (gs.slice(i, i + word.length).map((g) => g.c).join('') === word && /bold|medi|black|heavy|semibold|demi|-bd\b|bd$/i.test(gs[i].font.replace(/^[A-Z]{6}\+/, ''))) n++
    }
    return n
  }
  const boldKept = async (ctx, t, ed, rec, out) => {
    // a word whose own glyphs are bold (a run is "bold" by its first glyph only)
    const word = t.bold.find((x) => /^\p{L}{3,}$/u.test(x) && boldCount(t.input, t.pageNum - 1, x) > 0) ?? t.bold.find((x) => boldCount(t.input, t.pageNum - 1, x) > 0) ?? t.bold[0]
    const n0 = boldCount(t.input, t.pageNum - 1, word)
    const n1 = boldCount(out, t.pageNum - 1, word)
    ctx.check(`${ed.name}: bold word "${word}" still bold`, n0 > 0 && n1 === n0, `${n0} -> ${n1} bold`)
  }
  for (const rel of ['reports/pdfjs-tracemonkey.pdf', 'forms/irs-fw9.pdf', 'reports/arxiv-1706.03762-attention.pdf']) row(`bold-${short(rel)}`, rel, (b) => pickPara(b, boldPara), boldEdit, boldKept)

  // no room: much longer text with other text right below, page unchanged
  const blocked = (g, m) => g.dir === 'ltr' && g.lines >= 3 && !roomBelow(g, m, 1.5)
  const noRoom = (t) => [{ name: 'noroom', text: `${t.old} ${Array(8).fill(EXTRA).join(' ')}`, want: { refused: 'no-room' } }]
  for (const rel of ['reports/pdfjs-tracemonkey.pdf', 'reports/arxiv-1810.04805-bert.pdf', 'reports/arxiv-1512.03385-resnet.pdf']) row(`noroom-${short(rel)}`, rel, (b) => pickPara(b, blocked), noRoom)

  // two letters swapped inside a word: same lines, same font, no overflow
  const swap = (t, all) => {
    const w = wordsOf(t.old)
    // (two different letters, else the swap changes nothing)
    const k = w.findIndex((x, i) => i > 3 && i < w.length - 3 && /^\p{Ll}{6,}$/u.test(x) && x[1] !== x[2] && count(squash(all), x) === 1)
    const nw = w.slice()
    const x = w[k]
    nw[k] = x[0] + x[2] + x[1] + x.slice(3)
    return [{ name: 'swap', text: nw.join(' ') }]
  }
  const sameLook = async (ctx, t, ed, rec) => {
    const r = rec.report
    ctx.check(`${ed.name}: original font, same lines, no overflow, no squeeze`, r.font === 'original' && r.lines === t.g.lines && !r.overflow && !r.fit, JSON.stringify({ font: r.font, fallbackName: r.fallbackName, lines: `${t.g.lines}->${r.lines}`, overflow: r.overflow, fit: r.fit }))
  }
  const swapPara = (g, m) => longPara(4)(g) && wordsOf(g.text).some((x, i, a) => i > 3 && i < a.length - 3 && /^\p{Ll}{6,}$/u.test(x))
  for (const rel of ['reports/pdfjs-tracemonkey.pdf', 'reports/arxiv-1706.03762-attention.pdf', 'reports/arxiv-1810.04805-bert.pdf']) row(`swap-${short(rel)}`, rel, (b) => pickPara(b, swapPara), swap, sameLook)

  // an unchanged word with a TeX math sign (CMSY "∗", no letter mapping back
  // to a code) does not block editing the author list
  row('authors-pdfjs-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', (b) => pickPara(b, (g) => g.text.includes('Brendan')), (t) => [{ name: 'authors', text: t.old.replace('Brendan', 'Brandon') }], async (ctx, t, ed, rec, out) => {
    ctx.check('authors: original font', rec.report.font === 'original', `${rec.report.font} ${rec.report.fallbackName ?? ''}`)
    const stars = (b) => glyphsOf(b, 0).filter((g) => g.c === '∗').length
    ctx.check('authors: every star kept', stars(out) === stars(t.input) && stars(out) > 0, `${stars(t.input)} -> ${stars(out)}`)
  })

  // P0-1 (review): removed words leave no trace anywhere in the final file,
  // structure tree included (StructElem /ActualText, /Alt), replace and delete
  const nowhere = (word) => async (ctx, t, ed, rec, out) => {
    const hits = rawScan(out, [word]).hits
    ctx.check(`${ed.name}: "${word}" nowhere in the final file (streams, strings, structure tree)`, hits.length === 0, hits.slice(0, 3).map((h) => h.where).join('; '))
  }
  row('struct-synthetic', STRUCT, (b) => pickPara(b, (g) => g.text.includes('Johnsonwell')), (t) => [{ name: 'replace', text: t.old.replace('Johnsonwell', 'Smithers') }, { name: 'delete', text: '', want: { deleted: true } }], nowhere('Johnsonwell'))
  {
    // a tagged real file: a word unique in the file, not in a bookmark title
    let word = null
    const pickTagged = async (b) => {
      const d = mupdf.Document.openDocument(new Uint8Array(b), 'application/pdf')
      const titles = JSON.stringify(d.loadOutline() ?? [])
      d.destroy?.()
      // unique in the whole file (all pages), so "nowhere" is provable
      const all = squash(docText(b, 'preserve-whitespace', Infinity).join(''))
      // its streams in the file are this page's content only (not metadata or another page)
      const pageStreams = (p) => {
        const dd = mupdf.Document.openDocument(new Uint8Array(b), 'application/pdf').asPDF()
        try {
          const c = dd.findPage(p - 1).get('Contents')
          return new Set((c.isArray() ? Array.from({ length: c.length }, (_, i) => c.get(i)) : [c]).map((x) => x.asIndirect()))
        } finally {
          dd.destroy?.()
        }
      }
      return pickPara(b, (g) => {
        if (g.dir !== 'ltr' || wordsOf(g.text).length < 8) return false
        const own = pageStreams(+g.id.slice(1, g.id.indexOf('-')))
        word = wordsOf(g.text).find((w) => /^\p{L}{7,}$/u.test(w) && count(all, w) === 1 && !titles.includes(w) && rawScan(b, [w]).hits.every((h) => !/stream/.test(h.where) || own.has(+(/obj (\d+)/.exec(h.where)?.[1] ?? -1))))
        return !!word
      })
    }
    row('struct-us-budget', 'reports/us-budget-2024.pdf', pickTagged, (t) => [{ name: 'replace', text: t.old.replace(word, 'Qwertyuiop') }, { name: 'delete', text: '', want: { deleted: true } }], async (...a) => nowhere(word)(...a))
  }

  // P1-2 / P1-3 (review): new lines never cross a frame or a table rule drawn
  // before the text; an underline drawn after it does not block an edit
  const decorRel = (k) => `derived/edittext-decor-${k}.pdf`
  const quickPara = (b) => pickPara(b, (g) => g.text.startsWith('The quick'))
  const LONG = (t) => `${t.old} This added sentence makes the paragraph longer than it was before, by a lot of extra words here.`
  for (const k of ['frame', 'grid']) row(`decor-${k}`, decorRel(k), quickPara, (t) => [{ name: 'grow', text: LONG(t), want: { refused: 'no-room' } }])
  row('decor-underline', decorRel('underline'), quickPara, (t) => [{ name: 'shorter', text: t.old.replace('brown', 'red') }], async (ctx, t, ed, rec) => {
    ctx.check(`${ed.name}: applied, underline reported as kept in place`, !rec.report.refused && rec.report.decorations === true, `refused ${rec.report.refused} decorations ${rec.report.decorations}`)
  })

  // P1-4 (review): a word edit, then a paragraph edit of the same paragraph:
  // the redrawn line stays in its paragraph (no hole, no false break) and
  // the paragraph edit replaces it inside the column
  for (const rel of ['reports/pdfjs-tracemonkey.pdf', 'reports/arxiv-1810.04805-bert.pdf']) {
    let t = null
    add({
      id: `edittext-para-word-then-para-${short(rel)}`,
      tool: 'edittext',
      op: 'edittext:wordpara',
      files: [rel],
      timeout: 3 * MIN,
      async prepare() {
        const b = readRel(rel)
        const all = squash(docText(b).join(''))
        const p = await pickPara(b, (g) => g.dir === 'ltr' && g.lines >= 4)
        if (!p) return { skip: 'no paragraph' }
        const run = p.m.runs.find((r) => r.id === p.g.runIds[1])
        const w = run?.words.find((x, i) => i >= 1 && i < run.words.length - 2 && /^\p{Ll}{5,}$/u.test(x.text) && !all.includes(x.text.toUpperCase()))
        if (!w) return { skip: 'no word' }
        t = { ...p, runId: run.id, wordIndex: w.i, word: w.text, text: w.text.toUpperCase() }
        return { pageNum: p.pageNum, runId: run.id, wordIndex: w.i, old: w.text, text: t.text }
      },
      async validate(ctx) {
        const m = ctx.meta
        const fold = (x) => String(x).replace(/\s+/g, ' ').trim()
        ctx.check('word edit applied', !m.word.refused, m.word.refused)
        const want = fold(t.old.replace(t.word, t.text))
        ctx.check('after the word edit the paragraph is whole (no hole, no false break)', m.para && fold(m.para.text) === want && !m.para.text.includes('\n') === !t.old.includes('\n'), m.para ? m.para.text.slice(0, 120) : 'not found')
        const r = m.edit?.report
        ctx.check('paragraph edit applied', r && !r.refused, r?.refused ?? 'no edit')
        if (!r || r.refused) return
        ctx.check('nothing past the column', r.box[2] <= t.g.bbox[2] + 1, `${r.box[2]} vs ${t.g.bbox[2]}`)
        ctx.check('every word reads back whole, in order', fold((m.after ?? []).join(' ')).includes(fold(m.edit.text)), m.edit.text.slice(0, 60))
        const diff = pixelsOutside(render(ctx.out('word.pdf'), t.pageNum - 1), render(ctx.out('para.pdf'), t.pageNum - 1), [r.changedBox])
        ctx.check('no pixel changed outside the paragraph box', diff.outside === 0, `${diff.outside} px`)
        ctx.metric(`"${t.word}" -> "${t.text}", then ${t.paragraphId} ${r.lines}L ${r.font} ${m.edit.ms}ms`)
      },
    })
  }

  // Blind test P0-3: the same paragraph edited twice (tracemonkey p2, "Nested
  // loops ..."): drop the last 3 sentences, then one sentence in the middle.
  // Untouched words stay whole ("difficult", "first", "find", "naïve"), no
  // stretched lines, still editable after.
  {
    const rel = 'reports/pdfjs-tracemonkey.pdf'
    const CUT = 'When the inner loop exits, the VM would detect that a different branch was taken.'
    let orig = null
    add({
      id: 'edittext-para-twice-pdfjs-tracemonkey',
      tool: 'edittext',
      op: 'edittext:parachain',
      files: [rel],
      timeout: 3 * MIN,
      async prepare() {
        const m = await pageTextModel(readRel(rel), 2)
        orig = m.paragraphs.find((x) => x.text.startsWith('Nested loops'))
        if (!orig) return { skip: 'paragraph not found' }
        return { pageNum: 2, prefix: 'Nested loops', steps: [{ dropLast: 3 }, { remove: CUT }] }
      },
      async validate(ctx) {
        const m = ctx.meta
        const fold = (x) => String(x).replace(/\s+/g, ' ').trim()
        ctx.check('both edits applied', m.steps.length === 2 && m.steps.every((s) => s.report && !s.report.refused), JSON.stringify(m.steps.map((s) => s.report?.refused ?? (s.lost ? 'lost' : 'ok'))))
        const want = fold(orig.text.split(/(?<=\.)\s+/).slice(0, -3).join(' ').replace(`${CUT} `, ''))
        ctx.check('second edit opened with the first result, words whole', m.steps[1] && fold(m.steps[1].before.text) === fold(orig.text.split(/(?<=\.)\s+/).slice(0, -3).join(' ')), m.steps[1]?.before.text.slice(0, 120))
        ctx.check('final text exactly the expected words', m.final && fold(m.final.text) === want, m.final?.text.slice(0, 160))
        ctx.check('still an editable justified paragraph inside its column', m.final?.editable && m.final.align === 'justify' && m.final.bbox[2] <= orig.bbox[2] + 1 && m.final.bbox[0] >= orig.bbox[0] - 1, JSON.stringify(m.final && { why: m.final.why, align: m.final.align, bbox: m.final.bbox }))
        const words = ['difficult', 'first', 'naïve']
        const txt = docText(ctx.out('chain.pdf'))[1]
        const bad = words.filter((w) => !txt.includes(w) && !(w === 'naïve' && txt.includes('na¨ıve')))
        ctx.check('untouched words whole in the MuPDF text', bad.length === 0, bad.join(', '))
        // review 2 N8: the blind failure stretched two lines across the column
        noStretch(ctx, readRel(rel), ctx.out('chain.pdf'), 1, orig.bbox, m.final?.bbox ?? orig.bbox)
        ctx.metric(`${m.steps.map((s) => `${s.report?.lines}L ${s.ms}ms`).join(', ')}; final ${m.final?.lines} lines`)
      },
    })
  }

  // Blind test P1-1: edited words read in place and in order (poppler when
  // installed, else MuPDF only): title words "Dynamic" and "Trace-based"
  {
    const rel = 'reports/pdfjs-tracemonkey.pdf'
    let batch = null
    add({
      id: 'edittext-order-title-pdfjs-tracemonkey',
      tool: 'edittext',
      op: 'edittext:batch',
      files: [rel],
      timeout: 2 * MIN,
      async prepare() {
        const t = await findWord(readRel(rel), 'Dynamic')
        if (!t) return { skip: 'no word' }
        batch = [{ runId: t.runId, wordIndex: t.wordIndex, old: 'Dynamic', text: 'Fast' }, { runId: t.runId, wordIndex: 0, old: 'Trace-based', text: 'Trace-driven' }]
        return { pageNum: 1, batch }
      },
      async validate(ctx) {
        const want = 'Trace-driven Just-in-Time Type Specialization for Fast'
        ctx.check('both applied', ctx.meta.report.every((r) => !r.refused), ctx.meta.report.map((r) => r.refused).join(','))
        const out = ctx.out('batch.pdf')
        // the new draw sits where the old text was in the content: MuPDF and
        // pdf.js (content order) read it in place too
        ctx.check('drawn in place in the content (order inline)', ctx.meta.report.every((r) => r.order === 'inline'), ctx.meta.report.map((r) => r.order).join(','))
        ctx.check('MuPDF reads the edited title in order', docText(out)[0].replace(/\s+/g, ' ').includes(`${want} Languages`), docText(out)[0].slice(0, 80))
        const p = await checkPdf(ctx, 'batch.pdf', { pages: (await inputFacts(rel)).pdfjs.pages })
        const pj = (p?.pdfjs.texts?.[0] ?? '').replace(/\s+/g, ' ')
        ctx.check('pdf.js reads the edited title in order', pj.includes(`${want} Languages`), pj.slice(0, 80))
        let pop = null
        try {
          const { execFileSync } = await import('node:child_process')
          const { tmpdir } = await import('node:os')
          const tmp = join(tmpdir(), `swisspdf-order-${process.pid}.pdf`)
          writeFileSync(tmp, out)
          pop = execFileSync('pdftotext', ['-f', '1', '-l', '1', tmp, '-'], { encoding: 'utf8', timeout: 20000 })
        } catch {
          pop = null
        }
        if (pop != null) ctx.check('poppler (pdftotext) reads the edited title in order, in place', pop.replace(/\s+/g, ' ').includes(`${want} Languages`), pop.slice(0, 120))
        else ctx.metric('pdftotext not installed: poppler order not checked')
      },
    })
  }

  // reading order of a paragraph edit (blind P1-1): attention p2 intro, a
  // pdfTeX page drawn in one text object; the new paragraph reads between
  // the heading and the next paragraph in MuPDF, pdf.js and poppler
  const pop = async (bytes, page) => {
    try {
      const { execFileSync } = await import('node:child_process')
      const { tmpdir } = await import('node:os')
      const tmp = join(tmpdir(), `swisspdf-order-${process.pid}.pdf`)
      writeFileSync(tmp, bytes)
      return execFileSync('pdftotext', ['-f', String(page), '-l', String(page), tmp, '-'], { encoding: 'utf8', timeout: 20000 })
    } catch {
      return null
    }
  }
  const between = (txt, a, mid, b) => {
    const t = String(txt).replace(/\s+/g, ' ')
    const i = t.indexOf(a)
    const j = t.indexOf(mid, i + 1)
    const k = t.indexOf(b, j + 1)
    return i >= 0 && j > i && k > j
  }
  row('order-attention-intro', 'reports/arxiv-1706.03762-attention.pdf', (b) => pickPara(b, (g) => g.text.startsWith('Recurrent neural networks, long'), { pages: 2 }), (t) => [{ name: 'intro', text: `${t.old} They remain popular.` }], async (ctx, t, ed, rec, out) => {
    ctx.check(`${ed.name}: drawn in place in the content (order inline)`, rec.report.order === 'inline', rec.report.order)
    const mu = docText(out)[t.pageNum - 1]
    ctx.check(`${ed.name}: MuPDF reads it between the heading and the next paragraph`, between(mu, 'Introduction', 'They remain popular.', 'Recurrent models typically'))
    const p = await checkPdf(ctx, `${ed.name}.pdf`, { pages: (await inputFacts('reports/arxiv-1706.03762-attention.pdf')).pdfjs.pages, label: `${ed.name} order` })
    ctx.check(`${ed.name}: pdf.js reads it between the heading and the next paragraph`, between(p?.pdfjs.texts?.[t.pageNum - 1] ?? '', 'Introduction', 'They remain popular.', 'Recurrent models typically'))
    const pp = await pop(out, t.pageNum)
    if (pp != null) ctx.check(`${ed.name}: poppler reads it in place`, between(pp, 'Introduction', 'They remain popular.', 'Recurrent models typically'))
  })
  // W-9 label in tagged content inside a text object: no safe cut there, so
  // the draw is appended; poppler (layout order) still reads it in place
  {
    const rel = 'forms/irs-fw9.pdf'
    add({
      id: 'edittext-order-w9-company',
      tool: 'edittext',
      op: 'edittext:batch',
      files: [rel],
      timeout: 2 * MIN,
      async prepare() {
        const t = await findWord(readRel(rel), 'Business')
        return t ? { pageNum: 1, batch: [{ runId: t.runId, wordIndex: t.wordIndex, old: 'Business', text: 'Company' }] } : { skip: 'no word' }
      },
      async validate(ctx) {
        const r = ctx.meta.report[0]
        ctx.check('applied', !r.refused, r.refused)
        ctx.check('order reported', r.order === 'inline' || r.order === 'appended', r.order)
        const out = ctx.out('batch.pdf')
        const pp = await pop(out, 1)
        if (pp != null) ctx.check('poppler reads the label in place', pp.replace(/\s+/g, ' ').includes('2 Company name/disregarded entity name'), pp.slice(0, 100))
        ctx.metric(`order ${r.order}`)
      },
    })
  }

  // ----- final round (review 2 + blind round 2) -----
  // word gaps of a paragraph's lines (all but the last): widest per line
  const lineGaps = (bytes, idx, bbox) => {
    const bd = pageBounds(bytes, idx)
    const box = [bbox[0] + bd[0] - 1, bbox[1] + bd[1] - 1, bbox[2] + bd[0] + 1, bbox[3] + bd[1] + 1]
    const gs = glyphsOf(bytes, idx).filter((gl) => gl.x >= box[0] && gl.x <= box[2] && gl.y >= box[1] && gl.y <= box[3])
    const rowsY = new Map()
    for (const gl of gs) (rowsY.get(Math.round(gl.y)) ?? rowsY.set(Math.round(gl.y), []).get(Math.round(gl.y))).push(gl)
    const lines = [...rowsY.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l.sort((a, b) => a.x - b.x))
    const all = []
    const widest = lines.slice(0, -1).map((l) => {
      const size = Math.abs(l[0].q[7] - l[0].q[1]) || 9
      const g = l.slice(1).map((gl, i) => Math.min(gl.q[0], gl.q[6]) - Math.max(l[i].q[2], l[i].q[4])).filter((x) => x > 0.15 * size)
      all.push(...g)
      return g.length ? Math.max(...g) : 0
    })
    const med = all.length ? all.sort((a, b) => a - b)[all.length >> 1] : 0
    return { widest, med, max: widest.length ? Math.max(...widest) : 0 }
  }
  const noStretch = (ctx, input, out, idx, before, after) => {
    const a = lineGaps(input, idx, before)
    const b = lineGaps(out, idx, after)
    const limit = Math.max(2 * a.med, 1.05 * a.max)
    ctx.check('no stretched lines (word gaps within 2x the source median or its widest gap)', b.max <= limit, `widest ${b.max.toFixed(2)} vs limit ${limit.toFixed(2)}`)
  }
  const chain = (id, rel, pageNum, prefix, steps, check) => {
    let orig = null
    let origM = null
    add({
      id: `edittext-para-${id}`,
      tool: 'edittext',
      op: 'edittext:parachain',
      files: [rel],
      timeout: 3 * MIN,
      async prepare() {
        const m = await pageTextModel(readRel(rel), pageNum)
        orig = m.paragraphs.find((x) => x.text.startsWith(prefix))
        origM = m
        if (!orig) return { skip: 'paragraph not found' }
        return { pageNum, prefix, steps }
      },
      async validate(ctx) {
        const m = ctx.meta
        ctx.check('every step applied', m.steps.length === steps.length && m.steps.every((x) => x.report && !x.report.refused), JSON.stringify(m.steps.map((x) => x.report?.refused ?? (x.lost ? 'lost' : 'ok'))))
        await check(ctx, orig, m, ctx.out('chain.pdf'), origM)
        ctx.metric(m.steps.map((x) => `${x.kind ?? 'para'} ${x.report?.lines ?? ''}L win ${JSON.stringify(x.report?.window ?? null)} ${x.ms}ms`).join('; '))
      },
    })
  }
  // source line-end hyphen pairs ("com-" + "pile") printed on one line
  const midHyphens = (orig, origM, outText) => {
    const runs = origM.runs.filter((r) => orig.runIds.includes(r.id))
    const pairs = runs.slice(0, -1).flatMap((r, k) => {
      const w = r.text.trim().split(/\s+/).pop()
      const nx = runs[k + 1].text.trim().split(/\s+/)[0]
      return /[-]$/.test(w) && nx && !orig.text.includes(`${w}${nx}`) ? [`${w}${nx}`] : []
    })
    return pairs.filter((pp) => outText.split(/\n/).some((l) => l.includes(pp)))
  }
  const fold = (x) => String(x).replace(/\s+/g, ' ').trim()
  // blind 2 P0-1 B: the abstract edited twice (a sentence added, then the last two dropped)
  chain('abstract-twice-pdfjs-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', 1, 'Dynamic languages such as JavaScript are more', [{ append: 'This sentence is new.' }, { dropLast: 2 }], async (ctx, orig, m, out, origM) => {
    const s1 = `${orig.text} This sentence is new.`.split(/(?<=\.)\s+/)
    const want = fold(s1.slice(0, -2).join(' '))
    ctx.check('final text exactly the expected words', fold(m.final?.text) === want, m.final?.text.slice(0, 120))
    const bad = midHyphens(orig, origM, docText(out)[0])
    ctx.check('no source line-end hyphen printed mid-line', bad.length === 0, bad.slice(0, 3).join(' | '))
    noStretch(ctx, readRel('reports/pdfjs-tracemonkey.pdf'), out, 0, orig.bbox, m.final?.bbox ?? orig.bbox)
  })
  // blind 2 P0-1 A + P1-1: right column, a line edit, then a sentence deleted by paragraph edit
  const CUT2 = 'Without exact type information, the compiler must emit slower generalized machine code that can deal with all potential type combinations.'
  chain('line-then-para-pdfjs-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', 1, 'Compilers for statically', [{ line: ['may vary at runtime', 'may change at runtime. This means the compiler can no longer'] }, { remove: CUT2 }], async (ctx, orig, m, out, origM) => {
    const before = m.steps[1]?.before
    ctx.check('the line edit did not become a hard break in the paragraph', before && !before.text.includes('\n'), before?.text.slice(0, 120))
    ctx.check('final paragraph justified, inside its column', m.final?.align === 'justify' && m.final.bbox[2] <= orig.bbox[2] + 1 && m.final.bbox[0] >= orig.bbox[0] - 1, JSON.stringify(m.final && { align: m.final.align, bbox: m.final.bbox }))
    ctx.check('sentence gone, edited line kept', m.final && !m.final.text.includes('Without exact type') && m.final.text.includes('may change at runtime'), m.final?.text.slice(0, 160))
    const bad = midHyphens(orig, origM, docText(out)[0])
    ctx.check('no source line-end hyphen printed mid-line', bad.length === 0, bad.slice(0, 3).join(' | '))
    noStretch(ctx, readRel('reports/pdfjs-tracemonkey.pdf'), out, 0, orig.bbox, m.final?.bbox ?? orig.bbox)
  })
  // blind 2 P0-1 A alone: lines above the deleted sentence are not touched
  row('right-col-delete-pdfjs-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', (b) => pickPara(b, (g) => g.text.startsWith('Compilers for statically')), (t) => [{ name: 'del', text: t.old.replace(`${CUT2} `, '') }], async (ctx, t, ed, rec) => {
    ctx.check(`${ed.name}: lines above the change left as they are (window starts below line 1)`, rec.report.window?.[0] > 0, JSON.stringify(rec.report.window))
  })
  // blind 2 P1-3: coolblue address, a word edit, then the street line replaced
  chain('coolblue-address', 'invoices/coolblue.pdf', 1, 'Pino ', [{ word: ['Bluebird', 'Blackbird-Smithson'] }, { replace: ['Sessamestreet 32', 'Keizersgracht 1001 bis'] }], async (ctx, orig, m) => {
    const r = m.steps[1]?.report
    ctx.check('untouched lines are not squeezed (squeeze stays in the window)', r && (!r.fit || r.window?.[0] > 0), JSON.stringify(r && { fit: r.fit, window: r.window }))
    ctx.check('the name line is not re-wrapped', r && r.window?.[0] >= 1, JSON.stringify(r?.window))
  })
  // underline (review 1 P1-3 / blind 2 P1-2): words under it do not move
  {
    const rel = decorRel('underline')
    let t = null
    add({
      id: 'edittext-decor-underline-word',
      tool: 'edittext',
      op: 'edittext:edit',
      files: [rel],
      timeout: 2 * MIN,
      async prepare() {
        const m = await pageTextModel(readRel(rel), 1)
        const run = m.runs.find((x) => x.text.startsWith('running'))
        const w = run?.words.find((x) => x.text === 'the')
        if (!w) return { skip: 'no word' }
        t = { pageNum: 1, runId: run.id, wordIndex: w.i, old: 'the' }
        return { ...t, edits: [{ name: 'under', text: 'sprinting' }] }
      },
      async validate(ctx) {
        const e = ctx.meta.edits[0]
        ctx.check('word under the underline refused as decorated, file unchanged', e.report.refused === 'decorated' && e.unchanged, `${e.report.refused} unchanged ${e.unchanged}`)
      },
    })
  }
  row('decor-underline-append', decorRel('underline'), quickPara, (t) => [{ name: 'append', text: `${t.old} Then it slept well.` }], async (ctx, t, ed, rec) => {
    ctx.check(`${ed.name}: only the last line re-laid (underlined line untouched)`, JSON.stringify(rec.report.window) === '[2,2]', JSON.stringify(rec.report.window))
  })
  row('decor-underline-change', decorRel('underline'), quickPara, (t) => [{ name: 'change', text: t.old.replace('field', 'meadow'), want: { refused: 'decorated' } }])
  // blind 2 P0-2: an XFA form keeps the old caption; it is dropped on edit
  {
    const rel = 'forms/irs-fw9.pdf'
    add({
      id: 'edittext-xfa-fw9-partnership',
      tool: 'edittext',
      op: 'edittext:batch',
      files: [rel],
      timeout: 2 * MIN,
      async prepare() {
        const m = await pageTextModel(readRel(rel), 1)
        const run = m.runs.find((x) => x.text.trim() === 'Partnership')
        return run ? { pageNum: 1, batch: [{ runId: run.id, wordIndex: 0, old: 'Partnership', text: 'Partners' }] } : { skip: 'no caption' }
      },
      async validate(ctx) {
        const r = ctx.meta.report[0]
        ctx.check('applied', !r.refused, r.refused)
        ctx.check('xfaRemoved reported', ctx.meta.xfaRemoved === true)
        const out = ctx.out('batch.pdf')
        const scan = rawScan(out, ['Partnership'])
        ctx.check('no XFA left in the file', !scan.xfa && scan.xfaStreams === 0, `xfa ${scan.xfa} streams ${scan.xfaStreams}`)
        const b0 = count(pageStrings(readRel(rel), 0), 'Partnership')
        const b1 = count(pageStrings(out, 0), 'Partnership')
        ctx.check('the edited caption is gone from the page (one copy fewer, the other uses stay)', b1 === b0 - 1, `${b0} -> ${b1}`)
        const inXfa = scan.hits.filter((h) => /xfa/i.test(h.where))
        ctx.check('old caption in no XFA stream', inXfa.length === 0, inXfa.map((h) => h.where).join('; '))
      },
    })
  }
  // review 2 N2: deleting a paragraph keeps a figure Alt sharing its words and a page-2 ActualText
  row('struct-keep-others', STRUCT2, (b) => pickPara(b, (g) => g.text.startsWith('Results came back')), () => [{ name: 'delete', text: '', want: { deleted: true } }], async (ctx, t, ed, rec, out) => {
    const d = mupdf.Document.openDocument(new Uint8Array(out), 'application/pdf').asPDF()
    try {
      const K = d.getTrailer().get('Root').get('StructTreeRoot').get('K')
      const get = (i, k) => (K.get(i).get(k).isString() ? K.get(i).get(k).asString() : null)
      ctx.check('edited paragraph: its ActualText gone', get(0, 'ActualText') === null, get(0, 'ActualText'))
      ctx.check('figure Alt on the same page kept', get(1, 'Alt') === 'Chart without values, drawn in blue', get(1, 'Alt'))
      ctx.check('other paragraph ActualText and title kept', get(2, 'ActualText') === 'Other paragraph that stays as it was.' && get(2, 'T') === 'Closing notes')
      ctx.check('page-2 element (no /Pg) ActualText kept', get(3, 'ActualText') === 'Page two text without the patient name.', get(3, 'ActualText'))
    } finally {
      d.destroy?.()
    }
  })

  // review 3 P1-4: dynamic XFA forms (the page is only "Please wait"): the
  // model refuses every line and editText refuses, bytes unchanged
  for (const rel of ['forms/xfa-issue14315.pdf', 'forms/xfa-imm1344e-filled.pdf']) {
    add({
      id: `edittext-xfa-dynamic-${short(rel)}`,
      tool: 'edittext',
      op: 'edittext:refuse',
      files: [rel],
      timeout: 2 * MIN,
      async prepare() {
        const m = await readModel(readRel(rel), 1)
        const run = m.runs.find((r) => r.words.length)
        return run ? { pageNum: 1, runId: run.id, wordIndex: null } : { skip: 'no text' }
      },
      async validate(ctx) {
        const meta = ctx.meta
        ctx.check('model marks the text xfa-dynamic', meta.why === 'xfa-dynamic', `why ${meta.why}`)
        ctx.check('edit refused as xfa-dynamic', meta.report?.refused === 'xfa-dynamic', `refused ${meta.report?.refused}`)
        ctx.check('file unchanged', meta.unchanged)
      },
    })
  }

  // review 3 P1-1, word path only: a one-word edit in tracemonkey p3-g6 (a
  // paragraph that ends a column next to another): the edited line and every
  // other line re-read as editable runs
  {
    const rel = 'reports/pdfjs-tracemonkey.pdf'
    let t = null
    add({
      id: 'edittext-word-p3g6-pdfjs-tracemonkey',
      tool: 'edittext',
      op: 'edittext:edit',
      files: [rel],
      timeout: 2 * MIN,
      async prepare() {
        const m = await pageTextModel(readRel(rel), 3)
        const g = m.paragraphs.find((x) => x.id === 'p3-g6')
        const run = g && m.runs.find((r) => r.id === g.runIds[0] && r.editable)
        const w = run?.words.find((x) => /^\p{Ll}{4,}$/u.test(x.text))
        if (!w) return { skip: 'p3-g6 word not found' }
        t = { pageNum: 3, runId: run.id, wordIndex: w.i, old: w.text, editableBefore: m.runs.filter((r) => r.editable).length }
        return { ...t, edits: [{ name: 'word', text: `${w.text}xy` }] }
      },
      async validate(ctx) {
        const e = ctx.meta.edits[0]
        ctx.check('applied', !e.report.refused, e.report.refused)
        if (e.report.refused) return
        const m = await readModel(ctx.out('word.pdf'), 3)
        const run = m.runs.find((r) => r.words.some((w) => w.text === `${t.old}xy` || w.text.startsWith(`${t.old}xy`)))
        ctx.check('the edited line re-reads as an editable run', run?.editable === true, run ? `${run.id} why ${run.why}` : 'not found')
        const n = m.runs.filter((r) => r.editable).length
        ctx.check('no run became uneditable', n >= t.editableBefore, `${t.editableBefore} -> ${n}`)
        ctx.metric(`"${t.old}" -> "${t.old}xy": ${e.report.font}, order ${e.report.order}, ${e.ms}ms`)
      },
    })
  }

  // empty text deletes the paragraph: every glyph gone, nothing drawn
  const del = () => [{ name: 'delete', text: '', want: { deleted: true } }]
  for (const rel of ['reports/pdfjs-tracemonkey.pdf', 'invoices/aws-invoice.pdf', 'reports/arxiv-1810.04805-bert.pdf']) row(`delete-${short(rel)}`, rel, (b) => pickPara(b, longPara(3)), del)

  // right to left (only two corpus files have Arabic text with a letter
  // mapping: udhr-arabic, where most lines carry U+FFFD, and ArabicCIDTrueType)
  const AR = 'الجديدة' // "the new"
  const rtlPara = (minWords) => (g) => g.dir === 'rtl' && wordsOf(g.text).length >= minWords
  row('rtl-longer-arabic-cid', 'intl/pdfjs-ArabicCIDTrueType.pdf', (b) => pickPara(b, (g, m) => rtlPara(3)(g) && roomBelow(g, m, 2)), (t) => [{ name: 'rtl', text: `${t.old} ${AR}`, want: { grows: true } }], async (ctx, t, ed, rec) => {
    const old = t.g.bbox
    ctx.check('rtl: right edge kept', Math.abs(rec.report.box[2] - old[2]) < 2, `${old[2]} -> ${rec.report.box[2]}`)
  })
  row('rtl-shorter-udhr-arabic', 'intl/udhr-arabic.pdf', (b) => pickPara(b, rtlPara(3)), (t) => [{ name: 'rtl', text: wordsOf(t.old).slice(0, -1).join(' ') }])
  row('rtl-noroom-udhr-arabic', 'intl/udhr-arabic.pdf', (b) => pickPara(b, (g, m) => rtlPara(3)(g) && !roomBelow(g, m, 1.5)), (t) => [{ name: 'rtl', text: `${t.old} ${t.old} ${t.old} ${t.old}`, want: { refused: 'no-room' } }])
  // a bold Arabic word replaced: Noto Arabic has no bold here, so synthetic bold
  row('rtl-bold-arabic-cid', 'intl/pdfjs-ArabicCIDTrueType.pdf', (b) => pickPara(b, (g, m) => g.dir === 'rtl' && roomBelow(g, m, 2) && m.runs.some((r) => g.runIds.includes(r.id) && r.bold)), (t) => {
    const w = wordsOf(t.old)
    return [{ name: 'bold', text: [...w.slice(0, -1), AR].join(' ') }]
  }, async (ctx, t, ed, rec) => {
    ctx.check('bold: synthetic bold used for the new word', /synthetic bold/.test(rec.report.fallbackName ?? ''), rec.report.fallbackName)
  })

  // RTL line push (line edit): a longer Arabic word pushes the rest of its line left
  const rtlWord = async (bytes) => {
    const np = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf').countPages()
    for (let p = 1; p <= Math.min(2, np); p++) {
      const m = await pageTextModel(bytes, p)
      const all = squash(docText(bytes).join(''))
      for (const r of m.runs) {
        if (!r.editable || r.script !== 'arabic' || r.words.length < 3) continue
        // alone on its row (no other piece of the same line beside it)
        const side = m.runs.some((x) => x !== r && x.bbox && Math.min(x.bbox[3], r.bbox[3]) - Math.max(x.bbox[1], r.bbox[1]) > 0.5 * (r.bbox[3] - r.bbox[1]))
        if (side) continue
        const w = r.words.find((x, i) => i <= r.words.length - 3 && /^[\p{Script=Arabic}\p{M}]{3,}$/u.test(x.text) && count(all, squash(x.text)) === 1)
        if (w) return { pageNum: p, runId: r.id, wordIndex: w.i, old: w.text, line: r.text, after: r.words.slice(w.i + 1).map((x) => x.text) }
      }
    }
    return null
  }
  // (ArabicCIDTrueType repeats one phrase, so it has no word unique in the file)
  for (const rel of ['intl/udhr-arabic.pdf']) {
    let target = null
    add({
      id: `edittext-rtl-push-${short(rel)}`,
      tool: 'edittext',
      op: 'edittext:edit',
      files: [rel],
      timeout: 3 * MIN,
      async prepare() {
        target = await rtlWord(readRel(rel))
        if (!target) return { skip: 'no Arabic word with text after it on a line of its own' }
        return { ...target, edits: [{ name: 'push', text: target.old + target.old.slice(0, 3) }, { name: 'pull', text: target.old.slice(0, 2) }] }
      },
      async validate(ctx) {
        const input = readRel(rel)
        const idx = target.pageNum - 1
        for (const e of ctx.meta.edits) {
          const r = e.report
          ctx.check(`${e.name}: applied`, !r.refused, r.refused)
          if (r.refused) continue
          ctx.check(`${e.name}: rest of the line moved ${e.name === 'push' ? 'left' : 'right'}`, !r.noPush && (e.name === 'push' ? r.pushed < -0.3 : r.pushed > 0.3), `pushed ${r.pushed} noPush ${r.noPush}`)
          const out = ctx.out(`${e.name}.pdf`)
          const diff = pixelsOutside(render(input, idx), render(out, idx), [r.changedBox])
          ctx.check(`${e.name}: no pixel changed outside the edited box`, diff.outside === 0, `${diff.outside} px`)
          const txt = docText(out)[idx].replace(/\p{M}/gu, '')
          const rest = target.after.map((x) => x.replace(/\p{M}/gu, ''))
          ctx.check(`${e.name}: moved words still read the same`, rest.every((w) => txt.includes(w)), rest.filter((w) => !txt.includes(w)).join(' '))
          ctx.check(`${e.name}: new word in MuPDF text`, squash(txt).includes(squash(e.text.replace(/\p{M}/gu, ''))))
          const moved = movedOutside(glyphsOf(input, idx), glyphsOf(out, idx), r.changedBox, pageBounds(input, idx))
          ctx.check(`${e.name}: other glyphs unmoved`, moved.length === 0, `${moved.length} moved`)
        }
        ctx.metric(`"${target.old}": ${ctx.meta.edits.map((e) => `${e.name} pushed ${e.report.pushed} ${e.ms}ms`).join('; ')}`)
      },
    })
  }

  // P2 #6: inline image inside a form XObject survives an edit byte for byte
  const formInline = (bytes) => {
    const d = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf').asPDF()
    const out = []
    try {
      const xo = d.findPage(0).getInheritable('Resources').get('XObject')
      if (xo.isDictionary()) xo.forEach((x) => {
        const data = Buffer.from(x.readStream().asUint8Array()).toString('latin1')
        out.push(...[...data.matchAll(/(?:^|[\s>\]])(BI[\s/][\s\S]*?\sID\s[\s\S]*?\sEI)(?=\s|$)/g)].map((m) => m[1]))
      })
    } finally {
      d.destroy?.()
    }
    return out
  }
  {
    const rel = FORM_INLINE
    let target = null
    add({
      id: 'edittext-p2-form-inline',
      tool: 'edittext',
      op: 'edittext:edit',
      files: [rel],
      timeout: 2 * MIN,
      async prepare() {
        target = await findWord(readRel(rel), 'image')
        return target ? { ...target, edits: [{ name: 'ed', text: 'picture' }] } : { skip: 'no word' }
      },
      async validate(ctx) {
        const e = ctx.meta.edits[0]
        ctx.check('applied', !e.report.refused, e.report.refused)
        const before = formInline(readRel(rel))
        const after = formInline(ctx.out('ed.pdf'))
        ctx.check('inline image in the form unchanged, byte for byte', before.length === 1 && after.length === 1 && before[0] === after[0], `${before.length} -> ${after.length}`)
        const diff = pixelsOutside(render(readRel(rel), 0), render(ctx.out('ed.pdf'), 0), [e.report.changedBox])
        ctx.check('no pixel changed outside the edited box (image intact)', diff.outside === 0, `${diff.outside} px`)
      },
    })
  }
}
