// Text + thumbnail helpers backed by Mozilla's pdf.js (same engine as Firefox).
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Shared configured pdf.js instance for modules that need raw access.
// Any direct use MUST go through serializedPdfOp — concurrent documents on the
// shared worker mis-render (see the queue below). Open documents with
// openPdfDocument, not getDocument, so CMaps, fonts and decoders are wired up.
export { pdfjsLib }
export function serializedPdfOp(fn) {
  return serialized(fn)
}

// CMaps, standard fonts, image decoder WASM and ICC profiles are copied from
// pdfjs-dist into public/pdfjs/ by vite.config.js. The worker fetches them, so
// the URLs must be absolute and include the Pages base path.
const assetBase = new URL(`${import.meta.env.BASE_URL}pdfjs/`, location.href).href
const assetOptions = {
  cMapUrl: `${assetBase}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${assetBase}standard_fonts/`,
  wasmUrl: `${assetBase}wasm/`,
  iccUrl: `${assetBase}iccs/`,
}

function withTimeout(promise, ms, what, onTimeout) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        onTimeout?.()
        reject(new Error(`${what} took longer than ${ms / 1000}s — try again or use a smaller file.`))
      }, ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

// ---------- open documents ----------
// One open PDFDocumentProxy per input buffer, so page renders, thumbnails and
// text calls reuse a single parse instead of copying the whole file each time.
// Keyed on the underlying ArrayBuffer (plus offset/length for views). Up to
// MAX_OPEN stay open while their copies fit in MAX_OPEN_BYTES (the newest one
// always stays); least recently used are destroyed first. Keep it small: 8 or
// 12 open docs made large JPX scans render blank in corpus runs. Thumbnail
// jobs stay on one file for a while (see pump), so many files rendering at
// once do not reopen a file per page.
const MAX_OPEN = 4
const MAX_OPEN_BYTES = 300 * 1024 * 1024
const openDocs = new WeakMap() // ArrayBuffer -> Map<'offset:length', entry>
const recent = [] // entries, most recently used last

// Without this every open document starts its own worker thread.
let worker = null
function sharedWorker() {
  if (!worker || worker.destroyed) worker = new pdfjsLib.PDFWorker()
  return worker
}

function slotOf(bytes, create) {
  const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer
  let slot = openDocs.get(buffer)
  if (!slot && create) {
    slot = new Map()
    openDocs.set(buffer, slot)
  }
  return { slot, key: `${bytes.byteOffset ?? 0}:${bytes.byteLength}` }
}

function dropEntry(entry) {
  if (entry.slot.get(entry.key) === entry) entry.slot.delete(entry.key)
  const i = recent.indexOf(entry)
  if (i >= 0) recent.splice(i, 1)
  entry.promise.then((doc) => doc.destroy()).catch(() => {})
}

// Opens (or reuses) the pdf.js document for these bytes. Call it inside
// serializedPdfOp. Callers may destroy() the result; the next call reopens.
export function openPdfDocument(bytes) {
  const { slot, key } = slotOf(bytes, true)
  const size = bytes.byteLength
  let entry = slot.get(key)
  if (entry?.doc?.loadingTask.destroyed) {
    dropEntry(entry)
    entry = null
  }
  if (!entry) {
    // pdf.js transfers its input to the worker, so it gets its own copy, once.
    const data = new Uint8Array(
      bytes instanceof ArrayBuffer
        ? bytes.slice(0)
        : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    )
    const task = pdfjsLib.getDocument({ data, worker: sharedWorker(), ...assetOptions })
    entry = { slot, key, size, doc: null, promise: null }
    entry.promise = task.promise.then(
      (doc) => (entry.doc = doc),
      (err) => {
        if (slot.get(key) === entry) slot.delete(key)
        const i = recent.indexOf(entry)
        if (i >= 0) recent.splice(i, 1)
        throw err
      },
    )
    slot.set(key, entry)
  }
  const i = recent.indexOf(entry)
  if (i >= 0) recent.splice(i, 1)
  recent.push(entry)
  const total = () => recent.reduce((t, e) => t + e.size, 0)
  while (recent.length > 1 && (recent.length > MAX_OPEN || total() > MAX_OPEN_BYTES)) dropEntry(recent[0])
  return entry.promise.then(activate)
}

