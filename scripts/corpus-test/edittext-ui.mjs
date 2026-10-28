// UI test for Edit PDF > Edit text on the real shell (dev server) with real
// corpus files: click a word or line, type, apply, notes, undo/redo, Escape,
// Tab, signed and scanned files, phone 390 tap-to-edit, Run and download.
// Output text is checked with pdf.js; requests are watched for file data.
// Usage: CORPUS_OUT=edittextui node scripts/corpus-test/edittext-ui.mjs [--only aws,phone] [--no-shots]
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'
import { findTextPositions, textOf } from './validate.mjs'
import { pageTextModel } from '../../src/lib/editTextOps.js'

const CORPUS = join(ROOT, 'test-corpus')
const SHOTS = join(ROOT, 'docs', 'design', 'screens', 'edit-text')
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null)
const ONLY = arg('--only')?.split(',') ?? null
const SHOOT = !process.argv.includes('--no-shots')
const want = (name) => !ONLY || ONLY.includes(name)
mkdirSync(SHOTS, { recursive: true })

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}
const timings = [] // { file, kind, total, engine }
const squash = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '')
const count = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0)
const readRel = (rel) => new Uint8Array(readFileSync(join(CORPUS, rel)))

// A unique word in an editable line, not the last word of its line.
async function pickWords(rel, n, { script = /^[A-Za-z]{4,}$/, page = 1, skip = new Set() } = {}) {
  const bytes = readRel(rel)
  const m = await pageTextModel(bytes, page)
  const all = squash((await textOf(bytes)).join(' '))
  const out = []
  for (const run of m.runs) {
    if (!run.editable) continue
    for (const w of run.words) {
      if (out.length >= n) break
      if (!script.test(w.text) || w.i === run.words.length - 1 || skip.has(w.text) || out.some((o) => o.run.id === run.id)) continue
      if (count(all, squash(w.text)) !== 1) continue
      out.push({ run, word: w })
    }
  }
  return { model: m, picks: out }
}

const { server, url } = await startServer()
const browser = await chromium.launch({ timeout: 300_000 })
const requests = []

async function open(rel, { phone = false } = {}) {
  const ctx = await browser.newContext({
    acceptDownloads: true,
    ...(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } }),
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`  page error (${rel}): ${e.message}`))
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), post: r.postDataBuffer()?.length ?? 0 }))
  // the first load after a dev server start can be slow (dependency scan)
  await page.goto(`${url}/#/edit`, { waitUntil: 'load', timeout: 120_000 })
  await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached' })
  await page.setInputFiles('[data-testid=add-files-input]', join(CORPUS, rel))
  await page.waitForSelector('[data-testid=edit-canvas] img', { timeout: 60_000 })
  return { ctx, page }
}

const stage = (page) => page.locator('[data-testid=edit-canvas]')
// position (stage pixels) of a point in page points
async function at(page, size, x, y) {
  const b = await stage(page).boundingBox()
  return { x: (x / size.width) * b.width, y: (y / size.height) * b.height }
}
const center = (bb) => [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]
const version = (page) => page.evaluate(() => Number(document.querySelector('[data-testid=et-live]')?.dataset.version ?? -1))

async function waitVersion(page, v, timeout = 60_000) {
  const t = Date.now()
  for (;;) {
    if ((await version(page)) === v) return true
    if (Date.now() - t > timeout) return false
    await page.waitForTimeout(100)
  }
}

