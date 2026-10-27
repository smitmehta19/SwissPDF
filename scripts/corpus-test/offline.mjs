// The built app works offline after one visit, and still picks up a new
// deploy online. Serves dist/ with scripts/serve-pages-sim.mjs (no COOP/COEP
// headers, like GitHub Pages; it takes the test-run lock), then:
//  1. first visit: isolation by the service worker, precache complete, one
//     OCR run (English) so the language data is cached by use;
//  2. offline (server drops every connection + Playwright offline): a new
//     tab loads the app, Merge works, OCR works, the ops worker is served by
//     the service worker;
//  3. online again, a new build (copy of dist with a new chunk and a new
//     worker id) is served: one reload shows it, the old cache is dropped.
// Usage: npm run build && node scripts/corpus-test/offline.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { ROOT } from './server.mjs'
import { textOf } from './validate.mjs'

const DIST = join(ROOT, 'dist')
const MERGE = ['reports/pdfjs-tracemonkey.pdf', 'reports/arxiv-1810.04805-bert.pdf'].map((r) => join(ROOT, 'test-corpus', r))
const SCAN = join(ROOT, 'test-corpus', 'scanned', 'fax-jean-schmidt-doe.pdf')

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}

const swOf = (dir) => {
  const src = readFileSync(join(dir, 'coi-serviceworker.js'), 'utf8')
  return { src, build: src.match(/const BUILD = '([^']+)'/)?.[1], list: JSON.parse(src.match(/const PRECACHE = (\[.*?\])/)?.[1] ?? '[]') }
}
const A = swOf(DIST)
check('built worker has a build id and a precache list', /^[0-9a-f]{12}$/.test(A.build ?? '') && A.list.length > 20, `${A.build}, ${A.list.length} files`)

// build B: same app plus one new chunk, new worker id (what a redeploy does)
const distB = mkdtempSync(join(tmpdir(), 'swisspdf-buildB-'))
cpSync(DIST, distB, { recursive: true })
const MARK = 'assets/marker-Bq1w2e3r.js'
writeFileSync(join(distB, MARK), "window.__swissBuild = 'B'\n")
const indexB = readFileSync(join(distB, 'index.html'), 'utf8').replace('</head>', `<script type="module" src="/SwissPDF/${MARK}"></script></head>`)
writeFileSync(join(distB, 'index.html'), indexB)
const buildB = A.build.slice(0, 11) + (A.build.endsWith('b') ? 'c' : 'b')
writeFileSync(join(distB, 'coi-serviceworker.js'), A.src.replace(`'${A.build}'`, `'${buildB}'`).replace('"coi-serviceworker.js",', `"coi-serviceworker.js","${MARK}",`))

// the server, driven through its stdin
const srv = spawn(process.execPath, [join(ROOT, 'scripts', 'serve-pages-sim.mjs')], { env: { ...process.env, PORT: '0' }, stdio: ['pipe', 'pipe', 'inherit'] })
let out = ''
const waitOut = (re) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`server: no "${re}"`)), 50 * 60_000)
    const look = () => {
      const m = out.match(re)
      if (m) {
        clearTimeout(t)
        srv.stdout.off('data', look)
        res(m)
      }
    }
    srv.stdout.on('data', look)
    look()
  })
srv.stdout.on('data', (d) => {
  out += d
  process.stdout.write(`  [server] ${d}`)
})
const say = async (line) => {
  out = ''
  srv.stdin.write(line + '\n')
  await waitOut(new RegExp(`pages-sim: ${line.split(' ')[0]}`))
}
const base = (await waitOut(/pages-sim on (http:\/\/localhost:\d+\/SwissPDF\/)/))[1]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' })
const errors = []
const watch = (page, tag) => page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`))

const cacheState = (page) =>
  page.evaluate(async () => {
    const out = {}
    for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname)
    return out
  })

// polls the cache state from Node (an async page predicate would count as true at once)
async function until(page, ok, ms = 180_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (ok(await cacheState(page))) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function openApp(page, hash) {
  await page.goto(`${base}#/${hash}`, { waitUntil: 'load', timeout: 120_000 })
  // the first visit reloads once when the worker takes over
  for (let i = 0; ; i++) {
    try {
      await page.waitForFunction(() => window.crossOriginIsolated && navigator.serviceWorker.controller, null, { timeout: 60_000 })
      break
    } catch (e) {
      if (i > 2) throw e
      await page.waitForLoadState('load')
    }
  }
  await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })
}

async function runTool(page, files, setup, timeout = 600_000) {
  for (const f of files) {
    const n = await page.$$eval('[data-testid=file-card]', (l) => l.length)
    await page.setInputFiles('[data-testid=add-files-input]', [f])
    await page.waitForFunction(
      (k) => {
        const m = [...document.querySelectorAll('[data-testid=file-card] .file-meta')].map((e) => e.textContent)
        return m.length > k && m.every((t) => !/Reading/.test(t))
      },
      n,
      { timeout: 180_000 },
    )
  }
  await page.waitForSelector('[data-testid=options-panel]', { timeout: 30_000 })
  await setup?.(page)
  await page.waitForSelector('[data-testid=run-btn]:not([disabled])', { timeout: 30_000 })
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=result-screen], [data-testid=run-error]', { timeout })
  const err = await page.$('[data-testid=run-error]')
  if (err) throw new Error(`run failed: ${await err.textContent()}`)
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click('[data-testid=result-download]')])
  return new Uint8Array(readFileSync(await dl.path()))
}
const ocrSetup = (page) => page.click('[data-testid=ocr-text-pages] [role=radio]:has-text("Read every page")')
const ocrChars = async (bytes) => (await textOf(bytes)).join(' ').replace(/\s/g, '').length

