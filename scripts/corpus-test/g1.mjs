// G1 Organize cases through the real shell UI on real corpus files: split
// (ranges, fixed, pages, size, bookmarks), extract and remove with Shift-click,
// organize presets, rotate by orientation, a split -> rotate -> merge chain,
// and the 956-page every-page split with memory measured.
// Usage: node scripts/corpus-test/g1.mjs [--case <regex>] [--url <built app>] [--json <out.json>]
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import * as mupdf from 'mupdf'
import { startServer, ROOT } from './server.mjs'
import { textAt, withPdfjs, wordCoverage } from './validate.mjs'

const CORPUS = join(ROOT, 'test-corpus')
const arg = (k) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : null
}
const caseRe = arg('case') ? new RegExp(arg('case')) : null
const given = arg('url')
const dev = given ? null : await startServer()
const base = (given ?? dev.url).replace(/\/$/, '')
const browser = await chromium.launch()
const results = []
const MB = (n) => `${(n / 1048576).toFixed(1)} MB`

// Private memory of this test browser's processes (browser, page, workers,
// GPU), by the pids Chromium reports. Other browsers on the machine are left out.
let browserCdp = null
let memPage = null
async function chromeMemory() {
  try {
    browserCdp ??= await browser.newBrowserCDPSession()
    const { processInfo } = await browserCdp.send('SystemInfo.getProcessInfo')
    const ids = processInfo.map((p) => p.id).join(',')
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `Get-Process -Id ${ids} -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id) $($_.PrivateMemorySize64)" }`], { encoding: 'utf8' })
    const byId = new Map(out.trim().split(/\r?\n/).map((l) => l.split(' ').map(Number)))
    if (process.env.G1_MEM_DEBUG) {
      const label = await memPage?.textContent('[data-testid=job-progress]', { timeout: 200 }).catch(() => 'no job')
      console.log('      mem', processInfo.map((p) => `${p.type}:${MB(byId.get(p.id) ?? 0)}`).slice(0, 2).join(' '), label)
    }
    return [...byId.values()].reduce((a, b) => a + b, 0)
  } catch {
    return 0
  }
}

