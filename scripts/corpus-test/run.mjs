// Real-world corpus runner. Starts Vite, drives Chromium, runs every tool's
// ops on real corpus files, feeds every corpus PDF through the real file
// input, runs a few full UI flows, validates outputs in Node and writes the
// scorecard to docs/test-results/.
//
//   npm run test:corpus -- [--quick] [--tool merge,split] [--category reports]
//                          [--layer ops,ui,flow] [--case <regex>] [--name <file stem>]
//                          [--headed] [--timeout-scale 2] [--shards 4]
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startServer, OUT_DIR, ROOT } from './server.mjs'
import { deriveAll } from './derive.mjs'
import { buildCases, intakeFiles, intakeExpectation, FLOWS, validateFlow, CORPUS, sizeOf } from './cases.mjs'
import { writeReport } from './report.mjs'

// ---------- args ----------
const argv = process.argv.slice(2)
const arg = (name, def = null) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? def : (argv[i + 1] ?? def)
}
const flag = (name) => argv.includes(`--${name}`)
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null)
const opts = {
  quick: flag('quick'),
  tools: list(arg('tool')),
  categories: list(arg('category')),
  layers: list(arg('layer')) ?? ['ops', 'ui', 'flow'],
  caseRe: arg('case') ? new RegExp(arg('case')) : null,
  name: arg('name') ?? `${new Date().toISOString().slice(0, 10)}-run${flag('quick') ? '-quick' : ''}`,
  headed: flag('headed'),
  timeoutScale: Number(arg('timeout-scale', '1')),
  shards: Math.max(1, parseInt(arg('shards', '1'), 10) || 1),
}
if (!existsSync(CORPUS)) {
  console.error('test-corpus/ is missing: run `bash scripts/fetch-test-corpus.sh` first.')
  process.exit(2)
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RESULTS_DIR = join(ROOT, 'docs', 'test-results')
mkdirSync(RESULTS_DIR, { recursive: true })
mkdirSync(OUT_DIR, { recursive: true })

const results = []
const startedAt = new Date()
function record(r) {
  results.push(r)
  const mark = { PASS: 'ok  ', FAIL: 'FAIL', SKIP: 'skip' }[r.result]
  log(`${mark} ${r.tool.padEnd(11)} ${r.id}  ${(r.ms / 1000).toFixed(1)}s  ${r.detail.slice(0, 140)}`)
  // partial results survive a runner crash. Best effort: OneDrive / antivirus can
  // lock the file for a moment (Windows EBUSY / UNKNOWN), which must not kill the run.
  try {
    writeFileSync(join(RESULTS_DIR, `${opts.name}.partial.json`), JSON.stringify(results, null, 2))
  } catch (err) {
    log(`partial write skipped: ${err.code ?? err.message}`)
  }
}

// ---------- browser / page management ----------
await deriveAll({ log })
const { server, url } = await startServer()
log(`vite on ${url}`)
const browser = await chromium.launch({ headless: !opts.headed })
// One context per shard: separate caches and pages, same browser and server.
const newContext = () => browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 1000 } })

async function freshPage(context, path = '/') {
  const page = await context.newPage()
  const state = { page, external: [], crashed: false, pageErrors: [] }
  page.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith(url) && !/^(data|blob|about|chrome-extension):/.test(u)) state.external.push(u)
  })
  page.on('crash', () => (state.crashed = true))
  page.on('pageerror', (e) => state.pageErrors.push(String(e.message ?? e)))
  page.on('dialog', (d) => d.dismiss().catch(() => {}))
  await page.goto(url + path, { waitUntil: 'load', timeout: 120_000 })
  state.cdp = await context.newCDPSession(page)
  await state.cdp.send('Performance.enable')
  return state
}

async function closePage(state) {
  try {
    await state?.page.close({ runBeforeUnload: false })
  } catch {
    /* already gone */
  }
}

