// Fix-1 shell checks (review findings 4, 5, 13, 17, 18, 24 and the phone
// Run bar): wipe during a running job, a quota error in the middle of a
// change, hidden orphan versions, Run double click, card names, skip links,
// phone Run bar, Options sheet and privacy chip.
// Usage: node scripts/corpus-test/fix1-shell.mjs [--url http://localhost:4180/SwissPDF/]
import { chromium } from 'playwright'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'

const CORPUS = join(ROOT, 'test-corpus')
const A = join(CORPUS, 'reports/pdfjs-tracemonkey.pdf') // 14 pages
const B = join(CORPUS, 'reports/arxiv-1810.04805-bert.pdf') // 16 pages
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
const names = (page) => page.$$eval('[data-testid=file-card] .file-name', (els) => els.map((e) => e.textContent))
const waitReady = (page, n) =>
  page.waitForFunction(
    (count) => {
      const m = [...document.querySelectorAll('[data-testid=file-card]')].map((c) => c.querySelector('.file-meta')?.textContent ?? '')
      return m.length === count && m.every((t) => /^\d+ pages?/.test(t))
    },
    n,
    { timeout: 120_000 },
  )
// every record in the IndexedDB workspace: [{ name, version, isLeaf }]
const dbRecords = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('swisspdf', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const all = req.result.transaction('files').objectStore('files').getAll()
          all.onsuccess = () => {
            resolve(all.result.map((r) => ({ name: r.name, version: r.version, isLeaf: r.isLeaf })))
            req.result.close()
          }
        }
      }),
  )

async function open(width = 1440, hash = '#/compress') {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width, height: width < 500 ? 844 : 1000 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
  await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })
  return { ctx, page, errors }
}

