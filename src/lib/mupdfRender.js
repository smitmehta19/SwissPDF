// Page and image export for PDF to images. pdf.js renders first (fast, same
// look as the viewer). Some pages come out blank in pdf.js although they hold
// an image (JBIG2 scans are the common case): those are drawn again with
// MuPDF, which decodes them. MuPDF also extracts the embedded images.
// MuPDF (about 10 MB WASM) loads only when one of these paths needs it.
import { openPdfDocument, pdfjsLib, renderPageToImage, serializedPdfOp } from './pdfText.js'

let mupdfPromise = null
const getMupdf = () => (mupdfPromise ??= import('mupdf'))

// One open MuPDF document, for the file being exported right now.
let open = null // { bytes, doc }
async function mupdfDoc(bytes) {
  if (open?.bytes === bytes) return open.doc
  closeMupdf()
  const mupdf = await getMupdf()
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  open = { bytes, doc }
  return doc
}

// Frees the open MuPDF document (call when an export is done).
export function closeMupdf() {
  try {
    open?.doc.destroy?.()
  } catch {
    /* already gone */
  }
  open = null
}

// Visible page size in points (rotation applied), from pdf.js.
export function pageSizes(bytes, pages) {
  return serializedPdfOp(async () => {
    const doc = await openPdfDocument(bytes)
    const out = []
    for (const n of pages) {
      const page = await doc.getPage(n)
      const vp = page.getViewport({ scale: 1 })
      out.push({ width: vp.width, height: vp.height })
    }
    return out
  })
}

const MAX_PIXELS = 40e6 // canvas limit headroom; huge sheets get a lower dpi

// Pixel width for a page at dpi, capped so the render fits a canvas.
export function widthForDpi({ width, height }, dpi) {
  let s = dpi / 72
  if (width * s * height * s > MAX_PIXELS) s = Math.sqrt(MAX_PIXELS / (width * height))
  return Math.max(1, Math.round(width * s))
}

// Share of non-white pixels, measured on a small copy.
async function inkRatio(bytes) {
  const bmp = await createImageBitmap(new Blob([bytes]))
  const w = 200
  const h = Math.max(1, Math.round((bmp.height / bmp.width) * w))
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  const d = ctx.getImageData(0, 0, w, h).data
  let ink = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) ink++
  return ink / (w * h)
}

const IMAGE_OPS = () => {
  const o = pdfjsLib.OPS
  return new Set([o.paintImageXObject, o.paintInlineImageXObject, o.paintImageMaskXObject, o.paintImageXObjectRepeat, o.paintInlineImageXObjectGroup, o.paintImageMaskXObjectGroup].filter((v) => v !== undefined))
}

// Does the page paint any image? (pdf.js operator list, print intent.)
export function pageHasImage(bytes, n) {
  return serializedPdfOp(async () => {
    const page = await (await openPdfDocument(bytes)).getPage(n)
    try {
      const list = await page.getOperatorList({ intent: 'print' })
      const ops = IMAGE_OPS()
      return list.fnArray.some((fn) => ops.has(fn))
    } finally {
      page.cleanup()
    }
  })
}

function encodePixmap(pix, format, quality) {
  return format === 'image/png' ? pix.asPNG() : pix.asJPEG(Math.round(quality * 100), false)
}

// Renders a page with MuPDF at a pixel width. Same output shape as
// renderPageToImage: { bytes, width, height }.
export async function renderPageMupdf(bytes, n, { width = 1500, format = 'image/jpeg', quality = 0.9 } = {}) {
  const mupdf = await getMupdf()
  const doc = await mupdfDoc(bytes)
  const page = doc.loadPage(n - 1)
  try {
    const [x0, , x1] = page.getBounds()
    const s = width / Math.max(1, x1 - x0)
    const pix = page.toPixmap(mupdf.Matrix.scale(s, s), mupdf.ColorSpace.DeviceRGB, false, true)
    try {
      return { bytes: encodePixmap(pix, format, quality).slice(), width: pix.getWidth(), height: pix.getHeight() }
    } finally {
      pix.destroy?.()
    }
  } finally {
    page.destroy?.()
  }
}

// One page as an image. opts: { width } or { dpi }, format, quality.
// Returns { bytes, width, height, engine: 'pdfjs' | 'mupdf' }.
export async function renderPageForExport(bytes, n, { width, dpi, format = 'image/jpeg', quality = 0.9 } = {}) {
  const w = width ?? widthForDpi((await pageSizes(bytes, [n]))[0], dpi ?? 150)
  const img = await renderPageToImage(bytes, n, { width: w, format, quality })
  // a truly blank page measures 0; one short word is about 0.0005
  if ((await inkRatio(img.bytes)) > 0.0001 || !(await pageHasImage(bytes, n))) return { ...img, engine: 'pdfjs' }
  try {
    return { ...(await renderPageMupdf(bytes, n, { width: w, format, quality })), engine: 'mupdf' }
  } catch {
    return { ...img, engine: 'pdfjs' }
  }
}

// FNV-1a over a sample of the bytes: enough to drop repeats of one logo.
function quickHash(b) {
  let h = 0x811c9dc5
  const step = Math.max(1, Math.floor(b.length / 4096))
  for (let i = 0; i < b.length; i += step) h = Math.imul(h ^ b[i], 0x01000193)
  return `${b.length}:${h >>> 0}`
}

// Embedded images of the given pages, each once, at their own resolution.
// Images with transparency are always PNG. Tiny images (under 16 px, rules
// and dots) are skipped. onPage(done pages, total pages) after each page;
// check() is called per page and may throw to stop.
// Returns [{ bytes, type: 'jpg' | 'png', width, height, page }].
export async function extractImages(bytes, pages, { format = 'image/jpeg', quality = 0.9, onPage = () => {}, check = () => {} } = {}) {
  const mupdf = await getMupdf()
  const doc = await mupdfDoc(bytes)
  const seen = new Set()
  const out = []
  for (const [i, n] of pages.entries()) {
    check()
    const page = doc.loadPage(n - 1)
    const found = []
    try {
      const st = page.toStructuredText('preserve-images')
      st.walk({ onImageBlock: (_bbox, _m, image) => found.push(image) })
      for (const image of found) {
        // stencil masks have no colours of their own: nothing to save
        if (image.getWidth() < 16 || image.getHeight() < 16 || image.getImageMask()) continue
        let pix = image.toPixmap()
        const cs = pix.getColorSpace()
        if (!cs) continue
        if (!(cs.isRGB() || cs.isGray())) pix = pix.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, true)
        const png = format === 'image/png' || pix.getAlpha()
        const enc = (png ? pix.asPNG() : pix.asJPEG(Math.round(quality * 100), false)).slice()
        const key = quickHash(enc)
        if (!seen.has(key)) {
          seen.add(key)
          out.push({ bytes: enc, type: png ? 'png' : 'jpg', width: pix.getWidth(), height: pix.getHeight(), page: n })
        }
      }
      st.destroy?.()
    } finally {
      page.destroy?.()
    }
    onPage(i + 1, pages.length)
  }
  return out
}