async function freshPage(route, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ acceptDownloads: true, viewport })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
  await page.goto(`${base}/#/${route}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
  await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })
  return { context, page, errors }
}

async function addFiles(page, rels) {
  await page.setInputFiles('[data-testid=add-files-input]', rels.map((r) => join(CORPUS, r)))
  await page.waitForFunction(
    (n) => {
      const m = [...document.querySelectorAll('[data-testid=file-card] .file-meta, [data-testid=page-track]')]
      const cards = [...document.querySelectorAll('[data-testid=file-card]')].map((c) => c.querySelector('.file-meta')?.textContent ?? '')
      const tracks = document.querySelectorAll('[data-testid=page-track]').length
      return m.length > 0 && (cards.length ? cards.length === n && cards.every((t) => /^\d+ pages?/.test(t)) : tracks === n)
    },
    rels.length,
    { timeout: 180_000 },
  )
}

const liveLine = (page) => page.textContent('[data-testid=live-line]')
async function waitLine(page, re, timeout = 60_000) {
  await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid=live-line]')?.textContent ?? ''), re.source, { timeout })
  return liveLine(page)
}
async function runTool(page, timeout = 600_000) {
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=result-screen], [data-testid=run-error]', { timeout })
  const err = await page.$('[data-testid=run-error]')
  if (err) throw new Error(await err.textContent())
}
async function download(page, timeout = 600_000) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout }), page.click('[data-testid=result-download]')])
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(readFileSync(await dl.path())) }
}
async function unzip(bytes) {
  const zip = await JSZip.loadAsync(bytes)
  const names = Object.keys(zip.files).filter((n) => n.endsWith('.pdf'))
  return { names, read: (n) => zip.file(n).async('uint8array') }
}
// restricted outputs are encrypted (object streams too): decrypt with MuPDF first
const plain = (bytes) => {
  const d = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  try {
    return d.saveToBuffer('encrypt=none').asUint8Array().slice()
  } finally {
    d.destroy()
  }
}
const pages = async (bytes) => (await PDFDocument.load(plain(bytes), { updateMetadata: false })).getPageCount()
const rotations = async (bytes) => (await PDFDocument.load(plain(bytes), { updateMetadata: false })).getPages().map((p) => p.getRotation().angle)
// Top-level bookmarks with their 1-based page, read by pdf.js.
const chapters = (bytes) =>
  withPdfjs(bytes, async (doc) => {
    const out = []
    for (const o of (await doc.getOutline()) ?? []) {
      const dest = typeof o.dest === 'string' ? await doc.getDestination(o.dest) : o.dest
      out.push({ title: o.title, page: dest?.[0] ? (await doc.getPageIndex(dest[0])) + 1 : null })
    }
    return out
  })
const titles = (bytes) => withPdfjs(bytes, async (doc) => ((await doc.getOutline()) ?? []).map((o) => o.title))
const src = (rel) => new Uint8Array(readFileSync(join(CORPUS, rel)))

const CASES = []
const add = (id, files, fn) => CASES.push({ id, files, fn })

add('g1-split-custom-ranges-merge', ['reports/pdfjs-tracemonkey.pdf'], async ({ page, check }) => {
  await page.click('[data-testid=split-to] >> nth=0')
  await page.fill('[data-testid=split-from] >> nth=0', '1')
  await page.fill('[data-testid=split-to] >> nth=0', '3')
  await page.click('[data-testid=split-add-range]')
  await page.fill('[data-testid=split-from] >> nth=1', '10')
  await page.fill('[data-testid=split-to] >> nth=1', '14')
  check('live line: 2 PDFs', /2 PDFs will be created/.test(await liveLine(page)), await liveLine(page))
  await page.fill('[data-testid=split-to] >> nth=1', '15')
  check('range past the end is named', /Range 2 goes past the end/.test(await liveLine(page)), await liveLine(page))
  await page.fill('[data-testid=split-to] >> nth=1', '14')
  await page.check('[data-testid=split-merge-ranges]')
  check('merge: 1 PDF', /1 PDF will be created/.test(await liveLine(page)), await liveLine(page))
  await runTool(page)
  const d = await download(page)
  check('merged ranges: 8 pages, named by ranges', d.name === 'pdfjs-tracemonkey_1-3_10-14.pdf' && (await pages(d.bytes)) === 8, `${d.name}, ${await pages(d.bytes)} pages`)
})

add('g1-split-fixed-n', ['reports/pdfjs-tracemonkey.pdf'], async ({ page, check }) => {
  await page.click('[data-testid=split-range-mode] [data-value=fixed]')
  await page.fill('[data-testid=every-n-input]', '4')
  const line = await liveLine(page)
  check('live line: files of 4 pages, 4 PDFs', /files of 4 pages\. 4 PDFs will be created/.test(line), line)
  await runTool(page)
  const z = await unzip((await download(page)).bytes)
  const counts = []
  for (const n of z.names.sort((a, b) => parseInt(a.split('_').pop()) - parseInt(b.split('_').pop()))) counts.push(await pages(await z.read(n)))
  check('4 + 4 + 4 + 2 pages, names {name}_1-4.pdf', counts.join(',') === '4,4,4,2' && z.names.includes('pdfjs-tracemonkey_13-14.pdf'), `${z.names.sort().join(' ')} ${counts}`)
})

add('g1-split-select-pages', ['reports/us-budget-2024.pdf'], async ({ page, check }) => {
  await page.click('[data-testid=split-tab] >> text=Pages')
  await page.click('[data-testid=split-pages-mode] [data-value=select]')
  await page.fill('[data-testid=range-input]', '1,5-8')
  check('live line: 5 PDFs', /5 PDFs will be created/.test(await liveLine(page)), await liveLine(page))
  await runTool(page)
  const z = await unzip((await download(page)).bytes)
  check('5 single-page files', z.names.length === 5 && z.names.includes('us-budget-2024_5.pdf'), z.names.join(' '))
})

add('g1-split-by-size-911', ['large/911-commission-report.pdf'], async ({ page, check }) => {
  await page.click('[data-testid=split-tab] >> text=Size')
  await page.fill('[data-testid=split-max-size]', '500')
  await page.click('[data-testid=options-panel] .segmented >> text=KB')
  check('live line: at least 5 PDFs', /At least 5 PDFs/.test(await liveLine(page)), await liveLine(page))
  await runTool(page)
  const z = await unzip((await download(page)).bytes)
  let total = 0
  let over = 0
  for (const n of z.names) {
    const b = await z.read(n)
    total += await pages(b)
    if (b.length > 500 * 1024) over++
  }
  check('every part at most 500 KB, all 585 pages kept', over === 0 && total === 585, `${z.names.length} parts, ${total} pages, ${over} over`)
})

add('g1-split-bookmarks-911', ['large/911-commission-report.pdf'], async ({ page, check, metric }) => {
  await page.click('[data-testid=split-tab] >> text=Bookmarks')
  const line = await waitLine(page, /PDFs will be created/)
  check('live line counts top-level bookmarks', /23 PDFs will be created/.test(line), line)
  await runTool(page)
  const z = await unzip((await download(page)).bytes)
  const source = await chapters(src('large/911-commission-report.pdf'))
  let total = 0
  let withMarks = 0
  let firstTitleOk = 0
  const sample = []
  // names are <base>_<01>_<title>.pdf: zero-padded order, parts are contiguous
  const named = z.names.filter((n) => /^911-commission-report_\d{2}(_[^/]+)?\.pdf$/.test(n) && n.length <= 60)
  check('parts named by index and bookmark title', named.length === z.names.length && z.names.some((n) => /_02_.*Contents/i.test(n) || /_0\d_[A-Za-z]/.test(n)), z.names.slice(0, 4).join(' '))
  for (const n of z.names.sort()) {
    const b = await z.read(n)
    const from = total + 1
    total += await pages(b)
    const t = await titles(b)
    if (t.length) withMarks++
    const want = source.find((c) => c.page === from)
    if (!want || t.includes(want.title)) firstTitleOk++
    else sample.push(`${n}: missing ${want.title}`)
  }
  check('23 parts, 585 pages in total', z.names.length === 23 && total === 585, `${z.names.length} parts, ${total} pages`)
  check('parts keep their bookmarks', withMarks >= 22, `${withMarks} of ${z.names.length} parts have bookmarks`)
  check('each part keeps the bookmark it starts at', firstTitleOk === z.names.length, `${firstTitleOk} of ${z.names.length}`)
  if (sample.length) metric(sample.join(' | '))
})

add('g1-extract-shift-click', ['reports/pdfjs-tracemonkey.pdf'], async ({ page, check }) => {
  await page.waitForSelector('[data-testid=page-track] .tile-btn[data-page="5"]')
  await page.click('[data-testid=page-track] .tile-btn[data-page="2"]')
  await page.click('[data-testid=page-track] .tile-btn[data-page="5"]', { modifiers: ['Shift'] })
  await page.waitForFunction(() => document.querySelector('[data-testid=range-input]')?.value === '2-5', null, { timeout: 5000 }).catch(() => {})
  const field = await page.inputValue('[data-testid=range-input]')
  check('Shift-click picks 2-5, field follows', field === '2-5', field)
  check('count 4 of 14', /4 of 14/.test(await page.textContent('[data-testid=pick-counts]')))
  check('live line', /4 pages will be extracted into 1 PDF/.test(await waitLine(page, /4 pages/, 5000).catch(() => liveLine(page))), await liveLine(page))
  await page.fill('[data-testid=range-input]', '2-5, 9')
  check('typing selects tiles', (await page.$$('[data-testid=page-track] .tile.is-selected')).length === 5)
  await runTool(page)
  const d = await download(page)
  const t = await textAt(d.bytes, [1, 5])
  const s = await textAt(src('reports/pdfjs-tracemonkey.pdf'), [2, 9])
  check('5 pages: 2-5 and 9 in order', (await pages(d.bytes)) === 5 && wordCoverage(s[0], t[0]).ratio > 0.9 && wordCoverage(s[1], t[1]).ratio > 0.9, d.name)
})

add('g1-remove-shift-click-911', ['large/911-commission-report.pdf'], async ({ page, check }) => {
  await page.waitForSelector('[data-testid=page-track] .tile-btn[data-page="10"]')
  await page.click('[data-testid=page-track] .tile-btn[data-page="1"]')
  await page.click('[data-testid=page-track] .tile-btn[data-page="10"]', { modifiers: ['Shift'] })
  check('field 1-10', (await page.inputValue('[data-testid=range-input]')) === '1-10')
  check('live line', /10 pages will be removed from 911-commission-report.pdf, 575 left/.test(await liveLine(page)), await liveLine(page))
  await runTool(page)
  const d = await download(page)
  check('575 pages left', (await pages(d.bytes)) === 575, d.name)
})

add('g1-remove-all-blocked', ['reports/pdfjs-tracemonkey.pdf'], async ({ page, check }) => {
  await page.fill('[data-testid=range-input]', '1-14')
  check('removing every page is blocked', /Leave at least one/.test(await liveLine(page)) && (await page.isDisabled('[data-testid=run-btn]')), await liveLine(page))
})

add('g1-organize-presets', ['reports/pdfjs-tracemonkey.pdf'], async ({ page, check }) => {
  await page.waitForSelector('[data-testid=page-track]')
  await page.click('[data-preset=reverse]')
  check('reverse shows in the editor', (await page.getAttribute('[data-testid=page-track] .tile-btn >> nth=0', 'data-page')) === '14')
  await page.click('[data-preset=reverse]')
  await page.click('[data-preset=booklet]')
  const order = await page.$$eval('[data-testid=page-track] .tile-btn', (els) => els.map((e) => e.dataset.page))
  check('booklet: 16 tiles, blank first', order.length === 16 && order[0] === 'blank' && order[1] === '1', order.join(','))
  await page.click('[aria-label=Undo]') // back to the original order (reverse twice)
  await page.click('[data-preset=duplex]')
  const duplex = await page.$$eval('[data-testid=page-track] .tile-btn', (els) => els.map((e) => e.dataset.page))
  check('duplex order in the editor', duplex.slice(0, 4).join(',') === '1,14,2,13', duplex.join(','))
  await runTool(page)
  const d = await download(page)
  const t = await textAt(d.bytes, [2])
  const s = await textAt(src('reports/pdfjs-tracemonkey.pdf'), [14])
  const cov = wordCoverage(s[0], t[0]).ratio
  check('duplex output: page 2 is source page 14', (await pages(d.bytes)) === 14 && (cov == null || cov > 0.9), `${d.name}, coverage ${cov}`)
})

add('g1-rotate-landscape-only', ['reports/us-budget-2024.pdf'], async ({ page, check }) => {
  await page.click('[data-testid=rotate-which] [data-value=landscape]')
  await page.click('[data-testid=rotate-angle] >> text=Left')
  await runTool(page)
  check('note says 35 landscape pages', /35 landscape pages of 184/.test(await page.textContent('[data-testid=result-screen]')))
  const d = await download(page)
  const before = await rotations(src('reports/us-budget-2024.pdf'))
  const after = await rotations(d.bytes)
  const changed = after.filter((a, i) => a !== before[i]).length
  check('35 pages turned left, others untouched', changed === 35 && after.every((a, i) => a === before[i] || a === (before[i] + 270) % 360), `${changed} changed`)
})

add('g1-chain-split-rotate-merge', ['reports/pdfjs-tracemonkey.pdf'], async ({ page, check }) => {
  await page.fill('[data-testid=split-to] >> nth=0', '7')
  await page.click('[data-testid=split-add-range]')
  await page.fill('[data-testid=split-from] >> nth=1', '8')
  await runTool(page)
  check('split: 2 parts', (await page.$$('.result-list li')).length === 2)
  await page.click('[data-testid=next-rotate]')
  await page.waitForSelector('[data-testid=options-panel]')
  await page.click('[data-testid=file-card] >> nth=1 >> .fc-main') // only the first part
  check('rotate sees 1 file', /1 rotated PDF/.test(await liveLine(page)), await liveLine(page))
  await runTool(page)
  await page.click('[data-testid=result-back]')
  await page.click('[data-testid=tool-merge]')
  await page.click('.grid-toolbar .link >> text=Select all')
  await waitLine(page, /2 files, 14 pages/)
  await runTool(page)
  const d = await download(page)
  const r = await rotations(d.bytes)
  check('merged back: 14 pages, first 7 rotated', r.length === 14 && r.slice(0, 7).every((a) => a === 90) && r.slice(7).every((a) => a === 0), r.join(','))
})

add('g1-split-every-page-956', ['large/explorations-bible-lands-956pp-62MB.pdf'], async ({ page, check, metric }) => {
  memPage = page
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const heapNow = async () => (await cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0
  const idle = await chromeMemory()
  const heapIdle = await heapNow()
  let peak = idle
  let heapPeak = heapIdle
  let stop = false
  const poll = (async () => {
    while (!stop) {
      peak = Math.max(peak, await chromeMemory())
      heapPeak = Math.max(heapPeak, await heapNow().catch(() => 0))
      await new Promise((r) => setTimeout(r, 1500))
    }
  })()
  try {
    await page.click('[data-testid=split-tab] >> text=Pages')
    check('live line: 956 PDFs', /956 PDFs will be created/.test(await liveLine(page)), await liveLine(page))
    const t0 = Date.now()
    await page.click('[data-testid=run-btn]')
    // the page must stay responsive while the worker splits
    let worst = 0
    while (!(await page.$('[data-testid=result-screen], [data-testid=run-error]'))) {
      const t = Date.now()
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())))
      worst = Math.max(worst, Date.now() - t)
      await new Promise((r) => setTimeout(r, 500))
      if (Date.now() - t0 > 900_000) throw new Error('split timed out')
    }
    const err = await page.$('[data-testid=run-error]')
    if (err) throw new Error(await err.textContent())
    const tSplit = Date.now() - t0
    const peakSplit = peak
    const afterSplit = await chromeMemory()
    const t1 = Date.now()
    peak = 0
    const d = await download(page, 900_000)
    const tZip = Date.now() - t1
    const z = await unzip(d.bytes)
    check('zip holds 956 single-page PDFs', z.names.length === 956, `${z.names.length}`)
    const probeNames = ['explorations-bible-lands-956pp-62MB_1.pdf', 'explorations-bible-lands-956pp-62MB_500.pdf', 'explorations-bible-lands-956pp-62MB_956.pdf']
    let ok = 0
    for (const n of probeNames) if (z.names.includes(n) && (await pages(await z.read(n))) === 1) ok++
    check('sample parts open with 1 page', ok === 3, `${ok} of 3`)
    check('UI stays responsive (frame under 1 s)', worst < 1000, `worst frame wait ${worst} ms`)
    metric(`split ${(tSplit / 1000).toFixed(0)} s, zip ${(tZip / 1000).toFixed(0)} s, zip ${MB(d.bytes.length)}, browser private memory idle ${MB(idle)}, peak while splitting ${MB(peakSplit)}, after split ${MB(afterSplit)}, peak while zipping ${MB(peak)}, page JS heap peak ${MB(heapPeak)}`)
  } finally {
    stop = true
    await poll
  }
})

for (const c of CASES) {
  if (caseRe && !caseRe.test(c.id)) continue
  const route = c.id === 'g1-chain-split-rotate-merge' ? 'split' : c.id.split('-')[1]
  const t0 = Date.now()
  const checks = []
  const metrics = []
  const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail })
  let error = null
  let state = null
  try {
    state = await freshPage(route)
    await addFiles(state.page, c.files)
    await c.fn({ page: state.page, check, metric: (m) => metrics.push(m) })
    check('no page errors', state.errors.length === 0, state.errors.slice(0, 2).join(' | '))
  } catch (err) {
    error = String(err.message ?? err).split('\n')[0]
  }
  await state?.context.close().catch(() => {})
  const pass = !error && checks.every((x) => x.ok)
  results.push({ id: c.id, files: c.files, pass, ms: Date.now() - t0, error, checks, metrics })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.id}  ${((Date.now() - t0) / 1000).toFixed(1)}s${error ? `  ${error}` : ''}`)
  for (const x of checks) if (!x.ok || process.argv.includes('--verbose')) console.log(`      ${x.ok ? 'ok ' : 'BAD'} ${x.name}${x.detail ? `: ${x.detail}` : ''}`)
  for (const m of metrics) console.log(`      ${m}`)
}
await browser.close()
await dev?.server.close()
if (arg('json')) writeFileSync(arg('json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2))
const failed = results.filter((r) => !r.pass).length
console.log(failed ? `${failed} of ${results.length} failed` : `all ${results.length} passed`)
process.exit(failed ? 1 : 0)
