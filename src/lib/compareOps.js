// PDF comparison over the whole document (Myers, O(ND), linear space): first
// the pages, then the words of the regions that differ, mapped back to pages.
// So an inserted page shows up as one new page instead of making every later
// page "changed", and dense pages are no special case. Word boxes are in view space (points from the top-left of
// the page as displayed) for highlighting.

// ---------- words ----------
const norm = (s) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

// Words of every page: { pages: [{ width, height, words: [{ text, norm, x, y, w, h }] }] }
export async function extractWords(bytes, onPage) {
  // loaded here so the diff itself also runs in Node tests
  const { openPdfDocument, serializedPdfOp, pdfjsLib } = await import('./pdfText.js')
  return serializedPdfOp(async () => {
    const doc = await openPdfDocument(bytes)
    const pages = []
    for (let n = 1; n <= doc.numPages; n++) {
      onPage?.(n, doc.numPages)
      const page = await doc.getPage(n)
      try {
        const vp = page.getViewport({ scale: 1 })
        const tc = await page.getTextContent()
        const words = []
        for (const it of tc.items) {
          const str = it.str ?? ''
          if (!str.trim()) continue
          const t = pdfjsLib.Util.transform(vp.transform, it.transform)
          const size = Math.hypot(t[2], t[3]) || Math.abs(it.height) || 10
          const len = Math.hypot(t[0], t[1]) || 1
          const ux = t[0] / len
          const uy = t[1] / len
          const total = Math.max(1, str.length)
          const width = it.width || size * 0.5 * total
          for (const m of str.matchAll(/\S+/g)) {
            const key = norm(m[0])
            if (!key) continue
            const from = (m.index / total) * width
            const to = ((m.index + m[0].length) / total) * width
            // the word's rectangle along the text direction, as an upright box
            const pts = [
              [from, 0],
              [to, 0],
              [from, size],
              [to, size],
            ].map(([a, b]) => [t[4] + a * ux + b * uy, t[5] + a * uy - b * ux])
            const xs = pts.map((p) => p[0])
            const ys = pts.map((p) => p[1])
            const x = Math.min(...xs)
            const y = Math.min(...ys)
            words.push({ text: m[0], norm: key, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y })
          }
        }
        pages.push({ width: vp.width, height: vp.height, words })
      } finally {
        page.cleanup()
      }
    }
    return pages
  })
}

