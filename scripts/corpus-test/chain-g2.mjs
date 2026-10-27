// G2 shell chain on a real scan: OCR -> Protect -> Unlock -> Compare with the
// original, through the real UI, checking every download in Node. Then OCR
// again with the network off (offline after first load), and cancel.
// Usage: node scripts/corpus-test/chain-g2.mjs [--url http://localhost:4180/SwissPDF/]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'
import { openMupdf, textOf } from './validate.mjs'

const CORPUS = join(ROOT, 'test-corpus')
const SCAN = 'scanned/letter-to-benjamin-glover.pdf' // 2 pages, no text layer
const PW = 'Chain-Pass-1!'
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}

const at = process.argv.indexOf('--url')
const given = at > 0 ? process.argv[at + 1] : null
const dev = given ? null : await startServer()
const base = (given ?? dev.url).replace(/\/$/, '')
const origin = new URL(base).origin
const browser = await chromium.launch()
async function download(page) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click('[data-testid=result-download]')])
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(readFileSync(await dl.path())) }
}
const cards = (page) => page.$$eval('[data-testid=file-card]', (els) => els.map((c) => `${c.querySelector('.file-name')?.textContent} | ${c.querySelector('.file-meta')?.textContent}`))
const waitCards = (page, test, what) =>
  page.waitForFunction(
    (src) => {
      const list = [...document.querySelectorAll('[data-testid=file-card]')].map((c) => c.querySelector('.file-meta')?.textContent ?? '')
      return new Function('list', `return ${src}`)(list)
    },
    test,
    { timeout: 120_000 },
  ).catch(() => {
    throw new Error(`waiting for ${what}`)
  })
const runAndWait = async (page, ms = 600_000) => {
  await page.click('[data-testid=run-btn]')
  await Promise.race([
    page.waitForSelector('[data-testid=result-screen]', { timeout: ms }),
    page.waitForSelector('[data-testid=run-error]', { timeout: ms }).then(async () => {
      throw new Error(`run failed: ${await page.textContent('[data-testid=run-error]')}`)
    }),
  ])
}

