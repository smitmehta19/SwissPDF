// Cancel stops the LibreOffice engine (review integ-1 #8), through the real
// shell: Word to PDF, Cancel while the engine loads, Cancel mid-conversion,
// then a normal run that must work (the engine starts again from the cache).
// Usage: node scripts/corpus-test/fix1-office-cancel.mjs [--url <app>] [--profile <dir>]
//   --profile: browser profile dir, kept between runs so the 55 MB engine
//   stays in Cache Storage (default: a fresh temp dir).
import { chromium } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'

const opt = (k) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : null
}
const DOC = join(ROOT, 'test-corpus', 'office', 'poi-VariousPictures.docx')

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}

const dev = opt('url') ? null : await startServer()
const base = (opt('url') ?? dev.url).replace(/\/$/, '')
const profile = opt('profile') ?? mkdtempSync(join(tmpdir(), 'swisspdf-lo-'))
const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1440, height: 960 }, acceptDownloads: true })
const page = ctx.pages()[0] ?? (await ctx.newPage())
page.on('pageerror', (e) => check('no page error', false, e.message))
await page.goto(`${base}/`, { waitUntil: 'load' })
await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
await page.waitForSelector('[data-testid=tool-panel]', { state: 'attached', timeout: 60_000 })
// tool groups start folded since S3: open the tool by its route
await page.goto(`${base}/#/word2pdf`, { waitUntil: 'load' })
await page.waitForSelector('[data-testid=options-panel]')
await page.setInputFiles('[data-testid=add-files-input]', [DOC])
await page.waitForFunction(() => document.querySelectorAll('[data-testid=file-card]').length >= 1, null, { timeout: 60_000 })

const label = () => page.evaluate(() => document.querySelector('[data-testid=job-progress]')?.textContent ?? '')
const engineState = () =>
  page.evaluate(async () => {
    const cached = (await Promise.all((await caches.keys()).map(async (n) => (await (await caches.open(n)).keys()).length))).reduce((a, b) => a + b, 0)
    const st = globalThis.__swisspdfLibreOffice
    return { engine: !!st?.engine, booting: !!st?.boot, frames: document.querySelectorAll('iframe[src*="lo_frame"]').length, stats: st?.stats ?? {}, cached }
  })

// Clicks Run, waits until the progress label matches `re`, presses Cancel.
// Returns ms from Cancel until the job is gone, or null.
async function cancelWhen(re, what) {
  await page.click('[data-testid=run-btn]')
  await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid=job-progress]')?.textContent ?? ''), re.source, {
    timeout: 600_000,
    polling: 20,
  })
  const at = (await label()).trim()
  const t0 = Date.now()
  await page.click('[data-testid=cancel-btn]')
  await page.waitForSelector('[data-testid=job-progress]', { state: 'detached', timeout: 60_000 })
  const ms = Date.now() - t0
  const err = await page.$('[data-testid=run-error]')
  check(`${what}: cancelled without an error`, !err, err ? await err.textContent() : `at "${at}"`)
  check(`${what}: job gone within 2 s`, ms < 2000, `${ms} ms`)
  const s = await engineState()
  check(`${what}: engine frame killed`, !s.engine && s.frames === 0 && !s.booting, JSON.stringify(s))
  return ms
}

try {
  await cancelWhen(/Office engine/, 'cancel while the engine loads')
  // let the next run get to the conversion itself
  await cancelWhen(/converting/, 'cancel mid-conversion')

  const t0 = Date.now()
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=result-screen], [data-testid=run-error]', { timeout: 900_000 })
  const err = await page.$('[data-testid=run-error]')
  check('next run converts', !err, err ? await err.textContent() : `${Date.now() - t0} ms`)
  const s = await engineState()
  check('next run started the engine from the cache', s.stats.fromCache === true, `${JSON.stringify(s.stats)}, ${s.cached} cached files`)
} finally {
  await ctx.close()
  await dev?.server.close()
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
