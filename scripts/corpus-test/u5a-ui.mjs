// U5-A tools through the real shell UI on 3 real files each: add the file,
// open the tool, press Run, time until the result screen shows, download,
// reopen the download in pdf.js and MuPDF and check it. Prints a Run-to-
// result latency table (median of the 3 files per tool).
// Usage: node scripts/corpus-test/u5a-ui.mjs [--url http://localhost:4180/SwissPDF/] [--tool nup,stamp]
// Remove blank uses the with-blanks copies the ops cases write
// (run --case "^u5a-blank-" first) and lincoln's real blank pages.
import { chromium } from 'playwright'
import JSZip from 'jszip'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, ROOT, OUT_DIR } from './server.mjs'
import { probe } from './validate.mjs'
import { checkLinearized } from './lin-check.mjs'

const CORPUS = join(ROOT, 'test-corpus')
const at = process.argv.indexOf('--url')
const given = at > 0 ? process.argv[at + 1] : null
const ti = process.argv.indexOf('--tool')
const only = ti > 0 ? process.argv[ti + 1].split(',') : null

const TEXT = ['reports/pdfjs-tracemonkey.pdf', 'invoices/aws-invoice.pdf', 'reports/arxiv-1706.03762-attention.pdf']
const ODD = ['derived/rot90-cropbox-bert.pdf', 'derived/c-rot270-cropbox.pdf', 'derived/origin-shift-aws-invoice.pdf']
const SCANS = ['scanned/fax-jean-schmidt-doe.pdf', 'scanned/lincoln-ellsworth-letter-1861.pdf', 'derived/c-mixed.pdf']
const withBlanks = (id) => join(OUT_DIR, id, 'with-blanks.pdf')
// lincoln has 16 real blank scanned pages; the others get blanks inserted
const BLANKS = [withBlanks('u5a-blank-fax-inserted'), join(CORPUS, 'scanned/lincoln-ellsworth-letter-1861.pdf'), withBlanks('u5a-blank-mixed-inserted')]
const AWS = join(CORPUS, 'invoices/aws-invoice.pdf')

const pagesOf = async (abs) => (await probe(new Uint8Array(readFileSync(abs)))).pdfjs.pages

// run name -> { tool (default: the name), files: [[abs paths added in order]],
//   prepare?(page), check(out, probe, input, page), zip (download is a ZIP of PDFs) }
const TOOLS = {
  nup: { files: TEXT, check: async (out, p, src) => p.pdfjs.pages === Math.ceil((await pagesOf(src)) / 4) },
  booklet: { files: TEXT, check: async (out, p, src) => p.pdfjs.pages === 2 * Math.max(1, Math.ceil((await pagesOf(src)) / 4)) },
  scale: { files: ODD, check: async (out, p) => p.pdfjs.pageInfo.every((s) => Math.abs(Math.min(s.w, s.h) - 595.28) < 1) },
  singlepage: { files: TEXT, check: async (out, p) => p.pdfjs.pages === 1 },
  stamp: { files: ODD, check: async (out, p) => p.pdfjs.texts.join(' ').includes('APPROVED') },
  overlay: { files: TEXT.map((f) => [join(CORPUS, f), AWS]), check: async (out, p) => p.pdfjs.texts[0].includes('296664039561') },
  removeblank: { files: BLANKS, check: async (out, p, src) => p.pdfjs.pages < (await pagesOf(src)) },
  adjustcolors: {
    files: SCANS,
    // contrast 100 -> 130 with the keyboard, like a user on the slider
    async prepare(page) {
      await page.focus('[data-testid=colors-contrast]')
      await page.keyboard.press('ArrowRight', { delay: 0 })
      for (let i = 0; i < 29; i++) await page.keyboard.press('ArrowRight')
    },
    check: async (out, p, src) => p.pdfjs.pages === (await pagesOf(src)),
  },
  replacecolors: { files: SCANS, check: async (out, p, src) => p.pdfjs.pages === (await pagesOf(src)) },
  linearize: { files: TEXT, check: async (out) => checkLinearized(out).problems.length === 0 },
  // options beyond the defaults, one file each
  'nup-custom': {
    tool: 'nup',
    files: ['derived/c-mixed.pdf'],
    async prepare(page) {
      await page.click('[data-testid=nup-per] [role=radio]:has-text("Custom")')
      await page.fill('[data-testid=nup-cols]', '3')
      await page.fill('[data-testid=nup-rows]', '2')
    },
    check: async (out, p) => p.pdfjs.pages === 1,
  },
  // result notes say what was not kept
  'nup-note': {
    tool: 'nup',
    files: ['reports/arxiv-1706.03762-attention.pdf'],
    check: async (out, p, src, page) => /Kept 22 bookmarks..*Not kept: 113 links/.test(await page.textContent('[data-testid=result-screen]')),
  },
  'linearize-grow-note': {
    tool: 'linearize',
    files: ['forms/irs-f1040.pdf'],
    check: async (out, p, src, page) => checkLinearized(out).problems.length === 0 && /larger than before/.test(await page.textContent('[data-testid=result-screen]')),
  },
  // non-Latin stamp text: fonts load inside the ops worker
  'stamp-cjk': {
    tool: 'stamp',
    files: ['derived/c-rot270-cropbox.pdf'],
    prepare: (page) => page.fill('[data-testid=stamp-text]', '\u627f\u8a8d\u6e08\u307f {n}'),
    check: async (out, p) => p.pdfjs.texts.join(' ').includes('\u627f\u8a8d'),
  },
  'removeblank-save': {
    tool: 'removeblank',
    files: [BLANKS[2]],
    zip: true,
    prepare: (page) => page.check('[data-testid=blank-save-removed]'),
    // 7 pages with 2 blanks: 5 kept + 2 removed
    check: async (pdfs) => pdfs.length === 2 && pdfs.map((p) => p.pdfjs.pages).sort().join(',') === '2,5',
  },
  'adjustcolors-saturate': {
    tool: 'adjustcolors',
    files: ['derived/c-mixed.pdf'],
    async prepare(page) {
      await page.focus('[data-testid=colors-saturation]')
      for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowRight')
    },
    check: async (out, p, src, page) =>
      p.pdfjs.pages === 5 && p.pdfjs.pageInfo.every((s) => s.rotate === 0) && /not selectable/.test(await page.textContent('[data-testid=result-screen]')),
  },
}

