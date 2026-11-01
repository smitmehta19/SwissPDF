// UI test for Edit PDF > Edit text on the real shell (dev server) with real
// corpus files: click a word or line, type, apply, notes, undo/redo, Escape,
// Tab, signed and scanned files, phone 390 tap-to-edit and editor bar,
// notes kept in view, paragraph editing (desktop and phone), right-to-left
// editors, Run and download.
// Output text is checked with pdf.js; requests are watched for file data.
// Sections: aws, trace, flip, rot, arabic, scan, fw9, signed, phone, note, para, shell, noparagraph, session, rtl
// Usage: CORPUS_OUT=edittextui node scripts/corpus-test/edittext-ui.mjs [--only aws,phone] [--no-shots]
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'
import { findTextPositions, textOf } from './validate.mjs'
import { pageTextModel } from '../../src/lib/editTextOps.js'

const CORPUS = join(ROOT, 'test-corpus')
// the app's paragraph switch (edittext.jsx): paragraph sections run only when it is on
const PARAGRAPH_EDIT = /export const PARAGRAPH_EDIT = true/.test(readFileSync(join(ROOT, 'src', 'tools', 'v2', 'edittext.jsx'), 'utf8'))
const modelOf = (bytes, page) => pageTextModel(bytes, page, { paragraphs: PARAGRAPH_EDIT })
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
const fold = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const count = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0)
// text the app refuses at once (no letter mapping)
const UNREADABLE = /[�\u0000-\u0008\u000e-\u001f\u007f-\u009f-]/u
const readRel = (rel) => new Uint8Array(readFileSync(join(CORPUS, rel)))

