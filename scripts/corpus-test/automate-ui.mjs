// S3 Automate through the real shell on real files, desktop 1440 and phone
// 390: create, rename, reorder and delete in a custom automation (kept after a
// reload, no password stored), a template that needs a password, a template run
// on 3 files, Cancel mid-run, a failing step on one file while the others go
// through. Fails on any request that leaves the origin, is not a GET or HEAD,
// or carries a body. Then Run to result (click to result screen) per built-in
// automation on its 3 files, one file per run. Screenshots go to docs/design/screens/S3/.
// Usage: node scripts/corpus-test/automate-ui.mjs [--url http://localhost:4180/SwissPDF/] [--no-shots] [--no-latency]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, ROOT } from './server.mjs'

const CORPUS = join(ROOT, 'test-corpus')
const TRACE = join(CORPUS, 'reports/pdfjs-tracemonkey.pdf')
const AWS = join(CORPUS, 'invoices/aws-invoice.pdf')
const FW9 = join(CORPUS, 'forms/irs-fw9.pdf')
const XFA = join(CORPUS, 'forms/xfa-imm1344e-filled.pdf')
const LINCOLN = join(CORPUS, 'scanned/lincoln-ellsworth-letter-1861.pdf')
const SHOTS = join(ROOT, 'docs/design/screens/S3')
const shots = !process.argv.includes('--no-shots')
if (shots) mkdirSync(SHOTS, { recursive: true })

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
const requests = []
const times = {}
const latency = {} // template -> Run to result ms per file (click to result screen)

const shot = async (page, name) => {
  if (shots) await page.screenshot({ path: join(SHOTS, `${name}.png`) })
}
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const waitReady = (page, n) =>
  page.waitForFunction(
    (count) => {
      const m = [...document.querySelectorAll('[data-testid=file-card]')].map((c) => c.querySelector('.file-meta')?.textContent ?? '')
      return m.length === count && m.every((t) => /^\d+ pages?/.test(t))
    },
    n,
    { timeout: 180_000 },
  )
const versions = (page) => page.$$eval('[data-testid=file-card] .fc-version', (els) => els.map((e) => e.textContent.trim()))
const live = (page) => page.textContent('[data-testid=live-line]')
const pick = (page, id) => page.click(`[data-testid=auto-pick-row][data-id=${id}]`)

async function open(width, files) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width, height: width < 500 ? 844 : 1000 }, reducedMotion: 'reduce' })
  ctx.on('request', (r) => requests.push({ method: r.method(), url: r.url(), body: r.postDataBuffer()?.length ?? 0 }))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
  await page.goto(`${base}/#/automate`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.crossOriginIsolated, null, { timeout: 60_000 }).catch(() => {})
  await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })
  if (files?.length) {
    await page.setInputFiles('[data-testid=add-files-input]', files)
    await waitReady(page, files.length)
  }
  return { ctx, page, errors }
}

// Run and wait for the result screen or an error; returns ms from click.
async function run(page) {
  await page.waitForFunction(() => !document.querySelector('[data-testid=run-btn]')?.disabled, null, { timeout: 30_000 })
  const t0 = Date.now()
  await page.click('[data-testid=run-btn]')
  await page.waitForSelector('[data-testid=result-screen], [data-testid=run-error]', { timeout: 600_000 })
  return Date.now() - t0
}

