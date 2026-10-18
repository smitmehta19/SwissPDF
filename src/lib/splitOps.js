// Split helpers on top of pdfOps: bookmarks (outline) as page ranges, split
// by file size, visible page orientation for Rotate. Pure bytes in, data out,
// so they run in the ops worker.
import { PDFArray, PDFDict, PDFHexString, PDFName, PDFRef, PDFString } from 'pdf-lib'
import { loadPdf, splitByRanges } from './pdfOps.js'

const MAX_ITEMS = 20000
const N = (s) => PDFName.of(s)
const text = (o) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : o instanceof PDFName ? o.decodeText() : null)

function lookup(ctx, o) {
  return o instanceof PDFRef ? ctx.lookup(o) : o
}

// Named destinations: catalog /Dests dict (PDF 1.1) and the /Names /Dests tree.
function namedDests(ctx, catalog) {
  const out = new Map()
  const old = lookup(ctx, catalog.get(N('Dests')))
  if (old instanceof PDFDict) for (const [k, v] of old.entries()) out.set(k.decodeText(), v)
  const names = lookup(ctx, catalog.get(N('Names')))
  const root = names instanceof PDFDict ? lookup(ctx, names.get(N('Dests'))) : null
  const seen = new Set()
  const walk = (node, depth) => {
    if (!(node instanceof PDFDict) || seen.has(node) || depth > 32) return
    seen.add(node)
    const arr = lookup(ctx, node.get(N('Names')))
    if (arr instanceof PDFArray) {
      for (let i = 0; i + 1 < arr.size(); i += 2) {
        const key = text(lookup(ctx, arr.get(i)))
        if (key !== null) out.set(key, arr.get(i + 1))
      }
    }
    const kids = lookup(ctx, node.get(N('Kids')))
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) walk(lookup(ctx, kids.get(i)), depth + 1)
  }
  walk(root, 0)
  return out
}

// Bookmarks in reading order: [{ title, level (1 = top), page (1-based or null) }]
export async function readOutline(bytes) {
  const doc = await loadPdf(bytes)
  const ctx = doc.context
  const catalog = doc.catalog
  const pageOf = new Map(doc.getPages().map((p, i) => [p.ref, i + 1]))
  let named = null
  const destPage = (dest, depth = 0) => {
    const d = lookup(ctx, dest)
    if (depth > 4 || d == null) return null
    if (d instanceof PDFArray) {
      const first = d.get(0)
      if (first instanceof PDFRef) return pageOf.get(first) ?? null
      const n = first?.asNumber?.()
      return Number.isInteger(n) && n >= 0 && n < doc.getPageCount() ? n + 1 : null
    }
    if (d instanceof PDFDict) return destPage(d.get(N('D')), depth + 1)
    const key = text(d)
    if (key === null) return null
    named ??= namedDests(ctx, catalog)
    return named.has(key) ? destPage(named.get(key), depth + 1) : null
  }
  const items = []
  const outlines = lookup(ctx, catalog.get(N('Outlines')))
  const seen = new Set()
  const walk = (first, level) => {
    let node = lookup(ctx, first)
    while (node instanceof PDFDict && !seen.has(node) && items.length < MAX_ITEMS && level <= 32) {
      seen.add(node)
      let page = node.has(N('Dest')) ? destPage(node.get(N('Dest'))) : null
      const action = lookup(ctx, node.get(N('A')))
      if (page === null && action instanceof PDFDict && lookup(ctx, action.get(N('S')))?.toString() === '/GoTo') page = destPage(action.get(N('D')))
      items.push({ title: (text(lookup(ctx, node.get(N('Title')))) ?? '').trim(), level, page })
      walk(node.get(N('First')), level + 1)
      node = lookup(ctx, node.get(N('Next')))
    }
  }
  if (outlines instanceof PDFDict) walk(outlines.get(N('First')), 1)
  return { items, pageCount: doc.getPageCount() }
}

// Page ranges that start at each bookmark of `level` or above. Pages before
// the first bookmark become their own part. -> [{ from, to, title }]
export function bookmarkRanges(items, level, pageCount) {
  const starts = new Map()
  for (const it of items) {
    if (it.level <= level && it.page && !starts.has(it.page)) starts.set(it.page, it.title)
  }
  const pages = [...starts.keys()].sort((a, b) => a - b)
  if (pages.length === 0) return []
  if (pages[0] > 1) {
    pages.unshift(1)
    starts.set(1, 'Before the first bookmark')
  }
  return pages.map((from, i) => ({ from, to: (pages[i + 1] ?? pageCount + 1) - 1, title: starts.get(from) }))
}

// Visible orientation per page (CropBox and /Rotate applied).
export async function pageOrientations(bytes) {
  const doc = await loadPdf(bytes)
  return doc.getPages().map((p) => {
    const { width, height } = p.getCropBox()
    const sideways = (((p.getRotation().angle % 360) + 360) % 360) % 180 !== 0
    const w = sideways ? height : width
    const h = sideways ? width : height
    return Math.abs(w - h) < 1 ? 'square' : w > h ? 'landscape' : 'portrait'
  })
}

// Splits into parts of at most maxBytes each, in page order. Part sizes are
// measured, not guessed: each round builds a few candidate lengths in one
// split call (one parse of the source) and keeps the longest that fits; the
// next part starts from the length that fitted last. A single page over the
// limit becomes its own part with oversize: true.
// split(ranges) -> [{ bytes }] defaults to splitByRanges on `bytes` (the tool
// passes a worker call so it can cancel). onPart(part) fires per finished part.
// -> [{ from, to, bytes, oversize }]
export async function splitBySize(bytes, maxBytes, pageCount, { split = (r) => splitByRanges(bytes, r), onPart } = {}) {
  if (!(maxBytes > 0)) throw new Error('Enter a maximum size above 0.')
  const parts = []
  let guess = Math.max(1, Math.floor(maxBytes / Math.max(1, bytes.byteLength / pageCount)))
  let s = 1
  while (s <= pageCount) {
    const rest = pageCount - s + 1
    const sizes = new Map() // candidate length -> its bytes
    const measure = async (lens) => {
      const todo = [...new Set(lens.map((k) => Math.max(1, Math.min(rest, Math.round(k)))))].filter((k) => !sizes.has(k))
      if (!todo.length) return
      const outs = await split(todo.map((k) => ({ from: s, to: s + k - 1 })))
      outs.forEach((o, i) => sizes.set(todo[i], o.bytes))
    }
    const bounds = () => {
      let lo = 0
      let hi = rest + 1
      for (const [k, b] of sizes) {
        if (b.byteLength <= maxBytes) lo = Math.max(lo, k)
        else hi = Math.min(hi, k)
      }
      return { lo, hi }
    }
    await measure([1, guess * 0.5, guess * 0.8, guess, guess * 1.2, guess * 1.6, guess * 2.5])
    let { lo, hi } = bounds()
    while (hi > rest && lo < rest) {
      await measure([lo * 1.5, lo * 2, lo * 4, lo * 8, rest])
      ;({ lo, hi } = bounds())
    }
    // close in until the gap is under 5% of the part (or one page)
    for (let round = 0; round < 3 && lo > 0 && hi - lo > Math.max(1, lo * 0.05); round++) {
      const step = (hi - lo) / 6
      await measure([1, 2, 3, 4, 5].map((i) => lo + step * i))
      ;({ lo, hi } = bounds())
    }
    const len = lo || 1
    const part = { from: s, to: s + len - 1, bytes: sizes.get(len), oversize: lo === 0 }
    parts.push(part)
    onPart?.(part)
    if (lo > 0) guess = len
    s += len
  }
  return parts
}
