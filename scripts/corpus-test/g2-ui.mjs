// G2 tools through the real shell UI, 3 real files each: add the file, set the
// options, click Run, time it until the result screen shows (Run-to-result),
// download and check the output in Node. Every request of every context is
// logged; any request off the app origin fails the run.
// Writes docs/test-results/<name>.json and .md (default G2-ui).
// Usage: node scripts/corpus-test/g2-ui.mjs [--url http://localhost:4180/SwissPDF/]
//   [--tool ocr,protect] [--name G2-ui]
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, degrees } from 'pdf-lib'
import { startServer, ROOT } from './server.mjs'
import { openMupdf, textOf } from './validate.mjs'
import { USER_PW } from './derive.mjs'

const CORPUS = join(ROOT, 'test-corpus')
const TMP = join(CORPUS, 'derived', 'outputs', 'g2-ui-inputs')
const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : null
}
const only = arg('--tool')?.split(',')
const name = arg('--name') ?? 'G2-ui'
const given = arg('--url')

const KNOWN_ERRORS = ['No PPTX loaded. Call loadFile() first.']
const SASL_PW =`S${String.fromCharCode(0xaa)}SL${String.fromCharCode(0xad)}prep`
const PW = 'Corpus-Pw-1!'
const rel = (r) => join(CORPUS, r)

// Scans fed in sideways (every page /Rotate + 90), for auto rotate.
async function turnedCopy(r) {
  const d = await PDFDocument.load(readFileSync(rel(r)), { updateMetadata: false })
  const before = d.getPages().map((p) => p.getRotation().angle)
  d.getPages().forEach((p, i) => p.setRotation(degrees((before[i] + 90) % 360)))
  mkdirSync(TMP, { recursive: true })
  const out = join(TMP, r.split('/').pop().replace(/\.pdf$/, '-turned90.pdf'))
  writeFileSync(out, await d.save())
  return { path: out, before }
}

const pdfText = async (bytes, password) => (await textOf(bytes, { password })).join(' ')
const rotations = async (bytes) => (await PDFDocument.load(bytes, { updateMetadata: false })).getPages().map((p) => ((p.getRotation().angle % 360) + 360) % 360)

const fill = async (page, sel, value) => page.fill(sel, value)
const clickRadio = (page, group, title) => page.click(`[data-testid=${group}] [role=radio]:has-text("${title}")`)

