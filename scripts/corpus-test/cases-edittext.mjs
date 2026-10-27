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
import { rawScan } from './validate.mjs'
import { ROOT } from './server.mjs'
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

try {
  await buildHindi()
  buildSigned()
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

// Exact (case-sensitive) occurrences of a word in the decoded streams that
// draw pages: as a literal, joined across TJ pieces, and as UTF-16 hex.
// Attachments, metadata and images are not page text.
function byteCount(bytes, term) {
  const d = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf').asPDF()
  const hex = [...term].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')
  let n = 0
  try {
    for (let i = 1; i < d.countObjects(); i++) {
      const ref = d.newIndirect(i)
      if (!ref.isStream()) continue
      const t = ref.get('Type').toString()
      const st = ref.get('Subtype').toString()
      if (t === '/EmbeddedFile' || t === '/Metadata' || st === '/Image' || t === '/XRef' || t === '/ObjStm') continue
      let data
      try {
        data = new TextDecoder('latin1').decode(ref.readStream().asUint8Array())
      } catch {
        continue
      }
      const joined = [...data.matchAll(/\((?:[^()\\]|\\.)*\)/g)].map((m) => m[0].slice(1, -1)).join('')
      n += count(data, term) + count(joined, term) + count(data.toLowerCase(), hex)
    }
  } finally {
    d.destroy?.()
  }
  return n
}

// Checks one edited output. Returns facts for the metric line.
export async function checkEdit(ctx, { checkPdf, input, inputFacts, rel, target, edit, name, rep, ms, script, beforeImg, beforeHits, pjBefore }) {
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
  const hits = byteCount(out, old)
  if (beforeHits > 0) ctx.check(`${label}: fewer copies of the old word in the file bytes`, hits < beforeHits, `${beforeHits} -> ${hits}`)
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
  ctx.check(`${label}: under 3 s`, ms < 3000, `${ms} ms`)
  return `${name} ${ms}ms ${rep.font === 'original' ? 'orig' : rep.fallbackName}${rep.overflow ? ' overflow' : ''}${rep.shift ? ` shift ${rep.shift}` : ''}`
}

// Facts about the input the output checks compare against.
export async function beforeFacts(input, target, inputFacts, rel) {
  const f = await inputFacts(rel)
  const pj = f.pdfjs.texts?.[target.pageNum - 1] ?? ''
  return { beforeImg: render(input, target.pageNum - 1), beforeHits: byteCount(input, target.old), pjBefore: count(squash(pj), squash(target.old)) }
}

const short = (rel) => rel.split('/').pop().replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 24)

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
            const fact = await checkEdit(ctx, { checkPdf, input, inputFacts, rel, target, edit: ed, name: ed.name, rep: e?.report, ms: e?.ms ?? 0, script, ...before })
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
