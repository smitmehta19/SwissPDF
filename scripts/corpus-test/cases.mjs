// Every corpus case: which op runs on which real files, and how Node checks
// the output. A check is hard (fails the case) unless marked soft; soft
// checks only add a warning and evidence for an audit finding.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import * as mupdf from 'mupdf'
import {
  probe,
  textOf,
  textAt,
  findTextPositions,
  imagePlacements,
  outlineCount,
  formFacts,
  officeText,
  wordCoverage,
  boxesSane,
  withPdfjs,
  openMupdf,
  rawScan,
  redactionLeaks,
} from './validate.mjs'
import { ROOT } from './server.mjs'
import { USER_PW } from './derive.mjs'

export const CORPUS = join(ROOT, 'test-corpus')
const MIN = 60_000

// Short titles of docs/research/swisspdf-audit.md findings.
export const AUDIT = {
  1: 'Intake rejects owner-only (restriction) encrypted files',
  2: 'Redact boxes use unrotated MediaBox, land wrong on rotated/CropBox pages',
  3: 'Redact search misses phrases split across text items',
  4: 'Every render reopens + copies the whole file (large-file cost)',
  5: 'Redact re-parses the source per untouched page',
  6: 'Compress: lossless only / Maximum rasterizes text',
  7: 'pdf-lib intake rejects damaged files viewers open',
  8: 'Stamps/edits ignore rotation, CropBox and MediaBox origin',
  9: 'Only WinAnsi fonts: non-Latin text throws',
  10: 'OCR English only, assets from CDN (not offline)',
  11: 'OCR re-OCRs born-digital pages, no deskew, fixed DPI',
  12: 'Merge/split drop outlines, AcroForm, links',
  13: 'Crop rejects rotated, ignores box origin',
  14: 'Edit is overlay-only',
  15: 'PDF to Word interleaves columns, no borderless tables, RTL',
  16: 'PDF to Excel number parsing loses leading zeros / formats',
  17: 'PDF to PPT slides are flat images, fixed slide size',
  18: 'Office to PDF quick mode is screenshots (no text)',
  19: 'HiFi engine from unpinned CDN, font substitution',
  20: 'pdf.js without cMapUrl / standard fonts / wasm',
  21: 'Forms: XFA not handled, slow widget map',
  22: 'Protect: comma in password splits MuPDF options',
  23: 'Image to PDF: EXIF, HEIC, pixel-as-point page size',
  24: 'Sign is visual only, one placement',
  25: 'Redact rasterizes whole pages (size balloons)',
  26: 'Repair rebuild drops outlines/AcroForm/metadata',
  27: 'Compare by page index only; inserted page breaks the rest',
  28: 'HTML to PDF is a screenshot, head styles dropped',
  29: 'Split/batch outputs and ZIP all in memory',
  30: 'assertValidOutput re-parses outputs with pdf-lib',
  31: 'Unlock: one password per batch, MuPDF docs not destroyed',
  32: 'Watermark centring is a 45 degree approximation',
  33: 'Page numbers: no skip/template/Bates',
  34: 'Organize renders all thumbnails at once',
  35: 'Upload grid: no rotate/sort/add',
  36: 'No result screen / chaining',
  37: 'Files lost on tool switch / Escape',
  38: 'No cancel, no progress bar',
  39: 'Single-file tools have no batch',
  40: 'Thumbnail cache never evicted',
  41: 'Single pdf.js queue delays user ops',
  42: 'Self-test uses only synthetic fixtures',
}

// Findings that need a human or a design review, not a corpus run.
export const AUDIT_NOT_TESTABLE = {
  4: 'no per-render copy counter; large scans now render (JPX fixed in U1), see time and heap on pdf2img-bible-62MB, pdf2img-crooked-104MB, split-911-large',
  5: 'internal cost; covered indirectly by redact timing',
  14: 'feature gap (no text editing API to call)',
  24: 'feature gap (no PAdES / multi-place API to call)',
  29: 'memory profile of very large splits not measured in U0',
  30: 'internal double parse; see timings',
  31: 'per-file password is UI only; destroy() leak not measured',
  32: 'centring at non-45 angles not measured',
  33: 'feature gap',
  34: 'UI thumbnail batching not driven in U0',
  35: 'UI feature gap',
  36: 'UI feature gap',
  37: 'UI navigation behaviour not driven in U0',
  38: 'UI feature gap',
  39: 'UI feature gap',
  40: 'memory over a long session not measured',
  41: 'queue contention not measured',
  19: 'CDN pinning is a config review item; font fidelity not scored',
}

const PASSWORDS = {
  'quirks/pdfjs-issue3371.pdf': 'ELXRTQWS',
  'quirks/pdfjs-issue6010_1.pdf': 'abc',
  'quirks/pdfjs-issue6010_2.pdf': 'æøå',
  'quirks/pdfjs-bug1782186.pdf': 'Hello',
  'quirks/pdfjs-issue21579.pdf': 'pässwört',
  'quirks/pdfjs-issue15893_reduced.pdf': 'test',
  // manifest password (SASLprep form: S, U+00AA, S, L, U+00AD, prep)
  'quirks/pdfjs-saslprep-r6.pdf': 'SªSL­prep',
  'derived/user-pw-TAMReview.pdf': USER_PW,
}
export const passwordFor = (rel) => PASSWORDS[rel]

// Known page counts where pdf.js is wrong: it trusts /Count, but this page
// tree loops back on itself and holds 1 real page (MuPDF agrees).
const TRUE_PAGES = {
  'quirks/pdfjs-Pages-tree-refs.pdf': 1,
}

const abs = (rel) => join(CORPUS, rel)
export const sizeOf = (rel) => statSync(abs(rel)).size
const readRel = (rel) => new Uint8Array(readFileSync(abs(rel)))

// ---------- input facts (cached) ----------
const factCache = new Map()
export async function inputFacts(rel) {
  if (!factCache.has(rel)) {
    factCache.set(rel, probe(readRel(rel), { password: PASSWORDS[rel], texts: true, maxTextPages: 60 }))
  }
  return factCache.get(rel)
}

// Most frequent 7+ letter word on page 1 (redaction target).
async function pickTerm(rel) {
  const f = await inputFacts(rel)
  const text = f.pdfjs.texts?.[0] ?? ''
  let words = text.match(/\b[A-Za-z]{7,}\b/g) ?? []
  if (!words.length) words = text.match(/\b[A-Za-z]{5,}\b/g) ?? []
  const counts = new Map()
  for (const w of words) counts.set(w.toLowerCase(), (counts.get(w.toLowerCase()) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

// EXIF orientation tag of a JPEG (1 when absent).
function exifOrientation(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let i = 2
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) return 1
    const marker = bytes[i + 1]
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (marker === 0xe1 && String.fromCharCode(...bytes.slice(i + 4, i + 8)) === 'Exif') {
      const t = i + 10
      const le = bytes[t] === 0x49
      const u16 = (o) => (le ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1])
      const u32 = (o) => (le ? u16(o) + u16(o + 2) * 65536 : u16(o) * 65536 + u16(o + 2))
      const ifd = t + u32(t + 4)
      const n = u16(ifd)
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12
        if (u16(e) === 0x0112) return u16(e + 8)
      }
      return 1
    }
    if (marker === 0xda) return 1
    i += 2 + len
  }
  return 1
}

// ---------- shared output checks ----------
// Opens an output PDF in both engines and runs the generic sanity checks.
async function checkPdf(ctx, name, { pages, password, label = name, maxInfoPages } = {}) {
  const bytes = ctx.out(name)
  if (!bytes) {
    ctx.check(`${label}: output written`, false, 'no output file')
    return null
  }
  const p = await probe(bytes, { password, texts: true, maxTextPages: 60, maxInfoPages })
  ctx.check(`${label}: opens in pdf.js`, p.pdfjs.ok, p.pdfjs.error)
  ctx.check(`${label}: opens in MuPDF`, p.mupdf.ok, p.mupdf.error ?? (p.mupdf.needsPassword ? 'needs password' : ''))
  if (p.pdfjs.ok) {
    if (pages != null) ctx.check(`${label}: page count`, p.pdfjs.pages === pages, `got ${p.pdfjs.pages}, want ${pages}`)
    const bad = boxesSane(p.pdfjs.pageInfo)
    ctx.check(`${label}: page boxes sane`, !bad, bad)
    if (p.mupdf.ok) ctx.check(`${label}: engines agree on pages`, p.mupdf.pages === p.pdfjs.pages, `pdf.js ${p.pdfjs.pages} vs MuPDF ${p.mupdf.pages}`)
  }
  return p
}

const allText = (p) => (p?.pdfjs?.texts ?? []).join('\n')

// Raw check on every redaction output (integ-1 #14, redact-fix review #9): no
// page object outside the page tree, no loose objects, no XFA, none of
// `terms` anywhere in the decoded file (hex, UTF-16 and CID text included),
// no listed-but-undrawn images, forms or patterns, and nothing left under the
// boxes the op reports (meta.areas): characters, image pixels, curved or
// slanted drawings, pattern fills.
function leakCheck(ctx, name, terms = []) {
  const bytes = ctx.out(name)
  if (!bytes) return
  const { bad } = redactionLeaks(bytes, terms, { pages: 'all', boxes: ctx.meta?.areas ?? [] })
  ctx.check(`raw file clean${terms.length ? ` of ${terms.map((t) => `"${t}"`).join(', ')}` : ''}`, bad.length === 0, bad.join('; '))
}

// Pages the redaction did not touch read exactly as before (a whole-file
// object walk before a compacting save has cost MuPDF page content).
async function sameUntouched(ctx, rel, p, pagesHit = []) {
  const f = await inputFacts(rel)
  const hit = new Set(pagesHit)
  const changed = f.pdfjs.texts.map((t, i) => i).filter((i) => !hit.has(i + 1) && i < p.pdfjs.texts.length && f.pdfjs.texts[i] !== p.pdfjs.texts[i])
  ctx.check('untouched pages keep exactly their text', changed.length === 0, changed.slice(0, 3).map((i) => `p${i + 1} ${f.pdfjs.texts[i].length} -> ${p.pdfjs.texts[i].length} chars`).join(', '))
}

