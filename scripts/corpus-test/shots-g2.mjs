// Screenshots of the G2 tools (protect, unlock, OCR, auto rotate, repair, compare, health)
// at 390 and 1440 px, light and dark, into docs/design/screens/G2/. Fails on
// horizontal scroll or page errors. Usage: node scripts/corpus-test/shots-g2.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'

const OUT = join(ROOT, 'docs', 'design', 'screens', 'G2')
mkdirSync(OUT, { recursive: true })
const C = (f) => join(ROOT, 'test-corpus', f)
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
      })
      const page = await ctx.newPage()
      page.on('pageerror', (e) => problems.push(`${width} ${theme}: ${e.message}`))
      const shot = async (name) => {
        await page.waitForTimeout(400)
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (over > 0) problems.push(`${name} ${width} ${theme}: horizontal scroll ${over}px`)
        await page.screenshot({ path: join(OUT, `${name}-${width}-${theme}.png`), fullPage: width < 500 })
      }
      // on a phone the options are a sheet: open it after the files are in
      const sheet = async () => {
        const btn = await page.$('[data-testid=options-btn]')
        if (btn && (await btn.isVisible())) {
          if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click()
          await page.waitForSelector('#options-sheet')
        } else await page.waitForSelector('[data-testid=options-panel]')
      }
      const go = async (hash) => {
        await page.evaluate((h) => (location.hash = h), hash)
        await page.waitForSelector('[data-testid=options-panel]', { state: 'attached' })
        if (hash === '#/health') await sheet()
      }
      const add = async (files, n) => {
        await page.setInputFiles('[data-testid=add-files-input]', files.map(C))
        await page.waitForFunction((c) => document.querySelectorAll('[data-testid=file-card]').length === c, n, { timeout: 120_000 })
        await page.waitForTimeout(600)
        await sheet()
      }
      const wipe = async () => {
        await page.evaluate(async () => (await import('/src/app/fileStore.js')).wipeAll())
      }
      const run = async () => {
        await page.click('[data-testid=run-btn]')
        await page.waitForSelector('[data-testid=result-screen]', { timeout: 600_000 })
        await page.waitForTimeout(1200)
      }
      await page.goto(`${url}/`, { waitUntil: 'load' })
      await page.waitForSelector('[data-testid=tool-panel]', { state: 'attached' })
      await wipe()

      await go('#/protect')
      await add(['reports/pdfjs-tracemonkey.pdf'], 1)
      await page.fill('[data-testid=pw-input]', 'Secret-42')
      await page.fill('[data-testid=pw-confirm]', 'Secret-4')
      await shot('protect-basic')
      await page.click('[data-testid=protect-mode] [role=radio]:has-text("Advanced")')
      await page.fill('[data-testid=pw-owner]', 'Owner-77')
      await shot('protect-advanced')

      await wipe()
      await go('#/unlock')
      await add(['derived/user-pw-TAMReview.pdf', 'derived/owner-only-tracemonkey.pdf'], 2)
      await shot('unlock')

      await wipe()
      await go('#/ocr')
      await add(['scanned/fax-jean-schmidt-doe.pdf'], 1)
      await shot('ocr')
      // the fax already has an old OCR layer: read it again
      await page.click('[data-testid=ocr-text-pages] [role=radio]:has-text("Read every page")')
      await run()
      await shot('ocr-result')

      await wipe()
      await go('#/autorotate')
      await add(['scanned/fax-jean-schmidt-doe.pdf'], 1)
      await shot('autorotate')

      await wipe()
      await go('#/repair')
      await add(['quirks/pdfjs-xref_command_missing.pdf'], 1)
      await shot('repair')

      await wipe()
      await go('#/compare')
      await add(['derived/compare-tracemonkey-base.pdf', 'derived/compare-tracemonkey-inserted.pdf'], 2)
      await shot('compare')
      await run()
      await page.waitForSelector('[data-testid=compare-view] .g2-stage img', { timeout: 60_000 })
      await shot('compare-result')

      await wipe()
      await go('#/health')
      await shot('health')
      if ((width === 1440 && theme === 'light') || (width === 390 && theme === 'dark')) {
        await run()
        await shot('health-result')
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  await server.close()
}
console.log(problems.length ? problems.join('\n') : 'all G2 screens captured, no horizontal scroll')
process.exit(problems.length ? 1 : 0)
