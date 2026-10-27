// U5-A corpus cases: N-up, booklet, page size, single large page, overlay,
// stamp, remove blank pages, linearize, adjust colours, replace / invert
// colours. Ops live in page-harness-u5a.js (op names "u5a:<name>").
// cases.mjs calls registerU5A (or loads the default export) with its own
// helpers.
// Imposition cases with mark: true first stamp "QPAGE<n>" in the middle of
// every source page, then check where each marker landed; raw rows run the
// unchanged file and check what was kept (bookmarks, title, fields,
// comments, links).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as mupdf from 'mupdf'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { findTextPositions, imagePlacements, openMupdf, textAt, withPdfjs, wordCoverage, formFacts } from './validate.mjs'
import { checkLinearized } from './lin-check.mjs'
import { ROOT } from './server.mjs'
import { nupPlan, nupCell, bookletSides, overlayIndex, paperShare, MIN_PAPER } from '../../src/lib/layoutOps.js'
import { adjustMap, replaceMap } from '../../src/lib/colorOps.js'

const near = (a, b, tol = 1) => Math.abs(a - b) <= tol
const FILLED = 'U5A FILLED VALUE' // page-harness-u5a.js fills this in

// QPAGE markers of an output: Map(source page -> [{ page, fx, fy }]).
async function markers(bytes, pages = null) {
  const hits = await findTextPositions(bytes, 'QPAGE', { pages })
  const map = new Map()
  for (const h of hits) {
    const m = /QPAGE(\d+)/.exec(h.str)
    if (!m) continue
    const n = Number(m[1])
    if (!map.has(n)) map.set(n, [])
    map.get(n).push(h)
  }
  return map
}

// RGB pixels of a page rendered by MuPDF at a fixed width.
function mupdfPixels(bytes, n, width = 300) {
  const { doc } = openMupdf(bytes)
  try {
    const page = doc.loadPage(n - 1)
    const [x0, , x1] = page.getBounds()
    const s = width / Math.max(1, x1 - x0)
    const pix = page.toPixmap([s, 0, 0, s, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true)
    const out = { px: pix.getPixels().slice(), w: pix.getWidth(), h: pix.getHeight() }
    pix.destroy?.()
    page.destroy?.()
    return out
  } finally {
    doc.destroy?.()
  }
}

// Output pixels against map(input pixels), both rendered by MuPDF.
function mupdfColourError(input, output, n, map) {
  const a = mupdfPixels(input, n)
  const b = mupdfPixels(output, n)
  if (Math.abs(a.w - b.w) > 1 || Math.abs(a.h - b.h) > 1) return { mean: 255, p99: 255, max: 255, size: `${a.w}x${a.h} vs ${b.w}x${b.h}` }
  const hist = new Uint32Array(256)
  let sum = 0
  let total = 0
  const w = Math.min(a.w, b.w)
  const h = Math.min(a.h, b.h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * a.w + x) * 3
      const j = (y * b.w + x) * 3
      const want = map(a.px[i], a.px[i + 1], a.px[i + 2])
      for (let k = 0; k < 3; k++) {
        const e = Math.abs(want[k] - b.px[j + k])
        hist[e]++
        sum += e
        total++
      }
    }
  }
  let seen = 0
  let p99 = 0
  for (let e = 0; e < 256; e++) {
    seen += hist[e]
    if (seen >= total * 0.99) {
      p99 = e
      break
    }
  }
  return { mean: Math.round((sum / total) * 100) / 100, p99 }
}

// Bookmarks, title, links, fields and comments as pdf.js sees them.
const structFacts = (bytes) =>
  withPdfjs(bytes, async (doc) => {
    const out = { links: 0, widgets: 0, comments: 0, title: null, outline: 0, linkRects: [] }
    out.title = (await doc.getMetadata()).info?.Title || null
    const walk = (items) => (items ?? []).reduce((n, it) => n + 1 + walk(it.items), 0)
    out.outline = walk(await doc.getOutline())
    for (let i = 1; i <= Math.min(doc.numPages, 200); i++) {
      const p = await doc.getPage(i)
      for (const a of await p.getAnnotations()) {
        if (a.subtype === 'Link') {
          out.links++
          if (out.linkRects.length < 40) out.linkRects.push({ page: i, rect: a.rect })
        } else if (a.subtype === 'Widget') out.widgets++
        else if (a.subtype !== 'Popup' && !(a.annotationFlags & 34) && a.hasAppearance) out.comments++
      }
      p.cleanup()
    }
    return out
  })