try {
  // 1. Remove all while a job runs: the job stops and nothing comes back
  {
    const { ctx, page, errors } = await open()
    await page.setInputFiles('[data-testid=add-files-input]', [B])
    await waitReady(page, 1)
    await page.click('[data-testid=compress-mode] [data-value=raster]')
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=job-progress]')
    await page.waitForTimeout(600)
    await page.click('[data-testid=wipe-all]')
    await page.click('[data-testid=confirm-ok]')
    await page.waitForSelector('[data-testid=start-area]')
    await page.waitForTimeout(4000)
    const result = await page.$('[data-testid=result-screen]')
    check('wipe during job: no result screen', !result)
    check('wipe during job: workspace stays empty', (await names(page)).length === 0, (await names(page)).join(', '))
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[data-testid=start-area]', { timeout: 30_000 })
    const recs = await dbRecords(page)
    check('wipe during job: nothing in IndexedDB after reload', recs.length === 0, JSON.stringify(recs))
    check('wipe during job: no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // 2. Quota error while a change is written: the database keeps the input as current
  {
    const { ctx, page, errors } = await open()
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function (rec, ...rest) {
        if (window.__failPut && rec?.version > 1) throw new DOMException('quota', 'QuotaExceededError')
        return put.call(this, rec, ...rest)
      }
    })
    await page.setInputFiles('[data-testid=add-files-input]', [A])
    await waitReady(page, 1)
    await page.evaluate(() => (window.__failPut = true))
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
    const note = await page.textContent('.notice-warn').catch(() => '')
    await page.reload({ waitUntil: 'load' })
    await waitReady(page, 1)
    const after = await names(page)
    const recs = await dbRecords(page)
    check('quota mid-change: the input is back after reload', after.length === 1 && after[0] === 'pdfjs-tracemonkey.pdf', after.join(', '))
    check('quota mid-change: DB holds the input as a leaf, nothing half written', recs.length === 1 && recs[0].isLeaf === true, JSON.stringify(recs))
    check('quota mid-change: no page errors', errors.length === 0, `${errors.join(' | ')} ${note ?? ''}`)
    await ctx.close()
  }

  // 3. A hidden version with nothing on top (written by an older build) comes back
  {
    const { ctx, page } = await open()
    await page.setInputFiles('[data-testid=add-files-input]', [A])
    await waitReady(page, 1)
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('swisspdf', 1)
          req.onsuccess = () => {
            const s = req.result.transaction('files', 'readwrite').objectStore('files')
            const all = s.getAll()
            all.onsuccess = () => {
              for (const r of all.result) s.put({ ...r, isLeaf: false })
              s.transaction.oncomplete = () => {
                req.result.close()
                resolve()
              }
            }
          }
        }),
    )
    await page.reload({ waitUntil: 'load' })
    await waitReady(page, 1)
    const recs = await dbRecords(page)
    check('orphan recovery: hidden file shown again and saved as current', (await names(page)).length === 1 && recs.every((r) => r.isLeaf), JSON.stringify(recs))
    await ctx.close()
  }

  // 4. Double click on Run starts one job; card buttons have names; undo asks first
  {
    const { ctx, page, errors } = await open(1440, '#/rotate')
    await page.setInputFiles('[data-testid=add-files-input]', [A])
    await waitReady(page, 1)
    const label = await page.getAttribute('[data-testid=file-card] .fc-main', 'aria-label')
    check('file card select button has a name', /^pdfjs-tracemonkey\.pdf, 14 pages, /.test(label ?? ''), label)
    await page.dblclick('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
    await page.waitForTimeout(1500)
    await page.click('[data-testid=result-back]')
    const ver = await page.textContent('[data-testid=file-card] .fc-version').catch(() => '')
    const cards = (await names(page)).length
    check('Run double click: one job, one new version', cards === 1 && ver === 'v2', `${cards} cards, ${ver}`)
    await page.click('[data-testid=file-card] [aria-label^="Undo last change"]')
    const asked = await page.waitForSelector('[data-testid=file-confirm]', { timeout: 5000 }).then(() => true, () => false)
    check('undo on a file asks first', asked)
    if (asked) await page.click('[data-testid=file-confirm] .btn-quiet')
    check('cancelled undo keeps the version', (await page.textContent('[data-testid=file-card] .fc-version').catch(() => '')) === 'v2')
    await page.click('[data-testid=file-card] [aria-label^="Remove"]')
    const askedRemove = await page.waitForSelector('[data-testid=file-confirm]', { timeout: 5000 }).then(() => true, () => false)
    check('remove of a file with versions asks first', askedRemove)
    // skip link goes to the files
    await page.keyboard.press('Escape')
    await page.reload({ waitUntil: 'load' })
    await waitReady(page, 1)
    await page.keyboard.press('Tab')
    const first = await page.evaluate(() => document.activeElement?.textContent?.trim())
    check('first Tab stop is the skip link', first === 'Skip to files', first)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    check('skip link moves focus to the workbench', await page.evaluate(() => document.activeElement?.id === 'workbench'))
    check('double click: no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }

  // 5. Phone: Run bar on screen, Options sheet, privacy chip
  {
    const { ctx, page, errors } = await open(390, '#/merge')
    await page.setInputFiles('[data-testid=add-files-input]', [A, B])
    await waitReady(page, 2)
    const box = await page.locator('[data-testid=run-btn]').boundingBox()
    check('phone: Run button on screen without scrolling', box && box.y + box.height <= 844 && box.y > 400, JSON.stringify(box))
    const line = await page.textContent('.run-local')
    check('phone: local line under Run', line === 'Runs on this device. Nothing is uploaded.', line)
    await page.click('[data-testid=options-btn]')
    await page.waitForTimeout(400)
    const sheet = await page.locator('#options-sheet').boundingBox()
    const visible = await page.isVisible('#options-sheet .options-title')
    check('phone: Options opens a bottom sheet above the Run bar', visible && sheet && sheet.y + sheet.height <= box.y + 1, JSON.stringify(sheet))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    check('phone: Escape closes the sheet', !(await page.isVisible('#options-sheet .options-title')))
    const chip = page.locator('[data-testid=privacy-chip]')
    check('phone: privacy chip shown', await chip.isVisible(), await chip.getAttribute('aria-label'))
    await chip.click()
    check('phone: privacy chip opens a dialog', await page.isVisible('[data-testid=privacy-dialog]'))
    check('phone: no page errors', errors.length === 0, errors.join(' | '))
    await ctx.close()
  }
} finally {
  await browser.close()
  await dev?.server.close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