// pdf.js 5 keeps the page count in one global PagesMapper that the most
// recently LOADED document overwrites, and getPage() checks against it. With
// several documents open, reset it to the one about to be used, or getPage()
// throws "Invalid page request" (the real cause of the old concurrency bug).
function activate(doc) {
  const mapper = pdfjsLib.PagesMapper?.instance
  if (mapper) mapper.pagesNumber = doc.numPages
  return doc
}

const bufferOf = (bytes) => (bytes instanceof ArrayBuffer ? bytes : bytes.buffer)

// Release generation per buffer: thumbnail batches stop when it changes.
const generations = new WeakMap() // ArrayBuffer -> Map<'offset:length', n>
function generation(bytes) {
  const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer
  return generations.get(buffer)?.get(slotOf(bytes, false).key) ?? 0
}

const releaseListeners = new Set()
// cb(bytes) runs when a file's bytes are released (thumbnail caches use it).
export function onPdfReleased(cb) {
  releaseListeners.add(cb)
  return () => releaseListeners.delete(cb)
}

// Closes the cached document for these bytes (e.g. when the file is removed)
// and stops queued thumbnail work for them right away. The close itself is
// queued so it never pulls a document out from under a running operation.
export function releasePdf(bytes) {
  const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer
  if (!generations.has(buffer)) generations.set(buffer, new Map())
  const key = slotOf(bytes, false).key
  generations.get(buffer).set(key, generation(bytes) + 1)
  if (lastKey === buffer) lastKey = null
  releaseListeners.forEach((cb) => cb(bytes))
  return serialized(() => {
    const { slot, key } = slotOf(bytes, false)
    const entry = slot?.get(key)
    if (entry) dropEntry(entry)
  })
}

// ---------- queue ----------
// pdf.js mis-renders when two documents are processed concurrently on the
// shared worker ("Invalid page request"), so all operations run one at a time.
// User operations go first; thumbnail batches queue one page at a time in the
// background lane, so a click never waits for a whole batch.
// Background jobs carry their file's buffer: the lane keeps serving one file
// for up to STREAK jobs before moving on, so files take turns in blocks
// instead of page by page (each switch can reopen a file past the LRU).
const lanes = { user: [], background: [] }
let running = false
const STREAK = 10
let lastKey = null
let streak = 0

function enqueue(fn, lane, key = null) {
  return new Promise((resolve, reject) => {
    lanes[lane].push({ fn, resolve, reject, key })
    pump()
  })
}

// A macrotask that is not throttled in hidden tabs (setTimeout is, to 1 s).
let soonChannel = null
function soon() {
  if (!soonChannel) {
    soonChannel = new MessageChannel()
    soonChannel.port1.onmessage = () => pump()
  }
  soonChannel.port2.postMessage(0)
}

function nextBackground() {
  const bg = lanes.background
  let i = -1
  if (lastKey && streak < STREAK) i = bg.findIndex((j) => j.key === lastKey)
  if (i < 0 && streak >= STREAK) i = bg.findIndex((j) => j.key !== lastKey)
  if (i < 0) i = 0
  const job = bg.splice(i, 1)[0]
  if (job) {
    streak = job.key && job.key === lastKey ? streak + 1 : 1
    lastKey = job.key
  }
  return job
}

function pump() {
  if (running) return
  const job = lanes.user.shift() ?? nextBackground()
  if (!job) return
  running = true
  const background = !!job.key
  Promise.resolve()
    .then(job.fn)
    .then(job.resolve, job.reject)
    .finally(() => {
      running = false
      // after a thumbnail job, let its batch queue the next page first
      if (background) soon()
      else pump()
    })
}

function serialized(fn) {
  return enqueue(fn, 'user')
}