// Bytes pdf.js loads to show page 1 when reading by ranges (16 KB chunks,
// no prefetch), as a browser does with a file on a web server.
const PDFJS_DIR = join(ROOT, 'node_modules', 'pdfjs-dist').replace(/\\/g, '/')
async function page1Bytes(bytes) {
  let got = 1024
  class Transport extends pdfjs.PDFDataRangeTransport {
    requestDataRange(begin, end) {
      got += end - begin
      setTimeout(() => this.onDataRange(begin, bytes.slice(begin, end)), 0)
    }
  }
  const doc = await pdfjs.getDocument({
    range: new Transport(bytes.length, bytes.slice(0, 1024)),
    disableAutoFetch: true,
    disableStream: true,
    rangeChunkSize: 16384,
    verbosity: 0,
    cMapUrl: `${PDFJS_DIR}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_DIR}/standard_fonts/`,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise
  try {
    const p = await doc.getPage(1)
    await p.getOperatorList()
    await p.getTextContent()
  } finally {
    await doc.destroy()
  }
  return got
}

// Real blank pages of scanned/lincoln-ellsworth-letter-1861.pdf (paper only,
// looked at page by page). Covers, endpapers and pages with a heading, a
// photo, handwriting or a small pencil note are not blank.
const LINCOLN_BLANKS = [4, 7, 8, 9, 12, 16, 20, 22, 25, 26, 27, 28, 29, 30, 31, 32]

export function registerU5A({ add: addCase, checkPdf, allText, inputFacts, CORPUS, MIN }) {
  const readRel = (rel) => new Uint8Array(readFileSync(join(CORPUS, rel)))
  // the input the op worked on: the harness saves it when it changed it
  const inputOf = (ctx, rel) => ctx.out('input.pdf') ?? readRel(rel)

  // every U5-A row: nothing leaves the page
  const add = (c) =>
    addCase({
      ...c,
      async validate(ctx) {
        ctx.check('no external requests', (ctx.external ?? []).length === 0, (ctx.external ?? [])[0] ?? '')
        return c.validate(ctx)
      },
    })

  // Blank by the same rule as the app, on a MuPDF render (independent of
  // the pdf.js render the app uses).
  const blankInMupdf = (bytes, n) => {
    const { px } = mupdfPixels(bytes, n)
    const { paper, clean } = paperShare(px, 30, 3)
    return paper >= MIN_PAPER && clean >= 0.999
  }

  // Source words still found in the output (text stays text).
  const textKept = async (ctx, p, rel, min = 0.97) => {
    const src = await inputFacts(rel)
    const cov = wordCoverage((src.pdfjs.texts ?? []).join(' '), allText(p))
    if (cov.ratio === null) return
    ctx.check('source text kept', cov.ratio >= min, `coverage ${cov.ratio.toFixed(3)} of ${cov.words} words`)
  }

  // What an imposed copy kept: bookmarks and title; fields and comments
  // drawn in; links counted as lost.
  const impositionKept = async (ctx, name, rel) => {
    const before = await structFacts(inputOf(ctx, rel))
    const after = await structFacts(ctx.out(name))
    const r = ctx.meta.report ?? {}
    ctx.check('bookmarks kept', after.outline === before.outline && r.bookmarks === before.outline, `${before.outline} -> ${after.outline} (report ${r.bookmarks})`)
    if (before.title) ctx.check('title kept', after.title === before.title, `${before.title} -> ${after.title}`)
    ctx.check('lost links counted', r.links === before.links, `${before.links} links, report ${r.links}`)
    if (before.comments) ctx.check('comments drawn in', r.comments === before.comments, `${before.comments} comments, report ${r.comments}`)
    if (before.widgets) ctx.check('form fields drawn in', r.fields > 0 && r.fields <= before.widgets, `${before.widgets} widgets, report ${r.fields}`)
    return { before, after }
  }

  // ---------- N-up ----------
  function nupCase(id, file, opts, extra = {}) {
    const mark = extra.mark ?? true
    add({
      id,
      tool: 'nup',
      op: 'u5a:nup',
      files: [file],
      params: { mark, fill: !!extra.fill, opts },
      timeout: extra.timeout ?? 3 * MIN,
      quick: !!extra.quick,
      async validate(ctx) {
        const sizes = ctx.meta.sizes
        const n = sizes.length
        const plan = nupPlan({ w: sizes[0][0], h: sizes[0][1] }, opts)
        const per = plan.cols * plan.rows
        const sheets = Math.ceil(n / per)
        const p = await checkPdf(ctx, 'nup.pdf', { pages: sheets })
        if (!p?.pdfjs.ok) return
        const info = p.pdfjs.pageInfo
        ctx.check('sheet size as planned', info.every((s) => near(s.w, plan.W) && near(s.h, plan.H)), `${Math.round(info[0].w)}x${Math.round(info[0].h)} vs ${Math.round(plan.W)}x${Math.round(plan.H)}`)
        if (mark) {
          const check = [...new Set([1, Math.min(2, sheets), sheets])]
          const marks = await markers(ctx.out('nup.pdf'), check)
          const margin = opts.margin ?? 18
          const gap = opts.gap ?? 12
          const wrong = []
          for (let k = 1; k <= n; k++) {
            const sheet = Math.floor((k - 1) / per) + 1
            if (!check.includes(sheet)) continue
            const { col, row } = nupCell((k - 1) % per, plan.cols, plan.rows, opts.order, opts.direction)
            const x0 = (margin + col * (plan.cw + gap)) / plan.W
            const y0 = (margin + row * (plan.ch + gap)) / plan.H
            const hit = (marks.get(k) ?? []).find((h) => h.page === sheet && h.upright && h.fx >= x0 && h.fx <= x0 + plan.cw / plan.W && h.fy >= y0 && h.fy <= y0 + plan.ch / plan.H)
            if (!hit) wrong.push(`p${k}: ${JSON.stringify((marks.get(k) ?? []).map((h) => [h.page, h.fx.toFixed(2), h.fy.toFixed(2)]))} want sheet ${sheet} cell ${col},${row}`)
          }
          ctx.check('every page upright in its cell (marker positions)', wrong.length === 0, wrong.slice(0, 3).join('; '))
        } else await impositionKept(ctx, 'nup.pdf', file)
        if (extra.fill) ctx.check('filled field value still shows', allText(p).includes(FILLED), allText(p).slice(0, 80))
        if (sheets <= 60) await textKept(ctx, p, file)
        ctx.metric(`${n} pages on ${sheets} sheets, ${plan.cols}x${plan.rows}, ${(ctx.out('nup.pdf').length / 1048576).toFixed(1)} MB`)
      },
    })
  }
  nupCase('u5a-nup4-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { perSheet: 4 }, { quick: true })
  nupCase('u5a-nup2-aws-invoice', 'invoices/aws-invoice.pdf', { perSheet: 2, border: true })
  nupCase('u5a-nup6-cols-rtl-attention', 'reports/arxiv-1706.03762-attention.pdf', { perSheet: 6, order: 'cols', direction: 'rtl' })
  nupCase('u5a-nup9-a4-rot90-cropbox', 'derived/rot90-cropbox-bert.pdf', { perSheet: 9, sheet: 'a4', margin: 10, gap: 6 }, { quick: true })
  nupCase('u5a-nup4-rot270-cropbox', 'derived/c-rot270-cropbox.pdf', { perSheet: 4, border: true })
  nupCase('u5a-nup2-origin-shift', 'derived/origin-shift-aws-invoice.pdf', { perSheet: 2, sheet: 'letter' })
  nupCase('u5a-nup3x2-custom-mixed', 'derived/c-mixed.pdf', { cols: 3, rows: 2, orientation: 'landscape' })
  nupCase('u5a-nup16-llama2', 'reports/arxiv-2307.09288-llama2.pdf', { perSheet: 16 }, { timeout: 5 * MIN })
  // unchanged files: bookmarks, title, fields and comments
  nupCase('u5a-nup2-raw-attention', 'reports/arxiv-1706.03762-attention.pdf', { perSheet: 2 }, { mark: false, quick: true })
  nupCase('u5a-nup2-filled-fw9', 'forms/irs-fw9.pdf', { perSheet: 2 }, { mark: false, fill: true })
  nupCase('u5a-nup4-comments-tracemonkey', 'quirks/pdfjs-tracemonkey_with_annotations.pdf', { perSheet: 4 }, { mark: false })

  // ---------- booklet ----------
  function bookletCase(id, file, opts, extra = {}) {
    const mark = extra.mark ?? true
    add({
      id,
      tool: 'booklet',
      op: 'u5a:booklet',
      files: [file],
      params: { mark, fill: !!extra.fill, opts },
      timeout: extra.timeout ?? 3 * MIN,
      quick: !!extra.quick,
      async validate(ctx) {
        const sizes = ctx.meta.sizes
        const n = sizes.length
        const sides = bookletSides(n, opts.spine).filter((s) => !opts.sides || opts.sides === 'both' || s.side === opts.sides)
        const p = await checkPdf(ctx, 'booklet.pdf', { pages: sides.length })
        if (!p?.pdfjs.ok) return
        const cw = Math.max(...sizes.map((s) => s[0]))
        const ch = Math.max(...sizes.map((s) => s[1]))
        const gutter = opts.gutter ?? 0
        const info = p.pdfjs.pageInfo[0]
        if (!opts.sheet) ctx.check('sheet = two pages side by side', near(info.w, 2 * cw + gutter) && near(info.h, ch), `${Math.round(info.w)}x${Math.round(info.h)}`)
        if (mark) {
          const check = [...new Set([1, 2, sides.length - 1, sides.length].filter((x) => x >= 1))]
          const marks = await markers(ctx.out('booklet.pdf'), check)
          const wrong = []
          for (const i of check) {
            // a back turned 180 shows its left page on the right
            const flip = !!opts.longEdge && sides[i - 1].side === 'back'
            sides[i - 1].slots.forEach((slot, k) => {
              if (slot === null) return
              const hit = (marks.get(slot + 1) ?? []).find((h) => h.page === i && ((k === 0) !== flip ? h.fx < 0.5 : h.fx > 0.5))
              if (!hit) wrong.push(`side ${i} ${k ? 'right' : 'left'} want p${slot + 1}`)
            })
            // padding slots stay empty
            const extraPages = [...marks.entries()].filter(([pg, hs]) => hs.some((h) => h.page === i) && !sides[i - 1].slots.includes(pg - 1))
            if (extraPages.length) wrong.push(`side ${i} has p${extraPages.map((e) => e[0]).join(',')}`)
          }
          ctx.check('saddle-stitch page order (marker positions)', wrong.length === 0, wrong.slice(0, 4).join('; '))
        } else await impositionKept(ctx, 'booklet.pdf', file)
        if (opts.longEdge) ctx.check('backs turned 180 for long-edge printers', p.pdfjs.pageInfo.every((s, i) => s.rotate === (sides[i].side === 'back' ? 180 : 0)))
        else ctx.check('no side turned (short-edge duplex)', p.pdfjs.pageInfo.every((s) => s.rotate === 0))
        if (extra.fill) ctx.check('filled field value still shows', allText(p).includes(FILLED))
        if ((!opts.sides || opts.sides === 'both') && sides.length <= 60) await textKept(ctx, p, file)
        const order = sides.slice(0, 2).map((s) => s.slots.map((x) => (x === null ? '-' : x + 1)).join('|'))
        ctx.metric(`${n} pages on ${Math.ceil(sides.length / (opts.sides && opts.sides !== 'both' ? 1 : 2))} sheets, first sides ${order.join(' / ')}`)
      },
    })
  }
  bookletCase('u5a-booklet-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { spine: 'left' }, { quick: true })
  bookletCase('u5a-booklet-aws-invoice', 'invoices/aws-invoice.pdf', {})
  bookletCase('u5a-booklet-attention-spine-right-gutter', 'reports/arxiv-1706.03762-attention.pdf', { spine: 'right', gutter: 24, border: true })
  bookletCase('u5a-booklet-mixed-fronts', 'derived/c-mixed.pdf', { sides: 'front' })
  bookletCase('u5a-booklet-long-edge-rot90-a4', 'derived/rot90-cropbox-bert.pdf', { longEdge: true, sheet: 'a4' })
  bookletCase('u5a-booklet-llama2', 'reports/arxiv-2307.09288-llama2.pdf', {}, { timeout: 5 * MIN })
  bookletCase('u5a-booklet-raw-attention', 'reports/arxiv-1706.03762-attention.pdf', {}, { mark: false })
  bookletCase('u5a-booklet-filled-fw9', 'forms/irs-fw9.pdf', {}, { mark: false, fill: true })

  // ---------- scale / page size ----------
  function scaleCase(id, file, opts, want, extra = {}) {
    const mark = extra.mark ?? true
    add({
      id,
      tool: 'scale',
      op: 'u5a:scale',
      files: [file],
      params: { mark, fill: !!extra.fill, opts },
      timeout: extra.timeout ?? 3 * MIN,
      quick: !!extra.quick,
      async validate(ctx) {
        const sizes = ctx.meta.sizes
        const p = await checkPdf(ctx, 'scaled.pdf', { pages: sizes.length })
        if (!p?.pdfjs.ok) return
        const info = p.pdfjs.pageInfo
        const bad = info.map((s, i) => [i + 1, want(sizes[i]), [s.w, s.h]]).filter(([, w, g]) => !near(w[0], g[0]) || !near(w[1], g[1]))
        ctx.check('page sizes', bad.length === 0, bad.slice(0, 3).map(([i, w, g]) => `p${i} ${g.map(Math.round)} want ${w.map(Math.round)}`).join('; '))
        if (mark) {
          const pages = [...new Set([1, Math.min(2, sizes.length), sizes.length])]
          const marks = await markers(ctx.out('scaled.pdf'), pages)
          // marker text starts left of centre, sits near the middle, upright
          const off = pages.filter((n) => !(marks.get(n) ?? []).some((h) => h.page === n && h.upright && h.fx > 0.2 && h.fx < 0.55 && h.fy > 0.4 && h.fy < 0.6))
          ctx.check('content centred and upright on the new page', off.length === 0, `pages ${off.join(', ')}`)
        } else {
          // the pages stay the same objects: everything is kept
          const before = await structFacts(inputOf(ctx, file))
          const after = await structFacts(ctx.out('scaled.pdf'))
          for (const k of ['links', 'widgets', 'comments', 'outline']) ctx.check(`${k} kept`, after[k] === before[k], `${before[k]} -> ${after[k]}`)
          if (before.title) ctx.check('title kept', after.title === before.title)
          if (extra.fill) {
            const facts = await formFacts(ctx.out('scaled.pdf'))
            ctx.check('filled value kept in the field', Object.values(facts.values).some((v) => String(v ?? '').includes(FILLED)))
          }
          // with a pure factor (origin 0) every link rect is scaled the same
          if (extra.factor) {
            const off = before.linkRects.filter((l, i) => {
              const o = after.linkRects[i]
              return !o || o.page !== l.page || l.rect.some((v, k) => !near(v * extra.factor, o.rect[k], 0.05))
            })
            ctx.check(`link areas scaled by ${extra.factor}`, before.linkRects.length > 0 && off.length === 0, JSON.stringify(off.slice(0, 2)))
          }
        }
        await textKept(ctx, p, file)
        ctx.metric(`${sizes.length} pages, first ${Math.round(info[0].w)}x${Math.round(info[0].h)} pt`)
      },
    })
  }
  const A4 = [595.28, 841.89]
  const sideways = (s, [a, b]) => (s[0] > s[1] ? [b, a] : [a, b])
  scaleCase('u5a-scale-a4-fit-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { size: 'a4' }, (s) => sideways(s, A4), { quick: true })
  scaleCase('u5a-scale-half-aws-invoice', 'invoices/aws-invoice.pdf', { size: 'keep', mode: 'factor', factor: 0.5 }, (s) => [s[0] / 2, s[1] / 2])
  scaleCase('u5a-scale-a3-attention', 'reports/arxiv-1706.03762-attention.pdf', { size: 'a3' }, (s) => sideways(s, [841.89, 1190.55]))
  scaleCase('u5a-scale-letter-landscape-rot270', 'derived/c-rot270-cropbox.pdf', { size: 'letter', orientation: 'landscape' }, () => [792, 612], { quick: true })
  scaleCase('u5a-scale-a4-rot90-cropbox', 'derived/rot90-cropbox-bert.pdf', { size: 'a4' }, (s) => sideways(s, A4))
  scaleCase('u5a-scale-a5-origin-shift', 'derived/origin-shift-aws-invoice.pdf', { size: 'a5' }, (s) => sideways(s, [419.53, 595.28]))
  scaleCase('u5a-scale-150pc-mixed', 'derived/c-mixed.pdf', { size: 'keep', mode: 'factor', factor: 1.5 }, (s) => [s[0] * 1.5, s[1] * 1.5])
  scaleCase('u5a-scale-half-raw-attention', 'reports/arxiv-1706.03762-attention.pdf', { size: 'keep', mode: 'factor', factor: 0.5 }, (s) => [s[0] / 2, s[1] / 2], { mark: false, factor: 0.5, quick: true })
  scaleCase('u5a-scale-a4-filled-fw9', 'forms/irs-fw9.pdf', { size: 'a4' }, (s) => sideways(s, A4), { mark: false, fill: true })
  scaleCase('u5a-scale-a4-comments-tracemonkey', 'quirks/pdfjs-tracemonkey_with_annotations.pdf', { size: 'a4' }, (s) => sideways(s, A4), { mark: false })

  // ---------- single large page ----------
  function singleCase(id, file, extra = {}) {
    const mark = extra.mark ?? true
    add({
      id,
      tool: 'singlepage',
      op: 'u5a:single',
      files: [file],
      params: { mark },
      timeout: extra.timeout ?? 3 * MIN,
      quick: !!extra.quick,
      async validate(ctx) {
        const sizes = ctx.meta.sizes
        const p = await checkPdf(ctx, 'single.pdf', { pages: 1 })
        if (!p?.pdfjs.ok) return
        const H = sizes.reduce((s, x) => s + x[1], 0)
        const W = Math.max(...sizes.map((x) => x[0]))
        const got = p.pdfjs.pageInfo[0]
        // stacks over 200 in are scaled down to the limit
        const k = ctx.meta.scale
        ctx.check('height = sum of page heights, width = widest (times the scale)', near(got.h, H * k) && near(got.w, W * k), `${Math.round(got.w)}x${Math.round(got.h)} want ${Math.round(W * k)}x${Math.round(H * k)}`)
        if (H > 14400) ctx.check('scaled to the 200 inch limit', got.h < 14400 && got.h > 14300, `${got.h}`)
        if (mark) {
          const marks = await markers(ctx.out('single.pdf'), [1])
          let top = 0
          const wrong = []
          sizes.forEach((s, i) => {
            const hit = (marks.get(i + 1) ?? []).find((h) => h.upright && h.fy * H >= top - 1 && h.fy * H <= top + s[1] + 1)
            if (!hit) wrong.push(`p${i + 1}`)
            top += s[1]
          })
          ctx.check('pages stacked in order, upright (marker bands)', wrong.length === 0, wrong.slice(0, 5).join(', '))
        } else await impositionKept(ctx, 'single.pdf', file)
        await textKept(ctx, p, file)
        ctx.metric(`${sizes.length} pages, ${Math.round(W * k)} x ${Math.round(H * k)} pt${k < 1 ? `, scaled ${(k * 100).toFixed(0)}%` : ''}`)
      },
    })
  }
  singleCase('u5a-single-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { quick: true })
  singleCase('u5a-single-aws-invoice', 'invoices/aws-invoice.pdf')
  singleCase('u5a-single-attention', 'reports/arxiv-1706.03762-attention.pdf')
  singleCase('u5a-single-mixed', 'derived/c-mixed.pdf')
  singleCase('u5a-single-lincoln-scan-scaled', 'scanned/lincoln-ellsworth-letter-1861.pdf')
  // 77 pages stack to 847 in: scaled down to the 200 inch limit
  singleCase('u5a-single-llama2-scaled', 'reports/arxiv-2307.09288-llama2.pdf', { timeout: 4 * MIN })
  singleCase('u5a-single-raw-attention', 'reports/arxiv-1706.03762-attention.pdf', { mark: false })

  // ---------- overlay ----------
  function overlayCase(id, files, opts, overlayPages, probe, extra = {}) {
    add({
      id,
      tool: 'overlay',
      op: 'u5a:overlay',
      files,
      params: { opts, blankFirst: !!extra.blankFirst },
      timeout: 3 * MIN,
      quick: !!extra.quick,
      async validate(ctx) {
        const n = ctx.meta.sizes.length
        const p = await checkPdf(ctx, 'overlay.pdf', { pages: n })
        if (!p?.pdfjs.ok) return
        ctx.check('base page sizes kept', p.pdfjs.pageInfo.every((s, i) => near(s.w, ctx.meta.sizes[i][0]) && near(s.h, ctx.meta.sizes[i][1])))
        const look = [...new Set([1, 2, 3, 4, 5, n].filter((x) => x <= n))]
        const texts = await textAt(ctx.out('overlay.pdf'), look)
        const wrong = []
        look.forEach((pg, i) => {
          const j = overlayIndex(pg - 1, overlayPages.length, opts.mode, opts.repeat)
          overlayPages.forEach((marker, k) => {
            const has = texts[i].includes(marker)
            if (has !== (j === k)) wrong.push(`p${pg} ${marker} ${has ? 'present' : 'missing'}`)
          })
        })
        ctx.check('overlay pages on the right base pages', wrong.length === 0, wrong.slice(0, 4).join('; '))
        // the base file keeps its own links and bookmarks
        const before = await structFacts(inputOf(ctx, files[0]))
        const after = await structFacts(ctx.out('overlay.pdf'))
        ctx.check('base links and bookmarks kept', after.links === before.links && after.outline === before.outline, `links ${before.links} -> ${after.links}, bookmarks ${before.outline} -> ${after.outline}`)
        await textKept(ctx, p, files[0])
        if (probe) await probe(ctx, p)
        ctx.metric(`${n} pages, ${opts.mode ?? 'sequential'}, ${opts.position ?? 'foreground'}`)
      },
    })
  }
  // markers: text found only on the overlay page (AWS account number)
  overlayCase('u5a-overlay-interleaved-tracemonkey-aws', ['reports/pdfjs-tracemonkey.pdf', 'invoices/aws-invoice.pdf'], { mode: 'interleaved', opacity: 0.6 }, ['296664039561'], null, { quick: true })
  overlayCase('u5a-overlay-background-rot270', ['derived/c-rot270-cropbox.pdf', 'invoices/aws-invoice.pdf'], { mode: 'interleaved', position: 'background' }, ['296664039561'], async (ctx) => {
    const hits = await findTextPositions(ctx.out('overlay.pdf'), '296664039561', { pages: [1] })
    ctx.check('overlay upright and on the visible page (rotated base)', hits.length > 0 && hits.every((h) => h.upright && h.fx > 0 && h.fx < 1 && h.fy > 0 && h.fy < 1), JSON.stringify(hits.map((h) => [h.fx.toFixed(2), h.fy.toFixed(2), h.upright])))
  })
  overlayCase('u5a-overlay-sequential-attention-aws', ['reports/arxiv-1706.03762-attention.pdf', 'invoices/aws-invoice.pdf'], { mode: 'sequential' }, ['296664039561'], null)
  overlayCase('u5a-overlay-repeat3-rot90-origin', ['derived/rot90-cropbox-bert.pdf', 'derived/origin-shift-aws-invoice.pdf'], { mode: 'repeat', repeat: 3 }, ['296664039561'], async (ctx) => {
    const hits = await findTextPositions(ctx.out('overlay.pdf'), '296664039561', { pages: [1] })
    ctx.check('overlay upright and inside the CropBox of a /Rotate 90 page', hits.length > 0 && hits.every((h) => h.upright && h.fx > 0 && h.fx < 1 && h.fy > 0 && h.fy < 1), JSON.stringify(hits.map((h) => [h.fx.toFixed(2), h.fy.toFixed(2), h.upright])))
  })
  // an empty base page (no /Contents, as the page editor inserts them)
  overlayCase('u5a-overlay-background-empty-page', ['reports/pdfjs-tracemonkey.pdf', 'invoices/aws-invoice.pdf'], { mode: 'interleaved', position: 'background' }, ['296664039561'], null, { blankFirst: true })

  // ---------- stamp ----------
  function stampCase(id, file, opts, verify, extra = {}) {
    add({
      id,
      tool: 'stamp',
      op: 'u5a:stamp',
      files: [file],
      params: { opts, image: !!extra.image },
      timeout: 2 * MIN,
      quick: !!extra.quick,
      async validate(ctx) {
        const n = ctx.meta.sizes.length
        const p = await checkPdf(ctx, 'stamped.pdf', { pages: n })
        if (!p?.pdfjs.ok) return
        ctx.check('page boxes unchanged', p.pdfjs.pageInfo.every((s, i) => near(s.w, ctx.meta.sizes[i][0]) && near(s.h, ctx.meta.sizes[i][1])))
        await textKept(ctx, p, file)
        await verify(ctx, p, n)
      },
    })
  }
  // where a text stamp starts on each page: fractions of the visible page
  const stampAt = async (ctx, needle, n, inside, label) => {
    const hits = await findTextPositions(ctx.out('stamped.pdf'), needle)
    const pages = Array.from({ length: n }, (_, i) => i + 1)
    const bad = pages.filter((pg) => !hits.some((h) => h.page === pg && inside(h)))
    ctx.check(label, bad.length === 0, `pages ${bad.join(', ')}: ${JSON.stringify(hits.filter((h) => bad.includes(h.page)).map((h) => [h.page, h.fx.toFixed(2), h.fy.toFixed(2), h.upright]))}`)
    return hits
  }
  stampCase('u5a-stamp-topright-tokens-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { text: 'STAMPX {n}/{p}', position: 'top-right', fontSize: 18 }, async (ctx, p, n) => {
    await stampAt(ctx, 'STAMPX', n, (h) => h.upright && h.fx > 0.5 && h.fx < 1 && h.fy > 0 && h.fy < 0.2, 'top-right and upright on every page')
    ctx.check('page tokens filled', p.pdfjs.texts[1].includes(`STAMPX 2/${n}`))
  }, { quick: true })
  stampCase('u5a-stamp-arabic-aws', 'invoices/aws-invoice.pdf', { text: '\u0645\u0648\u0627\u0641\u0642', position: 'bottom-right' }, async (ctx, p) => {
    ctx.check('Arabic stamp text present', /[\u0600-\u06ff\ufe70-\ufeff]/.test(allText(p)), allText(p).slice(-60))
  })
  stampCase('u5a-stamp-pages-2-3-attention', 'reports/arxiv-1706.03762-attention.pdf', { text: 'STAMPX', position: 'top-left', pages: [2, 3] }, async (ctx) => {
    const hits = await findTextPositions(ctx.out('stamped.pdf'), 'STAMPX')
    const pages = [...new Set(hits.map((h) => h.page))].sort((a, b) => a - b)
    ctx.check('only the selected pages stamped', pages.join(',') === '2,3', pages.join(','))
  })
  stampCase('u5a-stamp-bottomleft-rot90-cropbox', 'derived/rot90-cropbox-bert.pdf', { text: 'STAMPX', position: 'bottom-left', margin: 'small', opacity: 0.5 }, async (ctx, p, n) => {
    await stampAt(ctx, 'STAMPX', n, (h) => h.upright && h.fx < 0.2 && h.fy > 0.8 && h.fy < 1, 'bottom-left inside the CropBox on /Rotate 90 pages')
  }, { quick: true })
  stampCase('u5a-stamp-cjk-rot270', 'derived/c-rot270-cropbox.pdf', { text: '\u627f\u8a8d\u6e08\u307f {n}', position: 'top-center' }, async (ctx, p) => {
    ctx.check('Japanese stamp text extracts', allText(p).includes('\u627f\u8a8d'), allText(p).slice(0, 80))
    const hits = await findTextPositions(ctx.out('stamped.pdf'), '\u627f')
    ctx.check('top-centre and upright on /Rotate 270', hits.length > 0 && hits.every((h) => h.upright && h.fy < 0.2 && h.fx > 0.25 && h.fx < 0.75), JSON.stringify(hits.map((h) => [h.fx.toFixed(2), h.fy.toFixed(2)])))
  })
  stampCase('u5a-stamp-turned45-origin-shift', 'derived/origin-shift-aws-invoice.pdf', { text: 'STAMPX', position: 'middle-center', rotate: 45, fontSize: 30 }, async (ctx, p, n) => {
    await stampAt(ctx, 'STAMPX', n, (h) => h.fx > 0.2 && h.fx < 0.6 && h.fy > 0.4 && h.fy < 0.8 && !h.upright, 'turned stamp centred on a page with moved origin')
  })
  stampCase('u5a-stamp-image-centre-rot270', 'derived/c-rot270-cropbox.pdf', { kind: 'image', position: 'middle-center', widthPct: 30 }, async (ctx, p, n) => {
    const bad = []
    for (let pg = 1; pg <= n; pg++) {
      const imgs = await imagePlacements(ctx.out('stamped.pdf'), pg)
      // the stamp is the last image drawn
      const s = imgs[imgs.length - 1]
      if (!s || !near(s.cx, 0.5, 0.02) || !near(s.cy, 0.5, 0.02) || !near(s.x1 - s.x0, 0.3, 0.02)) bad.push(`p${pg} ${s ? [s.cx, s.cy, s.x1 - s.x0].map((v) => v.toFixed(2)) : 'none'}`)
    }
    ctx.check('image centred, 30% wide on /Rotate 270 + CropBox', bad.length === 0, bad.join('; '))
  }, { image: true })
  stampCase('u5a-stamp-mixed-rotations', 'derived/c-mixed.pdf', { text: 'STAMPX', position: 'bottom-center' }, async (ctx, p, n) => {
    await stampAt(ctx, 'STAMPX', n, (h) => h.upright && h.fx > 0.25 && h.fx < 0.6 && h.fy > 0.8 && h.fy < 1, 'bottom-centre and upright on mixed sizes and rotations')
  })
  // 200 characters at 40 pt: shrunk to fit between the margins
  const LONG = `LONGSTAMP ${'approved for payment and filing '.repeat(6)}`.slice(0, 200)
  stampCase('u5a-stamp-long-text-aws', 'invoices/aws-invoice.pdf', { text: LONG, position: 'top-left', fontSize: 40 }, async (ctx, p) => {
    ctx.check('text shrunk on the page', ctx.meta.report?.shrunk === 1, JSON.stringify(ctx.meta.report))
    const hits = await findTextPositions(ctx.out('stamped.pdf'), 'LONGSTAMP')
    ctx.check('stamp starts inside the page', hits.length > 0 && hits.every((h) => h.fx > 0 && h.fx < 0.2), JSON.stringify(hits.map((h) => h.fx.toFixed(2))))
    ctx.check('whole text kept', allText(p).replace(/\s+/g, ' ').includes(LONG.trim().replace(/\s+/g, ' ').slice(-30)))
  })

  // ---------- remove blank pages ----------
  function blankCase(id, file, insert, extra = {}) {
    add({
      id,
      tool: 'removeblank',
      op: 'u5a:blank',
      files: [file],
      params: { insert, opts: extra.opts ?? {} },
      timeout: extra.timeout ?? 4 * MIN,
      quick: !!extra.quick,
      async validate(ctx) {
        const { inserted, detected } = ctx.meta
        const missed = inserted.filter((n) => !detected.includes(n))
        ctx.check('every inserted blank page found', missed.length === 0, `missed ${missed.join(', ')}`)
        if (extra.expect) {
          const want = extra.expect.join(',')
          ctx.check('exactly the real blank pages found', detected.join(',') === want, `found ${detected.join(',')} want ${want}`)
        }
        // anything found must be blank in a MuPDF render too
        const src = insert.length ? ctx.out('with-blanks.pdf') : readRel(file)
        const notBlank = detected.filter((n) => !blankInMupdf(src, n))
        ctx.check('every page found is blank in MuPDF too', notBlank.length === 0, notBlank.join(', '))
        if (extra.none) ctx.check('no real page taken for blank', detected.every((n) => inserted.includes(n)), detected.join(','))
        if (detected.length) await checkPdf(ctx, 'no-blanks.pdf', { pages: ctx.meta.pages - detected.length })
        ctx.metric(`found ${detected.length ? detected.join(', ') : 'none'} (inserted ${inserted.join(', ') || 'none'}) in ${(ctx.meta.ms / 1000).toFixed(1)} s`)
      },
    })
  }
  blankCase('u5a-blank-fax-inserted', 'scanned/fax-jean-schmidt-doe.pdf', [1, 3], { quick: true, none: true })
  // real scanned blanks: paper tone, specks, faint show-through
  blankCase('u5a-blank-lincoln-real', 'scanned/lincoln-ellsworth-letter-1861.pdf', [], { quick: true, expect: LINCOLN_BLANKS })
  blankCase('u5a-blank-mixed-inserted', 'derived/c-mixed.pdf', [3, 6])
  blankCase('u5a-blank-tracemonkey-none', 'reports/pdfjs-tracemonkey.pdf', [], { none: true })
  // faint pencil handwriting must never count as blank
  blankCase('u5a-blank-notebook-handwriting-none', 'scanned/handwritten-field-trips-notebook-1950.pdf', [], { none: true, timeout: 6 * MIN })
  // white fax scans: pages 6 and 71 are blank (looked at)
  blankCase('u5a-blank-fips-real', 'scanned/fips-document-facsimile-transmission.pdf', [], { expect: [6, 71], timeout: 6 * MIN })

  // ---------- linearize ----------
  function linCase(id, file, extra = {}) {
    add({
      id,
      tool: 'linearize',
      op: 'u5a:linearize',
      files: [file],
      params: {},
      timeout: extra.timeout ?? 3 * MIN,
      quick: !!extra.quick,
      async validate(ctx) {
        const src = await inputFacts(file)
        const p = await checkPdf(ctx, 'linearized.pdf', { pages: src.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const out = ctx.out('linearized.pdf')
        const input = readRel(file)
        const { problems, facts } = checkLinearized(out)
        ctx.check('linearized structure (dict, xref sections, hint tables)', problems.length === 0, problems.slice(0, 3).join('; '))
        const info = await withPdfjs(out, async (doc) => (await doc.getMetadata()).info)
        ctx.check('pdf.js sees it as linearized', info?.IsLinearized === true, JSON.stringify(info?.IsLinearized))
        const same = src.pdfjs.pageInfo.every((s, i) => {
          const o = p.pdfjs.pageInfo[i]
          return o && s.rotate === o.rotate && s.view.every((v, k) => near(v, o.view[k], 0.01))
        })
        ctx.check('page boxes and rotation unchanged', same)
        const diff = (src.pdfjs.texts ?? []).findIndex((t, i) => t !== p.pdfjs.texts[i])
        ctx.check('text of every page unchanged', diff === -1, `page ${diff + 1}`)
        const ratio = out.length / input.length
        ctx.check('not much bigger (at most 1.2x or 64 KB more)', ratio <= 1.2 || out.length - input.length <= 65536, `${ratio.toFixed(2)}x`)
        let ranged = ''
        if (extra.ranged) {
          const a = await withPdfjs(input, () => page1Bytes(input))
          const b = await withPdfjs(out, () => page1Bytes(out))
          ctx.check('page 1 needs no more bytes than before (ranged loading)', b <= a * 1.1 + 16384, `${Math.round(a / 1024)} KB -> ${Math.round(b / 1024)} KB`)
          ranged = `, page 1 loads ${Math.round(a / 1024)} -> ${Math.round(b / 1024)} KB`
        }
        ctx.metric(`${facts.pages} pages, ${facts.packed} packed objects, ${(out.length / 1048576).toFixed(2)} MB from ${(input.length / 1048576).toFixed(2)} MB (${ratio.toFixed(2)}x)${ranged}, ${ctx.meta.ms} ms`)
      },
    })
  }
  linCase('u5a-lin-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', { quick: true, ranged: true })
  linCase('u5a-lin-aws-invoice', 'invoices/aws-invoice.pdf')
  linCase('u5a-lin-attention', 'reports/arxiv-1706.03762-attention.pdf', { ranged: true })
  linCase('u5a-lin-rot90-cropbox', 'derived/rot90-cropbox-bert.pdf')
  linCase('u5a-lin-lincoln-relinearize', 'scanned/lincoln-ellsworth-letter-1861.pdf')
  linCase('u5a-lin-llama2', 'reports/arxiv-2307.09288-llama2.pdf', { timeout: 5 * MIN, ranged: true })
  // tagged files with object streams (grew 4.5x and 3.3x before packing)
  linCase('u5a-lin-us-budget-objstm', 'reports/us-budget-2024.pdf', { timeout: 5 * MIN, ranged: true, quick: true })
  linCase('u5a-lin-fdic-objstm', 'reports/fdic-quarterly-banking-profile-2023q4.pdf', { timeout: 5 * MIN, ranged: true })

  // ---------- colours ----------
  // tol: { mean, p99 } allowed per-channel error (0-255) against the colour
  // map, in pdf.js (in the page) and MuPDF (here). Each blend step is worked
  // out in 8 bits, so a few steps add a few units.
  function colourCase(id, tool, file, kind, opts, tol, extra = {}) {
    add({
      id,
      tool,
      op: 'u5a:colour',
      files: [file],
      params: { kind, opts, pages: extra.pages ?? [1], blankFirst: !!extra.blankFirst },
      timeout: extra.timeout ?? 3 * MIN,
      quick: !!extra.quick,
      async validate(ctx) {
        const input = inputOf(ctx, file)
        const pageCount = ctx.meta.sizes.length
        const p = await checkPdf(ctx, 'colour.pdf', { pages: pageCount })
        if (!p?.pdfjs.ok) return
        const want = extra.method ?? 'layers'
        ctx.check(`method ${want}`, ctx.meta.method === want, ctx.meta.method)
        const map = kind === 'adjust' ? adjustMap(opts) : replaceMap(opts)
        const errs = []
        for (const e of ctx.meta.errors) errs.push({ engine: 'pdf.js', ...e })
        for (const n of extra.pages ?? [1]) errs.push({ engine: 'MuPDF', page: n, ...mupdfColourError(input, ctx.out('colour.pdf'), n, map) })
        // the setting must really change these pages, well beyond the error
        const change = (extra.pages ?? [1]).map((n) => mupdfColourError(input, input, n, map).mean)
        ctx.check('the setting changes the page', change.every((c, i) => c > Math.max(3, 4 * errs[i].mean)), `change ${change.join(', ')}`)
        const off = errs.filter((e) => e.mean > tol.mean || e.p99 > tol.p99)
        ctx.check('pixels match the colour map (pdf.js and MuPDF)', off.length === 0, off.map((e) => `${e.engine} p${e.page} mean ${e.mean} p99 ${e.p99}${e.size ? ` ${e.size}` : ''}`).join('; '))
        if (want === 'layers') {
          const src = await inputFacts(file)
          const offset = extra.blankFirst ? 1 : 0
          ctx.check('page boxes unchanged', src.pdfjs.pageInfo.every((s, i) => s.rotate === p.pdfjs.pageInfo[i + offset].rotate && s.view.every((v, k) => near(v, p.pdfjs.pageInfo[i + offset].view[k], 0.01))))
          await textKept(ctx, p, file, 0.99)
        } else {
          ctx.check('image pages at the visible size, upright', ctx.meta.sizes.every((s, i) => near(s[0], p.pdfjs.pageInfo[i].w) && near(s[1], p.pdfjs.pageInfo[i].h) && p.pdfjs.pageInfo[i].rotate === 0))
        }
        const worst = errs.reduce((a, e) => (e.mean > a.mean ? e : a), errs[0])
        ctx.metric(`${ctx.meta.method}, change ${change.map((c) => c.toFixed(0)).join('/')}, worst ${worst.engine} p${worst.page} mean ${worst.mean} p99 ${worst.p99}, ${(ctx.out('colour.pdf').length / 1024).toFixed(0)} KB from ${(input.length / 1024).toFixed(0)} KB, ${ctx.meta.ms} ms`)
      },
    })
  }
  const LAYER_TOL = { mean: 1.5, p99: 6 }
  colourCase('u5a-adjust-contrast-fax', 'adjustcolors', 'scanned/fax-jean-schmidt-doe.pdf', 'adjust', { contrast: 150, brightness: 90 }, LAYER_TOL, { quick: true, pages: [1, 2] })
  colourCase('u5a-adjust-desat-lincoln', 'adjustcolors', 'scanned/lincoln-ellsworth-letter-1861.pdf', 'adjust', { contrast: 80, saturation: 40, red: 120, blue: 70 }, LAYER_TOL)
  colourCase('u5a-adjust-bright-mixed', 'adjustcolors', 'derived/c-mixed.pdf', 'adjust', { brightness: 130, green: 60 }, LAYER_TOL, { pages: [1, 3] })
  colourCase('u5a-adjust-dark-tracemonkey', 'adjustcolors', 'reports/pdfjs-tracemonkey.pdf', 'adjust', { brightness: 60, saturation: 0, blue: 150 }, LAYER_TOL)
  // saturation above 100: image pages, JPEG noise on top
  colourCase('u5a-adjust-saturate-images-lincoln', 'adjustcolors', 'scanned/lincoln-ellsworth-letter-1861.pdf', 'adjust', { saturation: 160, contrast: 110 }, { mean: 3, p99: 16 }, { method: 'images', pages: [1, 2], timeout: 4 * MIN })
  colourCase('u5a-replace-invert-fax', 'replacecolors', 'scanned/fax-jean-schmidt-doe.pdf', 'replace', { mode: 'invert' }, LAYER_TOL, { quick: true, pages: [1, 2] })
  colourCase('u5a-replace-invert-tracemonkey', 'replacecolors', 'reports/pdfjs-tracemonkey.pdf', 'replace', { mode: 'invert' }, LAYER_TOL)
  colourCase('u5a-replace-yellow-on-black-lincoln', 'replacecolors', 'scanned/lincoln-ellsworth-letter-1861.pdf', 'replace', { mode: 'high-contrast', preset: 'yellow-on-black' }, LAYER_TOL, { pages: [1, 3] })
  colourCase('u5a-replace-white-on-black-mixed', 'replacecolors', 'derived/c-mixed.pdf', 'replace', { mode: 'high-contrast', preset: 'white-on-black' }, LAYER_TOL, { pages: [1, 3, 5] })
  colourCase('u5a-replace-custom-aws', 'replacecolors', 'invoices/aws-invoice.pdf', 'replace', { mode: 'custom', text: '#1d3557', background: '#f1faee' }, LAYER_TOL)
  colourCase('u5a-replace-grayscale-lincoln', 'replacecolors', 'scanned/lincoln-ellsworth-letter-1861.pdf', 'replace', { mode: 'grayscale' }, LAYER_TOL, { pages: [1, 2] })
  colourCase('u5a-replace-green-on-black-rot270', 'replacecolors', 'derived/c-rot270-cropbox.pdf', 'replace', { mode: 'high-contrast', preset: 'green-on-black' }, LAYER_TOL)
  // an empty page (no /Contents) must turn black too
  colourCase('u5a-replace-invert-empty-page', 'replacecolors', 'invoices/aws-invoice.pdf', 'replace', { mode: 'invert' }, LAYER_TOL, { blankFirst: true, pages: [1, 2] })
}

export default registerU5A
