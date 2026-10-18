// Watermark, page numbers, crop, and signature placement: all pdf-lib.
// Positions are worked out on the visible page (pageFrame.js), so rotated
// pages and offset CropBox/MediaBox origins land where the user sees them.
import { StandardFonts, rgb } from 'pdf-lib'
import { loadPdf } from './pdfOps.js'
import { pageFrame, placeAt, placeBox, viewRectToUser } from './pageFrame.js'
import { layoutText, runsWidth, runsHeight, drawRuns } from './fonts.js'

function parseColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return rgb(0.7, 0.1, 0.1)
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

// 9-grid position -> top-left (view space, y down) of a w x h box on a page.
function positionOn(pageW, pageH, w, h, position, margin = 36) {
  const xs = {
    left: margin,
    center: (pageW - w) / 2,
    right: pageW - w - margin,
  }
  const ys = {
    top: margin,
    middle: (pageH - h) / 2,
    bottom: pageH - h - margin,
  }
  const [v, hz] = position.split('-') // e.g. "bottom-center", "middle-center"
  return { x: xs[hz] ?? xs.center, y: ys[v] ?? ys.middle }
}

// Text watermark stamped on every listed page (null = all pages).
// opts: { text, fontSize, color, opacity, rotate, position ('tile'|9-grid), pages }
export async function watermarkText(bytes, opts) {
  const {
    text,
    fontSize = 48,
    color = '#d92d20',
    opacity = 0.25,
    rotate = 45,
    position = 'middle-center',
    pages = null,
  } = opts
  if (!text?.trim()) throw new Error('Watermark text is empty.')
  const doc = await loadPdf(bytes)
  const runs = await layoutText(doc, text, { standard: StandardFonts.HelveticaBold })
  const targets = pages ? new Set(pages) : null
  const textW = runsWidth(runs, fontSize)
  const textH = runsHeight(runs, fontSize)
  const t = (rotate * Math.PI) / 180
  // size of the turned text's bounding box, for edge positions and tiling
  const boxW = Math.abs(textW * Math.cos(t)) + Math.abs(textH * Math.sin(t))
  const boxH = Math.abs(textW * Math.sin(t)) + Math.abs(textH * Math.cos(t))
  const fill = parseColor(color)
  doc.getPages().forEach((page, i) => {
    if (targets && !targets.has(i + 1)) return
    const frame = pageFrame(page)
    // turns around the text centre, so any angle stays centred on (cx, cy)
    const drawCentred = (cx, cy) => {
      const at = placeAt(frame, cx, cy, textW / 2, textH / 2, rotate)
      drawRuns(page, runs, { x: at.x, y: at.y, size: fontSize, rotate: at.rotate, color: fill, opacity })
    }
    if (position === 'tile') {
      const stepX = boxW + 80
      const stepY = boxH + 80
      for (let cy = stepY / 2; cy < frame.height + stepY / 2; cy += stepY) {
        for (let cx = stepX / 2; cx < frame.width + stepX / 2; cx += stepX) drawCentred(cx, cy)
      }
    } else {
      const { x, y } = positionOn(frame.width, frame.height, boxW, boxH, position)
      drawCentred(x + boxW / 2, y + boxH / 2)
    }
  })
  return doc.save()
}

// Image watermark (e.g. a logo). imageBytes must be JPEG or PNG (normalized).
export async function watermarkImage(bytes, imageBytes, imageType, opts) {
  const { opacity = 0.35, widthPct = 30, position = 'middle-center', pages = null } = opts
  const doc = await loadPdf(bytes)
  const img =
    imageType === 'jpeg' ? await doc.embedJpg(imageBytes) : await doc.embedPng(imageBytes)
  const targets = pages ? new Set(pages) : null
  doc.getPages().forEach((page, i) => {
    if (targets && !targets.has(i + 1)) return
    const frame = pageFrame(page)
    const w = (frame.width * widthPct) / 100
    const h = (w / img.width) * img.height
    const { x, y } = positionOn(frame.width, frame.height, w, h, position)
    page.drawImage(img, { ...placeBox(frame, x, y, w, h), width: w, height: h, opacity })
  })
  return doc.save()
}

export const MARGINS = { small: 16, recommended: 28, big: 48 }

// The label for one page. Tokens: {n} this number, {p} (or {total}) the last
// number. Bates numbering zero-pads {n} behind a fixed prefix.
export function pageLabel({ template = '{n}', bates = null }, n, last) {
  if (bates) return `${bates.prefix ?? ''}${String(n).padStart(Math.max(1, bates.digits ?? 6), '0')}${bates.suffix ?? ''}`
  return String(template).replaceAll('{n}', n).replaceAll('{p}', last).replaceAll('{total}', last)
}

const mirror = (position) =>
  position.endsWith('-left') ? position.replace('-left', '-right') : position.endsWith('-right') ? position.replace('-right', '-left') : position

