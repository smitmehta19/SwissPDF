// pdf.js reads for the Viewer and Reader: page size, text boxes for search
// highlights, and the outline (bookmarks). Every call goes through the
// shared serialized queue on the cached document (never destroy it here).
import { openPdfDocument, pdfjsLib, serializedPdfOp } from '../lib/pdfText.js'

const textCache = new WeakMap() // bytes -> Map<page, { items, width, height }>
const sizeCache = new WeakMap() // bytes -> Map<page, { width, height }>

function cacheFor(map, bytes) {
  let m = map.get(bytes)
  if (!m) {
    m = new Map()
    map.set(bytes, m)
  }
  return m
}

// Page size in points as shown (rotation applied).
export function pageSize(bytes, pageNum) {
  const cache = cacheFor(sizeCache, bytes)
  if (cache.has(pageNum)) return Promise.resolve(cache.get(pageNum))
  return serializedPdfOp(async () => {
    const doc = await openPdfDocument(bytes)
    const page = await doc.getPage(pageNum)
    const { width, height } = page.getViewport({ scale: 1 })
    const size = { width, height }
    cache.set(pageNum, size)
    return size
  })
}

// Text items of one page with their boxes in page space (0..1 of the page as
// shown), for search and highlights.
export function pageText(bytes, pageNum) {
  const cache = cacheFor(textCache, bytes)
  if (cache.has(pageNum)) return Promise.resolve(cache.get(pageNum))
  return serializedPdfOp(async () => {
    const doc = await openPdfDocument(bytes)
    const page = await doc.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items = []
    for (const it of content.items) {
      if (!it.str) continue
      const tx = pdfjsLib.Util.transform(viewport.transform, it.transform)
      const angle = Math.atan2(tx[1], tx[0])
      const h = Math.hypot(tx[2], tx[3])
      items.push({
        str: it.str,
        x: (tx[4] + h * Math.sin(angle)) / viewport.width,
        y: (tx[5] - h * Math.cos(angle)) / viewport.height,
        w: it.width / viewport.width,
        h: h / viewport.height,
        angle,
      })
    }
    page.cleanup()
    const entry = { items, text: items.map((i) => i.str).join(' '), width: viewport.width, height: viewport.height }
    cache.set(pageNum, entry)
    return entry
  })
}

// Matches of `q` in the page text (items joined with a space, any run of
// spaces in the query matches any run of white space), as [start, end].
function matchRanges(entry, q) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  // case-insensitive on the text itself: lower-casing can change its length
  // (Turkish dotted I), which would move every later box
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'giu')
  const hay = entry.text
  const out = []
  for (let m = re.exec(hay); m; m = re.exec(hay)) {
    out.push([m.index, m.index + m[0].length])
    if (m[0].length === 0) re.lastIndex++
  }
  return out
}

// Boxes of every match of `q` on one page: part of a text item when the match
// is inside it, one box per item when it runs across items (line breaks,
// font changes).
export function matchBoxes(entry, q) {
  const ranges = matchRanges(entry, q)
  if (!ranges.length) return []
  // where each item starts in entry.text
  const starts = []
  let pos = 0
  for (const it of entry.items) {
    starts.push(pos)
    pos += it.str.length + 1
  }
  const boxes = []
  for (const [a, b] of ranges) {
    entry.items.forEach((it, i) => {
      const s0 = starts[i]
      const len = it.str.length
      const lo = Math.max(a, s0)
      const hi = Math.min(b, s0 + len)
      if (hi <= lo || !len) return
      const f0 = (lo - s0) / len
      const f1 = (hi - s0) / len
      // along the text direction; vertical text runs down the page
      const cos = Math.cos(it.angle)
      const sin = Math.sin(it.angle)
      boxes.push({ x: it.x + it.w * f0 * cos, y: it.y + (it.w * f0 * sin * entry.width) / entry.height, w: it.w * (f1 - f0), h: it.h, angle: it.angle })
    })
  }
  return boxes
}

// Counts and a short snippet per page with a match. Runs page by page so
// renders can cut in; stops when the signal aborts.
export async function searchDocument(bytes, pageCount, q, { signal, onPage } = {}) {
  const needle = q.trim().toLowerCase()
  const hits = []
  if (!needle) return hits
  for (let p = 1; p <= pageCount; p++) {
    if (signal?.aborted) return hits
    const entry = await pageText(bytes, p)
    if (signal?.aborted) return hits
    const ranges = matchRanges(entry, needle)
    if (ranges.length) {
      const [at, to] = ranges[0]
      const from = Math.max(0, at - 30)
      const snippet = `${from > 0 ? '...' : ''}${entry.text.slice(from, to + 40).replace(/\s+/g, ' ').trim()}`
      hits.push({ page: p, count: ranges.length, snippet })
    }
    onPage?.(p, hits)
  }
  return hits
}

// Outline as [{ title, page, items }]; page is null when the target cannot
// be resolved.
export function outline(bytes) {
  return serializedPdfOp(async () => {
    const doc = await openPdfDocument(bytes)
    const raw = await doc.getOutline()
    if (!raw?.length) return []
    const pageOf = async (dest) => {
      try {
        const d = typeof dest === 'string' ? await doc.getDestination(dest) : dest
        if (!Array.isArray(d) || !d[0]) return null
        return typeof d[0] === 'number' ? d[0] + 1 : (await doc.getPageIndex(d[0])) + 1
      } catch {
        return null
      }
    }
    let budget = 2000 // a broken outline can be huge or loop
    const walk = async (list) => {
      const out = []
      for (const it of list ?? []) {
        if (--budget < 0) break
        out.push({ title: (it.title || 'Untitled').trim(), page: await pageOf(it.dest), items: await walk(it.items) })
      }
      return out
    }
    return walk(raw)
  })
}