// Polls the JS heap while fn runs; returns [fnResult, peakBytes].
async function withHeap(state, fn) {
  let peak = 0
  let stop = false
  const poll = (async () => {
    while (!stop) {
      try {
        const m = await state.cdp.send('Performance.getMetrics')
        peak = Math.max(peak, m.metrics.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0)
      } catch {
        /* page busy or closed */
      }
      // short naps so the poller stops right after fn ends (keeps timings honest)
      for (let i = 0; i < 10 && !stop; i++) await sleep(100)
    }
  })()
  try {
    return [await fn(), peak]
  } finally {
    stop = true
    await poll.catch(() => {})
  }
}

// Races a promise against a timeout and a renderer crash.
function guarded(state, promise, ms) {
  let timer
  let crashTimer
  return Promise.race([
    promise,
    new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s`)), ms))),
    new Promise((_, rej) => {
      const tick = () => (state.crashed ? rej(new Error('renderer crashed (out of memory?)')) : (crashTimer = setTimeout(tick, 500)))
      tick()
    }),
  ]).finally(() => {
    clearTimeout(timer)
    clearTimeout(crashTimer)
  })
}

const cleanErr = (err) =>
  String(err?.message ?? err)
    .replace(/^page\.evaluate: /, '')
    .replace(/^Error: /, '')
    .split('\n')[0]
    .slice(0, 300)

function makeCtx(id, extra) {
  const checks = []
  const cache = new Map()
  const ctx = {
    ...extra,
    checks,
    metricText: '',
    out(name) {
      if (!cache.has(name)) {
        const p = join(OUT_DIR, id, name)
        cache.set(name, existsSync(p) ? readFileSync(p) : null)
      }
      return cache.get(name)
    },
    check(name, ok, detail = '', o = {}) {
      checks.push({ name, ok: !!ok, detail: detail ? String(detail) : '', soft: !!o.soft, audit: o.audit ?? null })
    },
    metric(s) {
      ctx.metricText = s
    },
    skip(reason) {
      const e = new Error(reason)
      e.skip = true
      throw e
    },
  }
  return ctx
}

// Op errors that are the intake problem itself (pdf-lib refusing the file).
function errorAudit(error) {
  if (!error) return null
  if (/password-protected/i.test(error)) return 1
  if (/Not a valid PDF|Expected instance of|Failed to parse|Invalid object ref/i.test(error)) return 7
  return null
}

function verdict(c, ctx, { error, skip, ms, heap, opMs }) {
  let result = 'PASS'
  let detail = ctx.metricText
  const hardFail = ctx.checks.find((k) => !k.ok && !k.soft)
  const warns = ctx.checks.filter((k) => !k.ok && k.soft)
  if (skip) {
    result = 'SKIP'
    detail = skip
  } else if (error && !c.allowError) {
    result = 'FAIL'
    detail = `error: ${error}`
  } else if (hardFail) {
    result = 'FAIL'
    detail = `${hardFail.name}${hardFail.detail ? `: ${hardFail.detail}` : ''}`
  }
  if (result !== 'SKIP' && warns.length) detail += `${detail ? '; ' : ''}warn: ${warns.map((w) => `${w.name}${w.detail ? ` (${w.detail})` : ''}`).join('; ')}`
  return {
    id: c.id,
    tool: c.tool,
    layer: c.layer,
    category: c.category,
    files: c.files,
    result,
    detail: detail || '',
    error: error ?? null,
    ms,
    opMs: opMs ?? null,
    heapMB: heap ? Math.round(heap / 1048576) : null,
    audit: c.audit ?? errorAudit(error),
    checks: ctx.checks,
  }
}

// ---------- ops layer ----------
const failedCases = new Map()
async function runOps(cases, context) {
  const groups = new Map()
  for (const c of cases) {
    if (!groups.has(c.group)) groups.set(c.group, [])
    groups.get(c.group).push(c)
  }
  for (const [group, list] of groups) {
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    let state = null
    for (const c of list) {
      const t0 = Date.now()
      let prep = {}
      try {
        prep = (await c.prepare?.()) ?? {}
      } catch (err) {
        prep = { skip: `prepare failed: ${cleanErr(err)}` }
      }
      const params = { ...c.params, ...prep }
      const ctx = makeCtx(c.id, { params, meta: null, error: null, external: [] })
      const req = c.requires && failedCases.get(c.requires)
      if (prep.skip || req) {
        const r = verdict(c, ctx, { skip: prep.skip ?? `needs ${c.requires}: ${req}`, ms: 0 })
        record(r)
        continue
      }
      rmSync(join(OUT_DIR, c.id), { recursive: true, force: true })
      let res = null
      let error = null
      let heap = 0
      try {
        if (!state || state.crashed || state.page.isClosed()) state = await freshPage(context)
        const extStart = state.external.length
        const spec = { id: c.id, op: c.op, files: c.files.map((f) => `/test-corpus/${f}`), params }
        ;[res, heap] = await withHeap(state, () =>
          guarded(
            state,
            state.page.evaluate(async (s) => {
              const h = await import('/scripts/corpus-test/page-harness.js')
              return h.run(s)
            }, spec),
            c.timeout * opts.timeoutScale,
          ),
        )
        ctx.external = state.external.slice(extStart)
      } catch (err) {
        error = cleanErr(err)
        if (state) ctx.external = state.external.slice()
        // a hung or crashed page is replaced before the next case
        if (/timed out|crashed|Target closed|has been closed/.test(error)) {
          await closePage(state)
          state = null
        }
      }
      const ms = Date.now() - t0
      ctx.meta = res?.meta ?? null
      ctx.error = error
      let skip = res?.skip ?? null
      if (!skip && (!error || c.allowError)) {
        try {
          await c.validate(ctx)
        } catch (err) {
          if (err.skip) skip = err.message
          else ctx.check('validation ran', false, cleanErr(err))
        }
      }
      const r = verdict(c, ctx, { error, skip, ms, heap, opMs: res?.opMs })
      if (r.result !== 'PASS') failedCases.set(c.id, r.detail)
      record(r)
    }
    await closePage(state)
    log(`group ${group} done`)
  }
}

// ---------- UI intake layer ----------
// File cards of the shell workspace (src/app/FileGrid.jsx).
async function readCards(page) {
  return page.$$eval('[data-testid=file-card]', (cards) =>
    cards.map((c) => ({
      name: c.querySelector('.file-name')?.textContent ?? '',
      meta: c.querySelector('.file-meta')?.textContent ?? '',
      notice: c.querySelector('[data-testid=file-notice]')?.textContent ?? '',
      pw: !!c.querySelector('input[type=password]'),
    })),
  )
}

// small files in batches of 8, anything over 20 MB alone
function intakeBatches(files) {
  const batches = []
  let cur = []
  for (const f of files) {
    if (sizeOf(f) > 20e6) batches.push([f])
    else {
      cur.push(f)
      if (cur.length === 8) {
        batches.push(cur)
        cur = []
      }
    }
  }
  if (cur.length) batches.push(cur)
  return batches
}

let intakeSeq = 0
// Each batch gets its own browser context: the workspace persists in
// IndexedDB, so a shared context would show the previous batch's files.
async function runIntake(batches) {
  for (const batch of batches) {
    const context = await newContext()
    const bi = intakeSeq++
    const big = batch.length === 1 && sizeOf(batch[0]) > 20e6
    const limit = (big ? 10 : 2) * 60_000 * opts.timeoutScale
    let state = null
    const seen = new Map()
    let error = null
    let heap = 0
    const t0 = Date.now()
    try {
      state = await freshPage(context, `/?intake=${bi}#/merge`)
      await state.page.waitForSelector('[data-testid=add-files-input]', { state: 'attached', timeout: 60_000 })
      ;[, heap] = await withHeap(state, async () => {
        await state.page.setInputFiles('[data-testid=add-files-input]', batch.map((f) => join(CORPUS, f)))
        const start = Date.now()
        while (Date.now() - start < limit) {
          if (state.crashed) throw new Error('renderer crashed (out of memory?)')
          const cards = await readCards(state.page)
          for (const card of cards) if (!seen.has(card.name) && card.meta && !/Reading/.test(card.meta)) seen.set(card.name, { ...card, ms: Date.now() - start })
          if (cards.length === batch.length && seen.size === batch.length) return
          await sleep(300)
        }
        throw new Error(`timed out after ${limit / 1000}s`)
      })
    } catch (err) {
      error = cleanErr(err)
    }
    for (const f of batch) {
      const name = f.split('/').pop()
      const card = seen.get(name)
      const exp = await intakeExpectation(f)
      const ctx = makeCtx(`intake-${f}`, {})
      const shown = card?.meta ?? (error ? `(${error})` : '(no card)')
      if (!card) {
        ctx.check('UI shows a result', false, error ?? 'still reading', exp.damaged ? { audit: 7 } : {})
      } else if (exp.kind === 'accept') {
        const m = /^(\d+) pages?/.exec(card.meta)
        const audit = exp.encrypted ? 1 : 7
        ctx.check('accepted', !!m, `UI says "${card.meta}"`, { audit })
        if (m) ctx.check('page count matches pdf.js', +m[1] === exp.pages, `UI ${m[1]}, pdf.js ${exp.pages}`)
        // pdf-lib refuses every encrypted file, so intake always unlocks those
        if (m && exp.encrypted) ctx.check('says restrictions were removed', /Restrictions removed/.test(card.notice), `notice "${card.notice}"`, { audit: 1 })
        if (m && exp.damaged) ctx.check('says the file was repaired', /damaged and has been repaired/.test(card.notice), `notice "${card.notice}"`, { audit: 7 })
      } else if (exp.kind === 'password') {
        ctx.check('explains a password is needed', /password/i.test(card.meta), `UI says "${card.meta}"`)
        ctx.check('offers a password prompt', card.pw, 'no password field on the card', { audit: 1 })
      } else {
        ctx.check('rejects with a message', !/^\d+ pages?/.test(card.meta), `UI says "${card.meta}"`)
      }
      ctx.metric(`expect ${exp.kind}${exp.pages ? ` (${exp.pages} p)` : ''}${exp.encrypted ? ', encrypted' : ''}: "${shown}"${card?.notice ? ` (${card.notice})` : ''}`)
      const c = { id: `intake-${f}`, tool: 'intake', layer: 'ui', category: f.split('/')[0], files: [f] }
      record(verdict(c, ctx, { ms: card?.ms ?? Date.now() - t0, heap: big ? heap : null }))
    }
    await closePage(state)
    await context.close().catch(() => {})
  }
}