// Form outputs: the XFA copy (with the old values) must not stay behind as
// loose streams once the /XFA key is gone.
function xfaLeftCheck(ctx, name) {
  const bytes = ctx.out(name)
  if (!bytes) return
  const scan = rawScan(bytes)
  ctx.check('no XFA streams left in the file', !scan.xfa && scan.xfaStreams === 0, `XFA key ${scan.xfa}, ${scan.xfaStreams} XFA stream(s)`, { audit: 21 })
}
const pct = (a, b) => `${((100 * a) / b).toFixed(0)}%`
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`)

// ---------- case builders ----------
const cases = []
function add(c) {
  const files = c.files ?? []
  for (const f of files) if (!existsSync(abs(f))) return // corpus file missing
  cases.push({
    layer: 'ops',
    group: c.tool,
    timeout: 2 * MIN,
    params: {},
    ...c,
    category: c.category ?? (files[0] ? files[0].split('/')[0] : 'none'),
    quick: !!c.quick,
  })
}

// Fills the first text field on each part's pages of a merged file and reads
// the values back, so the merged fields still work, not only exist.
async function fillPartsBack(bytes, parts) {
  const fields = await withPdfjs(bytes, async (doc) => (await doc.getFieldObjects()) ?? {})
  const fillable = (o, [from, to]) => o.type === 'text' && o.editable !== false && !o.readOnly && !(o.charLimit > 0 && o.charLimit < 8) && o.page >= from && o.page < to
  const picks = parts.map((part) => Object.entries(fields).find(([, arr]) => (arr ?? []).some((o) => fillable(o, part)))?.[0])
  const missing = picks.findIndex((n) => !n)
  if (missing >= 0) return { ok: false, detail: `no fillable text field on part ${missing + 1}` }
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const form = doc.getForm()
  picks.forEach((n, i) => form.getTextField(n).setText(`FILL${i + 1}`))
  const values = (await formFacts(await doc.save())).values
  return { ok: picks.every((n, i) => values[n] === `FILL${i + 1}`), detail: picks.map((n) => `${n} = ${values[n]}`).join('; ') }
}

// ----- merge -----
function mergeCase(id, files, extra = {}) {
  add({
    id,
    tool: 'merge',
    op: 'merge',
    files,
    ...extra,
    async validate(ctx) {
      const ins = await Promise.all(files.map(inputFacts))
      const want = ins.reduce((n, f) => n + (f.pdfjs.pages ?? 0), 0)
      // page info for every output page: inputs past the probe cap (400) sit further in
      const p = await checkPdf(ctx, 'merged.pdf', { pages: want, maxInfoPages: want })
      if (!p?.pdfjs.ok) return
      // geometry and rotation carried over page by page (input info may be capped)
      let off = 0
      let geoOk = true
      for (const f of ins) {
        ;(f.pdfjs.pageInfo ?? []).forEach((ip, i) => {
          const op = p.pdfjs.pageInfo[off + i]
          if (!op || op.rotate !== ip.rotate || Math.abs(op.w - ip.w) >= 1 || Math.abs(op.h - ip.h) >= 1) geoOk = false
        })
        off += f.pdfjs.pages
      }
      ctx.check('rotation and page size kept', geoOk)
      // first page of every input appears at its offset
      const starts = []
      off = 0
      for (const f of ins) {
        starts.push(off)
        off += f.pdfjs.pages
      }
      const late = starts.filter((s) => s >= (p.pdfjs.texts?.length ?? 0))
      const lateText = late.length ? await textAt(ctx.out('merged.pdf'), late.map((s) => s + 1)) : []
      let textOk = true
      ins.forEach((f, k) => {
        const s = starts[k]
        const outText = s < (p.pdfjs.texts?.length ?? 0) ? p.pdfjs.texts[s] : lateText[late.indexOf(s)]
        const cov = wordCoverage(f.pdfjs.texts?.[0] ?? '', outText ?? '')
        if (cov.ratio != null && cov.ratio < 0.9) textOk = false
      })
      ctx.check('page text in order', textOk)
      if (extra.checkOutlines) {
        const inOl = (await Promise.all(files.map((f) => outlineCount(readRel(f))))).reduce((a, b) => a + b, 0)
        const outOl = await outlineCount(ctx.out('merged.pdf'))
        ctx.check('bookmarks kept', outOl >= inOl, `${outOl} of ${inOl} outline items`, { audit: 12 })
      }
      if (extra.checkFields) {
        const inF = (await Promise.all(files.map((f) => formFacts(readRel(f))))).reduce((a, b) => a + b.count, 0)
        const outF = (await formFacts(ctx.out('merged.pdf'))).count
        ctx.check('form fields kept', outF >= inF, `${outF} of ${inF} fields`, { audit: 12 })
        const names = (await PDFDocument.load(ctx.out('merged.pdf'), { ignoreEncryption: true, updateMetadata: false })).getForm().getFields().map((f) => f.getName())
        const dup = names.filter((n, i) => names.indexOf(n) !== i)
        ctx.check('field names unique', dup.length === 0, dup.slice(0, 3).join(', '), { audit: 12 })
        const parts = []
        let at = 0
        for (const f of ins) parts.push([at, (at += f.pdfjs.pages)])
        const fill = await fillPartsBack(ctx.out('merged.pdf'), parts)
        ctx.check('fields work: one per part filled and read back', fill.ok, fill.detail, { audit: 12 })
      }
      ctx.metric(`${want} pages, ${kb(ctx.out('merged.pdf').length)}`)
    },
  })
}
mergeCase('merge-reports', ['reports/pdfjs-tracemonkey.pdf', 'reports/arxiv-1810.04805-bert.pdf', 'reports/arxiv-1512.03385-resnet.pdf'], { quick: true })
mergeCase('merge-rotated', ['quirks/pdfjs-rotation.pdf', 'quirks/pdfjs-hello_world_rotated.pdf', 'derived/rot90-cropbox-bert.pdf'], { quick: true })
mergeCase('merge-outlines', ['quirks/pdfjs-nested_outline.pdf', 'reports/us-budget-2024.pdf'], { checkOutlines: true, quick: true })
mergeCase('merge-forms', ['forms/irs-fw9.pdf', 'forms/irs-f1040sa.pdf'], { checkFields: true })
mergeCase('merge-large', ['large/911-commission-report.pdf', 'reports/us-economic-report-president-2024.pdf'], { timeout: 10 * MIN })
mergeCase('merge-owner-only', ['derived/owner-only-tracemonkey.pdf', 'reports/pdfjs-TAMReview.pdf'], { audit: 1, quick: true })
mergeCase('merge-damaged-xref', ['quirks/pdfjs-xref_command_missing.pdf', 'reports/pdfjs-tracemonkey.pdf'], { audit: 7 })
mergeCase('merge-pdf20', ['quirks/pdf20-simple.pdf', 'quirks/pdf20-offset-start.pdf', 'quirks/pdf20-incremental-save.pdf'])

// ----- split / extract / remove / rotate / organize -----
function splitCase(id, rel, extra = {}) {
  add({
    id,
    tool: 'split',
    op: 'split',
    files: [rel],
    ...extra,
    async validate(ctx) {
      const f = await inputFacts(rel)
      const n = f.pdfjs.pages
      const cut = Math.max(1, Math.floor(n / 2))
      const parts = n > 1 ? [cut, n - cut] : [1]
      const ps = []
      for (const [i, want] of parts.entries()) ps.push(await checkPdf(ctx, `part${i + 1}.pdf`, { pages: want }))
      if (ps.every((p) => p?.pdfjs.ok)) {
        const outPages = ps.flatMap((p) => p.pdfjs.pageInfo)
        const geoOk = (f.pdfjs.pageInfo ?? []).every((ip, i) => {
          const op = outPages[i]
          return op && op.rotate === ip.rotate && Math.abs(op.w - ip.w) < 1 && Math.abs(op.h - ip.h) < 1
        })
        ctx.check('rotation and visible size kept', geoOk)
        if (n > 1) {
          const cov = wordCoverage(f.pdfjs.texts?.[cut] ?? '', ps[1].pdfjs.texts?.[0] ?? '')
          ctx.check('part 2 starts at the cut page', cov.ratio == null || cov.ratio > 0.9, `coverage ${cov.ratio?.toFixed(2)}`)
        }
      }
      if (extra.checkOutlines) {
        const inOl = await outlineCount(readRel(rel))
        const outOl = await outlineCount(ctx.out('part1.pdf'))
        ctx.check('bookmarks kept in parts', outOl > 0 || inOl === 0, `${outOl} in part 1, ${inOl} in source`, { soft: true, audit: 12 })
      }
      if (extra.checkFields) {
        const inF = (await formFacts(readRel(rel))).count
        const outF = (await formFacts(ctx.out('part1.pdf'))).count
        ctx.check('form fields kept in parts', outF > 0 || inF === 0, `${outF} in part 1, ${inF} in source`, { soft: true, audit: 12 })
      }
      ctx.metric(`${n} pages -> ${parts.join(' + ')}`)
    },
  })
}
splitCase('split-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { quick: true })
splitCase('split-budget-bookmarks', 'reports/us-budget-2024.pdf', { checkOutlines: true })
splitCase('split-911-large', 'large/911-commission-report.pdf', { timeout: 10 * MIN })
splitCase('split-rot90-cropbox', 'derived/rot90-cropbox-bert.pdf', { quick: true })
splitCase('split-form-f1040', 'forms/irs-f1040.pdf', { checkFields: true })
splitCase('split-crooked-104MB', 'large/crooked-paths-1648-104MB.pdf', { timeout: 10 * MIN })
splitCase('split-bible-956p-62MB', 'large/explorations-bible-lands-956pp-62MB.pdf', { timeout: 10 * MIN })

// ----- page previews on big files (time and heap per row) -----
for (const [id, rel] of [
  ['thumbs-911-585p', 'large/911-commission-report.pdf'],
  ['thumbs-bible-956p-62MB', 'large/explorations-bible-lands-956pp-62MB.pdf'],
]) {
  add({
    id,
    tool: 'thumbs',
    op: 'thumbs',
    files: [rel],
    params: { count: 100 },
    timeout: 10 * MIN,
    async validate(ctx) {
      if (ctx.error) return ctx.check('previews rendered', false, ctx.error)
      ctx.check('first 100 previews rendered', ctx.meta?.count === 100, `${ctx.meta?.count}`)
      ctx.check('first preview not blank', (ctx.meta?.firstInk ?? 0) > 0.0002, `ink ${((ctx.meta?.firstInk ?? 0) * 100).toFixed(2)}%`)
      ctx.metric(`100 previews in ${((ctx.meta?.ms ?? 0) / 1000).toFixed(1)} s`)
    },
  })
}
add({
  id: 'thumbs-cancel-on-remove-956p',
  tool: 'thumbs',
  op: 'thumbsCancel',
  files: ['large/explorations-bible-lands-956pp-62MB.pdf'],
  timeout: 10 * MIN,
  async validate(ctx) {
    if (ctx.error) return ctx.check('ran', false, ctx.error)
    const m = ctx.meta ?? {}
    ctx.check('rendering stops when the file is released', m.error === 'AbortError' && m.done <= 4, `${m.done} rendered, ${m.error ?? 'no error'}`, { audit: 40 })
    ctx.check('stops within 5 s', m.stopMs < 5000, `${m.stopMs} ms`, { audit: 40 })
  },
})

function pagesCase(id, tool, op, rel, params, expectFn, extra = {}) {
  add({
    id,
    tool,
    op,
    files: [rel],
    params,
    ...extra,
    async validate(ctx) {
      const f = await inputFacts(rel)
      const { pages, order, rotate } = expectFn(f.pdfjs.pages, f)
      const name = { extract: 'extracted.pdf', remove: 'removed.pdf', rotate: 'rotated.pdf', organize: 'reversed.pdf' }[op]
      const p = await checkPdf(ctx, name, { pages })
      if (!p?.pdfjs.ok) return
      if (order) {
        const textOk = order.every((src, i) => {
          const cov = wordCoverage(f.pdfjs.texts?.[src - 1] ?? '', p.pdfjs.texts?.[i] ?? '')
          return cov.ratio == null || cov.ratio > 0.9
        })
        ctx.check('right pages in the right order', textOk)
      }
      if (rotate) {
        const got = p.pdfjs.pageInfo.map((x) => x.rotate)
        const want = rotate(f.pdfjs.pageInfo)
        ctx.check('rotation applied', JSON.stringify(got) === JSON.stringify(want), `got ${got.slice(0, 6)}, want ${want.slice(0, 6)}`)
      }
      ctx.metric(`${pages} pages out`)
    },
  })
}
const firstN = (n, k) => Array.from({ length: Math.min(n, k) }, (_, i) => i + 1)
pagesCase('extract-budget-1-3-5', 'extract', 'extract', 'reports/us-budget-2024.pdf', { pages: [1, 3, 5] }, () => ({ pages: 3, order: [1, 3, 5] }), { quick: true })
pagesCase('extract-rotation-2', 'extract', 'extract', 'quirks/pdfjs-rotation.pdf', { pages: [2] }, () => ({ pages: 1, order: [2], rotate: (pi) => [pi[1].rotate] }))
pagesCase('extract-darwin-scan', 'extract', 'extract', 'scanned/darwin-origin-of-species-ia.pdf', { pages: [10, 11, 12] }, () => ({ pages: 3 }), { timeout: 10 * MIN })
pagesCase('remove-tracemonkey-p1', 'remove', 'remove', 'reports/pdfjs-tracemonkey.pdf', { pages: [1] }, (n) => ({ pages: n - 1, order: firstN(n, 60).slice(1) }), { quick: true })
pagesCase('remove-911-first10', 'remove', 'remove', 'large/911-commission-report.pdf', { pages: firstN(585, 10) }, (n) => ({ pages: n - 10 }), { timeout: 10 * MIN })
pagesCase('rotate-rotation-quirk', 'rotate', 'rotate', 'quirks/pdfjs-rotation.pdf', { angle: 90 }, () => ({ pages: 2, rotate: (pi) => pi.map((x) => (x.rotate + 90) % 360) }), { quick: true })
pagesCase('rotate-rot90-cropbox', 'rotate', 'rotate', 'derived/rot90-cropbox-bert.pdf', { angle: 90 }, (n) => ({ pages: n, rotate: (pi) => pi.map((x) => (x.rotate + 90) % 360) }))
pagesCase('rotate-hello-rotated', 'rotate', 'rotate', 'quirks/pdfjs-hello_world_rotated.pdf', { angle: 270 }, (n) => ({ pages: n, rotate: (pi) => pi.map((x) => (x.rotate + 270) % 360) }))
pagesCase('organize-reverse-tracemonkey', 'organize', 'organize', 'reports/pdfjs-tracemonkey.pdf', {}, (n) => ({ pages: n, order: firstN(n, 60).reverse() }), { quick: true })
pagesCase('organize-reverse-fw4', 'organize', 'organize', 'forms/irs-fw4.pdf', {}, (n) => ({ pages: n, order: firstN(n, 60).reverse() }))

// ----- compress -----
function compressCase(id, rel, extra = {}) {
  const op = extra.raster ? 'compressRaster' : 'compressClean'
  add({
    id,
    tool: 'compress',
    op,
    files: [rel],
    timeout: sizeOf(rel) > 20e6 ? 10 * MIN : 3 * MIN,
    ...extra,
    async validate(ctx) {
      const f = await inputFacts(rel)
      const p = await checkPdf(ctx, 'compressed.pdf', { pages: f.pdfjs.pages })
      const before = sizeOf(rel)
      const after = ctx.out('compressed.pdf')?.length ?? 0
      ctx.check('never larger than input', after <= before, `${kb(before)} -> ${kb(after)}`)
      if (p?.pdfjs.ok) {
        const cov = wordCoverage(f.pdfjs.texts?.slice(0, 5).join(' ') ?? '', p.pdfjs.texts?.slice(0, 5).join(' ') ?? '')
        ctx.check('text kept', cov.ratio == null || cov.ratio > 0.95, `coverage ${cov.ratio?.toFixed(2)}`, extra.raster ? { soft: true, audit: 6 } : {})
      }
      if (extra.expectShrink) {
        ctx.check('shrinks a scanned/image-heavy file by 10%+', after < before * 0.9, `saved ${pct(before - after, before)}`, { soft: true, audit: 6 })
      }
      ctx.metric(`${kb(before)} -> ${kb(after)} (${pct(after, before)})${ctx.meta?.note ? `, ${ctx.meta.note}` : ''}`)
    },
  })
}
compressCase('compress-lincoln-scan', 'scanned/lincoln-ellsworth-letter-1861.pdf', { expectShrink: true, quick: true })
compressCase('compress-fips-scan', 'scanned/fips-document-facsimile-transmission.pdf', { expectShrink: true })
compressCase('compress-queen-victoria-scan', 'scanned/queen-victoria-peabody-letter-1866.pdf', { expectShrink: true })
compressCase('compress-darwin-24MB', 'scanned/darwin-origin-of-species-ia.pdf', { expectShrink: true })
compressCase('compress-young-man-57MB', 'large/19th-century-young-man-57MB.pdf', { expectShrink: true })
compressCase('compress-bible-lands-62MB', 'large/explorations-bible-lands-956pp-62MB.pdf', { expectShrink: true })
compressCase('compress-crooked-104MB', 'large/crooked-paths-1648-104MB.pdf', { expectShrink: true })
compressCase('compress-llama2', 'reports/arxiv-2307.09288-llama2.pdf', { quick: true })
compressCase('compress-ipcc', 'reports/ipcc-ar6-synthesis-longer-report.pdf')
compressCase('compress-econ-report', 'reports/us-economic-report-president-2024.pdf')
compressCase('compress-raster-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { raster: true, quick: true })

// ----- repair -----
function repairCase(id, rel, extra = {}) {
  add({
    id,
    tool: 'repair',
    op: 'repair',
    files: [rel],
    allowError: true,
    ...extra,
    async validate(ctx) {
      const f = await inputFacts(rel)
      const openable = f.pdfjs.ok || (f.mupdf.ok && f.mupdf.pages > 0)
      if (ctx.error) {
        const graceful = /^Unrecoverable/.test(ctx.error)
        ctx.check('fails gracefully', graceful && !openable, `${ctx.error}${openable ? ' (but pdf.js/MuPDF open the input)' : ''}`)
        return
      }
      const want = TRUE_PAGES[rel] ?? (f.pdfjs.ok ? f.pdfjs.pages : f.mupdf.ok ? f.mupdf.pages : null)
      const p = await checkPdf(ctx, 'repaired.pdf', { pages: want || undefined })
      if (p?.pdfjs.ok && f.pdfjs.ok) {
        const cov = wordCoverage(allText(f), allText(p))
        ctx.check('text kept', cov.ratio == null || cov.ratio > 0.9, `coverage ${cov.ratio?.toFixed(2)}`)
      }
      if (extra.checkOutlines) {
        const inOl = await outlineCount(readRel(rel))
        const outOl = await outlineCount(ctx.out('repaired.pdf'))
        ctx.check('bookmarks kept', outOl >= inOl, `${outOl} of ${inOl}`, { soft: true, audit: 26 })
      }
      if (extra.checkFields) {
        const inF = (await formFacts(readRel(rel))).count
        const outF = (await formFacts(ctx.out('repaired.pdf'))).count
        ctx.check('form fields kept', outF >= inF, `${outF} of ${inF}`, { soft: true, audit: 26 })
      }
      ctx.metric(`recovered ${ctx.meta?.recovered}, rasterized ${ctx.meta?.rasterized}, lost ${ctx.meta?.lost}`)
    },
  })
}
repairCase('repair-xref-missing', 'quirks/pdfjs-xref_command_missing.pdf', { quick: true })
repairCase('repair-fuzzed-742', 'quirks/pdfjs-poppler-742-0-fuzzed.pdf', { quick: true })
repairCase('repair-fuzzed-395', 'quirks/pdfjs-poppler-395-0-fuzzed.pdf')
repairCase('repair-bug1020226', 'quirks/pdfjs-bug1020226.pdf')
repairCase('repair-pages-tree-refs', 'quirks/pdfjs-Pages-tree-refs.pdf')
repairCase('repair-offset-start', 'quirks/pdf20-offset-start.pdf')
repairCase('repair-budget-bookmarks', 'reports/us-budget-2024.pdf', { checkOutlines: true })
repairCase('repair-fw9-form', 'forms/irs-fw9.pdf', { checkFields: true })

// ----- watermark / page numbers / sign / crop / edit (geometry) -----
const GEOMETRY = [
  ['tracemonkey', 'reports/pdfjs-tracemonkey.pdf', true],
  ['rotation-quirk', 'quirks/pdfjs-rotation.pdf', true],
  ['rot90-cropbox', 'derived/rot90-cropbox-bert.pdf', true],
  ['origin-shift', 'derived/origin-shift-aws-invoice.pdf', false],
  ['issue1155r-origin', 'quirks/pdfjs-issue1155r.pdf', false],
]
for (const [tag, rel, quick] of GEOMETRY) {
  add({
    id: `watermark-${tag}`,
    tool: 'watermark',
    op: 'watermark',
    files: [rel],
    quick,
    async validate(ctx) {
      const f = await inputFacts(rel)
      const p = await checkPdf(ctx, 'watermarked.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      const hits = await findTextPositions(ctx.out('watermarked.pdf'), 'CORPUSMARK')
      const pagesHit = new Set(hits.map((h) => h.page))
      ctx.check('mark on every page', pagesHit.size === f.pdfjs.pages, `${pagesHit.size} of ${f.pdfjs.pages} pages`)
      const off = hits.filter((h) => !(h.fx > 0.05 && h.fx < 0.95 && h.fy > 0.05 && h.fy < 0.95))
      ctx.check('mark inside the visible page', off.length === 0, off.length ? `page ${off[0].page} at (${off[0].fx.toFixed(2)}, ${off[0].fy.toFixed(2)})` : '', { audit: 8 })
      ctx.metric(`${hits.length} marks`)
    },
  })
  add({
    id: `pagenumbers-${tag}`,
    tool: 'pagenumbers',
    op: 'pagenumbers',
    files: [rel],
    quick,
    async validate(ctx) {
      const f = await inputFacts(rel)
      const p = await checkPdf(ctx, 'numbered.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      const bad = []
      let found = 0
      for (let n = 1; n <= Math.min(f.pdfjs.pages, 20); n++) {
        const hits = (await findTextPositions(ctx.out('numbered.pdf'), `Page ${n}`, { pages: [n] })).filter((h) => h.str.trim() === `Page ${n}`)
        if (!hits.length) continue
        found++
        const h = hits[0]
        if (!(h.fy > 0.85 && h.fx > 0.3 && h.fx < 0.6 && h.upright)) bad.push(`p${n} at (${h.fx.toFixed(2)}, ${h.fy.toFixed(2)})${h.upright ? '' : ' sideways'}`)
      }
      const want = Math.min(f.pdfjs.pages, 20)
      ctx.check('number visible on every page', found === want, `${found} of ${want} (pdf.js and MuPDF only see text inside the visible box)`, { audit: 8 })
      ctx.check('number at bottom centre, upright', bad.length === 0, bad.slice(0, 3).join('; '), { audit: 8 })
    },
  })
  add({
    id: `sign-${tag}`,
    tool: 'sign',
    op: 'sign',
    files: [rel],
    quick,
    async validate(ctx) {
      const f = await inputFacts(rel)
      const p = await checkPdf(ctx, 'signed.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      const imgs = await imagePlacements(ctx.out('signed.pdf'), 1)
      const before = await imagePlacements(readRel(rel), 1)
      const sig = imgs[imgs.length - 1]
      ctx.check('signature image drawn', imgs.length > before.length, `${imgs.length} images vs ${before.length}`)
      if (sig) {
        const ok = Math.abs(sig.cx - 0.5) < 0.06 && Math.abs(sig.cy - 0.85) < 0.06 && Math.abs(sig.x1 - sig.x0) > Math.abs(sig.y1 - sig.y0)
        ctx.check('signature where the user clicked (50%, 85%), upright', ok, `centre (${sig.cx.toFixed(2)}, ${sig.cy.toFixed(2)})`, { audit: 8 })
        ctx.metric(`centre (${sig.cx.toFixed(2)}, ${sig.cy.toFixed(2)})`)
      }
    },
  })
  add({
    id: `crop-${tag}`,
    tool: 'crop',
    op: 'crop',
    files: [rel],
    quick,
    async validate(ctx) {
      const f = await inputFacts(rel)
      const p = await checkPdf(ctx, 'cropped.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      // pdf.js clips the CropBox to the MediaBox, so read the raw box
      const o = f.pdfjs.pageInfo[0].view
      const doc = await PDFDocument.load(ctx.out('cropped.pdf'), { ignoreEncryption: true })
      const cb = doc.getPage(0).getCropBox()
      const n = [cb.x, cb.y, cb.x + cb.width, cb.y + cb.height]
      const inside = n[0] >= o[0] - 0.5 && n[1] >= o[1] - 0.5 && n[2] <= o[2] + 0.5 && n[3] <= o[3] + 0.5
      const area = (n[2] - n[0]) * (n[3] - n[1])
      ctx.check('crop lands inside the visible page', inside && area > 100, `CropBox ${n.map((v) => v.toFixed(0))} vs visible ${o.map((v) => v.toFixed(0))}`, { audit: 13 })
      ctx.metric(`CropBox ${n.map((v) => v.toFixed(0))}`)
    },
  })
  add({
    id: `edit-${tag}`,
    tool: 'edit',
    op: 'edit',
    files: [rel],
    quick,
    async validate(ctx) {
      const f = await inputFacts(rel)
      const p = await checkPdf(ctx, 'edited.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      const hits = await findTextPositions(ctx.out('edited.pdf'), 'EDITMARK', { pages: [1] })
      ctx.check('text added and visible', hits.length > 0, hits.length ? '' : 'not inside the visible box', { audit: 8 })
      if (hits[0]) {
        const h = hits[0]
        ctx.check('text near top-left where placed, upright', h.fx < 0.3 && h.fy < 0.25 && h.upright, `at (${h.fx.toFixed(2)}, ${h.fy.toFixed(2)})${h.upright ? '' : ' sideways'}`, { audit: 8 })
      }
    },
  })
}
add({
  id: 'watermark-cyrillic',
  tool: 'watermark',
  op: 'watermark',
  files: ['reports/pdfjs-tracemonkey.pdf'],
  params: { text: 'Конфиденциально' },
  audit: 9,
  async validate(ctx) {
    const p = await checkPdf(ctx, 'watermarked.pdf', { pages: 14 })
    if (p?.pdfjs.ok) ctx.check('non-Latin mark present', allText(p).includes('Конфиденциально'), '', { audit: 9 })
  },
})
add({
  id: 'edit-cjk-text',
  tool: 'edit',
  op: 'editNonLatin',
  files: ['intl/udhr-chinese-simplified.pdf'],
  params: { text: '世界人权 Привет' },
  audit: 9,
  async validate(ctx) {
    const p = await checkPdf(ctx, 'edited.pdf', { pages: 7 })
    if (p?.pdfjs.ok) ctx.check('non-Latin text present', allText(p).includes('Привет'), '', { audit: 9 })
  },
})

// ----- protect / unlock -----
function protectCase(id, rel, password, extra = {}) {
  add({
    id,
    tool: 'protect',
    op: 'protect',
    files: [rel],
    params: { password },
    allowError: !!extra.comma,
    ...extra,
    async validate(ctx) {
      if (extra.comma) {
        if (ctx.error) {
          ctx.check('comma password refused with a clear message', /comma/i.test(ctx.error), ctx.error, { audit: 22 })
          ctx.metric(`refused: ${ctx.error}`)
          return
        }
        const out = ctx.out('protected.pdf')
        const typed = openMupdf(out, password).authOk
        const prefix = openMupdf(out, password.split(',')[0]).authOk
        ctx.check('opens with exactly the typed password', typed === true, `typed=${typed}, text-before-comma=${prefix}`, { audit: 22 })
        return
      }
      const f = await inputFacts(rel)
      const out = ctx.out('protected.pdf')
      if (!out) return ctx.check('output written', false)
      const m = openMupdf(out, password)
      ctx.check('needs a password to open', m.needsPassword)
      ctx.check('typed password opens it', m.authOk === true)
      ctx.check('wrong password refused', openMupdf(out, 'wrong-password').authOk === false)
      const p = await checkPdf(ctx, 'protected.pdf', { pages: f.pdfjs.pages, password })
      if (p?.pdfjs.ok) {
        const cov = wordCoverage(f.pdfjs.texts?.[0] ?? '', p.pdfjs.texts?.[0] ?? '')
        ctx.check('content intact', cov.ratio == null || cov.ratio > 0.95, `coverage ${cov.ratio?.toFixed(2)}`)
      }
      ctx.metric(p?.mupdf?.encryption ?? '')
    },
  })
}
protectCase('protect-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', 'Secret-42', { quick: true })
protectCase('protect-911-large', 'large/911-commission-report.pdf', 'Secret-42', { timeout: 10 * MIN })
protectCase('protect-owner-only-input', 'derived/owner-only-irs-fw9.pdf', 'Secret-42')
protectCase('protect-comma-password', 'reports/pdfjs-TAMReview.pdf', 'Blue,42', { comma: true, quick: true })
protectCase('protect-unicode-password', 'invoices/aws-invoice.pdf', 'pässwört-日本')

function unlockCase(id, rel, password, extra = {}) {
  add({
    id,
    tool: 'unlock',
    op: 'unlock',
    files: [rel],
    params: { password },
    allowError: !!extra.expectError,
    ...extra,
    async validate(ctx) {
      if (extra.expectError) {
        ctx.check('wrong password refused with a clear message', !!ctx.error && /wrong password/i.test(ctx.error), ctx.error ?? 'no error')
        return
      }
      if (ctx.error) return ctx.check('unlocks', false, ctx.error)
      const out = ctx.out('unlocked.pdf')
      const m = openMupdf(out)
      ctx.check('output not encrypted', !m.needsPassword && (m.doc.getMetaData('encryption') ?? 'None') === 'None', m.doc.getMetaData('encryption'))
      // page count from the locked input, opened with its password in MuPDF
      const src = openMupdf(readRel(rel), password)
      const want = src.needsPassword && !src.authOk ? null : src.doc.countPages()
      const p = await checkPdf(ctx, 'unlocked.pdf', { pages: want ?? undefined })
      const f = await inputFacts(rel)
      if (p?.pdfjs.ok && f.pdfjs.ok) {
        const cov = wordCoverage(allText(f), allText(p))
        ctx.check('text intact', cov.ratio == null || cov.ratio > 0.9, `coverage ${cov.ratio?.toFixed(2)}`)
      }
      ctx.metric(`removed: ${(ctx.meta?.removed ?? []).join(', ') || 'none listed'}${ctx.meta?.hadUserPassword ? ', had user password' : ''}`)
    },
  })
}
for (const [rel, pw] of Object.entries(PASSWORDS)) {
  const tag = rel.split('/').pop().replace(/\.pdf$/, '').replace(/^pdfjs-/, '')
  unlockCase(`unlock-${tag}`, rel, pw, { quick: rel.includes('3371') || rel.includes('user-pw') })
}
unlockCase('unlock-empty-protected', 'quirks/pdfjs-empty_protected.pdf', '')
unlockCase('unlock-owner-only-tracemonkey', 'derived/owner-only-tracemonkey.pdf', '', { quick: true })
unlockCase('unlock-owner-only-invoice', 'derived/owner-only-aws-invoice.pdf', '')
unlockCase('unlock-wrong-password', 'quirks/pdfjs-bug1782186.pdf', 'nope', { expectError: true })

// ----- OCR -----
function ocrCase(id, rel, { printed, quick = false, born = false, timeout = 10 * MIN } = {}) {
  add({
    id,
    tool: 'ocr',
    op: 'ocr',
    files: [rel],
    quick,
    timeout,
    async validate(ctx) {
      const f = await inputFacts(rel)
      const p = await checkPdf(ctx, 'ocr.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      const before = allText(f).replace(/\s+/g, ' ').trim()
      const after = allText(p).replace(/\s+/g, ' ').trim()
      const words = (s) => (s.match(/\b[A-Za-z]{4,}\b/g) ?? []).length
      const added = words(after) - words(before)
      const blind = ctx.meta?.totalWords === 0
      ctx.check(printed ? 'searchable text added (20+ words)' : 'some text recognised', printed ? added >= 20 : added >= 1, `+${added} words${blind ? ' (OCR saw nothing: page renders blank, JPX scan)' : ''}`, printed ? (blind ? { audit: 20 } : {}) : { soft: true })
      if (born) ctx.check('skips pages that already have text', added < words(before) * 0.2, `${words(before)} words before, +${added} added`, { soft: true, audit: 11 })
      ctx.check('no network fetches outside the page origin', ctx.external.length === 0, ctx.external.slice(0, 3).join(', '), { soft: true, audit: 10 })
      ctx.metric(`${ctx.meta?.totalWords ?? '?'} words, sample "${(ctx.meta?.sample ?? '').slice(0, 50).replace(/\s+/g, ' ')}"`)
    },
  })
}
ocrCase('ocr-fax-printed', 'scanned/fax-jean-schmidt-doe.pdf', { printed: true, quick: true })
ocrCase('ocr-fips-printed', 'derived/sub-fips-p5-6.pdf', { printed: true })
ocrCase('ocr-darwin-with-text-layer', 'derived/sub-darwin-p10-11.pdf', { printed: true, born: true })
ocrCase('ocr-lincoln-letter', 'derived/sub-lincoln-p3-4.pdf', { printed: false })
ocrCase('ocr-glover-handwritten', 'scanned/letter-to-benjamin-glover.pdf', { printed: false })
ocrCase('ocr-ndl-japanese-scan', 'derived/sub-ndl-konoye-p1.pdf', { printed: false })
ocrCase('ocr-born-digital-invoice', 'invoices/oyo.pdf', { printed: false, born: true })
ocrCase('ocr-intl-korean', 'intl/udhr-korean.pdf', { printed: false, born: true })

// ----- PDF -> Word / Excel / PPT / Markdown -----
// Lines that follow each other in one column should stay adjacent in output.
async function columnContinuity(rel, targetText) {
  return withPdfjs(readRel(rel), async (doc) => {
    const p = await doc.getPage(1)
    const items = (await p.getTextContent()).items.filter((i) => i.str.trim().length > 30)
    const target = targetText.replace(/\s+/g, ' ')
    let pairs = 0
    let kept = 0
    for (let i = 0; i + 1 < items.length; i++) {
      const a = items[i]
      const b = items[i + 1]
      const dy = a.transform[5] - b.transform[5]
      if (Math.abs(a.transform[4] - b.transform[4]) > 4 || dy <= 0 || dy > 20) continue
      const tail = a.str.trim().split(/\s+/).slice(-2).join(' ')
      const head = b.str.trim().split(/\s+/).slice(0, 2).join(' ')
      pairs++
      if (target.includes(`${tail} ${head}`) || target.includes(`${tail}${head}`)) kept++
    }
    return { pairs, kept }
  })
}

function wordCase(id, rel, { layout = 'flow', scanned = false, columns = false, quick = false, timeout } = {}) {
  add({
    id,
    tool: 'pdf2word',
    op: 'pdf2word',
    files: [rel],
    params: { layout },
    quick,
    timeout: timeout ?? (scanned ? 10 * MIN : 3 * MIN),
    async validate(ctx) {
      const out = ctx.out('out.docx')
      if (!out) return ctx.check('docx written', false)
      let t
      try {
        t = await officeText(out, 'docx')
      } catch (err) {
        return ctx.check('docx opens as a zip', false, err.message)
      }
      ctx.check('docx has a document part', t.zip.file('word/document.xml') != null)
      const f = await inputFacts(rel)
      if (scanned) {
        ctx.check('text from OCR fallback', (t.text.match(/[A-Za-z]{4,}/g) ?? []).length >= 10, `${t.text.length} chars`)
      } else {
        const cov = wordCoverage(allText(f), t.text)
        ctx.check('words carried over (85%+)', cov.ratio == null || cov.ratio >= 0.85, `coverage ${cov.ratio?.toFixed(2)} of ${cov.words} words`)
        ctx.metric(`coverage ${cov.ratio?.toFixed(2)}, ${ctx.meta?.tables ?? 0} tables, ${ctx.meta?.images ?? 0} images`)
      }
      if (columns) {
        const c = await columnContinuity(rel, t.text)
        ctx.check('column lines stay in reading order', c.pairs === 0 || c.kept / c.pairs >= 0.7, `${c.kept} of ${c.pairs} line joins kept`, { soft: true, audit: 15 })
      }
    },
  })
}
wordCase('pdf2word-tracemonkey-2col', 'reports/pdfjs-tracemonkey.pdf', { columns: true, quick: true })
wordCase('pdf2word-bert-2col', 'reports/arxiv-1810.04805-bert.pdf', { columns: true })
wordCase('pdf2word-fdic', 'reports/fdic-quarterly-banking-profile-2023q4.pdf', { timeout: 10 * MIN })
wordCase('pdf2word-aws-invoice', 'invoices/aws-invoice.pdf', { quick: true })
wordCase('pdf2word-aws-invoice-exact', 'invoices/aws-invoice.pdf', { layout: 'exact' })
wordCase('pdf2word-flipkart', 'invoices/flipkart-invoice.pdf')
wordCase('pdf2word-arabic', 'intl/udhr-arabic.pdf')
wordCase('pdf2word-chinese', 'intl/udhr-chinese-simplified.pdf')
wordCase('pdf2word-scanned-fax', 'scanned/fax-jean-schmidt-doe.pdf', { scanned: true })
wordCase('pdf2word-911-large', 'large/911-commission-report.pdf', { timeout: 10 * MIN })

function excelCase(id, rel, { quick = false, timeout = 3 * MIN } = {}) {
  add({
    id,
    tool: 'pdf2excel',
    op: 'pdf2excel',
    files: [rel],
    quick,
    timeout,
    async validate(ctx) {
      const out = ctx.out('out.xlsx')
      if (!out) return ctx.check('xlsx written', false)
      let wb
      try {
        wb = XLSX.read(out, { type: 'buffer' })
      } catch (err) {
        return ctx.check('xlsx opens', false, err.message)
      }
      const cells = []
      for (const n of wb.SheetNames) {
        const ws = wb.Sheets[n]
        for (const [k, c] of Object.entries(ws)) if (!k.startsWith('!')) cells.push(c)
      }
      ctx.check('has cells', cells.length > 0, `${cells.length} cells`)
      const f = await inputFacts(rel)
      const cellText = cells.map((c) => String(c.v)).join(' ')
      const cov = wordCoverage(allText(f), cellText)
      ctx.check('words carried over (80%+)', cov.ratio == null || cov.ratio >= 0.8, `coverage ${cov.ratio?.toFixed(2)}`)
      // ids with leading zeros or 16+ digits must stay text
      const risky = [...new Set(allText(f).match(/\b0\d{3,}\b|\b\d{16,}\b/g) ?? [])]
      if (risky.length) {
        const asText = new Set(cells.filter((c) => c.t === 's').flatMap((c) => String(c.v).split(/\s+/)))
        const lost = risky.filter((r) => !asText.has(r))
        ctx.check('leading-zero / long ids kept as text', lost.length === 0, lost.length ? `lost ${lost.slice(0, 3).join(', ')}` : '', { soft: true, audit: 16 })
      }
      ctx.metric(`${wb.SheetNames.length} sheets, ${cells.length} cells, coverage ${cov.ratio?.toFixed(2)}`)
    },
  })
}
excelCase('pdf2excel-aws-invoice', 'invoices/aws-invoice.pdf', { quick: true })
excelCase('pdf2excel-flipkart', 'invoices/flipkart-invoice.pdf')
excelCase('pdf2excel-camelot-bol', 'invoices/camelot-bol.pdf')
excelCase('pdf2excel-saeco', 'invoices/saeco.pdf')
excelCase('pdf2excel-free-fiber', 'invoices/free-fiber.pdf')
excelCase('pdf2excel-fdic', 'reports/fdic-quarterly-banking-profile-2023q4.pdf', { timeout: 10 * MIN })

function pptCase(id, rel, { quick = false } = {}) {
  add({
    id,
    tool: 'pdf2ppt',
    op: 'pdf2ppt',
    files: [rel],
    quick,
    timeout: 5 * MIN,
    async validate(ctx) {
      const out = ctx.out('out.pptx')
      if (!out) return ctx.check('pptx written', false)
      const t = await officeText(out, 'pptx')
      const f = await inputFacts(rel)
      ctx.check('one slide per page', t.slides === f.pdfjs.pages, `${t.slides} slides, ${f.pdfjs.pages} pages`)
      ctx.check('slides carry editable text', t.text.trim().length > 0, `${t.text.trim().length} chars`, { soft: true, audit: 17 })
      const aspects = [...new Set(f.pdfjs.pageInfo.map((p) => (p.w / p.h).toFixed(2)))]
      if (aspects.length > 1) ctx.check('mixed page shapes each fit their slide', false, `${aspects.length} page aspects, one slide size`, { soft: true, audit: 17 })
      ctx.metric(`${t.slides} slides, ${t.media} images, ${kb(out.length)}`)
    },
  })
}
pptCase('pdf2ppt-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { quick: true })
pptCase('pdf2ppt-rotation-mixed', 'quirks/pdfjs-rotation.pdf')
pptCase('pdf2ppt-rot90-cropbox', 'derived/rot90-cropbox-bert.pdf')

function mdCase(id, rel, { quick = false, audit } = {}) {
  add({
    id,
    tool: 'pdf2md',
    op: 'pdf2md',
    files: [rel],
    quick,
    timeout: 3 * MIN,
    async validate(ctx) {
      const out = ctx.out('out.md')
      if (!out) return ctx.check('markdown written', false)
      const md = Buffer.from(out).toString('utf8')
      const f = await inputFacts(rel)
      const cov = wordCoverage(allText(f), md)
      ctx.check('words carried over (85%+)', cov.ratio == null || cov.ratio >= 0.85, `coverage ${cov.ratio?.toFixed(2)} of ${cov.words}`, audit ? { audit } : {})
      ctx.metric(`${md.length} chars, ${ctx.meta?.headings ?? 0} headings, ${ctx.meta?.tables ?? 0} tables`)
    },
  })
}
mdCase('pdf2md-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { quick: true })
mdCase('pdf2md-budget', 'reports/us-budget-2024.pdf')
mdCase('pdf2md-aws-invoice', 'invoices/aws-invoice.pdf')
mdCase('pdf2md-chinese', 'intl/udhr-chinese-simplified.pdf')
mdCase('pdf2md-japanese', 'intl/udhr-japanese.pdf')
mdCase('pdf2md-noembed-sjis', 'intl/pdfjs-noembed-sjis.pdf', { audit: 20 })
mdCase('pdf2md-noembed-eucjp', 'intl/pdfjs-noembed-eucjp.pdf', { audit: 20 })
mdCase('pdf2md-vertical', 'intl/pdfjs-vertical.pdf', { audit: 20 })
mdCase('pdf2md-arabic', 'intl/udhr-arabic.pdf')

// ----- Office -> PDF -----
const OFFICE = existsSync(abs('office')) ? readdirSync(abs('office')).sort() : []
async function officeSourceText(rel) {
  const kind = rel.split('.').pop()
  return (await officeText(readRel(rel), kind)).text
}
for (const name of OFFICE) {
  const rel = `office/${name}`
  const kind = name.split('.').pop()
  const tool = { docx: 'word2pdf', xlsx: 'excel2pdf', pptx: 'ppt2pdf' }[kind]
  if (!tool) continue
  const quick = ['poi-sample.docx', 'poi-SampleSS.xlsx', 'poi-SampleShow.pptx'].includes(name)
  add({
    id: `${tool}-quick-${name}`,
    tool,
    group: 'officeQuick',
    op: 'officeQuick',
    files: [rel],
    params: { kind },
    quick,
    timeout: 5 * MIN,
    async validate(ctx) {
      const p = await checkPdf(ctx, 'out.pdf')
      if (!p?.pdfjs.ok) return
      ctx.check('has pages', p.pdfjs.pages >= 1, `${p.pdfjs.pages}`)
      const cov = wordCoverage(await officeSourceText(rel), allText(p))
      ctx.check('selectable text', (cov.ratio ?? 1) > 0.3, `coverage ${cov.ratio?.toFixed(2)}`, { soft: true, audit: 18 })
      ctx.metric(`${p.pdfjs.pages} pages, ${kb(p.size)}, text coverage ${cov.ratio?.toFixed(2)}`)
    },
  })
  add({
    id: `${tool}-hifi-${name}`,
    tool,
    group: 'officeHifi',
    op: 'officeHifi',
    files: [rel],
    requires: 'office-engine-load',
    quick,
    timeout: 10 * MIN,
    async validate(ctx) {
      const p = await checkPdf(ctx, 'out.pdf')
      if (!p?.pdfjs.ok) return
      const cov = wordCoverage(await officeSourceText(rel), allText(p))
      ctx.check('text carried over (60%+)', (cov.ratio ?? 1) >= 0.6, `coverage ${cov.ratio?.toFixed(2)}`)
      ctx.metric(`${p.pdfjs.pages} pages, ${kb(p.size)}, text coverage ${cov.ratio?.toFixed(2)}`)
    },
  })
}
add({
  id: 'office-engine-load',
  tool: 'word2pdf',
  group: 'officeHifi',
  op: 'officeEngine',
  files: [],
  category: 'office',
  quick: true,
  order: -1,
  timeout: 15 * MIN,
  async validate(ctx) {
    if (!ctx.meta?.loaded) ctx.skip(`LibreOffice engine did not load: ${ctx.meta?.error}`)
    ctx.check('no fetches outside the page origin', ctx.external.length === 0, [...new Set(ctx.external.map((u) => new URL(u).host))].join(', '), { soft: true, audit: 19 })
    ctx.metric('engine loaded')
  },
})

// ----- images -> PDF -----
const IMAGES = existsSync(abs('images')) ? readdirSync(abs('images')).sort() : []
for (const name of IMAGES) {
  const rel = `images/${name}`
  const quick = ['photo-castle-3456x2628.jpg', 'heic-libheif-example.heic', 'tiff-multipage.tiff', 'webp-hopper.webp'].includes(name)
  const multi = /tiff-multipage/.test(name)
  add({
    id: `img2pdf-${name}`,
    tool: 'img2pdf',
    op: 'img2pdf',
    files: [rel],
    quick,
    timeout: 3 * MIN,
    audit: /heic|tiff/.test(name) ? 23 : undefined,
    async validate(ctx) {
      if (ctx.error) return ctx.check('image decoded', false, ctx.error, { audit: 23 })
      const p = await checkPdf(ctx, 'images.pdf')
      if (!p?.pdfjs.ok) return
      if (multi) ctx.check('one page per TIFF frame', p.pdfjs.pages >= 2, `${p.pdfjs.pages} pages`, { audit: 23 })
      const d = ctx.meta?.decoded?.[0]
      const pg = p.pdfjs.pageInfo[0]
      const orient = exifOrientation(readRel(rel))
      if (d && orient && orient >= 5 && orient <= 8) {
        ctx.check('EXIF rotation applied', (pg.w > pg.h) !== (d.w > d.h), `EXIF ${orient}, page ${pg.w.toFixed(0)}x${pg.h.toFixed(0)}`, { audit: 23 })
      }
      ctx.check('fit page is a sane paper size (<= 17 in)', Math.max(pg.w, pg.h) <= 1224, `${(pg.w / 72).toFixed(1)} x ${(pg.h / 72).toFixed(1)} in`, { soft: true, audit: 23 })
      const ratio = p.size / sizeOf(rel)
      ctx.check('output not bloated (<= 3x input)', ratio <= 3, `${ratio.toFixed(1)}x input`, { soft: true, audit: 23 })
      ctx.metric(`${p.pdfjs.pages} page(s), ${(pg.w / 72).toFixed(1)}x${(pg.h / 72).toFixed(1)} in, ${kb(p.size)}${orient ? `, EXIF ${orient}` : ''}`)
    },
    allowError: true,
  })
}
if (IMAGES.length >= 3) {
  const jpgs = IMAGES.filter((n) => n.endsWith('.jpg')).map((n) => `images/${n}`)
  add({
    id: 'img2pdf-three-photos-a4',
    tool: 'img2pdf',
    op: 'img2pdf',
    files: jpgs,
    params: { pageSize: 'a4' },
    timeout: 5 * MIN,
    async validate(ctx) {
      const p = await checkPdf(ctx, 'images.pdf', { pages: jpgs.length })
      if (p?.pdfjs.ok) ctx.check('A4 pages', p.pdfjs.pageInfo.every((x) => Math.abs(x.w - 595.28) < 1), '')
    },
  })
}

// ----- PDF -> image -----
function imgCase(id, rel, pages = [1], { quick = false, audit, timeout } = {}) {
  add({
    id,
    tool: 'pdf2img',
    op: 'pdf2img',
    files: [rel],
    params: { pages },
    quick,
    timeout: timeout ?? (sizeOf(rel) > 20e6 ? 10 * MIN : 2 * MIN),
    async validate(ctx) {
      const f = await inputFacts(rel)
      for (const [i, n] of pages.entries()) {
        const png = ctx.out(`page${n}.png`)
        ctx.check(`page ${n} image written`, !!png)
        const ink = ctx.meta?.ink?.[i] ?? 0
        // truly blank renders measure 0.00%; a page with one short word is ~0.05%
        ctx.check(`page ${n} not blank`, ink > 0.0002, `ink ${(ink * 100).toFixed(2)}%`, audit ? { audit } : {})
        if (png) {
          const w = png.readUInt32BE(16)
          const h = png.readUInt32BE(20)
          // input page info stops at 400 pages
          const pg = f.pdfjs.pageInfo[n - 1] ?? (await probe(readRel(rel), { maxInfoPages: n })).pdfjs.pageInfo[n - 1]
          ctx.check(`page ${n} orientation matches the visible page`, (w > h) === (pg.w > pg.h), `${w}x${h} vs ${pg.w.toFixed(0)}x${pg.h.toFixed(0)}`)
        }
      }
      ctx.metric(`ink ${(ctx.meta?.ink ?? []).map((r) => (r * 100).toFixed(1) + '%').join(', ')}`)
    },
  })
}
imgCase('pdf2img-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', [1, 2], { quick: true })
imgCase('pdf2img-rot90-cropbox', 'derived/rot90-cropbox-bert.pdf', [1], { quick: true })
imgCase('pdf2img-jpx', 'quirks/pdfjs-bug_jpx.pdf', [1], { audit: 20 })
imgCase('pdf2img-jpx-subsampling', 'quirks/pdfjs-jpx_subsampling.pdf', [1], { audit: 20 })
imgCase('pdf2img-jpx-smask', 'quirks/pdfjs-jpx_smaskindata.pdf', [1], { audit: 20 })
imgCase('pdf2img-jbig2-symbol', 'quirks/pdfjs-jbig2_symbol_offset.pdf')
imgCase('pdf2img-jbig2-header', 'quirks/pdfjs-jbig2_file_header.pdf', [1], { audit: 20 })
imgCase('pdf2img-cmyk-jpeg', 'quirks/pdfjs-cmykjpeg.pdf', [1], { audit: 20 })
imgCase('pdf2img-devicen', 'quirks/pdfjs-devicen.pdf')
imgCase('pdf2img-type3', 'quirks/pdfjs-simpletype3font.pdf')
imgCase('pdf2img-noembed-sjis', 'intl/pdfjs-noembed-sjis.pdf', [1], { audit: 20 })
imgCase('pdf2img-vertical-cjk', 'intl/pdfjs-vertical.pdf', [1], { audit: 20 })
imgCase('pdf2img-hindi', 'intl/udhr-hindi.pdf')
// both are JPX scans: blank output points at the missing pdf.js wasm decoder
imgCase('pdf2img-crooked-104MB', 'large/crooked-paths-1648-104MB.pdf', [1, 2, 3], { audit: 20 })
imgCase('pdf2img-bible-62MB', 'large/explorations-bible-lands-956pp-62MB.pdf', [1, 500], { audit: 20 })

// ----- redact -----
function redactCase(id, rel, { quick = false, audit } = {}) {
  add({
    id,
    tool: 'redact',
    op: 'redact',
    files: [rel],
    quick,
    timeout: 5 * MIN,
    async prepare() {
      const term = await pickTerm(rel)
      return term ? { term } : { skip: 'no suitable word on page 1' }
    },
    async validate(ctx) {
      const term = ctx.params.term
      const f = await inputFacts(rel)
      if (!ctx.meta?.boxes) return ctx.check(`finds "${term}"`, false, 'search found 0 matches')
      const p = await checkPdf(ctx, 'redacted.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      const outText = allText(p).toLowerCase()
      ctx.check(`"${term}" gone from extracted text`, !outText.includes(term.toLowerCase()), '')
      leakCheck(ctx, 'redacted.pdf', [term])
      const covered = ctx.meta?.covered ?? []
      const weak = covered.filter((c) => c < 0.6)
      ctx.check('black box covers the word on screen', covered.length > 0 && weak.length === 0, `coverage ${covered.map((c) => c.toFixed(2)).join(', ')}`, { audit: audit ?? 2 })
      const hit = new Set(ctx.meta.pagesHit)
      await sameUntouched(ctx, rel, p, ctx.meta.pagesHit)
      const ratio = p.size / sizeOf(rel)
      ctx.check('size stays reasonable (<= 3x)', ratio <= 3, `${ratio.toFixed(1)}x input`, { soft: true, audit: 25 })
      ctx.metric(`${ctx.meta.boxes} boxes on ${hit.size} page(s), ${ratio.toFixed(1)}x size`)
    },
  })
}
redactCase('redact-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { quick: true })
redactCase('redact-aws-invoice', 'invoices/aws-invoice.pdf')
redactCase('redact-rot90-cropbox', 'derived/rot90-cropbox-bert.pdf', { quick: true, audit: 2 })
redactCase('redact-rotation-quirk', 'quirks/pdfjs-rotation.pdf', { audit: 2 })
redactCase('redact-origin-shift', 'derived/origin-shift-aws-invoice.pdf', { audit: 2 })
// The only real split in the corpus: pdf.js stores "Acrobat Rea" + "der" as two
// items. Search only: pdf-lib cannot load these forms for the redact step.
for (const rel of ['forms/uk-IPPH353.pdf', 'forms/uk-AFPS-Form-17.pdf']) {
  add({
    id: `redact-find-split-${rel.split('/').pop().replace(/\.pdf$/, '')}`,
    tool: 'redact',
    op: 'redactFind',
    files: [rel],
    params: { term: 'Acrobat Reader' },
    async validate(ctx) {
      const text = (await inputFacts(rel)).pdfjs.texts[0].replace(/\s+/g, '')
      ctx.check('phrase is in the page text', text.includes('AcrobatReader'))
      ctx.check('search finds a phrase split across text items', (ctx.meta?.boxes ?? 0) > 0, `${ctx.meta?.boxes ?? 0} matches`, { audit: 3 })
    },
  })
}

// ----- forms -----
const FORMS = ['irs-f1040.pdf', 'irs-fw9.pdf', 'irs-fw4.pdf', 'irs-f1040sa.pdf', 'uscis-i-9.pdf', 'uscis-i-485.pdf', 'uk-IPPH353.pdf', 'uk-AFPS-Form-17.pdf', 'xfa-imm1344e-filled.pdf', 'xfa-issue14315.pdf', 'annotation-button-widget.pdf', 'annotation-choice-widget.pdf', 'annotation-text-widget.pdf']
for (const name of FORMS) {
  const rel = `forms/${name}`
  add({
    id: `forms-list-${name.replace(/\.pdf$/, '')}`,
    tool: 'forms',
    op: 'formsList',
    files: [rel],
    quick: ['irs-fw9.pdf', 'xfa-issue14315.pdf'].includes(name),
    timeout: 3 * MIN,
    async validate(ctx) {
      const facts = await formFacts(readRel(rel))
      const got = ctx.meta?.names ?? 0
      if (facts.isPureXfa) {
        ctx.check('XFA form fields listed', got > 0, `pure XFA: app lists ${got} fields`, { audit: 21 })
      } else {
        ctx.check('lists the fields pdf.js sees (90%+)', got >= facts.count * 0.9, `${got} of ${facts.count}`)
      }
      ctx.check('field scan under 10 s', (ctx.meta?.ms ?? 0) < 10_000, `${ctx.meta?.ms} ms`, { soft: true, audit: 21 })
      ctx.metric(`${got} fields (${ctx.meta?.widgets} widgets) in ${ctx.meta?.ms} ms, pdf.js ${facts.count}${facts.hasXfa ? ', has XFA' : ''}`)
    },
  })
}
function fillCase(id, rel, { flatten = false, quick = false, audit, dynamicXfa = false } = {}) {
  add({
    id,
    tool: 'forms',
    op: 'formsFill',
    files: [rel],
    params: { flatten },
    quick,
    audit,
    timeout: 3 * MIN,
    async validate(ctx) {
      const f = await inputFacts(rel)
      const p = await checkPdf(ctx, 'filled.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      const values = ctx.meta?.values ?? {}
      const names = Object.keys(values)
      // dynamic XFA: the fields only exist in Adobe Reader; the Forms tool says so and offers no fill
      if (dynamicXfa) {
        ctx.check('dynamic XFA: no fillable fields offered', names.length === 0, `${names.length}`, audit ? { audit } : {})
        return
      }
      ctx.check('found text fields to fill', names.length > 0, `${names.length}`, audit ? { audit } : {})
      const facts = await formFacts(ctx.out('filled.pdf'))
      if (flatten) {
        ctx.check('values baked into page text', names.every((n) => allText(p).includes(values[n])), '')
        ctx.check('no fields left after flatten', facts.count === 0, `${facts.count} left`)
      } else {
        const wrong = names.filter((n) => facts.values[n] !== values[n])
        ctx.check('values stored in the fields', wrong.length === 0, wrong.length ? `${wrong[0]} = ${facts.values[wrong[0]]}` : '')
      }
      const src = await formFacts(readRel(rel))
      if (src.hasXfa) ctx.check('stale XFA removed after fill', !facts.hasXfa, 'XFA still present: Acrobat shows old values', { soft: true, audit: 21 })
      if (src.hasXfa) xfaLeftCheck(ctx, 'filled.pdf')
      ctx.metric(`${ctx.meta?.filled} filled${flatten ? ', flattened' : ''}`)
    },
  })
}
fillCase('forms-fill-f1040', 'forms/irs-f1040.pdf', { quick: true })
fillCase('forms-fill-fw9', 'forms/irs-fw9.pdf')
fillCase('forms-fill-i9', 'forms/uscis-i-9.pdf')
fillCase('forms-fill-xfa-imm1344e', 'forms/xfa-imm1344e-filled.pdf', { audit: 21, dynamicXfa: true })
fillCase('forms-fill-flatten-fw4', 'forms/irs-fw4.pdf', { flatten: true, quick: true })
fillCase('forms-fill-flatten-ipph353', 'forms/uk-IPPH353.pdf', { flatten: true })
fillCase('forms-fill-flatten-text-widget', 'forms/annotation-text-widget.pdf', { flatten: true })
add({
  id: 'forms-flatten-i485',
  tool: 'forms',
  op: 'formsFlatten',
  files: ['forms/uscis-i-485.pdf'],
  timeout: 5 * MIN,
  async validate(ctx) {
    const p = await checkPdf(ctx, 'flattened.pdf', { pages: 24 })
    if (!p?.pdfjs.ok) return
    const facts = await formFacts(ctx.out('flattened.pdf'))
    ctx.check('no fields left', facts.count === 0, `${facts.count} left`)
    xfaLeftCheck(ctx, 'flattened.pdf')
    ctx.metric(`${ctx.meta?.flattened} fields flattened`)
  },
})

// ----- compare -----
function compareCase(id, a, b, expectFn, extra = {}) {
  add({
    id,
    tool: 'compare',
    op: 'compare',
    files: [a, b],
    timeout: 5 * MIN,
    allowError: true,
    ...extra,
    async validate(ctx) {
      if (ctx.error) return ctx.check('compare runs', false, ctx.error, extra.audit ? { audit: extra.audit } : {})
      expectFn(ctx, ctx.meta)
      ctx.metric(`+${ctx.meta.added} -${ctx.meta.removed}, changed pages ${ctx.meta.changedPages.slice(0, 8).join(',') || 'none'}`)
    },
  })
}
compareCase('compare-same-file', 'derived/compare-tracemonkey-base.pdf', 'derived/compare-tracemonkey-base.pdf', (ctx, m) => ctx.check('identical', m.identical === true), { quick: true })
compareCase('compare-with-annotations', 'reports/pdfjs-tracemonkey.pdf', 'quirks/pdfjs-tracemonkey_with_annotations.pdf', (ctx, m) => ctx.check('same text = identical', m.identical === true, `+${m.added} -${m.removed}`))
compareCase(
  'compare-inserted-page',
  'derived/compare-tracemonkey-base.pdf',
  'derived/compare-tracemonkey-inserted.pdf',
  (ctx, m) => ctx.check('only the inserted page differs', m.changedPages.length <= 2 && m.changedPages.includes(3), `changed pages ${m.changedPages.join(',')}`, { audit: 27 }),
  { quick: true, audit: 27 },
)
compareCase('compare-911-self', 'large/911-commission-report.pdf', 'large/911-commission-report.pdf', (ctx, m) => ctx.check('identical', m.identical === true), { timeout: 10 * MIN, audit: 27 })
compareCase('compare-dense-econ-self', 'reports/us-economic-report-president-2024.pdf', 'reports/us-economic-report-president-2024.pdf', (ctx, m) => ctx.check('identical', m.identical === true), { timeout: 10 * MIN, audit: 27 })

// ----- HTML -> PDF -----
add({
  id: 'html2pdf-tracemonkey-text',
  tool: 'html2pdf',
  op: 'html2pdf',
  files: ['reports/pdfjs-tracemonkey.pdf'],
  category: 'reports',
  quick: true,
  async validate(ctx) {
    const p = await checkPdf(ctx, 'html.pdf')
    if (!p?.pdfjs.ok) return
    ctx.check('has pages', p.pdfjs.pages >= 1)
    ctx.check('head <style> applied', (ctx.meta?.redPixels ?? 0) > 50, `${ctx.meta?.redPixels} red pixels`, { soft: true, audit: 28 })
    const cov = wordCoverage(ctx.meta?.sourceText ?? '', allText(p))
    ctx.check('selectable text', (cov.ratio ?? 0) > 0.5, `coverage ${cov.ratio?.toFixed(2)}`, { soft: true, audit: 28 })
    ctx.metric(`${p.pdfjs.pages} pages, ${kb(p.size)}`)
  },
})

// ----- health self-test -----
add({
  id: 'health-selftest',
  tool: 'health',
  op: 'health',
  files: [],
  category: 'none',
  quick: true,
  timeout: 5 * MIN,
  async validate(ctx) {
    const failed = ctx.meta?.failed ?? []
    ctx.check('all self-test checks pass', failed.length === 0, failed.slice(0, 2).join(' | '))
    ctx.check('self-test covers real-world fixtures', false, 'synthetic pdf-lib fixtures only', { soft: true, audit: 42 })
    ctx.metric(`${ctx.meta?.total} checks, ${failed.length} failed`)
  },
})

// ----- UI intake: every corpus PDF through the real file input -----
export function intakeFiles() {
  const out = []
  for (const cat of ['forms', 'scanned', 'reports', 'large', 'intl', 'quirks', 'invoices', 'derived']) {
    if (!existsSync(abs(cat))) continue
    for (const f of readdirSync(abs(cat)).sort()) if (f.endsWith('.pdf')) out.push(`${cat}/${f}`)
  }
  return out
}

export async function intakeExpectation(rel) {
  const f = await inputFacts(rel)
  const raw = readRel(rel)
  const noPw = PASSWORDS[rel] ? await probe(raw) : f
  const pages = (n) => TRUE_PAGES[rel] ?? n
  if (noPw.pdfjs.ok) return { kind: 'accept', pages: pages(noPw.pdfjs.pages), encrypted: (noPw.mupdf.encryption ?? 'None') !== 'None' }
  if (/Password/.test(noPw.pdfjs.error ?? '') || noPw.mupdf.needsPassword) return { kind: 'password' }
  if (noPw.mupdf.ok && noPw.mupdf.pages > 0) return { kind: 'accept', pages: pages(noPw.mupdf.pages), damaged: true }
  return { kind: 'reject' }
}

// ----- UI flows (real buttons, real download) -----
export const FLOWS = [
  // shell: true = tool runs in the new shell (Run, then Download on the result screen)
  { id: 'flow-merge', tool: 'merge', route: 'merge', files: ['reports/pdfjs-tracemonkey.pdf', 'reports/arxiv-1810.04805-bert.pdf'], shell: true, quick: true },
  { id: 'flow-compress', tool: 'compress', route: 'compress', files: ['reports/us-budget-2024.pdf'], shell: true, quick: true },
  // split ranges 1-3 and 4-14 in the shell's Range rows
  {
    id: 'flow-split',
    tool: 'split',
    route: 'split',
    files: ['reports/pdfjs-tracemonkey.pdf'],
    shell: true,
    quick: true,
    async prepare(page) {
      await page.fill('[data-testid=split-to] >> nth=0', '3')
      await page.click('[data-testid=split-add-range]')
      await page.fill('[data-testid=split-from] >> nth=1', '4')
    },
  },
]

export async function validateFlow(flow, ctx) {
  const out = ctx.out(ctx.downloadName)
  if (!out) return ctx.check('download received', false, ctx.status ?? 'no download')
  if (flow.id === 'flow-merge') {
    const p = await checkPdf(ctx, ctx.downloadName, { pages: 14 + 16 })
    if (p?.pdfjs.ok) {
      const bert = await inputFacts('reports/arxiv-1810.04805-bert.pdf')
      const cov = wordCoverage(bert.pdfjs.texts[0], p.pdfjs.texts[14])
      ctx.check('second file starts at page 15', (cov.ratio ?? 0) > 0.9, `coverage ${cov.ratio?.toFixed(2)}`)
    }
  } else if (flow.id === 'flow-compress') {
    const before = sizeOf(flow.files[0])
    await checkPdf(ctx, ctx.downloadName, { pages: 184 })
    ctx.check('never larger than input', out.length <= before, `${kb(before)} -> ${kb(out.length)}`)
  } else if (flow.id === 'flow-split') {
    const zip = await JSZip.loadAsync(out)
    const names = Object.keys(zip.files).filter((n) => n.endsWith('.pdf')).sort()
    ctx.check('zip holds 2 PDFs', names.length === 2, names.join(', '))
    const counts = []
    for (const n of names) {
      const p = await probe(await zip.file(n).async('uint8array'))
      counts.push(p.pdfjs.pages)
    }
    ctx.check('parts have 3 and 11 pages', JSON.stringify(counts.sort((a, b) => a - b)) === '[3,11]', counts.join(', '))
  }
  ctx.metric(`${ctx.timing ?? ''}: ${ctx.status ?? ''}`)
}

// ----- U1 dev C: page frame (rotation, CropBox, origin, mixed sizes) and fonts -----
// Text items as seen on the visible page: fractions from the top-left, the
// angle as seen (degrees, counter-clockwise) and the item centre.
async function seenItems(bytes, pages = null) {
  return withPdfjs(bytes, async (doc) => {
    const out = []
    const list = pages ?? Array.from({ length: Math.min(doc.numPages, 40) }, (_, i) => i + 1)
    for (const n of list) {
      const p = await doc.getPage(n)
      const vp = p.getViewport({ scale: 1 })
      for (const it of (await p.getTextContent()).items) {
        if (!it.str?.trim()) continue
        const t = [
          vp.transform[0] * it.transform[0] + vp.transform[2] * it.transform[1],
          vp.transform[1] * it.transform[0] + vp.transform[3] * it.transform[1],
          vp.transform[0] * it.transform[2] + vp.transform[2] * it.transform[3],
          vp.transform[1] * it.transform[2] + vp.transform[3] * it.transform[3],
          vp.transform[0] * it.transform[4] + vp.transform[2] * it.transform[5] + vp.transform[4],
          vp.transform[1] * it.transform[4] + vp.transform[3] * it.transform[5] + vp.transform[5],
        ]
        const a = Math.atan2(-t[1], t[0])
        const size = Math.hypot(t[2], t[3])
        // centre: half the advance along the baseline, a third of the size up
        const cx = t[4] + Math.cos(a) * (it.width / 2) - Math.sin(a) * size * 0.35
        const cy = t[5] - Math.sin(a) * (it.width / 2) - Math.cos(a) * size * 0.35
        const ex = (t[4] + Math.cos(a) * it.width) / vp.width
        const ey = (t[5] - Math.sin(a) * it.width) / vp.height
        out.push({ page: n, str: it.str, fx: t[4] / vp.width, fy: t[5] / vp.height, ex, ey, cx: cx / vp.width, cy: cy / vp.height, angle: (a * 180) / Math.PI, W: vp.width, H: vp.height })
      }
      p.cleanup()
    }
    return out
  })
}
const near = (a, b, tol) => Math.abs(a - b) <= tol
const angleNear = (a, b, tol = 2) => Math.abs((((a - b) % 360) + 540) % 360 - 180) <= tol
const squash = (s) => s.replace(/\s+/g, '')
// Extracted text matches the typed text. Runs of Arabic/Hebrew letters may
// come back in visual order; digits and Latin must read in logical order.
const RTL_LETTERS = /^(?:(?!\p{N})[\p{Script=Arabic}\p{Script=Hebrew}\p{M}])+$/u
function textBack(all, typed) {
  const a = squash(all)
  const t = squash(typed)
  if (a.includes(t)) return 'logical order'
  if (RTL_LETTERS.test(t) && a.includes([...t].reverse().join(''))) return 'visual order'
  return null
}
// MuPDF text of the first pages (U+FFFD where a glyph has no character).
function mupdfText(bytes, maxPages = 20) {
  const { doc } = openMupdf(bytes)
  try {
    const out = []
    for (let i = 0; i < Math.min(doc.countPages(), maxPages); i++) out.push(doc.loadPage(i).toStructuredText().asText())
    return out.join('\n')
  } finally {
    doc.destroy?.()
  }
}

const GEO_C = [
  ['rot90-cropbox', 'derived/rot90-cropbox-bert.pdf'],
  ['hello-rot90', 'quirks/pdfjs-hello_world_rotated.pdf'],
  ['rotation-quirk', 'quirks/pdfjs-rotation.pdf'],
  ['issue1155r-crop', 'quirks/pdfjs-issue1155r.pdf'],
  ['origin-shift', 'derived/origin-shift-aws-invoice.pdf'],
  ['xfa-origin', 'forms/xfa-imm1344e-filled.pdf'],
  ['c-rot180-origin', 'derived/c-rot180-origin.pdf'],
  ['c-rot270-cropbox', 'derived/c-rot270-cropbox.pdf'],
  ['c-mixed', 'derived/c-mixed.pdf'],
  ['fax-mixed', 'scanned/fax-jean-schmidt-doe.pdf'],
  ['budget-mixed-rot', 'reports/us-budget-2024.pdf'],
]
for (const [tag, rel] of GEO_C) {
  const big = tag === 'budget-mixed-rot'
  for (const rotate of big ? [45] : [0, 45, 90, -30]) {
    add({
      id: `c-watermark-${tag}-${rotate}`,
      tool: 'watermark',
      op: 'watermark',
      files: [rel],
      params: { text: 'CORPUSMARK', rotate, position: 'middle-center' },
      timeout: big ? 6 * MIN : 2 * MIN,
      async validate(ctx) {
        const f = await inputFacts(rel)
        const p = await checkPdf(ctx, 'watermarked.pdf', { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const hits = (await seenItems(ctx.out('watermarked.pdf'))).filter((h) => h.str.includes('CORPUSMARK'))
        const want = Math.min(f.pdfjs.pages, 40)
        ctx.check('mark on every page', new Set(hits.map((h) => h.page)).size === want, `${new Set(hits.map((h) => h.page)).size} of ${want}`)
        const bad = hits.filter((h) => !(near(h.cx, 0.5, 0.04) && near(h.cy, 0.5, 0.04) && angleNear(h.angle, rotate)))
        ctx.check(`centred on the visible page at ${rotate} deg as seen`, bad.length === 0, bad.slice(0, 3).map((h) => `p${h.page} centre (${h.cx.toFixed(2)}, ${h.cy.toFixed(2)}) ${h.angle.toFixed(0)} deg`).join('; '), { audit: 8 })
        ctx.metric(`${hits.length} marks`)
      },
    })
  }
  for (const position of big ? ['bottom-center'] : ['bottom-center', 'top-right']) {
    add({
      id: `c-pagenumbers-${tag}-${position}`,
      tool: 'pagenumbers',
      op: 'pagenumbers',
      files: [rel],
      params: { position },
      timeout: big ? 6 * MIN : 2 * MIN,
      async validate(ctx) {
        const f = await inputFacts(rel)
        const p = await checkPdf(ctx, 'numbered.pdf', { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const items = await seenItems(ctx.out('numbered.pdf'))
        const want = Math.min(f.pdfjs.pages, 40)
        const bad = []
        let found = 0
        for (let n = 1; n <= want; n++) {
          const h = items.find((x) => x.page === n && x.str.trim() === `Page ${n}`)
          if (!h) continue
          found++
          const ok = position === 'bottom-center' ? near(h.cx, 0.5, 0.03) && h.cy > 0.9 : h.cx > 0.8 && h.cy < 0.1
          if (!ok || !angleNear(h.angle, 0)) bad.push(`p${n} (${h.cx.toFixed(2)}, ${h.cy.toFixed(2)}) ${h.angle.toFixed(0)} deg`)
        }
        ctx.check('number visible on every page', found === want, `${found} of ${want}`, { audit: 8 })
        ctx.check(`number ${position} of the visible page, upright`, bad.length === 0, bad.slice(0, 3).join('; '), { audit: 8 })
      },
    })
  }
  if (big) continue
  // crop as fractions of each page's visible frame; check per page through pdf.js
  add({
    id: `c-crop-${tag}`,
    tool: 'crop',
    op: 'crop',
    files: [rel],
    async validate(ctx) {
      const f = await inputFacts(rel)
      const p = await checkPdf(ctx, 'cropped.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      const bad = []
      let moved = 0
      let checkedText = 0
      const offs = []
      const before = await seenItems(readRel(rel))
      const after = await seenItems(ctx.out('cropped.pdf'))
      p.pdfjs.pageInfo.forEach((pi, i) => {
        const o = f.pdfjs.pageInfo[i]
        if (!near(pi.w, o.w * 0.5, 1.5) || !near(pi.h, o.h * 0.5, 1.5)) bad.push(`p${i + 1} ${pi.w.toFixed(0)}x${pi.h.toFixed(0)} vs ${o.w.toFixed(0)}x${o.h.toFixed(0)}`)
        // a word well inside the crop must move to ((f - 0.1) / 0.5)
        const within = (x, y) => x > 0.13 && x < 0.57 && y > 0.13 && y < 0.57
        // whole word inside: pdf.js drops glyphs outside the crop
        const onPage = before.filter((b) => b.page === i + 1)
        const unique = (b) => onPage.filter((x) => x.str === b.str).length === 1
        const inside = onPage.filter((b) => within(b.fx, b.fy) && within(b.ex, b.ey) && b.str.trim().length > 3 && unique(b))
        for (const b of inside.slice(0, 3)) {
          // same word, nearest to where it should be (words repeat on a page)
          const ex = (b.fx - 0.1) / 0.5
          const ey = (b.fy - 0.1) / 0.5
          const a = after
            .filter((x) => x.page === i + 1 && x.str === b.str)
            .sort((m, n) => Math.hypot(m.fx - ex, m.fy - ey) - Math.hypot(n.fx - ex, n.fy - ey))[0]
          checkedText++
          if (!a || !near(a.fx, ex, 0.01) || !near(a.fy, ey, 0.01)) {
            moved++
            if (offs.length < 3) offs.push(`p${i + 1} "${b.str}" want (${ex.toFixed(3)}, ${ey.toFixed(3)}) got ${a ? `(${a.fx.toFixed(3)}, ${a.fy.toFixed(3)})` : 'none'}`)
          }
        }
      })
      // the raw CropBox must equal the box pdf.js maps from the view fractions
      const want = await withPdfjs(readRel(rel), async (doc) => {
        const boxes = []
        for (let n = 1; n <= doc.numPages; n++) {
          const vp = (await doc.getPage(n)).getViewport({ scale: 1 })
          const [ax, ay] = vp.convertToPdfPoint(vp.width * 0.1, vp.height * 0.1)
          const [bx, by] = vp.convertToPdfPoint(vp.width * 0.6, vp.height * 0.6)
          boxes.push([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)])
        }
        return boxes
      })
      const outDoc = await PDFDocument.load(ctx.out('cropped.pdf'), { ignoreEncryption: true })
      const wrong = []
      outDoc.getPages().forEach((pg, i) => {
        const c = pg.getCropBox()
        const got = [c.x, c.y, c.x + c.width, c.y + c.height]
        if (got.some((v, k) => !near(v, want[i][k], 0.5))) wrong.push(`p${i + 1} ${got.map((v) => v.toFixed(0))} vs ${want[i].map((v) => v.toFixed(0))}`)
      })
      ctx.check('CropBox matches the box pdf.js maps from the view', wrong.length === 0, wrong.slice(0, 2).join('; '), { audit: 13 })
      ctx.check('each page cropped to half its visible size', bad.length === 0, bad.slice(0, 3).join('; '), { audit: 13 })
      // soft: pdf.js shifts items on lines it clips at the crop edge
      ctx.check('content inside the box stays where it was seen', moved === 0, `${moved} of ${checkedText} words off ${offs.join('; ')}`, { soft: true, audit: 13 })
      ctx.metric(`${checkedText} words checked`)
    },
  })
  add({
    id: `c-sign-${tag}`,
    tool: 'sign',
    op: 'sign',
    files: [rel],
    params: { pageNum: tag === 'c-mixed' ? 3 : 1 },
    async validate(ctx) {
      const n = tag === 'c-mixed' ? 3 : 1
      const f = await inputFacts(rel)
      const p = await checkPdf(ctx, 'signed.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      const imgs = await imagePlacements(ctx.out('signed.pdf'), n)
      const before = await imagePlacements(readRel(rel), n)
      const sig = imgs[imgs.length - 1]
      ctx.check('signature image drawn', imgs.length > before.length)
      if (sig) {
        const ok = near(sig.cx, 0.5, 0.02) && near(sig.cy, 0.85, 0.02) && Math.abs(sig.x1 - sig.x0) > Math.abs(sig.y1 - sig.y0)
        ctx.check(`signature at (50%, 85%) of page ${n}, upright`, ok, `centre (${sig.cx.toFixed(2)}, ${sig.cy.toFixed(2)})`, { audit: 8 })
      }
    },
  })
  for (const pageIndex of tag === 'c-mixed' ? [0, 1, 2, 3, 4] : [0]) {
    add({
      id: `c-edit-${tag}-p${pageIndex + 1}`,
      tool: 'edit',
      op: 'editAll',
      files: [rel],
      params: { pageIndex },
      async validate(ctx) {
        const f = await inputFacts(rel)
        const p = await checkPdf(ctx, 'edited.pdf', { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const n = pageIndex + 1
        const h = (await seenItems(ctx.out('edited.pdf'), [n])).find((x) => x.str.includes('EDITMARK'))
        ctx.check('text added', !!h)
        if (h) {
          // placed with its top-left at (50, 50) view points, size 14: baseline at y 64
          const ok = near(h.fx * h.W, 50, 1.5) && near(h.fy * h.H, 64, 1.5) && angleNear(h.angle, 0)
          ctx.check('text exactly where placed, upright', ok, `origin (${(h.fx * h.W).toFixed(1)}, ${(h.fy * h.H).toFixed(1)}) ${h.angle.toFixed(0)} deg`, { audit: 8 })
          const imgs = await imagePlacements(ctx.out('edited.pdf'), n)
          const img = imgs[imgs.length - 1]
          // image box (150, 120) 100 x 30 -> centre (200, 135)
          const okImg = img && near(img.cx * h.W, 200, 1.5) && near(img.cy * h.H, 135, 1.5) && Math.abs(img.x1 - img.x0) * h.W > Math.abs(img.y1 - img.y0) * h.H
          ctx.check('image exactly where placed, upright', !!okImg, img ? `centre (${(img.cx * h.W).toFixed(1)}, ${(img.cy * h.H).toFixed(1)})` : 'no image', { audit: 8 })
        }
      },
    })
  }
}

// Tiled watermark on rotated and mixed pages: runs and covers every page.
for (const [tag, rel] of [['c-mixed', 'derived/c-mixed.pdf'], ['rot90-cropbox', 'derived/rot90-cropbox-bert.pdf']]) {
  add({
    id: `c-watermark-tile-${tag}`,
    tool: 'watermark',
    op: 'watermark',
    files: [rel],
    params: { text: 'CORPUSMARK', rotate: 45, position: 'tile', fontSize: 24 },
    async validate(ctx) {
      const f = await inputFacts(rel)
      const p = await checkPdf(ctx, 'watermarked.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      const hits = (await seenItems(ctx.out('watermarked.pdf'))).filter((h) => h.str.includes('CORPUSMARK'))
      const per = new Map()
      for (const h of hits) per.set(h.page, (per.get(h.page) ?? 0) + 1)
      const want = Math.min(f.pdfjs.pages, 40)
      const thin = [...Array(want).keys()].map((i) => i + 1).filter((n) => (per.get(n) ?? 0) < 4)
      ctx.check('at least 4 tiles visible on every page', thin.length === 0, thin.slice(0, 3).map((n) => `p${n}: ${per.get(n) ?? 0}`).join('; '), { audit: 8 })
      ctx.check('tiles at 45 deg as seen', hits.every((h) => angleNear(h.angle, 45)), '', { audit: 8 })
    },
  })
}

// Forms: add fields on a sideways IRS form and an offset-origin form, check
// the widget lands where it was drawn (pdf.js annotation rect, view space).
for (const [tag, rel] of [
  ['fw9-rot90', 'derived/c-fw9-rot90.pdf'],
  ['xfa-origin', 'forms/xfa-imm1344e-filled.pdf'],
  ['fw9', 'forms/irs-fw9.pdf'],
]) {
  add({
    id: `c-forms-add-${tag}`,
    tool: 'forms',
    op: 'formsAdd',
    files: [rel],
    params: { text: '张伟 Müller' },
    async validate(ctx) {
      const out = ctx.out('added.pdf')
      const p = await checkPdf(ctx, 'added.pdf', {})
      if (!p?.pdfjs.ok) return
      const res = await withPdfjs(out, async (doc) => {
        const pg = await doc.getPage(1)
        const vp = pg.getViewport({ scale: 1 })
        const annots = await pg.getAnnotations()
        const a = annots.find((x) => x.fieldName === 'c_text')
        if (!a) return null
        const [x0, y0, x1, y1] = vp.convertToViewportRectangle(a.rect)
        return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), value: a.fieldValue }
      })
      ctx.check('text field created', !!res)
      if (res) {
        ctx.check('field box where drawn (60, 80) 200x22', near(res.x, 60, 2) && near(res.y, 80, 2) && near(res.w, 200, 2) && near(res.h, 22, 2), `(${res.x.toFixed(0)}, ${res.y.toFixed(0)}) ${res.w.toFixed(0)}x${res.h.toFixed(0)}`, { audit: 8 })
        ctx.check('non-Latin value kept', res.value === '张伟 Müller', String(res.value))
      }
    },
  })
}

// Non-Latin text: save without error and extract back with pdf.js.
const SCRIPTS = [
  ['zh', '机密文件 草稿'],
  ['ja', '社外秘 ドラフト'],
  ['ko', '대외비 초안'],
  ['ar', 'سري للغاية'],
  ['ar-mixed', 'مسودة 2024 DRAFT'],
  ['ar-decimal', 'السعر 3.14 دولار'],
  ['ar-digits', 'صفحة ١٠'],
  ['he-date', 'תאריך 12/05/2024'],
  ['zh-hant', '機密 體 文件'],
  ['ko-hanja', '대한민국 大韓民國'],
  ['bn', 'বাংলা ১২৩'],
  ['ta', 'தமிழ்'],
  ['th', 'ทดสอบ'],
  ['symbols', '✓ ★ →'],
  ['he', 'טיוטה סודית'],
  ['hi', 'गोपनीय मसौदा'],
  ['ru', 'Конфиденциально'],
  ['mixed', 'DRAFT 草稿 Черновик'],
]
const NL_REPORT = 'reports/pdfjs-tracemonkey.pdf'
for (const [lang, text] of SCRIPTS) {
  const parts = text.split(' ').filter(Boolean)
  const backCheck = (ctx, all, bytes) => {
    const how = parts.map((w) => [w, textBack(all, w)])
    const miss = how.filter(([, h]) => !h).map(([w]) => w)
    ctx.check('text extracts back (pdf.js)', miss.length === 0, miss.length ? `missing: ${miss.join(', ')}` : how.map(([, h]) => h).join(', '), { audit: 9 })
    const boxes = (mupdfText(bytes).match(/\uFFFD/g) ?? []).length
    ctx.check('no missing glyphs (no U+FFFD in MuPDF text)', boxes === 0, boxes ? `${boxes} U+FFFD` : '', { audit: 9 })
  }
  add({
    id: `c-watermark-text-${lang}`,
    tool: 'watermark',
    op: 'watermark',
    files: [NL_REPORT],
    params: { text, rotate: 45 },
    async validate(ctx) {
      const p = await checkPdf(ctx, 'watermarked.pdf', { pages: 14 })
      if (p?.pdfjs.ok) backCheck(ctx, allText(p), ctx.out('watermarked.pdf'))
    },
  })
  add({
    id: `c-pagenumbers-text-${lang}`,
    tool: 'pagenumbers',
    op: 'pagenumbers',
    files: [NL_REPORT],
    params: { template: `${text} {n}` },
    async validate(ctx) {
      const p = await checkPdf(ctx, 'numbered.pdf', { pages: 14 })
      if (p?.pdfjs.ok) backCheck(ctx, allText(p), ctx.out('numbered.pdf'))
    },
  })
  add({
    id: `c-edit-text-${lang}`,
    tool: 'edit',
    op: 'editNonLatin',
    files: [NL_REPORT],
    params: { text },
    async validate(ctx) {
      const p = await checkPdf(ctx, 'edited.pdf', { pages: 14 })
      if (p?.pdfjs.ok) backCheck(ctx, allText(p), ctx.out('edited.pdf'))
    },
  })
}
for (const [lang, text] of [['zh', '张伟 测试'], ['ar', 'محمد علي'], ['hi', 'राम कुमार'], ['ja', 'やまだ たろう'], ['ru', 'Иван Петров']]) {
  for (const flatten of [false, true]) {
    add({
      id: `c-forms-fill-${lang}${flatten ? '-flat' : ''}`,
      tool: 'forms',
      op: 'formsFillText',
      files: ['forms/irs-fw9.pdf'],
      params: { text, flatten },
      async validate(ctx) {
        const p = await checkPdf(ctx, 'filled.pdf', { pages: 6 })
        if (!p?.pdfjs.ok) return
        ctx.check('fields filled', (ctx.meta?.filled ?? 0) > 0, `${ctx.meta?.filled}`)
        if (flatten) {
          const parts = text.split(' ')
          const miss = parts.filter((w) => !textBack(allText(p), w))
          ctx.check('flattened value extracts back (pdf.js)', miss.length === 0, miss.join(', '), { audit: 9 })
        } else {
          const ff = await formFacts(ctx.out('filled.pdf'))
          const names = Object.keys(ctx.meta?.values ?? {})
          ctx.check('value stored in the field', names.length > 0 && names.every((n) => ff.values[n] === text), names.map((n) => String(ff.values[n])).join(' | '), { audit: 9 })
        }
      },
    })
  }
}

// ----- U4-I: HiFi engine pin, fonts, robustness, HTML with real text -----
// Fonts in a PDF as { name, embedded } (subset prefix dropped), via MuPDF.
function pdfFonts(bytes) {
  const { doc } = openMupdf(bytes)
  const pdf = doc.asPDF()
  const out = new Map()
  for (let i = 1; i < pdf.countObjects(); i++) {
    let o
    try {
      o = pdf.newIndirect(i, 0).resolve()
    } catch {
      continue
    }
    if (!o?.isDictionary() || o.get('Type').toString() !== '/Font' || o.get('Subtype').toString() === '/Type0') continue
    const name = o.get('BaseFont').toString().replace(/^\/([A-Z]{6}\+)?/, '')
    const fd = o.get('FontDescriptor')
    const embedded = !!fd?.isDictionary() && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => fd.get(k).isStream())
    out.set(name, embedded)
  }
  return [...out].map(([name, embedded]) => ({ name, embedded }))
}
const ENGINE_FILE_RE = /^https:\/\/cdn\.zetaoffice\.net\/zetaoffice_latest\/soffice\.(js|wasm|data|data\.js\.metadata)$/
const FIXTURE_HTML = 'scripts/corpus-test/fixtures/i-styled-report.html'

add({
  id: 'i-engine-pinned-warm-boot',
  tool: 'word2pdf',
  group: 'officeHifi',
  op: 'iEngine',
  files: [],
  category: 'office',
  requires: 'office-engine-load',
  quick: true,
  timeout: 10 * MIN,
  async validate(ctx) {
    const m = ctx.meta ?? {}
    ctx.check('pinned build reported', /efaf0670b4d0/.test(m.warm?.build ?? ''), m.warm?.build)
    ctx.check('cold boot downloaded', m.cold?.fromCache === false, `fromCache ${m.cold?.fromCache}`)
    ctx.check('warm boot served from Cache Storage', m.warm?.fromCache === true, `fromCache ${m.warm?.fromCache}`)
    // cold + warm boot together: each pinned engine file fetched once, nothing else
    const odd = ctx.external.filter((u) => !ENGINE_FILE_RE.test(u))
    ctx.check('only the 4 pinned engine files leave the page (GET)', odd.length === 0 && ctx.external.length === 4, odd.join(', ') || `${ctx.external.length} requests`, { audit: 19 })
    ctx.check('cold boot progress in steps up to 100%', m.coldLastPercent === 100 && m.coldProgressEvents > 10, `${m.coldProgressEvents} events, last ${m.coldLastPercent}`)
    ctx.check('warm boot progress reaches 100%', m.lastPercent === 100, `${m.progressEvents} events, last ${m.lastPercent}`)
    ctx.check('one engine frame', m.frames === 1 && m.oneBoot, `frames ${m.frames}, one boot ${m.oneBoot}`)
    ctx.check('extra fonts loaded into the engine', (m.warm?.fonts ?? []).filter((f) => f.endsWith('.ttf')).length === 3, (m.warm?.fonts ?? []).join(', '))
    ctx.metric(`cold boot ${m.cold?.bootMs} ms (download ${m.cold?.downloadMs} ms, cache ${m.cold?.fromCache}), warm boot ${m.warm?.bootMs} ms`)
  },
})
// A conversion on a running engine makes no request at all.
add({
  id: 'i-hifi-convert-no-network',
  tool: 'word2pdf',
  group: 'officeHifi',
  op: 'iOfficeHifi',
  files: ['office/poi-sample.docx'],
  requires: 'office-engine-load',
  quick: true,
  timeout: 10 * MIN,
  async validate(ctx) {
    ctx.check('converting sends nothing off the page', ctx.external.length === 0, ctx.external.join(', '))
    const p = await checkPdf(ctx, 'out.pdf')
    if (p?.pdfjs.ok) ctx.check('selectable text', allText(p).trim().length > 0)
  },
})
for (const name of OFFICE) {
  const rel = `office/${name}`
  const kind = name.split('.').pop()
  const tool = { docx: 'word2pdf', xlsx: 'excel2pdf', pptx: 'ppt2pdf' }[kind]
  if (!tool) continue
  add({
    id: `i-hifi-${name}`,
    tool,
    group: 'officeHifi',
    op: 'iOfficeHifi',
    files: [rel],
    requires: 'office-engine-load',
    timeout: 10 * MIN,
    async validate(ctx) {
      const p = await checkPdf(ctx, 'out.pdf')
      if (!p?.pdfjs.ok) return
      const text = allText(p).replace(/\s+/g, ' ').trim()
      const src = (await officeSourceText(rel)).replace(/\s+/g, ' ').trim()
      ctx.check('selectable text (pdf.js)', text.length > 0 || src.length === 0, `${text.length} chars, source ${src.length}`, { audit: 18 })
      ctx.check('page count sane', p.pdfjs.pages >= 1 && p.pdfjs.pages <= 40, `${p.pdfjs.pages}`)
      const fonts = pdfFonts(ctx.out('out.pdf'))
      const bare = fonts.filter((f) => !f.embedded).map((f) => f.name)
      ctx.check('all fonts embedded', bare.length === 0, bare.join(', '))
      const names = fonts.map((f) => f.name)
      // DejaVu is the engine's last-resort face: it only shows when a family had no match
      ctx.check('no last-resort DejaVu substitution', !names.some((n) => /DejaVu/.test(n)), names.join(', '), { soft: true, audit: 19 })
      ctx.metric(`${p.pdfjs.pages} pages, ${ctx.meta?.convertMs} ms, fonts ${names.join(' ') || 'none'}`)
    },
  })
}
const FONT_RUNS = [
  ['Calibri', 'Quarterly revenue grew 12%'],
  ['Calibri Light', 'Quarterly revenue grew 12%'],
  ['Cambria', 'Quarterly revenue grew 12%'],
  ['Aptos', 'Quarterly revenue grew 12%'],
  ['SimSun', '机密文件草稿'],
  ['MS Gothic', '社外秘ドラフト'],
  ['Malgun Gothic', '대외비 초안'],
  ['Mangal', 'गोपनीय मसौदा'],
]
add({
  id: 'i-font-probe-docx',
  tool: 'word2pdf',
  group: 'officeHifi',
  op: 'iFontProbe',
  files: [],
  category: 'office',
  requires: 'office-engine-load',
  params: { runs: FONT_RUNS },
  timeout: 10 * MIN,
  async validate(ctx) {
    const p = await checkPdf(ctx, 'out.pdf', { pages: 1 })
    if (!p?.pdfjs.ok) return
    const all = allText(p)
    // CJK came out as empty boxes before the shipped Noto fonts
    for (const [font, text] of FONT_RUNS.slice(4, 7)) {
      const miss = text.split(' ').filter((w) => !textBack(all, w))
      ctx.check(`${font} text extracts back (pdf.js)`, miss.length === 0, miss.join(', '), { audit: 19 })
    }
    // font used per line, from MuPDF structured text
    const { doc } = openMupdf(ctx.out('out.pdf'))
    const lines = JSON.parse(doc.loadPage(0).toStructuredText().asJSON()).blocks.flatMap((b) => b.lines ?? [])
    const fontOf = (label) => lines.find((l) => l.text.startsWith(`${label}:`))?.font?.name ?? 'missing'
    const used = Object.fromEntries(FONT_RUNS.map(([f]) => [f, fontOf(f)]))
    ctx.check('Calibri -> Carlito', /Carlito/.test(used.Calibri), used.Calibri, { audit: 19 })
    ctx.check('Calibri Light -> Carlito (same widths)', /Carlito/.test(used['Calibri Light']), used['Calibri Light'], { audit: 19 })
    ctx.check('Cambria -> Caladea', /Caladea/.test(used.Cambria), used.Cambria, { audit: 19 })
    const mu = lines.map((l) => l.text).join('\n')
    ctx.check('Devanagari text extracts back (MuPDF)', mu.includes(FONT_RUNS[7][1]), mu.split('\n').pop())
    // LibreOffice writes no usable ToUnicode for Indic conjuncts: pdf.js reads junk there
    ctx.check('Devanagari text extracts back (pdf.js)', textBack(all, 'मसौदा'), '', { soft: true })
    const names = pdfFonts(ctx.out('out.pdf')).map((f) => f.name)
    ctx.metric(`per line: ${Object.entries(used).map(([k, v]) => `${k}=${v}`).join(', ')}; embedded: ${names.join(', ')}`)
  },
})
add({
  id: 'i-html2pdf-hifi-styled-report',
  tool: 'html2pdf',
  group: 'officeHifi',
  op: 'iHtml',
  files: [],
  category: 'office',
  requires: 'office-engine-load',
  quick: true,
  params: { src: `/${FIXTURE_HTML}`, hifi: true },
  timeout: 10 * MIN,
  async validate(ctx) {
    const m = ctx.meta ?? {}
    ctx.check('ran in the engine', m.engine?.[0] === 'hifi', JSON.stringify(m.engine))
    ctx.check('no remote fetches (stylesheet, @import, images)', ctx.external.length === 0, ctx.external.join(', '), { audit: 28 })
    const p = await checkPdf(ctx, 'html.pdf')
    if (!p?.pdfjs.ok) return
    const all = allText(p)
    const cov = wordCoverage(m.sourceText.replace('script ran', ''), all)
    ctx.check('selectable text (90%+ of the source words)', (cov.ratio ?? 0) >= 0.9, `coverage ${cov.ratio?.toFixed(2)}`, { audit: 28 })
    ctx.check('table cells kept', ['182,450', 'EUR 3.77', 'Central'].every((w) => all.includes(w)), '', { audit: 28 })
    ctx.check('script not run', !all.includes('script ran'))
    ctx.check('head <style> applied (red h1, blue table header)', m.red > 200 && m.blue > 200, `red ${m.red}, blue ${m.blue}`, { audit: 28 })
    ctx.check('A4 pages', p.pdfjs.pages >= 1 && p.pdfjs.pages <= 2 && Math.abs(p.pdfjs.pageInfo[0].w - 595.28) < 1, `${p.pdfjs.pages} pages, ${p.pdfjs.pageInfo[0].w} wide`)
    ctx.metric(`${p.pdfjs.pages} page(s), ${kb(p.size)}, ${m.ms} ms, coverage ${cov.ratio?.toFixed(2)}`)
  },
})
add({
  id: 'i-html2pdf-quick-styled-report',
  tool: 'html2pdf',
  op: 'iHtml',
  files: [],
  category: 'office',
  quick: true,
  params: { src: `/${FIXTURE_HTML}`, hifi: false },
  async validate(ctx) {
    const m = ctx.meta ?? {}
    ctx.check('no remote fetches (stylesheet, @import, images)', ctx.external.length === 0, ctx.external.join(', '), { audit: 28 })
    const p = await checkPdf(ctx, 'html.pdf')
    if (!p?.pdfjs.ok) return
    ctx.check('head <style> applied (red h1, blue table header)', m.red > 200 && m.blue > 200, `red ${m.red}, blue ${m.blue}`, { audit: 28 })
    ctx.metric(`${p.pdfjs.pages} page(s), ${kb(p.size)}, ${m.ms} ms`)
  },
})
// Long page: about 30 A4 pages, taller than one canvas can hold at scale 2.
const LONG_HTML = `<!doctype html><html><head><style>h2{color:#1f3a93} td{border:1px solid #999}</style></head><body>${Array.from(
  { length: 60 },
  (_, i) => `<h2>Section ${i + 1}</h2><p>${'Line items for this section follow, with totals carried to the summary table at the end of the report. '.repeat(4)}</p><table>${Array.from({ length: 8 }, (_, r) => `<tr><td>Item ${i + 1}.${r + 1}</td><td>${(i * 37 + r * 11) % 997}</td></tr>`).join('')}</table>`,
).join('')}</body></html>`
for (const hifi of [true, false]) {
  add({
    id: `i-html2pdf-${hifi ? 'hifi' : 'quick'}-long-page`,
    tool: 'html2pdf',
    group: hifi ? 'officeHifi' : 'html2pdf',
    op: 'iHtml',
    files: [],
    category: 'office',
    requires: hifi ? 'office-engine-load' : undefined,
    params: { html: LONG_HTML, hifi },
    timeout: 10 * MIN,
    async validate(ctx) {
      const p = await checkPdf(ctx, 'html.pdf')
      if (!p?.pdfjs.ok) return
      ctx.check('many pages, no canvas failure', p.pdfjs.pages >= 10, `${p.pdfjs.pages} pages`)
      if (hifi) {
        const all = allText(p)
        ctx.check('last section present as text', all.includes('Section 60') && all.includes('Item 60.8'), '', { audit: 28 })
      }
      ctx.metric(`${p.pdfjs.pages} pages, ${kb(p.size)}, ${ctx.meta?.ms} ms`)
    },
  })
}
add({
  id: 'i-engine-hang-restart',
  tool: 'word2pdf',
  group: 'officeHifi',
  op: 'iHang',
  files: ['office/poi-sample.docx'],
  requires: 'office-engine-load',
  order: 50, // kills the engine: run last in the group
  timeout: 10 * MIN,
  async validate(ctx) {
    const m = ctx.meta ?? {}
    ctx.check('hang reported with a clear message', /stopped responding.*restarted/.test(m.error ?? ''), m.error)
    ctx.check('engine killed on hang', m.loadedAfter === false && m.framesAfter === 0, `loaded ${m.loadedAfter}, frames ${m.framesAfter}`)
    ctx.check('next job reboots, still one engine', m.framesEnd === 1, `frames ${m.framesEnd}`)
    const p = await checkPdf(ctx, 'out.pdf')
    if (p?.pdfjs.ok) ctx.check('converts after restart', allText(p).trim().length > 0)
    ctx.metric(`reboot + convert ${m.rebootMs} ms`)
  },
})
// ----- U4 Dev H: conversion fidelity (columns, tables, RTL, typed cells, editable slides) -----
const hNorm = (s) => s.normalize('NFKC').replace(/\s+/g, ' ')

// Word coverage that also accepts a source fragment found inside a joined
// output word: pdf.js splits "repre- sentation" and "B idirectional", the
// converters join them back.
function hCoverage(sourceText, targetText) {
  const base = wordCoverage(sourceText, targetText)
  if (base.ratio == null || base.cjk) return base
  const norm = (s) => s.normalize('NFKC').toLowerCase()
  const words = [...new Set(norm(sourceText).match(/[\p{L}]{4,}/gu) ?? [])]
  const t = norm(targetText)
  const tset = new Set(t.match(/[\p{L}]{4,}/gu) ?? [])
  const glued = t.replace(/[^\p{L}]+/gu, '')
  const found = words.filter((w) => tset.has(w) || glued.includes(w)).length
  return { ratio: found / words.length, words: words.length, found }
}

// Consecutive long lines of one column (same x, next baseline) must stay
// joined in the output; a line-end hyphen may be joined away.
async function hColumnJoins(rel, text, pages = [1, 2, 3]) {
  const target = hNorm(text)
  return withPdfjs(readRel(rel), async (doc) => {
    let pairs = 0
    let kept = 0
    const misses = []
    for (const n of pages) {
      if (n > doc.numPages) continue
      const all = (await (await doc.getPage(n)).getTextContent()).items.filter((i) => i.str.trim())
      const items = all.filter((i) => i.str.trim().length > 30)
      // a must end its line in the column, b must start the next one
      const near = (it, from, to) => all.some((o) => o !== it && Math.abs(o.transform[5] - it.transform[5]) < 1.5 && o.transform[4] > from && o.transform[4] < to)
      for (let i = 0; i + 1 < items.length; i++) {
        const a = items[i]
        const b = items[i + 1]
        const dy = a.transform[5] - b.transform[5]
        if (Math.abs(a.transform[4] - b.transform[4]) > 4 || dy <= 0 || dy > 20) continue
        if (near(a, a.transform[4] + a.width - 1, a.transform[4] + a.width + 15) || near(b, b.transform[4] - 15, b.transform[4] - 0.5)) continue
        const between = all.some((o) => o.transform[5] < a.transform[5] - 1.5 && o.transform[5] > b.transform[5] + 1.5 && o.transform[4] < a.transform[4] + a.width && o.transform[4] + o.width > a.transform[4])
        if (between) continue
        const tail = hNorm(a.str).trim().split(' ').slice(-2).join(' ')
        const head = hNorm(b.str).trim().split(' ').slice(0, 2).join(' ')
        // prose lines only (code listings and their "// comment" columns are rows)
        if (!/^[\p{L}\d("“]/u.test(head) || /\/\//.test(a.str)) continue
        const variants = [`${tail} ${head}`, `${tail}${head}`]
        if (/-$/.test(tail)) variants.push(`${tail.slice(0, -1)}${head}`)
        pairs++
        if (variants.some((v) => target.includes(v))) kept++
        else if (misses.length < 2) misses.push(variants[0])
      }
    }
    return { pairs, kept, misses }
  })
}

const hDecode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

// Word tables as rows of cell text.
function hDocxTables(xml) {
  return [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>([\s\S]*?)<\/w:tbl>/g)].map((m) =>
    [...m[1].matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((r) =>
      [...r[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) =>
        hDecode([...c[1].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]).join('')).replace(/\s+/g, ' ').trim(),
      ),
    ),
  )
}

async function hDocx(ctx) {
  const out = ctx.out('out.docx')
  if (!out) {
    ctx.check('docx written', false)
    return null
  }
  const t = await officeText(out, 'docx')
  const xml = await t.zip.file('word/document.xml').async('string')
  return { t, xml }
}

// Two-column papers: per-column reading order, no "com- laboration".
function hWordColumns(id, rel, { quick = false } = {}) {
  add({
    id,
    tool: 'pdf2word',
    op: 'hWord',
    files: [rel],
    quick,
    timeout: 3 * MIN,
    async validate(ctx) {
      const d = await hDocx(ctx)
      if (!d) return
      const c = await hColumnJoins(rel, d.t.text)
      ctx.check('column lines stay in reading order (90%+)', c.pairs > 0 && c.kept / c.pairs >= 0.9, `${c.kept} of ${c.pairs} line joins kept${c.misses.length ? `; missed "${c.misses[0]}"` : ''}`, { audit: 15 })
      const broken = (hNorm(d.t.text).match(/\p{Ll}- \p{Ll}{2,}/gu) ?? []).length
      ctx.check('line-end hyphens joined (<= 5 "com- laboration")', broken <= 5, `${broken} left`, { audit: 15 })
      ctx.check('paragraph alignment carried (justified)', /<w:jc w:val="both"\/>/.test(d.xml), '', { audit: 15 })
      ctx.check('font family carried', /<w:rFonts /.test(d.xml), '', { audit: 15 })
      const f = await inputFacts(rel)
      const cov = hCoverage(allText(f), d.t.text)
      ctx.check('words carried over (85%+)', cov.ratio == null || cov.ratio >= 0.85, `coverage ${cov.ratio?.toFixed(2)}`)
      ctx.metric(`${c.kept}/${c.pairs} joins, ${broken} broken hyphens, ${ctx.meta?.tables ?? 0} tables, ${ctx.meta?.convertMs} ms`)
    },
  })
}
hWordColumns('h-word-tracemonkey-columns', 'reports/pdfjs-tracemonkey.pdf', { quick: true })
hWordColumns('h-word-bert-columns', 'reports/arxiv-1810.04805-bert.pdf')
hWordColumns('h-word-attention-columns', 'reports/arxiv-1706.03762-attention.pdf')
hWordColumns('h-word-resnet-columns', 'reports/arxiv-1512.03385-resnet.pdf')

// Invoices: real Word tables with the right cell text in one row.
function hWordInvoice(id, rel, rows, { quick = false } = {}) {
  add({
    id,
    tool: 'pdf2word',
    op: 'hWord',
    files: [rel],
    quick,
    timeout: 3 * MIN,
    async validate(ctx) {
      const d = await hDocx(ctx)
      if (!d) return
      const tables = hDocxTables(d.xml)
      ctx.check('has Word tables', tables.length > 0, `${tables.length} tables`, { audit: 15 })
      const allRows = tables.flat()
      for (const want of rows) {
        const hit = allRows.some((r) => want.every((w) => r.some((c) => c.includes(w))))
        ctx.check(`row with ${want.join(' + ')}`, hit, hit ? '' : 'not in any table row', { audit: 15 })
      }
      ctx.metric(`${tables.length} tables, ${allRows.length} rows, ${ctx.meta?.convertMs} ms`)
    },
  })
}
hWordInvoice('h-word-aws-tables', 'invoices/aws-invoice.pdf', [['AWS Service Charges', '$4.11'], ['Amazon Glacier', '$2.22']], { quick: true })
hWordInvoice('h-word-saeco-tables', 'invoices/saeco.pdf', [['E103184', 'Onderhoudsset CA6707/10', '49,99'], ['Grondslag', 'BTW bedrag']])
hWordInvoice('h-word-camelot-tables', 'invoices/camelot-bol.pdf', [['BTW', '€ 32,80'], ['Bedrag inclusief BTW', '€ 189,00']])
hWordInvoice('h-word-netpresse-tables', 'invoices/netpresse-invoice.pdf', [['Justificatif PDF', '0,75 €'], ['Total TTC', '56,02 €']])

// Arabic: words of a right-to-left line in logical (reading) order.
add({
  id: 'h-word-arabic-cid-logical',
  tool: 'pdf2word',
  op: 'hWord',
  files: ['intl/pdfjs-ArabicCIDTrueType.pdf'],
  quick: true,
  timeout: 3 * MIN,
  async validate(ctx) {
    const d = await hDocx(ctx)
    if (!d) return
    const rel = 'intl/pdfjs-ArabicCIDTrueType.pdf'
    const expected = await withPdfjs(readRel(rel), async (doc) => {
      const tc = await (await doc.getPage(1)).getTextContent()
      const byY = new Map()
      for (const it of tc.items) {
        if (!/[؀-ۿﭐ-﻿]/.test(it.str)) continue
        const k = Math.round(it.transform[5])
        if (!byY.has(k)) byY.set(k, [])
        byY.get(k).push(it)
      }
      return [...byY.values()].filter((l) => l.length >= 2).map((l) => l.sort((a, b) => b.transform[4] - a.transform[4]).map((i) => i.str.trim()).join(' '))
    })
    const text = hNorm(d.t.text)
    const ok = expected.filter((e) => text.includes(hNorm(e)))
    ctx.check('RTL lines in logical order', expected.length > 0 && ok.length === expected.length, `${ok.length} of ${expected.length} lines`, { audit: 15 })
    ctx.check('paragraphs marked right-to-left', /<w:bidi\/>/.test(d.xml), '', { audit: 15 })
    ctx.metric(`${ok.length}/${expected.length} RTL lines in reading order`)
  },
})
// UDHR Arabic: the producer wrote glyphs in logical order; 3-word runs of
// that stream must come back in the same order.
add({
  id: 'h-word-udhr-arabic-logical',
  tool: 'pdf2word',
  op: 'hWord',
  files: ['intl/udhr-arabic.pdf'],
  timeout: 3 * MIN,
  async validate(ctx) {
    const d = await hDocx(ctx)
    if (!d) return
    const words = await withPdfjs(readRel('intl/udhr-arabic.pdf'), async (doc) => {
      const out = []
      for (let n = 1; n <= Math.min(2, doc.numPages); n++) {
        const tc = await (await doc.getPage(n)).getTextContent()
        // glyphs come one item each in reading order: a gap between two
        // neighbours (either direction) is a word space
        let line = ''
        let y = null
        let prev = null
        for (const it of tc.items) {
          const iy = Math.round(it.transform[5])
          if (y !== null && Math.abs(iy - y) > 3) {
            out.push(line)
            line = ''
            prev = null
          }
          if (prev) {
            const size = Math.hypot(it.transform[2], it.transform[3]) || 10
            const gapRtl = prev.transform[4] - (it.transform[4] + it.width)
            const gapLtr = it.transform[4] - (prev.transform[4] + prev.width)
            if (Math.max(gapRtl, gapLtr) > size * 0.15) line += ' '
          }
          y = iy
          line += it.str
          prev = it
        }
        out.push(line)
      }
      return out
        .filter((l) => /[؀-ۿﭐ-﻿]/.test(l))
        .flatMap((l) => {
          const w = hNorm(l).trim().split(' ')
          const tri = []
          for (let i = 0; i + 2 < w.length; i++) {
            const win = w.slice(i, i + 3)
            // words with unmapped glyphs (U+FFFD) say nothing about order
            if (!win.some((x) => x.includes('�'))) tri.push(win.join(' '))
          }
          return tri
        })
    })
    const text = hNorm(d.t.text)
    const hit = words.filter((w) => text.includes(w)).length
    ctx.check('RTL word order kept (80%+ of 3-word runs)', words.length > 0 && hit / words.length >= 0.8, `${hit} of ${words.length}`, { audit: 15 })
    ctx.metric(`${hit}/${words.length} three-word runs in order`)
  },
})

// FDIC 44 pages: speed, repeating header/footer moved to Word header/footer.
add({
  id: 'h-word-fdic-speed-furniture',
  tool: 'pdf2word',
  op: 'hWord',
  files: ['reports/fdic-quarterly-banking-profile-2023q4.pdf'],
  timeout: 5 * MIN,
  async validate(ctx) {
    const d = await hDocx(ctx)
    if (!d) return
    ctx.check('converted in under 60 s', (ctx.meta?.convertMs ?? Infinity) < 60_000, `${((ctx.meta?.convertMs ?? 0) / 1000).toFixed(1)} s`)
    const names = Object.keys(d.t.zip.files)
    const header = names.find((n) => /^word\/header\d*\.xml$/.test(n))
    const footer = names.find((n) => /^word\/footer\d*\.xml$/.test(n))
    const hx = header ? await d.t.zip.file(header).async('string') : ''
    const fx = footer ? await d.t.zip.file(footer).async('string') : ''
    ctx.check('page header became a Word header', /QUARTERLY/.test(hx), header ?? 'no header part', { audit: 15 })
    ctx.check('page number became a PAGE field', /PAGE/.test(fx), footer ?? 'no footer part', { audit: 15 })
    const repeats = (d.xml.match(/VOLUME 18, NUMBER 1/g) ?? []).length
    ctx.check('header text not repeated in the body', repeats <= 1, `${repeats} copies in body`, { audit: 15 })
    const f = await inputFacts('reports/fdic-quarterly-banking-profile-2023q4.pdf')
    const cov = hCoverage(allText(f), d.t.text)
    ctx.check('words carried over (85%+)', cov.ratio == null || cov.ratio >= 0.85, `coverage ${cov.ratio?.toFixed(2)}`)
    ctx.metric(`${((ctx.meta?.convertMs ?? 0) / 1000).toFixed(1)} s, ${ctx.meta?.tables} tables, coverage ${cov.ratio?.toFixed(2)}`)
  },
})

// Excel: typed numbers / dates, IDs as text, speed, page join.
function hXlsx(ctx) {
  const out = ctx.out('out.xlsx')
  if (!out) {
    ctx.check('xlsx written', false)
    return null
  }
  const wb = XLSX.read(out, { type: 'buffer', cellNF: true })
  const cells = []
  for (const n of wb.SheetNames) for (const [k, c] of Object.entries(wb.Sheets[n])) if (!k.startsWith('!')) cells.push(c)
  return { wb, cells }
}
const NUMERIC_TEXT = /^[-−(]?\s*[$€£]?\s*\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d+)?\s*%?\)?$/

function hExcelCase(id, rel, { quick = false, expect = [], joinPages = false, speed = false, timeout = 3 * MIN } = {}) {
  add({
    id,
    tool: 'pdf2excel',
    op: 'hExcel',
    files: [rel],
    params: { joinPages },
    quick,
    timeout,
    async validate(ctx) {
      const x = hXlsx(ctx)
      if (!x) return
      const { wb, cells } = x
      if (speed) ctx.check('converted in under 60 s', (ctx.meta?.convertMs ?? Infinity) < 60_000, `${((ctx.meta?.convertMs ?? 0) / 1000).toFixed(1)} s`)
      if (joinPages) ctx.check('one joined sheet', wb.SheetNames.length === 1, `${wb.SheetNames.length} sheets`, { audit: 16 })
      // number-looking text left as text (not leading-zero ids)
      const numericText = cells.filter((c) => c.t === 's' && NUMERIC_TEXT.test(String(c.v).trim()) && !/^0\d/.test(String(c.v).trim()))
      const numbers = cells.filter((c) => c.t === 'n')
      ctx.check('number cells typed (<2% left as text)', numericText.length <= Math.max(2, (numbers.length + numericText.length) * 0.02), `${numericText.length} as text, e.g. ${numericText.slice(0, 3).map((c) => JSON.stringify(c.v)).join(' ')}`, { audit: 16 })
      // every leading-zero / 16+ digit id in the source is a text cell
      const src = allText(await inputFacts(rel))
      const ids = [...new Set(src.match(/(?<![\d.,])(?:0\d{3,}|\d{16,})(?![\d.,]\d)/g) ?? [])]
      const asText = cells.filter((c) => c.t === 's').map((c) => String(c.v)).join(' ')
      const lost = ids.filter((id) => !asText.includes(id))
      ctx.check('leading-zero / long ids kept as text', lost.length === 0, lost.length ? `lost ${lost.slice(0, 3).join(', ')}` : `${ids.length} ids`, { audit: 16 })
      for (const e of expect) {
        const hit = cells.find((c) => c.t === 'n' && Math.abs(c.v - e.v) < 1e-6 && (!e.z || e.z.test(c.z ?? '')))
        ctx.check(`typed ${e.label}`, !!hit, hit ? `${hit.v} as ${hit.z}` : 'not found as a typed number', { audit: 16 })
      }
      const f = await inputFacts(rel)
      const cov = hCoverage(allText(f), cells.map((c) => String(c.w ?? c.v)).join(' '))
      ctx.check('words carried over (80%+)', cov.ratio == null || cov.ratio >= 0.8, `coverage ${cov.ratio?.toFixed(2)}`)
      ctx.metric(`${wb.SheetNames.length} sheets, ${numbers.length} numbers, ${numericText.length} numeric text, ${((ctx.meta?.convertMs ?? 0) / 1000).toFixed(1)} s`)
    },
  })
}
hExcelCase('h-excel-aws-typed', 'invoices/aws-invoice.pdf', {
  quick: true,
  expect: [
    { label: '$4.11 as currency', v: 4.11, z: /\$/ },
    { label: 'August 3, 2014 as a date', v: 41854, z: /y/ },
  ],
})
hExcelCase('h-excel-camelot-eu-typed', 'invoices/camelot-bol.pdf', {
  expect: [
    { label: '€ 189,00 (decimal comma)', v: 189, z: /€/ },
    { label: '€ 32,80', v: 32.8 },
  ],
})
hExcelCase('h-excel-netpresse-eu-typed', 'invoices/netpresse-invoice.pdf', {
  expect: [{ label: '56,02 € (suffix currency)', v: 56.02, z: /€/ }],
})
hExcelCase('h-excel-saeco-dates', 'invoices/saeco.pdf', {
  expect: [
    { label: '22-9-2022 as a date', v: 44826, z: /y/ },
    { label: '49,99', v: 49.99 },
  ],
})
hExcelCase('h-excel-fdic-speed-typed', 'reports/fdic-quarterly-banking-profile-2023q4.pdf', { speed: true, timeout: 5 * MIN })
hExcelCase('h-excel-fdic-joined', 'reports/fdic-quarterly-banking-profile-2023q4.pdf', { joinPages: true, timeout: 5 * MIN })

// PPT: editable text in every slide, pictures, letterboxed mixed sizes.
function hPptCase(id, rel, { quick = false, media = 0 } = {}) {
  add({
    id,
    tool: 'pdf2ppt',
    op: 'hPpt',
    files: [rel],
    quick,
    timeout: 5 * MIN,
    async validate(ctx) {
      const out = ctx.out('out.pptx')
      if (!out) return ctx.check('pptx written', false)
      const t = await officeText(out, 'pptx')
      const f = await inputFacts(rel)
      ctx.check('one slide per page', t.slides === f.pdfjs.pages, `${t.slides} slides, ${f.pdfjs.pages} pages`)
      const cov = hCoverage(allText(f), t.text)
      ctx.check('slide text extractable (85%+ of words)', (cov.ratio ?? 0) >= 0.85, `coverage ${cov.ratio?.toFixed(2)}`, { audit: 17 })
      let empty = 0
      for (let i = 1; i <= t.slides; i++) {
        const xml = await t.zip.file(`ppt/slides/slide${i}.xml`).async('string')
        if (!/<a:t>[^<]*\S/.test(xml)) empty++
      }
      ctx.check('every slide has editable text', empty === 0, `${empty} slides without text`, { audit: 17 })
      if (media) ctx.check('pictures / art kept', t.media >= media, `${t.media} media`, { audit: 17 })
      // letterbox: every shape inside the slide
      const pres = await t.zip.file('ppt/presentation.xml').async('string')
      const [, cx, cy] = pres.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/) ?? []
      let outside = 0
      for (let i = 1; i <= t.slides; i++) {
        const xml = await t.zip.file(`ppt/slides/slide${i}.xml`).async('string')
        for (const m of xml.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)) {
          if (+m[1] < -20000 || +m[2] < -20000 || +m[1] + +m[3] > +cx * 1.1 || +m[2] + +m[4] > +cy * 1.1) outside++
        }
      }
      ctx.check('shapes fit their slide (per-page letterbox)', outside === 0, `${outside} shapes outside`, { audit: 17 })
      ctx.metric(`${t.slides} slides, ${t.text.trim().length} chars, ${t.media} media, ${kb(out.length)}, ${((ctx.meta?.convertMs ?? 0) / 1000).toFixed(1)} s`)
    },
  })
}
hPptCase('h-ppt-tracemonkey-editable', 'reports/pdfjs-tracemonkey.pdf', { quick: true, media: 1 })
hPptCase('h-ppt-rotation-mixed-editable', 'quirks/pdfjs-rotation.pdf')
hPptCase('h-ppt-aws-editable', 'invoices/aws-invoice.pdf')

// Markdown: columns in order, borderless tables.
function hMdCase(id, rel, { quick = false, columns = false, minTables = 0 } = {}) {
  add({
    id,
    tool: 'pdf2md',
    op: 'hMd',
    files: [rel],
    quick,
    timeout: 3 * MIN,
    async validate(ctx) {
      const out = ctx.out('out.md')
      if (!out) return ctx.check('markdown written', false)
      const md = Buffer.from(out).toString('utf8')
      const plain = md.replace(/\*\*|\*|^#+ |\|/gm, ' ')
      if (columns) {
        const c = await hColumnJoins(rel, plain)
        ctx.check('column lines stay in reading order (90%+)', c.pairs > 0 && c.kept / c.pairs >= 0.9, `${c.kept} of ${c.pairs}${c.misses.length ? `; missed "${c.misses[0]}"` : ''}`, { audit: 15 })
      }
      if (minTables) ctx.check(`at least ${minTables} tables`, (ctx.meta?.tables ?? 0) >= minTables, `${ctx.meta?.tables} tables`)
      const f = await inputFacts(rel)
      const cov = hCoverage(allText(f), md)
      ctx.check('words carried over (85%+)', cov.ratio == null || cov.ratio >= 0.85, `coverage ${cov.ratio?.toFixed(2)}`)
      ctx.metric(`${md.length} chars, ${ctx.meta?.tables} tables, ${ctx.meta?.headings} headings`)
    },
  })
}
hMdCase('h-md-tracemonkey-columns', 'reports/pdfjs-tracemonkey.pdf', { quick: true, columns: true })
hMdCase('h-md-bert-columns', 'reports/arxiv-1810.04805-bert.pdf', { columns: true })
hMdCase('h-md-netpresse-tables', 'invoices/netpresse-invoice.pdf', { minTables: 1 })

// JPEG (DCTDecode) image-only scans: the page image is found, OCR runs.
function hJpegScan(id, rel, { quick = false } = {}) {
  add({
    id,
    tool: 'pdf2word',
    op: 'hWord',
    files: [rel],
    params: { layout: 'exact' },
    quick,
    timeout: 10 * MIN,
    async validate(ctx) {
      const d = await hDocx(ctx)
      if (!d) return
      ctx.check('scanned page went to OCR', (ctx.meta?.ocrTried ?? 0) >= 1, `${ctx.meta?.ocrTried ?? 0} pages tried, ${ctx.meta?.ocrPages ?? 0} with words`)
      const media = Object.keys(d.t.zip.files).filter((n) => /^word\/media\//.test(n)).length
      const words = (d.t.text.match(/\p{L}{3,}/gu) ?? []).length
      ctx.check('page image or recognized text in the docx', media > 0 || words >= 5, `${media} images, ${words} words`)
      ctx.metric(`${ctx.meta?.ocrPages ?? 0} OCR pages, ${media} images, ${words} words, ${((ctx.meta?.convertMs ?? 0) / 1000).toFixed(1)} s`)
    },
  })
}
hJpegScan('h-word-jpeg-scan-ndl', 'derived/sub-ndl-konoye-p1.pdf', { quick: true })
hJpegScan('h-word-jpeg-scan-glover', 'scanned/letter-to-benjamin-glover.pdf')
// ----- G3 (edit canvas tools): true redaction, search, page numbers, sign, forms -----
const noTerm = (text, term) => text.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')

// Text outside the boxes stays text: the hit pages keep their other words.
async function keptOutside(ctx, rel, p, pagesHit, strip) {
  const f = await inputFacts(rel)
  const ratios = []
  for (const n of pagesHit.slice(0, 6)) {
    const before = strip(f.pdfjs.texts[n - 1] ?? '')
    const after = p.pdfjs.texts[n - 1] ?? ''
    const r = wordCoverage(before, after).ratio
    if (r != null) ratios.push(r)
  }
  ctx.check('text outside the boxes stays selectable', ratios.length > 0 && ratios.every((r) => r > 0.85), ratios.map((r) => r.toFixed(2)).join(', '), { audit: 25 })
}

function g3RedactCase(id, rel, { quick = false, method = 'remove' } = {}) {
  add({
    id,
    tool: 'redact',
    op: 'g3RedactRemove',
    files: [rel],
    quick,
    timeout: 5 * MIN,
    async prepare() {
      const term = await pickTerm(rel)
      return term ? { term, method } : { skip: 'no suitable word on page 1' }
    },
    async validate(ctx) {
      const { term } = ctx.params
      const f = await inputFacts(rel)
      if (!ctx.meta?.boxes) return ctx.check(`finds "${term}"`, false, 'search found 0 matches')
      const p = await checkPdf(ctx, 'redacted.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      ctx.check(`"${term}" gone from extracted text`, !allText(p).toLowerCase().includes(term.toLowerCase()), '', { audit: 2 })
      leakCheck(ctx, 'redacted.pdf', [term])
      const covered = ctx.meta.covered ?? []
      ctx.check('black box covers the word on screen', covered.length > 0 && covered.every((c) => c >= 0.6), `coverage ${covered.map((c) => c.toFixed(2)).join(', ')}`, { audit: 2 })
      const hit = new Set(ctx.meta.pagesHit)
      await sameUntouched(ctx, rel, p, ctx.meta.pagesHit)
      const ratio = p.size / sizeOf(rel)
      if (method === 'remove') {
        await keptOutside(ctx, rel, p, ctx.meta.pagesHit, (t) => noTerm(t, term))
        ctx.check('no page fell back to an image', ctx.meta.rasterPages.length === 0, `raster pages ${ctx.meta.rasterPages.join(',')}`, { audit: 25 })
        ctx.check('size stays close to the input (<= 1.5x)', ratio <= 1.5, `${ratio.toFixed(2)}x input`, { audit: 25 })
      } else {
        ctx.check('every hit page became an image', ctx.meta.rasterPages.length === hit.size, `${ctx.meta.rasterPages.length} of ${hit.size}`)
      }
      ctx.metric(`${ctx.meta.boxes} boxes on ${hit.size} page(s), ${ratio.toFixed(2)}x size, ${ctx.meta.ms} ms`)
    },
  })
}
g3RedactCase('g3-redact-remove-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { quick: true })
g3RedactCase('g3-redact-remove-rot90-cropbox', 'derived/rot90-cropbox-bert.pdf', { quick: true })
g3RedactCase('g3-redact-remove-rotation-quirk', 'quirks/pdfjs-rotation.pdf')
g3RedactCase('g3-redact-remove-origin-shift', 'derived/origin-shift-aws-invoice.pdf', { quick: true })
g3RedactCase('g3-redact-remove-rot270-cropbox', 'derived/c-rot270-cropbox.pdf')
g3RedactCase('g3-redact-remove-rot180-origin', 'derived/c-rot180-origin.pdf')
g3RedactCase('g3-redact-remove-aws-invoice', 'invoices/aws-invoice.pdf')
g3RedactCase('g3-redact-image-rot90-cropbox', 'derived/rot90-cropbox-bert.pdf', { method: 'image' })
g3RedactCase('g3-redact-remove-flipkart', 'invoices/flipkart-invoice.pdf')
g3RedactCase('g3-redact-image-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { method: 'image' })

// Synthetic file with a name in the page text, document properties, XMP, a
// bookmark, a sticky note with popup, a FreeText box, an attachment and alt
// texts. Built here (MuPDF) so it exists before the cases are listed.
const SECRET = 'SECRETNAME'
// in a subfolder, so the intake rows (top level of derived/) do not change
const SECRET_REL = 'derived/synthetic/redact-secretname.pdf'
function makeSecretPdf() {
  const doc = new mupdf.PDFDocument()
  try {
    const resources = doc.addObject(doc.newDictionary())
    const fonts = doc.newDictionary()
    fonts.put('F1', doc.addSimpleFont(new mupdf.Font('Helvetica')))
    resources.put('Font', fonts)
    const text = (lines) => lines.map(([y, s]) => `BT /F1 14 Tf 72 ${y} Td (${s}) Tj ET`).join('\n')
    doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, text([[700, `Agreement with ${SECRET} and others`], [650, 'This line stays readable on the page']])))
    doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, text([[700, 'Second page without the name'], [650, 'Plain words for coverage checks']])))
    const root = doc.getTrailer().get('Root')
    const info = doc.addObject(doc.newDictionary())
    info.put('Title', doc.newString(`Contract for ${SECRET}`))
    info.put('Subject', doc.newString(`Notes on ${SECRET}`))
    doc.getTrailer().put('Info', info)
    const meta = doc.newDictionary()
    meta.put('Type', doc.newName('Metadata'))
    meta.put('Subtype', doc.newName('XML'))
    const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Contract for ${SECRET}</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
    root.put('Metadata', doc.addStream(xmp, meta))
    // the bookmark points at page 1, so that page object must stay the same
    const outlines = doc.addObject(doc.newDictionary())
    const item = doc.addObject(doc.newDictionary())
    item.put('Title', doc.newString(`Section ${SECRET}`))
    item.put('Parent', outlines)
    const dest = doc.newArray()
    dest.push(doc.findPage(0))
    dest.push(doc.newName('Fit'))
    item.put('Dest', dest)
    outlines.put('Type', doc.newName('Outlines'))
    outlines.put('First', item)
    outlines.put('Last', item)
    outlines.put('Count', 1)
    root.put('Outlines', outlines)
    // alt text on the hit page, matching actual text on page 2
    const tree = doc.addObject(doc.newDictionary())
    tree.put('Type', doc.newName('StructTreeRoot'))
    const kids = doc.newArray()
    for (const [pg, key, value] of [[0, 'Alt', 'Photo of the signer'], [1, 'ActualText', `Signed by ${SECRET}`]]) {
      const el = doc.addObject(doc.newDictionary())
      el.put('Type', doc.newName('StructElem'))
      el.put('S', doc.newName('Figure'))
      el.put('P', tree)
      el.put('Pg', doc.findPage(pg))
      el.put(key, doc.newString(value))
      kids.push(el)
    }
    tree.put('K', kids)
    root.put('StructTreeRoot', tree)
    doc.insertEmbeddedFile('notes.txt', doc.addEmbeddedFile('notes.txt', 'text/plain', `${SECRET} private notes`, new Date(0), new Date(0)))
    const p2 = doc.loadPage(1)
    const note = p2.createAnnotation('Text')
    note.setRect([500, 500, 520, 520])
    note.setContents(`Call ${SECRET} tomorrow`)
    note.setPopup([520, 400, 700, 520])
    note.update()
    p2.destroy?.()
    const p1 = doc.loadPage(0)
    const free = p1.createAnnotation('FreeText')
    free.setRect([72, 400, 400, 440])
    free.setContents(`Approved by ${SECRET}`)
    free.update()
    p1.destroy?.()
    return doc.saveToBuffer('garbage=compact,compress').asUint8Array().slice()
  } finally {
    doc.destroy?.()
  }
}
if (!existsSync(abs(SECRET_REL)) && existsSync(join(CORPUS, 'derived'))) {
  mkdirSync(join(CORPUS, 'derived', 'synthetic'), { recursive: true })
  // other runners share the corpus folder: write aside, then rename
  const tmp = `${abs(SECRET_REL)}.${process.pid}.tmp`
  writeFileSync(tmp, makeSecretPdf())
  renameSync(tmp, abs(SECRET_REL))
}
for (const method of ['remove', 'image']) {
  add({
    id: `g3-redact-hidden-secretname-${method}`,
    tool: 'redact',
    op: 'g3RedactRemove',
    files: [SECRET_REL],
    params: { term: SECRET, method },
    quick: true,
    async validate(ctx) {
      ctx.check('search finds the page text, the sticky note and the FreeText', (ctx.meta?.boxes ?? 0) >= 3, `${ctx.meta?.boxes} matches`)
      const p = await checkPdf(ctx, 'redacted.pdf', { pages: 2 })
      if (!p?.pdfjs.ok) return
      leakCheck(ctx, 'redacted.pdf', [SECRET])
      ctx.check('bookmark kept (title cleaned)', (await outlineCount(ctx.out('redacted.pdf'))) === 1)
      ctx.check('page 2 keeps its text', (p.pdfjs.texts[1] ?? '').includes('Plain words for coverage checks'), (p.pdfjs.texts[1] ?? '').slice(0, 60))
      if (method === 'remove') ctx.check('page 1 keeps the other line', (p.pdfjs.texts[0] ?? '').includes('stays readable'), (p.pdfjs.texts[0] ?? '').slice(0, 60))
    },
  })
}

// XFA keeps its own copy of every filled value: any redaction drops it.
add({
  id: 'g3-redact-xfa-imm1344e',
  tool: 'redact',
  op: 'g3RedactRemove',
  files: ['forms/xfa-imm1344e-filled.pdf'],
  params: { query: {}, wholePages: [1] },
  quick: true,
  async validate(ctx) {
    const p = await checkPdf(ctx, 'redacted.pdf', { pages: 1 })
    if (!p?.pdfjs.ok) return
    leakCheck(ctx, 'redacted.pdf', ['Leonhard', 'Euler', 'Brunswick'])
  },
})

// Leak classes from the redact-fix review (P0 #1 to #8), one synthetic file
// each, built here with MuPDF. Search rows look for SECRETNAME; rows with
// `boxes` black out a drawn area (view points on a 612 x 792 page).
function synth(build) {
  const doc = new mupdf.PDFDocument()
  try {
    const font = doc.addSimpleFont(new mupdf.Font('Helvetica'))
    const res = (extra = {}) => {
      const r = doc.newDictionary()
      const f = doc.newDictionary()
      f.put('F1', font)
      r.put('Font', f)
      for (const [k, v] of Object.entries(extra)) r.put(k, v)
      return r
    }
    const page = (content, resources = res()) => {
      doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, content))
      return doc.findPage(doc.countPages() - 1)
    }
    const dict = (entries) => {
      const d = doc.newDictionary()
      for (const [k, v] of Object.entries(entries)) d.put(k, typeof v === 'string' && v.startsWith('/') ? doc.newName(v.slice(1)) : typeof v === 'string' ? doc.newString(v) : v)
      return d
    }
    const arr = (...items) => {
      const a = doc.newArray()
      for (const v of items) a.push(v)
      return a
    }
    const redImage = () => {
      const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 8, 8], false)
      const px = pix.getPixels()
      for (let i = 0; i < 64; i++) px.set([255, 0, 0], i * 3)
      return doc.addImage(new mupdf.Image(pix))
    }
    build({ doc, res, page, dict, arr, redImage, T: (y, s) => `BT /F1 14 Tf 72 ${y} Td (${s}) Tj ET` })
    return doc.saveToBuffer('garbage=compact,compress').asUint8Array().slice()
  } finally {
    doc.destroy?.()
  }
}
// tags the annotation through the structure tree (OBJR), as tagged PDFs do
function tagAnnot(doc, dict, arr, annotObj) {
  const tree = doc.addObject(dict({ Type: '/StructTreeRoot' }))
  const el = doc.addObject(dict({ Type: '/StructElem', S: '/Annot', P: tree, Pg: doc.findPage(0), K: dict({ Type: '/OBJR', Obj: annotObj, Pg: doc.findPage(0) }) }))
  tree.put('K', arr(el))
  tree.put('ParentTree', dict({ Nums: arr(0, el) }))
  annotObj.put('StructParent', 0)
  doc.getTrailer().get('Root').put('StructTreeRoot', tree)
}
const LEAK_FIXTURES = {
  // #1 a tagged FreeText: the struct tree keeps it alive after deletion
  objr: ({ doc, page, dict, arr, T }) => {
    page(T(700, 'Body text'))
    const p = doc.loadPage(0)
    const a = p.createAnnotation('FreeText')
    a.setRect([300, 150, 500, 190])
    a.setContents(`Approved by ${SECRET}`)
    a.update()
    tagAnnot(doc, dict, arr, a.getObject())
    p.destroy?.()
  },
  // #2 a reply (/IRT) to the deleted note, also tagged
  replies: ({ doc, page, dict, arr, T }) => {
    page(`${T(700, 'Body text')}\n${T(650, 'Second line')}`)
    const p = doc.loadPage(0)
    const note = p.createAnnotation('Text')
    note.setRect([400, 170, 420, 190])
    note.setContents(`Call ${SECRET}`)
    note.update()
    const reply = p.createAnnotation('Text')
    reply.setRect([430, 170, 450, 190])
    reply.setContents('Done, called.')
    reply.update()
    reply.getObject().put('IRT', note.getObject())
    tagAnnot(doc, dict, arr, note.getObject())
    p.destroy?.()
  },
  // #3a a header form in /Pages /Resources, drawn by page 1 only
  inherited: ({ doc, page, dict, arr, res, T }) => {
    const form = doc.addStream(T(740, `Header ${SECRET}`), dict({ Type: '/XObject', Subtype: '/Form', BBox: arr(0, 0, 612, 792), Resources: res() }))
    const p1 = page(`/Hdr Do\n${T(700, 'Page one body')}`)
    const p2 = page(T(700, 'Page two body'))
    doc.getTrailer().get('Root').get('Pages').put('Resources', res({ XObject: dict({ Hdr: form }) }))
    p1.delete('Resources')
    p2.delete('Resources')
  },
  // #3b one resource dict shared by both pages, the photo drawn on page 1
  sharedPhoto: ({ doc, page, dict, res, redImage, T }) => {
    const shared = doc.addObject(res({ XObject: dict({ Photo: redImage() }) }))
    page(`q 100 0 0 100 72 600 cm /Photo Do Q\n${T(500, 'Page one')}`, shared)
    page(T(700, 'Page two'), shared)
  },
  // #4 marked-content ActualText, Alt and E, a span only partly redacted
  bdc: ({ page, T }) => {
    page(
      [
        `/Span <</ActualText (Signed by ${SECRET} today)>> BDC ${T(700, `Signed by ${SECRET} today`)} EMC`,
        `/Span <</ActualText <FEFF${[...`${SECRET}HEX`].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('')}>>> BDC ${T(650, SECRET)} EMC`,
        `/Span <</Alt (Alt ${SECRET}ALT) /E (${SECRET}EXP)>> BDC ${T(600, SECRET)} EMC`,
        T(500, 'This line stays'),
      ].join('\n'),
    )
  },
  // #5 a slanted polyline (a vector signature) partly under the box
  lineArt: ({ page, T }) => {
    page(`0 0 1 RG 3 w 100 600 m 150 650 l 200 600 l 250 650 l 300 600 l 350 650 l 400 600 l S\n${T(500, 'This line stays')}`)
  },
  // #6 an image inside a tiling pattern, filled under the box
  pattern: ({ doc, page, dict, arr, res, redImage, T }) => {
    const pat = doc.addStream(
      'q 100 0 0 100 0 0 cm /Im Do Q',
      dict({ Type: '/Pattern', PatternType: 1, PaintType: 1, TilingType: 1, BBox: arr(0, 0, 100, 100), XStep: 100, YStep: 100, Resources: dict({ XObject: dict({ Im: redImage() }) }) }),
    )
    page(`q /Pattern cs /P0 scn 300 450 100 100 re f Q\n${T(300, 'This line stays')}`, res({ Pattern: dict({ P0: pat }) }))
  },
  // #7 text in a layer that is off
  hiddenLayer: ({ doc, page, dict, arr, res, T }) => {
    const ocg = doc.addObject(dict({ Type: '/OCG', Name: 'Draft' }))
    doc.getTrailer().get('Root').put('OCProperties', dict({ OCGs: arr(ocg), D: dict({ OFF: arr(ocg) }) }))
    page(`${T(700, 'Agreement with the client')}\n/OC /oc1 BDC ${T(600, `Draft note ${SECRET} private`)} EMC\n${T(500, 'This line stays')}`, res({ Properties: dict({ oc1: ocg }) }))
  },
  // review 2 #2: text hidden by an OCMD policy (/P /AllOff) over a layer that is on
  ocmd: ({ doc, page, dict, arr, res, T }) => {
    const ocg = doc.addObject(dict({ Type: '/OCG', Name: 'Base' }))
    doc.getTrailer().get('Root').put('OCProperties', dict({ OCGs: arr(ocg), D: dict({ ON: arr(ocg) }) }))
    const md = doc.addObject(dict({ Type: '/OCMD', OCGs: ocg, P: '/AllOff' }))
    page(`${T(700, 'Agreement with the client')}\n/OC /mc1 BDC ${T(600, `Draft note ${SECRET} private`)} EMC\n${T(500, 'This line stays')}`, res({ Properties: dict({ mc1: md }) }))
  },
  // review 2 #1: an axial shading drawn inside a clip, under the box
  shading: ({ doc, page, dict, arr, res, T }) => {
    const fn = dict({ FunctionType: 2, Domain: arr(0, 1), C0: arr(1, 0, 0), C1: arr(0, 0, 1), N: 1 })
    const sh = dict({ ShadingType: 2, ColorSpace: '/DeviceRGB', Coords: arr(100, 600, 300, 600), Function: fn })
    page(`q 100 560 200 100 re W n /Sh0 sh Q\n${T(400, 'This line stays')}`, res({ Shading: dict({ Sh0: sh }) }))
  },
  // review 2 #1: a free-form triangle mesh (a tiny picture) inside a clip
  mesh: ({ doc, page, dict, arr, res, T }) => {
    const vtx = (flag, x, y, rgb) => {
      const b = Buffer.alloc(8)
      b[0] = flag
      b.writeUInt16BE(Math.round((x / 612) * 65535), 1)
      b.writeUInt16BE(Math.round((y / 792) * 65535), 3)
      b.set(rgb, 5)
      return b
    }
    const data = Buffer.concat([vtx(0, 100, 550, [255, 0, 0]), vtx(0, 300, 550, [0, 255, 0]), vtx(0, 100, 650, [0, 0, 255]), vtx(1, 300, 650, [255, 255, 0])])
    const sh = doc.addStream(data, dict({ ShadingType: 4, ColorSpace: '/DeviceRGB', BitsPerCoordinate: 16, BitsPerComponent: 8, BitsPerFlag: 8, Decode: arr(0, 612, 0, 792, 0, 1, 0, 1, 0, 1) }))
    page(`q 100 550 200 100 re W n /M0 sh Q\n${T(400, 'This line stays')}`, res({ Shading: dict({ M0: sh }) }))
  },
  // review 2 #3: a Type3 font without resources draws with the shared page
  // resources; page 2 (not hit) must keep its glyphs after pruning
  type3Shared: ({ doc, page, dict, arr, res, T }) => {
    const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 4, 4], false)
    pix.clear(0)
    const t3 = doc.addObject(
      dict({
        Type: '/Font',
        Subtype: '/Type3',
        FontBBox: arr(0, 0, 1, 1),
        FontMatrix: arr(1, 0, 0, 1, 0, 0),
        CharProcs: dict({ a: doc.addStream('1 0 0 0 1 1 d1 q 0.8 0 0 0.8 0.1 0.1 cm /Dot Do Q', doc.newDictionary()) }),
        Encoding: dict({ Differences: arr(65, doc.newName('a')) }),
        FirstChar: 65,
        LastChar: 65,
        Widths: arr(1),
      }),
    )
    const shared = doc.addObject(res({ XObject: dict({ Dot: doc.addImage(new mupdf.Image(pix)) }) }))
    shared.get('Font').put('T3', t3)
    page(T(700, `Agreement with ${SECRET}`), shared)
    page('BT /T3 1 Tf 30 0 0 30 100 600 Tm (AAAA) Tj ET', shared)
  },
  // review 2 #6: an old-style catalog /Dests dict keyed by name
  nameDests: ({ doc, page, dict, arr, T }) => {
    const p1 = page(`${T(700, `Agreement with ${SECRET}`)}\n${T(650, 'This line stays')}`)
    const dests = doc.newDictionary()
    dests.put(`${SECRET}-chapter`, arr(p1, doc.newName('Fit')))
    doc.getTrailer().get('Root').put('Dests', doc.addObject(dests))
  },
  // #8 the name in places no page shows
  carriers: ({ doc, page, dict, arr, T }) => {
    const p1 = page(`${T(700, `Agreement with ${SECRET}`)}\n${T(650, 'Other line')}`)
    page(T(700, 'Second page'))
    const root = doc.getTrailer().get('Root')
    const outlines = doc.addObject(dict({ Type: '/Outlines', Count: 2 }))
    const it1 = doc.addObject(dict({ Title: 'Profile link', Parent: outlines, A: dict({ S: '/URI', URI: `https://example.com/u/${SECRET}` }) }))
    const it2 = doc.addObject(dict({ Title: 'Script', Parent: outlines, Prev: it1, A: dict({ S: '/JavaScript', JS: `app.alert("${SECRET}")` }) }))
    it1.put('Next', it2)
    outlines.put('First', it1)
    outlines.put('Last', it2)
    root.put('Outlines', outlines)
    root.put('Names', dict({ Dests: dict({ Names: arr(doc.newString(`${SECRET}-section`), arr(p1, doc.newName('Fit'))) }), JavaScript: dict({ Names: arr(doc.newString('init'), dict({ S: '/JavaScript', JS: `var who = "${SECRET}";` })) }) }))
    root.put('OpenAction', dict({ S: '/JavaScript', JS: `console.println("${SECRET} opened")` }))
    root.put('PageLabels', dict({ Nums: arr(0, dict({ P: `${SECRET}-` })) }))
    const ocg = doc.addObject(dict({ Type: '/OCG', Name: `Layer ${SECRET}` }))
    root.put('OCProperties', dict({ OCGs: arr(ocg), D: dict({ ON: arr(ocg) }) }))
    const field = doc.addObject(dict({ FT: '/Tx', T: 'name', V: SECRET, DV: SECRET, TU: `Tooltip ${SECRET}` }))
    root.put('AcroForm', dict({ Fields: arr(field) }))
    p1.put('AF', arr(doc.addEmbeddedFile('page.txt', 'text/plain', `${SECRET} page attachment`, new Date(0), new Date(0))))
  },
}
const leakRel = (key) => `derived/synthetic/redact-leak-${key}.pdf`
if (existsSync(join(CORPUS, 'derived'))) {
  mkdirSync(join(CORPUS, 'derived', 'synthetic'), { recursive: true })
  for (const [key, build] of Object.entries(LEAK_FIXTURES)) {
    if (existsSync(abs(leakRel(key)))) continue
    const tmp = `${abs(leakRel(key))}.${process.pid}.tmp`
    writeFileSync(tmp, synth(build))
    renameSync(tmp, abs(leakRel(key)))
  }
}
// [key, finding, params]
for (const [key, finding, params] of [
  ['objr', 1, { term: SECRET }],
  ['replies', 2, { term: SECRET }],
  ['inherited', 3, { term: SECRET }],
  ['sharedPhoto', 3, { query: {}, boxes: [{ pageNum: 1, x: 68, y: 88, w: 108, h: 108 }] }],
  ['bdc', 4, { term: SECRET }],
  ['lineArt', 5, { query: {}, boxes: [{ pageNum: 1, x: 180, y: 120, w: 140, h: 90 }] }],
  ['pattern', 6, { query: {}, boxes: [{ pageNum: 1, x: 296, y: 238, w: 108, h: 108 }] }],
  ['hiddenLayer', 7, { term: SECRET }],
  ['carriers', 8, { term: SECRET }],
  ['ocmd', 'r2-2', { term: SECRET }],
  ['shading', 'r2-1', { query: {}, boxes: [{ pageNum: 1, x: 90, y: 122, w: 220, h: 120 }] }],
  ['mesh', 'r2-1', { query: {}, boxes: [{ pageNum: 1, x: 150, y: 162, w: 100, h: 60 }] }],
  ['type3Shared', 'r2-3', { term: SECRET }],
  ['nameDests', 'r2-6', { term: SECRET }],
]) {
  for (const method of ['remove', 'image']) {
    add({
      id: `g3-redact-leak-${key}-${method}`,
      tool: 'redact',
      op: 'g3RedactRemove',
      files: [leakRel(key)],
      params: { ...params, method },
      quick: method === 'remove',
      async validate(ctx) {
        if (!ctx.meta?.areas?.length && !ctx.meta?.boxes) return ctx.check('something to redact', false, 'no matches and no boxes')
        const p = await checkPdf(ctx, 'redacted.pdf')
        if (!p?.pdfjs.ok) return
        leakCheck(ctx, 'redacted.pdf', params.term ? [params.term] : [])
        await sameUntouched(ctx, leakRel(key), p, ctx.meta.pagesHit)
        if (key === 'type3Shared') {
          // page 2 draws only Type3 glyphs (no text): compare pixels
          const a = renderGray(readRel(leakRel(key)), 1)
          const b = renderGray(ctx.out('redacted.pdf'), 1)
          ctx.check('page 2 (Type3 glyphs, pruned resources) renders the same', a.length === b.length && a.every((v, i) => v === b[i]))
        }
        ctx.metric(`review #${finding}, raster pages ${(ctx.meta.rasterPages ?? []).join(',') || 'none'}`)
      },
    })
  }
}

