// The visible frame of a page: what a viewer actually shows. That is the
// CropBox clipped to the MediaBox (origins can be non-zero), turned by /Rotate.
// Tools work in "view" coordinates (points from the top-left of the page as the
// user sees it, the same space pdf.js renders); this module maps them to PDF
// user space and draws things upright on screen whatever the page rotation.
import { degrees } from 'pdf-lib'

function normBox(r) {
  if (!r) return null
  const vals = [r.x, r.y, r.x + r.width, r.y + r.height]
  if (vals.some((v) => !Number.isFinite(v))) return null
  return [Math.min(vals[0], vals[2]), Math.min(vals[1], vals[3]), Math.max(vals[0], vals[2]), Math.max(vals[1], vals[3])]
}

function readBox(fn) {
  try {
    return normBox(fn())
  } catch {
    return null
  }
}

// Same rule as pdf.js: multiples of 90 only, anything else counts as 0.
export function normRotation(angle) {
  const r = Number(angle) || 0
  if (r % 90 !== 0) return 0
  return ((r % 360) + 360) % 360
}

// frame = { x0, y0, x1, y1 (user space), rotation, width, height (as seen),
//           toUser(vx, vy), toView(x, y), fromFraction(fx, fy) }
export function pageFrame(page) {
  const media = readBox(() => page.getMediaBox()) ?? [0, 0, 612, 792]
  const crop = readBox(() => page.getCropBox())
  let box = media
  if (crop) {
    const c = [Math.max(crop[0], media[0]), Math.max(crop[1], media[1]), Math.min(crop[2], media[2]), Math.min(crop[3], media[3])]
    // an empty intersection falls back to the MediaBox, like pdf.js
    if (c[2] - c[0] > 0 && c[3] - c[1] > 0) box = c
  }
  const [x0, y0, x1, y1] = box
  const bw = x1 - x0
  const bh = y1 - y0
  let rotation = 0
  try {
    rotation = normRotation(page.getRotation().angle)
  } catch {
    /* malformed /Rotate: show it upright, like pdf.js */
  }
  const sideways = rotation === 90 || rotation === 270
  const width = sideways ? bh : bw
  const height = sideways ? bw : bh

  // view point (from the top-left as displayed) -> user space
  const toUser = (vx, vy) => {
    switch (rotation) {
      case 90:
        return { x: x0 + vy, y: y0 + vx }
      case 180:
        return { x: x1 - vx, y: y0 + vy }
      case 270:
        return { x: x1 - vy, y: y1 - vx }
      default:
        return { x: x0 + vx, y: y1 - vy }
    }
  }
  const toView = (x, y) => {
    switch (rotation) {
      case 90:
        return { x: y - y0, y: x - x0 }
      case 180:
        return { x: x1 - x, y: y - y0 }
      case 270:
        return { x: y1 - y, y: x1 - x }
      default:
        return { x: x - x0, y: y1 - y }
    }
  }

  return {
    x0,
    y0,
    x1,
    y1,
    rotation,
    width,
    height,
    toUser,
    toView,
    fromFraction: (fx, fy) => toUser(fx * width, fy * height),
  }
}

// Origin and rotation for pdf-lib's draw* calls so that an object appears
// rotated by `angle` degrees (counter-clockwise, as seen) with its local point
// (lx, ly) (x along the baseline, y up) at view point (vx, vy).
export function placeAt(frame, vx, vy, lx = 0, ly = 0, angle = 0) {
  const total = frame.rotation + angle
  const t = (total * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const p = frame.toUser(vx, vy)
  return { x: p.x - (lx * c - ly * s), y: p.y - (lx * s + ly * c), rotate: degrees(total) }
}

// Draw options for a box given by its top-left corner in view space.
export function placeBox(frame, vx, vy, w, h, angle = 0) {
  return placeAt(frame, vx, vy, 0, h, angle)
}

// User-space rectangle covering a view-space rectangle (for CropBox and
// widget rects, which are always axis-aligned in user space).
export function viewRectToUser(frame, vx, vy, w, h) {
  const a = frame.toUser(vx, vy)
  const b = frame.toUser(vx + w, vy + h)
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}

// The reverse: a user-space rectangle seen in view space ({ x, y, w, h }).
export function userRectToView(frame, r) {
  const a = frame.toView(r.x, r.y)
  const b = frame.toView(r.x + r.width, r.y + r.height)
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}

// Visible size of every page, for UIs that lay overlays on the rendered page.
export function viewSizes(doc) {
  return doc.getPages().map((p) => {
    const f = pageFrame(p)
    return { width: f.width, height: f.height }
  })
}
