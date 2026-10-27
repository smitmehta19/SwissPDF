// S2 shell checks on real files, desktop 1440 and phone 390: view switch,
// Ctrl+K palette (keyboard only), numbered option steps and scoped Run label,
// review card with undo and next tools, version badges, Pages toolbar and
// per-page actions, Viewer (thumbnails, bookmarks, search, rotate, page bar,
// zoom), Reader mode, undo of split parts, Automate step order and its size
// before, no horizontal scroll at 390, and no request that could carry file data. Screenshots go to docs/design/screens/S2/.
// Usage: node scripts/corpus-test/s2-ui.mjs [--url http://localhost:4180/SwissPDF/] [--no-shots]
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { startServer, ROOT } from './server.mjs'

const CORPUS = join(ROOT, 'test-corpus')
const TRACE = join(CORPUS, 'reports/pdfjs-tracemonkey.pdf') // 14 pages
const AWS = join(CORPUS, 'invoices/aws-invoice.pdf') // 1 page
const ATT = join(CORPUS, 'reports/arxiv-1706.03762-attention.pdf') // 15 pages, has bookmarks
const LLAMA = join(CORPUS, 'reports/arxiv-2307.09288-llama2.pdf') // 77 pages, 14 MB
const LOCKED = join(CORPUS, 'derived/user-pw-TAMReview.pdf')
const PNG = join(CORPUS, 'images/png-alpha-transparency-demo.png')
const SHOTS = join(ROOT, 'docs/design/screens/S2')
const POLISH = join(ROOT, 'docs/design/screens/polish')
const shots = !process.argv.includes('--no-shots')
if (shots) mkdirSync(SHOTS, { recursive: true })
if (shots) mkdirSync(POLISH, { recursive: true })

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}

const at = process.argv.indexOf('--url')
const given = at > 0 ? process.argv[at + 1] : null
const dev = given ? null : await startServer()
const base = (given ?? dev.url).replace(/\/$/, '')
const origin = new URL(base).origin
const browser = await chromium.launch()
const requests = [] // every request of every page, frame and worker

const names = (page) => page.$$eval('[data-testid=file-card] .file-name', (els) => els.map((e) => e.textContent))
const versions = (page) => page.$$eval('[data-testid=file-card] .fc-version', (els) => els.map((e) => e.textContent))
const waitReady = (page, n) =>
  page.waitForFunction(
    (count) => {
      const m = [...document.querySelectorAll('[data-testid=file-card]')].map((c) => c.querySelector('.file-meta')?.textContent ?? '')
      return m.length === count && m.every((t) => /^\d+ pages?/.test(t))
    },
    n,
    { timeout: 180_000 },
  )
// every record in IndexedDB: name, version, and whether its stored bytes carry /Encrypt
const dbRows = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('swisspdf', 1)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const all = req.result.transaction('files').objectStore('files').getAll()
          all.onsuccess = async () => {
            const out = []
            for (const r of all.result) out.push({ name: r.name, version: r.version, status: r.status, encrypted: /\/Encrypt\b/.test(await r.blob.text()) })
            req.result.close()
            resolve(out)
          }
        }
      }),
  )
const selectAllFiles = async (page) => {
  const b = page.locator('.grid-toolbar .link', { hasText: 'Select all' })
  if (await b.count()) await b.first().click()
}
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
// result screen Undo asks first, like the card undo (blind review P2 14)
const undoResult = async (page) => {
  await page.click('[data-testid=result-undo]')
  await page.click('[data-testid=file-confirm-ok]')
}
const shot = async (page, name) => {
  if (shots) await page.screenshot({ path: join(SHOTS, `${name}.png`) })
}
const polishShot = async (page, name) => {
  if (shots) await page.screenshot({ path: join(POLISH, `${name}.png`) })
}
// opens a tool from the side panel (groups start folded)
const openTool = async (page, id) => {
  await page.$$eval('[data-testid^=fold-][aria-expanded=false]', (els) => els.forEach((el) => el.click()))
  await page.click(`[data-testid=tool-${id}]`)
  await page.waitForSelector('[data-testid=options-panel]')
}
const runTool = async (page) => {
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=result-screen], [data-testid=run-error]', { timeout: 120_000 })
}
const cardsLoaded = (page, n) =>
  page.waitForFunction(
    (count) => {
      const m = [...document.querySelectorAll('[data-testid=file-card] .file-meta')].map((e) => e.textContent)
      return m.length === count && m.every((t) => /^\d+ pages?|^[A-Z]+, /.test(t))
    },
    n,
    { timeout: 120_000 },
  )
async function download(page, sel) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.click(sel)])
  return { name: dl.suggestedFilename(), bytes: new Uint8Array(readFileSync(await dl.path())) }
}
const pagesOf = async (bytes) => (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount()

async function open(width, hash) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width, height: width < 500 ? 844 : 1000 } })
  ctx.on('request', (r) => requests.push({ method: r.method(), url: r.url(), body: r.postDataBuffer()?.length ?? 0 }))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
  // the first load of a fresh dev server can take a while (dependency optimise)
  await page.goto(`${base}/${hash}`, { waitUntil: 'load', timeout: 90_000 })
  await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
  await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })
  return { ctx, page, errors }
}

