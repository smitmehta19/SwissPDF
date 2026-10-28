// UI smoke for the page-frame work: drives the real Crop, Edit, Sign, Redact,
// Page numbers and Forms tools in the shell (workspace files, canvas in the
// viewer, Run, result screen, download) on rotated / mixed-size corpus files
// with the mouse and checks where the result landed.
// Usage: node scripts/corpus-test/ui-frame.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { startServer, ROOT } from './server.mjs'
import { withPdfjs, imagePlacements, textOf } from './validate.mjs'

const CORPUS = join(ROOT, 'test-corpus')
const near = (a, b, t) => Math.abs(a - b) <= t
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}

// Opens a tool with one corpus file in a fresh workspace, on its canvas.
async function openTool(browser, tool, rel, stage) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 1000 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`  page error (${tool}): ${e.message}`))
  await page.goto(`${url}/#/${tool}`, { waitUntil: 'load', timeout: 120_000 })
  await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached' })
  await page.setInputFiles('[data-testid=add-files-input]', join(CORPUS, rel))
  await page.waitForSelector(`[data-testid=${stage}] img`, { timeout: 60_000 })
  return { ctx, page }
}

async function gotoPage(page, stage, n) {
  await page.fill('[data-testid=g3-page]', String(n))
  await page.waitForSelector(`[data-testid=${stage}][data-page="${n}"] img`, { timeout: 30_000 })
}

// Drag between two fractions of the stage, scrolled into view first.
async function drag(page, stage, [fx0, fy0], [fx1, fy1]) {
  const loc = page.locator(`[data-testid=${stage}]`)
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  await page.mouse.move(b.x + b.width * fx0, b.y + b.height * fy0)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width * fx1, b.y + b.height * fy1, { steps: 6 })
  await page.mouse.up()
}

async function clickAt(page, stage, fx, fy) {
  const loc = page.locator(`[data-testid=${stage}]`)
  const b = await loc.boundingBox()
  await loc.click({ position: { x: b.width * fx, y: b.height * fy } })
}

// Run, wait for the result screen, download the output.
async function runAndDownload(page) {
  await page.waitForSelector('[data-testid=run-btn]:not([disabled])', { timeout: 30_000 })
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=result-screen]', { timeout: 180_000 })
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('[data-testid=result-download]')])
  return new Uint8Array(readFileSync(await dl.path()))
}

