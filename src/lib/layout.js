// Pure layout analysis for PDF -> Office / Markdown (no pdf.js, no DOM, so it
// also runs in Node). Input is the page data from pdfExtract.js:
//   items: { text, x, y, size, width, bold, italic, font, color, dir }
//   hLines / vLines: ruling segments, width / height, view box.
// Pipeline per page: lattice tables (ruling lines) -> lines -> column
// segmentation (gutter valleys) -> stream tables (aligned cells) -> blocks in
// reading order. Paragraphs, header/footer bands and frames are built on top.

// ---------- matrix helpers ----------
export const IDENTITY = [1, 0, 0, 1, 0, 0]
export const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
]
export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

// ---------- operator list walk ----------
// Collects (a) horizontal / vertical segments from paths (table borders),
// (b) image placements with page positions, (c) the fill colour at the start
// of every text show (matched to text items later), (d) how much vector art
// the page paints. OPS is pdfjsLib.OPS.
export function walkOperators(opList, OPS, pageArea = 0) {
  const segments = []
  const imagePlacements = []
  const textMarks = []
  let vectorPaths = 0
  let ctm = IDENTITY
  const stack = []
  // text state (enough to know where each show starts)
  let fill = '#000000'
  let tm = IDENTITY
  let tx = 0
  let ty = 0
  let lineX = 0
  let lineY = 0
  let leading = 0
  let fontSize = 0
  let charSpacing = 0
  let wordSpacing = 0
  let hScale = 1

  const recordImage = (objId, inlineObj = null) => {
    const pts = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ].map(([x, y]) => apply(ctm, x, y))
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const rect = {
      x: Math.min(...xs),
      yTop: Math.max(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    }
    if (rect.w < 6 || rect.h < 6) return // decorative specks
    imagePlacements.push({ objId, inlineObj, rect })
  }

  const addSegment = (x1, y1, x2, y2) => {
    const [ax, ay] = apply(ctm, x1, y1)
    const [bx, by] = apply(ctm, x2, y2)
    if (Math.abs(ax - bx) < 0.6 && Math.abs(ay - by) < 0.6) return
    if (Math.abs(ay - by) < 0.6) {
      segments.push({ dir: 'h', y: (ay + by) / 2, a: Math.min(ax, bx), b: Math.max(ax, bx) })
    } else if (Math.abs(ax - bx) < 0.6) {
      segments.push({ dir: 'v', x: (ax + bx) / 2, a: Math.min(ay, by), b: Math.max(ay, by) })
    }
  }

  const paintOps = new Set(
    [OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter(
      (v) => v != null,
    ),
  )

  const moveText = (x, y) => {
    lineX += x
    lineY += y
    tx = lineX
    ty = lineY
  }

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i]
    const args = opList.argsArray[i]
    if (fn === OPS.save) stack.push({ ctm, fill })
    else if (fn === OPS.restore) {
      const s = stack.pop()
      ctm = s?.ctm ?? IDENTITY
      fill = s?.fill ?? '#000000'
    } else if (fn === OPS.transform) ctm = mul(ctm, args)
    else if (fn === OPS.setFillRGBColor) fill = typeof args?.[0] === 'string' ? args[0] : fill
    else if (fn === OPS.beginText) {
      tm = IDENTITY
      tx = ty = lineX = lineY = 0
    } else if (fn === OPS.setTextMatrix) {
      tm = args.length >= 6 ? Array.from(args).slice(0, 6) : Array.from(args[0] ?? IDENTITY)
      tx = ty = lineX = lineY = 0
    } else if (fn === OPS.moveText) moveText(args[0], args[1])
    else if (fn === OPS.setLeadingMoveText) {
      leading = args[1]
      moveText(args[0], args[1])
    } else if (fn === OPS.setLeading) leading = -args[0]
    else if (fn === OPS.nextLine) moveText(0, leading)
    else if (fn === OPS.setFont) fontSize = args[1] ?? fontSize
    else if (fn === OPS.setCharSpacing) charSpacing = args[0]
    else if (fn === OPS.setWordSpacing) wordSpacing = args[0]
    else if (fn === OPS.setHScale) hScale = args[0] / 100
    else if (fn === OPS.showText || fn === OPS.showSpacedText) {
      const [x, y] = apply(mul(ctm, tm), tx, ty)
      textMarks.push({ x, y, color: fill })
      // advance so the next show on this line starts in the right place
      const glyphs = args[0]
      if (Array.isArray(glyphs)) {
        let adv = 0
        for (const g of glyphs) {
          if (typeof g === 'number') adv -= (g * fontSize) / 1000
          else if (g) adv += ((g.width ?? 0) * fontSize) / 1000 + charSpacing + (g.isSpace ? wordSpacing : 0)
        }
        tx += adv * hScale
      }
    } else if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
      recordImage(args[0])
    } else if (fn === OPS.paintInlineImageXObject) {
      recordImage(null, args[0])
    } else if (fn === OPS.constructPath) {
      // pdf.js v5 shape: args = [paintOp, [Float32Array pathData], minMax]
      // pathData is flat [drawOp, coords...]: 0=moveTo(x,y), 1=lineTo(x,y),
      // 2=curveTo(6 coords), 3=closePath.
      const pathHolder = args?.[1]
      const pathData = Array.isArray(pathHolder) ? pathHolder[0] : pathHolder
      if (!pathData || typeof pathData.length !== 'number') continue
      const painted = paintOps.has(args?.[0])
      let curves = false
      let pi = 0
      let cx = 0
      let cy = 0
      let startX = 0
      let startY = 0
      while (pi < pathData.length) {
        const op = pathData[pi++]
        if (op === 0) {
          cx = pathData[pi++]
          cy = pathData[pi++]
          startX = cx
          startY = cy
        } else if (op === 1) {
          const nx = pathData[pi++]
          const ny = pathData[pi++]
          addSegment(cx, cy, nx, ny)
          cx = nx
          cy = ny
        } else if (op === 2) {
          pi += 6
          cx = pathData[pi - 2]
          cy = pathData[pi - 1]
          curves = true
        } else if (op === 3) {
          addSegment(cx, cy, startX, startY)
          cx = startX
          cy = startY
        } else {
          break // unknown encoding, skip the rest of this path safely
        }
      }
      if (painted) {
        // a page-sized background rectangle is not art
        const mm = args?.[2]
        let big = false
        if (mm && mm.length >= 4 && pageArea > 0 && !curves) {
          const [p0x, p0y] = apply(ctm, mm[0], mm[1])
          const [p1x, p1y] = apply(ctm, mm[2], mm[3])
          big = Math.abs((p1x - p0x) * (p1y - p0y)) > pageArea * 0.85
        }
        if (!big) vectorPaths++
      }
    }
  }
  return { segments, imagePlacements, textMarks, vectorPaths }
}

