// Paragraphs for Edit text: grouping the lines MuPDF finds into paragraphs,
// the word diff that keeps styles, and the re-wrap layout. Pure geometry, no
// MuPDF; editTextOps.js does the reading, removing and drawing.
//
// Coordinates: `flow` runs along the text in reading order (left to right for
// LTR, right to left for RTL, so RTL is laid out like LTR and mirrored back),
// `v` runs down the page across the lines. Both in MuPDF page space points.

const dot = (p, d) => p[0] * d[0] + p[1] * d[1]
const along = (q, d) => {
  const v = [dot([q[0], q[1]], d), dot([q[2], q[3]], d), dot([q[4], q[5]], d), dot([q[6], q[7]], d)]
  return [Math.min(...v), Math.max(...v)]
}
const median = (xs) => {
  if (!xs.length) return null
  const s = xs.slice().sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
// most common value (rounded to `step`)
const mode = (xs, step = 0.2) => {
  const n = new Map()
  for (const x of xs) {
    const k = Math.round(x / step)
    n.set(k, (n.get(k) ?? 0) + 1)
  }
  let best = null
  for (const [k, c] of n) if (!best || c > best[1]) best = [k, c]
  return best ? best[0] * step : 0
}

const RTL_CHAR = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/gu
// more right-to-left letters than other letters
export const isRtlText = (s) => {
  const r = s.match(RTL_CHAR)?.length ?? 0
  return r > (s.match(/\p{L}/gu)?.length ?? 0) - r
}
export const NO_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u
const HYPHEN = /[-\u2010\u00ad]$/

// A spacing accent drawn before its letter (TeX: "na¨ıve") reads as the
// accented letter ("naïve"); a dotless i or j under it becomes i or j.
const SPACING = { '\u00a8': '\u0308', '\u00b4': '\u0301', '`': '\u0300', '\u02c6': '\u0302', '\u02dc': '\u0303', '\u00b8': '\u0327', '\u02da': '\u030a', '\u02c7': '\u030c', '\u02d8': '\u0306', '\u00af': '\u0304' }
export const joinAccents = (s) => s.replace(/([\u00a8\u00b4`\u02c6\u02dc\u00b8\u02da\u02c7\u02d8\u00af])([\p{L}])/gu, (m, a, l) => ((l === '\u0131' ? 'i' : l === '\u0237' ? 'j' : l) + SPACING[a]).normalize('NFC'))

// Frame of a paragraph: unit vectors along the text (reading order) and down.
export function frameOf(dir, rtl) {
  const d = rtl ? [-dir[0], -dir[1]] : [dir[0], dir[1]]
  return { dir, rtl, flow: d, down: [-dir[1], dir[0]] }
}
// flow extent of a glyph quad
const flowOf = (q, fr) => along(q, fr.flow)

// Groups stext lines into paragraphs.
// lines: [{ chars: [{ c, origin, quad, size, font, color }], dir, block }]
// runs: same order, [{ why, words: [{ a, b }] }]
// opts: { bad(c), covered(c), pageBox: [x0, y0, x1, y1], margin }
// -> [{ k, lineIdx, rows, words, frame, align, L, R, gap, leading, text,
//       editable, why, size }]
//   rows: [{ v, x0, x1, size, lines: [li] }] top to bottom
//   words (logical order, a hyphenated word across rows is one word):
//     [{ text, parts: [{ li, a, b }], row, rows, x0, x1, v, brk, chars }]
//     brk: a hard line break follows the word in the source
export function findParagraphs(lines, runs, opts = {}) {
  const groups = []
  const byBlock = new Map()
  lines.forEach((l, li) => {
    if (!l.block) return groups.push([li])
    if (!byBlock.has(l.block)) {
      byBlock.set(l.block, [])
      groups.push(byBlock.get(l.block))
    }
    byBlock.get(l.block).push(li)
  })
  const out = []
  for (const g of groups) {
    for (const p of splitBlock(lines, runs, g, opts)) {
      p.k = out.length
      out.push(p)
    }
  }
  return out
}

// One block: rows (stext lines on one baseline join), split where the text
// size changes, then each part becomes a paragraph.
function splitBlock(lines, runs, lineIdx, opts) {
  const vis = (li) => lines[li].chars.filter((c) => c.c.trim())
  const dir0 = lines[lineIdx[0]].dir
  const all = lineIdx.flatMap((li) => vis(li).map((c) => c.c)).join('')
  const fr = frameOf(dir0, isRtlText(all))
  const info = lineIdx
    .map((li) => {
      const v = vis(li)
      if (!v.length) return null
      const bands = v.map((c) => along(c.quad, fr.down))
      const xs = v.map((c) => flowOf(c.quad, fr))
      return {
        li,
        v: mode(v.map((c) => dot(c.origin, fr.down))),
        a: Math.min(...bands.map((b) => b[0])),
        z: Math.max(...bands.map((b) => b[1])),
        x0: Math.min(...xs.map((x) => x[0])),
        x1: Math.max(...xs.map((x) => x[1])),
        size: mode(v.map((c) => c.size), 0.1),
        n: v.length,
      }
    })
    .filter(Boolean)
    .sort((p, q) => p.v - q.v)
  const rows = []
  for (const l of info) {
    const r = rows.find((x) => {
      const ov = Math.min(x.z, l.z) - Math.max(x.a, l.a)
      return ov > 0.5 * Math.min(x.z - x.a, l.z - l.a) && Math.abs(x.v - l.v) < 0.6 * Math.max(x.size, l.size)
    })
    if (r) {
      r.parts.push(l)
      r.a = Math.min(r.a, l.a)
      r.z = Math.max(r.z, l.z)
      if (l.n > r.main.n) {
        r.main = l
        r.v = l.v
        r.size = l.size
      }
    } else rows.push({ parts: [l], main: l, a: l.a, z: l.z, v: l.v, size: l.size })
  }
  for (const r of rows) {
    r.parts.sort((p, q) => p.x0 - q.x0)
    r.x0 = Math.min(...r.parts.map((p) => p.x0))
    r.x1 = Math.max(...r.parts.map((p) => p.x1))
    r.lines = r.parts.map((p) => p.li)
  }
  rows.sort((p, q) => p.v - q.v)
  // a new paragraph where the text size changes, or where an all-bold line
  // meets an all-regular one (a heading over body text)
  const weight = (r) => {
    const v = r.lines.flatMap((li) => vis(li))
    const b = v.filter((c) => opts.bold?.(c)).length
    return b === v.length ? 'bold' : b === 0 ? 'regular' : 'mixed'
  }
  const parts = []
  for (const r of rows) {
    r.weight = weight(r)
    const cur = parts[parts.length - 1]
    const prev = cur?.[cur.length - 1]
    const w = prev && prev.weight !== 'mixed' && r.weight !== 'mixed' && prev.weight !== r.weight
    if (prev && !w && Math.abs(prev.size - r.size) <= Math.max(0.5, 0.06 * r.size)) cur.push(r)
    else parts.push([r])
  }
  return parts.map((rs) => paragraph(lines, runs, rs, fr, opts))
}

function paragraph(lines, runs, rows, fr, opts) {
  const lineIdx = rows.flatMap((r) => r.lines)
  // words per row in reading order
  const raw = []
  rows.forEach((r, ri) => {
    for (const li of r.lines) {
      const chars = lines[li].chars
      for (const w of runs[li].words) {
        const cs = chars.slice(w.a, w.b + 1)
        const v = cs.filter((c) => c.c.trim())
        if (!v.length) continue
        const xs = v.map((c) => flowOf(c.quad, fr))
        // glue: no space before it (words of Chinese or Thai text)
        const glue = w.a > 0 && !!chars[w.a - 1].c.trim()
        raw.push({ text: joinAccents(cs.map((c) => c.c).join('')), parts: [{ li, a: w.a, b: w.b }], row: ri, rows: [ri], x0: Math.min(...xs.map((x) => x[0])), x1: Math.max(...xs.map((x) => x[1])), v: mode(v.map((c) => dot(c.origin, fr.down))), chars: v, brk: false, glue })
      }
    }
  })
  // the column: a line we drew again (an earlier edit) may run past it
  const base = rows.filter((r) => !r.lines.some((li) => lines[li].own))
  const L = Math.min(...(base.length ? base : rows).map((r) => r.x0))
  const R = Math.max(...(base.length ? base : rows).map((r) => r.x1))
  const rowWords = rows.map((_, ri) => raw.filter((w) => w.row === ri))
  // ink width of each line in the source (its words, gaps left out)
  rows.forEach((r, ri) => (r.srcW = rowWords[ri].reduce((s, w) => s + w.x1 - w.x0, 0)))
  const gaps = (ws) => ws.slice(1).map((w, i) => w.x0 - ws[i].x1).filter((g) => g > 0)
  const size = mode(rows.map((r) => r.size), 0.1)
  const leading = rows.length > 1 ? median(rows.slice(1).map((r, i) => r.v - rows[i].v)) : 1.2 * size

  // alignment
  const n = rows.length
  const ends = rows.map((r) => r.x1)
  const starts = rows.map((r) => r.x0)
  let align = 'start'
  let justifyLast = false
  const near = (a, b, tol) => Math.abs(a - b) < tol
  const mids = rows.map((r) => (r.x0 + r.x1) / 2)
  if (n >= 2) {
    // glyph boxes end a little apart on a justified edge (side bearings)
    const tol = Math.max(1, 0.25 * size)
    // a line we drew again counts as reaching the edge it had
    const atEdge = rows.slice(0, -1).filter((r) => near(r.x1, R, tol) || r.lines.some((li) => lines[li].own)).length
    const lastGaps = median(gaps(rowWords[n - 1]))
    const firstGaps = median(gaps(rowWords[0]))
    // a first-line indent alone does not make text right-aligned
    const ragged = starts.slice(1).some((s) => s > L + 3)
    if (mids.every((m) => near(m, (L + R) / 2, 1.5)) && starts.some((s) => s > L + 3)) align = 'centre'
    else if (ends.every((e) => near(e, R, 1)) && ragged) align = 'end'
    else if (atEdge === n - 1 && (n >= 3 || (lastGaps != null && firstGaps != null && firstGaps > 1.15 * lastGaps))) {
      align = 'justify'
      // the last line is full too: the paragraph goes on in the next column
      justifyLast = near(ends[n - 1], R, tol)
    }
  } else if (opts.pageBox) {
    // one line: centred on the page, else as it reads
    const pb = opts.pageBox
    const span = [[pb[0], pb[1]], [pb[2], pb[1]], [pb[0], pb[3]], [pb[2], pb[3]]].map((p) => dot(p, fr.flow))
    const p0 = Math.min(...span)
    const p1 = Math.max(...span)
    if (near(mids[0], (p0 + p1) / 2, 2) && rows[0].x0 > p0 + 36) align = 'centre'
  }
  // natural word gap: justified rows are stretched, so take the last row's
  const allGaps = rowWords.flatMap(gaps)
  let gap = align === 'justify' ? median(gaps(rowWords[n - 1])) ?? Math.min(...allGaps) : median(allGaps)
  if (!(gap > 0) || !Number.isFinite(gap)) gap = 0.25 * size
  gap = Math.min(gap, 0.6 * size)

  // hard breaks: the next row's first word would have fitted on this row
  const fontOf = (r) => {
    const n = new Map()
    for (const li of r.lines) for (const c of lines[li].chars) if (c.c.trim()) n.set(c.font, (n.get(c.font) ?? 0) + 1)
    return [...n].sort((p, q) => q[1] - p[1])[0]?.[0]
  }
  const room = (r) => (align === 'end' ? r.x0 - L : align === 'centre' ? R - L - (r.x1 - r.x0) : R - r.x1)
  const words = []
  rowWords.forEach((ws, ri) => {
    ws.forEach((w, k) => {
      const prev = words[words.length - 1]
      if (k === 0 && prev && ri > 0 && !prev.brk && HYPHEN.test(prev.text) && /^\p{L}/u.test(w.text)) {
        // one word over two lines. The break decides the text: 'real' keeps
        // the hyphen ("English-to-German"), 'soft' drops it ("compile");
        // 'keep' (not known) shows it, and the layout keeps the break so the
        // hyphen is never moved mid-line. U+00AD is always soft.
        const mode = /\u00ad$/.test(prev.text) ? 'soft' : opts.hyphen ? opts.hyphen(prev.text.replace(HYPHEN, ''), w.text) : 'keep'
        prev.hyph = mode
        prev.text = mode === 'soft' ? prev.text.replace(HYPHEN, '') + w.text : prev.text + w.text
        prev.parts.push(...w.parts)
        prev.chars.push(...w.chars)
        prev.rows.push(ri)
        prev.joined = true
        return
      }
      // lines of text written without spaces join without one
      if (k === 0 && prev && NO_SPACES.test(prev.text.slice(-1) + w.text[0])) w.glue = true
      words.push(w)
    })
    const next = rowWords[ri + 1]?.[0]
    const last = words[words.length - 1]
    if (!next || !last || (HYPHEN.test(last.text) && /^\p{L}/u.test(next.text))) return
    // a line in another font (an address label, a heading) starts anew; a
    // line we drew again (in a fallback font perhaps) takes the fit test only
    const ownRow = (r) => r.lines.some((li) => lines[li].own)
    const fontBreak = !ownRow(rows[ri]) && !ownRow(rows[ri + 1]) && fontOf(rows[ri]) !== fontOf(rows[ri + 1])
    if (room(rows[ri]) > next.x1 - next.x0 + gap + 0.5 || fontBreak) last.brk = true
  })
  const text = words.map((w, i) => w.text + (i === words.length - 1 ? '' : w.brk ? '\n' : words[i + 1].glue ? '' : ' ')).join('')

  // editable: every glyph must be safe to remove and redraw
  let why = null
  for (const li of lineIdx) {
    if (runs[li].why) {
      why = runs[li].why
      break
    }
  }
  const chars = lineIdx.flatMap((li) => lines[li].chars.filter((c) => c.c.trim()))
  if (!why && lineIdx.some((li) => Math.abs(lines[li].dir[0] - fr.dir[0]) > 0.01 || Math.abs(lines[li].dir[1] - fr.dir[1]) > 0.01)) why = 'layout'
  if (!why && opts.bad && chars.some(opts.bad)) why = 'no-unicode'
  if (!why && opts.covered && chars.some(opts.covered)) why = 'covered'
  // a glyph that cannot be drawn again (no code in its font, no fallback)
  if (!why && opts.stuck && chars.some(opts.stuck)) why = 'encoding'
  // side by side pieces far apart (a table row, two columns): not one text
  if (!why) {
    for (const r of rows) {
      for (let k = 1; k < r.parts.length; k++) {
        const g = r.parts[k].x0 - Math.max(...r.parts.slice(0, k).map((p) => p.x1))
        if (g > 2.5 * r.size || g < -0.5) why = 'layout'
      }
    }
  }
  return { lineIdx, rows, words, frame: fr, align, justifyLast, L, R, gap, leading, text, editable: !why, why, size }
}

// ---------- word diff ----------
// LCS over words. -> per new word: { from: old index (unchanged) | null,
// style: old index whose style it takes }. A changed word takes the style of
// the old word it replaces (same place in a changed stretch), else the word
// before, else the word after.
export function diffWords(olds, news) {
  const n = olds.length
  const m = news.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = olds[i] === news[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const map = new Array(m).fill(null)
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (olds[i] === news[j]) {
      map[j] = i
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  const out = map.map((from) => ({ from, style: from }))
  // changed stretches: pair with the old words they replace
  let j0 = 0
  while (j0 < m) {
    if (map[j0] != null) {
      j0++
      continue
    }
    let j1 = j0
    while (j1 < m && map[j1] == null) j1++
    const before = j0 > 0 ? map[j0 - 1] : -1
    const after = j1 < m ? map[j1] : n
    for (let k = j0; k < j1; k++) {
      const o = before + 1 + (k - j0)
      out[k].style = o < after ? o : before >= 0 ? before : after < n ? after : null
    }
    j0 = j1
  }
  return out
}

// ---------- layout ----------
// New text -> words [{ text, brk, glue }]. '\n' is a hard break; text written
// without spaces (Chinese, Thai) is cut into dictionary words that glue.
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'word' }) : null
export function splitWords(text) {
  const out = []
  const segs = String(text).split('\n')
  segs.forEach((seg, si) => {
    for (const tok of seg.split(/[\s\u00a0]+/).filter(Boolean)) {
      if (segmenter && NO_SPACES.test(tok)) {
        let first = true
        for (const s of segmenter.segment(tok)) {
          if (!s.segment.trim()) continue
          out.push({ text: s.segment, brk: false, glue: !first })
          first = false
        }
      } else out.push({ text: tok, brk: false, glue: false })
    }
    if (si < segs.length - 1 && out.length) out[out.length - 1].brk = true
  })
  if (out.length) out[out.length - 1].brk = false
  return out
}

// Where each line of the paragraph starts and how long it may be, from the
// source: first line of each part (a hard break starts a part) keeps its
// indent, other lines start where the source's other lines start.
function lineStarts(g) {
  const segFirst = []
  let start = true
  for (const w of g.words) {
    if (start) segFirst.push(g.rows[w.row].x0)
    start = w.brk
  }
  const firstRows = new Set()
  start = true
  for (const w of g.words) {
    if (start) firstRows.add(w.row)
    start = w.brk
  }
  const cont = g.rows.filter((_, i) => !firstRows.has(i)).map((r) => r.x0)
  return { segFirst: segFirst.length ? segFirst : [g.L], cont: cont.length ? median(cont) : g.L }
}

// Lays words out in lines.
// items: [{ w (width at scale 1), brk, glue, rtl (reads right to left) }]
// s: horizontal scale (widths and gaps shrink, the column does not).
// -> [{ k, v (baseline), x0, width, items: [{ i, x }] }] in flow coordinates
export function layoutParagraph(g, items, s = 1) {
  const { segFirst, cont } = lineStarts(g)
  const centred = g.align === 'centre' || g.align === 'end'
  const startOf = (seg, first) => (centred ? g.L : first ? segFirst[Math.min(seg, segFirst.length - 1)] : cont)
  const gap = g.gap * s
  const rows = []
  let seg = 0
  let cur = null
  const open = (first) => {
    cur = { seg, first, x0: startOf(seg, first), items: [], width: 0 }
    rows.push(cur)
  }
  open(true)
  items.forEach((it, i) => {
    const w = it.w * s
    const add = cur.items.length ? (it.glue ? 0 : gap) + w : w
    if (cur.items.length && cur.width + add > g.R - cur.x0 + 0.01) {
      open(false)
      cur.items.push(i)
      cur.width = w
    } else {
      cur.items.push(i)
      cur.width += add
    }
    if (it.brk && i < items.length - 1) {
      cur.hard = true
      seg++
      open(true)
    }
  })
  const n = g.rows.length
  return rows.map((r, k) => {
    const cap = g.R - r.x0
    let x = g.align === 'centre' ? (g.L + g.R) / 2 - r.width / 2 : g.align === 'end' ? g.R - r.width : r.x0
    // justify: spread the gaps, except on the last line of each part
    const last = k === rows.length - 1
    const spread = g.align === 'justify' && !r.hard && (!last || (g.justifyLast && r.width > 0.8 * cap))
    const gaps = r.items.slice(1).filter((i) => !items[i].glue).length
    const extra = spread && gaps ? Math.max(0, (cap - r.width) / gaps) : 0
    const placed = []
    r.items.forEach((i, j) => {
      if (j > 0) x += items[i].glue ? 0 : gap + extra
      placed.push({ i, x, w: items[i].w * s })
      x += items[i].w * s
    })
    reorderRuns(placed, items, g.frame.rtl)
    const v = k < n ? g.rows[k].v : g.rows[n - 1].v + g.leading * (k - n + 1)
    return { k, v, x0: placed.length ? Math.min(...placed.map((p) => p.x)) : r.x0, width: placed.length ? Math.max(...placed.map((p) => p.x + p.w)) - Math.min(...placed.map((p) => p.x)) : 0, items: placed }
  })
}

// Reflow window: lines above the first changed one are never touched; layout
// starts on that line and stops before the first line whose remaining words
// are exactly the source's from that line on (same words, same hyphen
// breaks): those lines stay as they are.
// items: drawables [{ w, brk, glue, rtl }]; units, in reading order:
//   { i, ids }                        one item
//   { whole, p1, p2, ids: [a, b] }    a word split over two source lines:
//     its two halves (original glyphs, the break kept) or, when whole is
//     not null, the joined word (hyphen kept or dropped as decided)
// ids: source piece ids ([] or [null] for new words); tail[r]: ids of the
// source pieces on lines r and after; firstId[r]: first piece id of line r.
// -> { rows: [{ k, v, x0, width, items: [{ i, x, w }] }], last: last source line replaced }
export function layoutWindow(g, items, units, { r0, tail, firstId, s = 1 }) {
  const n = g.rows.length
  const { segFirst, cont } = lineStarts(g)
  const centred = g.align === 'centre' || g.align === 'end'
  const gap = g.gap * s
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
  const out = []
  let queue = units.slice()
  let r = r0
  let prevBrk = false
  let synced = false
  while (queue.length) {
    // the rest is the source from this line on: leave it
    if (out.length && r < n && same(queue.flatMap((u) => u.ids), tail[r])) {
      synced = true
      break
    }
    const x0 = centred ? g.L : prevBrk ? segFirst[0] : r === r0 ? g.rows[Math.min(r, n - 1)].x0 : cont
    const cap = g.R - x0
    const line = { k: r, x0, ids: [], width: 0, ink: 0, hard: false }
    const put = (i) => {
      line.ids.push(i)
      line.width += (line.ids.length > 1 && !items[i].glue ? gap : 0) + items[i].w * s
      line.ink += items[i].w * s
    }
    const fits = (i) => !line.ids.length || line.width + (items[i].glue ? 0 : gap) + items[i].w * s <= cap + 0.01
    while (queue.length) {
      const u = queue[0]
      // keep a source break while the line did not get shorter than it was
      if (line.ids.length && r < n - 1 && u.ids[0] != null && u.ids[0] === firstId[r + 1] && line.ink >= g.rows[r].srcW - 0.5 * gap) break
      if (u.p1 != null) {
        if (u.whole != null && fits(u.whole)) {
          put(u.whole)
          queue.shift()
        } else if (fits(u.p1)) {
          // the first half ends this line, the second starts the next
          put(u.p1)
          queue[0] = { i: u.p2, ids: [u.ids[1]] }
          break
        } else break
      } else if (fits(u.i)) {
        put(u.i)
        queue.shift()
      } else break
      if (items[line.ids[line.ids.length - 1]].brk) {
        line.hard = true
        break
      }
    }
    if (!line.ids.length) {
      // nothing fits even alone: take it anyway (squeeze or no-room decides)
      const u = queue.shift()
      put(u.p1 != null ? u.p1 : u.i)
      if (u.p1 != null) queue.unshift({ i: u.p2, ids: [u.ids[1]] })
    }
    prevBrk = line.hard
    out.push(line)
    r++
  }
  const rows = out.map((line, j) => {
    const last = j === out.length - 1 && !synced
    const capW = g.R - line.x0
    const spread = g.align === 'justify' && !line.hard && (!last || (g.justifyLast && line.width > 0.8 * capW))
    const gaps = line.ids.slice(1).filter((i) => !items[i].glue).length
    // a gap past twice the natural one: leave the line ragged instead
    const want = spread && gaps ? Math.max(0, (capW - line.width) / gaps) : 0
    const extra = gap + want > 2 * gap ? 0 : want
    const width = line.width + extra * gaps
    let x = g.align === 'centre' ? (g.L + g.R) / 2 - width / 2 : g.align === 'end' ? g.R - width : line.x0
    const placed = []
    line.ids.forEach((i, m) => {
      if (m > 0) x += items[i].glue ? 0 : gap + extra
      placed.push({ i, x, w: items[i].w * s })
      x += items[i].w * s
    })
    reorderRuns(placed, items, g.frame.rtl)
    const v = line.k < n ? g.rows[line.k].v : g.rows[n - 1].v + g.leading * (line.k - n + 1)
    return { k: line.k, v, x0: placed.length ? Math.min(...placed.map((p) => p.x)) : line.x0, width: placed.length ? Math.max(...placed.map((p) => p.x + p.w)) - Math.min(...placed.map((p) => p.x)) : 0, items: placed }
  })
  return { rows, last: synced ? r - 1 : n - 1 }
}

// A line edit that spills (or empties its line): only row r0 is laid out
// again, onto as many lines as it needs; every later row moves whole, by the
// rows gained or lost, its words where they were. No word of another row is
// broken again.
// units: as layoutWindow; `row(id)` the source row of a piece id (null: new).
// -> { rows, last, delta } (delta: rows gained, -1 when r0 is now empty), or
//    null when a word alone is wider than the column
export function spillLayout(g, items, units, { r0, row, lead = g.leading }) {
  const n = g.rows.length
  const { cont } = lineStarts(g)
  const gap = g.gap
  // r0's own units come first; a word that goes on into r0 + 1 leaves its
  // second half there
  const mine = []
  const later = []
  for (const u of units) {
    const r = u.ids[0] == null ? r0 : row(u.ids[0])
    if (r > r0) later.push(u)
    else mine.push(u)
  }
  // a justified source line may sit tighter than the natural gap: words it
  // held still fit (not under 60% of the natural gap)
  const src = mine.filter((u) => u.i != null && u.ids[0] != null && items[u.i].x0 != null).map((u) => items[u.i]).sort((a, b) => a.x0 - b.x0)
  const gs = src.slice(1).map((it, k) => it.x0 - src[k].x0 - src[k].w).filter((x) => x > 0)
  const fitGap = gs.length ? Math.max(0.6 * gap, Math.min(gap, ...gs)) : gap
  const out = []
  let line = null
  const open = () => {
    const x0 = out.length ? cont : g.rows[r0].x0
    line = { x0, ids: [], width: 0, hard: false }
    out.push(line)
  }
  const put = (i) => {
    line.width += (line.ids.length && !items[i].glue ? fitGap : 0) + items[i].w
    line.ids.push(i)
  }
  const fits = (i) => !line.ids.length || line.width + (items[i].glue ? 0 : fitGap) + items[i].w <= g.R - line.x0 + 0.01
  const carry = []
  for (const u of mine) {
    const i = u.p1 != null ? u.p1 : u.i
    if (!line || !fits(i)) open()
    put(i)
    if (u.p1 != null) carry.push({ i: u.p2, id: u.ids[1] })
  }
  if (line) line.hard = true
  // a word wider than the column: not spilled (squeezed or refused as before)
  if (out.some((ln) => ln.width > g.R - ln.x0 + 0.5)) return null
  const delta = out.length - 1
  const r0v = g.rows[r0].v
  const rows = out.map((ln, j) => {
    // the last line stays ragged, unless it is still the source's one line
    // and that was a full justified line
    const full = delta === 0 && r0 < n - 1 && !g.words.some((w) => w.brk && w.rows[w.rows.length - 1] === r0) && g.R - g.rows[r0].x1 < Math.max(1, 0.25 * g.size)
    const spread = g.align === 'justify' && (j < out.length - 1 || full)
    const gaps = ln.ids.slice(1).filter((i) => !items[i].glue).length
    // a ragged line takes the natural gap when that still fits
    const g0 = !spread && ln.width + gaps * (gap - fitGap) <= g.R - ln.x0 + 0.01 ? gap : fitGap
    const want = spread && gaps ? Math.max(0, (g.R - ln.x0 - ln.width) / gaps) : 0
    const extra = fitGap + want > 2 * gap ? 0 : want
    let x = ln.x0
    const placed = ln.ids.map((i, m) => {
      if (m > 0) x += items[i].glue ? 0 : g0 + extra
      const p = { i, x, w: items[i].w }
      x += items[i].w
      return p
    })
    return { k: r0 + j, v: r0v + j * lead, x0: ln.x0, width: x - ln.x0, items: placed }
  })
  // same number of lines: the rows below stay (a carried half included)
  if (delta === 0) return { rows, last: r0, delta }
  // later rows as they were, moved by delta lines
  const byRow = new Map()
  const add = (r, i) => (byRow.get(r) ?? byRow.set(r, []).get(r)).push(i)
  for (const c of carry) add(row(c.id), c.i)
  for (const u of later) {
    if (u.p1 != null) {
      add(row(u.ids[0]), u.p1)
      add(row(u.ids[1]), u.p2)
    } else add(row(u.ids[0]), u.i)
  }
  for (let r = r0 + 1; r < n; r++) {
    const ids = byRow.get(r) ?? []
    if (!ids.length) continue
    const placed = ids.map((i) => ({ i, x: items[i].x0, w: items[i].w })).sort((a, b) => a.x - b.x)
    const x0 = placed[0].x
    rows.push({ k: r + delta, v: g.rows[r].v + delta * lead, x0, width: Math.max(...placed.map((p) => p.x + p.w)) - x0, items: placed, kept: r })
  }
  return { rows, last: n - 1, delta }
}

// The source's own line breaks, while the new text still fits them, so a
// small change inside lines leaves every other line where it was.
// items: as layoutParagraph plus `orow` (the source line each one goes on,
// in order). -> rows as layoutParagraph, or null (re-wrap instead)
export function keepLayout(g, items) {
  const n = g.rows.length
  const rows = Array.from({ length: n }, () => [])
  for (let i = 0; i < items.length; i++) {
    const r = items[i].orow
    if (r == null || r < 0 || r >= n || (i && r < items[i - 1].orow)) return null
    // a new hard break inside a source line changes the breaks
    if (i && items[i - 1].brk && items[i - 1].orow === r) return null
    rows[r].push(i)
  }
  if (rows.some((r) => !r.length)) return null
  const hard = new Set()
  for (const w of g.words) if (w.brk) hard.add(w.rows[w.rows.length - 1])
  rows.forEach((ids, k) => items[ids[ids.length - 1]].brk && hard.add(k))
  const out = []
  for (let k = 0; k < n; k++) {
    const ids = rows[k]
    const src = g.rows[k]
    const start = g.align === 'centre' || g.align === 'end' ? g.L : src.x0
    const cap = g.R - start
    const gaps = ids.slice(1).filter((i) => !items[i].glue).length
    const natural = ids.reduce((s, i, j) => s + (j && !items[i].glue ? g.gap : 0) + items[i].w, 0)
    // justified source lines can have gaps a little under the natural one
    if (natural - gaps * g.gap * 0.25 > cap + 0.01) return null
    // a shorter line whose next word would now fit: re-wrap instead (a line
    // ending in the first half of a hyphenated word cannot take more)
    const nextFirst = rows[k + 1]?.[0]
    const inkW = ids.reduce((s, i) => s + items[i].w, 0)
    const lost = inkW < src.srcW - 0.5 * g.gap
    if (lost && nextFirst != null && !hard.has(k) && !items[ids[ids.length - 1]].piece && natural + (items[nextFirst].glue ? 0 : g.gap) + items[nextFirst].w <= cap + 0.01) return null
    const last = k === n - 1
    const spread = (g.align === 'justify' && !hard.has(k) && (!last || g.justifyLast)) || natural > cap
    const gap = spread && gaps ? g.gap + (cap - natural) / gaps : g.gap
    const width = natural + (gap - g.gap) * gaps
    let x = g.align === 'centre' ? (g.L + g.R) / 2 - width / 2 : g.align === 'end' ? g.R - width : start
    const placed = []
    ids.forEach((i, j) => {
      if (j > 0) x += items[i].glue ? 0 : gap
      placed.push({ i, x, w: items[i].w })
      x += items[i].w
    })
    reorderRuns(placed, items, g.frame.rtl)
    out.push({ k, v: src.v, x0: Math.min(...placed.map((p) => p.x)), width, items: placed })
  }
  return out
}

// Words that read against the paragraph (a Latin phrase inside Arabic): a run
// of two or more of them is mirrored in place so it reads in its own order.
function reorderRuns(placed, items, rtl) {
  let a = 0
  while (a < placed.length) {
    if (items[placed[a].i].rtl === rtl) {
      a++
      continue
    }
    let b = a
    while (b + 1 < placed.length && items[placed[b + 1].i].rtl !== rtl) b++
    if (b > a) {
      const lo = placed[a].x
      const hi = placed[b].x + placed[b].w
      for (let j = a; j <= b; j++) placed[j].x = lo + hi - (placed[j].x + placed[j].w)
    }
    a = b + 1
  }
}