// Pages sharing one resource dict with a hit page get their resources pruned
// to what they draw: page 2 must still look exactly the same.
function renderGray(bytes, pageIndex) {
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  try {
    const pix = doc.loadPage(pageIndex).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceGray, false, true)
    return Uint8Array.from(pix.getPixels())
  } finally {
    doc.destroy?.()
  }
}
for (const method of ['remove', 'image']) {
  add({
    id: `g3-redact-shared-resources-free-fiber-${method}`,
    tool: 'redact',
    op: 'g3RedactRemove',
    files: ['invoices/free-fiber.pdf'],
    params: { term: 'VILLEURBANNE', query: { terms: ['VILLEURBANNE'], pages: [1] }, method },
    quick: method === 'remove',
    async validate(ctx) {
      ctx.check('finds the word on page 1', (ctx.meta?.boxes ?? 0) > 0, `${ctx.meta?.boxes} matches`)
      const p = await checkPdf(ctx, 'redacted.pdf', { pages: 2 })
      if (!p?.pdfjs.ok) return
      // the word may also be on page 2, which was not searched
      leakCheck(ctx, 'redacted.pdf')
      await sameUntouched(ctx, 'invoices/free-fiber.pdf', p, ctx.meta.pagesHit)
      const a = renderGray(readRel('invoices/free-fiber.pdf'), 1)
      const b = renderGray(ctx.out('redacted.pdf'), 1)
      let diff = a.length === b.length ? 0 : Infinity
      for (let k = 0; k < a.length && diff < Infinity; k++) diff += Math.abs(a[k] - b[k])
      ctx.check('page 2 (pruned resources) renders the same', diff / a.length < 0.5, `mean grey diff ${(diff / a.length).toFixed(3)}`)
    },
  })
}