try {
  // ---------------- desktop 1440 ----------------
  {
    const { ctx, page, errors } = await open(1440, '#/compress')
    await page.setInputFiles('[data-testid=add-files-input]', [TRACE, AWS, ATT])
    await waitReady(page, 3)

    // 1. view switch: tab pattern, arrows, multi-file tools open on Files
    const tabs = await page.$$eval('.modes [role=tab]', (els) => els.map((e) => `${e.textContent.trim()}:${e.getAttribute('aria-selected')}:${e.tabIndex}`))
    check('1 view switch: Files / Viewer / Pages tabs, Files on, roving tabindex', tabs.join(',') === 'Files:true:0,Viewer:false:-1,Pages:false:-1', tabs.join(','))
    await page.focus('[data-testid=mode-files]')
    await page.keyboard.press('ArrowRight')
    check('1 view switch: ArrowRight moves to Viewer', (await page.getAttribute('[data-testid=mode-viewer]', 'aria-selected')) === 'true' && (await page.evaluate(() => document.activeElement?.dataset.testid)) === 'mode-viewer')
    check('1 view switch: panel is a tabpanel labelled by the tab', (await page.getAttribute('#wb-panel', 'aria-labelledby')) === 'wb-tab-viewer')
    await page.click('[data-testid=tool-merge]')
    await page.waitForSelector('[data-testid=options-panel]')
    check('1 merge opens on Files', (await page.getAttribute('[data-testid=mode-files]', 'aria-selected')) === 'true')
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid=file-card] .fc-cover img').length >= n, 3, { timeout: 30_000 }).catch(() => {})
    await shot(page, 'files-1440')

    // 3. option steps and scoped Run label
    const steps = await page.$$eval('[data-testid=option-steps] > li .step-title', (els) => els.map((e) => e.textContent))
    const runHead = await page.isVisible('.step-head-run')
    check('3 steps: 1 Files, 2 Options, 3 Run', steps.join(',') === 'Files,Options' && runHead, `${steps.join(',')} + run ${runHead}`)
    check('3 step 1 counts the files', (await page.textContent('[data-testid=step-files-count]')) === '3 selected')
    check('3 step 1 lists the files', (await page.$$('.step-files li')).length === 3)
    await page.click('.step-toggle')
    check('3 step 1 collapses', (await page.$$('.step-files li')).length === 0 && (await page.getAttribute('.step-toggle', 'aria-expanded')) === 'false')
    await page.click('.step-toggle')
    const mergeLabel = (await page.textContent('[data-testid=run-btn]')).trim()
    check('3 Run label states the scope', /^Merge 3 /.test(mergeLabel), mergeLabel)
    await shot(page, 'options-1440')
    const replaceWarn = ((await page.textContent('[data-testid=run-replace]').catch(() => '')) ?? '').trim()
    check('A re-check: Run panel warns before inputs are replaced', replaceWarn === 'Replaces the 3 selected files with one merged file. Undo brings them back.', replaceWarn)

    // 4. run, review card, undo
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
    await page.waitForSelector('.result-preview img', { timeout: 30_000 }).catch(() => {})
    const size = (await page.textContent('[data-testid=review-size]')) ?? ''
    const time = (await page.textContent('[data-testid=review-time]')) ?? ''
    const pages = (await page.textContent('[data-testid=review-pages]')) ?? ''
    const next = await page.$$eval('[data-testid=next-tools] button', (els) => els.map((e) => e.dataset.testid))
    check('4 review card: thumbnail', !!(await page.$('.result-preview img')))
    check('A merge: size of the merged file only, no "% smaller"', /^\d[\d.]* [KM]?B$/.test(size.trim()), size)
    check('4 review card: pages and time', pages === '30' && /^\d+(\.\d)? s$|min/.test(time), `${pages} pages, ${time}`)
    check('4 review card: 4 next tools, merge list first', next.length === 4 && next[0] === 'next-compress', next.join(','))
    check('4 review card: done on this device line', (await page.textContent('[data-testid=result-local]')).trim() === 'Done on this device. Nothing was uploaded.')
    check('4 review card: name in summary', /merged\.pdf/.test(await page.textContent('[data-testid=status]')))
    const replacedLine = (await page.textContent('[data-testid=result-replaced]').catch(() => '')) ?? ''
    check('P1 review card names what it replaced', replacedLine.trim() === 'Replaced 3 files with merged.pdf. Undo brings them back.', replacedLine)
    await shot(page, 'result-1440')
    await page.click('[data-testid=result-undo]')
    const undoAsk = ((await page.textContent('[data-testid=file-confirm]').catch(() => '')) ?? '').replace(/\s+/g, ' ')
    check('A 14 result Undo asks first, like the card', /Undo deletes merged\.pdf and brings back/.test(undoAsk), undoAsk)
    await page.click('[data-testid=file-confirm-ok]')
    await waitReady(page, 3)
    check('4 Undo restores the 3 inputs', (await names(page)).length === 3, (await names(page)).join(', '))
    const flashText = (await page.textContent('[data-testid=status-flash]').catch(() => '')) ?? ''
    check('4 Undo says what it did', /^Undid Merge\./.test(flashText), flashText)
    const seg = await page.$eval('.modes button.is-on', (el) => getComputedStyle(el).boxShadow)
    check('M3 selected segment has a signal edge', /inset/.test(seg), seg)

    // 2. palette, keyboard only
    await page.keyboard.press('Control+k')
    await page.waitForSelector('[data-testid=palette]')
    check('2 palette: Ctrl+K opens, input focused', (await page.evaluate(() => document.activeElement?.dataset.testid)) === 'palette-input')
    await page.keyboard.type('compr')
    const first = await page.textContent('[data-testid=palette-item][aria-selected=true] .palette-label')
    check('2 palette: typing ranks Compress first', first === 'Compress', first)
    await shot(page, 'palette-1440')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('.options-title')?.textContent === 'Compress')
    check('2 palette: Enter opens the tool and closes', !(await page.$('[data-testid=palette]')))
    await page.keyboard.press('Control+k')
    await page.waitForSelector('[data-testid=palette]')
    await page.keyboard.press('Tab') // chips: All
    await page.keyboard.press('Tab') // Files
    await page.keyboard.press('Enter')
    const kinds = await page.$$eval('[data-testid=palette-item]', (els) => [...new Set(els.map((e) => e.dataset.kind))])
    check('2 palette: Files chip shows only files', kinds.join(',') === 'file', kinds.join(','))
    await page.keyboard.type('attention')
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-testid=viewer]')
    const viewed = await page.$eval('[data-testid=viewer-file]', (s) => s.options[s.selectedIndex].text)
    check('2 palette: opening a file shows it in the Viewer', /attention/.test(viewed), viewed)
    await page.keyboard.press('Control+k')
    await page.waitForSelector('[data-testid=palette]')
    await page.click('[data-testid=palette-chip-settings]')
    await page.keyboard.type('dark')
    await page.keyboard.press('Enter')
    check('2 palette: Settings sets the theme', (await page.getAttribute('html', 'data-theme')) === 'dark')
    await page.keyboard.press('Control+k')
    await page.waitForSelector('[data-testid=palette]')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    const activeIdx = await page.$$eval('[data-testid=palette-item]', (els) => els.findIndex((e) => e.getAttribute('aria-selected') === 'true'))
    const desc = await page.getAttribute('[data-testid=palette-input]', 'aria-activedescendant')
    check('2 palette: arrows move the active option (aria-activedescendant)', activeIdx === 2 && !!desc, `${activeIdx} ${desc}`)
    await page.keyboard.press('Escape')
    check('2 palette: Escape closes', !(await page.$('[data-testid=palette]')))
    await page.keyboard.press('Control+k')
    await page.waitForSelector('[data-testid=palette]')
    await page.click('[data-testid=palette-chip-settings]')
    await page.keyboard.type('light')
    await page.keyboard.press('Enter')

    // 5. version badges after a run: compress the 3 files
    await page.click('[data-testid=mode-files]')
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 300_000 })
    const csize = (await page.textContent('[data-testid=review-size]')) ?? ''
    check('A compress: size before and after', /\d.*B to .*\d.*B/.test(csize), csize)
    await page.click('[data-testid=result-back]')
    await waitReady(page, 3)
    const vers = await versions(page)
    check('5 version badges: v2 on every compressed card', vers.join(',') === 'v2,v2,v2', vers.join(','))

    // 6. Pages toolbar on the attention paper only
    const cards = await names(page)
    for (const [i, n] of cards.entries()) if (!/attention/.test(n)) await page.click(`[data-testid=file-card] >> nth=${i} >> .fc-main`)
    await page.click('[data-testid=mode-pages]')
    await page.waitForSelector('[data-testid=page-track]')
    check('5 version badge on the Pages track', (await page.textContent('[data-testid=track-version]')) === 'v2')
    const bar = await page.$$eval('.pe-bar [aria-label], .pe-bar [data-testid]', (els) => els.map((e) => e.getAttribute('aria-label') ?? e.dataset.testid))
    const need = ['Rotate left', 'Rotate right', 'Insert blank page after', 'Split after', 'Duplicate', 'Download selected pages', 'Delete', 'Undo', 'Redo', 'pe-apply', 'pe-select-all', 'pe-range']
    check('6 toolbar has every action', need.every((x) => bar.includes(x)), need.filter((x) => !bar.includes(x)).join(', ') || 'all')
    await page.fill('[data-testid=pe-range]', '1,3,5-8')
    await page.click('[data-testid=pe-range-btn]')
    const selCount = await page.$$eval('[data-testid=page-track] .tile-btn[aria-pressed=true]', (els) => els.length)
    check('6 select by numbers "1,3,5-8"', selCount === 6, `${selCount} selected`)
    const dl = await download(page, '[data-testid=pe-download]')
    check('6 download selected: a 6-page PDF', (await pagesOf(dl.bytes)) === 6, `${dl.name}, ${await pagesOf(dl.bytes)} pages`)
    await page.click('.pe-bar [aria-label="Rotate right"]')
    const rotated = () => page.getAttribute('[data-testid=page-track] .tile-btn >> nth=0 >> img', 'style').catch(() => null)
    const r1 = await rotated()
    await page.click('.pe-bar [aria-label=Undo]')
    const r2 = await rotated()
    await page.click('[data-testid=pe-redo]')
    const r3 = await rotated()
    check('6 rotate, undo, redo', /rotate\(90deg\)/.test(r1 ?? '') && !/rotate/.test(r2 ?? '') && /rotate\(90deg\)/.test(r3 ?? ''), `${r1} | ${r2} | ${r3}`)
    await page.click('.pe-bar [aria-label=Undo]')
    await page.click('[data-testid=pe-select-all]') // clears the selection
    await page.hover('[data-testid=page-track] .tile >> nth=1')
    await page.waitForTimeout(300) // opacity fade
    const hoverVisible = await page.$eval('[data-testid=page-track] .tile:nth-child(2) .tile-actions', (el) => getComputedStyle(el).opacity === '1')
    check('6 hover shows page actions', hoverVisible)
    await page.click('[aria-label="Duplicate page 2 (position 2)"]')
    await page.hover('[data-testid=page-track] .tile >> nth=2')
    await page.click('[aria-label="Delete page 2 (position 3)"]')
    await page.hover('[data-testid=page-track] .tile >> nth=0')
    await page.click('[aria-label="Rotate page 1 (position 1) right"]')
    const order = await page.$$eval('[data-testid=page-track] .tile-btn', (els) => els.map((e) => e.dataset.page))
    check('6 per-page duplicate, delete, rotate', order.length === 15 && order.slice(0, 3).join(',') === '1,2,3', order.slice(0, 4).join(','))
    await page.click('[data-testid=page-track] .tile-btn >> nth=4')
    await page.click('[data-testid=pe-split]')
    const count = await page.textContent('[data-testid=page-track] .track-count')
    check('6 split after marks 2 parts', /2 parts/.test(count), count)
    await page.click('[data-testid=page-track] .tile-btn >> nth=4')
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=page-track] .tile-btn[data-page]')].every((t) => t.dataset.page === 'blank' || t.querySelector('img')), null, { timeout: 30_000 }).catch(() => {})
    await shot(page, 'pages-1440')
    await page.click('[data-testid=pe-apply]')
    await page.waitForFunction(() => /new version/.test(document.querySelector('.page-editor .notice')?.textContent ?? ''), null, { timeout: 60_000 })
    await page.click('[data-testid=mode-files]')
    await waitReady(page, 4)
    const after = await page.$$eval('[data-testid=file-card]', (els) => els.map((c) => `${c.querySelector('.file-name').textContent}|${c.querySelector('.file-meta').textContent}|${c.querySelector('.fc-version')?.textContent}`))
    const parts = after.filter((x) => /-part\d\.pdf/.test(x))
    check('6 save: split into 2 files, 5 + 10 pages, v3', parts.length === 2 && /\|5 pages/.test(parts[0]) && /\|10 pages/.test(parts[1]) && parts.every((p) => p.endsWith('|v3')), parts.join(' ; '))

    // per-page View opens the Viewer on that page
    await page.click('[data-testid=mode-pages]')
    await page.waitForSelector('[data-testid=page-track]')
    await page.hover('[data-testid=page-track] .tile >> nth=1')
    await page.click('[data-testid=page-track] >> nth=0 >> [aria-label="View page 2 (position 2)"]')
    await page.waitForSelector('[data-testid=viewer]')
    check('6 per-page View opens the Viewer on that page', (await page.inputValue('[data-testid=viewer-page-input]')) === '2')

    // 7. Viewer on the big file
    await page.click('[data-testid=mode-files]')
    await page.setInputFiles('[data-testid=add-files-input]', [LLAMA, LOCKED])
    await waitReady(page, 5).catch(() => {})
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=file-card] .file-meta')].some((m) => /^77 pages/.test(m.textContent)), null, { timeout: 180_000 })
    await page.keyboard.press('Control+k')
    await page.keyboard.type('llama2')
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-testid=viewer-image]', { timeout: 60_000 })
    const opts = await page.$$eval('[data-testid=viewer-file] option', (els) => els.map((e) => e.textContent))
    check('7 viewer: locked file not offered', !opts.some((o) => /TAMReview/.test(o)), opts.join(' | '))
    await page.waitForSelector('[data-testid=viewer-thumbs] img', { timeout: 60_000 })
    check('7 viewer: thumbnails sidebar renders', (await page.$$('[data-testid=viewer-thumbs] img')).length > 0)
    await page.click('[data-testid=viewer-last]')
    await page.waitForFunction(() => document.querySelector('[data-testid=viewer-page-input]')?.value === '77')
    await page.click('[data-testid=viewer-first]')
    await page.click('[data-testid=viewer-next]')
    await page.fill('[data-testid=viewer-page-input]', '10')
    await page.press('[data-testid=viewer-page-input]', 'Enter')
    await page.waitForFunction(() => document.querySelector('[data-testid=viewer-image]')?.alt?.startsWith('Page 10 '), null, { timeout: 30_000 })
    check('7 viewer: first, last, next, page box', (await page.inputValue('[data-testid=viewer-page-input]')) === '10' && (await page.textContent('[data-testid=viewer-page-count]')).trim() === '/ 77')
    const fitOn = await page.getAttribute('[data-testid=viewer-fit]', 'aria-pressed')
    await page.fill('[data-testid=viewer-zoom]', '150')
    const pct = (await page.textContent('[data-testid=viewer-pct]')).trim()
    const fitOff = await page.getAttribute('[data-testid=viewer-fit]', 'aria-pressed')
    await page.click('[data-testid=viewer-fit]')
    check('7 viewer: zoom slider with % and fit width', fitOn === 'true' && pct === '150%' && fitOff === 'false' && (await page.getAttribute('[data-testid=viewer-fit]', 'aria-pressed')) === 'true', `${fitOn} ${pct} ${fitOff}`)
    await page.click('[data-testid=viewer-rotate-right]')
    const turn = await page.getAttribute('.viewer-turn', 'style')
    check('7 viewer: rotate view', /rotate\(90deg\)/.test(turn), turn)
    await page.click('[data-testid=viewer-rotate-left]')
    await page.click('[data-testid=viewer-outline-btn]')
    await page.waitForSelector('[data-testid=viewer-outline] .vs-outline-item', { timeout: 30_000 })
    const ol = await page.$$eval('[data-testid=viewer-outline] .vs-outline-item', (els) => els.map((e) => e.textContent))
    const pre = ol.find((t) => /^Pretraining/.test(t)) ?? ''
    await page.click('[data-testid=viewer-outline] .vs-outline-item:has-text("Pretraining")')
    const target = pre.replace(/\D+/g, '')
    await page.waitForFunction((p) => document.querySelector('[data-testid=viewer-page-input]')?.value === p, target, { timeout: 10_000 }).catch(() => {})
    check('7 viewer: bookmarks list and jump', ol.length >= 5 && target === '5' && (await page.inputValue('[data-testid=viewer-page-input]')) === target, `${ol.length} items, Pretraining -> ${target}`)
    await page.click('[data-testid=viewer-search-btn]')
    await page.fill('[data-testid=viewer-search-input]', 'reward model')
    await page.waitForFunction(() => /matches? on \d+ page/.test(document.querySelector('[data-testid=viewer-search-count]')?.textContent ?? ''), null, { timeout: 120_000 })
    const searchLine = await page.textContent('[data-testid=viewer-search-count]')
    const total = Number(searchLine.match(/(\d+) match/)?.[1] ?? 0)
    check('S2 #10 search counts matches across text items (reward model: 104 in the joined text)', total >= 104, searchLine.trim())
    const hit = page.locator('[data-testid=viewer-hit]').nth(1)
    const hitPage = (await hit.locator('.vs-hit-page').textContent()).match(/Page (\d+)/)?.[1]
    await hit.click()
    await page.waitForSelector('[data-testid=viewer-hl]', { timeout: 30_000 }).catch(() => {})
    check('7 viewer: search finds and highlights', !!hitPage && (await page.inputValue('[data-testid=viewer-page-input]')) === hitPage && (await page.$$('[data-testid=viewer-hl]')).length > 0, `${searchLine.trim()}, page ${hitPage}`)
    await shot(page, 'viewer-1440')

    // 8. Reader
    await page.click('[data-testid=viewer-reader-btn]')
    await page.waitForSelector('[data-testid=reader-image]', { timeout: 60_000 })
    const startCount = (await page.textContent('[data-testid=reader-count]')).replace(/\D.*$/, '')
    await page.keyboard.press('PageDown')
    await page.waitForTimeout(600)
    const moved = (await page.textContent('[data-testid=reader-count]')).replace(/\/.*$/, '')
    check('8 reader: opens on the viewer page, PageDown goes on', startCount === hitPage && Number(moved) === Number(hitPage) + 1, `${startCount} -> ${moved}`)
    await shot(page, 'reader-1440')
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-testid=reader]', { state: 'detached' })
    check('8 reader: Escape exits back to the viewer', (await page.evaluate(() => document.activeElement?.dataset.testid)) === 'viewer-reader-btn')
    // undo on one split part brings the whole file back, not the parent next to part 2
    await page.click('[data-testid=mode-files]')
    const partAt = (await names(page)).findIndex((x) => /-part1\.pdf$/.test(x))
    await page.click(`[data-testid=file-card] >> nth=${partAt} >> [aria-label^="Undo last change"]`)
    const askText = await page.textContent('[data-testid=file-confirm]')
    await page.click('[data-testid=file-confirm-ok]')
    await page.waitForFunction(() => ![...document.querySelectorAll('[data-testid=file-card] .file-name')].some((e) => /-part\d\.pdf$/.test(e.textContent)), null, { timeout: 10_000 }).catch(() => {})
    const back = await page.$$eval('[data-testid=file-card]', (els) => els.map((c) => `${c.querySelector('.file-name').textContent}|${c.querySelector('.file-meta').textContent}|${c.querySelector('.fc-version')?.textContent}`))
    const att = back.filter((x) => /attention/.test(x))
    check('5 undo on a split part says so and restores the file, parts gone', /brings back .*attention-compressed\.pdf/.test(askText) && /part1\.pdf, .*part2\.pdf/.test(askText) && att.length === 1 && /\|15 pages/.test(att[0]) && att[0].endsWith('|v2'), att.join(' ; '))
    check('desktop: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
    await ctx.close()
  }

  // ---------------- Automate: own step order, size before counts only parents ----------------
  {
    const XFA = join(CORPUS, 'forms/xfa-imm1344e-filled.pdf')
    const { ctx, page, errors } = await open(1440, '#/automate')
    await page.setInputFiles('[data-testid=add-files-input]', [TRACE, XFA])
    await waitReady(page, 2)
    const titles = await page.$$eval('[data-testid=option-steps] > li .step-title, .step-head-run .step-title', (els) => els.map((e) => e.textContent))
    const nums = await page.$$eval('[data-testid=option-steps] > li .step-num, .step-head-run .step-num', (els) => els.map((e) => e.textContent.trim()))
    check('automate: steps 1 Automation, 2 Files, 3 Run', titles.join(',') === 'Automation,Files,Run' && nums.join(',') === '1,2,3', `${nums.join(',')} ${titles.join(',')}`)
    await page.click('[data-testid=auto-pick-row][data-id=tpl-share]')
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 300_000 })
    const size = (await page.textContent('[data-testid=review-size]')) ?? ''
    const traceKb = `${(readFileSync(TRACE).length / 1024).toFixed(1)} KB`
    check('automate: size before counts only the file that was made (the form stopped)', size.startsWith(traceKb), `${size} (tracemonkey ${traceKb})`)
    check('automate: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
    await ctx.close()
  }

  // ---------------- Protect output unlocked on its card: a new version, the encrypted one kept ----------------
  {
    const PW = 's2-check-pass'
    const { ctx, page, errors } = await open(1440, '#/protect')
    await page.setInputFiles('[data-testid=add-files-input]', [AWS])
    await waitReady(page, 1)
    await page.fill('[data-testid=pw-input]', PW)
    await page.fill('[data-testid=pw-confirm]', PW)
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
    const nextLocked = await page.$$eval('[data-testid=next-tools] button', (els) => els.map((e) => e.dataset.testid))
    check('M2 after Protect: only tools that take the locked file (Unlock), and a note', nextLocked.join(',') === 'next-unlock' && (await page.isVisible('[data-testid=result-locked-note]')), nextLocked.join(','))
    await page.click('[data-testid=result-back]')
    await page.waitForSelector('[data-testid=pw-unlock-input]')
    const hint = (await page.textContent('[data-testid=pw-hint]').catch(() => '')).trim()
    check('protect: locked card says what to do', /^Locked: type the password here, or open Unlock\.$/.test(hint), hint)
    await page.fill('[data-testid=pw-unlock-input]', PW)
    await page.click('[data-testid=pw-unlock-btn]')
    await waitReady(page, 1)
    const card = async () => page.$eval('[data-testid=file-card]', (c) => `${c.querySelector('.file-name').textContent}|${c.querySelector('.fc-version')?.textContent ?? ''}`)
    const opened = await card()
    check('protect: unlock on the card adds a decrypted version (name without -protected, v3)', opened === 'aws-invoice.pdf|v3', opened)
    // P0: the decrypted copy is memory only; after a reload the encrypted output is back, locked
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[data-testid=pw-unlock-input]', { timeout: 30_000 }).catch(() => {})
    const afterReload = await card()
    const rows = await dbRows(page)
    check('P0 Protect output: after a reload the card is locked again', afterReload === 'aws-invoice-protected.pdf|v2' && !!(await page.$('[data-testid=pw-unlock-input]')), afterReload)
    check('P0 Protect output: no decrypted copy in IndexedDB', rows.every((r) => r.name !== 'aws-invoice.pdf' || r.version === 1) && rows.filter((r) => /protected/.test(r.name)).every((r) => r.encrypted), JSON.stringify(rows))
    check('protect: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
    await ctx.close()
  }

  // ---------------- review fixes: run scope, home, folded tools, errors, versions, Pages edges ----------------
  {
    const { ctx, page, errors } = await open(1440, '#/')
    check('S2 home without files shows popular tool tiles', (await page.$$('[data-testid=popular-tiles] .popular-tile')).length === 6)
    const openGroups = await page.$$eval('[data-testid^=fold-]', (els) => els.filter((e) => e.getAttribute('aria-expanded') === 'true').length)
    check('S1 tool groups start folded, Popular group on top', openGroups === 0 && (await page.$$('[data-testid=tools-popular] li')).length === 6, `${openGroups} open`)
    // a truncated copy of a real PDF
    const brokenPath = join(ROOT, 'test-corpus', 'derived', 'outputs', 's2-broken.pdf')
    mkdirSync(dirname(brokenPath), { recursive: true })
    writeFileSync(brokenPath, readFileSync(TRACE).subarray(0, 3000))
    await page.setInputFiles('[data-testid=add-files-input]', [AWS, brokenPath])
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=file-card] .file-meta')].some((m) => /Can't open this PDF/.test(m.textContent)), null, { timeout: 60_000 }).catch(() => {})
    const brokenMeta = await page.$$eval('[data-testid=file-card] .file-meta', (els) => els.map((e) => e.textContent))
    check('S6 broken file: plain message, engine text behind Details', brokenMeta.some((m) => /^Can't open this PDF\. The file looks damaged or incomplete\.$/.test(m)) && !!(await page.$('[data-testid=file-card] details.fc-details')), brokenMeta.join(' | '))
    check('S2 home with files says what to do next', await page.isVisible('[data-testid=home-hint]'))
    await page.click('[data-testid=file-card] >> nth=1 >> [aria-label^="Remove"]')
    // M1: a tool that cannot use the files dims them and counts only what it uses
    await page.goto(`${base}/#/word2pdf`, { waitUntil: 'load' })
    await waitReady(page, 1)
    const unused = await page.$$eval('[data-testid=file-unused]', (els) => els.map((e) => e.textContent))
    const count1 = (await page.textContent('[data-testid=grid-count]')).replace(/\s+/g, ' ').trim()
    check('M1 files a tool cannot use are dimmed and not counted', unused.join() === 'Not used by Word to PDF' && count1 === '0 of 1 file go into Word to PDF' && !(await page.$('[data-testid=file-card].is-selected')), `${unused.join()} | ${count1}`)
    // M1: files added while a tool is open replace the selection
    await page.goto(`${base}/#/compress`, { waitUntil: 'load' })
    await waitReady(page, 1)
    await selectAllFiles(page) // nothing is selected after a reload (P1)
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
    await page.click('[data-testid=result-back]')
    await page.setInputFiles('[data-testid=add-files-input]', [TRACE, AWS])
    await waitReady(page, 3)
    const count2 = (await page.textContent('[data-testid=grid-count]')).replace(/\s+/g, ' ').trim()
    check('M1 new files replace the selection; the earlier result does not join', count2 === '2 of 3 files go into Compress', count2)
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
    await page.click('[data-testid=result-back]')
    const outNames = await names(page)
    check('S13 outputs get distinct names', new Set(outNames.map((n) => n.toLowerCase())).size === outNames.length && outNames.includes('aws-invoice-compressed (2).pdf'), outNames.join(', '))
    await page.setInputFiles('[data-testid=add-files-input]', [AWS])
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=file-card]').length === 4, null, { timeout: 60_000 })
    await page.setInputFiles('[data-testid=add-files-input]', [AWS])
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=file-card]').length === 5, null, { timeout: 60_000 })
    const dupNote = (await page.textContent('.notice-warn').catch(() => '')) ?? ''
    check('S13 same file added again: a note', /aws-invoice\.pdf is already in your files/.test(dupNote), dupNote)
    // S4: more than 3 files: the Files step starts folded
    await page.click('[data-testid=wipe-all]')
    await page.click('[data-testid=confirm-ok]')
    await page.waitForSelector('[data-testid=start-area]')
    await page.setInputFiles('[data-testid=add-files-input]', [TRACE, AWS, ATT, join(CORPUS, 'invoices/flipkart-invoice.pdf')])
    await waitReady(page, 4)
    check('S4 Files step folded with more than 3 files', (await page.getAttribute('.step-toggle', 'aria-expanded')) === 'false' && (await page.$$('.step-files li')).length === 0)
    // review #6, #4, #3: Pages edges
    await page.click('[data-testid=mode-pages]')
    await page.waitForSelector('[data-testid=page-track]')
    await page.fill('[data-testid=pe-range]', '5-8')
    await page.click('[data-testid=pe-range-btn]')
    const picked = await page.$$eval('[data-testid=page-track] .tile-btn[aria-pressed=true]', (els) => els.length)
    const rangeMsg = (await page.textContent('.page-editor .notice').catch(() => '')) ?? ''
    check('#6 range past the end of a short file: the other files still get it', picked >= 8 && /past the end of aws-invoice\.pdf/.test(rangeMsg), `${picked} selected, ${rangeMsg}`)
    await page.click('[data-testid=pe-select-all]')
    const awsTrack = page.locator('[data-testid=page-track]', { hasText: 'aws-invoice.pdf' })
    await awsTrack.locator('.tile-btn').first().click()
    await page.click('.pe-bar [aria-label=Delete]')
    await page.click('[data-testid=pe-apply]')
    const emptyMsg = (await page.textContent('.page-editor .notice').catch(() => '')) ?? ''
    check('#4 Save with every page of a file deleted is refused', /Every page of aws-invoice\.pdf is deleted/.test(emptyMsg), emptyMsg)
    await page.click('.pe-bar [aria-label=Undo]')
    const traceTrack = page.locator('[data-testid=page-track]', { hasText: 'pdfjs-tracemonkey.pdf' })
    await traceTrack.locator('.tile-btn').first().click()
    await page.click('.pe-bar [aria-label=Delete]')
    await page.click('[data-testid=mode-files]')
    const traceAt = (await names(page)).indexOf('pdfjs-tracemonkey.pdf')
    await page.click(`[data-testid=file-card] >> nth=${traceAt} >> .fc-main`)
    check('R3 edits of a deselected file still count as unsaved', !!(await page.$('[data-testid=mode-pages] .dot')))
    await page.click(`[data-testid=file-card] >> nth=${traceAt} >> .fc-main`)
    await page.click('[data-testid=mode-pages]')
    const traceCount = await page.locator('[data-testid=page-track]', { hasText: 'pdfjs-tracemonkey.pdf' }).locator('.track-count').textContent()
    check('#3 unsaved Pages edits survive deselect and select', /^13 pages/.test(traceCount) && !!(await page.$('[data-testid=mode-pages] .dot')), traceCount)
    await page.click('.page-editor .link') // Discard
    // review #1 and #5: a kept input that a later tool replaced
    await page.click('[data-testid=wipe-all]', { timeout: 5000 }).catch(async () => {
      await page.click('[data-testid=mode-files]')
      await page.click('[data-testid=wipe-all]')
    })
    await page.click('[data-testid=confirm-ok]')
    await page.goto(`${base}/#/pdf2img`, { waitUntil: 'load' })
    await page.setInputFiles('[data-testid=add-files-input]', [AWS])
    await waitReady(page, 1)
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
    await page.goto(`${base}/#/compress`, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid=file-card]')
    await selectAllFiles(page) // nothing is selected after a reload (P1)
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
    await page.click('[data-testid=result-back]')
    const imgAt = (await names(page)).findIndex((n) => !/\.pdf$/.test(n))
    await page.click(`[data-testid=file-card] >> nth=${imgAt} >> [aria-label^="Undo last change"]`)
    await page.click('[data-testid=file-confirm-ok]')
    await page.waitForTimeout(500)
    const afterUndo = await page.$$eval('[data-testid=file-card]', (els) => els.map((c) => `${c.querySelector('.file-name').textContent}|${c.querySelector('.fc-version')?.textContent ?? ''}`))
    check('#1 undo on an image made from a file that was compressed since: the old v1 does not come back', afterUndo.join(',') === 'aws-invoice-compressed.pdf|v2', afterUndo.join(','))
    // R1: a kept input (images made from it) still comes back when a later change is undone
    const cardsNow = () => page.$$eval('[data-testid=file-card]', (els) => els.map((c) => `${c.querySelector('.file-name').textContent}|${c.querySelector('.fc-version')?.textContent ?? ''}`).sort())
    await page.click('[data-testid=wipe-all]')
    await page.click('[data-testid=confirm-ok]')
    await page.goto(`${base}/#/pdf2img`, { waitUntil: 'load' })
    await page.setInputFiles('[data-testid=add-files-input]', [AWS])
    await waitReady(page, 1)
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
    await page.goto(`${base}/#/compress`, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid=file-card]')
    await selectAllFiles(page) // nothing is selected after a reload (P1)
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
    await undoResult(page)
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=file-card] .file-name')].some((e) => e.textContent === 'aws-invoice.pdf'), null, { timeout: 10_000 }).catch(() => {})
    const r1a = await cardsNow()
    check('R1 image, then compress, then undo: the PDF comes back next to its image', r1a.length === 2 && r1a.includes('aws-invoice.pdf|v1') && r1a.some((x) => !/\.pdf\|/.test(x)), r1a.join(', '))
    // images, then merge, then undo: both PDFs come back
    await page.goto(`${base}/#/merge`, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid=file-card]')
    await selectAllFiles(page) // nothing is selected after a reload (P1)
    await page.setInputFiles('[data-testid=add-files-input]', [TRACE])
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=file-card]').length === 3, null, { timeout: 60_000 })
    await page.waitForFunction(() => /2 files/.test(document.querySelector('[data-testid=live-line]')?.textContent ?? ''), null, { timeout: 60_000 })
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
    await undoResult(page)
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=file-card]').length === 3, null, { timeout: 10_000 }).catch(() => {})
    const r1b = await cardsNow()
    check('R1 images, then merge, then undo: both PDFs come back', r1b.includes('aws-invoice.pdf|v1') && r1b.includes('pdfjs-tracemonkey.pdf|v1') && r1b.length === 3, r1b.join(', '))
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=file-card]').length === 3, null, { timeout: 30_000 }).catch(() => {})
    const r1c = await cardsNow()
    check('R1 same after a reload', r1c.join() === r1b.join(), r1c.join(', '))
    const afterReloadCount = (await page.textContent('[data-testid=grid-count]')).replace(/\s+/g, ' ').trim()
    check('P1 nothing is selected after a reload', /^0 of 3 /.test(afterReloadCount), afterReloadCount)
    // P0: a file opened with its user password stays encrypted in storage
    await page.setInputFiles('[data-testid=add-files-input]', [LOCKED])
    await page.waitForSelector('[data-testid=pw-unlock-input]', { timeout: 60_000 })
    await page.fill('[data-testid=pw-unlock-input]', 'Us3r-Corpus')
    await page.click('[data-testid=pw-unlock-btn]')
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=file-card] .file-meta')].some((m) => /^23 pages/.test(m.textContent)), null, { timeout: 60_000 }).catch(() => {})
    const unlockNote = (await page.textContent('[data-testid=file-notice]').catch(() => '')) ?? ''
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[data-testid=pw-unlock-input]', { timeout: 30_000 }).catch(() => {})
    const lockedRows = (await dbRows(page)).filter((r) => r.name === 'user-pw-TAMReview.pdf')
    check('P0 user password: the card says the unlock is for this session only', /this session only/.test(unlockNote), unlockNote)
    check('P0 user password: after a reload IndexedDB holds only the encrypted file and the card asks again', lockedRows.length === 1 && lockedRows.every((r) => r.encrypted) && !!(await page.$('[data-testid=pw-unlock-input]')), JSON.stringify(lockedRows))
    check('review fixes: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
    await ctx.close()
  }

  // ---------------- Health result uses the full width (blind review P1) ----------------
  {
    const { ctx, page } = await open(1440, '#/health')
    await page.waitForSelector('[data-testid="run-btn"]:not([disabled])', { timeout: 60_000 })
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=health-results]', { timeout: 300_000 })
    const box = await page.locator('[data-testid=health-results]').boundingBox()
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    check('P1 Health list is wide and the page stays short', box && box.width > 700 && height < 6000, `list ${Math.round(box?.width)} px wide, page ${height} px tall`)
    await ctx.close()
  }

  // ---------------- polish batch, group A: desktop ----------------
  {
    const { ctx, page, errors } = await open(1440, '#/')
    check('A 26 favicon: an inline icon under the page, no favicon.ico request', !!(await page.$('link[rel=icon][href^="data:image/svg"]')) && !requests.some((r) => /favicon\.ico/.test(r.url)))
    const offs = await page.$$eval('.popular-tile', (els) => els.map((t) => Math.round(t.querySelector('.popular-name').getBoundingClientRect().top - t.getBoundingClientRect().top)))
    check('A 26 Popular tiles: titles line up', offs.length === 6 && new Set(offs).size === 1, offs.join(','))
    // 15: everyday words
    const syn = {}
    for (const [q, want] of [['shrink', 'compress'], ['reduce size', 'compress'], ['join', 'merge'], ['combine', 'merge'], ['delete page', 'remove'], ['esign', 'sign'], ['convert jpg', 'img2pdf']]) {
      await page.fill('[data-testid=tool-search]', q)
      const got = await page.$$eval('[data-testid=tool-panel] .tool-row-main', (els) => els.map((e) => e.dataset.testid.replace('tool-', '')))
      syn[q] = got.includes(want) ? 'ok' : got.slice(0, 3).join('/') || 'none'
    }
    await page.fill('[data-testid=tool-search]', '')
    check('A 15 search: everyday words find the tool', Object.values(syn).every((v) => v === 'ok'), JSON.stringify(syn))
    const firstOf = async (q) => {
      await page.fill('[data-testid=tool-search]', q)
      const got = await page.$$eval('[data-testid=tool-panel] .tool-row-main', (els) => els.map((e) => e.dataset.testid.replace('tool-', '')))
      await page.fill('[data-testid=tool-search]', '')
      return got
    }
    const w2p = await firstOf('word to pdf')
    const p2j = await firstOf('pdf to jpg')
    check('A P3 search: whole words and direction ("word to pdf" has no Protect, "pdf to jpg" is PDF to images first)', w2p[0] === 'word2pdf' && !w2p.includes('protect') && p2j[0] === 'pdf2img', `${w2p.join('/')} | ${p2j.join('/')}`)
    await page.keyboard.press('Control+k')
    await page.waitForSelector('[data-testid=palette]')
    await page.keyboard.type('shrink')
    const pfirst = await page.textContent('[data-testid=palette-item][aria-selected=true] .palette-label')
    check('A 15 palette: "shrink" finds Compress first', pfirst === 'Compress', pfirst)
    await page.keyboard.press('Escape')
    // 24: unknown route
    await page.goto(`${base}/#/extract-pages`, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid=not-found]', { timeout: 10_000 }).catch(() => {})
    const nf = await page.isVisible('[data-testid=not-found]')
    const nfChip = await page.isVisible('[data-testid=nf-extract]')
    await polishShot(page, 'not-found-1440')
    if (nf) await page.click('[data-testid=nf-home]')
    const hashAfter = await page.evaluate(() => location.hash)
    check('A 24 unknown route: "Tool not found", the closest tool, a way back', nf && nfChip && !(await page.$('[data-testid=not-found]')) && hashAfter === '', `shown ${nf}, chip ${nfChip}, hash "${hashAfter}"`)
    await page.goto(`${base}/#/Compress/`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.querySelector('.options-title')?.textContent === 'Compress', null, { timeout: 10_000 }).catch(() => {})
    const caseOk = (await page.textContent('.options-title').catch(() => '')) === 'Compress'
    await page.goto(`${base}/#/${'x'.repeat(300)}`, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid=not-found]', { timeout: 10_000 }).catch(() => {})
    const longOk = await noHScroll(page)
    await page.click('[data-testid=nf-home]').catch(() => {})
    check('A P3 routes: "#/Compress/" opens Compress; a 300-character route does not widen the page', caseOk && longOk, `case ${caseOk}, long ${longOk}`)
    // 8 and 26: grid, card actions, type filter
    await page.setInputFiles('[data-testid=add-files-input]', [AWS, TRACE, PNG])
    await cardsLoaded(page, 3)
    const cols = () => page.$eval('.file-grid', (g) => getComputedStyle(g).gridTemplateColumns.split(' ').length)
    const homeCols = await cols()
    const edges = await page.evaluate(() => [document.querySelector('.file-grid').getBoundingClientRect().right, document.querySelector('.grid-toolbar').getBoundingClientRect().right].map(Math.round))
    check('A P3 home: the grid uses the full width (no empty column)', Math.abs(edges[0] - edges[1]) <= 2, edges.join(' vs '))
    const rows = await page.$$eval('[data-testid=file-card] .fc-actions', (els) => els.map((a) => new Set([...a.children].map((b) => Math.round(b.getBoundingClientRect().top))).size))
    check('A 26 card actions stay on one row', rows.every((n) => n === 1), rows.join(','))
    await page.selectOption('[data-testid=type-filter]', 'pdf')
    const onlyPdf = await names(page)
    await page.selectOption('[data-testid=type-filter]', 'other')
    const onlyOther = await names(page)
    await page.selectOption('[data-testid=type-filter]', 'all')
    check('A 8 type filter: PDFs or other files', onlyPdf.length === 2 && onlyPdf.every((n) => /\.pdf$/.test(n)) && onlyOther.join() === 'png-alpha-transparency-demo.png', `${onlyPdf.join(', ')} | ${onlyOther.join(', ')}`)
    await page.click('[data-testid=mode-viewer]')
    await openTool(page, 'compress')
    check('A 13 a tool with no canvas opens on Files, even from the Viewer', (await page.getAttribute('[data-testid=mode-files]', 'aria-selected')) === 'true')
    check('A 26 the grid keeps its columns when a tool opens', (await cols()) === homeCols, `${homeCols} -> ${await cols()}`)
    // F4: files hidden by the Show filter do not go into the run, and the panel says so
    await page.selectOption('[data-testid=type-filter]', 'other')
    const hiddenLine = ((await page.textContent('[data-testid=run-hidden]').catch(() => '')) ?? '').trim()
    const runOff = await page.isDisabled('[data-testid=run-btn]')
    await page.selectOption('[data-testid=type-filter]', 'all')
    check('A F4 hidden PDFs are left out of the run and the panel says so', hiddenLine === '2 selected files are hidden by the Show filter and left out.' && runOff, `${hiddenLine} | Run disabled ${runOff}`)
    // 6: a chain keeps one suffix
    await runTool(page)
    await page.click('[data-testid=result-back]')
    // 4 steps: compress, rotate, page numbers, watermark
    let chainErr = ''
    for (const id of ['rotate', 'pagenumbers', 'watermark']) {
      await openTool(page, id)
      await runTool(page)
      const err = (await page.textContent('[data-testid=run-error]').catch(() => '')) ?? ''
      if (err) chainErr += ` ${id}: ${err}`
      else await page.click('[data-testid=result-back]')
      await page.click('[data-testid=mode-files]').catch(() => {})
    }
    const chained = await names(page)
    check('A 6 a 4-step chain keeps the base name and one suffix', chained.includes('aws-invoice-watermarked.pdf') && chained.includes('pdfjs-tracemonkey-watermarked.pdf') && !chained.some((n) => /-(compressed|rotated|numbered)-/.test(n)), chained.join(', ') + chainErr)
    // 2: a run that changes nothing makes no new version
    // Smart clean on a file it already cleaned keeps the original: run it until
    // it says so (at most 3 times), then nothing may have changed in that run
    await openTool(page, 'compress')
    const traceNo = (await names(page)).findIndex((n) => /tracemonkey/.test(n))
    if (await page.$(`[data-testid=file-card] >> nth=${traceNo} >> .fc-main[aria-pressed=true]`)) await page.click(`[data-testid=file-card] >> nth=${traceNo} >> .fc-main`)
    let noop = ''
    let before = ''
    let vBefore = ''
    for (let i = 0; i < 3 && !noop; i++) {
      before = (await names(page)).join()
      vBefore = (await versions(page)).join()
      await runTool(page)
      noop = ((await page.textContent('[data-testid=run-error]').catch(() => '')) ?? '').trim()
      if (!noop) await page.click('[data-testid=result-back]')
    }
    check('A 2 no-op run: "Nothing to do", no renamed new version', /^Nothing to do: /.test(noop) && (await names(page)).join() === before && (await versions(page)).join() === vBefore, `${noop || 'a result screen each time'} | ${(await names(page)).join(', ')}`)
    await polishShot(page, 'noop-1440')
    // re-check: Images to PDF keeps the image
    await openTool(page, 'img2pdf')
    const pngAt = (await names(page)).indexOf('png-alpha-transparency-demo.png')
    if (!(await page.$(`[data-testid=file-card] >> nth=${pngAt} >> .fc-main[aria-pressed=true]`))) await page.click(`[data-testid=file-card] >> nth=${pngAt} >> .fc-main`)
    await runTool(page)
    const imgReplaced = await page.$('[data-testid=result-replaced]')
    await page.click('[data-testid=result-back]').catch(() => {})
    const afterImg = await names(page)
    check('A re-check: Images to PDF keeps the image next to the PDF', !imgReplaced && afterImg.includes('png-alpha-transparency-demo.png') && afterImg.includes('png-alpha-transparency-demo.pdf'), afterImg.join(', '))
    // 10: a converted file that is not a PDF is not called selected
    await openTool(page, 'pdf2img')
    await runTool(page)
    const nextHelp = ((await page.textContent('[data-testid=result-next-help]').catch(() => '')) ?? '').trim()
    check('A 10 result text: images are in your files, the PDF stays selected', /The PDF stays selected/.test(nextHelp), nextHelp)
    await page.click('[data-testid=result-back]').catch(() => {})
    // 26: the inline password field is wide enough for its placeholder
    await page.setInputFiles('[data-testid=add-files-input]', [LOCKED])
    await page.waitForSelector('[data-testid=pw-unlock-input]', { timeout: 60_000 })
    const pw = await page.$eval('[data-testid=pw-unlock-input]', (el) => el.clientWidth)
    check('A 26 password field is not cut ("Password" fits)', pw >= 90, `${pw} px`)
    await polishShot(page, 'files-1440')
    check('A desktop: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
    await ctx.close()
  }

  // ---------------- polish batch, group A: phone ----------------
  {
    const { ctx, page, errors } = await open(390, '#/')
    await page.setInputFiles('[data-testid=add-files-input]', [TRACE])
    await waitReady(page, 1)
    const narrowHint = await page.isVisible('.hint-narrow')
    const wideHint = await page.isVisible('.hint-wide')
    check('A 22 phone home: no "on the left" or Ctrl+K hint', narrowHint && !wideHint)
    await polishShot(page, 'home-390')
    await page.goto(`${base}/#/split`, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid=run-bar]')
    await waitReady(page, 1)
    await selectAllFiles(page)
    const title = ((await page.textContent('[data-testid=wb-tool]').catch(() => '')) ?? '').trim()
    check('A 22 phone: the tool name shows without opening Options', (await page.isVisible('[data-testid=wb-tool]')) && /^Split/.test(title), title)
    await page.click('[data-testid=options-btn]')
    await page.waitForTimeout(300)
    await page.fill('[data-testid=split-from] >> nth=0', '1')
    await page.fill('[data-testid=split-to] >> nth=0', '2')
    for (let i = 1; i < 4; i++) {
      await page.click('[data-testid=split-add-range]')
      await page.fill(`[data-testid=split-from] >> nth=${i}`, String(i * 2 + 1))
      await page.fill(`[data-testid=split-to] >> nth=${i}`, String(i * 2 + 2))
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const cut = await page.$eval('[data-testid=live-line]', (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
    const line = ((await page.textContent('[data-testid=live-line]')) ?? '').trim()
    check('A 22 phone: the Run bar line is not cut', !cut, line)
    await polishShot(page, 'split-390')
    await runTool(page)
    await page.waitForSelector('[data-testid=result-list] li', { timeout: 30_000 }).catch(() => {})
    const tails = await page.$$eval('[data-testid=result-list] .name-tail', (els) => els.map((e) => ({ t: e.textContent, w: e.getBoundingClientRect().width, r: e.getBoundingClientRect().right })))
    check('A 7 phone split result: the part numbers stay visible', tails.length === 4 && new Set(tails.map((x) => x.t)).size === 4 && tails.every((x) => x.w > 0 && x.r <= 390), tails.map((x) => x.t).join(' '))
    await polishShot(page, 'split-result-390')
    await page.click('[data-testid=result-back]')
    await page.click('[data-testid=mode-viewer]')
    await page.waitForSelector('[data-testid=viewer-image]', { timeout: 60_000 })
    await page.waitForTimeout(500)
    const img = await page.locator('[data-testid=viewer-image]').boundingBox()
    const pill = await page.locator('.viewer-pill').boundingBox()
    check('A 23 phone viewer: the page and zoom bar does not cover the page', !!img && !!pill && pill.y >= img.y + img.height - 1, `page bottom ${Math.round(img?.y + img?.height)}, bar top ${Math.round(pill?.y)}`)
    check('A phone: no horizontal scroll', await noHScroll(page))
    await polishShot(page, 'viewer-390')
    check('A phone: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
    await ctx.close()
  }

  // ---------------- phone 390 ----------------
  {
    const { ctx, page, errors } = await open(390, '#/merge')
    await page.setInputFiles('[data-testid=add-files-input]', [TRACE, AWS])
    await waitReady(page, 2)
    const scroll = {}
    scroll.files = await noHScroll(page)
    check('390 view switch visible with all three tabs', (await page.$$eval('.modes [role=tab]', (els) => els.filter((e) => e.getBoundingClientRect().width > 40).length)) === 3)
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid=file-card] .fc-cover img').length >= n, 2, { timeout: 30_000 }).catch(() => {})
    await shot(page, 'files-390')
    await page.click('[data-testid=palette-btn]')
    await page.waitForSelector('[data-testid=palette]')
    await page.keyboard.type('split')
    scroll.palette = await noHScroll(page)
    check('390 palette opens from the bar button', (await page.$$('[data-testid=palette-item]')).length > 0)
    await shot(page, 'palette-390')
    await page.keyboard.press('Escape')
    await page.click('[data-testid=options-btn]')
    await page.waitForTimeout(400)
    check('390 option steps in the sheet', await page.isVisible('#options-sheet [data-testid=step-files]'))
    scroll.options = await noHScroll(page)
    await shot(page, 'options-390')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.click('[data-testid=run-btn]')
    await page.waitForSelector('[data-testid=result-screen]', { timeout: 120_000 })
    await page.waitForSelector('.result-preview img', { timeout: 30_000 }).catch(() => {})
    scroll.result = await noHScroll(page)
    check('390 review card with 4 next tools', (await page.$$('[data-testid=next-tools] button')).length === 4)
    await shot(page, 'result-390')
    await page.click('[data-testid=result-back]')
    await page.click('[data-testid=mode-pages]')
    await page.waitForSelector('[data-testid=page-track] img', { timeout: 60_000 })
    await page.click('[data-testid=page-track] .tile-btn >> nth=1')
    scroll.pages = await noHScroll(page)
    check('390 per-page actions show on the selected tile', await page.isVisible('[data-testid=page-track] .tile.is-selected .tile-actions [aria-label^="Delete page"]'))
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=page-track] .tile-btn[data-page]')].every((t) => t.dataset.page === 'blank' || t.querySelector('img')), null, { timeout: 30_000 }).catch(() => {})
    await shot(page, 'pages-390')
    await page.click('[data-testid=mode-viewer]')
    await page.waitForSelector('[data-testid=viewer-image]', { timeout: 60_000 })
    scroll.viewer = await noHScroll(page)
    const pill = await page.locator('.viewer-pill').boundingBox()
    check('390 viewer bottom bar fits the screen', pill && pill.x >= 0 && pill.x + pill.width <= 390, JSON.stringify(pill))
    await shot(page, 'viewer-390')
    await page.click('[data-testid=viewer-reader-btn]')
    await page.waitForSelector('[data-testid=reader-image]', { timeout: 60_000 })
    scroll.reader = await noHScroll(page)
    await shot(page, 'reader-390')
    await page.click('[data-testid=reader-close]')
    const bad = Object.entries(scroll).filter(([, ok]) => !ok).map(([k]) => k)
    check('390 no horizontal scroll (files, palette, options, result, pages, viewer, reader)', bad.length === 0, bad.join(', ') || 'none')
    check('phone: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
    await ctx.close()
  }

  // ---------------- privacy ----------------
  const sending = requests.filter((r) => !['GET', 'HEAD'].includes(r.method) || r.body > 0)
  const off = requests.filter((r) => /^https?:/.test(r.url) && new URL(r.url).origin !== origin)
  check('no request carries file data (only GET/HEAD, no bodies)', sending.length === 0, sending.slice(0, 3).map((r) => `${r.method} ${r.url}`).join(' | ') || `${requests.length} requests checked`)
  check('no request leaves the app origin', off.length === 0, off.slice(0, 3).map((r) => r.url).join(' | ') || 'none')
} finally {
  await browser.close()
  await dev?.server.close()
}
console.log(failed ? `${failed} failed` : 'all passed')
process.exit(failed ? 1 : 0)