// Merge collinear segments and drop tiny fragments.
export function consolidate(segments) {
  const H = []
  const V = []
  for (const s of segments) (s.dir === 'h' ? H : V).push({ ...s })
  const mergeAxis = (list, posKey) => {
    list.sort((s1, s2) => s1[posKey] - s2[posKey] || s1.a - s2.a)
    const out = []
    for (const s of list) {
      const prev = out[out.length - 1]
      if (prev && Math.abs(prev[posKey] - s[posKey]) < 2 && s.a <= prev.b + 3) {
        prev.b = Math.max(prev.b, s.b)
        prev[posKey] = (prev[posKey] + s[posKey]) / 2
      } else {
        out.push(s)
      }
    }
    return out.filter((s) => s.b - s.a > 6)
  }
  return { hLines: mergeAxis(H, 'y'), vLines: mergeAxis(V, 'x') }
}

// Gives every item the fill colour of the text show it starts in.
export function colorItems(items, marks) {
  if (!marks.length || marks.every((m) => isBlack(m.color))) return
  const buckets = new Map()
  for (const m of marks) {
    const k = Math.round(m.y)
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k).push(m)
  }
  for (const it of items) {
    let best = null
    const k = Math.round(it.y)
    for (let d = -2; d <= 2; d++) {
      for (const m of buckets.get(k + d) ?? []) {
        if (Math.abs(m.y - it.y) > Math.max(1.5, it.size * 0.3) || m.x > it.x + 1) continue
        if (!best || m.x > best.x) best = m
      }
    }
    if (best && !isBlack(best.color)) it.color = best.color.replace('#', '').toUpperCase()
  }
}
const isBlack = (c) => !c || /^#?0{6}$/.test(c)

// ---------- fonts ----------
export function isBoldFont(fontName = '') {
  return /bold|black|heavy|semibold|demi|[-+,]b$|\.b$|cmbx/i.test(fontName)
}
export function isItalicFont(fontName = '') {
  return /italic|oblique|[-,]it$|cmti|cmmi|cmsl/i.test(fontName)
}
// "ABCDEF+TimesNewRomanPS-BoldMT" -> "Times New Roman". Word picks a close
// font when the exact one is not installed.
export function fontFamily(fontName = '') {
  let n = fontName.replace(/^[A-Z]{6}\+/, '').trim()
  if (!n) return ''
  const low = n.toLowerCase()
  if (/^(cm|sf|lm)(r|bx|ti|sl|ss|tt|mi|sy|ex|csc)\d|nimbusrom|times|tex gyre termes|stix|minion|nimbus roman/.test(low)) {
    return /tt\d|mono/.test(low) ? 'Courier New' : 'Times New Roman'
  }
  if (/courier|nimbusmon|cmtt|inconsolata|consol/.test(low)) return 'Courier New'
  if (/helvetica|nimbussan|arialmt|^arial/.test(low)) return 'Arial'
  n = n.replace(/[-,_](bold|italic|oblique|regular|roman|medium|light|semibold|black|heavy|book|it|bd|bi|condensed)+.*$/i, '')
  n = n.replace(/(PSMT|MT|PS|Std|Pro)$/, '').replace(/(Bold|Italic|Regular|Oblique)+$/, '')
  // CamelCase to words: "SegoeUI" -> "Segoe UI"
  n = n.replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return n || ''
}

// ---------- lattice tables (from ruling lines) ----------
export function cluster(values, tol) {
  const sorted = [...values].sort((a, b) => a - b)
  const out = []
  for (const v of sorted) {
    if (out.length && v - out[out.length - 1].max < tol) {
      const c = out[out.length - 1]
      c.max = v
      c.sum += v
      c.n++
    } else {
      out.push({ min: v, max: v, sum: v, n: 1 })
    }
  }
  return out.map((c) => c.sum / c.n)
}