try {
  // ---------------- desktop 1440: custom automation ----------------
  {
    const { ctx, page, errors } = await open(1440, [TRACE, AWS, FW9])
    check('automate opens with the picker and 5 built-in automations', (await page.$$('[data-testid=auto-pick-row][data-id^=tpl-]')).length === 5)
    await page.click('[data-testid=auto-new]')
    await page.waitForSelector('[data-testid=auto-name]')
    check('new automation starts empty, Run blocked', (await page.isVisible('[data-testid=auto-empty]')) && (await page.isDisabled('[data-testid=run-btn]')), await live(page))
    await page.fill('[data-testid=auto-name]', 'Invoice prep')
    for (const id of ['removeannots', 'pagenumbers', 'compress', 'protect']) {
      await page.selectOption('[data-testid=auto-add-tool]', id)
      await page.click('[data-testid=auto-add]')
    }
    const order = () => page.$$eval('[data-testid=auto-step]', (els) => els.map((e) => e.dataset.tool).join(','))
    check('4 steps added in order', (await order()) === 'removeannots,pagenumbers,compress,protect', await order())
    check('Protect without a password blocks Run with a named step', /^Step 4, Protect: /.test(await live(page)), await live(page))
    await page.fill('[data-testid=pw-input]', 'Ui-Pass 5521')
    await page.fill('[data-testid=pw-confirm]', 'Ui-Pass 5521')
    // move compress up above page numbers, from the keyboard
    await page.locator('[data-testid=auto-step]').nth(2).locator('[data-testid=auto-step-up]').focus()
    await page.keyboard.press('Enter')
    check('reorder: compress moved up', (await order()) === 'removeannots,compress,pagenumbers,protect', await order())
    await page.waitForTimeout(100)
    const focus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName)
    check('focus stays on the moved step', /^Move step 2, Compress, up$/.test(focus), focus)
    check('move announced', (await page.textContent('[data-testid=auto-said]')) === 'Compress moved to step 2 of 4.', await page.textContent('[data-testid=auto-said]'))
    // again to the top: Up turns disabled, focus goes to Down
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    const focus2 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName)
    check('at the top, focus moves to the other arrow', /^Move step 1, Compress, down$/.test(focus2), focus2)
    await page.keyboard.press('Enter')
    // protect first is refused
    await page.locator('[data-testid=auto-step]').nth(3).locator('[data-testid=auto-step-up]').click()
    check('Protect not last blocks Run', /move it to the end/i.test(await live(page)), await live(page))
    await page.locator('[data-testid=auto-step]').nth(2).locator('[data-testid=auto-step-down]').click()
    // remove page numbers
    await page.locator('[data-testid=auto-step][data-tool=pagenumbers] [data-testid=auto-step-remove]').click()
    check('remove step', (await order()) === 'removeannots,compress,protect', await order())
    check('ready: Run names the file count', /Run on 3 PDFs/.test(await page.textContent('[data-testid=run-btn]')), await page.textContent('[data-testid=run-btn]'))
    await shot(page, 'custom-1440')
    const stored = await page.evaluate(() => localStorage.getItem('swiss-automations') ?? '')
    check('saved in this browser', stored.includes('Invoice prep') && stored.includes('removeannots'))
    check('password never written to storage', !stored.includes('Ui-Pass'))
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[data-testid=auto-pick-row]', { timeout: 60_000 })
    const rows = await page.$$eval('[data-testid=auto-pick-row]', (els) => els.map((e) => e.textContent))
    check('kept after a reload', rows.some((t) => t.includes('Invoice prep') && t.includes('Remove annotations, Compress, Protect')), rows.join(' | ').slice(0, 200))
    // delete it
    const mine = await page.$eval('[data-testid=auto-pick-row]:not([data-id^=tpl-])', (e) => e.dataset.id)
    await pick(page, mine)
    await page.click('[data-testid=auto-delete]')
    await page.click('[data-testid=auto-delete-yes]')
    const left = await page.evaluate(() => localStorage.getItem('swiss-automations') ?? '')
    check('delete removes it from the list and storage', !(await page.$(`[data-testid=auto-pick-row][data-id="${mine}"]`)) && !left.includes('Invoice prep'))
    // built-in with a password: the step opens by itself and names the problem.
    // Nothing is selected after a reload, so pick the files again first.
    const selAll = page.locator('.grid-toolbar .link', { hasText: 'Select all' })
    if (await selAll.count()) await selAll.first().click()
    await pick(page, 'tpl-mail')
    check('built-in "Small and locked" asks for the password', (await page.isVisible('[data-testid=pw-input]')) && /Step 2, Protect/.test(await live(page)), await live(page))
    check('desktop: no page errors', errors.length === 0, errors[0])
    await ctx.close()
  }

  // ---------------- desktop 1440: template on 3 files ----------------
  {
    const { ctx, page, errors } = await open(1440, [TRACE, AWS, FW9])
    await pick(page, 'tpl-draft')
    times.draft = await run(page)
    const err = await page.$('[data-testid=run-error]')
    check('Numbered draft on 3 files: result screen', !err, err ? await err.textContent() : '')
    const report = await page.$$eval('[data-testid=auto-report-file]', (els) => els.map((e) => e.dataset.status))
    check('report: 3 files done', report.join() === 'done,done,done', report.join())
    await page.click('[data-testid=result-back]').catch(() => {})
    const v = await versions(page).catch(() => [])
    check('3 new versions in the workspace', v.length === 3, v.join(','))
    await shot(page, 'result-1440')
    check('template run: no page errors', errors.length === 0, errors[0])
    await ctx.close()
  }

  // ---------------- desktop 1440: one file fails a step ----------------
  {
    const { ctx, page, errors } = await open(1440, [TRACE, XFA, AWS])
    await pick(page, 'tpl-share')
    times.shareMixed = await run(page)
    const err = await page.$('[data-testid=run-error]')
    check('Clean copy on 3 files with one XFA form: result screen', !err, err ? await err.textContent() : '')
    const report = await page.$$eval('[data-testid=auto-report-file]', (els) => els.map((e) => `${e.dataset.status}:${e.textContent}`))
    check('report: form stopped at step 2, Flatten, the others done', report.length === 3 && report[0].startsWith('done') && /^failed:.*step 2, Flatten.*XFA/i.test(report[1]) && report[2].startsWith('done'), report.map((r) => r.slice(0, 80)).join(' | '))
    await shot(page, 'failed-step-1440')
    await page.click('[data-testid=result-back]').catch(() => {})
    const names = await page.$$eval('[data-testid=file-card]', (els) => els.map((e) => `${e.querySelector('.file-name')?.textContent}|${e.querySelector('.fc-version')?.textContent?.trim()}`))
    check('2 new versions, the form left as it was', names.length === 3 && names.filter((n) => /\|v?2$/.test(n)).length === 2 && names.some((n) => n.startsWith('xfa-imm1344e-filled.pdf|') && /\|v?1$/.test(n)), names.join(', '))
    check('failing step: no page errors', errors.length === 0, errors[0])
    await ctx.close()
  }

  // ---------------- desktop 1440: cancel mid-run ----------------
  {
    const { ctx, page, errors } = await open(1440, [LINCOLN])
    await pick(page, 'tpl-scan')
    await page.waitForFunction(() => !document.querySelector('[data-testid=run-btn]')?.disabled, null, { timeout: 30_000 })
    await page.click('[data-testid=run-btn]')
    await page.waitForFunction(() => /File 1 of 1, step 1 of 3: Auto rotate/.test(document.querySelector('[data-testid=job-progress]')?.textContent ?? ''), null, { timeout: 60_000 })
    check('progress names file, step and tool', true)
    await shot(page, 'progress-1440')
    // cancel inside OCR, the longest step
    await page.waitForFunction(() => /step 2 of 3: OCR/.test(document.querySelector('[data-testid=job-progress]')?.textContent ?? ''), null, { timeout: 180_000 })
    await page.waitForTimeout(2000)
    const t0 = Date.now()
    await page.click('[data-testid=cancel-btn]')
    await page.waitForSelector('[data-testid=run-btn]', { timeout: 30_000 })
    const stopMs = Date.now() - t0
    check('Cancel stops the run', !(await page.$('[data-testid=result-screen]')) && !(await page.$('[data-testid=run-error]')), `${stopMs} ms`)
    const v = await versions(page)
    check('cancel leaves the file as it was', v.length === 1 && /1/.test(v[0]), v.join(','))
    check('cancel: no page errors', errors.length === 0, errors[0])
    await ctx.close()
  }

  // ---------------- two tabs: no automation lost ----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    ctx.on('request', (r) => requests.push({ method: r.method(), url: r.url(), body: r.postDataBuffer()?.length ?? 0 }))
    const tab = async () => {
      const page = await ctx.newPage()
      await page.goto(`${base}/#/automate`, { waitUntil: 'load' })
      await page.waitForSelector('[data-testid=auto-pick]', { timeout: 60_000 })
      return page
    }
    const A = await tab()
    const B = await tab()
    const make = async (page, name) => {
      await page.click('[data-testid=auto-new]')
      await page.fill('[data-testid=auto-name]', name)
      await page.selectOption('[data-testid=auto-add-tool]', 'compress')
      await page.click('[data-testid=auto-add]')
    }
    const rows = (page) => page.$$eval('[data-testid=auto-pick-row]:not([data-id^=tpl-])', (els) => els.map((e) => e.querySelector('.au-pick-name').textContent))
    await make(A, 'From tab A')
    await make(B, 'From tab B')
    await A.waitForTimeout(300)
    check('two tabs: the other tab shows the new automation at once', (await rows(A)).includes('From tab B'), (await rows(A)).join(', '))
    await A.reload({ waitUntil: 'load' })
    await A.waitForSelector('[data-testid=auto-pick]', { timeout: 60_000 })
    const both = await rows(A)
    check('two tabs: both automations kept after a reload', both.includes('From tab A') && both.includes('From tab B'), both.join(', '))
    // delete in B, A follows
    await B.waitForTimeout(300)
    const idA = await B.$eval('[data-testid=auto-pick-row]:not([data-id^=tpl-])', (e) => e.dataset.id)
    await pick(B, idA)
    await B.click('[data-testid=auto-delete]')
    await B.click('[data-testid=auto-delete-yes]')
    await A.waitForTimeout(300)
    const left = await rows(A)
    check('two tabs: a delete reaches the other tab', left.length === 1, left.join(', '))
    await ctx.close()
  }

  // ---------------- damaged saved automation ----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    ctx.on('request', (r) => requests.push({ method: r.method(), url: r.url(), body: r.postDataBuffer()?.length ?? 0 }))
    await ctx.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      const steps = [
        { uid: 'd', tool: 'watermark', options: { text: null, fontSize: 'big' } },
        { uid: 'd', tool: 'nup', options: { perSheet: 'abc' } },
        { uid: 'x', tool: 'gone-tool', options: {} },
      ]
      localStorage.setItem('swiss-automations', JSON.stringify({ v: 1, list: [{ id: 'bad', name: 'Damaged one', steps }] }))
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
    await page.goto(`${base}/#/automate`, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })
    await page.setInputFiles('[data-testid=add-files-input]', [AWS])
    await waitReady(page, 1)
    await pick(page, 'bad')
    await page.waitForTimeout(300)
    const steps = await page.$$eval('[data-testid=auto-step]', (els) => els.map((e) => `${e.dataset.tool}:${e.dataset.uid}`))
    check('damaged automation opens, panel still there', (await page.isVisible('[data-testid=auto-pick]')) && steps.length === 3, steps.join(', '))
    check('duplicate step ids made unique', new Set(steps.map((x) => x.split(':')[1])).size === 3, steps.join(', '))
    check('unknown tool kept and blocks Run with a reason', /Step 3, gone-tool: .*not available/.test(await live(page)) && (await page.isDisabled('[data-testid=run-btn]')), await live(page))
    const stored = await page.evaluate(() => localStorage.getItem('swiss-automations'))
    check('unknown step not dropped from storage', stored.includes('gone-tool'))
    await page.locator('[data-testid=auto-step][data-tool="gone-tool"] [data-testid=auto-step-remove]').click()
    check('after removing it the rest runs (bad values fell back to defaults)', !(await page.isDisabled('[data-testid=run-btn]')), await live(page))
    check('damaged automation: no page errors', errors.length === 0, errors[0])
    await ctx.close()
  }

  // ---------------- storage blocked ----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    ctx.on('request', (r) => requests.push({ method: r.method(), url: r.url(), body: r.postDataBuffer()?.length ?? 0 }))
    await ctx.addInitScript(() => {
      const get = Storage.prototype.getItem
      const set = Storage.prototype.setItem
      Storage.prototype.getItem = function (k) {
        if (k === 'swiss-automations') throw new DOMException('blocked', 'SecurityError')
        return get.call(this, k)
      }
      Storage.prototype.setItem = function (k, v) {
        if (k === 'swiss-automations') throw new DOMException('blocked', 'QuotaExceededError')
        return set.call(this, k, v)
      }
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
    await page.goto(`${base}/#/automate`, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid=auto-pick]', { timeout: 60_000 })
    await page.click('[data-testid=auto-new]')
    await page.selectOption('[data-testid=auto-add-tool]', 'compress')
    await page.click('[data-testid=auto-add]')
    check('storage blocked: automations still work for the session', (await page.$$('[data-testid=auto-step]')).length === 1 && /blocks saving/.test(await page.textContent('[data-testid=auto-detail]')))
    check('storage blocked: no page errors', errors.length === 0, errors[0])
    await ctx.close()
  }

  // ---------------- phone 390 ----------------
  {
    const { ctx, page, errors } = await open(390, [TRACE, AWS, FW9])
    const scroll = {}
    await page.click('[data-testid=options-btn]')
    await page.waitForTimeout(400)
    check('390 picker in the options sheet', await page.isVisible('#options-sheet [data-testid=auto-pick]'))
    await pick(page, 'tpl-archive')
    scroll.options = await noHScroll(page)
    await shot(page, 'options-390')
    await page.click('[data-testid=auto-new]')
    await page.selectOption('[data-testid=auto-add-tool]', 'watermark')
    await page.click('[data-testid=auto-add]')
    scroll.custom = await noHScroll(page)
    await shot(page, 'custom-390')
    await pick(page, 'tpl-archive')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    times.archive = await run(page)
    const err = await page.$('[data-testid=run-error]')
    check('390 Long-term copy on 3 files: result screen', !err, err ? await err.textContent() : '')
    await page.waitForSelector('[data-testid=auto-report]', { timeout: 10_000 }).catch(() => {})
    scroll.result = await noHScroll(page)
    await shot(page, 'result-390')
    const bad = Object.entries(scroll).filter(([, ok]) => !ok).map(([k]) => k)
    check('390 no horizontal scroll (options, custom, result)', bad.length === 0, bad.join(', ') || 'none')
    check('390: no page errors', errors.length === 0, errors[0])
    await ctx.close()
  }
  // ---------------- Run to result per template, one file per run ----------------
  if (!process.argv.includes('--no-latency')) {
    const TEXT = [TRACE, AWS, FW9]
    const plan = [
      ['tpl-share', TEXT],
      ['tpl-mail', TEXT],
      ['tpl-scan', [join(CORPUS, 'scanned/fax-jean-schmidt-doe.pdf'), join(CORPUS, 'derived/sub-ndl-konoye-p1.pdf'), LINCOLN]],
      ['tpl-draft', TEXT],
      ['tpl-archive', TEXT],
    ]
    for (const [tpl, files] of plan) {
      latency[tpl] = []
      for (const file of files) {
        const { ctx, page, errors } = await open(1440, [file])
        await pick(page, tpl)
        if (tpl === 'tpl-mail') {
          await page.fill('[data-testid=pw-input]', 'Ui-Pass 5521')
          await page.fill('[data-testid=pw-confirm]', 'Ui-Pass 5521')
        }
        const ms = await run(page)
        const err = await page.$('[data-testid=run-error]')
        const ok = !err && errors.length === 0
        if (!ok) check(`${tpl} on ${file.split(/[\\/]/).pop()}`, false, err ? await err.textContent() : errors[0])
        latency[tpl].push(ok ? ms : null)
        await ctx.close()
      }
    }
  }
} catch (err) {
  check('script ran to the end', false, String(err.message ?? err).split('\n')[0])
} finally {
  await browser.close()
  await dev?.server.close()
}