const { server, url } = await startServer()
const browser = await chromium.launch()
try {
  // Crop: drag 10%..60% on page 3 of the mixed file (rot 90 + origin), all pages
  {
    const rel = 'derived/c-mixed.pdf'
    const { ctx, page } = await openTool(browser, 'crop', rel, 'crop-stage')
    await gotoPage(page, 'crop-stage', 3)
    await drag(page, 'crop-stage', [0.1, 0.1], [0.6, 0.6])
    const out = await runAndDownload(page)
    const want = await withPdfjs(readFileSync(join(CORPUS, rel)), async (doc) => {
      const boxes = []
      for (let n = 1; n <= doc.numPages; n++) {
        const vp = (await doc.getPage(n)).getViewport({ scale: 1 })
        const [ax, ay] = vp.convertToPdfPoint(vp.width * 0.1, vp.height * 0.1)
        const [bx, by] = vp.convertToPdfPoint(vp.width * 0.6, vp.height * 0.6)
        boxes.push([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)])
      }
      return boxes
    })
    const doc = await PDFDocument.load(out)
    const bad = []
    doc.getPages().forEach((p, i) => {
      const c = p.getCropBox()
      const got = [c.x, c.y, c.x + c.width, c.y + c.height]
      // the drag is in screen pixels, so allow ~1% of the page
      const tol = Math.max(want[i][2] - want[i][0], want[i][3] - want[i][1]) * 0.02 + 2
      if (got.some((v, k) => !near(v, want[i][k], tol))) bad.push(`p${i + 1} ${got.map((v) => v.toFixed(0))} vs ${want[i].map((v) => v.toFixed(0))}`)
    })
    check('Crop UI: rotated + mixed file, every page cropped to the dragged box', bad.length === 0, bad.join('; '))
    await ctx.close()
  }

  // Edit: text click at (20%, 15%) on a /Rotate 90 + CropBox page
  {
    const rel = 'derived/rot90-cropbox-bert.pdf'
    const { ctx, page } = await openTool(browser, 'edit', rel, 'edit-canvas')
    await page.fill('[data-testid=edit-text-input]', 'UIMARK')
    await clickAt(page, 'edit-canvas', 0.2, 0.15)
    const out = await runAndDownload(page)
    const hit = await withPdfjs(out, async (doc) => {
      const p = await doc.getPage(1)
      const vp = p.getViewport({ scale: 1 })
      const it = (await p.getTextContent()).items.find((i) => i.str.includes('UIMARK'))
      if (!it) return null
      const [a, b, , , e, f] = [
        vp.transform[0] * it.transform[0] + vp.transform[2] * it.transform[1],
        vp.transform[1] * it.transform[0] + vp.transform[3] * it.transform[1],
        0,
        0,
        vp.transform[0] * it.transform[4] + vp.transform[2] * it.transform[5] + vp.transform[4],
        vp.transform[1] * it.transform[4] + vp.transform[3] * it.transform[5] + vp.transform[5],
      ]
      return { fx: e / vp.width, top: (f - 16) / vp.height, upright: a > 0 && Math.abs(b) < 0.01 }
    })
    check('Edit UI: text lands where clicked on a rotated page, upright', !!hit && near(hit.fx, 0.2, 0.01) && near(hit.top, 0.15, 0.01) && hit.upright, hit ? `(${hit.fx.toFixed(3)}, ${hit.top.toFixed(3)}) upright=${hit.upright}` : 'not found')
    await ctx.close()
  }

  // Sign: typed signature, click at (30%, 70%) on a /Rotate 180 + offset-origin page
  {
    const rel = 'derived/c-rot180-origin.pdf'
    const { ctx, page } = await openTool(browser, 'sign', rel, 'sign-stage')
    await page.fill('[data-testid=sig-name]', 'Corpus Signer')
    await page.waitForFunction(() => !document.querySelector('.g3-hint')?.textContent?.startsWith('Create your'), null, { timeout: 15_000 })
    await clickAt(page, 'sign-stage', 0.3, 0.7)
    await page.waitForSelector('[data-testid=sign-ghost] img', { timeout: 10_000 })
    const out = await runAndDownload(page)
    const imgs = await imagePlacements(out, 1)
    const sig = imgs[imgs.length - 1]
    check('Sign UI: signature centred where clicked on a rotated, offset page', !!sig && near(sig.cx, 0.3, 0.01) && near(sig.cy, 0.7, 0.01), sig ? `(${sig.cx.toFixed(3)}, ${sig.cy.toFixed(3)})` : 'none')
    await ctx.close()
  }

  // Redact: search a word and drag a box on a /Rotate 90 + CropBox page
  {
    const rel = 'derived/rot90-cropbox-bert.pdf'
    const { ctx, page } = await openTool(browser, 'redact', rel, 'redact-stage')
    await page.fill('[data-testid=redact-search]', 'Transformers')
    await page.waitForFunction(() => /[1-9]\d* match/.test(document.querySelector('[data-testid=redact-hits]')?.textContent ?? ''), null, { timeout: 30_000 })
    const hits = await page.textContent('[data-testid=redact-hits]')
    // a box over the top 12% of page 1 (the title block, as seen)
    await drag(page, 'redact-stage', [0.02, 0.02], [0.98, 0.12])
    await page.waitForSelector('[data-testid=redact-box]')
    const out = await runAndDownload(page)
    const before = (await textOf(readFileSync(join(CORPUS, rel)))).join(' ')
    const after = (await textOf(out)).join(' ')
    check('Redact UI: searched word gone, rest kept', !/transformers/i.test(after) && after.length > before.length * 0.8, `${hits}; text ${before.length} -> ${after.length} chars`)
    // the dragged band: text items starting inside it on page 1, before and after
    const band = (bytes) =>
      withPdfjs(bytes, async (doc) => {
        const p = await doc.getPage(1)
        const vp = p.getViewport({ scale: 1 })
        return (await p.getTextContent()).items.filter((it) => {
          if (!it.str.trim()) return false
          const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5])
          return x / vp.width > 0.03 && x / vp.width < 0.97 && y / vp.height > 0.03 && y / vp.height < 0.11
        }).length
      })
    const bandBefore = await band(readFileSync(join(CORPUS, rel)))
    const inBand = await band(out)
    check('Redact UI: dragged band on a rotated page holds no text', bandBefore > 0 && inBand === 0, `${bandBefore} items before, ${inBand} after`)
    await ctx.close()
  }

  // Page numbers: custom text, skip the first page, top right of a rotated page
  {
    const rel = 'derived/rot90-cropbox-bert.pdf'
    const { ctx, page } = await openTool(browser, 'pagenumbers', rel, 'pn-stage')
    await page.click('[data-testid=pn-preset] [data-value=custom]')
    await page.fill('[data-testid=pn-template]', 'UI {n}/{p}')
    await page.fill('[data-testid=pn-skip]', '1')
    await clickAt(page, 'pn-stage', 0.9, 0.05)
    await page.waitForFunction(() => document.querySelector('[data-testid=pn-preview]') === null, null, { timeout: 5000 })
    await gotoPage(page, 'pn-stage', 2)
    const preview = await page.textContent('[data-testid=pn-preview]')
    const out = await runAndDownload(page)
    const texts = await textOf(out)
    const pos = await withPdfjs(out, async (doc) => {
      const p = await doc.getPage(2)
      const vp = p.getViewport({ scale: 1 })
      const it = (await p.getTextContent()).items.find((i) => i.str.includes('UI 1/15'))
      if (!it) return null
      const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5])
      return { fx: x / vp.width, fy: y / vp.height }
    })
    check('Page numbers UI: preview matches, first page skipped, top right', preview === 'UI 1/15' && !texts[0].includes('UI ') && !!pos && pos.fx > 0.8 && pos.fy < 0.1, `preview "${preview}", ${pos ? `(${pos.fx.toFixed(2)}, ${pos.fy.toFixed(2)})` : 'not found'}`)
    await ctx.close()
  }

  // Forms: type into the first text field of a sideways form, flatten
  {
    const rel = 'derived/c-fw9-rot90.pdf'
    const { ctx, page } = await openTool(browser, 'forms', rel, 'form-canvas')
    await page.waitForSelector('[data-testid=form-canvas] input[data-testid=pdf-field]:not([type=checkbox]):not([type=radio]):not([disabled])', { timeout: 30_000 })
    await page.fill('[data-testid=form-canvas] input[data-testid=pdf-field]:not([type=checkbox]):not([type=radio]):not([disabled]) >> nth=0', 'UIFORMVALUE')
    await page.check('[data-testid=form-flatten]')
    const out = await runAndDownload(page)
    const text = (await textOf(out)).join(' ')
    check('Forms UI: typed value flattened into the page text', text.includes('UIFORMVALUE'))
    await ctx.close()
  }

  // Forms overlay: listFields boxes (view space) match pdf.js widget rects
  for (const rel of ['derived/c-fw9-rot90.pdf', 'forms/xfa-imm1344e-filled.pdf']) {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(`${url}/#/forms`, { waitUntil: 'load', timeout: 120_000 })
    const fields = await page.evaluate(async (path) => {
      const bytes = new Uint8Array(await (await fetch(path)).arrayBuffer())
      const { listFields } = await import('/src/lib/formOps.js')
      return (await listFields(bytes)).filter((f) => f.pageIndex === 0)
    }, `/test-corpus/${rel}`)
    const annots = await withPdfjs(readFileSync(join(CORPUS, rel)), async (doc) => {
      const p = await doc.getPage(1)
      const vp = p.getViewport({ scale: 1 })
      return (await p.getAnnotations())
        .filter((a) => a.fieldName)
        .map((a) => {
          const [x0, y0, x1, y1] = vp.convertToViewportRectangle(a.rect)
          return { name: a.fieldName, x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }
        })
    })
    let matched = 0
    const off = []
    for (const f of fields) {
      const a = annots.find((x) => x.name === f.name && near(x.x, f.x, 1) && near(x.y, f.y, 1))
      if (a && near(a.w, f.w, 1) && near(a.h, f.h, 1)) matched++
      else if (off.length < 2) off.push(`${f.name} (${f.x.toFixed(0)}, ${f.y.toFixed(0)})`)
    }
    check(`Forms overlay boxes match the rendered widgets (${rel})`, fields.length > 0 && matched === fields.length, `${matched} of ${fields.length} ${off.join('; ')}`)
    await ctx.close()
  }
} finally {
  await browser.close()
  await server.close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
