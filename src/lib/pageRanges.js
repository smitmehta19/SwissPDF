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
    if (from < 1) throw new Error(`Pages start at 1 — "${p}" is out of range.`)
    if (from > to) throw new Error(`"${p}" is reversed — the start page is after the end page.`)
    if (to > pageCount) {
      throw new Error(`"${p}" goes past the end — this PDF only has ${pageCount} page${pageCount === 1 ? '' : 's'}.`)
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