const off = requests.filter((r) => !r.url.startsWith(origin) && !/^(data|blob):/.test(r.url))
const carrying = requests.filter((r) => r.url.startsWith(origin) && (!['GET', 'HEAD'].includes(r.method) || r.body > 0))
check('no request leaves the origin', off.length === 0, off.slice(0, 3).map((r) => r.url).join(', '))
check('no request could carry file data (only GET/HEAD, no bodies)', carrying.length === 0, carrying.slice(0, 3).map((r) => `${r.method} ${r.url}`).join(', '))
console.log(`\nRun to result: Numbered draft 3 files ${times.draft} ms, Clean copy 3 files (1 fails) ${times.shareMixed} ms, Long-term copy 3 files at 390 ${times.archive} ms; ${requests.length} requests checked`)
if (Object.keys(latency).length) {
  const median = (a) => {
    const s = a.filter((x) => x != null).sort((x, y) => x - y)
    return s.length ? s[Math.floor((s.length - 1) / 2)] : null
  }
  console.log('\n| Automation | Run to result, median (ms) | Files (ms) |\n|---|---|---|')
  for (const [tpl, list] of Object.entries(latency)) console.log(`| ${tpl} | ${median(list)} | ${list.map((x) => x ?? 'x').join(', ')} |`)
}
process.exit(failed ? 1 : 0)
