// Image ↔ PDF conversion, all in-browser.
// JPEG and PNG are embedded as they are (no re-encode). JPEG EXIF orientation
// is applied by the page transform, so phone photos stand up without losing
// quality; the EXIF itself (GPS included) is cut out unless asked to keep it. Formats pdf-lib cannot embed are decoded first: WebP, GIF, BMP,
// AVIF by the browser, HEIC with heic2any, TIFF (all pages) with UTIF. Both
// decoders load only when such a file shows up.
import {
  PDFDocument,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib'

const ascii = (b, from, len) => String.fromCharCode(...b.subarray(from, from + len))

export function sniffImageType(bytes) {
  const b = new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, Math.min(64, bytes.byteLength))
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg'
  if (b[0] === 0x89 && b[1] === 0x50) return 'png'
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a)) return 'tiff'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp'
  if (ascii(b, 0, 3) === 'GIF') return 'gif'
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp'
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4)
    if (/^(avif|avis)$/.test(brand)) return 'avif'
    // mif1 is shared by HEIC and AVIF: the compatible brands tell them apart
    const boxEnd = Math.min(b.length, (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3])
    const compat = []
    for (let o = 16; o + 4 <= boxEnd; o += 4) compat.push(ascii(b, o, 4))
    if (compat.some((c) => c === 'avif' || c === 'avis') && !compat.some((c) => /^(heic|heix|heim|heis)$/.test(c))) return 'avif'
    if (/^(heic|heix|heim|heis|hevc|hevx|mif1|msf1)$/.test(brand)) return 'heic'
  }
  return 'other'
}

// Size and EXIF orientation from the JPEG header (stored pixels, before any
// rotation). Returns null when the markers cannot be read.
export function jpegInfo(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let orientation = 1
  let i = 2
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) {
      i++
      continue
    }
    const marker = b[i + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      i += marker === 0xff ? 1 : 2
      continue
    }
    const len = (b[i + 2] << 8) | b[i + 3]
    if (marker === 0xe1 && ascii(b, i + 4, 4) === 'Exif') orientation = exifOrientation(b, i + 10, len - 8) ?? 1
    // SOF0..SOF15 except DHT (c4), JPG (c8), DAC (cc)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (b[i + 5] << 8) | b[i + 6]
      const width = (b[i + 7] << 8) | b[i + 8]
      return { width, height, orientation }
    }
    if (marker === 0xda) break
    i += 2 + len
  }
  return null
}

function exifOrientation(b, start, len) {
  const end = Math.min(b.length, start + len)
  if (start + 8 > end) return null
  const le = b[start] === 0x49
  const u16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1])
  const u32 = (o) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 2 ** 24 : b[o] * 2 ** 24 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]))
  const ifd = start + u32(start + 4)
  if (ifd + 2 > end) return null
  const n = u16(ifd)
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12
    if (e + 12 > end) break
    if (u16(e) === 0x0112) {
      const v = u16(e + 8)
      return v >= 1 && v <= 8 ? v : null
    }
  }
  return null
}

// Removes photo metadata from a JPEG without re-encoding: EXIF (camera, GPS,
// time), XMP, IPTC, comments, and extra images phones append after the main
// one (MPF depth maps and previews carry their own EXIF). Keeps what the
// picture needs: JFIF, ICC colour profile, Adobe (CMYK), tables and scans.
// Read the orientation (jpegInfo) before stripping. Returns the input when the
// markers cannot be followed.
export function stripJpegMetadata(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (b[0] !== 0xff || b[1] !== 0xd8) return b
  const parts = [b.subarray(0, 2)]
  let i = 2
  let removed = false
  const keepApp = (marker, at) =>
    marker === 0xe0 || marker === 0xee || (marker === 0xe2 && ascii(b, at + 4, 12) === 'ICC_PROFILE\0')
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return b // lost the marker chain: leave the file alone
    const marker = b[i + 1]
    if (marker === 0xff) {
      i++
      continue
    }
    if (marker === 0xd9) {
      parts.push(b.subarray(i, i + 2))
      // anything after the end of the main image is dropped
      if (i + 2 < b.length) removed = true
      i = b.length
      break
    }
    const len = (b[i + 2] << 8) | b[i + 3]
    if (len < 2 || i + 2 + len > b.length) return b
    const meta = (marker >= 0xe0 && marker <= 0xef && !keepApp(marker, i)) || marker === 0xfe
    if (meta) removed = true
    else parts.push(b.subarray(i, i + 2 + len))
    i += 2 + len
    if (marker === 0xda) {
      // entropy-coded data runs to the next marker that is not a stuffed
      // byte or a restart marker
      let j = i
      while (j + 1 < b.length && !(b[j] === 0xff && b[j + 1] !== 0x00 && !(b[j + 1] >= 0xd0 && b[j + 1] <= 0xd7))) j++
      parts.push(b.subarray(i, j))
      i = j
    }
  }
  if (!removed) return b
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function decodeDims(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'none' })
  const dims = { width: bitmap.width, height: bitmap.height }
  bitmap.close?.()
  return dims
}

