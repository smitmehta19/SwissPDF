// Text + thumbnail helpers backed by Mozilla's pdf.js (same engine as Firefox).
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Shared configured pdf.js instance for modules that need raw access.
// Any direct use MUST go through serializedPdfOp — concurrent documents on the
// shared worker mis-render (see the queue below).
export { pdfjsLib }
export function serializedPdfOp(fn) {
  return serialized(fn)
}

function withTimeout(promise, ms, what) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000}s — try again or use a smaller file.`)), ms),
    ),
  ])
}

async function openDoc(bytes) {
  // pdf.js transfers the buffer to its worker, so always hand it a copy.
  const data = new Uint8Array(bytes.slice(0))
  return pdfjsLib.getDocument({ data }).promise
}

// pdf.js mis-renders when two documents are processed concurrently on the
// shared worker ("Invalid page request"), so all operations queue up here.
let opChain = Promise.resolve()
function serialized(fn) {
  const run = opChain.then(fn, fn)
  opChain = run.then(
    () => {},
    () => {},
  )
  return run
}

// Returns the visible text of every page, in page order.
export function getPageTexts(bytes) {
  return serialized(() => getPageTextsUnsafe(bytes))
}

async function getPageTextsUnsafe(bytes) {
  const doc = await openDoc(bytes)
  const texts = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    texts.push(content.items.map((item) => item.str).join(' ').trim())
  }
  await doc.destroy()
  return texts
}

// Renders ONE page at reading size for the inspector panel. pageNum is 1-based.
export function renderPageImage(bytes, pageNum, maxWidth = 1100) {
  return serialized(async () => {
    const doc = await openDoc(bytes)
    try {
      if (pageNum < 1 || pageNum > doc.numPages) {
        throw new Error(`Page ${pageNum} does not exist.`)
      }
      const page = await doc.getPage(pageNum)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: maxWidth / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await withTimeout(
        page.render({ canvasContext: canvas.getContext('2d'), viewport, intent: 'print' }).promise,
        30_000,
        `Rendering page ${pageNum}`,
      )
      return canvas.toDataURL('image/png')
    } finally {
      await doc.destroy()
    }
  })
}

// Renders ONE page to exportable image bytes (JPG or PNG) at a target width.
export function renderPageToImage(bytes, pageNum, { width = 1500, format = 'image/jpeg', quality = 0.9 } = {}) {
  return serialized(async () => {
    const doc = await openDoc(bytes)
    try {
      if (pageNum < 1 || pageNum > doc.numPages) throw new Error(`Page ${pageNum} does not exist.`)
      const page = await doc.getPage(pageNum)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      if (format === 'image/jpeg') {
        // JPEG has no alpha — pre-fill white so transparent areas don't go black.
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      await withTimeout(
        page.render({ canvasContext: canvas.getContext('2d'), viewport, intent: 'print' }).promise,
        60_000,
        `Rendering page ${pageNum}`,
      )
      const blob = await new Promise((res) => canvas.toBlob(res, format, quality))
      if (!blob) throw new Error('Image encoding failed.')
      return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
    } finally {
      await doc.destroy()
    }
  })
}

// Renders pages [from..to] (1-based, to=0 means last page) to small data-URL
// images. onPage(index0, dataUrl) fires per page so the UI can show thumbnails
// progressively; callers batch large documents (e.g. 100 pages at a time).
export function renderThumbnails(bytes, maxWidth = 150, onPage = null, from = 1, to = 0) {
  return serialized(() => renderThumbnailsUnsafe(bytes, maxWidth, onPage, from, to))
}

async function renderThumbnailsUnsafe(bytes, maxWidth, onPage, from, to) {
  const doc = await openDoc(bytes)
  const thumbs = []
  const last = to > 0 ? Math.min(to, doc.numPages) : doc.numPages
  for (let i = Math.max(1, from); i <= last; i++) {
    const page = await doc.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: maxWidth / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    // intent: 'print' renders without requestAnimationFrame pacing, which
    // stalls forever in hidden/background tabs.
    await withTimeout(
      page.render({ canvasContext: canvas.getContext('2d'), viewport, intent: 'print' }).promise,
      30_000,
      `Rendering page ${i}`,
    )
    const url = canvas.toDataURL('image/png')
    thumbs.push(url)
    onPage?.(i - 1, url)
  }
  await doc.destroy()
  return thumbs
}
