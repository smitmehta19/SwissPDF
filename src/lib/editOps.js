// Free-form PDF editing: text, images, shapes, highlights and freehand ink
// drawn onto existing pages. All coordinates are PDF points with y measured
// from the TOP of the page, matching what the on-screen editor uses.
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import { loadPdf } from './pdfOps.js'

function toColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return rgb(0.1, 0.1, 0.12)
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const FONTS = {
  helvetica: StandardFonts.Helvetica,
  'helvetica-bold': StandardFonts.HelveticaBold,
  times: StandardFonts.TimesRoman,
  courier: StandardFonts.Courier,
}

// elements: [{ id, type, pageIndex, ... }]
//   text      { x, y, text, size, color, font, rotate }
//   rect      { x, y, w, h, color, fill, borderWidth, opacity }
//   ellipse   { x, y, w, h, color, fill, borderWidth, opacity }
//   line      { x, y, x2, y2, color, borderWidth }
//   highlight { x, y, w, h, color, opacity }
//   ink       { points: [{x,y}], color, borderWidth }
//   image     { x, y, w, h, bytes, imgType: 'png'|'jpeg', opacity }
export async function applyEdits(bytes, elements) {
  const doc = await loadPdf(bytes)
  const fontCache = new Map()
  const getFont = async (key) => {
    const name = FONTS[key] ?? StandardFonts.Helvetica
    if (!fontCache.has(name)) fontCache.set(name, await doc.embedFont(name))
    return fontCache.get(name)
  }

  for (const el of elements) {
    const page = doc.getPage(el.pageIndex)
    const H = page.getHeight()
    const color = toColor(el.color)
    switch (el.type) {
      case 'text': {
        const font = await getFont(el.font)
        page.drawText(el.text ?? '', {
          x: el.x,
          y: H - el.y - (el.size ?? 14),
          size: el.size ?? 14,
          font,
          color,
          rotate: degrees(el.rotate ?? 0),
        })
        break
      }
      case 'rect':
        page.drawRectangle({
          x: el.x,
          y: H - el.y - el.h,
          width: el.w,
          height: el.h,
          borderColor: color,
          borderWidth: el.borderWidth ?? 1.5,
          color: el.fill ? toColor(el.fill) : undefined,
          opacity: el.fill ? (el.opacity ?? 1) : undefined,
          borderOpacity: el.opacity ?? 1,
        })
        break
      case 'ellipse':
        page.drawEllipse({
          x: el.x + el.w / 2,
          y: H - el.y - el.h / 2,
          xScale: el.w / 2,
          yScale: el.h / 2,
          borderColor: color,
          borderWidth: el.borderWidth ?? 1.5,
          color: el.fill ? toColor(el.fill) : undefined,
          opacity: el.fill ? (el.opacity ?? 1) : undefined,
          borderOpacity: el.opacity ?? 1,
        })
        break
      case 'line':
        page.drawLine({
          start: { x: el.x, y: H - el.y },
          end: { x: el.x2, y: H - el.y2 },
          thickness: el.borderWidth ?? 2,
          color,
          opacity: el.opacity ?? 1,
        })
        break
      case 'highlight':
        page.drawRectangle({
          x: el.x,
          y: H - el.y - el.h,
          width: el.w,
          height: el.h,
          color: toColor(el.color ?? '#ffe066'),
          opacity: el.opacity ?? 0.4,
        })
        break
      case 'ink': {
        // consecutive segments keep the stroke continuous at any zoom
        for (let i = 1; i < el.points.length; i++) {
          const a = el.points[i - 1]
          const b = el.points[i]
          page.drawLine({
            start: { x: a.x, y: H - a.y },
            end: { x: b.x, y: H - b.y },
            thickness: el.borderWidth ?? 2,
            color,
            opacity: el.opacity ?? 1,
          })
        }
        break
      }
      case 'image': {
        const img =
          el.imgType === 'jpeg' ? await doc.embedJpg(el.bytes) : await doc.embedPng(el.bytes)
        page.drawImage(img, {
          x: el.x,
          y: H - el.y - el.h,
          width: el.w,
          height: el.h,
          opacity: el.opacity ?? 1,
        })
        break
      }
      default:
        break
    }
  }
  return doc.save()
}

// Erase: paints an opaque white box over an area (removes what is visible).
// For true content destruction use the Redact tool instead.
export async function whiteOut(bytes, boxes) {
  return applyEdits(
    bytes,
    boxes.map((b) => ({ ...b, type: 'rect', color: '#ffffff', fill: '#ffffff', borderWidth: 0 })),
  )
}
