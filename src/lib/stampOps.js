// Watermark, page numbers, crop, and signature placement — all pdf-lib.
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import { loadPdf } from './pdfOps.js'

function parseColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return rgb(0.7, 0.1, 0.1)
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

// 9-grid position -> coordinates for an element of size (w, h) on a page.
function positionOn(pageW, pageH, w, h, position, margin = 36) {
  const xs = {
    left: margin,
    center: (pageW - w) / 2,
    right: pageW - w - margin,
  }
  const ys = {
    top: pageH - h - margin,
    middle: (pageH - h) / 2,
    bottom: margin,
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
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const targets = pages ? new Set(pages) : null
  const textW = font.widthOfTextAtSize(text, fontSize)
  const textH = font.heightAtSize(fontSize)
  doc.getPages().forEach((page, i) => {
    if (targets && !targets.has(i + 1)) return
    const { width, height } = page.getSize()
    const draw = (x, y) =>
      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: parseColor(color),
        opacity,
        rotate: degrees(rotate),
      })
    if (position === 'tile') {
      const stepX = textW + 120
      const stepY = textH + 140
      for (let y = -stepY; y < height + stepY; y += stepY) {
        for (let x = -stepX; x < width + stepX; x += stepX) {
          draw(x, y)
        }
      }
    } else {
      // Rotation happens around the text origin; recentre roughly for 45°.
      const { x, y } = positionOn(width, height, textW * Math.cos((rotate * Math.PI) / 180) || textW, textH, position)
      draw(rotate ? x + textH : x, y)
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
    const { width, height } = page.getSize()
    const w = (width * widthPct) / 100
    const h = (w / img.width) * img.height
    const { x, y } = positionOn(width, height, w, h, position)
    page.drawImage(img, { x, y, width: w, height: h, opacity })
  })
  return doc.save()
}

// Page numbers. format: 'n' | 'page-n' | 'n-of-total'; position: 9-grid.
export async function addPageNumbers(bytes, opts) {
  const {
    format = 'n',
    position = 'bottom-center',
    fontSize = 11,
    color = '#1c2333',
    start = 1,
    margin = 28,
    pages = null,
  } = opts
  const doc = await loadPdf(bytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const total = doc.getPageCount()
  const targets = pages ? new Set(pages) : null
  doc.getPages().forEach((page, i) => {
    if (targets && !targets.has(i + 1)) return
    const n = start + i
    const label =
      format === 'page-n' ? `Page ${n}` : format === 'n-of-total' ? `${n} of ${start + total - 1}` : `${n}`
    const w = font.widthOfTextAtSize(label, fontSize)
    const h = font.heightAtSize(fontSize)
    const { width, height } = page.getSize()
    const { x, y } = positionOn(width, height, w, h, position, margin)
    page.drawText(label, { x, y, size: fontSize, font, color: parseColor(color) })
  })
  return doc.save()
}

// Crop: box in PDF points measured from the TOP-LEFT of the unrotated page
// ({x, y, w, h}); applied as the CropBox of every listed page (null = all).
export async function cropPdf(bytes, box, pages = null) {
  const { x, y, w, h } = box
  if (w < 10 || h < 10) throw new Error('Crop area is too small.')
  const doc = await loadPdf(bytes)
  const targets = pages ? new Set(pages) : null
  doc.getPages().forEach((page, i) => {
    if (targets && !targets.has(i + 1)) return
    const { height } = page.getSize()
    // convert top-left origin to PDF's bottom-left origin
    page.setCropBox(x, height - y - h, w, h)
  })
  return doc.save()
}

// Places a signature image (PNG with transparency) on ONE page at a point
// given in fractions of the page size (from top-left), so UI clicks map 1:1.
export async function signPdf(bytes, pngBytes, { pageNum, fx, fy, widthPct = 25 }) {
  const doc = await loadPdf(bytes)
  if (pageNum < 1 || pageNum > doc.getPageCount()) throw new Error('That page does not exist.')
  const img = await doc.embedPng(pngBytes)
  const page = doc.getPage(pageNum - 1)
  const { width, height } = page.getSize()
  const w = (width * widthPct) / 100
  const h = (w / img.width) * img.height
  const x = fx * width - w / 2
  const y = height - fy * height - h / 2
  page.drawImage(img, { x, y, width: w, height: h })
  return doc.save()
}