// ---------- Myers diff (linear space, as in diff-match-patch's bisect) ----------
// a, b: Int32Array of word ids. Calls out(kind, aFrom, aTo, bFrom, bTo) with
// kind 'same' | 'removed' | 'added' in order. Past the deadline, what is left
// is reported as removed + added (marked approximate).
function myers(a, b, out, deadline, state) {
  const run = (aLo, aHi, bLo, bHi) => {
    // common prefix / suffix
    let p = 0
    while (aLo + p < aHi && bLo + p < bHi && a[aLo + p] === b[bLo + p]) p++
    if (p) out('same', aLo, aLo + p, bLo, bLo + p)
    aLo += p
    bLo += p
    let s = 0
    while (aHi - s > aLo && bHi - s > bLo && a[aHi - 1 - s] === b[bHi - 1 - s]) s++
    const tail = s ? [aHi - s, aHi, bHi - s, bHi] : null
    aHi -= s
    bHi -= s
    if (aLo === aHi) {
      if (bLo < bHi) out('added', aLo, aLo, bLo, bHi)
    } else if (bLo === bHi) {
      out('removed', aLo, aHi, bLo, bLo)
    } else {
      const split = Date.now() > deadline ? null : bisect(aLo, aHi, bLo, bHi)
      if (split) {
        run(aLo, split[0], bLo, split[1])
        run(split[0], aHi, split[1], bHi)
      } else {
        if (Date.now() > deadline) state.approximate = true
        out('removed', aLo, aHi, bLo, bLo)
        out('added', aHi, aHi, bLo, bHi)
      }
    }
    if (tail) out('same', ...tail)
  }

  // Finds the middle snake of a[aLo:aHi] vs b[bLo:bHi]; returns [x, y] in
  // absolute positions, or null when nothing matches.
  const bisect = (aLo, aHi, bLo, bHi) => {
    const n = aHi - aLo
    const m = bHi - bLo
    const maxD = Math.ceil((n + m) / 2)
    const off = maxD
    const len = 2 * maxD + 2
    const v1 = new Int32Array(len).fill(-1)
    const v2 = new Int32Array(len).fill(-1)
    v1[off + 1] = 0
    v2[off + 1] = 0
    const delta = n - m
    const front = delta % 2 !== 0
    let k1start = 0
    let k1end = 0
    let k2start = 0
    let k2end = 0
    for (let d = 0; d < maxD; d++) {
      if ((d & 63) === 0 && Date.now() > deadline) return null
      for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
        const k1o = off + k1
        let x1 = k1 === -d || (k1 !== d && v1[k1o - 1] < v1[k1o + 1]) ? v1[k1o + 1] : v1[k1o - 1] + 1
        let y1 = x1 - k1
        while (x1 < n && y1 < m && a[aLo + x1] === b[bLo + y1]) {
          x1++
          y1++
        }
        v1[k1o] = x1
        if (x1 > n) k1end += 2
        else if (y1 > m) k1start += 2
        else if (front) {
          const k2o = off + delta - k1
          if (k2o >= 0 && k2o < len && v2[k2o] !== -1 && x1 >= n - v2[k2o]) return [aLo + x1, bLo + y1]
        }
      }
      for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
        const k2o = off + k2
        let x2 = k2 === -d || (k2 !== d && v2[k2o - 1] < v2[k2o + 1]) ? v2[k2o + 1] : v2[k2o - 1] + 1
        let y2 = x2 - k2
        while (x2 < n && y2 < m && a[aHi - 1 - x2] === b[bHi - 1 - y2]) {
          x2++
          y2++
        }
        v2[k2o] = x2
        if (x2 > n) k2end += 2
        else if (y2 > m) k2start += 2
        else if (!front) {
          const k1o = off + delta - k2
          if (k1o >= 0 && k1o < len && v1[k1o] !== -1) {
            const x1 = v1[k1o]
            const y1 = off + x1 - k1o
            if (x1 >= n - x2) return [aLo + x1, bLo + y1]
          }
        }
      }
    }
    return null
  }

  run(0, a.length, 0, b.length)
}

// Exported for tests: diff of two token arrays as [{ kind, a: [from, to], b: [from, to] }].
export function diffTokens(ta, tb, { timeoutMs = 20_000 } = {}) {
  const ids = new Map()
  const id = (t) => {
    let v = ids.get(t)
    if (v === undefined) ids.set(t, (v = ids.size))
    return v
  }
  const a = Int32Array.from(ta, id)
  const b = Int32Array.from(tb, id)
  const ops = []
  const state = { approximate: false }
  myers(a, b, (kind, a0, a1, b0, b1) => ops.push({ kind, a: [a0, a1], b: [b0, b1] }), Date.now() + timeoutMs, state)
  return { ops, approximate: state.approximate }
}


// ---------- pixel overlay ----------
// Two RGBA images of the same size (ImageData.data). Pixels whose colour
// differs by more than `threshold` (share of the full range, summed over R, G
// and B) turn red in `out`; the rest show the changed page faded to grey.
// Returns the share of pixels that differ.
export function diffPixels(a, b, out = null, { threshold = 0.1 } = {}) {
  const limit = threshold * 765
  let diff = 0
  for (let i = 0; i < b.length; i += 4) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    if (d > limit) {
      diff++
      if (out) {
        out[i] = 230
        out[i + 1] = 40
        out[i + 2] = 40
        out[i + 3] = 255
      }
    } else if (out) {
      const g = 255 - (255 - (b[i] * 0.3 + b[i + 1] * 0.59 + b[i + 2] * 0.11)) * 0.35
      out[i] = out[i + 1] = out[i + 2] = g
      out[i + 3] = 255
    }
  }
  return diff / (b.length / 4)
}