// ---------- UI flows ----------
// Shell flows (flow.shell): add files to the workspace, Run, then Download on
// the result screen. Legacy flows drive the old tool page and its own button.
async function runFlows(flows) {
  for (const flow of flows) {
    const context = await newContext()
    const t0 = Date.now()
    let state = null
    const ctx = makeCtx(flow.id, {})
    let error = null
    let heap = 0
    rmSync(join(OUT_DIR, flow.id), { recursive: true, force: true })
    try {
      state = await freshPage(context, `/?flow=${flow.id}#/${flow.route}`)
      const page = state.page
      ;[, heap] = await withHeap(state, async () => {
        const input = flow.shell ? '[data-testid=add-files-input]' : '[data-testid=dropzone] input[type=file]'
        const card = flow.shell ? 'file-card' : 'group-card'
        await page.waitForSelector(input, { state: 'attached', timeout: 60_000 })
        await page.setInputFiles(input, flow.files.map((f) => join(CORPUS, f)))
        await page.waitForFunction(
          ([n, sel]) => {
            const metas = [...document.querySelectorAll(`[data-testid=${sel}]`)].map((c) => c.querySelector('.file-meta')?.textContent ?? '')
            return metas.length === n && metas.every((m) => /^\d+ pages?/.test(m))
          },
          [flow.files.length, card],
          { timeout: 120_000 },
        )
        const tReady = Date.now()
        if (flow.range) await page.fill('[data-testid=range-input]', flow.range)
        if (flow.prepare) await flow.prepare(page)
        if (flow.shell) {
          await page.click('[data-testid=run-btn]')
          await page.waitForSelector('[data-testid=result-screen], [data-testid=run-error]', { timeout: 300_000 })
          const failure = await page.$('[data-testid=run-error]')
          if (failure) throw new Error(await failure.textContent())
        }
        const dl = page.waitForEvent('download', { timeout: 300_000 })
        await page.click(`[data-testid=${flow.shell ? 'result-download' : flow.button}]`)
        const d = await dl
        ctx.timing = `ready ${((tReady - t0) / 1000).toFixed(1)}s, click to download ${((Date.now() - tReady) / 1000).toFixed(1)}s`
        ctx.downloadName = d.suggestedFilename()
        mkdirSync(join(OUT_DIR, flow.id), { recursive: true })
        await d.saveAs(join(OUT_DIR, flow.id, ctx.downloadName))
        await page.waitForSelector('[data-testid=status]', { timeout: 30_000 }).catch(() => {})
        ctx.status = (await page.textContent('[data-testid=status]').catch(() => null)) ?? null
      })
    } catch (err) {
      error = cleanErr(err)
      ctx.status = state ? await state.page.textContent('[data-testid=status]', { timeout: 2000 }).catch(() => null) : null
    }
    if (!error) {
      try {
        await validateFlow(flow, ctx)
      } catch (err) {
        ctx.check('validation ran', false, cleanErr(err))
      }
    }
    const c = { id: flow.id, tool: flow.tool, layer: 'flow', category: 'flow', files: flow.files }
    record(verdict(c, ctx, { error: error && ctx.status ? `${error} (status: ${ctx.status})` : error, ms: Date.now() - t0, heap }))
    await closePage(state)
    await context.close().catch(() => {})
  }
}

