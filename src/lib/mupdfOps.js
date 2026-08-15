// Compress + Repair backed by MuPDF (Artifex's C engine compiled to WASM).
// Loaded lazily so the ~10MB engine only downloads when these tools are used.
import { PDFDocument } from 'pdf-lib'

let mupdfPromise = null
function getMupdf() {
  if (!mupdfPromise) mupdfPromise = import('mupdf')
  return mupdfPromise
}

const CLEAN_OPTS = 'garbage=4,compress,compress-images,compress-fonts,clean,sanitize'

// Lossless-ish cleanup: drop unused objects, dedupe, recompress streams.
// If the rewrite comes out LARGER (common for tiny/already-tight files) the
// original bytes are kept and we say so.
export async function cleanPdf(bytes) {
  const mupdf = await getMupdf()
  const src = new Uint8Array(bytes.slice(0))
  const doc = mupdf.Document.openDocument(src, 'application/pdf')
  try {
    const out = doc.saveToBuffer(CLEAN_OPTS).asUint8Array().slice()
    if (out.length >= src.length) {
      return { bytes: src, note: 'already optimized — kept the original' }
    }
    return { bytes: out, note: null }
  } finally {
    doc.destroy?.()
  }
}

// Page-by-page recovery for damaged files: graft every intact page into a new
// document; pages whose objects are destroyed get rasterized from whatever
// MuPDF can still draw; pages beyond saving are skipped (and reported).
export async function repairPdf(bytes) {
  const mupdf = await getMupdf()
  const src = new Uint8Array(bytes.slice(0))
  let doc
  try {
    doc = mupdf.Document.openDocument(src, 'application/pdf')
  } catch (err) {
    throw new Error(`Unrecoverable — the file structure is too damaged to parse (${err.message}).`)
  }
  let pageCount
  try {
    pageCount = doc.countPages()
  } catch {
    throw new Error('Unrecoverable — no page tree could be found in the file.')
  }
  if (pageCount === 0) throw new Error('Unrecoverable — the file contains no readable pages.')

  const dst = new mupdf.PDFDocument()
  const pageResults = [] // per original page: 'recovered' | 'rasterized' | {lost: reason}
  const rasterizedPages = [] // { position, png }
  let grafted = 0
  for (let i = 0; i < pageCount; i++) {
    try {
      dst.graftPage(-1, doc, i)
      grafted++
      pageResults.push('recovered')
    } catch (err) {
      try {
        const page = doc.loadPage(i)
        const pix = page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB)
        rasterizedPages.push({ position: i, png: pix.asPNG().slice() })
        pageResults.push('rasterized')
      } catch (err2) {
        pageResults.push({ lost: err2.message || String(err) })
      }
    }
  }
  if (grafted === 0 && rasterizedPages.length === 0) {
    throw new Error('Unrecoverable — none of the pages could be salvaged.')
  }

  let outBytes = dst.saveToBuffer('garbage,compress').asUint8Array().slice()

  // Weave rasterized pages back into their original positions with pdf-lib.
  if (rasterizedPages.length > 0) {
    const graftedDoc = await PDFDocument.load(outBytes)
    const final = await PDFDocument.create()
    let graftedIdx = 0
    for (let i = 0; i < pageResults.length; i++) {
      if (pageResults[i] === 'recovered') {
        const [p] = await final.copyPages(graftedDoc, [graftedIdx++])
        final.addPage(p)
      } else if (pageResults[i] === 'rasterized') {
        const raster = rasterizedPages.find((r) => r.position === i)
        const img = await final.embedPng(raster.png)
        const page = final.addPage([img.width / 2, img.height / 2])
        page.drawImage(img, { x: 0, y: 0, width: img.width / 2, height: img.height / 2 })
      }
    }
    outBytes = await final.save()
  }

  const lost = pageResults.filter((r) => typeof r === 'object').length
  return {
    bytes: outBytes,
    pageCount,
    recovered: grafted,
    rasterized: rasterizedPages.length,
    lost,
  }
}
