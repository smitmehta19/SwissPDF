// Parses page-range specs like "1-3, 5, 8-" against a document's page count.
// Returns { ranges, pages }: `ranges` preserves the comma grouping (used by
// Split, where each group becomes its own file); `pages` is the flat, sorted,
// de-duplicated 1-based page list (used by Extract / Remove / Rotate).
export function parseRangeSpec(spec, pageCount) {
  const trimmed = String(spec ?? '').trim()
  if (!trimmed) {
    throw new Error('Enter at least one page or range, e.g. "1-3, 5".')
  }
  const ranges = []
  for (const part of trimmed.split(',')) {
    const p = part.trim()
    if (!p) continue
    let from
    let to
    if (/^\d+$/.test(p)) {
      from = to = Number(p)
    } else {
      const m = p.match(/^(\d+)?\s*-\s*(\d+)?$/)
      if (!m || (!m[1] && !m[2])) {
        throw new Error(`"${p}" is not a valid page or range. Use forms like "3", "1-5", or "4-".`)
      }
      from = m[1] ? Number(m[1]) : 1
      to = m[2] ? Number(m[2]) : pageCount
    }
    if (from < 1) throw new Error(`Pages start at 1, "${p}" is out of range.`)
    if (from > to) throw new Error(`"${p}" is reversed: the start page is after the end page.`)
    if (to > pageCount) {
      throw new Error(`"${p}" goes past the end: this PDF only has ${pageCount} page${pageCount === 1 ? '' : 's'}.`)
    }
    ranges.push({ from, to })
  }
  if (ranges.length === 0) {
    throw new Error('Enter at least one page or range, e.g. "1-3, 5".')
  }
  const pages = [...new Set(ranges.flatMap((r) => {
    const out = []
    for (let n = r.from; n <= r.to; n++) out.push(n)
    return out
  }))].sort((a, b) => a - b)
  return { ranges, pages }
}

// Inverse of parseRangeSpec: [1,2,3,5] -> "1-3, 5". Used to keep the range
// text box in sync when pages are picked by clicking thumbnails.
export function formatPages(pages) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const parts = []
  let start = null
  let prev = null
  for (const n of sorted) {
    if (start === null) {
      start = prev = n
    } else if (n === prev + 1) {
      prev = n
    } else {
      parts.push(start === prev ? `${start}` : `${start}-${prev}`)
      start = prev = n
    }
  }
  if (start !== null) parts.push(start === prev ? `${start}` : `${start}-${prev}`)
  return parts.join(', ')
}

// Ranges for "split every N pages": 10 pages every 4 -> 1-4, 5-8, 9-10.
export function everyNRanges(n, pageCount) {
  const size = Math.floor(Number(n))
  if (!Number.isFinite(size) || size < 1) {
    throw new Error('Pages per file must be a whole number of 1 or more.')
  }
  const ranges = []
  for (let from = 1; from <= pageCount; from += size) {
    ranges.push({ from, to: Math.min(from + size - 1, pageCount) })
  }
  return ranges
}

// Label of a page range for file names: 1-5, or 7 for a single page.
export const rangeLabel = ({ from, to }) => (from === to ? `${from}` : `${from}-${to}`)

// Page order presets for Organize. Each returns 0-based positions into the
// current page list; null is a blank page (booklets pad to a multiple of 4).
//   reverse  last page first
//   oddEven  odd pages, then even pages (1,3,5,2,4,6)
//   duplex   a single-sided scan of a double-sided stack: all fronts, then
//            all backs from the last back to the first. Interleaves them:
//            1, n, 2, n-1, ...
//   booklet  2-up saddle-stitch order: sheet by sheet, n,1 | 2,n-1 | ...
export function sortPreset(kind, n) {
  const all = Array.from({ length: n }, (_, i) => i)
  if (kind === 'reverse') return all.reverse()
  if (kind === 'oddEven') return [...all.filter((i) => i % 2 === 0), ...all.filter((i) => i % 2 === 1)]
  if (kind === 'duplex') {
    const fronts = Math.ceil(n / 2)
    const out = []
    for (let i = 0; i < fronts; i++) {
      out.push(i)
      const back = n - 1 - i
      if (back >= fronts) out.push(back)
    }
    return out
  }
  if (kind === 'booklet') {
    const total = Math.ceil(n / 4) * 4
    const at = (i) => (i < n ? i : null)
    const out = []
    for (let lo = 0, hi = total - 1; lo < hi; lo += 2, hi -= 2) out.push(at(hi), at(lo), at(lo + 1), at(hi - 1))
    return out
  }
  throw new Error(`Unknown page order "${kind}".`)
}