// Finds grid-shaped regions: >=2 h-lines and >=2 v-lines that mutually span.
export function detectTables(page) {
  const tables = []
  const used = new Set()
  const { hLines, vLines } = page
  if (hLines.length < 2 || vLines.length < 2) return { tables, usedItems: used }

  // group v-lines by overlapping vertical extent to isolate one table region
  const regions = []
  for (const v of vLines) {
    const region = regions.find((r) => Math.min(r.yMax, v.b) - Math.max(r.yMin, v.a) > 5)
    if (region) {
      region.vs.push(v)
      region.yMin = Math.min(region.yMin, v.a)
      region.yMax = Math.max(region.yMax, v.b)
    } else {
      regions.push({ vs: [v], yMin: v.a, yMax: v.b })
    }
  }

  for (const region of regions) {
    if (region.vs.length < 2) continue
    const xs = cluster(region.vs.map((v) => v.x), 4)
    const relevantH = hLines.filter(
      (h) => h.y > region.yMin - 4 && h.y < region.yMax + 4 && h.b > Math.min(...xs) - 4 && h.a < Math.max(...xs) + 4,
    )
    if (relevantH.length < 2) continue
    const ys = cluster(relevantH.map((h) => h.y), 3).sort((a, b) => b - a) // top first
    if (xs.length < 2 || ys.length < 2) continue

    const colBounds = xs.sort((a, b) => a - b)
    // a one-column grid is a box around content, not a table: leave its
    // text to the line / stream-table analysis
    if (colBounds.length < 3) continue
    // bucket the region's items by cell once (not a page scan per cell)
    const grid = ys.slice(0, -1).map(() => colBounds.slice(0, -1).map(() => []))
    for (const it of page.items) {
      if (used.has(it) || it.y >= ys[0] || it.y <= ys[ys.length - 1]) continue
      const cx = it.x + it.width / 2
      if (cx < colBounds[0] || cx >= colBounds[colBounds.length - 1]) continue
      let r = 0
      while (r < ys.length - 2 && it.y <= ys[r + 1]) r++
      let c = 0
      while (c < colBounds.length - 2 && cx >= colBounds[c + 1]) c++
      grid[r][c].push(it)
      used.add(it)
    }
    const rows = grid.map((row) =>
      row.map((cellItems) => {
        cellItems.sort((a, b) => b.y - a.y || a.x - b.x)
        return cellItems.map((it) => it.text).join(' ').trim()
      }),
    )
    if (rows.some((row) => row.some((c) => c))) {
      tables.push({
        top: ys[0],
        bottom: ys[ys.length - 1],
        left: colBounds[0],
        right: colBounds[colBounds.length - 1],
        rows,
        cellItems: grid,
        colBounds,
        kind: 'lattice',
      })
    } else {
      // empty grid: give its items back (there are none) and move on
    }
  }
  tables.sort((t1, t2) => t2.top - t1.top)
  return { tables, usedItems: used }
}

// ---------- text direction ----------
const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/
const STRONG_LTR_RE = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/
export const isRtlText = (s) => RTL_RE.test(s)

// Items left to right on the page -> logical order. In a right-to-left line
// the items read right to left, but runs of left-to-right items (Latin
// words, numbers) keep their own left-to-right order.
// Brackets are stored by shape, so in right-to-left text "(" and ")" swap.
const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' }
const mirrored = (it) => {
  if (!/[()[\]{}<>«»]/.test(it.text)) return it
  return { ...it, text: it.text.replace(/[()[\]{}<>«»]/g, (c) => MIRROR[c]) }
}

function logicalOrder(items) {
  const out = []
  let run = []
  const flushRun = () => {
    if (run.length) out.push(...run.reverse())
    run = []
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (!RTL_RE.test(it.text) && (STRONG_LTR_RE.test(it.text) || /\d/.test(it.text))) run.push(it)
    else {
      flushRun()
      out.push(mirrored(it))
    }
  }
  flushRun()
  return out
}

// ---------- lines ----------
// Groups items into lines (same baseline), items left to right; RTL lines
// get their items in logical order and `rtl: true`. Sweep over items sorted
// top-down, only comparing against lines near the current baseline.
export function buildLines(items) {
  const lines = []
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  let open = []
  for (const it of sorted) {
    open = open.filter((l) => l.y - it.y < 60)
    // a small item (superscript, footnote mark) joins the line it sits on
    const line = open.find((l) => {
      const dy = Math.abs(l.y - it.y)
      if (dy < Math.max(3, it.size * 0.4)) return true
      return it.size < l.size * 0.8 && dy < l.size * 0.45
    })
    if (line) {
      line.items.push(it)
      line.size = Math.max(line.size, it.size)
      line.y = (line.y + it.y) / 2
    } else {
      const l = { y: it.y, size: it.size, items: [it] }
      lines.push(l)
      open.push(l)
    }
  }
  for (const l of lines) finishLine(l)
  return lines
}

function finishLine(l) {
  l.items.sort((a, b) => a.x - b.x)
  l.x0 = l.items[0].x
  l.x1 = Math.max(...l.items.map((i) => i.x + i.width))
  let rtlChars = 0
  let ltrChars = 0
  for (const it of l.items) {
    for (const ch of it.text) {
      if (RTL_RE.test(ch)) rtlChars++
      else if (STRONG_LTR_RE.test(ch)) ltrChars++
    }
  }
  l.rtl = rtlChars > ltrChars
  l.ordered = l.rtl ? logicalOrder(l.items) : l.items
  return l
}

// A line built from a subset of another line's items.
function subLine(line, items) {
  return finishLine({ y: line.y, size: Math.max(...items.map((i) => i.size)), items: [...items] })
}

// Line text in logical order, with spaces where the page shows a gap.
export function lineText(line) {
  return joinItems(line.ordered ?? line.items, line.rtl)
}
export function joinItems(items, rtl = false) {
  let out = ''
  let prev = null
  for (const it of items) {
    if (prev) {
      const gap = rtl ? prev.x - (it.x + it.width) : it.x - (prev.x + prev.width)
      const needSpace = gap > Math.min(prev.size, it.size) * 0.12 && !/\s$/.test(out) && !/^\s/.test(it.text)
      if (needSpace) out += ' '
    }
    out += it.text
    prev = it
  }
  return out.replace(/\s+/g, ' ').trim()
}

// Split a line's items into segments at horizontal gaps wider than `gap`.
export function lineSegments(line, gap) {
  const segs = []
  let cur = null
  for (const it of line.items) {
    if (cur && it.x - cur.x1 < gap) {
      cur.items.push(it)
      cur.x1 = Math.max(cur.x1, it.x + it.width)
    } else {
      cur = { items: [it], x0: it.x, x1: it.x + it.width }
      segs.push(cur)
    }
  }
  return segs
}