// ---------- select + run ----------
const keep = (c) =>
  (!opts.quick || c.quick) &&
  (!opts.tools || opts.tools.includes(c.tool) || (c.tool === 'intake' && opts.tools.includes('intake'))) &&
  (!opts.categories || opts.categories.includes(c.category)) &&
  (!opts.caseRe || opts.caseRe.test(c.id))

// ---------- sharding ----------
// Work units keep together what must share a page: a group with a `requires`
// chain (the LibreOffice cases: one engine per page, never two) stays whole.
// Weights come from the last full run when there is one, else a guess.
function lastTimings() {
  const f = join(RESULTS_DIR, '2026-10-17-baseline.json')
  try {
    return new Map(JSON.parse(readFileSync(f, 'utf8')).results.map((r) => [r.id, r.ms]))
  } catch {
    return new Map()
  }
}
const TIMINGS = lastTimings()
const guessMs = (id, files, timeout) => {
  if (TIMINGS.has(id)) return Math.max(500, TIMINGS.get(id))
  const mb = (files ?? []).reduce((a, f) => a + sizeOf(f) / 1e6, 0)
  return 1500 + mb * 300 + (timeout > 120_000 ? 15_000 : 0)
}

function opsUnits(cases) {
  const byGroup = new Map()
  for (const c of cases) {
    if (!byGroup.has(c.group)) byGroup.set(c.group, [])
    byGroup.get(c.group).push(c)
  }
  const units = []
  for (const list of byGroup.values()) {
    if (list.some((c) => c.requires)) units.push({ kind: 'ops', cases: list })
    else for (const c of list) units.push({ kind: 'ops', cases: [c] })
  }
  for (const u of units) u.weight = u.cases.reduce((a, c) => a + guessMs(c.id, c.files, c.timeout), 0)
  return units
}

