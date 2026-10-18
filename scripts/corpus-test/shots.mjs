// Screenshots of the shell at phone and desktop width, light and dark, into
// docs/design/screens/U2a/. Also checks there is no horizontal scroll and
// that the ops worker is used. Usage: node scripts/corpus-test/shots.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'

const OUT = join(ROOT, 'docs', 'design', 'screens', 'U2a')
mkdirSync(OUT, { recursive: true })
const FILES = ['reports/pdfjs-tracemonkey.pdf', 'reports/arxiv-1810.04805-bert.pdf'].map((f) => join(ROOT, 'test-corpus', f))
const problems = []

const { server, url } = await startServer()
const browser = await chromium.launch()
try {
  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({
        viewport: { width, height: width < 500 ? 844 : 960 },
        deviceScaleFactor: width < 500 ? 2 : 1,
        colorScheme: theme,
        reducedMotion: 'reduce',
        acceptDownloads: true,
      })
      const page = await ctx.newPage()
      let worker = false
      page.on('request', (r) => {
        if (/opsWorker/.test(r.url())) worker = true
      })
      page.on('pageerror', (e) => problems.push(`${width} ${theme}: ${e.message}`))
      const shot = async (name) => {
        await page.waitForTimeout(400)
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (over > 0) problems.push(`${name} ${width} ${theme}: horizontal scroll ${over}px`)
        await page.screenshot({ path: join(OUT, `${name}-${width}-${theme}.png`), fullPage: width < 500 })
      }
      const go = async (hash) => {
        await page.goto(`${url}/${hash}`, { waitUntil: 'load' })
        await page.waitForSelector('[data-testid=tool-panel]', { state: 'attached' })
      }
      const ready = (n) =>
        page.waitForFunction(
          (c) => [...document.querySelectorAll('[data-testid=file-card] .file-meta')].filter((e) => /^\d+ pages?/.test(e.textContent)).length === c,
          n,
          { timeout: 120_000 },
        )

      await go('')
      await shot('home')
      if (width < 500) {
        await page.click('.bar-menu')
        await page.waitForTimeout(300)
      }
      await shot('tool-panel')

      await go('#/merge')
      await page.setInputFiles('[data-testid=add-files-input]', FILES)
      await ready(2)
      await page.waitForFunction(() => document.querySelectorAll('[data-testid=file-card] .fc-cover img').length === 2, null, { timeout: 60_000 })
      await shot('file-grid')

      await page.click('[data-testid=mode-viewer]')
      await page.waitForSelector('[data-testid=viewer-image]', { timeout: 60_000 })
      await shot('viewer')

      await page.click('[data-testid=mode-pages]')
      await page.waitForSelector('[data-testid=page-track] img', { timeout: 60_000 })
      await page.click('[data-testid=page-track] .tile-btn[data-page="2"]')
      await shot('page-editor')

      await go('#/watermark')
      await page.click('[data-testid=mode-files]').catch(() => {})
      await ready(2)
      await shot('options')

      await page.click('[data-testid=run-btn]')
      await page.waitForSelector('[data-testid=result-screen] .result-preview img', { timeout: 120_000 })
      await shot('result')
      if (!worker) problems.push(`${width} ${theme}: ops worker never loaded`)
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  await server.close()
}
console.log(problems.length ? problems.join('\n') : 'all screens captured, no horizontal scroll, worker used')
process.exit(problems.length ? 1 : 0)