// Column boundaries shared by most lines: x-positions where a gap appears in
// the majority of multi-item lines (used by the Excel row layout).
export function detectColumns(lines, pageWidth) {
  const gapVotes = []
  let multiLines = 0
  for (const line of lines) {
    if (line.items.length < 2) continue
    multiLines++
    for (let i = 1; i < line.items.length; i++) {
      const prev = line.items[i - 1]
      const gapStart = prev.x + prev.width
      const gapEnd = line.items[i].x
      if (gapEnd - gapStart > Math.max(10, line.size * 1.1)) {
        gapVotes.push((gapStart + gapEnd) / 2)
      }
    }
  }
  if (multiLines < 2) return []
  const tol = Math.max(14, pageWidth * 0.02)
  const clustered = cluster(gapVotes, tol)
  // keep boundaries voted for by at least 60% of multi-item lines
  return clustered.filter(
    (cx) => gapVotes.filter((v) => Math.abs(v - cx) < tol).length >= Math.max(2, Math.ceil(multiLines * 0.6)),
  )
}

// Split a line's items into cells using shared column boundaries (or per-line
// gaps when no shared boundaries exist).
export function lineCells(line, columnBounds) {
  if (columnBounds.length > 0) {
    const cells = Array.from({ length: columnBounds.length + 1 }, () => [])
    for (const it of line.items) {
      const center = it.x + it.width / 2
      let col = 0
      while (col < columnBounds.length && center > columnBounds[col]) col++
      cells[col].push(it)
    }
    return cells.map((cellItems) => joinItems(cellItems))
  }
  return lineSegments(line, Math.max(8, line.size * 1.2)).map((s) => joinItems(s.items))
}

// ---------- column segmentation ----------
const median = (arr) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

// Share of lines that read as words (not numbers): enough words, or 10+
// letters without spaces (CJK), and not mostly digits.
function wordyShare(lines, minWords = 4) {
  if (!lines.length) return 0
  let wordy = 0
  for (const l of lines) {
    const t = lineText(l)
    const words = t.split(/\s+/).filter(Boolean).length
    const digits = (t.match(/\d/g) ?? []).length
    const letters = (t.match(/\p{L}/gu) ?? []).length
    if ((words >= minWords || letters >= 10) && digits < letters * 0.4) wordy++
  }
  return wordy / lines.length
}
// One side must be prose; the other prose or a sidebar of short headings.
// Returns false, 'both', 'left' (left is a sidebar) or 'right'.
function textColumns(a, b) {
  const prose = (ls) => ls.length >= 5 && wordyShare(ls) >= 0.55
  // sidebar headings stand out: bigger or bold
  const headingLike = (ls, other) =>
    median(ls.map((l) => l.size)) >= median(other.map((l) => l.size)) * 1.1 ||
    ls.filter((l) => l.items.every((i) => i.bold)).length > ls.length / 2
  const sidebar = (ls) => ls.length >= 3 && wordyShare(ls, 2) >= 0.35 && headingLike(ls, ls === a ? b : a)
  if (prose(a) && prose(b)) return 'both'
  if (prose(a) && sidebar(b)) return 'right'
  if (prose(b) && sidebar(a)) return 'left'
  return false
}

// Finds text-column gutters: interior x-ranges that almost no line covers,
// with prose on both sides. Tables and forms do not count as columns.
export function findGutters(lines, bodySize) {
  if (lines.length < 10) return []
  const minX = Math.min(...lines.map((l) => l.x0))
  const maxX = Math.max(...lines.map((l) => l.x1))
  const W = maxX - minX
  if (W < 150) return []
  const fillGap = Math.max(8, bodySize * 0.9)
  const bins = new Int32Array(Math.ceil(W) + 1)
  for (const l of lines) {
    // cover each line's items, bridging word-size gaps
    for (const s of lineSegments(l, fillGap)) {
      const a = Math.max(0, Math.floor(s.x0 - minX))
      const b = Math.min(bins.length - 1, Math.ceil(s.x1 - minX))
      for (let i = a; i <= b; i++) bins[i]++
    }
  }
  const nonZero = []
  for (const v of bins) if (v > 0) nonZero.push(v)
  const med = median(nonZero)
  const thr = Math.max(1, med * 0.45)
  const minGutter = Math.max(7, bodySize * 0.7)
  const cands = []
  let start = -1
  for (let i = 0; i <= bins.length; i++) {
    const low = i < bins.length && bins[i] <= thr
    if (low && start < 0) start = i
    if (!low && start >= 0) {
      // the low run can include a sparse sidebar: keep only its deepest part
      let minCount = Infinity
      for (let k = start; k < i; k++) minCount = Math.min(minCount, bins[k])
      const deep = minCount + Math.max(1, med * 0.12)
      let k = start
      while (k < i) {
        if (bins[k] > deep) {
          k++
          continue
        }
        let e = k
        while (e + 1 < i && bins[e + 1] <= deep) e++
        const a = k + minX
        const b = e + minX
        if (b - a >= minGutter && a > minX + W * 0.12 && b < maxX - W * 0.12) cands.push({ x0: a, x1: b, minCount })
        k = e + 1
      }
      start = -1
    }
  }
  // validate: both sides hold several lines of prose
  const gutters = []
  for (const g of cands.sort((p, q) => q.x1 - q.x0 - (p.x1 - p.x0)).slice(0, 2)) {
    const mid = (g.x0 + g.x1) / 2
    const left = []
    const right = []
    let shared = 0
    for (const l of lines) {
      if (l.x1 <= mid) left.push(l)
      else if (l.x0 >= mid) right.push(l)
      else {
        const segs = lineSegments(l, fillGap)
        const l1 = segs.filter((s) => s.x1 <= mid).flatMap((s) => s.items)
        const r1 = segs.filter((s) => s.x0 >= mid).flatMap((s) => s.items)
        if (l1.length && r1.length && l1.length + r1.length === l.items.length) {
          left.push(subLine(l, l1))
          right.push(subLine(l, r1))
          shared++
        }
      }
    }
    if (mid - minX < W * 0.12 || maxX - mid < W * 0.12) continue
    let kind = textColumns(left, right)
    if (!kind && left.length >= 3 && right.length >= 3) {
      // justified prose beside a figure (labels) is a column too; table cells
      // with words do not fill their column edge to edge like this
      const fills = (ls, x0, x1) => median(ls.map((l) => (Math.min(l.x1, x1) - Math.max(l.x0, x0)) / (x1 - x0)))
      const lp = wordyShare(left) >= 0.8 && left.length >= 8 && fills(left, minX, g.x0) >= 0.75
      const rp = wordyShare(right) >= 0.8 && right.length >= 8 && fills(right, g.x1, maxX) >= 0.75
      if (lp || rp) kind = 'both'
    }
    if (kind === 'both') {
      // a much narrower side with fewer lines is a sidebar, not a column
      const wl = mid - minX
      const wr = maxX - mid
      if (wl < wr * 0.6 && left.length < right.length * 0.6) kind = 'left'
      else if (wr < wl * 0.6 && right.length < left.length * 0.6) kind = 'right'
    }
    if (kind) gutters.push({ x0: g.x0, x1: g.x1, mid, sidebar: kind === 'both' ? null : kind })
  }
  // a sidebar layout has one gutter only
  if (gutters.length > 1 && gutters.some((g) => g.sidebar)) return []
  return gutters.sort((a, b) => a.mid - b.mid)
}