// ---------- page alignment ----------
// Pairs the pages of one changed region (A pages aFrom..aTo, B pages
// bFrom..bTo, 1-based, inclusive) in order. A page of B goes with the page of
// A most of its unchanged words come from; a page of B whose words are all
// new is an inserted page, unless the next page of A is also all new (then
// the two are one changed page).
function alignRegion(aFrom, aTo, bFrom, bTo, matchA, matchB) {
  const aUsed = new Set()
  for (let j = bFrom; j <= bTo; j++) for (const p of matchB[j].keys()) aUsed.add(p)
  for (let i = aFrom; i <= aTo; i++) if (matchA[i] > 0) aUsed.add(i)
  const pairs = []
  let lastA = aFrom - 1
  for (let j = bFrom; j <= bTo; j++) {
    let best = 0
    let bestN = 0
    for (const [p, k] of matchB[j]) if (p > lastA && p <= aTo && k > bestN) [best, bestN] = [p, k]
    if (best) {
      for (let i = lastA + 1; i < best; i++) pairs.push({ a: i, b: null })
      pairs.push({ a: best, b: j })
      lastA = best
    } else if (lastA + 1 <= aTo && !aUsed.has(lastA + 1)) {
      pairs.push({ a: lastA + 1, b: j })
      lastA++
    } else {
      pairs.push({ a: null, b: j })
    }
  }
  for (let i = lastA + 1; i <= aTo; i++) pairs.push({ a: i, b: null })
  return pairs
}

const pick = (w) => ({ text: w.text, x: w.x, y: w.y, w: w.w, h: w.h })

// Two levels: pages with exactly the same words are matched first (a page
// diff), so unchanged pages anchor the result and an inserted or removed
// page cannot pull its neighbours into the change. Only the regions between
// those anchors get the word diff.
// onProgress(label) or onProgress(done, total, label)
export async function comparePdfs(bytesA, bytesB, onProgress = () => {}, { timeoutMs = 20_000 } = {}) {
  const say = (done, total, label) => (onProgress.length >= 2 ? onProgress(done, total, label) : onProgress(label))
  const pagesA = await extractWords(bytesA, (n, t) => say(n, t * 2, `Reading the original, page ${n} of ${t}`))
  const pagesB = await extractWords(bytesB, (n, t) => say(t + n, t * 2, `Reading the changed version, page ${n} of ${t}`))
  say(1, 1, 'Comparing words')
  return diffPages(pagesA, pagesB, { timeoutMs })
}