// Real file: ActualText spans on a report page; part of a span is redacted.
add({
  id: 'g3-redact-actualtext-us-budget',
  tool: 'redact',
  op: 'g3RedactRemove',
  files: ['reports/us-budget-2024.pdf'],
  params: { query: { regex: 'Econ', pages: [23] } },
  timeout: 5 * MIN,
  async validate(ctx) {
    ctx.check('finds "Econ" on page 23', (ctx.meta?.boxes ?? 0) > 0, `${ctx.meta?.boxes} matches`)
    const p = await checkPdf(ctx, 'redacted.pdf', { pages: 184 })
    if (!p?.pdfjs.ok) return
    const [text] = await textAt(ctx.out('redacted.pdf'), [23])
    ctx.check('page 23 text no longer reads "Econ" (ActualText gone)', !/econ/i.test(text), text.slice(0, 80))
    // other pages still say "economy": structure and box checks only
    leakCheck(ctx, 'redacted.pdf')
    await sameUntouched(ctx, 'reports/us-budget-2024.pdf', p, ctx.meta.pagesHit)
  },
})

// Phrase split across pdf.js text items, then removed.
add({
  id: 'g3-redact-phrase-split-ipph353',
  tool: 'redact',
  op: 'g3RedactRemove',
  files: ['forms/uk-IPPH353.pdf'],
  params: { query: { terms: ['Acrobat Reader'] } },
  quick: true,
  timeout: 3 * MIN,
  async validate(ctx) {
    ctx.check('search finds a phrase split across text items', (ctx.meta?.boxes ?? 0) > 0, `${ctx.meta?.boxes ?? 0} matches`, { audit: 3 })
    const p = await checkPdf(ctx, 'redacted.pdf', { pages: 4 })
    if (!p?.pdfjs.ok) return
    ctx.check('phrase gone from extracted text', !allText(p).replace(/\s+/g, '').includes('AcrobatReader'), '', { audit: 3 })
    leakCheck(ctx, 'redacted.pdf', ['Acrobat Reader'])
    await keptOutside(ctx, 'forms/uk-IPPH353.pdf', p, ctx.meta.pagesHit, (t) => t.replace(/Acrobat\s*Rea\s*der/gi, ' '))
    ctx.metric(`${ctx.meta.boxes} boxes, ${ctx.meta.ms} ms`)
  },
})