// ---------- operations ----------
// Renders one page to a fresh canvas at the given width. intent: 'print'
// renders without requestAnimationFrame pacing, which stalls forever in
// hidden/background tabs.
async function renderToCanvas(doc, pageNum, width, { timeout = 30_000, white = false } = {}) {
  if (pageNum < 1 || pageNum > doc.numPages) throw new Error(`Page ${pageNum} does not exist.`)
  const page = await doc.getPage(pageNum)
  try {
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: width / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (white) {
      // JPEG has no alpha — pre-fill white so transparent areas don't go black.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    const task = page.render({ canvasContext: ctx, viewport, intent: 'print' })
    await withTimeout(task.promise, timeout, `Rendering page ${pageNum}`, () => task.cancel())
    return canvas
  } finally {
    // the document stays open, so free this page's render data now
    page.cleanup()
  }
}

// Returns the visible text of every page, in page order.
export function getPageTexts(bytes) {
  return serialized(async () => {
    const doc = await openPdfDocument(bytes)
    const texts = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      texts.push(content.items.map((item) => item.str).join(' ').trim())
    }
    return texts
  })
}

// Renders ONE page at reading size for the inspector panel. pageNum is 1-based.
export function renderPageImage(bytes, pageNum, maxWidth = 1100) {
  return serialized(async () => {
    const canvas = await renderToCanvas(await openPdfDocument(bytes), pageNum, maxWidth)
    return canvas.toDataURL('image/png')
  })
}

// Renders ONE page to exportable image bytes (JPG or PNG) at a target width.
export function renderPageToImage(bytes, pageNum, { width = 1500, format = 'image/jpeg', quality = 0.9 } = {}) {
  return serialized(async () => {
    const canvas = await renderToCanvas(await openPdfDocument(bytes), pageNum, width, {
      timeout: 60_000,
      white: format === 'image/jpeg',
    })
    const blob = await new Promise((res) => canvas.toBlob(res, format, quality))
    if (!blob) throw new Error('Image encoding failed.')
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
  })
}

// Page count of a PDF on the shared worker, without caching the document
// (output self-checks). Returns 0 when pdf.js cannot open it.
export function countPdfPages(bytes) {
  return serialized(async () => {
    // pdf.js transfers its input to the worker: give it a copy
    const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes.slice(0)) : bytes.slice()
    const task = pdfjsLib.getDocument({ data, worker: sharedWorker(), ...assetOptions })
    try {
      return (await task.promise).numPages
    } finally {
      await task.destroy()
    }
  })
}

function abortError() {
  const err = new Error('Thumbnail rendering stopped.')
  err.name = 'AbortError'
  return err
}

// Renders pages [from..to] (1-based, to=0 means last page) to small images
// (data URLs, or object URLs with { objectUrls: true }: the caller revokes
// them). onPage(index0, url) fires per page so the UI can show thumbnails
// progressively; callers batch large documents (e.g. 100 pages at a time).
// Each page is its own background job, so user operations can cut in. Stops
// with an AbortError when `signal` aborts or the bytes are released.
export async function renderThumbnails(bytes, maxWidth = 150, onPage = null, from = 1, to = 0, { signal, objectUrls = false } = {}) {
  const gen = generation(bytes)
  const live = () => {
    if (signal?.aborted || generation(bytes) !== gen) throw abortError()
  }
  const numPages = await enqueue(async () => {
    live()
    return (await openPdfDocument(bytes)).numPages
  }, 'background', bufferOf(bytes))
  const last = to > 0 ? Math.min(to, numPages) : numPages
  const thumbs = []
  for (let i = Math.max(1, from); i <= last; i++) {
    live()
    const url = await enqueue(async () => {
      live()
      const canvas = await renderToCanvas(await openPdfDocument(bytes), i, maxWidth)
      if (!objectUrls) return canvas.toDataURL('image/png')
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
      if (!blob) throw new Error('Image encoding failed.')
      return URL.createObjectURL(blob)
    }, 'background', bufferOf(bytes))
    if (signal?.aborted || generation(bytes) !== gen) {
      if (objectUrls) URL.revokeObjectURL(url)
      throw abortError()
    }
    thumbs.push(url)
    onPage?.(i - 1, url)
  }
  return thumbs
}
