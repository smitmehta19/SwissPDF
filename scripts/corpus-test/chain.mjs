// Shell chain test: merge two real reports, compress the merged file and
// download it without adding files again, then reload and check the
// workspace is still there. Also checks undo, cancel and the page editor.
// Usage: node scripts/corpus-test/chain.mjs [--url http://localhost:4180/SwissPDF/]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { startServer, ROOT } from './server.mjs'

const CORPUS = join(ROOT, 'test-corpus')
const A = 'reports/pdfjs-tracemonkey.pdf' // 14 pages
const B = 'reports/arxiv-1810.04805-bert.pdf' // 16 pages
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}

const at = process.argv.indexOf('--url')
const given = at > 0 ? process.argv[at + 1] : null
const dev = given ? null : await startServer()
const base = (given ?? dev.url).replace(/\/$/, '')
const browser = await chromium.launch()
const metas = (page) => page.$$eval('[data-testid=file-card] .file-name', (els) => els.map((e) => e.textContent))
const waitReady = (page, n) =>
  page.waitForFunction(
    (count) => {
      const m = [...document.querySelectorAll('[data-testid=file-card]')].map((c) => c.querySelector('.file-meta')?.textContent ?? '')
      return m.length === count && m.every((t) => /^\d+ pages?/.test(t))
    },
    n,
    { timeout: 120_000 },
  )
async function download(page, sel) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click(sel)])
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(readFileSync(await dl.path())) }
}

try {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
  let worker = false
  page.on('request', (r) => /opsWorker/.test(r.url()) && (worker = true))
  await page.goto(`${base}/#/merge`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
  await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })

  // 1. merge
  await page.setInputFiles('[data-testid=add-files-input]', [join(CORPUS, A), join(CORPUS, B)])
  await waitReady(page, 2)
  check('merge: live line counts files and pages', /2 files, 30 pages/.test(await page.textContent('[data-testid=live-line]')), await page.textContent('[data-testid=live-line]'))
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
  const merged = await download(page, '[data-testid=result-download]')
  const mergedPages = (await PDFDocument.load(merged.bytes)).getPageCount()
  check('merge: download is the merged PDF', merged.name === 'merged.pdf' && mergedPages === 30, `${merged.name}, ${mergedPages} pages`)

  // 2. continue with compress, no re-adding
  await page.click('[data-testid=next-compress]')
  await page.waitForSelector('[data-testid=options-panel]')
  const names = await metas(page)
  check('compress: merged file carried over, nothing re-added', names.length === 1 && names[0] === 'merged.pdf', names.join(', '))
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=result-screen]', { timeout: 300_000 })
  const comp = await download(page, '[data-testid=result-download]')
  const compPages = (await PDFDocument.load(comp.bytes)).getPageCount()
  check('compress: download is compressed, 30 pages, not larger', comp.name === 'merged-compressed.pdf' && compPages === 30 && comp.bytes.length <= merged.bytes.length, `${comp.name}, ${compPages} pages, ${merged.bytes.length} -> ${comp.bytes.length}`)

  // 3. reload: files still there, as version 3 with its history
  await page.reload({ waitUntil: 'load' })
  await page.goto(`${base}/#/compress`, { waitUntil: 'load' })
  await waitReady(page, 1)
  const after = await metas(page)
  const ver = await page.textContent('[data-testid=file-card] .fc-version').catch(() => '')
  check('reload: workspace file survives', after.length === 1 && after[0] === 'merged-compressed.pdf', `${after.join(', ')} ${ver}`)
  check('reload: version chain kept', ver === 'v3', ver)

  // 4. undo back through the versions
  await page.click('[data-testid=file-card] [aria-label^="Undo last change"]')
  await page.click('[data-testid=file-confirm-ok]') // undo asks first
  await page.waitForFunction(() => document.querySelector('[data-testid=file-card] .file-name')?.textContent === 'merged.pdf')
  await page.click('[data-testid=file-card] [aria-label^="Undo last change"]')
  await page.click('[data-testid=file-confirm-ok]') // undo asks first
  await waitReady(page, 2)
  const undone = await metas(page)
  check('undo: back to the two original files', undone.join('|') === `${A.split('/').pop()}|${B.split('/').pop()}`, undone.join(', '))

  // 5. cancel a long job (Maximum compress renders every page)
  await page.click('[data-testid=compress-mode] [data-value=raster]')
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=job-progress]')
  await page.waitForTimeout(800)
  await page.click('[data-testid=cancel-btn]')
  await page.waitForSelector('[data-testid=run-btn]', { timeout: 30_000 })
  const stillTwo = await metas(page)
  check('cancel: job stops, no output, inputs untouched', stillTwo.length === 2 && !(await page.$('[data-testid=result-screen]')), stillTwo.join(', '))

  // 6. page editor: delete page 1 of the first file, apply -> new version
  await page.click('[data-testid=file-card] >> nth=1 >> .fc-main') // deselect the second file
  await page.click('[data-testid=mode-pages]')
  await page.waitForSelector('[data-testid=page-track]')
  await page.click('[data-testid=page-track] .tile-btn[data-page="1"]')
  await page.click('[aria-label=Delete]')
  await page.click('[data-testid=page-track] .tile-btn[data-page="2"]')
  await page.click('[aria-label="Rotate right"]')
  await page.click('[data-testid=pe-apply]')
  await page.waitForFunction(() => /new version/.test(document.querySelector('.page-editor .notice')?.textContent ?? ''), null, { timeout: 60_000 })
  await page.click('[data-testid=mode-files]')
  const firstMeta = await page.textContent('[data-testid=file-card] .file-meta')
  check('page editor: delete applied as a new version', /^13 pages/.test(firstMeta), firstMeta)

  // 7. wipe all
  await page.click('[data-testid=wipe-all]')
  await page.click('[data-testid=confirm-ok]')
  await page.waitForSelector('[data-testid=start-area]')
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-testid=start-area]', { timeout: 30_000 })
  check('wipe all: workspace empty after reload', (await metas(page)).length === 0)
  check('ops ran in the Web Worker', worker)
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
  await dev?.server.close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