// Built-in patterns: email and phone numbers on a real invoice.
add({
  id: 'g3-redact-patterns-quality-hosting',
  tool: 'redact',
  op: 'g3RedactRemove',
  files: ['invoices/quality-hosting.pdf'],
  params: { query: { patterns: ['email', 'phone'] } },
  quick: true,
  async validate(ctx) {
    const m = ctx.meta ?? {}
    ctx.check('finds emails and phone numbers', (m.sources ?? []).includes('email') && (m.sources ?? []).includes('phone'), (m.matches ?? []).join(' | '))
    const p = await checkPdf(ctx, 'redacted.pdf')
    if (!p?.pdfjs.ok) return
    const text = allText(p)
    const left = (m.matches ?? []).filter((x) => text.replace(/\s+/g, '').includes(x.replace(/\s+/g, '')))
    ctx.check('every match gone from extracted text', left.length === 0, left.join(' | '))
    leakCheck(ctx, 'redacted.pdf', m.matches ?? [])
    const strip = (t) => (m.matches ?? []).reduce((s, x) => noTerm(s, x), t)
    await keptOutside(ctx, 'invoices/quality-hosting.pdf', p, m.pagesHit ?? [], strip)
    ctx.metric(`${m.boxes} boxes: ${(m.matches ?? []).slice(0, 4).join(', ')}`)
  },
})