// Types into the open inline editor and applies with Enter; returns the
// apply-to-render time the app measured.
async function typeApply(page, text, file, kind, { expectVersion } = {}) {
  await page.waitForSelector('[data-testid=et-input]', { timeout: 15_000 }).catch(async (err) => {
    if (process.env.ET_DEBUG) await page.screenshot({ path: join(process.env.ET_DEBUG, `fail-${kind.replace(/\W/g, '-')}.png`) })
    throw err
  })
  const v0 = await version(page)
  const ms0 = await page.evaluate(() => document.querySelector('[data-testid=et-live]')?.dataset.applyMs ?? null)
  await page.fill('[data-testid=et-input]', text)
  await page.press('[data-testid=et-input]', 'Enter')
  const ok = await waitVersion(page, expectVersion ?? v0 + 1)
  // the timing lands once the new page image is on screen
  let ms = null
  for (let i = 0; i < 100; i++) {
    const t = await page.evaluate(() => {
      const el = document.querySelector('[data-testid=et-live]')
      return el ? { total: el.dataset.applyMs ?? null, engine: el.dataset.engineMs ?? null } : null
    })
    if (t?.total && t.total !== ms0) {
      ms = { total: Number(t.total), engine: Number(t.engine) }
      break
    }
    await page.waitForTimeout(100)
  }
  if (ms) timings.push({ file, kind, ...ms })
  return { ok, ms }
}

async function clickWord(page, size, w, how = 'click') {
  const [cx, cy] = center(w.bbox)
  const position = await at(page, size, cx, cy)
  if (how === 'dbl') await stage(page).dblclick({ position })
  else if (how === 'tap') await stage(page).tap({ position })
  else await stage(page).click({ position })
}

async function runAndDownload(page) {
  await page.waitForSelector('[data-testid=run-btn]:not([disabled])', { timeout: 30_000 })
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=result-screen]', { timeout: 180_000 })
  const note = (await page.textContent('[data-testid=result-screen]')) ?? ''
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('[data-testid=result-download]')])
  return { out: new Uint8Array(readFileSync(await dl.path())), note }
}

const shot = async (page, name) => SHOOT && page.screenshot({ path: join(SHOTS, `${name}.png`) })
const lineSel = (run) => `[data-testid=et-line][data-run="${run.id}"]`

// swap two middle letters (same length)
const swap = (s) => {
  const g = [...s]
  let i = 1
  while (i + 1 < g.length && g[i] === g[i + 1]) i++
  ;[g[i], g[i + 1]] = [g[i + 1], g[i]]
  return g.join('')
}

