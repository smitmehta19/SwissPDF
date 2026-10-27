// Network log of one OCR run in the shell: every request the page and its
// workers make while OCR loads and runs (English + German + Chinese, auto
// rotate on). Passes only when nothing leaves the app origin and the engine
// and language files come from it.
// Usage: node scripts/corpus-test/ocr-network.mjs [--url http://localhost:4180/SwissPDF/]
import { chromium } from 'playwright'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'

const at = process.argv.indexOf('--url')
const given = at > 0 ? process.argv[at + 1] : null
const dev = given ? null : await startServer()
const base = (given ?? dev.url).replace(/\/$/, '')
const origin = new URL(base).origin
const browser = await chromium.launch()
let ok = false
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${base}/#/ocr`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
  await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })
  await page.setInputFiles('[data-testid=add-files-input]', [join(ROOT, 'test-corpus', 'scanned/letter-to-benjamin-glover.pdf')])
  await page.waitForFunction(() => /^2 pages/.test(document.querySelector('[data-testid=file-card] .file-meta')?.textContent ?? ''), null, { timeout: 120_000 })
  // log from here: the OCR run only (context level, so worker requests count too)
  const log = []
  ctx.on('request', (r) => log.push(r.url()))
  for (const lang of ['deu', 'chi_sim']) await page.click(`[data-testid=ocr-langs] input[data-lang=${lang}]`)
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=result-screen]', { timeout: 600_000 })
  const outside = log.filter((u) => !u.startsWith(origin) && !/^(data|blob):/.test(u))
  const engine = log.filter((u) => /\/tesseract\/|\/tessdata\//.test(u)).map((u) => u.replace(origin, ''))
  console.log(`requests during OCR: ${log.length}`)
  for (const u of engine) console.log(`  same origin: ${u}`)
  console.log(`cross-origin requests: ${outside.length}${outside.length ? `\n  ${outside.join('\n  ')}` : ''}`)
  const need = ['worker.min.js', 'eng.traineddata.gz', 'deu.traineddata.gz', 'chi_sim.traineddata.gz', 'osd.traineddata.gz']
  const missing = need.filter((n) => !engine.some((u) => u.endsWith(n)))
  if (!engine.some((u) => /tesseract-core(-simd)?\.wasm\.js$/.test(u))) missing.push('tesseract core')
  if (missing.length) console.log(`not loaded from the app origin: ${missing.join(', ')}`)
  ok = outside.length === 0 && missing.length === 0
  console.log(ok ? 'PASS  OCR loads only from the app origin' : 'FAIL')
} finally {
  await browser.close()
  await dev?.server.close()
}
process.exit(ok ? 0 : 1)