// Regular expression over a long report, limited to the first pages.
add({
  id: 'g3-redact-regex-budget-phones',
  tool: 'redact',
  op: 'g3RedactRemove',
  files: ['reports/us-budget-2024.pdf'],
  params: { query: { regex: '\\(\\d{3}\\) \\d{3}-\\d{4}', pages: [1, 2, 3, 4] } },
  timeout: 5 * MIN,
  async validate(ctx) {
    const m = ctx.meta ?? {}
    ctx.check('regex finds the phone numbers', (m.boxes ?? 0) >= 3, (m.matches ?? []).join(' | '))
    const p = await checkPdf(ctx, 'redacted.pdf', { pages: 184 })
    if (!p?.pdfjs.ok) return
    const text = p.pdfjs.texts.slice(0, 4).join(' ')
    ctx.check('no phone number left on pages 1-4', !/\(\d{3}\)\s*\d{3}-\d{4}/.test(text), '')
    // search covered pages 1-4 only: the same numbers may stay on later pages
    leakCheck(ctx, 'redacted.pdf')
    ctx.metric(`${m.boxes} boxes, ${(m.matches ?? []).slice(0, 3).join(', ')}`)
  },
})

// Whole page: nothing left on page 1, the rest untouched.
add({
  id: 'g3-redact-whole-page-tracemonkey',
  tool: 'redact',
  op: 'g3RedactRemove',
  files: ['reports/pdfjs-tracemonkey.pdf'],
  params: { query: {}, wholePages: [1] },
  quick: true,
  async validate(ctx) {
    const f = await inputFacts('reports/pdfjs-tracemonkey.pdf')
    const p = await checkPdf(ctx, 'redacted.pdf', { pages: 14 })
    if (!p?.pdfjs.ok) return
    ctx.check('page 1 has no text left', !(p.pdfjs.texts[0] ?? '').trim(), (p.pdfjs.texts[0] ?? '').slice(0, 60))
    leakCheck(ctx, 'redacted.pdf')
    ctx.check('page 2 keeps its text', (wordCoverage(f.pdfjs.texts[1], p.pdfjs.texts[1]).ratio ?? 0) > 0.95)
    const ratio = p.size / sizeOf('reports/pdfjs-tracemonkey.pdf')
    ctx.check('size stays close to the input (<= 1.5x)', ratio <= 1.5, `${ratio.toFixed(2)}x`)
  },
})

