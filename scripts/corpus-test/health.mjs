// Runs the in-app Health check through its real button in Chromium and prints
// every result. Default: the Vite dev server. With --url it checks any running
// copy, e.g. the built app from scripts/serve-pages-sim.mjs:
//   node scripts/corpus-test/health.mjs --url http://localhost:4180/SwissPDF/
import { chromium } from 'playwright'
import { startServer } from './server.mjs'

const at = process.argv.indexOf('--url')
const given = at > 0 ? process.argv[at + 1] : null
const dev = given ? null : await startServer()
const base = given ?? dev.url
const browser = await chromium.launch()
let failed = 1
try {
  const page = await browser.newPage()
  await page.goto(`${base.replace(/\/$/, '')}/#/health`, { waitUntil: 'load', timeout: 120_000 })
  // the built app reloads once when coi-serviceworker takes over
  await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
  await page.waitForSelector('[data-testid="health-run-btn"]', { timeout: 60_000 })
  await page.click('[data-testid="health-run-btn"]')
  await page.waitForSelector('[data-testid="health-summary"]', { timeout: 15 * 60_000 })
  const rows = await page.$$eval('[data-testid="health-results"] li', (lis) =>
    lis.map((li) => ({
      pass: li.classList.contains('check-pass'),
      name: li.querySelector('.check-name')?.textContent ?? '',
      detail: li.querySelector('.check-detail')?.textContent ?? '',
    })),
  )
  for (const r of rows) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}: ${r.detail}`)
  failed = rows.filter((r) => !r.pass).length
  console.log(`${rows.length - failed} of ${rows.length} pass (${base})`)
} finally {
  await browser.close()
  await dev?.server.close()
}
process.exit(failed ? 1 : 0)