// tool -> 3 runs: { label, files (paths), setup(page), check(out, page) -> [ok, detail] }
async function jobs() {
  const turned = {}
  for (const r of ['scanned/fax-jean-schmidt-doe.pdf', 'scanned/lincoln-ellsworth-letter-1861.pdf', 'derived/sub-ndl-konoye-p1.pdf']) turned[r] = await turnedCopy(r)
  const ocrRun = (r, langs = [], minChars = 50, force = false) => ({
    label: `${r}${force ? ' (read every page)' : ''}`,
    files: [rel(r)],
    timeout: 900_000,
    async setup(page) {
      for (const l of langs) await page.click(`[data-testid=ocr-langs] input[data-lang=${l}]`)
      if (force) await clickRadio(page, 'ocr-text-pages', 'Read every page')
    },
    async check(out) {
      const t = (await pdfText(out.bytes)).replace(/\s/g, '')
      return [t.length >= minChars, `${t.length} chars of text, ${out.note}`]
    },
  })
  const rotRun = (r, soft = false) => ({
    label: `${r} (turned 90)`,
    files: [turned[r].path],
    timeout: 600_000,
    async check(out) {
      const after = await rotations(out.bytes)
      const back = after.filter((a, i) => a === turned[r].before[i] % 360).length
      const wrong = after.filter((a, i) => a !== turned[r].before[i] % 360 && a !== (turned[r].before[i] + 90) % 360).length
      return [wrong === 0 && (soft || back === after.length), `${back} of ${after.length} pages back upright, ${wrong} wrong, ${out.note}`]
    },
  })
  const protectRun = (r, setup, expect) => ({
    label: r,
    files: [rel(r)],
    setup,
    async check(out) {
      const m = openMupdf(out.bytes, expect.user)
      const enc = m.doc.getMetaData('encryption') ?? 'None'
      const ok = expect.cipher.test(enc) && (expect.user ? m.needsPassword && m.authOk === true : !m.needsPassword) && openMupdf(out.bytes, 'wrong-pw').authOk !== true
      return [ok, `${enc}${expect.user ? ', opens with the password' : ', opens freely'}`]
    },
  })
  const unlockRun = (r, pw, views = false) => ({
    label: `${r}${views ? ' (with a plain PDF, Pages and Viewer opened first)' : ''}`,
    // the views need one file that opens; Unlock leaves the plain one out
    files: views ? [rel('reports/pdfjs-tracemonkey.pdf'), rel(r)] : [rel(r)],
    async setup(page) {
      // a locked file is selected for Unlock: the other views must not try to open it
      if (views) {
        for (const v of ['Pages', 'Viewer', 'Files']) {
          await page.click(`.modes [role=tab]:has-text("${v}")`, { timeout: 10_000 }).catch((e) => {
            throw new Error(`${v} tab: ${e.message.split('\n')[0]}`)
          })
          await page.waitForTimeout(1500)
        }
      }
      if (pw != null) await fill(page, '[data-testid=unlock-file-pw]', pw)
    },
    async check(out) {
      const m = openMupdf(out.bytes)
      const enc = m.doc.getMetaData('encryption') ?? 'None'
      const t = await pdfText(out.bytes)
      return [!m.needsPassword && enc === 'None' && m.doc.countPages() > 0 && t.trim().length > 0, `${enc}, ${m.doc.countPages()} pages, ${t.length} chars, ${out.note}`]
    },
  })
  const compareRun = (a, b, expect) => ({
    label: `${a} vs ${b}`,
    files: [rel(a), rel(b)],
    sequential: true,
    timeout: 300_000,
    async check(out, page) {
      const sum = (await page.textContent('[data-testid=compare-summary]')).replace(/\s+/g, ' ')
      const label = await page.textContent('[data-testid=compare-page-label]').catch(() => '')
      const report = (await pdfText(out.bytes)).includes('Comparison report')
      return [report && expect.test(sum), `${sum.trim()} | ${label}`]
    },
  })
  // reject: neither pdf.js nor MuPDF can read the file; intake must say so
  // on the card (it already tries the MuPDF repair) and nothing runs
  const repairRun = (r, { reject = false, extra = false } = {}) => ({
    label: `${r}${extra ? ' (extra, for timing)' : ''}`,
    files: [rel(r)],
    reject,
    async check(out) {
      const m = openMupdf(out.bytes)
      return [m.doc.countPages() > 0, `${m.doc.countPages()} pages, ${out.note}`]
    },
  })
  return {
    repair: [
      repairRun('quirks/pdfjs-xref_command_missing.pdf'),
      repairRun('quirks/pdfjs-poppler-395-0-fuzzed.pdf', { reject: true }),
      repairRun('quirks/pdfjs-poppler-742-0-fuzzed.pdf', { reject: true }),
      { ...repairRun('quirks/pdfjs-Pages-tree-refs.pdf', { extra: true }), noop: true },
      repairRun('quirks/pdf20-offset-start.pdf', { extra: true }),
    ],
    ocr: [ocrRun('scanned/fax-jean-schmidt-doe.pdf', [], 50, true),ocrRun('scanned/lincoln-ellsworth-letter-1861.pdf'), ocrRun('derived/sub-ndl-konoye-p1.pdf', ['jpn'], 1)],
    autorotate: [rotRun('scanned/fax-jean-schmidt-doe.pdf'), rotRun('scanned/lincoln-ellsworth-letter-1861.pdf'), { ...rotRun('derived/sub-ndl-konoye-p1.pdf', true), noop: true }],
    protect: [
      protectRun(
        'reports/pdfjs-tracemonkey.pdf',
        async (page) => {
          await fill(page, '[data-testid=pw-input]', PW)
          await fill(page, '[data-testid=pw-confirm]', PW)
        },
        { user: PW, cipher: /256.*AES|AES.*256/i },
      ),
      protectRun(
        'invoices/aws-invoice.pdf',
        async (page) => {
          await clickRadio(page, 'protect-mode', 'Advanced')
          await fill(page, '[data-testid=pw-owner]', PW)
          await clickRadio(page, 'protect-key', 'AES 128-bit')
        },
        { user: null, cipher: /128.*AES|AES.*128/i },
      ),
      protectRun(
        'forms/irs-fw9.pdf',
        async (page) => {
          // a password RC4 cannot carry is refused before Run
          const bad = `Key-${String.fromCodePoint(0x1f512)}-1a`
          await clickRadio(page, 'protect-key', 'RC4 40-bit')
          await fill(page, '[data-testid=pw-input]', bad)
          await fill(page, '[data-testid=pw-confirm]', bad)
          await page.waitForSelector('[data-testid=pw-problem]', { timeout: 5000 })
          if (await page.$('[data-testid=run-btn]:not([disabled])')) throw new Error('Run enabled with a password RC4 cannot carry')
          await fill(page, '[data-testid=pw-input]', PW)
          await fill(page, '[data-testid=pw-confirm]', PW)
        },
        { user: PW, cipher: /RC4/i },
      ),
    ],
    unlock: [unlockRun('derived/owner-only-aws-invoice.pdf', null),unlockRun('derived/user-pw-TAMReview.pdf', USER_PW, true), unlockRun('quirks/pdfjs-saslprep-r6.pdf', SASL_PW)],
    compare: [
      compareRun('derived/compare-tracemonkey-base.pdf', 'derived/compare-tracemonkey-inserted.pdf', /words added, 0 removed, on 1 of/),
      compareRun('reports/pdfjs-TAMReview.pdf', 'reports/pdfjs-TAMReview.pdf', /same/),
      compareRun('invoices/aws-invoice.pdf', 'derived/origin-shift-aws-invoice.pdf', /same/),
    ],
    health: [1, 2, 3].map((n) => ({
      label: `run ${n}`,
      files: [],
      timeout: 300_000,
      async check(_out, page) {
        const s = await page.textContent('[data-testid=health-summary]')
        return [/^All \d+ checks passed/.test(s), s]
      },
    })),
  }
}

