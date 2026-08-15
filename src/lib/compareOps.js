// PDF comparison: word-level diff per page, with positions so changes can be
// highlighted on the rendered pages.
import { extractDocument, buildLines } from './pdfExtract.js'

// Words with their boxes, in reading order.
function pageWords(page) {
  const words = []
  for (const line of buildLines(page.items)) {
    for (const it of line.items) {
      for (const part of it.text.split(/\s+/).filter(Boolean)) {
        // approximate per-word x by splitting the item box proportionally
        const share = part.length / Math.max(1, it.text.replace(/\s/g, '').length)
        words.push({
          text: part,
          norm: part.toLowerCase().replace(/[^\w.,%-]/g, ''),
          x: it.x,
          y: it.y,
          w: it.width * share,
          h: it.size,
        })
      }
    }
  }
  return words
}

// Classic LCS diff over normalized words.
function diffWords(a, b) {
  const n = a.length
  const m = b.length
  // guard against pathological sizes
  if (n * m > 4_000_000) {
    return { ops: [{ type: 'too-large' }], added: 0, removed: 0 }
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].norm === b[j].norm ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  let added = 0
  let removed = 0
  while (i < n && j < m) {
    if (a[i].norm === b[j].norm) {
      ops.push({ type: 'same', a: a[i], b: b[j] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'removed', a: a[i] })
      removed++
      i++
    } else {
      ops.push({ type: 'added', b: b[j] })
      added++
      j++
    }
  }
  while (i < n) {
    ops.push({ type: 'removed', a: a[i++] })
    removed++
  }
  while (j < m) {
    ops.push({ type: 'added', b: b[j++] })
    added++
  }
  return { ops, added, removed }
}

export async function comparePdfs(bytesA, bytesB, onProgress = () => {}) {
  onProgress('reading both documents')
  const [pagesA, pagesB] = await Promise.all([extractDocument(bytesA), extractDocument(bytesB)])
  const pageCount = Math.max(pagesA.length, pagesB.length)
  const pages = []
  let totalAdded = 0
  let totalRemoved = 0
  for (let i = 0; i < pageCount; i++) {
    onProgress(`comparing page ${i + 1} of ${pageCount}`)
    const a = pagesA[i] ? pageWords(pagesA[i]) : []
    const b = pagesB[i] ? pageWords(pagesB[i]) : []
    const { ops, added, removed } = diffWords(a, b)
    totalAdded += added
    totalRemoved += removed
    pages.push({
      index: i,
      onlyInA: !pagesB[i],
      onlyInB: !pagesA[i],
      added,
      removed,
      removedBoxes: ops.filter((o) => o.type === 'removed').map((o) => o.a),
      addedBoxes: ops.filter((o) => o.type === 'added').map((o) => o.b),
      sizeA: pagesA[i] ? { w: pagesA[i].width, h: pagesA[i].height } : null,
      sizeB: pagesB[i] ? { w: pagesB[i].width, h: pagesB[i].height } : null,
      textA: ops.filter((o) => o.type !== 'added').map((o) => ({ type: o.type, text: o.a.text })),
      textB: ops.filter((o) => o.type !== 'removed').map((o) => ({ type: o.type, text: o.b.text })),
    })
  }
  return { pages, added: totalAdded, removed: totalRemoved, identical: totalAdded + totalRemoved === 0 }
}
