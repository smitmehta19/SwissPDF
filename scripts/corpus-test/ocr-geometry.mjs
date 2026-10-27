// Node check for OCR word placement: the invisible words OCR writes must sit
// where the same words are on the page as seen (pdf.js view space).
import { withPdfjs } from './validate.mjs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

// Text items of one page as { str, x, y } in view points (y from the top),
// with the view size.
export function viewItems(bytes, pageNum = 1) {
  return withPdfjs(bytes, async (doc) => {
    const p = await doc.getPage(pageNum)
    const vp = p.getViewport({ scale: 1 })
    const tc = await p.getTextContent()
    const items = []
    for (const it of tc.items) {
      if (!it.str?.trim()) continue
      const t = pdfjs.Util.transform(vp.transform, it.transform)
      items.push({ str: it.str, x: t[4], y: t[5], upright: t[0] > 0 && Math.abs(t[1]) < Math.abs(t[0]) * 0.2 })
    }
    p.cleanup()
    return { items, width: vp.width, height: vp.height }
  })
}

// Where a source view point lands in each scan variant (see scanVariants in
// page-harness-g2.js).
export function expectedPoint(variant, x, y, { W, H, skewDeg }) {
  if (variant === 'turned') return { x: H - y, y: x }
  if (variant === 'skew') {
    const r = (skewDeg * Math.PI) / 180
    const dx = x - W / 2
    const dy = y - H / 2
    return { x: W / 2 + dx * Math.cos(r) - dy * Math.sin(r), y: H / 2 + dx * Math.sin(r) + dy * Math.cos(r) }
  }
  return { x, y }
}

// First words of the source's text items (5+ letters) against the OCR words
// with the same text. Returns { checked, found, within, median, worst }.
export async function placement(srcBytes, ocrBytes, variant, geo, tol = 8) {
  const src = await viewItems(srcBytes)
  const ocr = await viewItems(ocrBytes)
  const byText = new Map()
  for (const it of ocr.items) {
    const k = it.str.trim()
    if (!byText.has(k)) byText.set(k, [])
    byText.get(k).push(it)
  }
  const dists = []
  let checked = 0
  for (const it of src.items) {
    if (!it.upright) continue
    const word = it.str.trim().split(/\s+/)[0]
    if (!/^[A-Za-z]{5,}$/.test(word)) continue
    checked++
    const want = expectedPoint(variant, it.x, it.y, geo)
    const cands = byText.get(word) ?? []
    if (!cands.length) continue
    dists.push(Math.min(...cands.map((c) => Math.hypot(c.x - want.x, c.y - want.y))))
  }
  dists.sort((a, b) => a - b)
  const within = dists.filter((d) => d <= tol).length
  return {
    checked,
    found: dists.length,
    within,
    median: dists.length ? dists[Math.floor(dists.length / 2)] : null,
    worst: dists.length ? dists[dists.length - 1] : null,
  }
}
