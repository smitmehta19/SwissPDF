// Edit-group chain on a real IRS form, all in the shell: fill a field in
// Forms, continue with Page numbers, continue with Redact (search the typed
// value and a printed phrase), download, then check the file in Node.
// Usage: node scripts/corpus-test/g3-chain.mjs [--url http://localhost:4180/SwissPDF/]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'
import { formFacts, textOf, wordCoverage } from './validate.mjs'

const REL = 'forms/irs-fw9.pdf'
const VALUE = 'Chain Tester'
const PHRASE = 'Request for Taxpayer'
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
const run = async (page) => {
  await page.waitForSelector('[data-testid=run-btn]:not([disabled])', { timeout: 30_000 })
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=result-screen]', { timeout: 180_000 })
  return page.textContent('[data-testid=result-screen]')
}

try {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
  await page.goto(`${base}/#/forms`, { waitUntil: 'load', timeout: 120_000 })
  await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
  await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })
  await page.setInputFiles('[data-testid=add-files-input]', join(ROOT, 'test-corpus', REL))

  // 1. forms: type into the first free text field on page 1
  const field = '[data-testid=form-canvas] input[data-testid=pdf-field]:not([type=checkbox]):not([type=radio]):not([disabled]):not([maxlength])'
  await page.waitForSelector(field, { timeout: 60_000 })
  await page.fill(`${field} >> nth=0`, VALUE)
  const r1 = await run(page)
  check('forms: filled and the XFA copy removed', /1 value filled/.test(r1) && /XFA copy removed/.test(r1), r1.replace(/\s+/g, ' ').slice(0, 160))

  // 2. continue with page numbers, "Page 1 of 9" style
  await page.click('[data-testid=next-pagenumbers]')
  await page.waitForSelector('[data-testid=pn-stage] img', { timeout: 60_000 })
  await page.click('[data-testid=pn-preset] [data-value=n-of-p]')
  const preview = await page.textContent('[data-testid=pn-preview]')
  check('page numbers: the filled file carried over, preview on the canvas', preview === 'Page 1 of 6', preview)
  await run(page)

  // 3. continue with redact: the typed value and a printed phrase
  await page.click('[data-testid=next-redact]')
  await page.waitForSelector('[data-testid=redact-stage] img', { timeout: 60_000 })
  await page.fill('[data-testid=redact-search]', `${VALUE}\n${PHRASE}`)
  await page.waitForFunction(() => /[1-9]\d* match/.test(document.querySelector('[data-testid=redact-hits]')?.textContent ?? ''), null, { timeout: 30_000 })
  const hits = await page.textContent('[data-testid=redact-hits]')
  await run(page)
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('[data-testid=result-download]')])
  const out = new Uint8Array(readFileSync(await dl.path()))
  // names keep one tool suffix (the last tool), not the whole chain
  check('download named after the last tool', dl.suggestedFilename() === 'irs-fw9-numbered-redacted.pdf' || dl.suggestedFilename() === 'irs-fw9-redacted.pdf', dl.suggestedFilename())

  // 4. the file itself
  const texts = await textOf(out)
  const all = texts.join(' ')
  const numbered = texts.every((t, i) => t.includes(`Page ${i + 1} of 6`))
  check('page numbers on all 6 pages', texts.length === 6 && numbered)
  const facts = await formFacts(out)
  const leaked = Object.values(facts.values).some((v) => String(v ?? '').includes(VALUE))
  check(`typed value "${VALUE}" gone from fields, text and bytes`, !leaked && !all.includes(VALUE) && !Buffer.from(out).includes(VALUE), hits)
  check(`printed phrase "${PHRASE}" gone`, !all.replace(/\s+/g, ' ').includes(PHRASE))
  const src = await textOf(readFileSync(join(ROOT, 'test-corpus', REL)))
  const kept = wordCoverage(src.join(' ').replace(new RegExp(PHRASE, 'g'), ' '), all).ratio
  check('rest of the form text kept as text', kept > 0.95, kept?.toFixed(3))
  check('form still has its other fields, no XFA', facts.count > 15 && !facts.hasXfa, `${facts.count} fields, XFA ${facts.hasXfa}`)

  await page.click('[data-testid=result-back]')
  await page.click('[data-testid=mode-files]')
  const ver = await page.textContent('[data-testid=file-card] .fc-version').catch(() => '')
  check('workspace keeps one file at version 4', ver === 'v4', ver)
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await browser.close()
  await dev?.server.close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