let failed = 0
const rows = []
const dev = given ? null : await startServer()
const base = (given ?? dev.url).replace(/\/$/, '')
const browser = await chromium.launch()

async function oneRun(name, spec, input) {
  const id = spec.tool ?? name
  const files = (Array.isArray(input) ? input : [input]).map((f) => (existsSync(f) ? f : join(CORPUS, f)))
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const external = []
  page.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u)
  })
  try {
    await page.goto(`${base}/`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
    await page.waitForSelector('[data-testid=tool-panel]', { state: 'attached', timeout: 60_000 })
    // tool groups start folded (S2): unfold them so the row is there
    await page.$$eval('[data-testid^=fold-][aria-expanded=false]', (els) => els.forEach((el) => el.click()))
    await page.click(`[data-testid=tool-${id}]`)
    await page.waitForSelector('[data-testid=options-panel]')
    await page.setInputFiles('[data-testid=add-files-input]', files)
    await page.waitForFunction(
      (c) => {
        const m = [...document.querySelectorAll('[data-testid=file-card] .file-meta')].map((e) => e.textContent)
        return m.length >= c && m.every((t) => !/Reading/.test(t))
      },
      files.length,
      { timeout: 120_000 },
    )
    if (spec.prepare) await spec.prepare(page)
    await page.waitForSelector('[data-testid=run-btn]:not([disabled])', { timeout: 30_000 })
    const t0 = Date.now()
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen], [data-testid=run-error]', { timeout: 600_000 })
    const ms = Date.now() - t0
    const err = await page.$('[data-testid=run-error]')
    if (err) throw new Error(await err.textContent())
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click('[data-testid=result-download]')])
    const out = new Uint8Array(readFileSync(await dl.path()))
    const dir = join(OUT_DIR, `u5a-ui-${name}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, dl.suggestedFilename()), out)
    let opens
    let checked
    let pages
    if (spec.zip) {
      const zip = await JSZip.loadAsync(out)
      const probes = []
      for (const n of Object.keys(zip.files).filter((n) => n.endsWith('.pdf'))) probes.push(await probe(await zip.file(n).async('uint8array')))
      opens = probes.every((p) => p.pdfjs.ok && p.mupdf.ok && p.mupdf.pages === p.pdfjs.pages)
      checked = await spec.check(probes)
      pages = probes.map((p) => p.pdfjs.pages).join('+')
    } else {
      const p = await probe(out, { texts: true, maxTextPages: 20 })
      opens = p.pdfjs.ok && p.mupdf.ok && p.mupdf.pages === p.pdfjs.pages
      checked = await spec.check(out, p, files[0], page)
      pages = p.pdfjs.pages
    }
    const ok = opens && checked && errors.length === 0 && external.length === 0
    return { ms, ok, detail: `${dl.suggestedFilename()} ${pages} p${opens ? '' : ' (does not open in both)'}${errors.length ? ` errors: ${errors[0]}` : ''}${external.length ? ` external: ${external[0]}` : ''}` }
  } finally {
    await ctx.close()
  }
}

for (const [id, spec] of Object.entries(TOOLS)) {
  if (only && !only.includes(id)) continue
  const times = []
  for (const input of spec.files) {
    const name = (Array.isArray(input) ? input[0] : input).split(/[\\/]/).slice(-2).join('/')
    let r
    try {
      r = await oneRun(id, spec, input)
    } catch (err) {
      r = { ms: null, ok: false, detail: err.message.split('\n')[0] }
    }
    if (!r.ok) failed++
    if (r.ms != null) times.push(r.ms)
    rows.push({ id, name, ...r })
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${id.padEnd(13)} ${name.padEnd(48)} ${r.ms != null ? `${(r.ms / 1000).toFixed(2)} s` : '-'}  ${r.detail}`)
  }
  const sorted = [...times].sort((a, b) => a - b)
  rows.push({ id, median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null, times })
}

console.log('\n| Tool | Files | Run to result (median) | Each |\n|---|---|---|---|')
for (const r of rows.filter((x) => 'median' in x)) {
  const n = rows.filter((x) => x.id === r.id && !('median' in x))
  console.log(`| ${r.id} | ${n.filter((x) => x.ok).length}/${n.length} pass | ${r.median != null ? `${(r.median / 1000).toFixed(2)} s` : '-'} | ${r.times.map((t) => (t / 1000).toFixed(2)).join(', ')} |`)
}
writeFileSync(join(OUT_DIR, 'u5a-ui.json'), JSON.stringify(rows, null, 1))
await browser.close()
await dev?.server.close()
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
