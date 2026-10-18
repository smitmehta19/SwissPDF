// G4 convert tools through the real shell UI: images (JPG, HEIC, multi-page
// TIFF) to one PDF, compress it, PDF to Word, then PDF to images (JBIG2
// page), Word to PDF with the Office engine, HTML to PDF and PDF to Markdown.
// Screenshots at 390 and 1440 px, light and dark, go to
// docs/design/screens/G4/. Usage: node scripts/corpus-test/g4-ui.mjs
//   [--url http://localhost:4180/SwissPDF/] [--no-engine] [--no-shots] [--shots-only]
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { startServer, ROOT } from './server.mjs'

const CORPUS = join(ROOT, 'test-corpus')
const SHOTS = join(ROOT, 'docs', 'design', 'screens', 'G4')
const IMAGES = ['images/photo-castle-3456x2628.jpg', 'images/heic-libheif-example.heic', 'images/tiff-multipage.tiff']
const arg = (name) => process.argv.includes(name)
const at = process.argv.indexOf('--url')
const given = at > 0 ? process.argv[at + 1] : null

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}

const dev = given ? null : await startServer()
const base = (given ?? dev.url).replace(/\/$/, '')
const browser = await chromium.launch()

const line = (page) => page.textContent('[data-testid=live-line]')
async function download(page) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click('[data-testid=result-download]')])
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(readFileSync(await dl.path())) }
}
async function open(page, id) {
  await page.click(`[data-testid=tool-${id}]`)
  await page.waitForSelector('[data-testid=options-panel]')
}
async function runTool(page, timeout = 300_000) {
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=result-screen], [data-testid=run-error]', { timeout })
  const err = await page.$('[data-testid=run-error]')
  if (err) throw new Error(await err.textContent())
}
const cardsReady = (page, n) =>
  page.waitForFunction(
    (c) => {
      const m = [...document.querySelectorAll('[data-testid=file-card] .file-meta')].map((e) => e.textContent)
      return m.length >= c && m.every((t) => !/Reading/.test(t))
    },
    n,
    { timeout: 120_000 },
  )
const pdfPages = async (bytes) => (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount()

async function newPage(width = 1440, theme = 'light') {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 960 },
    deviceScaleFactor: width < 500 ? 2 : 1,
    colorScheme: theme,
    reducedMotion: 'reduce',
    acceptDownloads: true,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => check('no page error', false, e.message))
  await page.goto(`${base}/`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
  await page.waitForSelector('[data-testid=tool-panel]', { state: 'attached', timeout: 60_000 })
  return { ctx, page }
}