// Page numbers on the visible page.
// opts: { template ('{n}', 'Page {n} of {p}', any text), format (older:
//   'n' | 'page-n' | 'n-of-total'), position (9-grid), fontSize, color,
//   opacity, start (first number), skip (first N pages get no number),
//   margin (points or small/recommended/big), facing (left/right positions
//   mirror on even pages), bates ({ prefix, digits, suffix }), pages (list) }
export async function addPageNumbers(bytes, opts) {
  const {
    format = 'n',
    position = 'bottom-center',
    fontSize = 11,
    color = '#1c2333',
    opacity = 1,
    start = 1,
    skip = 0,
    margin = 28,
    facing = false,
    bates = null,
    pages = null,
    check = null,
  } = opts
  const template =
    opts.template ?? (format === 'page-n' ? 'Page {n}' : format === 'n-of-total' ? '{n} of {p}' : '{n}')
  const marginPt = typeof margin === 'number' ? margin : (MARGINS[margin] ?? MARGINS.recommended)
  const doc = await loadPdf(bytes)
  const list = doc.getPages()
  const targets = pages ? new Set(pages) : null
  const numbered = list.map((_, i) => i).filter((i) => i >= skip && (!targets || targets.has(i + 1)))
  if (numbered.length === 0) throw new Error('No pages left to number. Check the skip and page settings.')
  const first = Number.isFinite(start) ? start : 1
  const last = first + numbered.length - 1
  const fill = parseColor(color)
  for (const [k, i] of numbered.entries()) {
    check?.()
    const page = list[i]
    const label = pageLabel({ template, bates }, first + k, last)
    if (!label.trim()) continue
    const runs = await layoutText(doc, label)
    const w = runsWidth(runs, fontSize)
    const h = runsHeight(runs, fontSize)
    const frame = pageFrame(page)
    // facing pages: page 1 is a right-hand page, so even pages are left-hand
    const where = facing && (i + 1) % 2 === 0 ? mirror(position) : position
    const { x, y } = positionOn(frame.width, frame.height, w, h, where, marginPt)
    // baseline sits on the bottom edge of the label box
    const at = placeAt(frame, x, y + h)
    drawRuns(page, runs, { x: at.x, y: at.y, size: fontSize, rotate: at.rotate, color: fill, opacity })
  }
  return doc.save()
}

// Crop to a box on the visible page, measured from its top-left as shown:
//   { fx, fy, fw, fh }  fractions of each page's visible frame (preferred,
//                       works across mixed page sizes)
//   { x, y, w, h }      points on the visible page
// Applied as the CropBox of every listed page (null = all). Rotated pages and
// offset boxes are converted per page.
export async function cropPdf(bytes, box, pages = null) {
  const frac = box && 'fw' in box
  if (frac ? !(box.fw > 0 && box.fh > 0) : box.w < 10 || box.h < 10) throw new Error('Crop area is too small.')
  const doc = await loadPdf(bytes)
  const targets = pages ? new Set(pages) : null
  doc.getPages().forEach((page, i) => {
    if (targets && !targets.has(i + 1)) return
    const frame = pageFrame(page)
    let { x, y, w, h } = frac
      ? { x: box.fx * frame.width, y: box.fy * frame.height, w: box.fw * frame.width, h: box.fh * frame.height }
      : box
    // keep the box on the visible page
    x = Math.min(Math.max(0, x), frame.width)
    y = Math.min(Math.max(0, y), frame.height)
    w = Math.min(w, frame.width - x)
    h = Math.min(h, frame.height - y)
    if (w < 1 || h < 1) throw new Error(`Crop area falls outside page ${i + 1}.`)
    const r = viewRectToUser(frame, x, y, w, h)
    page.setCropBox(r.x, r.y, r.width, r.height)
  })
  return doc.save()
}

// Places stamps (signature or initials images, or text such as a date) on the
// visible page, each centred on a point given in fractions of the page from
// its top-left, drawn upright as the page is displayed.
// items: [{ png (PNG bytes) | text, pages: number[] | 'all', fx, fy,
//           widthPct (images, % of page width), size, color (text) }]
export async function stampItems(bytes, items, { check = null } = {}) {
  const doc = await loadPdf(bytes)
  const count = doc.getPageCount()
  const images = new Map()
  let placed = 0
  for (const item of items) {
    const pages = item.pages === 'all' ? Array.from({ length: count }, (_, i) => i + 1) : (item.pages ?? [])
    let img = null
    let runs = null
    if (item.png) {
      if (!images.has(item.png)) images.set(item.png, await doc.embedPng(item.png))
      img = images.get(item.png)
    } else if (item.text?.trim()) {
      runs = await layoutText(doc, item.text)
    } else continue
    for (const n of pages) {
      check?.()
      if (n < 1 || n > count) throw new Error(`Page ${n} does not exist.`)
      const page = doc.getPage(n - 1)
      const frame = pageFrame(page)
      const cx = item.fx * frame.width
      const cy = item.fy * frame.height
      if (img) {
        const w = (frame.width * (item.widthPct ?? 25)) / 100
        const h = (w / img.width) * img.height
        page.drawImage(img, { ...placeBox(frame, cx - w / 2, cy - h / 2, w, h), width: w, height: h })
      } else {
        const size = item.size ?? 12
        const w = runsWidth(runs, size)
        const h = runsHeight(runs, size)
        const at = placeAt(frame, cx - w / 2, cy + h / 2)
        drawRuns(page, runs, { x: at.x, y: at.y, size, rotate: at.rotate, color: parseColor(item.color ?? '#101828') })
      }
      placed++
    }
  }
  if (placed === 0) throw new Error('Place at least one signature, initials or date on a page.')
  return doc.save()
}

// One signature image on one page (older call shape).
export function signPdf(bytes, pngBytes, { pageNum, fx, fy, widthPct = 25 }) {
  return stampItems(bytes, [{ png: pngBytes, pages: [pageNum], fx, fy, widthPct }])
}