const MAX_SMALL_SIDE = 2400 // "Smaller file": long side cap in px

// Draws a decoded source on a canvas and encodes it. JPEG when the image has
// no transparency (photos stay small), PNG when it does.
async function encodeCanvas(source, width, height, { quality = 'original' } = {}) {
  let w = width
  let h = height
  if (quality === 'small') {
    const s = Math.min(1, MAX_SMALL_SIDE / Math.max(w, h))
    w = Math.max(1, Math.round(w * s))
    h = Math.max(1, Math.round(h * s))
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (source instanceof ImageData) ctx.putImageData(source, 0, 0)
  else ctx.drawImage(source, 0, 0, w, h)
  let opaque = true
  if (quality !== 'small') {
    const data = ctx.getImageData(0, 0, w, h).data
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) {
        opaque = false
        break
      }
    }
  } else {
    // flatten on white, a smaller file never keeps transparency
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
  }
  const type = opaque ? 'image/jpeg' : 'image/png'
  const blob = await new Promise((res) => canvas.toBlob(res, type, quality === 'small' ? 0.8 : 0.92))
  if (!blob) throw new Error('encode failed')
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: opaque ? 'jpeg' : 'png', width: w, height: h, orientation: 1 }
}

async function decodeHeic(bytes, opts) {
  const heic2any = (await import('heic2any')).default
  const out = await heic2any({ blob: new Blob([bytes], { type: 'image/heic' }), toType: 'image/jpeg', quality: 0.92 })
  const jpg = new Uint8Array(await (Array.isArray(out) ? out[0] : out).arrayBuffer())
  if (opts.quality === 'small') return [await reencode(jpg, opts)]
  const info = jpegInfo(jpg) ?? (await decodeDims(jpg))
  return [{ bytes: jpg, type: 'jpeg', width: info.width, height: info.height, orientation: 1 }]
}

async function decodeTiff(bytes, opts) {
  const UTIF = (await import('utif')).default
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const ifds = UTIF.decode(buf)
  // skip reduced-resolution copies (NewSubfileType bit 0): those are previews
  const pages = ifds.filter((ifd) => !((ifd.t254?.[0] ?? 0) & 1))
  const frames = []
  for (const ifd of pages.length ? pages : ifds) {
    UTIF.decodeImage(buf, ifd, ifds)
    if (!ifd.width || !ifd.height) continue
    const rgba = UTIF.toRGBA8(ifd)
    const data = new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, ifd.width * ifd.height * 4), ifd.width, ifd.height)
    const frame = await encodeCanvas(data, ifd.width, ifd.height, opts)
    // TIFF Orientation (tag 274) has the same 1-8 values as EXIF
    const o = ifd.t274?.[0]
    if (o >= 1 && o <= 8) frame.orientation = o
    frames.push(frame)
  }
  if (frames.length === 0) throw new Error('no pages')
  return frames
}

async function reencode(bytes, opts) {
  const bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'from-image' })
  try {
    return await encodeCanvas(bitmap, bitmap.width, bitmap.height, opts)
  } finally {
    bitmap.close?.()
  }
}