// Orders a page's lines for reading: lines crossing a gutter stay in place as
// full-width blocks; between them each column is read top to bottom, columns
// left to right (right to left for RTL text). Ruled tables that cross a
// gutter end a column region; tables inside one column stay in that column.
// Each block: { kind: 'span' | 'col', col, entries: [{ line } | { table }] }.
// Pages that mix full-width parts (figures, code) with columns are first
// cut at their widest horizontal whitespace, so each part finds its own
// gutters.
export function readingOrder(lines, bodySize, tables = []) {
  const sorted = [...lines].sort((a, b) => b.y - a.y || a.x0 - b.x0)
  const zones = splitZones(sorted, bodySize, 0)
  if (zones.length === 1) return orderZone(sorted, zones[0].gutters, bodySize, tables)
  const blocks = []
  const gutters = []
  zones.forEach((z, zi) => {
    // a table belongs to the zone whose top is the last one above it
    const top = zi === 0 ? Infinity : z.lines[0].y + z.lines[0].size
    const nextTop = zi + 1 < zones.length ? zones[zi + 1].lines[0].y + zones[zi + 1].lines[0].size : -Infinity
    const zt = tables.filter((t) => t.top <= top && t.top > nextTop)
    const r = orderZone(z.lines, z.gutters, bodySize, zt)
    blocks.push(...r.blocks)
    gutters.push(...r.gutters)
  })
  return { gutters, blocks }
}

function splitZones(sorted, bodySize, depth) {
  const gutters = findGutters(sorted, bodySize)
  if (gutters.length || depth >= 3 || sorted.length < 16) return [{ lines: sorted, gutters }]
  // widest vertical gap between consecutive lines, both parts big enough
  let best = -1
  let bestGap = 0
  for (let i = 6; i <= sorted.length - 6; i++) {
    const above = sorted[i - 1]
    const gap = above.y - above.size * 0.25 - (sorted[i].y + sorted[i].size * 0.85)
    if (gap > bestGap) {
      bestGap = gap
      best = i
    }
  }
  if (best < 0 || bestGap < bodySize * 0.8) return [{ lines: sorted, gutters }]
  const parts = [...splitZones(sorted.slice(0, best), bodySize, depth + 1), ...splitZones(sorted.slice(best), bodySize, depth + 1)]
  // no part has columns: keep the page whole
  if (!parts.some((p) => p.gutters.length)) return [{ lines: sorted, gutters }]
  return parts
}

