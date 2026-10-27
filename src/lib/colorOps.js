// Colour tools: adjust colours (contrast, brightness, saturation, R/G/B) and
// replace / invert colours.
// Most settings keep the page as it is (text, vectors, images) and add
// full-page rectangles with PDF blend modes on top, one per step. Viewers do
// the pixel maths, so text stays selectable and the file barely grows.
// Saturation above 100 has no blend-mode form: those pages are rendered,
// changed pixel by pixel and rebuilt as images (browser only).
// Each setting also has a per-pixel map (adjustMap / replaceMap) with the
// same maths, used by the image path and by the tests.
import { PDFDocument, PDFName, pushGraphicsState, popGraphicsState, setGraphicsState, setFillingRgbColor, rectangle, fill } from 'pdf-lib'
import { loadPdf } from './pdfOps.js'
import { pageFrame } from './pageFrame.js'

export const NEUTRAL = { contrast: 100, brightness: 100, saturation: 100, red: 100, green: 100, blue: 100 }

// Text / background pairs of the high contrast presets.
export const PRESETS = {
  'white-on-black': ['#ffffff', '#000000'],
  'black-on-white': ['#000000', '#ffffff'],
  'yellow-on-black': ['#ffff00', '#000000'],
  'green-on-black': ['#00ff00', '#000000'],
}

// High contrast presets also stretch the greys first: everything darker
// than LO becomes text, lighter than HI background (yellowed paper, grey scans).
const LO = 0.2
const HI = 0.8

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b

export function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''))
  if (!m) throw new Error(`Not a colour: ${hex}`)
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// ---------- steps ----------
// A step is one full-page rectangle: { bm, color: [r, g, b] (0-1), alpha }.
// Per channel, with x in 0-1:
//   Multiply   x * c
//   Screen     x + c - x * c
//   ColorDodge x / (1 - c), capped at 1
//   ColorBurn  1 - (1 - x) / c, floored at 0
//   Difference |x - c|
//   Saturation (grey c) the luminosity grey of the pixel; with alpha a the
//              mix (1 - a) * x + a * grey
const step = (bm, color, alpha = 1) => ({ bm, color: Array.isArray(color) ? color : [color, color, color], alpha })

// x * k per channel, capped at 1 (k >= 0).
function scaleSteps(k) {
  const out = []
  if (k.some((v) => v < 1)) out.push(step('Multiply', k.map((v) => Math.min(v, 1))))
  if (k.some((v) => v > 1)) out.push(step('ColorDodge', k.map((v) => (v > 1 ? 1 - 1 / v : 0))))
  return out
}

// a + b * x (clipped), for a line through the unit square: used for contrast
// and for the grey stretch.
function lineSteps(a, b) {
  if (b <= 1) {
    // Screen(Multiply(x, m), s) = s + m (1 - s) x
    const s = clamp(a)
    const m = s < 1 ? b / (1 - s) : 0
    return [step('Multiply', m), step('Screen', s)]
  }
  // Burn(Dodge(x, 1 - 1/d), 1/k) = k d x - (k - 1): k d = b, k - 1 = -a
  const k = 1 - a
  const d = b / k
  return [step('ColorDodge', 1 - 1 / d), step('ColorBurn', 1 / k)]
}

// Adjust colours. o: contrast, brightness, saturation, red, green, blue (0-200,
// 100 = unchanged). Returns the steps, or null when saturation is above 100.
export function adjustSteps(o) {
  const v = { ...NEUTRAL, ...o }
  if (v.saturation > 100) return null
  const out = []
  const c = v.contrast / 100
  if (c !== 1) out.push(...lineSteps(0.5 * (1 - c), c))
  if (v.brightness !== 100) out.push(...scaleSteps([v.brightness / 100, v.brightness / 100, v.brightness / 100]))
  if (v.saturation < 100) out.push(step('Saturation', 0.5, 1 - v.saturation / 100))
  if (v.red !== 100 || v.green !== 100 || v.blue !== 100) out.push(...scaleSteps([v.red / 100, v.green / 100, v.blue / 100]))
  return out
}

