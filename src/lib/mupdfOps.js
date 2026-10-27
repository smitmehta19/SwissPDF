// Compress + Repair backed by MuPDF (Artifex's C engine compiled to WASM).
// Loaded lazily so the ~10MB engine only downloads when these tools are used.
import { PDFDocument, PDFName } from 'pdf-lib'

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
      return { bytes: src, note: 'already optimized, kept the original' }
    }
    return { bytes: out, note: null }
  } finally {
    doc.destroy?.()
  }
}

// A rewrite counts only if pdf-lib (what every tool uses) opens it with the
// same page count MuPDF found, and the page tree's /Count agrees: pdf.js
// trusts /Count, so a looping tree would still show phantom pages.
export async function rewriteOk(out, pageCount) {
  try {
    const doc = await PDFDocument.load(out, { updateMetadata: false })
    const count = doc.catalog.Pages().get(PDFName.of('Count'))
    return doc.getPageCount() === pageCount && (!count?.asNumber || count.asNumber() === pageCount)
  } catch {
    return false
  }
}

// Repair for damaged files. First a plain MuPDF rewrite: MuPDF rebuilds a
// broken xref on open, and the rewrite keeps outlines, forms, links and
// metadata. Only when that output does not hold up is every intact page
// grafted into a new document; pages whose objects are destroyed are
// rasterized from whatever MuPDF can still draw; pages beyond saving are
// skipped (and reported).
// Returns { bytes, method: 'rewrite' | 'rebuild', pageCount, recovered, rasterized, lost }.
export async function repairPdf(bytes) {
  const mupdf = await getMupdf()
  const src = new Uint8Array(bytes.slice(0))
  let doc
  try {
    doc = mupdf.Document.openDocument(src, 'application/pdf')
  } catch (err) {
    throw new Error(`Unrecoverable: the file structure is too damaged to parse (${err.message}).`)
  }
  try {
    if (doc.needsPassword()) throw new Error('Unlock this file first, it needs a password.')
    let pageCount
    try {
      pageCount = doc.countPages()
    } catch {
      throw new Error('Unrecoverable: no page tree could be found in the file.')
    }
    if (pageCount === 0) throw new Error('Unrecoverable: the file contains no readable pages.')

    let plain = null
    try {
      plain = doc.saveToBuffer('garbage,compress,encrypt=none').asUint8Array().slice()
    } catch {
      plain = null
    }
    if (plain && (await rewriteOk(plain, pageCount))) {
      return { bytes: plain, method: 'rewrite', pageCount, recovered: pageCount, rasterized: 0, lost: 0 }
    }
    const res = await rebuild(mupdf, doc, pageCount)
    // bookmarks: MuPDF often still reads the outline of a damaged file
    res.outlines = 0
    try {
      const outline = doc.loadOutline()
      if (outline?.length) {
        const moved = withOutline(mupdf, res.bytes, outline, res.pageMap)
        res.bytes = moved.bytes
        res.outlines = moved.count
      }
    } catch {
      /* no readable outline: the pages are what matters */
    }
    delete res.pageMap
    return res
  } finally {
    doc.destroy?.()
  }
}

async function rebuild(mupdf, doc, pageCount) {
  const dst = new mupdf.PDFDocument()
  const pageResults = [] // per original page: 'recovered' | 'rasterized' | {lost: reason}
  const rasterizedPages = [] // { position, png }
  let grafted = 0
  let outBytes
  try {
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
          pix.destroy?.()
          page.destroy?.()
          pageResults.push('rasterized')
        } catch (err2) {
          pageResults.push({ lost: err2.message || String(err) })
        }
      }
    }
    if (grafted === 0 && rasterizedPages.length === 0) {
      throw new Error('Unrecoverable: none of the pages could be salvaged.')
    }
    outBytes = dst.saveToBuffer('garbage,compress').asUint8Array().slice()
  } finally {
    dst.destroy?.()
  }

  // Weave rasterized pages back into their original positions with pdf-lib.
  if (rasterizedPages.length > 0) {
    const graftedDoc = grafted > 0 ? await PDFDocument.load(outBytes) : null
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
  // old page index -> new page index (null for a lost page)
  let next = 0
  const pageMap = pageResults.map((r) => (typeof r === 'object' ? null : next++))
  return {
    bytes: outBytes,
    pageMap,
    method: 'rebuild',
    pageCount,
    recovered: grafted,
    rasterized: rasterizedPages.length,
    lost,
  }
}

// Writes a MuPDF outline (loadOutline items) into bytes, page targets moved
// with pageMap (old index -> new index or null). Items whose page was lost
// keep their title without a target. Returns { bytes, count }.
function withOutline(mupdf, bytes, outline, pageMap) {
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  let count = 0
  try {
    const iter = doc.outlineIterator()
    const target = (it) => {
      if (it.page == null || it.page < 0) return /^[a-z]+:/i.test(it.uri ?? '') ? it.uri : undefined
      const to = pageMap[it.page]
      return to == null ? undefined : `#page=${to + 1}`
    }
    const add = (items) => {
      for (const it of items) {
        iter.insert({ title: it.title ?? '', uri: target(it), open: !!it.open })
        count++
        if (it.down?.length) {
          iter.prev()
          iter.down()
          add(it.down)
          iter.up()
          iter.next()
        }
      }
    }
    add(outline)
    return { bytes: doc.saveToBuffer('garbage,compress').asUint8Array().slice(), count }
  } finally {
    doc.destroy?.()
  }
}
