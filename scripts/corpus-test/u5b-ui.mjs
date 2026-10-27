// U5-B tools through the real shell: open the tool, add a corpus file, set
// what the user must set, press Run, wait for the result screen. Prints the
// Run to result time (click to result screen, store write included) and the
// median of the files per tool. Dev server only (reads the workspace through
// /src/app/fileStore.js). Usage: node scripts/corpus-test/u5b-ui.mjs
//   [--tool bookmarks,metadata]
import { chromium } from 'playwright'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'

const CORPUS = join(ROOT, 'test-corpus')
const at = (name) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : null
}
const only = at('--tool')?.split(',') ?? null

const TOOLS = [
  ['bookmarks', ['quirks/pdfjs-outlines_se.pdf', 'quirks/pdfjs-nested_outline.pdf', 'reports/pdfjs-tracemonkey.pdf'], async (p) => {
    await p.waitForSelector('[data-testid=bm-tree], [data-testid=bm-empty]', { timeout: 60_000 })
    await p.click('[data-testid=bm-add]')
  }],
  ['metadata', ['reports/pdfjs-tracemonkey.pdf', 'invoices/aws-invoice.pdf', 'reports/arxiv-1706.03762-attention.pdf'], async (p) => {
    await p.waitForSelector('[data-testid=meta-Title]', { timeout: 60_000 })
    await p.fill('[data-testid=meta-Title]', 'UI title check')
  }],
  ['attachments', ['reports/pdfjs-tracemonkey.pdf', 'invoices/aws-invoice.pdf', 'quirks/pdfjs-annotation-fileattachment.pdf'], async (p) => {
    await p.setInputFiles('[data-testid=att-add-input]', join(CORPUS, 'quirks/pdfjs-cmykjpeg.pdf'))
    await p.waitForSelector('[data-testid=att-new]')
  }, 1],
  // extract mode keeps the PDF next to the extracted file
  ['attachments', ['quirks/pdfjs-annotation-fileattachment.pdf'], async (p) => {
    await p.click('[data-testid=att-mode] [data-value=extract]')
    await p.waitForSelector('[data-testid=att-list]', { timeout: 60_000 })
  }, 2, 'attachments extract'],
  // dynamic XFA form: the panel warns and Run refuses (no "Please wait" output)
  ['flatten', ['forms/xfa-imm1344e-filled.pdf'], async (p) => {
    await p.waitForSelector('[data-testid=flatten-xfa-warning]', { timeout: 60_000 })
  }, 1, 'flatten xfa', /dynamic XFA form/],
  ['removeannots', ['quirks/pdfjs-tracemonkey_with_annotations.pdf', 'quirks/pdfjs-annotation-fileattachment.pdf', 'forms/irs-fw9.pdf']],
  ['removeimages', ['reports/pdfjs-tracemonkey.pdf', 'invoices/aws-invoice.pdf', 'reports/arxiv-1706.03762-attention.pdf']],
  ['extractimages', ['reports/pdfjs-tracemonkey.pdf', 'invoices/aws-invoice.pdf', 'reports/arxiv-1706.03762-attention.pdf'], null, 2],
  ['flatten', ['forms/irs-fw9.pdf', 'forms/uscis-i-9.pdf', 'forms/irs-fw4.pdf']],
  ['unlockforms', ['forms/irs-fw9.pdf', 'forms/uscis-i-9.pdf', 'forms/xfa-imm1344e-filled.pdf']],
  ['sanitize', ['forms/irs-fw9.pdf', 'forms/uscis-i-9.pdf', 'quirks/pdfjs-annotation-fileattachment.pdf']],
  ['permissions', ['derived/owner-only-aws-invoice.pdf', 'reports/pdfjs-tracemonkey.pdf', 'forms/irs-fw9.pdf'], async (p) => {
    await p.fill('[data-testid=perm-owner]', 'Own3r-pass')
    await p.fill('[data-testid=perm-confirm]', 'Own3r-pass')
  }],
  ['showjs', ['forms/irs-fw9.pdf', 'forms/uscis-i-9.pdf', 'forms/xfa-issue14315.pdf'], async (p) => {
    await p.waitForSelector('[data-testid=js-list]', { timeout: 60_000 })
  }, 2],
  ['info', ['reports/pdfjs-tracemonkey.pdf', 'invoices/aws-invoice.pdf', 'forms/irs-fw9.pdf'], async (p) => {
    await p.waitForSelector('[data-testid=info-facts]', { timeout: 60_000 })
  }, 2],
  ['autorename', ['reports/pdfjs-tracemonkey.pdf', 'reports/arxiv-1706.03762-attention.pdf', 'invoices/aws-invoice.pdf']],
]

