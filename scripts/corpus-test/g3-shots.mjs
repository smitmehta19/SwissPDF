// Screenshots of the Edit-group tools (canvas in the viewer, options on the
// right) at phone and desktop width, light and dark, into
// docs/design/screens/G3/. Fails on horizontal scroll or page errors.
// Usage: node scripts/corpus-test/g3-shots.mjs [tool,tool]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'

const OUT = join(ROOT, 'docs', 'design', 'screens', 'G3')
mkdirSync(OUT, { recursive: true })
const file = (rel) => join(ROOT, 'test-corpus', rel)
const only = process.argv[2]?.split(',')
const problems = []

const stagePoint = async (page, stage, fx, fy) => {
  const loc = page.locator(`[data-testid=${stage}]`)
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  return [b.x + b.width * fx, b.y + b.height * fy]
}
const drag = async (page, stage, a, b) => {
  const [x0, y0] = await stagePoint(page, stage, ...a)
  const [x1, y1] = await stagePoint(page, stage, ...b)
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x1, y1, { steps: 5 })
  await page.mouse.up()
}
const click = async (page, stage, fx, fy) => {
  const loc = page.locator(`[data-testid=${stage}]`)
  const b = await loc.boundingBox()
  await loc.click({ position: { x: b.width * fx, y: b.height * fy } })
}

// Each tool: file, canvas test id, and a few steps that show its state.
const TOOLS = {
  redact: {
    rel: 'invoices/quality-hosting.pdf',
    stage: 'redact-stage',
    async steps(page) {
      await page.check('[data-testid=redact-pattern-email]')
      await page.check('[data-testid=redact-pattern-phone]')
      await page.waitForSelector('[data-testid=redact-hit]', { timeout: 30_000 })
      await drag(page, 'redact-stage', [0.55, 0.06], [0.93, 0.13])
    },
  },
  sign: {
    rel: 'reports/pdfjs-tracemonkey.pdf',
    stage: 'sign-stage',
    async steps(page) {
      await page.fill('[data-testid=sig-name]', 'Alex Morgan')
      await page.waitForFunction(() => !document.querySelector('.g3-hint')?.textContent?.startsWith('Create your'), null, { timeout: 15_000 })
      await click(page, 'sign-stage', 0.7, 0.9)
      await page.click('[data-testid=sig-place] [role=radio] >> nth=2')
      await click(page, 'sign-stage', 0.25, 0.92)
    },
  },
  crop: {
    rel: 'reports/pdfjs-tracemonkey.pdf',
    stage: 'crop-stage',
    async steps(page) {
      await drag(page, 'crop-stage', [0.1, 0.08], [0.9, 0.55])
    },
  },
  edit: {
    rel: 'reports/pdfjs-tracemonkey.pdf',
    stage: 'edit-canvas',
    async steps(page) {
      await page.fill('[data-testid=edit-text-input]', 'Reviewed')
      await click(page, 'edit-canvas', 0.08, 0.05)
      await page.click('[data-testid=edit-tool-highlight]')
      await drag(page, 'edit-canvas', [0.1, 0.2], [0.85, 0.24])
    },
  },
  forms: {
    rel: 'forms/irs-fw9.pdf',
    stage: 'form-canvas',
    async steps(page) {
      const f = '[data-testid=form-canvas] input[data-testid=pdf-field]:not([type=checkbox]):not([type=radio]):not([disabled]):not([maxlength])'
      await page.waitForSelector(f, { timeout: 30_000 })
      await page.fill(`${f} >> nth=0`, 'Alex Morgan')
    },
  },
  pagenumbers: {
    rel: 'reports/pdfjs-tracemonkey.pdf',
    stage: 'pn-stage',
    async steps(page) {
      await page.click('[data-testid=pn-preset] [data-value=n-of-p]')
      await page.fill('[data-testid=pn-skip]', '1')
      await page.fill('[data-testid=g3-page]', '2')
      await page.waitForSelector('[data-testid=pn-stage][data-page="2"] img', { timeout: 30_000 })
    },
  },
}

const { server, url } = await startServer()
const browser = await chromium.launch()
try {
  for (const [tool, spec] of Object.entries(TOOLS)) {
    if (only && !only.includes(tool)) continue
    for (const width of [390, 1440]) {
      for (const theme of ['light', 'dark']) {
        const ctx = await browser.newContext({
          viewport: { width, height: width < 500 ? 844 : 960 },
          deviceScaleFactor: width < 500 ? 2 : 1,
          colorScheme: theme,
          reducedMotion: 'reduce',
        })
        const page = await ctx.newPage()
        page.on('pageerror', (e) => problems.push(`${tool} ${width} ${theme}: ${e.message}`))
        try {
          await page.goto(`${url}/#/${tool}`, { waitUntil: 'load' })
          await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached' })
          await page.setInputFiles('[data-testid=add-files-input]', file(spec.rel))
          await page.waitForSelector(`[data-testid=${spec.stage}] img`, { timeout: 60_000 })
          await spec.steps(page)
          await page.waitForTimeout(500)
          await page.evaluate(() => window.scrollTo(0, 0))
          const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
          if (over > 0) problems.push(`${tool} ${width} ${theme}: horizontal scroll ${over}px`)
          await page.screenshot({ path: join(OUT, `${tool}-${width}-${theme}.png`), fullPage: width < 500 })
        } catch (err) {
          problems.push(`${tool} ${width} ${theme}: ${err.message.split('\n')[0]}`)
        }
        await ctx.close()
      }
    }
  }
} finally {
  await browser.close()
  await server.close()
}
console.log(problems.length ? problems.join('\n') : 'all screens captured, no horizontal scroll')
process.exit(problems.length ? 1 : 0)