function orderZone(sorted, gutters, bodySize, tables) {
  const byTop = (a, b) => entryY(b) - entryY(a)
  if (!gutters.length) {
    const entries = [...sorted.map((line) => ({ line })), ...tables.map((table) => ({ table }))].sort(byTop)
    return { gutters, blocks: entries.length ? [{ kind: 'span', entries }] : [] }
  }
  const edges = [-Infinity, ...gutters.map((g) => g.mid), Infinity]
  const colOf = (x0, x1) => {
    for (let c = 0; c < edges.length - 1; c++) if (x0 >= edges[c] - 1 && x1 <= edges[c + 1] + 1) return c
    return -1
  }
  const fillGap = Math.max(8, bodySize * 0.9)
  const blocks = []
  let region = null
  const sidebar = gutters.length === 1 ? gutters[0].sidebar : null
  const closeRegion = () => {
    if (!region) return
    if (sidebar && region.cols.size === 2) {
      // sidebar headings go right before the body text level with them
      const sideCol = sidebar === 'left' ? 0 : 1
      const side = region.cols.get(sideCol).sort(byTop)
      const main = region.cols.get(1 - sideCol).sort(byTop)
      const chunks = []
      for (const e of side) {
        const last = chunks[chunks.length - 1]
        const prev = last?.[last.length - 1]
        if (prev?.line && e.line && prev.line.y - e.line.y <= Math.max(prev.line.size, e.line.size) * 1.6) last.push(e)
        else chunks.push([e])
      }
      let body = []
      const flushBody = () => {
        if (body.length) blocks.push({ kind: 'col', col: 1 - sideCol, entries: body })
        body = []
      }
      for (const e of main) {
        while (chunks.length && entryY(chunks[0][0]) >= entryY(e) - 2) {
          flushBody()
          blocks.push({ kind: 'col', col: sideCol, entries: chunks.shift() })
        }
        body.push(e)
      }
      flushBody()
      for (const c of chunks) blocks.push({ kind: 'col', col: sideCol, entries: c })
      region = null
      return
    }
    const rtl = region.rtl > region.n / 2
    const cols = [...region.cols.keys()].sort((a, b) => (rtl ? b - a : a - b))
    for (const c of cols) blocks.push({ kind: 'col', col: c, entries: region.cols.get(c).sort(byTop) })
    region = null
  }
  const addSpan = (entry) => {
    closeRegion()
    const last = blocks[blocks.length - 1]
    if (last?.kind === 'span') last.entries.push(entry)
    else blocks.push({ kind: 'span', entries: [entry] })
  }
  const addCol = (c, entry) => {
    if (!region) region = { cols: new Map(), n: 0, rtl: 0 }
    if (!region.cols.has(c)) region.cols.set(c, [])
    region.cols.get(c).push(entry)
    if (entry.line) {
      region.n++
      if (entry.line.rtl) region.rtl++
    }
  }
  // lines and tables top to bottom
  const all = [...sorted.map((line) => ({ line })), ...tables.map((table) => ({ table }))].sort(byTop)
  for (const entry of all) {
    if (entry.table) {
      const c = colOf(entry.table.left, entry.table.right)
      if (c >= 0) addCol(c, entry)
      else addSpan(entry)
      continue
    }
    const line = entry.line
    let parts = null
    const c = colOf(line.x0, line.x1)
    if (c >= 0) parts = [[c, line]]
    else {
      // a line with items on both sides of a gutter but nothing across it
      const segs = lineSegments(line, fillGap)
      const byCol = new Map()
      let crosses = false
      for (const s of segs) {
        const sc = colOf(s.x0, s.x1)
        if (sc < 0) {
          crosses = true
          break
        }
        if (!byCol.has(sc)) byCol.set(sc, [])
        byCol.get(sc).push(...s.items)
      }
      if (!crosses) parts = [...byCol.entries()].map(([k, its]) => [k, subLine(line, its)])
    }
    if (!parts) addSpan(entry)
    else for (const [k, l] of parts) addCol(k, { line: l })
  }
  closeRegion()
  return { gutters, blocks }
}
const entryY = (e) => (e.line ? e.line.y : e.table.top)
// ---------- stream (borderless) tables ----------
// Runs of lines split into aligned cells become tables. Column edges come
// from an x-projection of the cells over the whole run.
export function detectStreamTables(lines, bodySize) {
  const out = []
  const info = lines.map((l) => {
    const gap = Math.max(6, l.size * 1.0)
    const segs = lineSegments(l, gap)
    return { line: l, segs, multi: segs.length >= 2 }
  })
  let i = 0
  while (i < info.length) {
    if (!info[i].multi) {
      i++
      continue
    }
    // grow the run: multi lines, at most one single line between them
    let j = i
    let k = i + 1
    while (k < info.length) {
      const pitch = info[k - 1].line.y - info[k].line.y
      if (pitch > Math.max(info[k].line.size, bodySize) * 2.6 || pitch < 0) break
      if (info[k].multi) {
        j = k
        k++
      } else if (k + 1 < info.length && info[k + 1].multi && info[k].line.y - info[k + 1].line.y < info[k].line.size * 2.6) {
        k++
      } else break
    }
    const run = info.slice(i, j + 1)
    const table = buildStreamTable(run, bodySize)
    if (table) {
      out.push({ start: i, end: j, ...table })
      i = j + 1
    } else i++
  }
  return out
}

function buildStreamTable(run, bodySize) {
  const multi = run.filter((r) => r.multi)
  const rowsNeeded = multi.every((r) => r.segs.length === 2) ? 4 : 3
  if (multi.length < rowsNeeded) return null
  const minX = Math.min(...run.map((r) => r.line.x0))
  const maxX = Math.max(...run.map((r) => r.line.x1))
  const W = Math.ceil(maxX - minX) + 1
  const bins = new Int32Array(W + 1)
  for (const r of multi) {
    for (const s of r.segs) {
      const a = Math.max(0, Math.floor(s.x0 - minX))
      const b = Math.min(W, Math.ceil(s.x1 - minX))
      for (let x = a; x <= b; x++) bins[x]++
    }
  }
  const allowed = Math.floor(multi.length * 0.1)
  const minGap = Math.max(4, bodySize * 0.5)
  const seps = []
  let start = -1
  for (let x = 0; x <= W; x++) {
    const empty = x < W && bins[x] <= allowed
    if (empty && start < 0) start = x
    if (!empty && start >= 0) {
      if (x - start >= minGap && start > 0) seps.push(minX + (start + x) / 2)
      start = -1
    }
  }
  if (!seps.length || seps.length > 20) return null
  const colOf = (s) => {
    const c = (s.x0 + s.x1) / 2
    let k = 0
    while (k < seps.length && c > seps[k]) k++
    return k
  }
  const nCols = seps.length + 1
  const rows = []
  let prevLine = null
  for (const r of run) {
    const cells = Array.from({ length: nCols }, () => [])
    for (const s of r.segs) cells[colOf(s)].push(...s.items)
    const filled = cells.filter((c) => c.length).length
    const prev = rows[rows.length - 1]
    // wrapped cell text: a short line under a row, in columns the row uses
    if (
      prev &&
      prevLine &&
      filled <= Math.max(1, Math.floor(nCols / 2)) &&
      !cells[0].length &&
      prevLine.y - r.line.y < r.line.size * 1.45 &&
      cells.every((c, ci) => !c.length || prev[ci].length)
    ) {
      cells.forEach((c, ci) => prev[ci].push(...c))
    } else rows.push(cells)
    prevLine = r.line
  }
  const twoPlus = rows.filter((cells) => cells.filter((c) => c.length).length >= 2).length
  if (twoPlus < rowsNeeded || twoPlus < rows.length * 0.5) return null
  // two columns of running text are not a table
  const proseRows = rows.filter((cells) => cells.filter((c) => joinItems(c).split(' ').length >= 6).length >= 2).length
  if (proseRows >= rows.length * 0.5) return null
  // prose guard: long cells in every row are paragraphs, not a table
  const avgLen = rows.flat().filter((c) => c.length).reduce((s, c) => s + joinItems(c).length, 0) / Math.max(1, rows.flat().filter((c) => c.length).length)
  if (avgLen > 60) return null
  return {
    colBounds: [minX, ...seps, maxX],
    cellItems: rows,
    rows: rows.map((cells) => cells.map((c) => joinItems(orderCell(c), cellRtl(c)))),
    top: run[0].line.y + run[0].line.size,
    kind: 'stream',
  }
}