try {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  const errors = []
  const external = []
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
  page.on('request', (r) => !r.url().startsWith(origin) && !/^(data|blob):/.test(r.url()) && external.push(r.url()))
  await page.goto(`${base}/#/ocr`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
  await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })

  // 1. OCR the scan
  await page.setInputFiles('[data-testid=add-files-input]', [join(CORPUS, SCAN)])
  await waitCards(page, "list.length === 1 && /^2 pages/.test(list[0])", 'the scan')
  let sawProgress = false
  const poll = setInterval(async () => {
    const t = await page.textContent('[data-testid=job-progress]').catch(() => null)
    if (t && /recogni/i.test(t)) sawProgress = true
  }, 300)
  await runAndWait(page)
  clearInterval(poll)
  check('ocr: progress shows the page being read', sawProgress)
  const note = await page.textContent('.result-note').catch(() => '')
  check('ocr: result says how many words', /\d+ words recognised on 2 pages/.test(note), note)
  const ocr = await download(page)
  const ocrText = (await textOf(ocr.bytes)).join(' ')
  check('ocr: download is searchable', ocr.name === 'letter-to-benjamin-glover-ocr.pdf' && ocrText.replace(/\s/g, '').length > 100, `${ocr.name}, ${ocrText.length} chars`)

  // 2. continue with Protect
  await page.click('[data-testid=next-protect]')
  await page.waitForSelector('[data-testid=options-panel]')
  await page.fill('[data-testid=pw-input]', PW)
  await page.fill('[data-testid=pw-confirm]', PW)
  const ticks = await page.$$eval('[data-testid=pw-checklist] li.is-ok', (l) => l.length)
  check('protect: strength checklist all green', ticks === 5, `${ticks} of 5`)
  await runAndWait(page)
  const prot = await download(page)
  const m = openMupdf(prot.bytes, PW)
  check('protect: download needs the password, and it opens', m.needsPassword && m.authOk === true && /AES/.test(m.doc.getMetaData('encryption') ?? ''), `${prot.name} ${m.doc.getMetaData('encryption')}`)
  check('protect: wrong password refused', openMupdf(prot.bytes, 'wrong').authOk === false)

  // 3. continue with Unlock: the locked file is offered with a password field
  await page.click('[data-testid=next-unlock]')
  await page.waitForSelector('[data-testid=unlock-file-pw]', { timeout: 30_000 })
  check('unlock: locked workspace file listed', (await cards(page)).some((c) => /Password needed/.test(c)), (await cards(page)).join('; '))
  await page.fill('[data-testid=unlock-file-pw]', 'wrong-one')
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=run-error]', { timeout: 60_000 })
  check('unlock: wrong password refused with a clear message', /Wrong password/.test(await page.textContent('[data-testid=run-error]')), await page.textContent('[data-testid=run-error]'))
  await page.fill('[data-testid=unlock-file-pw]', PW)
  await runAndWait(page)
  const unl = await download(page)
  const u = openMupdf(unl.bytes)
  const unlText = (await textOf(unl.bytes)).join(' ')
  check('unlock: download is open, text layer intact', !u.needsPassword && (u.doc.getMetaData('encryption') ?? 'None') === 'None' && unlText === ocrText, `${unl.name}, ${unlText.length} chars`)

  // 4. compare with the original scan (added again)
  await page.click('[data-testid=result-back]')
  await page.setInputFiles('[data-testid=add-files-input]', [join(CORPUS, SCAN)])
  await waitCards(page, 'list.length === 2 && list.every((t) => /^2 pages/.test(t))', 'two files')
  await page.goto(`${base}/#/compare`, { waitUntil: 'load' })
  await page.waitForSelector('[data-testid=options-panel]')
  await waitCards(page, 'list.length === 2 && list.every((t) => /^2 pages/.test(t))', 'two files after reload')
  // workspace order: the unlocked OCR file first; make the plain scan the original
  await page.click('[data-testid=compare-swap]')
  await runAndWait(page)
  const sum = await page.textContent('[data-testid=compare-summary]')
  const label = await page.textContent('[data-testid=compare-page-label]')
  check('compare: OCR text shows as added, nothing removed', /\d+ words added, 0 removed/.test(sum.replace(/\s+/g, ' ')), sum)
  check('compare: pages paired 1 to 1', /Original p\. 1, changed p\. 1/.test(label), label)
  await page.click('[data-testid=compare-view] [role=radio]:has-text("Overlay")')
  await page.waitForSelector('[data-testid=compare-overlay]')
  await page.waitForFunction(() => /%/.test(document.querySelector('.g2-overlay figcaption')?.textContent ?? ''), null, { timeout: 60_000 })
  const px = await page.textContent('.g2-overlay figcaption')
  const share = parseFloat(px.match(/([\d.]+)%/)?.[1] ?? '100')
  check('compare overlay: invisible OCR text changes no pixels', share < 0.5, px)
  const rep = await download(page)
  check('compare: report PDF downloads', /-compared\.pdf$/.test(rep.name) && (await textOf(rep.bytes))[0].includes('Comparison report'), rep.name)

  // 5. offline: OCR again with the network off, after a cancel killed the engine
  await ctx.setOffline(true)
  await page.evaluate(() => (location.hash = '#/ocr'))
  await page.click('[data-testid=result-back]').catch(() => {})
  await page.waitForSelector('[data-testid=options-panel]', { timeout: 30_000 })
  await page.click('[data-testid=ocr-text-pages] [role=radio]:has-text("Read every page")')
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=cancel-btn]')
  await page.waitForTimeout(2500)
  const t0 = Date.now()
  await page.click('[data-testid=cancel-btn]')
  await page.waitForSelector('[data-testid=run-btn]', { timeout: 30_000 })
  check('ocr cancel: stops at once', Date.now() - t0 < 1500, `${Date.now() - t0} ms`)
  await runAndWait(page)
  const off = await page.textContent('.result-note').catch(() => '')
  check('ocr offline: runs with the network off', /\d+ words recognised/.test(off), off)
  await ctx.setOffline(false)

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  check('no requests outside the app origin', external.length === 0, external.slice(0, 3).join(', '))
  await ctx.close()
} catch (err) {
  failed++
  console.log(`FAIL  chain stopped: ${err.message.split('\n')[0]}`)
} finally {
  await browser.close()
  await dev?.server.close()
}
console.log(failed ? `${failed} check(s) failed` : 'G2 chain passed')
process.exit(failed ? 1 : 0)