// The diff on extracted words (extractWords output), pure: runs in the jobs
// worker so a long diff never freezes the page and Cancel stops it.
export function diffPages(pagesA, pagesB, { timeoutMs = 20_000 } = {}) {
  const nA = pagesA.length
  const nB = pagesB.length
  const key = (p) => p.words.map((w) => w.norm).join(' ')
  const pageOps = diffTokens(pagesA.map(key), pagesB.map(key), { timeoutMs }).ops

  const removedOn = Array.from({ length: nA + 1 }, () => [])
  const addedOn = Array.from({ length: nB + 1 }, () => [])
  const matchA = new Array(nA + 1).fill(0)
  const matchB = Array.from({ length: nB + 1 }, () => new Map())
  const changes = []
  const pairs = []
  let added = 0
  let removed = 0
  let approximate = false
  const deadline = Date.now() + timeoutMs
  const words = (pages, from, to) => {
    const out = []
    for (let n = from; n <= to; n++) for (const w of pages[n - 1].words) out.push({ ...w, page: n })
    return out
  }

  for (let i = 0; i < pageOps.length; ) {
    const op = pageOps[i]
    if (op.kind === 'same') {
      for (let k = 0; k < op.a[1] - op.a[0]; k++) pairs.push({ a: op.a[0] + k + 1, b: op.b[0] + k + 1 })
      i++
      continue
    }
    // one changed region: consecutive removed / added page runs
    const a0 = op.a[0]
    const b0 = op.b[0]
    let a1 = op.a[1]
    let b1 = op.b[1]
    for (i++; i < pageOps.length && pageOps[i].kind !== 'same'; i++) {
      a1 = pageOps[i].a[1]
      b1 = pageOps[i].b[1]
    }
    const wa = words(pagesA, a0 + 1, a1)
    const wb = words(pagesB, b0 + 1, b1)
    const res = diffTokens(
      wa.map((w) => w.norm),
      wb.map((w) => w.norm),
      { timeoutMs: Math.max(0, deadline - Date.now()) },
    )
    approximate ||= res.approximate
    for (const o of res.ops) {
      if (o.kind === 'same') {
        for (let k = 0; k < o.a[1] - o.a[0]; k++) {
          const x = wa[o.a[0] + k]
          const y = wb[o.b[0] + k]
          matchA[x.page]++
          const m = matchB[y.page]
          m.set(x.page, (m.get(x.page) ?? 0) + 1)
        }
        continue
      }
      const gone = wa.slice(o.a[0], o.a[1])
      const fresh = wb.slice(o.b[0], o.b[1])
      for (const w of gone) removedOn[w.page].push(pick(w))
      for (const w of fresh) addedOn[w.page].push(pick(w))
      removed += gone.length
      added += fresh.length
      // a removal right before an addition reads as one replacement
      const prev = changes[changes.length - 1]
      if (o.kind === 'added' && prev?.kind === 'removed' && prev.region === a0 && prev.aEnd === o.a[0]) {
        prev.kind = 'changed'
        prev.added = fresh.map((w) => w.text).join(' ')
        prev.bPage = fresh[0]?.page ?? null
      } else if (changes.length < 5000) {
        changes.push({
          kind: o.kind,
          region: a0,
          aEnd: o.a[1],
          aPage: gone[0]?.page ?? wa[o.a[0]]?.page ?? (a1 > a0 ? a0 + 1 : null),
          bPage: fresh[0]?.page ?? wb[o.b[0]]?.page ?? (b1 > b0 ? b0 + 1 : null),
          removed: gone.map((w) => w.text).join(' '),
          added: fresh.map((w) => w.text).join(' '),
        })
      }
    }
    pairs.push(...alignRegion(a0 + 1, a1, b0 + 1, b1, matchA, matchB))
  }

  const pages = pairs.map((p, index) => {
    const A = p.a ? pagesA[p.a - 1] : null
    const B = p.b ? pagesB[p.b - 1] : null
    return {
      index,
      aPage: p.a,
      bPage: p.b,
      onlyInA: !B,
      onlyInB: !A,
      added: p.b ? addedOn[p.b].length : 0,
      removed: p.a ? removedOn[p.a].length : 0,
      removedBoxes: p.a ? removedOn[p.a] : [],
      addedBoxes: p.b ? addedOn[p.b] : [],
      sizeA: A ? { w: A.width, h: A.height } : null,
      sizeB: B ? { w: B.width, h: B.height } : null,
    }
  })
  // an empty page on one side only (no words at all) is still a difference
  const identical = added + removed === 0 && pages.every((p) => !p.onlyInA && !p.onlyInB)
  return {
    pages,
    pairs: pairs.map((p) => [p.a, p.b]),
    changes: changes.map(({ aEnd, region, ...c }) => c),
    added,
    removed,
    identical,
    approximate,
    pageCountA: nA,
    pageCountB: nB,
  }
}