function orderCell(items) {
  const lines = buildLines(items)
  return lines.flatMap((l) => l.ordered)
}
const cellRtl = (items) => items.some((i) => RTL_RE.test(i.text))

// ---------- page layout ----------
// Blocks in reading order: { type: 'table', table } | { type: 'line', line,
// region: { x0, x1, col } }. `skip` is a set of items to leave out (headers).
export function layoutPage(page, { bodySize = 10, skip = null, streamTables = true } = {}) {
  const kept = skip?.size ? page.items.filter((it) => !skip.has(it)) : page.items
  const { tables, usedItems } = detectTables({ ...page, items: kept })
  const free = kept.filter((it) => !usedItems.has(it))
  const lines = buildLines(free)
  const { blocks: flows, gutters } = readingOrder(lines, bodySize, tables)
  const contentX0 = lines.length ? Math.min(...lines.map((l) => l.x0)) : 0
  const contentX1 = lines.length ? Math.max(...lines.map((l) => l.x1)) : page.width
  const blocks = []
  let streamCount = 0
  for (const flow of flows) {
    const flowLines = flow.entries.filter((e) => e.line).map((e) => e.line)
    const region =
      flow.kind === 'col' && flowLines.length
        ? { x0: Math.min(...flowLines.map((l) => l.x0)), x1: Math.max(...flowLines.map((l) => l.x1)), col: true }
        : { x0: contentX0, x1: contentX1, col: false }
    // stream tables inside each run of lines between ruled tables
    let run = []
    const flushRun = () => {
      const stream = streamTables ? detectStreamTables(run, bodySize) : []
      let si = 0
      for (let li = 0; li < run.length; li++) {
        const st = stream[si]
        if (st && li === st.start) {
          blocks.push({ type: 'table', table: { ...st, left: st.colBounds[0], right: st.colBounds[st.colBounds.length - 1] } })
          streamCount++
          li = st.end
          si++
          continue
        }
        blocks.push({ type: 'line', line: run[li], region })
      }
      run = []
    }
    for (const e of flow.entries) {
      if (e.line) run.push(e.line)
      else {
        flushRun()
        blocks.push({ type: 'table', table: e.table })
      }
    }
    flushRun()
  }
  return { blocks, gutters, latticeCount: tables.length, streamCount }
}

// ---------- paragraphs ----------
const BULLET_START = /^\s*([•·▪◦‣∙●○■□➢➤►-]|\d{1,2}[.)]|[a-z][.)])\s+/

// Groups consecutive line blocks of one region into paragraphs with an
// alignment guess. Returns [{ lines, align, size, rtl, region }].
export function buildParagraphs(lineBlocks, bodySize) {
  const paras = []
  let cur = null
  const flush = () => {
    if (cur) paras.push(finishParagraph(cur))
    cur = null
  }
  for (const b of lineBlocks) {
    const line = b.line
    const text = lineText(line)
    if (!text) continue
    const lineBold = line.items.every((i) => i.bold)
    if (cur) {
      const prev = cur.lines[cur.lines.length - 1]
      const pitch = prev.y - line.y
      const width = cur.region.x1 - cur.region.x0
      const prevText = lineText(prev)
      const prevShort = prev.x1 < cur.region.x1 - Math.max(width * 0.15, bodySize * 3) && /[.:!?;)"”]$/.test(prevText)
      const indented = !line.rtl && line.x0 - cur.region.x0 > bodySize * 1.2 && prev.x0 - cur.region.x0 < bodySize * 0.6 && cur.lines.length > 1
      const breakHere =
        b.region !== cur.region ||
        pitch <= 0 ||
        pitch > Math.max(line.size, prev.size) * 1.6 ||
        Math.abs(line.size - prev.size) > 1.5 ||
        lineBold !== cur.bold ||
        BULLET_START.test(text) ||
        prevShort ||
        indented
      if (breakHere) flush()
    }
    if (!cur) cur = { lines: [], region: b.region, bold: lineBold }
    cur.lines.push(line)
  }
  flush()
  return paras
}

function finishParagraph(p) {
  const { lines, region } = p
  const size = Math.max(...lines.map((l) => l.size))
  const rtl = lines.filter((l) => l.rtl).length > lines.length / 2
  const W = region.x1 - region.x0
  const mid = (region.x0 + region.x1) / 2
  const tol = Math.max(2.5, size * 0.3)
  let align = rtl ? 'right' : 'left'
  const leftEq = lines.every((l) => Math.abs(l.x0 - lines[0].x0) < tol)
  const rightEq = (ls) => ls.every((l) => Math.abs(l.x1 - ls[0].x1) < tol)
  const centered = lines.every((l) => Math.abs((l.x0 + l.x1) / 2 - mid) < Math.max(tol, W * 0.02) && l.x0 > region.x0 + W * 0.08)
  if (centered) align = 'center'
  else if (lines.length >= 3 && leftEq && rightEq(lines.slice(0, -1)) && Math.abs(lines[0].x1 - region.x1) < tol * 2) align = 'justify'
  else if (rightEq(lines) && Math.abs(lines[0].x1 - region.x1) < tol && lines.every((l) => l.x0 > region.x0 + W * 0.25)) align = 'right'
  return { lines, align, size, rtl, region, bold: p.bold }
}