// Page numbers: template, skip, facing pages, Bates, margins.
add({
  id: 'g3-pagenumbers-template-skip',
  tool: 'pagenumbers',
  op: 'g3PageNumbers',
  files: ['reports/pdfjs-tracemonkey.pdf'],
  params: { template: 'Seite {n} von {p}', skip: 2, start: 1 },
  quick: true,
  async validate(ctx) {
    const p = await checkPdf(ctx, 'numbered.pdf', { pages: 14 })
    if (!p?.pdfjs.ok) return
    const t = p.pdfjs.texts
    ctx.check('skipped pages carry no number', !t[0].includes('Seite') && !t[1].includes('Seite'), '', { audit: 33 })
    ctx.check('page 3 reads "Seite 1 von 12"', t[2].includes('Seite 1 von 12'), '', { audit: 33 })
    ctx.check('page 14 reads "Seite 12 von 12"', t[13].includes('Seite 12 von 12'), '', { audit: 33 })
  },
})
add({
  id: 'g3-pagenumbers-facing',
  tool: 'pagenumbers',
  op: 'g3PageNumbers',
  files: ['reports/pdfjs-tracemonkey.pdf'],
  params: { template: 'PN{n}', position: 'bottom-right', facing: true },
  quick: true,
  async validate(ctx) {
    const p = await checkPdf(ctx, 'numbered.pdf', { pages: 14 })
    if (!p?.pdfjs.ok) return
    const items = await seenItems(ctx.out('numbered.pdf'))
    const bad = []
    for (let n = 1; n <= 14; n++) {
      const h = items.find((x) => x.page === n && x.str.trim() === `PN${n}`)
      const ok = h && h.cy > 0.9 && (n % 2 ? h.cx > 0.8 : h.cx < 0.2)
      if (!ok) bad.push(h ? `p${n} (${h.cx.toFixed(2)}, ${h.cy.toFixed(2)})` : `p${n} missing`)
    }
    ctx.check('odd pages right, even pages left', bad.length === 0, bad.slice(0, 3).join('; '), { audit: 33 })
  },
})
add({
  id: 'g3-pagenumbers-bates-rot90',
  tool: 'pagenumbers',
  op: 'g3PageNumbers',
  files: ['derived/rot90-cropbox-bert.pdf'],
  params: { bates: { prefix: 'ACME', digits: 6 }, start: 41, position: 'bottom-right' },
  quick: true,
  async validate(ctx) {
    const p = await checkPdf(ctx, 'numbered.pdf', { pages: 16 })
    if (!p?.pdfjs.ok) return
    const items = await seenItems(ctx.out('numbered.pdf'))
    const first = items.find((x) => x.page === 1 && x.str.trim() === 'ACME000041')
    const last = items.find((x) => x.page === 16 && x.str.trim() === 'ACME000056')
    ctx.check('Bates numbers ACME000041 to ACME000056', !!first && !!last, '', { audit: 33 })
    if (first) ctx.check('bottom right of the visible page, upright', first.cx > 0.75 && first.cy > 0.9 && angleNear(first.angle, 0), `(${first.cx.toFixed(2)}, ${first.cy.toFixed(2)}) ${first.angle.toFixed(0)} deg`, { audit: 8 })
  },
})
add({
  id: 'g3-pagenumbers-margin-big',
  tool: 'pagenumbers',
  op: 'g3PageNumbers',
  files: ['reports/pdfjs-tracemonkey.pdf'],
  params: { template: 'MB{n}', margin: 'big', position: 'top-left' },
  async validate(ctx) {
    const p = await checkPdf(ctx, 'numbered.pdf', { pages: 14 })
    if (!p?.pdfjs.ok) return
    const h = (await seenItems(ctx.out('numbered.pdf'), [1])).find((x) => x.str.trim() === 'MB1')
    // 48 pt from the left and top edges of a 612 x 792 page
    ctx.check('big margin (48 pt) from the corner', !!h && near(h.fx * h.W, 48, 2) && near(h.fy * h.H - 11 * 0.72, 48, 4), h ? `(${(h.fx * h.W).toFixed(0)}, ${(h.fy * h.H).toFixed(0)}) pt` : 'missing')
  },
})

