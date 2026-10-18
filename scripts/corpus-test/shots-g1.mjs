// Screenshots of the G1 Organize tools at 390 and 1440 px, light and dark,
// into docs/design/screens/G1/. Fails on horizontal scroll or page errors.
// Usage: node scripts/corpus-test/shots-g1.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'

const OUT = join(ROOT, 'docs', 'design', 'screens', 'G1')
mkdirSync(OUT, { recursive: true })
const file = (f) => join(ROOT, 'test-corpus', f)
const problems = []

const { server, url } = await startServer()
const browser = await chromium.launch()
try {
  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 960 }, deviceScaleFactor: width < 500 ? 2 : 1, colorScheme: theme, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      page.on('pageerror', (e) => problems.push(`${width} ${theme}: ${e.message}`))
      const shot = async (name) => {
        await page.waitForTimeout(400)
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (over > 0) problems.push(`${name} ${width} ${theme}: horizontal scroll ${over}px`)
        await page.screenshot({ path: join(OUT, `${name}-${width}-${theme}.png`), fullPage: width < 500 })
      }
      const open = async (tool) => {
        await page.goto(`${url}/#/${tool}`, { waitUntil: 'load' })
        await page.waitForSelector('[data-testid=options-panel]', { timeout: 60_000 })
      }
      const ready = () => page.waitForFunction(() => /\d+ pages?/.test(document.querySelector('[data-testid=file-card] .file-meta, [data-testid=page-track] .track-count')?.textContent ?? ''), null, { timeout: 120_000 })

      await open('split')
      await page.setInputFiles('[data-testid=add-files-input]', [file('large/911-commission-report.pdf')])
      await ready()
      await page.fill('[data-testid=split-to] >> nth=0', '12')
      await page.click('[data-testid=split-add-range]')
      await page.fill('[data-testid=split-from] >> nth=1', '13')
      await page.fill('[data-testid=split-to] >> nth=1', '40')
      await shot('split-range')
      await page.click('[data-testid=split-tab] >> text=Bookmarks')
      await page.waitForFunction(() => /PDFs will be created/.test(document.querySelector('[data-testid=live-line]')?.textContent ?? ''), null, { timeout: 60_000 })
      await shot('split-bookmarks')
      await page.click('[data-testid=split-tab] >> text=Size')
      await shot('split-size')
      await page.click('[data-testid=split-tab] >> text=Bookmarks')
      await page.click('[data-testid=run-btn]')
      await page.waitForSelector('[data-testid=result-screen] .result-preview img', { timeout: 120_000 })
      await shot('split-result')

      await page.click('[data-testid=result-start-over]')
      await page.click('[data-testid=confirm-ok]')
      await open('extract')
      await page.setInputFiles('[data-testid=add-files-input]', [file('reports/pdfjs-tracemonkey.pdf')])
      await page.waitForSelector('[data-testid=page-track] img', { timeout: 60_000 })
      await page.click('[data-testid=page-track] .tile-btn[data-page="2"]')
      await page.click('[data-testid=page-track] .tile-btn[data-page="5"]', { modifiers: ['Shift'] })
      await shot('extract')

      await open('organize')
      await page.waitForSelector('[data-testid=page-track] img', { timeout: 60_000 })
      await page.click('[data-preset=duplex]')
      await shot('organize')

      await open('rotate')
      await page.click('[data-testid=mode-files]')
      await page.click('[data-testid=rotate-which] [data-value=landscape]')
      await shot('rotate')
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  await server.close()
}
console.log(problems.length ? problems.join('\n') : 'all G1 screens captured, no horizontal scroll')
process.exit(problems.length ? 1 : 0)