// A unique word in an editable line, not the last word of its line.
async function pickWords(rel, n, { script = /^[A-Za-z]{4,}$/, page = 1, skip = new Set() } = {}) {
  const bytes = readRel(rel)
  const m = await modelOf(bytes, page)
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
  // wall time from the click to the done screen with its Download button,
  // measured in the page (no test-tool polling in it)
  const wallP = page.evaluate(
    () =>
      new Promise((resolve) => {
        const t0 = performance.now()
        const obs = new MutationObserver(() => {
          if (!document.querySelector('[data-testid=result-download]')) return
          obs.disconnect()
          resolve(Math.round(performance.now() - t0))
        })
        obs.observe(document.body, { childList: true, subtree: true })
        document.querySelector('[data-testid=run-btn]').click()
      }),
  )
  const wall = await Promise.race([wallP, page.waitForTimeout(180_000).then(() => null)])
  await page.waitForSelector('[data-testid=result-screen]', { timeout: 10_000 })
  const note = (await page.textContent('[data-testid=result-screen]')) ?? ''
  // "Time 0.4 s", or "Time under 0.1 s" (counted as 100 ms)
  const t = note.match(/Time\s*(under\s)?([\d.]+)\s(ms|s)/)
  const shownMs = t ? Number(t[2]) * (t[3] === 's' ? 1000 : 1) : null
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('[data-testid=result-download]')])
  return { out: new Uint8Array(readFileSync(await dl.path())), note, wall, shownMs }
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
    const m = await modelOf(bytes, 1)
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
    // P2-7: the note sits outside the edited line, not on it
    {
      const nb = await page.locator('[data-testid=et-note]').first().boundingBox().catch(() => null)
      const sb = await stage(page).boundingBox()
      const k = sb.width / m.page.width
      const lb = { x0: sb.x + run.bbox[0] * k, y0: sb.y + run.bbox[1] * k, x1: sb.x + run.bbox[2] * k, y1: sb.y + run.bbox[3] * k }
      const hits = nb && nb.x < lb.x1 && lb.x0 < nb.x + nb.width && nb.y < lb.y1 && lb.y0 < nb.y + nb.height
      check('trace: the note does not cover the edited line (P2-7)', !!nb && !hits, nb ? `note y ${nb.y.toFixed(0)}..${(nb.y + nb.height).toFixed(0)}, line y ${lb.y0.toFixed(0)}..${lb.y1.toFixed(0)}` : 'no note')
    }
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
    const m = await modelOf(readRel(rel), 1)
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
      const bad = (await modelOf(readRel(rel), 1)).runs.flatMap((r) => (r.editable ? r.words.filter((w) => /\ufffd/.test(w.text)) : []))[0]
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
    const m = await modelOf(readRel(rel), 1)
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
    const m = await modelOf(readRel(rel), 1)
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
    // P2-6: an empty text field (no text on the page there) says to use Forms
    {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const doc = await pdfjs.getDocument({ data: readRel(rel), isEvalSupported: false }).promise
      const pg = await doc.getPage(1)
      const vp = pg.getViewport({ scale: 1 })
      const boxes = (await pg.getAnnotations())
        .filter((a) => a.subtype === 'Widget' && a.fieldType === 'Tx' && !a.fieldValue)
        .map((a) => {
          const [x0, y0, x1, y1] = vp.convertToViewportRectangle(a.rect)
          return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]
        })
      await doc.destroy()
      const inB = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]
      const field = boxes.sort((a, b) => b[2] - b[0] - (a[2] - a[0])).find((b) => !m.runs.some((r) => inB(r.bbox, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2)))
      if (!field) check('fw9: an empty form field click says use Forms', false, 'no empty field found')
      else {
        await stage(page).click({ position: await at(page, m.page, (field[0] + field[2]) / 2, (field[1] + field[3]) / 2) })
        const note = await page.waitForSelector('[data-testid=et-note]', { timeout: 5000 }).then((h) => h.textContent()).catch(() => '')
        check('fw9: an empty form field click says use Forms, with a way there (P2-6)', /This is a form field: use Forms/.test(note) && !!(await page.$('[data-testid=et-open-forms]')), note)
        await shot(page, 'form-field-1440')
        await page.click('[data-testid=et-open-forms]')
        await page.waitForFunction(() => location.hash === '#/forms', null, { timeout: 5000 }).catch(() => null)
        check('fw9: Open Forms goes to Forms', (await page.evaluate(() => location.hash)) === '#/forms')
      }
    }
    await ctx.close()
    // P2-8: a word edit low on the W-9 page does not scroll the view
    {
      const { ctx: c2, page: p2 } = await open(rel)
      await p2.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
      const { picks } = await pickWords(rel, 8)
      const low = picks.filter((x) => x.word.bbox[1] > m.page.height * 0.45)[0]
      if (!low) check('fw9: found a word low on the page', false)
      else {
        await p2.locator(lineSel(low.run)).scrollIntoViewIfNeeded()
        const scrollOf = () => p2.evaluate(() => ({ win: window.scrollY, wrap: document.querySelector('.g3-stage-wrap')?.scrollTop ?? 0 }))
        const s0 = await scrollOf()
        await clickWord(p2, m.page, low.word)
        const r = await typeApply(p2, swap(low.word.text), rel, 'fw9 low word')
        // hybrid form: the engine drops the XFA copy and the UI says so once
        const xn = await p2.$$eval('[data-testid=et-note]', (ns) => ns.map((n) => n.textContent).join(' | ')).catch(() => '')
        if (/XFA copy/.test(xn)) check('fw9: the note says the XFA copy was removed', /This form also had an XFA copy; it was removed so the old text can't be read from it/.test(xn), xn.slice(0, 160))
        else console.log(`SKIP  fw9: no XFA note (engine xfaRemoved not returned yet?): "${xn.slice(0, 80)}"`)
        await p2.waitForTimeout(800)
        const s1 = await scrollOf()
        check('fw9: an edit low on the page does not scroll the view (P2-8)', r.ok && JSON.stringify(s0) === JSON.stringify(s1), `${JSON.stringify(s0)} -> ${JSON.stringify(s1)}`)
      }
      await c2.close()
    }
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
    // a tap just off a line still hits it: a finger picks the closest
    // editable line within 22 px (measured to its box), as the app does
    {
      const sb = await stage(page).boundingBox()
      const k = sb.width / model.page.width
      const inB = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]
      const dist = (b, x, y) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3])) * k
      // the word whose point `off` px above it lies on no box, with its own line
      // the clear closest (2 px margin) and within 22 px
      const used = new Set([a.run.id, b.run.id]) // edited below
      const pick = (off, dense) => {
        for (const r of model.runs) {
          if (!r.editable || used.has(r.id)) continue
          // dense: another line within 12 px above or below (P2 #3)
          if (dense && !model.runs.some((q) => q !== r && q.editable && Math.abs(q.bbox[1] - r.bbox[1]) * k < 12 && Math.abs(q.bbox[1] - r.bbox[1]) > 0.5 && q.bbox[0] < r.bbox[2] && r.bbox[0] < q.bbox[2])) continue
          for (const cand of r.words) {
            const x = (cand.bbox[0] + cand.bbox[2]) / 2
            const y = cand.bbox[1] - off / k
            if (model.runs.some((q) => inB(q.bbox, x, y))) continue
            const near = model.runs.filter((q) => q.editable).map((q) => ({ q, d: dist(q.bbox, x, y) })).sort((p, q) => p.d - q.d)
            if (near[0]?.q === r && near[0].d <= 22 && (!near[1] || near[1].d - near[0].d > 2)) return { r, w: cand, x, y }
          }
        }
        return null
      }
      for (const [name, off, dense] of [
        ['a tap 4 px above a word still opens it', 4, false],
        ['P2 #3 dense lines: a tap 3 px off a 6 to 10 px line opens the closest line', 3, true],
        ['a tap 15 px above a lone line still opens it (22 px reach)', 15, false],
      ]) {
        const hit = pick(off, dense)
        if (!hit) {
          check(`phone: ${name}`, false, 'no suitable line found')
          continue
        }
        used.add(hit.r.id)
        await page.waitForSelector('[data-testid=et-line]')
        const position = await at(page, model.page, hit.x, hit.y)
        await stage(page).tap({ position })
        const got = await page.waitForSelector('[data-testid=et-input]', { timeout: 5000 }).then(() => page.inputValue('[data-testid=et-input]')).catch(() => '')
        check(`phone: ${name}`, hit.r.words.some((x) => x.text === got), `"${got}" in "${hit.r.text.slice(0, 50)}" (${((hit.r.bbox[3] - hit.r.bbox[1]) * k).toFixed(1)} px tall)`)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(150)
      }
    }
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
    // P2 #3: the editor is a bar at the bottom, the page only highlights the word
    {
      await page.waitForTimeout(400) // the bar slides in
      const bar = await page.evaluate(() => {
        const b = document.querySelector('[data-testid=et-bar]')
        const input = document.querySelector('[data-testid=et-input]')
        if (!b) return null
        const r = b.getBoundingClientRect()
        const btns = [...b.querySelectorAll('button')].map((x) => Math.round(x.getBoundingClientRect().height))
        return { top: r.top, bottom: r.bottom, vh: window.innerHeight, inStage: !!input.closest('[data-testid=edit-canvas]'), inBar: b.contains(input), btns, focused: document.activeElement === input }
      })
      check('phone: editor opens as a bar at the bottom, not over the page', !!bar && bar.inBar && !bar.inStage && Math.abs(bar.bottom - bar.vh) <= 2 && bar.focused, JSON.stringify(bar))
      check('phone: bar buttons are at least 44 px tall', !!bar && bar.btns.length >= 2 && bar.btns.every((h) => h >= 44), `${bar?.btns}`)
      const hl = await page.locator('[data-testid=et-hl]').first().boundingBox().catch(() => null)
      const sb = await stage(page).boundingBox()
      const k = sb.width / model.page.width
      const want = { x: sb.x + a.word.bbox[0] * k, y: sb.y + a.word.bbox[1] * k }
      check('phone: the page highlights the word being edited', !!hl && Math.abs(hl.x - want.x) < 3 && Math.abs(hl.y - want.y) < 3, hl ? `(${hl.x.toFixed(1)}, ${hl.y.toFixed(1)}) vs (${want.x.toFixed(1)}, ${want.y.toFixed(1)})` : 'no highlight')
    }
    await page.fill('[data-testid=et-input]', `${a.word.text}xyz`)
    await shot(page, 'inline-390')
    await shot(page, 'bar-390')
    await page.press('[data-testid=et-input]', 'Enter')
    const ok = await waitVersion(page, 1)
    check('phone: edit applied', ok, `input font ${sizes.font.toFixed(1)} px`)
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
      const m = await modelOf(readRel(rel), 1)
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
      const m = await modelOf(readRel(rel), 1)
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

  // ---------- P2 #4: a note at the right edge stays inside the visible canvas ----------
  if (want('note')) {
    const rel = 'intl/udhr-arabic.pdf'
    const m = await modelOf(readRel(rel), 1)
    // the unreadable word furthest right: clicking it gives a refusal note at once
    const bad = m.runs
      .flatMap((r) => (r.editable ? r.words.filter((w) => UNREADABLE.test(w.text)) : []))
      .sort((p, q) => q.bbox[0] - p.bbox[0])[0]
    if (!bad) check('note: found a right-edge word with a refusal', false)
    else {
      for (const phone of [false, true]) {
        const tag = phone ? '390' : '1440'
        const { ctx, page } = await open(rel, { phone })
        await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
        // desktop: also zoomed in, where the wrap clips the page
        for (const zoom of phone ? [0] : [0, 3]) {
          for (let i = 0; i < zoom; i++) await page.click('[data-testid=g3-zoom-in]')
          if (zoom) await page.waitForTimeout(400)
          await clickWord(page, m.page, bad, phone ? 'tap' : 'click')
          await page.waitForSelector('[data-testid=et-note]', { timeout: 10_000 }).catch(() => null)
          await page.waitForTimeout(250)
          const r = await page.evaluate(() => {
            const n = document.querySelector('[data-testid=et-note]')
            const wrap = document.querySelector('.g3-stage-wrap')
            const st = document.querySelector('[data-testid=edit-canvas]')
            if (!n) return null
            const a = n.getBoundingClientRect()
            const w = wrap.getBoundingClientRect()
            const s = st.getBoundingClientRect()
            const right = Math.min(w.left + wrap.clientLeft + wrap.clientWidth, s.right, window.innerWidth)
            const left = Math.max(w.left + wrap.clientLeft, s.left, 0)
            return { l: a.left, r: a.right, left, right, text: n.textContent }
          })
          const inside = !!r && r.l >= r.left - 0.5 && r.r <= r.right + 0.5
          check(`note: refusal note at the right edge stays in view (${tag}${zoom ? ', zoomed in' : ''})`, inside && /Not changed/.test(r.text), r ? `note ${r.l.toFixed(0)}..${r.r.toFixed(0)}, visible ${r.left.toFixed(0)}..${r.right.toFixed(0)}` : 'no note')
          await shot(page, `refusal-edge-${tag}${zoom ? '-zoom' : ''}`)
        }
        await ctx.close()
      }
    }
  }

  // ---------- paragraph: open, type, apply, undo, refusal, keyboard ----------
  const parasOf = (m) => (PARAGRAPH_EDIT ? (m.paragraphs ?? null) : null)
  if (want('para')) {
    const rel = 'reports/pdfjs-tracemonkey.pdf'
    const bytes = readRel(rel)
    const m = await modelOf(bytes, 1)
    const all = squash((await textOf(bytes)).join(' '))
    const ps = parasOf(m)
    if (!ps) {
      console.log(PARAGRAPH_EDIT ? 'SKIP  para: the page model has no paragraphs yet (engine)' : 'SKIP  para: paragraph editing is off (PARAGRAPH_EDIT false in edittext.jsx)')
    } else {
      const byId = new Map(m.runs.map((r) => [r.id, r]))
      // an editable left-to-right body paragraph of 3+ lines, with a unique
      // word of 5+ letters in its middle line
      let para = null
      let word = null
      for (const p of ps) {
        // body text: plain ASCII (the author block has U+2217 marks)
        if (!p.editable || p.dir === 'rtl' || p.runIds.length < 3 || p.text.length < 150 || !/^[\x20-\x7e\n]+$/.test(p.text)) continue
        const mid = byId.get(p.runIds[1])
        const w = mid?.words.find((x) => /^[A-Za-z]{5,}$/.test(x.text) && count(all, x.text) === 1 && count(p.text, x.text) === 1)
        if (w) {
          para = p
          word = { run: mid, w }
          break
        }
      }
      if (!para) check('para: found a body paragraph to edit', false)
      else {
        const { ctx, page } = await open(rel)
        await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
        const [cx, cy] = center(word.w.bbox)
        await stage(page).click({ position: await at(page, m.page, cx, cy), clickCount: 3 })
        await page.waitForSelector('[data-testid=et-para]', { timeout: 10_000 }).catch(() => null)
        const val = await page.inputValue('[data-testid=et-para]').catch(() => '')
        check('para: triple-click opens the whole paragraph', fold(val) === fold(para.text), `"${val.slice(0, 60)}..."`)
        const tb = await page.locator('[data-testid=et-para]').boundingBox().catch(() => null)
        const sb = await stage(page).boundingBox()
        const k = sb.width / m.page.width
        check('para: the editor sits over the paragraph', !!tb && Math.abs(tb.x - (sb.x + para.bbox[0] * k)) < 6 && Math.abs(tb.width - (para.bbox[2] - para.bbox[0]) * k) < 12, tb ? `x ${tb.x.toFixed(0)} w ${tb.width.toFixed(0)}` : '')
        // Enter is a new line in a paragraph, not apply
        await page.press('[data-testid=et-para]', 'Control+End')
        await page.keyboard.press('Enter')
        const nl = await page.inputValue('[data-testid=et-para]').catch(() => '')
        check('para: Enter adds a new line', nl.endsWith('\n') && (await version(page)) === 0)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(200)
        check('para: Escape cancels', !(await page.$('[data-testid=et-para]')) && (await version(page)) === 0)
        // mouse: the toolbar's Paragraph button switches an open word editor;
        // nothing in the toolbar moves when it turns on (P2-10)
        const undoBefore = await page.locator('[data-testid=et-undo]').boundingBox()
        await clickWord(page, m.page, word.w)
        await page.waitForSelector('[data-testid=et-para-tool]:not([disabled])', { timeout: 5000 }).catch(() => null)
        const undoAfter = await page.locator('[data-testid=et-undo]').boundingBox()
        check('para: toolbar stays put when a word editor opens', !!undoBefore && !!undoAfter && Math.abs(undoBefore.x - undoAfter.x) < 0.5 && Math.abs(undoBefore.y - undoAfter.y) < 0.5, `undo x ${undoBefore?.x.toFixed(1)} -> ${undoAfter?.x.toFixed(1)}`)
        await page.click('[data-testid=et-para-tool]').catch(() => null)
        const tv = await page.waitForSelector('[data-testid=et-para]', { timeout: 5000 }).then(() => page.inputValue('[data-testid=et-para]')).catch(() => '')
        check('para: Paragraph in the toolbar opens the paragraph, nothing applied', fold(tv) === fold(para.text) && (await version(page)) === 0)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(200)
        // keyboard: Shift+Enter on a focused line opens its paragraph
        await page.locator(lineSel(word.run)).focus()
        await page.keyboard.press('Shift+Enter')
        const kv = await page.waitForSelector('[data-testid=et-para]', { timeout: 5000 }).then(() => page.inputValue('[data-testid=et-para]')).catch(() => '')
        check('para: Shift+Enter on a line opens its paragraph', fold(kv) === fold(para.text))
        const newWord = swap(word.w.text)
        const newText = para.text.replace(word.w.text, newWord)
        await page.fill('[data-testid=et-para]', newText)
        await shot(page, 'paragraph-1440')
        const scrollOf = () => page.evaluate(() => ({ win: window.scrollY, wrap: document.querySelector('.g3-stage-wrap')?.scrollTop ?? 0, main: document.querySelector('.main')?.scrollTop ?? 0 }))
        const scroll0 = await scrollOf()
        await page.keyboard.press('Control+Enter')
        const ok = await waitVersion(page, 1)
        await page.waitForTimeout(600)
        const notes = await page.$$eval('[data-testid=et-note]', (ns) => ns.map((n) => n.textContent).join(' | ')).catch(() => '')
        check('para: Ctrl+Enter applies the paragraph', ok, notes || 'no note')
        const scroll1 = await scrollOf()
        check('para: the view does not scroll by itself after the apply (P2-8)', JSON.stringify(scroll0) === JSON.stringify(scroll1), `${JSON.stringify(scroll0)} -> ${JSON.stringify(scroll1)}`)
        const focusBack = await page.evaluate(() => document.activeElement?.dataset?.testid ?? document.activeElement?.tagName)
        check('para: focus returns to the page text', focusBack === 'et-line', focusBack)
        // P2-7: the note sits outside the changed paragraph
        {
          const nb = await page.locator('[data-testid=et-note]').first().boundingBox().catch(() => null)
          const sb2 = await stage(page).boundingBox()
          const k2 = sb2.width / m.page.width
          const pb = { x0: sb2.x + para.bbox[0] * k2, y0: sb2.y + para.bbox[1] * k2, x1: sb2.x + para.bbox[2] * k2, y1: sb2.y + para.bbox[3] * k2 }
          const hits = nb && nb.x < pb.x1 && pb.x0 < nb.x + nb.width && nb.y < pb.y1 && pb.y0 < nb.y + nb.height
          if (nb) check('para: the note does not cover the changed paragraph (P2-7)', !hits, `note y ${nb.y.toFixed(0)}..${(nb.y + nb.height).toFixed(0)}, paragraph y ${pb.y0.toFixed(0)}..${pb.y1.toFixed(0)}`)
          else console.log('SKIP  para: no note after the paragraph edit, placement not checked')
        }
        const countText = () => page.textContent('[data-testid=et-count]').catch(() => '')
        check('para: a paragraph edit counts as 1 text edit (P2-9)', /^1 text edit applied/.test(await countText()), await countText())
        if (!ok) check('para: undo, refusal and output', false, 'nothing applied, skipped')
        else {
          await page.click('[data-testid=et-undo]')
          const undone = await waitVersion(page, 0, 10_000)
          const c0 = await countText()
          await page.click('[data-testid=et-redo]')
          const redone = await waitVersion(page, 1, 10_000)
          check('para: undo and redo, the counter follows', undone && redone && /No text changed/.test(c0) && /^1 text edit applied/.test(await countText()), `${c0} / ${await countText()}`)
          // refusal: far too long for the room below
          const fresh = await modelOf(readRel(rel), 1)
          const p2 = parasOf(fresh).find((p) => p.editable && p.dir !== 'rtl' && p.runIds.length >= 3 && p.id !== para.id && p.text.length > 150 && /^[\x20-\x7e\n]+$/.test(p.text) && p.bbox[1] > para.bbox[3])
          if (p2) {
            await page.waitForSelector('[data-testid=et-line]')
            const r2 = fresh.runs.find((r) => r.id === p2.runIds[0])
            await page.locator(lineSel(r2)).focus()
            await page.keyboard.press('Shift+Enter')
            await page.waitForSelector('[data-testid=et-para]', { timeout: 5000 }).catch(() => null)
            const tooLong = `${p2.text} `.repeat(8).trim()
            await page.fill('[data-testid=et-para]', tooLong)
            await page.keyboard.press('Control+Enter')
            // P1-6: refused, the editor comes back with the typed text and the reason
            let why = ''
            for (let i = 0; i < 600 && !why; i++) {
              why = (await page.textContent('[data-testid=et-input-error]').catch(() => '')) || ''
              if (!why) await page.waitForTimeout(100)
            }
            const kept = await page.inputValue('[data-testid=et-para]').catch(() => '')
            check('para: too long is refused in plain words, nothing changes', /Not changed: Not enough room/.test(why) && (await version(page)) === 1, `${why}; version ${await version(page)}`)
            check('para: the refused text stays in the editor to shorten (P1-6)', kept === tooLong, `${kept.length} of ${tooLong.length} chars`)
            await shot(page, 'paragraph-refusal-1440')
            await page.keyboard.press('Escape')
            await page.waitForTimeout(200)
            // a word edit after the paragraph: the counter goes to 2
            const wr = fresh.runs.find((r) => r.id === p2.runIds[1])
            const w2 = wr?.words.find((x) => /^[a-z]{4,}$/.test(x.text))
            if (w2) {
              await clickWord(page, m.page, w2)
              await typeApply(page, swap(w2.text), rel, 'word after paragraph')
              check('para: then a word edit makes 2 text edits (P2-9)', /^2 text edits applied/.test(await countText()), await countText())
            }
          } else check('para: found a second paragraph for the refusal', false)
          const { out, wall, shownMs, note: doneText } = await runAndDownload(page)
          const text = squash((await textOf(out)).join(' '))
          check('para: output has the new word, not the old (pdf.js)', text.includes(newWord) && count(text, word.w.text) === 0, `new ${text.includes(newWord)}, old ${count(text, word.w.text)}`)
          check('para: Apply to the done screen is quick and the shown time matches (P2-11)', wall < 1500 && shownMs != null && Math.abs(wall - shownMs) < 400, `wall ${wall} ms, shown ${shownMs} ms`)
          check('para: the done screen never says "0.0 s"', !/Time\s*0\.0 s/.test(doneText) && /Time\s*(under 0\.1 s|\d)/.test(doneText), (doneText.match(/Time[^A-Za-z]*(under [\d.]+ s)?/) ?? [''])[0])
        }
        await ctx.close()
      }

      // phone: tap a word, Paragraph in the bar, edit, Apply
      if (para) {
        const { ctx, page } = await open(rel, { phone: true })
        await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
        await page.locator(lineSel(word.run)).scrollIntoViewIfNeeded()
        await clickWord(page, m.page, word.w, 'tap')
        await page.waitForSelector('[data-testid=et-para-btn]', { timeout: 10_000 }).catch(() => null)
        await page.tap('[data-testid=et-para-btn]').catch(() => null)
        const val = await page.waitForSelector('[data-testid=et-bar] [data-testid=et-para]', { timeout: 5000 }).then(() => page.inputValue('[data-testid=et-para]')).catch(() => '')
        check('para phone: Paragraph in the bar opens the paragraph', fold(val) === fold(para.text))
        const hl = await page.locator('[data-testid=et-hl]').first().boundingBox().catch(() => null)
        const sb = await stage(page).boundingBox()
        const k = sb.width / m.page.width
        check('para phone: the page highlights the whole paragraph', !!hl && Math.abs(hl.y - (sb.y + para.bbox[1] * k)) < 3 && Math.abs(hl.height - (para.bbox[3] - para.bbox[1]) * k) < 3, hl ? `${hl.y.toFixed(0)} h ${hl.height.toFixed(0)}` : 'none')
        const newWord = swap(word.w.text)
        await page.fill('[data-testid=et-para]', para.text.replace(word.w.text, newWord))
        await shot(page, 'paragraph-390')
        await page.tap('[data-testid=et-apply]')
        check('para phone: Apply applies', await waitVersion(page, 1))
        await ctx.close()
      }
    }
  }

  // ---------- shell: notice does not move the page, Run with an editor open ----------
  if (want('shell')) {
    const rel = 'invoices/aws-invoice.pdf'
    const { picks } = await pickWords(rel, 1)
    const { model } = await pickWords(rel, 0)
    const { ctx, page } = await open(rel)
    await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
    // the "already in your files" notice floats: the page does not move when it comes or goes
    const top0 = (await stage(page).boundingBox()).y
    await page.setInputFiles('[data-testid=add-files-input]', join(CORPUS, rel))
    const shown = await page.waitForSelector('[data-testid=shell-notice]', { timeout: 10_000 }).then((h) => h.textContent()).catch(() => '')
    await page.waitForSelector('[data-testid=edit-canvas] img', { timeout: 30_000 })
    await page.waitForTimeout(300)
    const top1 = (await stage(page).boundingBox()).y
    await page.click('[data-testid=shell-notice] button')
    await page.waitForTimeout(300)
    const top2 = (await stage(page).boundingBox()).y
    check('shell: the "already in your files" notice does not move the page (P2-8)', /already in your files/.test(shown) && Math.abs(top1 - top0) < 1 && Math.abs(top2 - top0) < 1, `stage top ${top0.toFixed(1)} -> ${top1.toFixed(1)} -> ${top2.toFixed(1)}`)
    // one click on Run with a word still open in its editor: the edit goes in, then the run
    const { word } = picks[0]
    await page.waitForSelector('[data-testid=et-line]')
    await clickWord(page, model.page, word)
    await page.waitForSelector('[data-testid=et-input]')
    const newWord = swap(word.text)
    await page.fill('[data-testid=et-input]', newWord)
    await page.click('[data-testid=run-btn]')
    const done = await page.waitForSelector('[data-testid=result-screen]', { timeout: 60_000 }).then(() => true).catch(() => false)
    let ok = false
    if (done) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.click('[data-testid=result-download]')])
      const text = squash((await textOf(new Uint8Array(readFileSync(await dl.path())))).join(' '))
      ok = text.includes(newWord) && count(text, word.text) === 0
    }
    check('shell: one Run click with an editor open applies the edit, then runs (P2-11)', done && ok, `done ${done}, edit in output ${ok}`)
    await ctx.close()
  }
  // one Run click on a word the engine refuses (a character no font has,
  // sent by the click away): no run, the editor keeps the text
  if (want('shell')) {
    const rel = 'invoices/aws-invoice.pdf'
    const { model, picks } = await pickWords(rel, 1)
    const { word } = picks[0]
    const { ctx, page } = await open(rel)
    await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
    await clickWord(page, model.page, word)
    await page.waitForSelector('[data-testid=et-input]')
    const typed = `${word.text}😀`
    await page.fill('[data-testid=et-input]', typed)
    await page.click('[data-testid=run-btn]')
    let why = ''
    for (let i = 0; i < 300 && !why; i++) {
      why = (await page.textContent('[data-testid=et-input-error]').catch(() => '')) || ''
      if (!why) await page.waitForTimeout(100)
    }
    await page.waitForTimeout(500)
    const ran = !!(await page.$('[data-testid=result-screen]'))
    const kept = await page.inputValue('[data-testid=et-input]').catch(() => '')
    check('shell: a refused edit stops the held Run, the text stays in its editor (P1-6)', !ran && /Not changed|No font/.test(why) && kept === typed, `ran ${ran}, "${why.slice(0, 60)}", kept "${kept}"`)
    await ctx.close()
  }

  // ---------- paragraph editing off: no Paragraph button, triple-click edits the line ----------
  if (want('noparagraph') && !PARAGRAPH_EDIT) {
    const rel = 'reports/pdfjs-tracemonkey.pdf'
    const m = await modelOf(readRel(rel), 1)
    const all = squash((await textOf(readRel(rel))).join(' '))
    const run = m.runs.find((r) => r.editable && r.text.length > 40 && r.bbox[1] > 300 && count(all, squash(r.text)) === 1 && r.dir[0] === 1)
    for (const phone of [false, true]) {
      const tag = phone ? '390' : '1440'
      const { ctx, page } = await open(rel, { phone })
      await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
      check(`noparagraph ${tag}: no Paragraph button in the toolbar`, !(await page.$('[data-testid=et-para-tool]')))
      await page.locator(lineSel(run)).scrollIntoViewIfNeeded()
      const [cx, cy] = center(run.words[1].bbox)
      const position = await at(page, m.page, cx, cy)
      if (phone) await stage(page).tap({ position })
      else await stage(page).click({ position, clickCount: 3 })
      await page.waitForSelector('[data-testid=et-input]', { timeout: 10_000 }).catch(() => null)
      await page.waitForTimeout(300)
      const val = await page.inputValue('[data-testid=et-input]').catch(() => '')
      const para = await page.$('[data-testid=et-para]')
      if (phone) {
        check('noparagraph 390: the bar has no Paragraph button', !!(await page.$('[data-testid=et-bar]')) && !(await page.$('[data-testid=et-para-btn]')))
        const btns = await page.$$eval('[data-testid=et-bar] button', (bs) => bs.map((b) => b.textContent.trim()))
        check('noparagraph 390: the bar shows Cancel and Apply only', btns.join(',') === 'Cancel,Apply', btns.join(','))
        await shot(page, 'bar-noparagraph-390')
      } else {
        check('noparagraph 1440: triple-click opens the whole line, no paragraph editor', val === run.text && !para, `"${val.slice(0, 50)}"`)
        await page.keyboard.press('Escape')
        await page.locator(lineSel(run)).focus()
        await page.keyboard.press('Shift+Enter')
        await page.waitForSelector('[data-testid=et-input]', { timeout: 5000 }).catch(() => null)
        const kv = await page.inputValue('[data-testid=et-input]').catch(() => '')
        check('noparagraph 1440: Shift+Enter edits the line, no paragraph editor', kv === run.text && !(await page.$('[data-testid=et-para]')), `"${kv.slice(0, 50)}"`)
        // apply the line, then the done screen time is honest
        const r = await typeApply(page, `${run.text} more`, rel, 'line via Shift+Enter')
        const c = await page.textContent('[data-testid=et-count]').catch(() => '')
        check('noparagraph 1440: the counter counts the edit', r.ok && /^1 text edit applied/.test(c), c)
        await shot(page, 'toolbar-noparagraph-1440')
        const { wall, shownMs, note } = await runAndDownload(page)
        check('noparagraph 1440: Apply is quick, the shown time matches, never "0.0 s"', wall < 1500 && shownMs != null && Math.abs(wall - shownMs) < 400 && !/Time\s*0\.0 s/.test(note), `wall ${wall} ms, shown ${shownMs} ms`)
      }
      await ctx.close()
    }
  }


  // ---------- unsaved edits: never applied to a file the user is not on ----------
  if (want('session')) {
    const aws = 'invoices/aws-invoice.pdf'
    const flip = 'invoices/flipkart-invoice.pdf'
    const { model, picks } = await pickWords(aws, 2)
    const fm = await pickWords(flip, 1)
    const [a, b] = picks
    const { ctx, page } = await open(aws)
    page.on('dialog', (d) => d.accept()) // the unsaved-edits prompt on reload
    await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
    // 1. an edit applied on screen but not saved (no Run), then a reload
    await clickWord(page, model.page, a.word)
    const r1 = await typeApply(page, swap(a.word.text), aws, 'session first')
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('.modes [role=tab]', { timeout: 60_000 })
    await page.click('.modes [role=tab]:has-text("Files")')
    const sel = page.locator('.grid-toolbar .link', { hasText: 'Select all' })
    if (await sel.count()) await sel.first().click()
    await page.click('.modes [role=tab]:has-text("Viewer")')
    await page.waitForSelector('[data-testid=et-line]', { timeout: 60_000 })
    const count0 = await page.textContent('[data-testid=et-count]').catch(() => '')
    await clickWord(page, model.page, b.word)
    await typeApply(page, swap(b.word.text), aws, 'session after reload')
    // 2. add another file while editing: it becomes the only selection
    await page.setInputFiles('[data-testid=add-files-input]', join(CORPUS, flip))
    await page.waitForFunction(() => document.querySelector('.g3-file-name')?.textContent?.includes('flipkart'), null, { timeout: 30_000 }).catch(() => null)
    await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
    await clickWord(page, fm.model.page, fm.picks[0].word)
    const nf = swap(fm.picks[0].word.text)
    await typeApply(page, nf, flip, 'session added file')
    const { out, note } = await runAndDownload(page)
    const text = squash((await textOf(out)).join(' '))
    check('session: an edit left unsaved before a reload is gone after it', r1.ok && /No text changed/.test(count0), count0)
    check('session: after Add, one Apply changes only the added file (P2-0)', /flipkart-invoice-edited\.pdf/.test(note) && !/aws-invoice-edited/.test(note) && text.includes(nf), note.slice(0, 200))
    await ctx.close()
  }

  // ---------- right to left: line and paragraph editors run right to left ----------
  if (want('rtl')) {
    const rel = 'intl/udhr-arabic.pdf'
    const m = await modelOf(readRel(rel), 1)
    const { picks } = await pickWords(rel, 1, { script: /^[\p{Script=Arabic}]{4,}$/u })
    const { ctx, page } = await open(rel)
    await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
    if (picks.length) {
      const { run, word } = picks[0]
      await clickWord(page, m.page, word, 'dbl')
      await page.waitForFunction((t) => document.querySelector('[data-testid=et-input]')?.value === t, run.text, { timeout: 10_000 }).catch(() => null)
      const st = await page.$eval('[data-testid=et-input]', (el) => ({ dir: el.dir, align: getComputedStyle(el).textAlign, right: el.getBoundingClientRect().right })).catch(() => null)
      const sb = await stage(page).boundingBox()
      const wantRight = sb.x + (run.bbox[2] / m.page.width) * sb.width
      check('rtl: line editor is right to left, right aligned, anchored at the line end', !!st && st.dir === 'rtl' && st.align === 'right' && Math.abs(st.right - wantRight) < 8, st ? `${st.dir} ${st.align}, right ${st.right.toFixed(0)} vs ${wantRight.toFixed(0)}` : '')
      await page.keyboard.press('Escape')
    } else check('rtl: found an Arabic word', false)
    // P1-7: triple-click on a readable word of a line that is refused as a
    // whole: a note only, no editor left open next to it
    {
      const bad = m.runs.find((r) => r.editable && UNREADABLE.test(r.text) && r.words.some((w) => !UNREADABLE.test(w.text) && w.text.length > 2))
      if (!bad) console.log('SKIP  rtl: no line with a readable word and unreadable text')
      else {
        await page.waitForTimeout(200)
        const w = bad.words.find((x) => !UNREADABLE.test(x.text) && x.text.length > 2)
        const [cx, cy] = center(w.bbox)
        await stage(page).click({ position: await at(page, m.page, cx, cy), clickCount: 3 })
        await page.waitForTimeout(400)
        const editors = await page.$$eval('[data-testid=et-input], [data-testid=et-para]', (els) => els.length)
        const note = await page.$$eval('[data-testid=et-note]', (ns) => ns.map((n) => n.textContent).join(' | ')).catch(() => '')
        check('rtl: triple-click on a refused line shows the note only, no editor (P1-7)', editors === 0 && /Not changed/.test(note), `${editors} editor(s), "${note.slice(0, 80)}"`)
        check('rtl: the refusal says single readable words can still be edited (P1-7)', /You can still click single words that read correctly/.test(note), note.slice(0, 160))
      }
    }
    await ctx.close()
    // udhr-arabic paragraphs all hold unmapped glyphs: a multi-line one from pdf.js's Arabic test file
    const prel = 'intl/pdfjs-ArabicCIDTrueType.pdf'
    const pm = await modelOf(readRel(prel), 1)
    const p = parasOf(pm)?.find((x) => x.editable && x.dir === 'rtl' && !UNREADABLE.test(x.text) && /\p{Script=Arabic}{4,}/u.test(x.text))
    if (!parasOf(pm)) console.log(PARAGRAPH_EDIT ? 'SKIP  rtl: the page model has no paragraphs yet (engine)' : 'SKIP  rtl paragraph: paragraph editing is off (PARAGRAPH_EDIT false)')
    else if (!p) check('rtl: found an editable right-to-left paragraph', false)
    else {
      const { ctx, page } = await open(prel)
      await page.waitForSelector('[data-testid=et-line]', { timeout: 30_000 })
      const r0 = pm.runs.find((r) => r.id === p.runIds[0])
      await page.locator(lineSel(r0)).focus()
      await page.keyboard.press('Shift+Enter')
      await page.waitForSelector('[data-testid=et-para]', { timeout: 5000 }).catch(() => null)
      const st = await page.$eval('[data-testid=et-para]', (el) => ({ dir: el.dir, align: getComputedStyle(el).textAlign })).catch(() => null)
      check('rtl: paragraph editor is right to left and right aligned', !!st && st.dir === 'rtl' && st.align === 'right', JSON.stringify(st))
      await shot(page, 'paragraph-rtl-1440')
      // swap two letters of one Arabic word and apply
      const aw = p.text.split(/\s+/).find((x) => /^[\p{Script=Arabic}]{4,}$/u.test(x))
      if (aw) {
        await page.fill('[data-testid=et-para]', p.text.replace(aw, swap(aw)))
        await page.keyboard.press('Control+Enter')
        const ok = await waitVersion(page, 1, 90_000)
        const note = await page.$$eval('[data-testid=et-note]', (ns) => ns.map((n) => n.textContent).join(' | ')).catch(() => '')
        check('rtl: paragraph edit applies', ok, ok ? `applied ${note}` : note)
      }
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