// Per-pixel map of adjustSteps (0-255 in and out). Saturation above 100
// pushes colours away from their grey.
export function adjustMap(o) {
  const v = { ...NEUTRAL, ...o }
  const c = v.contrast / 100
  const br = v.brightness / 100
  const s = v.saturation / 100
  const k = [v.red / 100, v.green / 100, v.blue / 100]
  return (r8, g8, b8) => {
    let p = [r8 / 255, g8 / 255, b8 / 255]
    if (c !== 1) p = p.map((x) => clamp((x - 0.5) * c + 0.5))
    if (br !== 1) p = p.map((x) => clamp(x * br))
    if (s !== 1) {
      const l = lum(...p)
      p = p.map((x) => clamp(l + (x - l) * s))
    }
    p = p.map((x, i) => clamp(x * k[i]))
    return p.map((x) => Math.round(x * 255))
  }
}

// Text and background colours of a replace setting, or null (no mapping).
function pairOf(o) {
  if (o.mode === 'high-contrast') return (PRESETS[o.preset] ?? PRESETS['white-on-black']).map(parseHex)
  if (o.mode === 'custom') return [parseHex(o.text ?? '#000000'), parseHex(o.background ?? '#ffffff')]
  return null
}

// Replace colours. o.mode: 'invert' (every colour to its opposite),
// 'grayscale', 'high-contrast' (o.preset), 'custom' (o.text, o.background:
// dark parts take the text colour, light parts the background colour, greys
// in between).
export function replaceSteps(o) {
  if (o.mode === 'invert') return [step('Difference', 1)]
  if (o.mode === 'grayscale') return [step('Saturation', 0.5)]
  const [t, bg] = pairOf(o)
  const out = [step('Saturation', 0.5)]
  if (o.mode === 'high-contrast') out.push(...lineSteps(-LO / (HI - LO), 1 / (HI - LO)))
  // per channel: x or 1 - x, so the text end comes out darker...
  const flip = t.map((tc, i) => (tc > bg[i] ? 1 : 0))
  if (flip.some(Boolean)) out.push(step('Difference', flip))
  // ...then a line from min(t, bg) to max(t, bg)
  const lo = t.map((tc, i) => Math.min(tc, bg[i]))
  const m = t.map((tc, i) => (lo[i] < 1 ? Math.abs(tc - bg[i]) / (1 - lo[i]) : 0))
  out.push(step('Multiply', m), step('Screen', lo))
  return out
}

export function replaceMap(o) {
  if (o.mode === 'invert') return (r, g, b) => [255 - r, 255 - g, 255 - b]
  const gray = (r, g, b) => lum(r / 255, g / 255, b / 255)
  if (o.mode === 'grayscale') {
    return (r, g, b) => {
      const l = Math.round(gray(r, g, b) * 255)
      return [l, l, l]
    }
  }
  const [t, bg] = pairOf(o)
  return (r, g, b) => {
    let l = gray(r, g, b)
    if (o.mode === 'high-contrast') l = clamp((l - LO) / (HI - LO))
    return t.map((tc, i) => Math.round((tc + (bg[i] - tc) * l) * 255))
  }
}