// Decodes one image file into embeddable frames: [{ bytes, type: 'jpeg' |
// 'png', width, height, orientation }]. width/height are the stored pixels;
// orientation is the JPEG EXIF value (1-8) that imagesToPdf applies.
// Multi-page TIFF gives one frame per page, every other format one frame.
// opts.quality: 'original' (embed as is where possible) | 'small' (re-encode
// as JPEG, long side at most 2400 px).
// opts.keepMetadata: keep EXIF/XMP (camera, GPS) in passed-through JPEGs.
// Off by default: a shared PDF should not say where a photo was taken.
export async function decodeImages(bytes, opts = {}) {
  const type = sniffImageType(bytes)
  try {
    if (type === 'heic') return await decodeHeic(bytes, opts)
    if (type === 'tiff') return await decodeTiff(bytes, opts)
    if (opts.quality === 'small') return [await reencode(bytes, opts)]
    if (type === 'jpeg') {
      const info = jpegInfo(bytes) ?? { ...(await decodeDims(bytes)), orientation: 1 }
      const out = opts.keepMetadata ? bytes : stripJpegMetadata(bytes)
      return [{ bytes: out, type, width: info.width, height: info.height, orientation: info.orientation }]
    }
    if (type === 'png') return [{ bytes, type, ...(await decodeDims(bytes)), orientation: 1 }]
    return [await reencode(bytes, opts)]
  } catch {
    const what = { heic: 'HEIC', tiff: 'TIFF' }[type]
    throw new Error(what ? `This ${what} file could not be decoded.` : 'Not a supported image file.')
  }
}

// One frame, for callers that only handle single images (page renders,
// canvas captures). JPEG and PNG pass through.
export async function normalizeImage(bytes, opts = {}) {
  return (await decodeImages(bytes, opts))[0]
}

export const PAGE_SIZES = {
  a4: [595.28, 841.89], // points, portrait
  letter: [612, 792],
}

// Displayed size: EXIF 5-8 turn the image a quarter.
const shown = (img) => ((img.orientation ?? 1) >= 5 ? [img.height, img.width] : [img.width, img.height])

// Maps the image unit square onto the box (x, y, w, h) for an EXIF
// orientation. Returns the cm matrix [a b c d e f].
function orientMatrix(o, x, y, w, h) {
  switch (o) {
    case 2: return [-w, 0, 0, h, x + w, y]
    case 3: return [-w, 0, 0, -h, x + w, y + h]
    case 4: return [w, 0, 0, -h, x, y + h]
    case 5: return [0, -h, -w, 0, x + w, y + h]
    case 6: return [0, -h, w, 0, x, y + h]
    case 7: return [0, h, w, 0, x, y]
    case 8: return [0, h, -w, 0, x + w, y]
    default: return [w, 0, 0, h, x, y]
  }
}

// images: frames from decodeImages, one page each.
// pageSize: 'fit' (page is the image at `dpi`) | 'a4' | 'letter' |
//   'a4-landscape' (older callers); orientation: 'portrait' | 'landscape'
//   for a4/letter; margin in pt on every side.
// dpi: pixels per inch for 'fit'. Default 72 keeps one pixel per point for
//   callers that size their renders themselves; Images to PDF passes 150.
export async function imagesToPdf(images, { pageSize = 'fit', orientation = 'portrait', margin = 0, dpi = 72 } = {}) {
  if (images.length === 0) throw new Error('No images to convert.')
  const doc = await PDFDocument.create()
  let size = pageSize
  let orient = orientation
  if (size === 'a4-landscape') {
    size = 'a4'
    orient = 'landscape'
  }
  for (const img of images) {
    const embedded = img.type === 'jpeg' ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes)
    const [iw, ih] = shown({ width: embedded.width, height: embedded.height, orientation: img.orientation })
    let pw
    let ph
    if (size === 'fit') {
      pw = (iw * 72) / dpi + margin * 2
      ph = (ih * 72) / dpi + margin * 2
    } else {
      const [a, b] = PAGE_SIZES[size] ?? PAGE_SIZES.a4
      ;[pw, ph] = orient === 'landscape' ? [b, a] : [a, b]
    }
    const availW = pw - margin * 2
    const availH = ph - margin * 2
    if (availW <= 0 || availH <= 0) throw new Error('Margin is larger than the page.')
    const scale = Math.min(availW / iw, availH / ih)
    const w = iw * scale
    const h = ih * scale
    const page = doc.addPage([pw, ph])
    const x = (pw - w) / 2
    const y = (ph - h) / 2
    const o = img.orientation ?? 1
    if (o === 1) {
      page.drawImage(embedded, { x, y, width: w, height: h })
    } else {
      const name = page.node.newXObject('Image', embedded.ref)
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...orientMatrix(o, x, y, w, h)), drawObject(name), popGraphicsState())
    }
  }
  return doc.save()
}