try {
  // ---------- AWS invoice: same length, longer, missing letter, Escape, undo/redo, Tab ----------
  if (want('aws')) {
    const rel = 'invoices/aws-invoice.pdf'
    const { model, picks } = await pickWords(rel, 4)
    const size = model.page
    const allText = (await textOf(readRel(rel))).join(' ')
    const miss = [...'QZXJqzxj'].find((c) => !allText.includes(c)) ?? 'Q'
    const [a, b, c, d] = picks
    const edits = [
      { p: a, text: swap(a.word.text), kind: 'same length' },
      { p: b, text: `${b.word.text}abc`, kind: 'longer' },
      { p: c, text: c.word.text[0] + miss + c.word.text.slice(2), kind: 'missing letter' },
    ]
    const { ctx, page } = await open(rel)
    await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
    check('aws: opens in Edit text mode', (await page.textContent('[data-testid=edit-mode] [aria-checked=true]')) === 'Edit text')
    await page.hover(lineSel(a.run))
    await page.waitForTimeout(250)
    await shot(page, 'hover-1440')
    await clickWord(page, size, a.word)
    await page.waitForSelector('[data-testid=et-input]')
    const shown = await page.inputValue('[data-testid=et-input]')
    check('aws: click opens the word in place', shown === a.word.text, `"${shown}" vs "${a.word.text}"`)
    const ib = await page.locator('[data-testid=et-input]').boundingBox()
    const sb = await stage(page).boundingBox()
    const wantX = sb.x + (a.word.bbox[0] / size.width) * sb.width
    check('aws: inline input sits over the word', Math.abs(ib.x - wantX) < 6, `x ${ib.x.toFixed(1)} vs ${wantX.toFixed(1)}`)
    await page.fill('[data-testid=et-input]', edits[0].text)
    await shot(page, 'inline-1440')
    await page.press('[data-testid=et-input]', 'Escape')
    await page.waitForTimeout(300)
    check('aws: Escape cancels (no input, no version)', !(await page.$('[data-testid=et-input]')) && (await version(page)) === 0)

    let v = 0
    for (const e of edits) {
      await page.waitForSelector('[data-testid=et-line]')
      await clickWord(page, size, e.p.word)
      const r = await typeApply(page, e.text, rel, e.kind)
      if (r.ok) v++
      check(`aws: ${e.kind} edit applied`, r.ok, r.ms ? `${r.ms.total} ms to re-render (engine ${r.ms.engine} ms)` : 'no timing')
      if (e.kind === 'missing letter') {
        const note = await page.waitForSelector('[data-testid=et-note]', { timeout: 10_000 }).then((h) => h.textContent()).catch(() => '')
        check('aws: fallback note shows', /Closest match: \S/.test(note), note)
        await shot(page, 'fallback-1440')
      }
    }
    // refusal: a character no font has
    await page.waitForSelector('[data-testid=et-line]')
    await clickWord(page, size, d.word)
    await page.waitForSelector('[data-testid=et-input]')
    await page.fill('[data-testid=et-input]', `${d.word.text}\u{1F600}`)
    await page.press('[data-testid=et-input]', 'Enter')
    const why = await page.waitForSelector('[data-testid=et-input-error]', { timeout: 5000 }).then((h) => h.textContent()).catch(() => '')
    const kept = await page.inputValue('[data-testid=et-input]').catch(() => '')
    check('aws: a character no font has is caught before applying, text kept', /No font here has the character/.test(why) && kept === `${d.word.text}\u{1F600}` && (await version(page)) === v, `"${why}"; version ${await version(page)}`)
    await shot(page, 'refusal-note-1440')
    await page.press('[data-testid=et-input]', 'Escape')

    // undo / redo
    await page.click('[data-testid=et-undo]')
    const undone = await waitVersion(page, v - 1, 10_000)
    await page.click('[data-testid=et-redo]')
    const redone = await waitVersion(page, v, 10_000)
    check('aws: undo and redo step through versions', undone && redone)

    // keyboard: Tab from one line to the next, Enter edits the whole line
    await page.waitForSelector('[data-testid=et-line]')
    const lines = page.locator('[data-testid=et-line]:not([aria-disabled])')
    await lines.nth(2).focus()
    const before = await page.evaluate(() => document.activeElement?.dataset.run)
    await page.keyboard.press('Tab')
    const after = await page.evaluate(() => document.activeElement?.dataset.run)
    const runText = await page.evaluate(() => document.activeElement?.getAttribute('aria-label')?.replace(/^Edit: /, ''))
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-testid=et-input]', { timeout: 5000 }).catch(() => null)
    const lineText = await page.inputValue('[data-testid=et-input]').catch(() => '')
    check('aws: Tab moves to the next line, Enter edits the whole line', before && after && before !== after && lineText === runText, `${before} -> ${after}, "${lineText}"`)
    await page.keyboard.press('Escape')

    const { out, note } = await runAndDownload(page)
    const text = squash((await textOf(out)).join(' '))
    // the old word may be part of the new one (longer): count the rest
    const left = (e) => count(text, squash(e.p.word.text)) - (squash(e.text).includes(squash(e.p.word.text)) ? count(text, squash(e.text)) : 0)
    const bad = edits.filter((e) => !text.includes(squash(e.text)) || left(e) > 0).map((e) => e.kind)
    check('aws: output has the new words, not the old ones (pdf.js)', bad.length === 0, bad.join(', '))
    check('aws: result note names the edits', /3 text edits/.test(note), note.slice(0, 160))
    await ctx.close()
  }

  // ---------- tracemonkey: whole-line edit, overflow, Fit to width ----------
  if (want('trace')) {
    const rel = 'reports/pdfjs-tracemonkey.pdf'
    const bytes = readRel(rel)
    const m = await pageTextModel(bytes, 1)
    const all = squash((await textOf(bytes)).join(' '))
    // a long body line that is unique in the file
    const run = m.runs.find((r) => r.editable && r.text.length > 50 && r.bbox[1] > 300 && count(all, squash(r.text)) === 1 && r.dir[0] === 1)
    const { ctx, page } = await open(rel)
    await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
    await clickWord(page, m.page, run.words[1], 'dbl')
    await page.waitForFunction((t) => document.querySelector('[data-testid=et-input]')?.value === t, run.text, { timeout: 10_000 }).catch(() => null)
    const val = await page.inputValue('[data-testid=et-input]').catch(() => '')
    check('trace: double-click opens the whole line', val === run.text, `"${val.slice(0, 40)}"`)
    const newText = `${run.text} with several extra words added here`
    const r = await typeApply(page, newText, rel, 'line')
    check('trace: whole-line edit applied', r.ok, r.ms ? `${r.ms.total} ms` : '')
    const note = await page.waitForSelector('[data-testid=et-note]', { timeout: 10_000 }).then((h) => h.textContent()).catch(() => '')
    check('trace: overflow note with Fit to width', /Runs past the margin/.test(note) && !!(await page.$('[data-testid=et-fit]')), note)
    await shot(page, 'overflow-1440')
    const v = await version(page)
    const ms0 = await page.getAttribute('[data-testid=et-live]', 'data-apply-ms')
    await page.click('[data-testid=et-fit]')
    // the version is replaced: same stack position, new timing once drawn
    for (let i = 0; i < 600; i++) {
      const t = await page.evaluate(() => document.querySelector('[data-testid=et-live]')?.dataset.applyMs ?? null)
      if (t && t !== ms0) break
      await page.waitForTimeout(100)
    }
    await waitVersion(page, v)
    await page.waitForTimeout(300)
    const note2 = await page.$$eval('[data-testid=et-note]', (ns) => ns.map((n) => n.textContent).join(' | ')).catch(() => '')
    check('trace: Fit to width replaces the version, overflow gone, says squeezed', (await version(page)) === v && !/Runs past/.test(note2) && /Squeezed/.test(note2), `version ${await version(page)}, notes "${note2}"`)
    const { out } = await runAndDownload(page)
    const text = squash((await textOf(out)).join(' '))
    check('trace: output has the new line (pdf.js)', text.includes(squash(newText)))
    await ctx.close()
  }

  // ---------- flipkart: Sold By line, longer billing line ----------
  if (want('flip')) {
    const rel = 'invoices/flipkart-invoice.pdf'
    const m = await pageTextModel(readRel(rel), 1)
    const sold = m.runs.find((r) => r.editable && /^WS Retail Services Pvt\. Ltd\.,/.test(r.text))
    const bill = m.runs.find((r) => r.editable && /near Fun republic mall/.test(r.text))
    const { ctx, page } = await open(rel)
    await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
    await clickWord(page, m.page, sold.words[1], 'dbl')
    await page.waitForFunction((t) => document.querySelector('[data-testid=et-input]')?.value === t, sold.text, { timeout: 10_000 }).catch(() => null)
    await page.fill('[data-testid=et-input]', 'WS Retail')
    await page.press('[data-testid=et-input]', 'Enter')
    let outcome = ''
    for (let i = 0; i < 300 && !outcome; i++) {
      if ((await version(page)) === 1) outcome = 'applied'
      else outcome = (await page.$$eval('[data-testid=et-note]', (ns) => ns.map((n) => n.textContent).find((t) => /Not changed/.test(t)) ?? '').catch(() => '')) || ''
      if (!outcome) await page.waitForTimeout(100)
    }
    check('flip: Sold By line edit applies, or says what to do in plain words', outcome === 'applied' || (/Not changed: /.test(outcome) && !/try again/.test(outcome)), outcome)
    await page.waitForSelector('[data-testid=et-line]')
    await clickWord(page, m.page, bill.words[1], 'dbl')
    await page.waitForFunction((t) => document.querySelector('[data-testid=et-input]')?.value === t, bill.text, { timeout: 10_000 }).catch(() => null)
    const r = await typeApply(page, `${bill.text} and the long road behind the station`, rel, 'flip line')
    const note = await page.waitForSelector('[data-testid=et-note]', { timeout: 10_000 }).then((h) => h.textContent()).catch(() => '')
    const nb = await page.locator('[data-testid=et-note]').first().boundingBox().catch(() => null)
    const sb = await stage(page).boundingBox()
    const nearWord = nb && Math.abs(nb.x - (sb.x + (bill.bbox[0] / m.page.width) * sb.width)) < 40
    check('flip: longer line says it runs over or was squeezed, at the edit', r.ok && /Runs past|Squeezed/.test(note) && nearWord, `${note}; near ${nearWord}`)
    await shot(page, 'overflow-flip-1440')
    await ctx.close()
  }

  // ---------- rotated page: the edit lands where the old word was ----------
  if (want('rot')) {
    const rel = 'derived/rot90-cropbox-bert.pdf'
    const { model, picks } = await pickWords(rel, 1)
    const { run, word } = picks[0]
    const { ctx, page } = await open(rel)
    await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
    await clickWord(page, model.page, word)
    await page.waitForSelector('[data-testid=et-input]')
    const ib = await page.locator('[data-testid=et-input]').boundingBox()
    check('rot: inline input turns with the text', run.dir[1] !== 0 ? ib.height > ib.width : ib.width > ib.height, `${ib.width.toFixed(0)}x${ib.height.toFixed(0)}, dir ${run.dir}`)
    await shot(page, 'rotated-1440')
    const newWord = swap(word.text)
    const r = await typeApply(page, newWord, rel, 'rotated')
    check('rot: edit applied', r.ok, r.ms ? `${r.ms.total} ms` : '')
    const { out } = await runAndDownload(page)
    const text = squash((await textOf(out)).join(' '))
    check('rot: output has the new word, not the old (pdf.js)', text.includes(newWord) && count(text, word.text) === 0)
    const hits = await findTextPositions(out, newWord, { pages: [1] })
    const ox = run.dir[1] !== 0 ? run.origin[0] : word.bbox[0]
    const oy = run.dir[1] !== 0 ? word.bbox[1] : run.origin[1]
    const near = hits.find((h) => Math.abs(h.fx * model.page.width - ox) < 4 && Math.abs(h.fy * model.page.height - oy) < 6)
    check('rot: new word lands in place on the rotated page', !!near, hits.map((h) => `(${(h.fx * model.page.width).toFixed(1)}, ${(h.fy * model.page.height).toFixed(1)})`).join(' ') + ` want (${ox.toFixed(1)}, ${oy.toFixed(1)})`)
    await ctx.close()
  }

  // ---------- Arabic word ----------
  if (want('arabic')) {
    const rel = 'intl/udhr-arabic.pdf'
    const { model, picks } = await pickWords(rel, 1, { script: /^[\p{Script=Arabic}]{4,}$/u })
    check('arabic: found an Arabic word', picks.length === 1)
    if (picks.length) {
      const { word } = picks[0]
      const { ctx, page } = await open(rel)
      await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
      await clickWord(page, model.page, word)
      await page.waitForSelector('[data-testid=et-input]')
      const dir = await page.$eval('[data-testid=et-input]', (el) => getComputedStyle(el).direction)
      const fam = await page.$eval('[data-testid=et-input]', (el) => getComputedStyle(el).fontFamily)
      check('arabic: editor uses an Arabic-capable font, right to left', dir === 'rtl' && /Arabic|Noto Sans/.test(fam), `${dir}, ${fam.slice(0, 40)}`)
      const newWord = swap(word.text)
      await shot(page, 'arabic-1440')
      const r = await typeApply(page, newWord, rel, 'arabic')
      check('arabic: edit applied', r.ok, `${r.ms ? `${r.ms.total} ms, ` : ''}input direction ${dir}`)
      const { out } = await runAndDownload(page)
      const text = squash((await textOf(out)).join(' '))
      // a word whose text layer has no letter mapping: refused before typing
      const bad = (await pageTextModel(readRel(rel), 1)).runs.flatMap((r) => (r.editable ? r.words.filter((w) => /\ufffd/.test(w.text)) : []))[0]
      if (bad) {
        const { ctx: c2, page: p2 } = await open(rel)
        await p2.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
        await clickWord(p2, model.page, bad)
        const note = await p2.waitForSelector('[data-testid=et-note]', { timeout: 10_000 }).then((h) => h.textContent()).catch(() => '')
        check('arabic: unreadable word is refused at once, no garbage in an editor', !(await p2.$('[data-testid=et-input]')) && /can't be read as letters/.test(note), note)
        await shot(p2, 'unreadable-1440')
        await c2.close()
      }
      check('arabic: output has the new word, not the old (pdf.js, NFKC)', text.includes(squash(newWord)) && count(text, squash(word.text)) === 0, `new ${text.includes(squash(newWord))}, old ${count(text, squash(word.text))}`)
      await ctx.close()
    }
  }

  // ---------- scanned page: banner, reason on hover, Open OCR ----------
  if (want('scan')) {
    const rel = 'scanned/fax-jean-schmidt-doe.pdf'
    const m = await pageTextModel(readRel(rel), 1)
    const { ctx, page } = await open(rel)
    const banner = await page.waitForSelector('[data-testid=et-scanned]', { timeout: 30_000 }).then((h) => h.textContent()).catch(() => '')
    check('scan: banner says run OCR first', /Scanned page: run OCR first/.test(banner), banner)
    const run = m.runs.find((r) => r.bbox[1] > 30)
    await page.hover(lineSel(run))
    await page.waitForTimeout(500)
    const tip = await page.$eval(`${lineSel(run)} [data-testid=et-tip]`, (el) => `${getComputedStyle(el).opacity}|${el.textContent}`).catch(() => '')
    check('scan: hover shows the reason', tip.startsWith('1|Scanned page: run OCR first'), tip)
    await shot(page, 'scanned-1440')
    await page.click('[data-testid=et-open-ocr]')
    await page.waitForFunction(() => location.hash === '#/ocr', null, { timeout: 5000 }).catch(() => null)
    check('scan: Open OCR goes to OCR', (await page.evaluate(() => location.hash)) === '#/ocr' && (await page.$$('[data-testid=run-btn]')).length > 0)
    await ctx.close()
  }

  // ---------- form field: reason says use Forms ----------
  if (want('fw9')) {
    const rel = 'forms/irs-fw9.pdf'
    const m = await pageTextModel(readRel(rel), 1)
    const run = m.runs.find((r) => r.why === 'form-field')
    const { ctx, page } = await open(rel)
    await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
    await page.locator(lineSel(run)).scrollIntoViewIfNeeded()
    await page.hover(lineSel(run))
    await page.waitForTimeout(500)
    const tip = await page.$eval(`${lineSel(run)} [data-testid=et-tip]`, (el) => `${getComputedStyle(el).opacity}|${el.textContent}`).catch(() => '')
    check('fw9: form field line says use Forms', tip === '1|This is a form field: use Forms', tip)
    await shot(page, 'refusal-tooltip-1440')
    await page.click(lineSel(run), { force: true })
    await page.waitForTimeout(300)
    check('fw9: clicking it opens no editor', !(await page.$('[data-testid=et-input]')))
    await ctx.close()
  }

  // ---------- signed file: confirm first, result says the signature went ----------
  if (want('signed')) {
    const rel = 'derived/edittext-signed.pdf'
    const { model, picks } = await pickWords(rel, 1)
    const { word } = picks[0]
    const { ctx, page } = await open(rel)
    await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
    await clickWord(page, model.page, word)
    const dlg = await page.waitForSelector('[data-testid=et-signed]', { timeout: 10_000 }).then((h) => h.textContent()).catch(() => '')
    check('signed: confirm before the first edit', /Editing removes the digital signature/.test(dlg) && !(await page.$('[data-testid=et-input]')), dlg.slice(0, 80))
    await shot(page, 'signed-1440')
    await page.click('[data-testid=et-signed-ok]')
    const newWord = swap(word.text)
    const r = await typeApply(page, newWord, rel, 'signed')
    check('signed: edit applied after yes', r.ok)
    const { out, note } = await runAndDownload(page)
    const text = squash((await textOf(out)).join(' '))
    check('signed: output has the new word, result says signature removed', text.includes(newWord) && count(text, word.text) === 0 && /Digital signature removed/.test(note), note.slice(0, 160))
    await ctx.close()
  }

  // ---------- phone 390: tap a word, edit, apply ----------
  if (want('phone')) {
    const rel = 'invoices/aws-invoice.pdf'
    const { model, picks } = await pickWords(rel, 2)
    const { ctx, page } = await open(rel, { phone: true })
    await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
    const [a, b] = picks
    await page.locator(lineSel(a.run)).scrollIntoViewIfNeeded()
    await page.hover(lineSel(a.run))
    await page.waitForTimeout(250)
    await shot(page, 'hover-390')
    await clickWord(page, model.page, a.word, 'tap')
    await page.waitForSelector('[data-testid=et-input]', { timeout: 10_000 }).catch(() => null)
    const val = await page.inputValue('[data-testid=et-input]').catch(() => '')
    check('phone: tap opens the word', val === a.word.text, `"${val}"`)
    const sizes = await page.evaluate(() => {
      const el = document.querySelector('[data-testid=et-input]')
      const wrap = document.querySelector('.g3-stage-wrap')
      return { font: parseFloat(getComputedStyle(el).fontSize), w: document.documentElement.scrollWidth, fits: wrap.scrollWidth <= wrap.clientWidth + 1 }
    })
    check('phone: page fitted to width, input at least 16 px', sizes.fits && sizes.font >= 16, `fits ${sizes.fits}, font ${sizes.font} px`)
    await page.fill('[data-testid=et-input]', `${a.word.text}xyz`)
    await shot(page, 'inline-390')
    await page.press('[data-testid=et-input]', 'Enter')
    const ok = await waitVersion(page, 1)
    check('phone: edit applied', ok, `input font ${sizes.font.toFixed(1)} px`)
    // a tap just above a line with room around it still hits it (24 px target)
    {
      const sb = await stage(page).boundingBox()
      const k = sb.width / model.page.width
      // a word whose point 4 px above it lies on no glyph box and is closest to its own line
      const inB = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]
      const mid = (b) => (b[1] + b[3]) / 2
      let lone = null
      let w = null
      for (const r of model.runs) {
        if (!r.editable || lone) continue
        for (const cand of r.words) {
          const x = (cand.bbox[0] + cand.bbox[2]) / 2
          const y = cand.bbox[1] - 4 / k
          if (model.runs.some((q) => inB(q.bbox, x, y))) continue
          const pads = model.runs.filter((q) => inB([q.bbox[0] - 4 / k, q.bbox[1] - Math.max(0, (24 / k - (q.bbox[3] - q.bbox[1])) / 2), q.bbox[2] + 4 / k, q.bbox[3] + Math.max(0, (24 / k - (q.bbox[3] - q.bbox[1])) / 2)], x, y))
          const best = pads.sort((a, b) => Math.abs(mid(a.bbox) - y) - Math.abs(mid(b.bbox) - y))[0]
          if (best === r) {
            lone = r
            w = cand
            break
          }
        }
      }
      if (lone) {
        await page.waitForSelector('[data-testid=et-line]')
        const position = await at(page, model.page, (w.bbox[0] + w.bbox[2]) / 2, w.bbox[1] - 4 / k)
        await stage(page).tap({ position })
        const got = await page.waitForSelector('[data-testid=et-input]', { timeout: 5000 }).then(() => page.inputValue('[data-testid=et-input]')).catch(() => '')
        check('phone: a tap 4 px above a word still opens it', got === w.text, `"${got}" vs "${w.text}"`)
        await page.keyboard.press('Escape')
      } else check('phone: a tap 4 px above a word still opens it', false, 'no isolated line found')
    }
    // a fallback note at phone width
    await page.waitForSelector('[data-testid=et-line]')
    await clickWord(page, model.page, b.word, 'tap')
    const r = await typeApply(page, b.word.text[0] + 'Q' + b.word.text.slice(2), rel, 'phone')
    await page.waitForSelector('[data-testid=et-note]', { timeout: 10_000 }).catch(() => null)
    await page.locator('[data-testid=et-note]').first().scrollIntoViewIfNeeded().catch(() => null)
    await shot(page, 'fallback-390')
    check('phone: second edit applied, no page side-scroll', r.ok && (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, `scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)}`)
    const { out } = await runAndDownload(page)
    const text = squash((await textOf(out)).join(' '))
    check('phone: output has the new word', text.includes(`${a.word.text}xyz`))
    await ctx.close()
  }

  // ---------- phone 390 screenshots: scanned banner, refusal tooltip, overflow ----------
  if (want('phone') && SHOOT) {
    {
      const { ctx, page } = await open('scanned/fax-jean-schmidt-doe.pdf', { phone: true })
      await page.waitForSelector('[data-testid=et-scanned]', { timeout: 30_000 }).catch(() => null)
      await shot(page, 'scanned-390')
      await ctx.close()
    }
    {
      const rel = 'forms/irs-fw9.pdf'
      const m = await pageTextModel(readRel(rel), 1)
      const run = m.runs.find((r) => r.why === 'form-field')
      const { ctx, page } = await open(rel, { phone: true })
      await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
      await page.locator(lineSel(run)).scrollIntoViewIfNeeded()
      await page.locator(lineSel(run)).tap({ force: true })
      await page.waitForTimeout(700)
      const tip = await page.$eval(`${lineSel(run)} [data-testid=et-tip]`, (el) => getComputedStyle(el).opacity).catch(() => '')
      check('phone: tapping a locked line shows the reason', tip === '1', `opacity ${tip}`)
      await shot(page, 'refusal-tooltip-390')
      await ctx.close()
    }
    {
      const rel = 'reports/pdfjs-tracemonkey.pdf'
      const m = await pageTextModel(readRel(rel), 1)
      const all = squash((await textOf(readRel(rel))).join(' '))
      const run = m.runs.find((r) => r.editable && r.text.length > 50 && r.bbox[1] > 300 && count(all, squash(r.text)) === 1 && r.dir[0] === 1)
      const { ctx, page } = await open(rel, { phone: true })
      await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
      await page.locator(lineSel(run)).scrollIntoViewIfNeeded()
      await page.locator(lineSel(run)).focus()
      await page.keyboard.press('Enter')
      await typeApply(page, `${run.text} with several extra words added here`, rel, 'phone line')
      await page.waitForSelector('[data-testid=et-note]', { timeout: 10_000 }).catch(() => null)
      await page.locator('[data-testid=et-note]').first().scrollIntoViewIfNeeded().catch(() => null)
      await shot(page, 'overflow-390')
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  await server.close()
}

// no request may carry file data: nothing posted, nothing off this machine
const local = (u) => /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|blob:|data:)/.test(u)
const offHost = requests.filter((r) => !local(r.url))
const posted = requests.filter((r) => r.post > 0 || !['GET', 'HEAD'].includes(r.method))
check('no request leaves the machine or carries data', offHost.length === 0 && posted.length === 0, `${requests.length} requests, ${offHost.length} off host ${offHost.slice(0, 2).map((r) => r.url).join(' ')}, ${posted.length} with a body`)

if (timings.length) {
  const tot = timings.map((t) => t.total).sort((a, b) => a - b)
  console.log(`apply to re-render: n=${tot.length} median ${tot[Math.floor(tot.length / 2)]} ms, max ${tot[tot.length - 1]} ms`)
  for (const t of timings) console.log(`  ${t.file} ${t.kind}: ${t.total} ms (engine ${t.engine} ms)`)
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