// Runs (styled spans) of a paragraph, joining lines with spaces and undoing
// end-of-line hyphenation ("com-" + "laboration").
export function paragraphRuns(lines) {
  const runs = []
  lines.forEach((line, li) => {
    const items = line.ordered ?? line.items
    let prev = null
    for (const it of items) {
      let text = it.text
      let sep = ''
      if (prev) {
        const gap = line.rtl ? prev.x - (it.x + it.width) : it.x - (prev.x + prev.width)
        if (gap > Math.min(prev.size, it.size) * 0.12) sep = ' '
      } else if (li > 0) {
        const last = runs[runs.length - 1]
        // line-end hyphen: "com-" + "laboration" joins, "Trace-" + "Monkey" keeps it
        if (last) last.text = last.text.replace(/\s+$/, '')
        text = text.replace(/^\s+/, '')
        if (last && /\p{Ll}-$/u.test(last.text) && /^\p{Ll}/u.test(text)) {
          last.text = last.text.slice(0, -1)
        } else if (!(last && /\p{L}-$/u.test(last.text))) sep = ' '
      }
      const last = runs[runs.length - 1]
      const same =
        last &&
        last.bold === it.bold &&
        last.italic === it.italic &&
        Math.abs(last.size - it.size) < 1 &&
        last.font === (it.font ?? '') &&
        last.color === (it.color ?? null)
      if (same) last.text += sep + text
      else {
        if (last && sep) last.text += sep
        runs.push({ text, bold: it.bold, italic: it.italic, size: it.size, font: it.font ?? '', color: it.color ?? null })
      }
      prev = it
    }
  })
  for (const r of runs) r.text = r.text.replace(/\s+/g, ' ')
  if (runs.length) {
    runs[0].text = runs[0].text.replace(/^\s+/, '')
    runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '')
  }
  return runs.filter((r) => r.text)
}

export const runsText = (runs) => runs.map((r) => r.text).join('')

// ---------- repeating header / footer bands ----------
// Lines in the top or bottom band of the page whose text (digits ignored)
// repeats at about the same height on many pages. Returns, per page, the set
// of items to skip plus the header / footer text samples.
export function detectFurniture(pages) {
  const result = pages.map(() => ({ skip: new Set(), header: [], footer: [] }))
  if (pages.length < 3) return result
  const cands = pages.map((page, pi) => {
    const h = page.height
    const y0 = page.view?.y0 ?? 0
    const lines = buildLines(page.items)
    return lines
      .map((l) => {
        const rel = (l.y - y0) / h
        const band = rel > 0.9 ? 'header' : rel < 0.08 ? 'footer' : null
        if (!band) return null
        const text = lineText(l)
        const key = `${band}|${text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()}`
        return { band, key, line: l, text, pi, y: l.y - y0 }
      })
      .filter(Boolean)
  })
  const counts = new Map()
  for (const list of cands) {
    for (const k of new Set(list.map((c) => c.key))) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const need = Math.max(3, Math.ceil(pages.length * 0.4))
  for (const list of cands) {
    for (const c of list) {
      if ((counts.get(c.key) ?? 0) < need) continue
      // the same key must sit at about the same height on most pages
      const ys = cands.flat().filter((o) => o.key === c.key).map((o) => o.y)
      const my = median(ys)
      if (Math.abs(c.y - my) > 12) continue
      const r = result[c.pi]
      c.line.items.forEach((it) => r.skip.add(it))
      r[c.band].push({ text: c.text, x0: c.line.x0, x1: c.line.x1, line: c.line, key: c.key })
    }
  }
  return result
}

// Header / footer text with the page number swapped for a marker: compares
// the same key across pages and finds the digit run that changes.
export function furnitureTemplate(samplesByPage) {
  const first = samplesByPage.find((s) => s)
  if (!first) return null
  const other = samplesByPage.find((s) => s && s.text !== first.text)
  if (!other) return { parts: [first.text] }
  const da = first.text.split(/(\d+)/)
  const db = other.text.split(/(\d+)/)
  if (da.length !== db.length) return { parts: [first.text] }
  const parts = []
  let swapped = false
  for (let i = 0; i < da.length; i++) {
    if (i % 2 === 1 && da[i] !== db[i] && !swapped) {
      parts.push({ page: true })
      swapped = true
    } else parts.push(da[i])
  }
  return { parts }
}

// ---------- exact layout frames ----------
// Line segments (label / value pairs split apart) grouped into stacked
// paragraph frames: same left edge, same size, line pitch under 1.5 em.
export function buildFrames(lines) {
  const segs = []
  for (const line of lines) {
    for (const s of lineSegments(line, Math.max(12, line.size * 1.5))) {
      const sub = subLine(line, s.items)
      segs.push(sub)
    }
  }
  segs.sort((a, b) => b.y - a.y || a.x0 - b.x0)
  const frames = []
  let open = []
  for (const s of segs) {
    open = open.filter((f) => f.last.y - s.y < f.size * 3)
    const f = open.find((fr) => {
      const pitch = fr.last.y - s.y
      return (
        pitch > s.size * 0.5 &&
        pitch <= Math.max(s.size, fr.size) * 1.5 &&
        Math.abs(fr.size - s.size) < 1 &&
        Math.abs(fr.last.x0 - s.x0) < 2.5 &&
        !fr.closedBelow
      )
    })
    if (f) {
      f.lines.push(s)
      f.last = s
    } else {
      const fr = { lines: [s], last: s, size: s.size }
      frames.push(fr)
      open.push(fr)
    }
  }
  return frames.map((f) => ({
    lines: f.lines,
    x0: Math.min(...f.lines.map((l) => l.x0)),
    x1: Math.max(...f.lines.map((l) => l.x1)),
    top: f.lines[0].y + f.lines[0].size * 0.85,
    bottom: f.lines[f.lines.length - 1].y - f.lines[f.lines.length - 1].size * 0.25,
    size: f.size,
    pitch: f.lines.length > 1 ? (f.lines[0].y - f.lines[f.lines.length - 1].y) / (f.lines.length - 1) : f.size * 1.2,
    rtl: f.lines.some((l) => l.rtl),
  }))
}

export function bodyFontSize(pages) {
  const sizes = []
  for (const p of pages) for (const it of p.items) sizes.push(it.size)
  return median(sizes) || 10
}
