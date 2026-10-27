// Owner-only (restricted) PDFs keep their restrictions through the shell's
// own edits that do not go through a tool run: quick rotate on a card, Pages
// Save and Pages "Download selected pages".
// Usage: node scripts/corpus-test/polish-a-restrict.mjs [--url http://localhost:4180/SwissPDF/]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'

const FILE = join(ROOT, 'test-corpus/derived/owner-only-tracemonkey.pdf')
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}
const encrypted = (bytes) => /\/Encrypt\b/.test(Buffer.from(bytes).toString('latin1'))

const at = process.argv.indexOf('--url')
const given = at > 0 ? process.argv[at + 1] : null
const dev = given ? null : await startServer()
const base = (given ?? dev.url).replace(/\/$/, '')
const browser = await chromium.launch()
// stored bytes of the current version of the first card
const storedBytes = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('swisspdf', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const all = req.result.transaction('files').objectStore('files').getAll()
          all.onsuccess = async () => {
            const leaf = all.result.filter((r) => r.isLeaf).sort((a, b) => b.version - a.version)[0]
            const text = leaf ? await leaf.blob.text() : ''
            req.result.close()
            resolve({ version: leaf?.version ?? 0, encrypted: /\/Encrypt\b/.test(text) })
          }
        }
      }),
  )
const waitVersion = (page, v) =>
  page.waitForFunction((want) => [...document.querySelectorAll('[data-testid=file-card] .fc-version')].some((e) => e.textContent === `v${want}`), v, { timeout: 60_000 })

try {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
  await page.goto(`${base}/#/`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })
  await page.setInputFiles('[data-testid=add-files-input]', [FILE])
  await page.waitForFunction(() => /^14 pages/.test(document.querySelector('[data-testid=file-card] .file-meta')?.textContent ?? ''), null, { timeout: 120_000 })
  check('input is restricted (encrypted with an owner password)', encrypted(readFileSync(FILE)))

  // quick rotate on the card
  await page.click('[data-testid=file-card] [aria-label^="Rotate "]')
  await waitVersion(page, 2)
  const r = await storedBytes(page)
  check('quick rotate: the new version keeps the restrictions', r.version === 2 && r.encrypted, JSON.stringify(r))

  // Pages: download selected pages
  await page.click('[data-testid=mode-pages]')
  await page.waitForSelector('[data-testid=page-track] .tile-btn')
  await page.click('[data-testid=page-track] .tile-btn[data-page="1"]')
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click('[data-testid=pe-download]')])
  const pages = new Uint8Array(readFileSync(await dl.path()))
  check('Pages download selected: the PDF keeps the restrictions', encrypted(pages), `${dl.suggestedFilename()}, ${pages.length} bytes`)

  // Pages: delete page 1, Save
  await page.click('.pe-bar [aria-label=Delete]')
  await page.click('[data-testid=pe-apply]')
  await page.waitForFunction(() => /new version/.test(document.querySelector('.page-editor .notice')?.textContent ?? ''), null, { timeout: 60_000 })
  const s = await storedBytes(page)
  check('Pages Save: the new version keeps the restrictions', s.version === 3 && s.encrypted, JSON.stringify(s))
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await ctx.close()
} finally {
  await browser.close()
  await dev?.server.close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