let failed = 0
const rows = []
const dev = await startServer()
const base = dev.url.replace(/\/$/, '')
const browser = await chromium.launch()

try {
  for (const [id, files, prepare, cardsAfter = 1, label = id, refuse = null] of TOOLS) {
    if (only && !only.includes(id)) continue
    for (const rel of files) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      let ms = null
      let detail = ''
      let ok = true
      try {
        await page.goto(`${base}/`, { waitUntil: 'load' })
        await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
        await page.waitForSelector('[data-testid=tool-panel]', { state: 'attached', timeout: 60_000 })
        // tool groups start folded (S2): unfold them so the row is there
        await page.$$eval('[data-testid^=fold-][aria-expanded=false]', (els) => els.forEach((el) => el.click()))
        await page.click(`[data-testid=tool-${id}]`)
        await page.waitForSelector('[data-testid=options-panel]')
        await page.setInputFiles('[data-testid=add-files-input]', join(CORPUS, rel))
        // canvas tools open in Viewer mode: wait on the store, not the cards
        await page.waitForFunction(async () => {
          const files = (await import('/src/app/fileStore.js')).getFiles()
          return files.length === 1 && files[0].pageCount > 0
        }, null, { timeout: 120_000, polling: 250 })
        if (prepare) await prepare(page)
        await page.waitForFunction(() => !document.querySelector('[data-testid=run-btn]')?.disabled, null, { timeout: 60_000 })
        const t0 = Date.now()
        await page.click('[data-testid=run-btn]')
        await page.waitForSelector('[data-testid=result-screen], [data-testid=run-error]', { timeout: 300_000 })
        ms = Date.now() - t0
        const err = await page.$('[data-testid=run-error]')
        if (refuse) {
          // a refusal row: the panel warned, Run reports the reason
          const text = err ? await err.textContent() : ''
          if (!refuse.test(text)) throw new Error(`expected a refusal, got: ${text || 'a result'}`)
          detail = `refused: ${text.slice(0, 80)}`
          ms = null
          await ctx.close()
          rows.push({ id: label, rel, ms, ok, detail })
          console.log(`PASS  ${label.padEnd(13)} ${rel.padEnd(48)} -  ${detail}`)
          continue
        }
        if (err) throw new Error(await err.textContent())
        // replaced inputs leave 1 card, kept inputs (reports, extract) 2
        const cards = await page.evaluate(async () => (await import('/src/app/fileStore.js')).getFiles().map((f) => f.name))
        detail = cards.join(', ')
        if (cards.length !== cardsAfter) throw new Error(`workspace has ${cards.length} files, want ${cardsAfter}: ${detail}`)
        if (errors.length) throw new Error(`page error: ${errors[0]}`)
      } catch (err) {
        failed++
        ok = false
        detail = String(err.message ?? err).split('\n')[0].slice(0, 160)
      }
      rows.push({ id: label, rel, ms, ok, detail })
      console.log(`${rows.at(-1).ok ? 'PASS' : 'FAIL'}  ${label.padEnd(13)} ${rel.padEnd(48)} ${ms ?? '-'} ms  ${detail}`)
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  await dev.server.close()
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null
}
console.log('\n| Tool | Run to result, median (ms) | Files (ms) |\n|---|---|---|')
for (const id of [...new Set(rows.map((r) => r.id))]) {
  const rs = rows.filter((r) => r.id === id)
  console.log(`| ${id} | ${median(rs.filter((r) => r.ms != null).map((r) => r.ms))} | ${rs.map((r) => r.ms ?? 'x').join(', ')} |`)
}
console.log(`\n${rows.filter((r) => r.ok).length} of ${rows.length} passed`)
process.exit(failed ? 1 : 0)