// ---------- blend layers (vector, any page) ----------
// Adds the steps on top of the given pages (1-based list, null = all). The
// page content is wrapped in q/Q and laid on an opaque white sheet first:
// blend modes work against what is under them, and a page's empty parts are
// transparent until painted.
export async function applyBlendSteps(bytes, steps, { pages = null, check = null } = {}) {
  if (!steps.length) throw new Error('These settings change nothing. Move a slider away from 100.')
  const doc = await loadPdf(bytes)
  const ctx = doc.context
  const targets = pages ? new Set(pages) : null
  // one graphics state per step for the whole file; pages that share a
  // Resources dict share the names too
  const states = steps.map((s) => ctx.register(ctx.obj({ Type: 'ExtGState', BM: s.bm, ca: s.alpha, CA: s.alpha })))
  const namesByResources = new Map()
  for (const [i, page] of doc.getPages().entries()) {
    check?.()
    if (targets && !targets.has(i + 1)) continue
    const { x, y, width, height } = page.getMediaBox()
    const cover = () => rectangle(x - 1, y - 1, width + 2, height + 2)
    // a page without content (addPage) still needs the white sheet
    if (!page.node.get(PDFName.of('Contents'))) page.node.set(PDFName.of('Contents'), ctx.obj([]))
    page.node.normalize()
    const start = ctx.contentStream([pushGraphicsState(), setFillingRgbColor(1, 1, 1), cover(), fill(), popGraphicsState(), pushGraphicsState()])
    page.node.wrapContentStreams(ctx.register(start), ctx.register(ctx.contentStream([popGraphicsState()])))
    const res = page.node.Resources()
    let names = namesByResources.get(res)
    if (!names) {
      names = states.map((ref) => page.node.newExtGState('GS', ref))
      namesByResources.set(res, names)
    }
    const ops = [pushGraphicsState()]
    steps.forEach((s, k) => ops.push(setGraphicsState(names[k]), setFillingRgbColor(...s.color), cover(), fill()))
    ops.push(popGraphicsState())
    page.pushOperators(...ops)
  }
  return doc.save()
}

// ---------- image pages (browser only) ----------
// Renders each page, maps every pixel and rebuilds the PDF from JPEGs at the
// visible page size (upright). Text is no longer selectable afterwards.
export async function rasterMap(bytes, map, { dpi = 150, quality = 0.9, onPage = null, check = null } = {}) {
  const { renderPageForExport } = await import('./mupdfRender.js')
  const src = await loadPdf(bytes)
  const frames = src.getPages().map((p) => pageFrame(p))
  const out = await PDFDocument.create()
  // one lookup table per channel value is not enough (channels mix), so cache
  // the map per colour: scans repeat few colours
  const cache = new Map()
  const mapped = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b
    let v = cache.get(key)
    if (!v) {
      if (cache.size > 1 << 20) cache.clear()
      v = map(r, g, b)
      cache.set(key, v)
    }
    return v
  }
  for (const [i, frame] of frames.entries()) {
    check?.()
    onPage?.(i + 1, frames.length)
    const img = await renderPageForExport(bytes, i + 1, { dpi, format: 'image/png' })
    const bmp = await createImageBitmap(new Blob([img.bytes]))
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const g = c.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(bmp, 0, 0)
    bmp.close?.()
    const data = g.getImageData(0, 0, c.width, c.height)
    const px = data.data
    for (let k = 0; k < px.length; k += 4) {
      const v = mapped(px[k], px[k + 1], px[k + 2])
      px[k] = v[0]
      px[k + 1] = v[1]
      px[k + 2] = v[2]
    }
    g.putImageData(data, 0, 0)
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality })
    const jpg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()))
    const page = out.addPage([frame.width, frame.height])
    page.drawImage(jpg, { x: 0, y: 0, width: frame.width, height: frame.height })
  }
  return out.save()
}

// ---------- the two tools ----------
// Returns { bytes, method: 'layers' | 'images' }.
export async function adjustColors(bytes, o, opts = {}) {
  const steps = adjustSteps(o)
  if (steps) return { bytes: await applyBlendSteps(bytes, steps, opts), method: 'layers' }
  return { bytes: await rasterMap(bytes, adjustMap(o), opts), method: 'images' }
}

export async function replaceColors(bytes, o, opts = {}) {
  return { bytes: await applyBlendSteps(bytes, replaceSteps(o), opts), method: 'layers' }
}