// Longest job first onto the lightest shard.
function assign(units, n) {
  const shards = Array.from({ length: n }, () => ({ weight: 0, units: [] }))
  for (const u of [...units].sort((a, b) => b.weight - a.weight)) {
    const s = shards.reduce((m, x) => (x.weight < m.weight ? x : m))
    s.units.push(u)
    s.weight += u.weight
  }
  return shards
}

async function runShard(shard, index) {
  const context = await newContext()
  try {
    // keep a stable order inside the shard: ops by tool group, then ui, then flows
    const ops = shard.units.filter((u) => u.kind === 'ops').flatMap((u) => u.cases)
    const groupRank = new Map()
    for (const c of selectedOps) if (!groupRank.has(c.group)) groupRank.set(c.group, groupRank.size)
    const order = new Map(selectedOps.map((c, i) => [c.id, groupRank.get(c.group) * 1e4 + i]))
    ops.sort((a, b) => order.get(a.id) - order.get(b.id))
    if (ops.length) await runOps(ops, context)
    const batches = shard.units.filter((u) => u.kind === 'ui').map((u) => u.batch)
    if (batches.length) await runIntake(batches)
    const flows = shard.units.filter((u) => u.kind === 'flow').map((u) => u.flow)
    if (flows.length) await runFlows(flows)
  } finally {
    await context.close().catch(() => {})
  }
  log(`shard ${index + 1} done`)
}