try {
if (!arg('--shots-only')) {
  const { ctx, page } = await newPage()

  // 1. images -> one PDF
  await open(page, 'img2pdf')
  await page.setInputFiles('[data-testid=add-files-input]', IMAGES.map((f) => join(CORPUS, f)))
  await cardsReady(page, 3)
  check('img2pdf: live line', /1 PDF will be created from 3 images/.test(await line(page)), await line(page))
  await runTool(page)
  const imgPdf = await download(page)
  const imgPages = await pdfPages(imgPdf.bytes)
  check('img2pdf: 1 JPG + 1 HEIC + 3-page TIFF = 5 A4 pages', imgPdf.name === 'images.pdf' && imgPages === 5, `${imgPdf.name}, ${imgPages} pages`)
  const doc = await PDFDocument.load(imgPdf.bytes)
  check('img2pdf: pages are A4', doc.getPages().every((p) => Math.abs(p.getWidth() - 595.28) < 1), doc.getPages().map((p) => p.getWidth().toFixed(0)).join(','))
  await ctx.close()
}
if (!arg('--shots-only')) {
  // 2. chain: a text PDF -> page images -> images to PDF -> compress -> Word (OCR)
  const { ctx, page } = await newPage()
  await open(page, 'pdf2img')
  await page.setInputFiles('[data-testid=add-files-input]', [join(CORPUS, 'reports/pdfjs-tracemonkey.pdf')])
  await cardsReady(page, 1)
  await page.fill('[data-testid=range-input]', '1-2')
  // PNG: pdfExtract does not see JPEG images yet, so a JPEG scan never gets OCR
  await page.click('[data-testid=pdf2img-format] [role=radio]:has-text("PNG")')
  await runTool(page)
  await page.click('[data-testid=next-img2pdf]')
  await page.waitForSelector('[data-testid=options-panel]')
  check('chain img2pdf: takes the 2 page images, not the PDF', /1 PDF will be created from 2 images/.test(await line(page)), await line(page))
  await runTool(page)
  await page.click('[data-testid=next-compress]')
  await page.waitForSelector('[data-testid=options-panel]')
  check('compress: carries the image PDF', /1 compressed PDF/.test(await line(page)), await line(page))
  await runTool(page)
  const comp = await download(page)
  check('compress: 2 pages', (await pdfPages(comp.bytes)) === 2, `${comp.name} ${comp.bytes.length} bytes`)

  // 3. continue with PDF to Word: the image-only PDF needs OCR
  await open(page, 'pdf2word')
  check('pdf2word: live line', /1 DOCX file will be created/.test(await line(page)), await line(page))
  await page.waitForSelector('[data-testid=ocr-warning]', { timeout: 30_000 }).catch(() => {})
  check('pdf2word: image-only PDF flagged as needing OCR', !!(await page.$('[data-testid=ocr-warning]')))
  await runTool(page, 900_000)
  const docx = await download(page)
  const zip = await JSZip.loadAsync(docx.bytes)
  const xml = (await zip.file('word/document.xml')?.async('string')) ?? ''
  check('pdf2word: download is a DOCX with OCR text', docx.name.endsWith('.docx') && /Trace/i.test(xml), `${docx.name}, ${xml.length} chars of XML`)
  await page.click('[data-testid=result-back]')
  const cards = await page.$$eval('[data-testid=file-card] .file-name', (els) => els.map((e) => e.textContent))
  check('pdf2word: PDF kept next to the DOCX', cards.some((n) => n.endsWith('.pdf')) && cards.some((n) => n.endsWith('.docx')), cards.join(', '))
  await ctx.close()
}

  // 4. PDF to images: JBIG2 page and a 2-page range at 300 dpi
  if (!arg('--shots-only')) {
    const { ctx, page } = await newPage()
    await open(page, 'pdf2img')
    await page.setInputFiles('[data-testid=add-files-input]', [join(CORPUS, 'quirks/pdfjs-jbig2_file_header.pdf'), join(CORPUS, 'reports/pdfjs-tracemonkey.pdf')])
    await cardsReady(page, 2)
    await page.fill('[data-testid=range-input]', '1')
    check('pdf2img: N images line', /2 JPG images will be created/.test(await line(page)), await line(page))
    await page.click('[data-testid=pdf2img-dpi] [data-value="300"]')
    await page.click('[data-testid=pdf2img-format] [role=radio]:has-text("PNG")')
    await runTool(page)
    const notes = await page.$$eval('.result-note', (els) => els.map((e) => e.textContent))
    check('pdf2img: JBIG2 page redrawn with MuPDF', notes.some((t) => /second engine/.test(t)), notes.join(' | '))
    const zip = await download(page)
    const z = await JSZip.loadAsync(zip.bytes)
    const pngs = Object.keys(z.files)
    check('pdf2img: ZIP with 2 PNG', pngs.length === 2 && pngs.every((n) => n.endsWith('.png')), pngs.join(', '))
    const tm = await z.file(pngs.find((n) => /tracemonkey/.test(n))).async('uint8array')
    const w = Buffer.from(tm).readUInt32BE(16)
    check('pdf2img: 300 dpi (Letter page 2550 px wide)', Math.abs(w - 2550) < 4, `${w}px`)
    // extract mode
    await page.click('[data-testid=result-back]')
    await page.click('[data-testid=pdf2img-mode] [data-value=extract]')
    await page.fill('[data-testid=range-input]', '')
    await runTool(page)
    const n = await page.$$eval('[data-testid=result-screen] .result-list li', (els) => els.length)
    check('pdf2img: extract mode finds embedded images', n >= 1, `${n} images`)
    await ctx.close()
  }

  // 5. HTML to PDF (pasted) and PDF to Markdown
  if (!arg('--shots-only')) {
    const { ctx, page } = await newPage()
    await open(page, 'html2pdf')
    await page.click('button:has-text("Use example")')
    check('html2pdf: ready with pasted HTML', /1 PDF will be created/.test(await line(page)), await line(page))
    await runTool(page, 900_000)
    const pdf = await download(page)
    check('html2pdf: PDF', (await pdfPages(pdf.bytes)) >= 1, pdf.name)
    const notes = await page.$$eval('.result-note', (els) => els.map((e) => e.textContent))
    console.log(`      html2pdf note: ${notes.join(' | ') || '(none, real text)'}`)
    await ctx.close()
  }
  if (!arg('--shots-only')) {
    const { ctx, page } = await newPage()
    await open(page, 'pdf2md')
    await page.setInputFiles('[data-testid=add-files-input]', [join(CORPUS, 'invoices/aws-invoice.pdf')])
    await cardsReady(page, 1)
    await runTool(page)
    const md = await download(page)
    const text = Buffer.from(md.bytes).toString('utf8')
    check('pdf2md: Markdown with a table', md.name.endsWith('.md') && /\|.*\|/.test(text), `${md.name}, ${text.length} chars`)
    check('pdf2md: text preview on the result', !!(await page.$('.result-text')))
    await ctx.close()
  }

  // 6. Word to PDF with the Office engine (download bar)
  if (!arg('--no-engine') && !arg('--shots-only')) {
    const { ctx, page } = await newPage()
    await open(page, 'word2pdf')
    await page.setInputFiles('[data-testid=add-files-input]', [join(CORPUS, 'office/poi-sample.docx')])
    await cardsReady(page, 1)
    check('word2pdf: live line', /1 PDF will be created/.test(await line(page)), await line(page))
    await page.click('[data-testid=run-btn]')
    const label = await page
      .waitForFunction(() => /MB of the Office engine/.test(document.querySelector('[data-testid=job-progress]')?.textContent ?? ''), null, { timeout: 120_000 })
      .then(() => page.textContent('[data-testid=job-progress]'))
      .catch(() => '')
    check('word2pdf: download progress bar in MB', /\d+ \/ 55/.test(label), label.trim())
    await page.waitForSelector('[data-testid=result-screen], [data-testid=run-error]', { timeout: 900_000 })
    const pdf = await download(page)
    check('word2pdf: PDF from HiFi engine', (await pdfPages(pdf.bytes)) >= 1, pdf.name)
    await ctx.close()
  }

  // 7. screenshots
  if (!arg('--no-shots')) {
    mkdirSync(SHOTS, { recursive: true })
    for (const width of [390, 1440]) {
      for (const theme of ['light', 'dark']) {
        const { ctx, page } = await newPage(width, theme)
        const shot = async (name) => {
          await page.waitForTimeout(500)
          const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
          check(`${name} ${width} ${theme}: no horizontal scroll`, over <= 0, `${over}px`)
          await page.screenshot({ path: join(SHOTS, `${name}-${width}-${theme}.png`), fullPage: width < 500 })
        }
        await page.goto(`${base}/#/img2pdf`, { waitUntil: 'load' })
        await page.waitForSelector('[data-testid=options-panel]')
        await shot('img2pdf-empty')
        await page.setInputFiles('[data-testid=add-files-input]', IMAGES.map((f) => join(CORPUS, f)))
        await cardsReady(page, 3)
        await shot('img2pdf-options')
        await runTool(page)
        await page.waitForSelector('.result-preview img', { timeout: 60_000 }).catch(() => {})
        await shot('img2pdf-result')
        await page.goto(`${base}/#/pdf2img`, { waitUntil: 'load' })
        await page.waitForSelector('[data-testid=options-panel]')
        await shot('pdf2img-options')
        await page.goto(`${base}/#/pdf2word`, { waitUntil: 'load' })
        await page.waitForSelector('[data-testid=ocr-warning]', { timeout: 30_000 }).catch(() => {})
        await shot('pdf2word-ocr-warning')
        await page.goto(`${base}/#/word2pdf`, { waitUntil: 'load' })
        await page.waitForSelector('[data-testid=options-panel]')
        await shot('word2pdf-options')
        await page.goto(`${base}/#/html2pdf`, { waitUntil: 'load' })
        await page.waitForSelector('[data-testid=options-panel]')
        await page.click('button:has-text("Use example")')
        await shot('html2pdf-options')
        await ctx.close()
      }
    }
  }
} catch (err) {
  check('run', false, err.stack ?? String(err))
} finally {
  await browser.close()
  await dev?.server.close()
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
