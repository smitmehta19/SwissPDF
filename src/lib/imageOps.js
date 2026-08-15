// Image ↔ PDF conversion, all in-browser.
import { PDFDocument } from 'pdf-lib'

export function sniffImageType(bytes) {
  const b = new Uint8Array(bytes.slice(0, 4))
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg'
  if (b[0] === 0x89 && b[1] === 0x50) return 'png'
  return 'other'
}

async function decodeDims(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes]))
  const dims = { width: bitmap.width, height: bitmap.height }
  bitmap.close?.()
  return dims
}

// pdf-lib can only embed JPEG and PNG. Anything else the browser can decode
// (WebP, GIF, BMP, …) is re-encoded to PNG via canvas; JPEG/PNG pass through.
export async function normalizeImage(bytes) {
  const type = sniffImageType(bytes)
  try {
    if (type === 'jpeg' || type === 'png') {
      return { bytes, type, ...(await decodeDims(bytes)) }
    }
    const bitmap = await createImageBitmap(new Blob([bytes]))
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    bitmap.close?.()
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) throw new Error('encode failed')
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      type: 'png',
      width: canvas.width,
      height: canvas.height,
    }
  } catch {
    throw new Error('Not a supported image file.')
  }
}

const A4 = [595.28, 841.89] // points, portrait

// images: [{ bytes, type: 'jpeg'|'png' }] from normalizeImage, one page each.
// pageSize: 'fit' (page hugs the image) | 'a4' | 'a4-landscape'; margin in pt.
export async function imagesToPdf(images, { pageSize = 'fit', margin = 24 } = {}) {
  if (images.length === 0) throw new Error('No images to convert.')
  const doc = await PDFDocument.create()
  for (const img of images) {
    const embedded =
      img.type === 'jpeg' ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes)
    let pw
    let ph
    if (pageSize === 'fit') {
      pw = embedded.width
      ph = embedded.height
    } else {
      ;[pw, ph] = pageSize === 'a4-landscape' ? [A4[1], A4[0]] : A4
    }
    const availW = pageSize === 'fit' ? pw : pw - margin * 2
    const availH = pageSize === 'fit' ? ph : ph - margin * 2
    if (availW <= 0 || availH <= 0) throw new Error('Margin is larger than the page.')
    const scale = Math.min(availW / embedded.width, availH / embedded.height)
    const w = embedded.width * scale
    const h = embedded.height * scale
    const page = doc.addPage([pw, ph])
    page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h })
  }
  return doc.save()
}