try {
  // 1. first visit, online
  const p1 = await ctx.newPage()
  watch(p1, 'first visit')
  await openApp(p1, 'ocr')
  check('first visit: isolated by the service worker', await p1.evaluate(() => window.crossOriginIsolated))
  const want = A.list.map((p) => new URL(p, base).pathname)
  await until(p1, (c) => (c[`swisspdf-app-${A.build}`] ?? []).length >= want.length)
  let caches1 = await cacheState(p1)
  const own = caches1[`swisspdf-app-${A.build}`] ?? []
  const missing = want.filter((p) => !own.includes(p))
  check('precache complete', missing.length === 0, missing.length ? `missing ${missing.slice(0, 5).join(', ')}` : `${own.length} entries`)
  const ocr1 = await runTool(p1, [SCAN], ocrSetup, 900_000)
  check('first visit: OCR (English) works', (await ocrChars(ocr1)) >= 50)
  caches1 = await cacheState(p1)
  const used = Object.values(caches1).flat()
  check('OCR files cached by use', ['tessdata/eng.traineddata.gz', 'tesseract/worker.min.js'].every((f) => used.some((p) => p.endsWith(f))) && used.some((p) => /tesseract-core.*\.wasm\.js$/.test(p)), used.filter((p) => /tess/.test(p)).join(', '))
  check('no LibreOffice engine file in the app cache', !used.some((p) => /soffice|zetaoffice/.test(p)))
  await p1.close()

  // 2. offline: new tabs
  await say('offline')
  await ctx.setOffline(true)
  const p2 = await ctx.newPage()
  watch(p2, 'offline merge')
  const fromNet = []
  const workerHits = []
  p2.on('response', (r) => {
    if (!r.fromServiceWorker()) fromNet.push(r.url())
    if (/opsWorker|worker/i.test(r.url())) workerHits.push(`${r.url().split('/').pop()} sw=${r.fromServiceWorker()}`)
  })
  await openApp(p2, 'merge')
  check('offline: new tab loads the app, isolated', await p2.evaluate(() => window.crossOriginIsolated && !!document.querySelector('[data-testid=tool-panel]')))
  const merged = await runTool(p2, MERGE)
  const counts = await Promise.all(MERGE.map(async (f) => (await PDFDocument.load(readFileSync(f), { updateMetadata: false })).getPageCount()))
  const got = (await PDFDocument.load(merged, { updateMetadata: false })).getPageCount()
  check('offline: Merge works', got === counts[0] + counts[1], `${got} pages (${counts.join(' + ')})`)
  check('offline: ops worker served by the service worker', workerHits.length > 0 && workerHits.every((w) => w.endsWith('sw=true')), workerHits.join(', '))
  check('offline: nothing answered from the network', fromNet.filter((u) => u.startsWith('http')).length === 0, fromNet.slice(0, 5).join(', '))
  await p2.close()

  const p3 = await ctx.newPage()
  watch(p3, 'offline ocr')
  await openApp(p3, 'ocr')
  const ocr3 = await runTool(p3, [SCAN], ocrSetup, 900_000)
  const chars = await ocrChars(ocr3)
  check('offline: OCR works for a language loaded before', chars >= 50, `${chars} chars`)

  // 3. online again, new deploy
  await ctx.setOffline(false)
  await say('online')
  await say(`dist ${distB}`)
  await p3.reload({ waitUntil: 'load' })
  await p3.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 })
  check('new build: one reload shows it', (await p3.evaluate(() => window.__swissBuild)) === 'B')
  await until(p3, (c) => !!c[`swisspdf-app-${buildB}`] && !c[`swisspdf-app-${A.build}`])
  const caches3 = await cacheState(p3)
  const states = await p3.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    return ['installing', 'waiting', 'active'].map((k) => `${k}=${reg?.[k]?.state ?? '-'}`).join(' ')
  })
  check('new build: its own cache, old build cache dropped', !!caches3[`swisspdf-app-${buildB}`] && !caches3[`swisspdf-app-${A.build}`], `${Object.keys(caches3).join(', ')} (${states})`)
  check('new build: language data kept across the deploy', (caches3['swisspdf-data'] ?? []).some((p) => p.endsWith('tessdata/eng.traineddata.gz')), (caches3['swisspdf-data'] ?? []).join(', '))
  check('new build: new chunk cached', (caches3[`swisspdf-app-${buildB}`] ?? []).some((p) => p.endsWith(MARK)))
  const swUrl = await p3.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL)
  check('new build: worker active', !!swUrl, swUrl)
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  check('run', false, e.message.split('\n')[0])
} finally {
  await browser.close()
  srv.kill()
  rmSync(distB, { recursive: true, force: true })
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