// Sign: signature, initials on every page, a date, on a rotated page.
add({
  id: 'g3-sign-multi-rot90',
  tool: 'sign',
  op: 'g3SignMulti',
  files: ['derived/rot90-cropbox-bert.pdf'],
  quick: true,
  async validate(ctx) {
    const rel = 'derived/rot90-cropbox-bert.pdf'
    const p = await checkPdf(ctx, 'signed.pdf', { pages: 16 })
    if (!p?.pdfjs.ok) return
    const before1 = (await imagePlacements(readRel(rel), 1)).length
    const before5 = (await imagePlacements(readRel(rel), 5)).length
    const on1 = await imagePlacements(ctx.out('signed.pdf'), 1)
    const on5 = await imagePlacements(ctx.out('signed.pdf'), 5)
    ctx.check('signature and initials on page 1', on1.length === before1 + 2, `${on1.length} vs ${before1}`, { audit: 24 })
    const ini = on5[on5.length - 1]
    ctx.check('initials on every page, where placed', on5.length === before5 + 1 && !!ini && near(ini.cx, 0.9, 0.02) && near(ini.cy, 0.95, 0.03), ini ? `(${ini.cx.toFixed(2)}, ${ini.cy.toFixed(2)})` : 'none', { audit: 24 })
    const date = (await seenItems(ctx.out('signed.pdf'), [16])).find((x) => x.str.includes('DATE 2026-10-17'))
    ctx.check('date on the last page, upright', !!date && near(date.cx, 0.3, 0.03) && near(date.cy, 0.9, 0.03) && angleNear(date.angle, 0), date ? `(${date.cx.toFixed(2)}, ${date.cy.toFixed(2)})` : 'missing', { audit: 24 })
  },
})

// Forms: XFA detection, XFA removed on fill, fast scans.
for (const [name, want] of [['irs-fw9.pdf', 'static'], ['xfa-issue14315.pdf', 'dynamic'], ['uscis-i-9.pdf', 'none'], ['uscis-i-485.pdf', 'static']]) {
  add({
    id: `g3-forms-inspect-${name.replace(/\.pdf$/, '')}`,
    tool: 'forms',
    op: 'g3FormsInspect',
    files: [`forms/${name}`],
    quick: name === 'xfa-issue14315.pdf',
    timeout: 3 * MIN,
    async validate(ctx) {
      const facts = await formFacts(readRel(`forms/${name}`))
      ctx.check(`XFA detected as ${want}`, ctx.meta?.xfa === want, `got ${ctx.meta?.xfa} (MuPDF XFA ${facts.hasXfa})`, { audit: 21 })
      ctx.check('field scan under 3 s', (ctx.meta?.ms ?? 1e9) < 3000, `${ctx.meta?.ms} ms`, { audit: 21 })
      ctx.metric(`${ctx.meta?.count} fields, ${ctx.meta?.widgets} widgets, ${ctx.meta?.ms} ms`)
    },
  })
}
for (const [rel, flatten] of [['forms/irs-fw9.pdf', false], ['forms/irs-f1040.pdf', true]]) {
  add({
    id: `g3-forms-fill-xfa-${rel.split('/').pop().replace(/\.pdf$/, '')}${flatten ? '-flat' : ''}`,
    tool: 'forms',
    op: 'g3FormsFill',
    files: [rel],
    params: { flatten },
    quick: !flatten,
    timeout: 3 * MIN,
    async validate(ctx) {
      const f = await inputFacts(rel)
      const p = await checkPdf(ctx, 'filled.pdf', { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      const values = ctx.meta?.values ?? {}
      const names = Object.keys(values)
      ctx.check('filled text fields', names.length > 0 && ctx.meta.filled === names.length, `${ctx.meta?.filled}`)
      const facts = await formFacts(ctx.out('filled.pdf'))
      ctx.check('XFA copy removed so viewers show the new values', ctx.meta?.xfaRemoved === true && !facts.hasXfa, `xfaRemoved ${ctx.meta?.xfaRemoved}, MuPDF XFA ${facts.hasXfa}`, { audit: 21 })
      xfaLeftCheck(ctx, 'filled.pdf')
      if (flatten) {
        ctx.check('values in the page text', names.every((n) => allText(p).includes(values[n])))
        ctx.check('no fields left', facts.count === 0, `${facts.count}`)
      } else {
        const wrong = names.filter((n) => facts.values[n] !== values[n])
        ctx.check('values stored in the fields', wrong.length === 0, wrong.join(', '))
      }
    },
  })
}

// A value typed into a form field is found and removed with its field.
add({
  id: 'g3-redact-form-value-fw9',
  tool: 'redact',
  op: 'g3RedactFormValue',
  files: ['forms/irs-fw9.pdf'],
  params: { value: 'SECRET4455' },
  quick: true,
  async validate(ctx) {
    ctx.check('search finds the value inside a form field', (ctx.meta?.boxes ?? 0) > 0 && ctx.meta.field, `${ctx.meta?.boxes} matches`)
    const p = await checkPdf(ctx, 'redacted.pdf', { pages: 6 })
    if (!p?.pdfjs.ok) return
    const facts = await formFacts(ctx.out('redacted.pdf'))
    ctx.check('field value gone', !Object.values(facts.values).some((v) => String(v ?? '').includes('SECRET4455')), String(facts.values[ctx.meta.name]))
    ctx.check('value gone from text and file bytes', !allText(p).includes('SECRET4455') && !Buffer.from(ctx.out('redacted.pdf')).includes('SECRET4455'))
    leakCheck(ctx, 'redacted.pdf', ['SECRET4455'])
  },
})

// Extra case files (cases-<unit>.mjs) register through the same helpers.
for (const f of readdirSync(new URL('.', import.meta.url)).filter((n) => /^cases-[\w-]+\.mjs$/.test(n)).sort()) {
  const m = await import(new URL(f, import.meta.url))
  m.default({ add, checkPdf, inputFacts, readRel, allText, CORPUS, MIN, passwordFor })
}

export function buildCases() {
  return cases.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}