let selectedOps = []
try {
  if (opts.layers.includes('ops')) selectedOps = buildCases().filter(keep)
  let files = []
  if (opts.layers.includes('ui')) {
    files = intakeFiles()
    if (opts.categories) files = files.filter((f) => opts.categories.includes(f.split('/')[0]))
    if (opts.caseRe) files = files.filter((f) => opts.caseRe.test(`intake-${f}`))
    if (opts.tools && !opts.tools.includes('intake')) files = []
    if (opts.quick) files = files.filter((f, i) => i % 6 === 0 || /owner-only|xref|fuzzed|user-pw|3371/.test(f))
  }
  const flows = opts.layers.includes('flow')
    ? FLOWS.filter((f) => (!opts.quick || f.quick) && (!opts.tools || opts.tools.includes(f.tool)) && (!opts.caseRe || opts.caseRe.test(f.id)) && !opts.categories)
    : []
  log(`ops ${selectedOps.length} cases, ui intake ${files.length} files, flows ${flows.length}, shards ${opts.shards}`)
  if (opts.shards === 1) {
    const context = await newContext()
    if (selectedOps.length) await runOps(selectedOps, context)
    if (files.length) await runIntake(intakeBatches(files))
    if (flows.length) await runFlows(flows)
    await context.close().catch(() => {})
  } else {
    const units = [
      ...opsUnits(selectedOps),
      ...intakeBatches(files).map((batch) => ({ kind: 'ui', batch, weight: batch.reduce((a, f) => a + 400 + sizeOf(f) / 1e5, 0) })),
      ...flows.map((flow) => ({ kind: 'flow', flow, weight: guessMs(flow.id, flow.files, 0) })),
    ]
    const shards = assign(units, opts.shards)
    shards.forEach((s, i) => log(`shard ${i + 1}: ${s.units.length} units, est ${(s.weight / 1000).toFixed(0)}s`))
    await Promise.all(shards.map(runShard))
    // same row order as a serial run
    const layerRank = { ops: 0, ui: 1, flow: 2 }
    // serial runs ops group by group, in first-seen group order
    const groupRank = new Map()
    for (const c of selectedOps) if (!groupRank.has(c.group)) groupRank.set(c.group, groupRank.size)
    const opsOrder = new Map(selectedOps.map((c, i) => [c.id, groupRank.get(c.group) * 1e4 + i]))
    const fileOrder = new Map(files.map((f, i) => [`intake-${f}`, i]))
    const flowOrder = new Map(flows.map((f, i) => [f.id, i]))
    const rank = (r) => opsOrder.get(r.id) ?? fileOrder.get(r.id) ?? flowOrder.get(r.id) ?? 0
    results.sort((a, b) => layerRank[a.layer] - layerRank[b.layer] || rank(a) - rank(b))
  }
} finally {
  await browser.close().catch(() => {})
  await server.close().catch(() => {})
}

const finishedAt = new Date()
const command = `npm run test:corpus${argv.length ? ' -- ' + argv.join(' ') : ''}`
const paths = writeReport(results, { name: opts.name, startedAt, finishedAt, command, dir: RESULTS_DIR })
rmSync(join(RESULTS_DIR, `${opts.name}.partial.json`), { force: true })
const count = (r) => results.filter((x) => x.result === r).length
log(`done in ${((finishedAt - startedAt) / 60000).toFixed(1)} min: ${count('PASS')} pass, ${count('FAIL')} fail, ${count('SKIP')} skip`)
log(`report: ${paths.md}`)