const dev = given ? null : await startServer()
const base = (given ?? dev.url).replace(/\/$/, '')
const origin = new URL(base).origin
const browser = await chromium.launch()
const rows = []

async function one(tool, job) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' })
  const external = []
  const errors = []
  ctx.on('request', (r) => !r.url().startsWith(origin) && !/^(data|blob):/.test(r.url()) && external.push(r.url()))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
  const row = { tool, file: job.label }
  try {
    await page.goto(`${base}/#/${tool}`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
    await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })
    // one at a time keeps the workspace order (compare: original first)
    for (const f of job.files) {
      const n = await page.$$eval('[data-testid=file-card]', (l) => l.length)
      await page.setInputFiles('[data-testid=add-files-input]', [f])
      await page.waitForFunction(
        (k) => {
          const m = [...document.querySelectorAll('[data-testid=file-card] .file-meta')].map((e) => e.textContent)
          return m.length > k && m.every((t) => !/Reading/.test(t))
        },
        n,
        { timeout: 180_000 },
      )
    }
    row.cards = await page.$$eval('[data-testid=file-card] .file-meta', (l) => l.map((e) => e.textContent))
    if (job.reject) {
      // since S2 the engine text sits behind the card's Details, so read the whole card
      const said = (await page.$$eval('[data-testid=file-card]', (l) => l.map((c) => c.textContent))).join(' ')
      row.ok = /Not a valid PDF/.test(said) && /Unrecoverable/.test(said)
      row.detail = `rejected on add: ${said.slice(0, 160)}`
      throw Object.assign(new Error('done'), { done: true })
    }
    await page.waitForSelector('[data-testid=options-panel]', { timeout: 30_000 })
    await job.setup?.(page)
    await page.waitForSelector('[data-testid=run-btn]:not([disabled])', { timeout: 30_000 })
    const t0 = Date.now()
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen], [data-testid=run-error]', { timeout: job.timeout ?? 300_000 })
    row.ms = Date.now() - t0
    const err = await page.$('[data-testid=run-error]')
    if (err) {
      const said = await err.textContent()
      // a no-op run makes no new version (polish batch): fine where expected
      if (job.noop && /Nothing to do/.test(said)) {
        row.ok = true
        row.detail = `no new version: ${said.slice(0, 120)}`
        throw Object.assign(new Error('done'), { done: true })
      }
      throw new Error(`run failed: ${said}`)
    }
    let out = null
    if (await page.$('[data-testid=result-download]')) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click('[data-testid=result-download]')])
      out = { name: dl.suggestedFilename(), bytes: new Uint8Array(readFileSync(await dl.path())), note: (await page.textContent('.result-note').catch(() => '')) ?? '' }
    }
    const [ok, detail] = await job.check(out, page)
    row.ok = ok
    row.detail = detail
  } catch (e) {
    if (!e.done) {
      row.ok = false
      row.detail = e.message.split('\n')[0]
      row.cards ??= await page.$$eval('[data-testid=file-card] .file-meta', (l) => l.map((x) => x.textContent)).catch(() => [])
    }
  }
  row.external = external
  row.errors = errors
  // known, not G2: pptxviewjs throws after the self-test's PDF to PowerPoint check
  row.knownErrors = errors.filter((m) => KNOWN_ERRORS.some((k) => m.includes(k)))
  if (external.length) row.ok = false
  if (errors.length > row.knownErrors.length) row.ok = false
  await ctx.close()
  console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${tool.padEnd(10)} ${String(row.ms ?? '-').padStart(7)} ms  ${row.file}: ${row.detail}${external.length ? ` | off-origin: ${external.slice(0, 2).join(', ')}` : ''}${errors.length ? ` | page error: ${errors[0]}` : ''}`)
  rows.push(row)
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null
}

try {
  const all = await jobs()
  for (const [tool, list] of Object.entries(all)) {
    if (only && !only.includes(tool)) continue
    for (const job of list) await one(tool, job)
  }
} finally {
  await browser.close()
  await dev?.server.close()
}

const tools = [...new Set(rows.map((r) => r.tool))]
const summary = tools.map((t) => {
  const rs = rows.filter((r) => r.tool === t)
  return { tool: t, pass: rs.filter((r) => r.ok).length, runs: rs.length, medianMs: median(rs.filter((r) => r.ms != null).map((r) => r.ms)) }
})
const outDir = join(ROOT, 'docs', 'test-results')
writeFileSync(join(outDir, `${name}.json`), JSON.stringify({ date: new Date().toISOString(), base, summary, rows }, null, 2))
const md = [
  `# ${name}: G2 tools in the shell UI`,
  '',
  `Run-to-result = click on Run until the result screen shows. Base ${base}. ${new Date().toISOString()}`,
  '',
  '| Tool | Pass | Median Run-to-result |',
  '|---|---|---|',
  ...summary.map((s) => `| ${s.tool} | ${s.pass}/${s.runs} | ${s.medianMs != null ? `${(s.medianMs / 1000).toFixed(1)} s` : '-'} |`),
  '',
  '| Tool | File | Result | Time | Detail |',
  '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.tool} | ${r.file} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.ms != null ? `${(r.ms / 1000).toFixed(1)} s` : '-'} | ${String(r.detail).replace(/\|/g, '/')}${r.external.length ? `; off-origin ${r.external.length}` : ''} |`),
  '',
].join('\n')
writeFileSync(join(outDir, `${name}.md`), md)
const bad = rows.filter((r) => !r.ok).length
console.log(bad ? `${bad} of ${rows.length} runs failed` : `all ${rows.length} runs passed`)
process.exit(bad ? 1 : 0)
