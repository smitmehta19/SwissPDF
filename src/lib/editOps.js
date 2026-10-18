// Free-form PDF editing: text, images, shapes, highlights and freehand ink
// drawn onto existing pages. All coordinates are points on the visible page
// as displayed (rotation and CropBox applied), y measured from the TOP,
// matching what the on-screen editor uses.
import { StandardFonts, rgb, degrees } from 'pdf-lib'
import { loadPdf } from './pdfOps.js'
import { pageFrame, placeAt, placeBox } from './pageFrame.js'
import { layoutText, drawRuns } from './fonts.js'

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
  const frames = new Map()
  const frameOf = (page) => {
    if (!frames.has(page)) frames.set(page, pageFrame(page))
    return frames.get(page)
  }

  for (const el of elements) {
    const page = doc.getPage(el.pageIndex)
    const frame = frameOf(page)
    const pt = (x, y) => frame.toUser(x, y)
    const color = toColor(el.color)
    switch (el.type) {
      case 'text': {
        const size = el.size ?? 14
        const runs = await layoutText(doc, el.text ?? '', { standard: FONTS[el.font] ?? StandardFonts.Helvetica })
        // el.y is the top of the text; the baseline sits one size below it
        const at = placeAt(frame, el.x, el.y, 0, size, el.rotate ?? 0)
        drawRuns(page, runs, { x: at.x, y: at.y, size, rotate: at.rotate, color })
        break
      }
      case 'rect':
        page.drawRectangle({
          ...placeBox(frame, el.x, el.y, el.w, el.h),
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
          ...pt(el.x + el.w / 2, el.y + el.h / 2),
          xScale: el.w / 2,
          yScale: el.h / 2,
          rotate: degrees(frame.rotation),
          borderColor: color,
          borderWidth: el.borderWidth ?? 1.5,
          color: el.fill ? toColor(el.fill) : undefined,
          opacity: el.fill ? (el.opacity ?? 1) : undefined,
          borderOpacity: el.opacity ?? 1,
        })
        break
      case 'line':
        page.drawLine({
          start: pt(el.x, el.y),
          end: pt(el.x2, el.y2),
          thickness: el.borderWidth ?? 2,
          color,
          opacity: el.opacity ?? 1,
        })
        break
      case 'highlight':
        page.drawRectangle({
          ...placeBox(frame, el.x, el.y, el.w, el.h),
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
            start: pt(a.x, a.y),
            end: pt(b.x, b.y),
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
          ...placeBox(frame, el.x, el.y, el.w, el.h),
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
