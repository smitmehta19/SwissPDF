// OCR backed by Tesseract.js: renders each PDF page, recognizes the text, and
// lays an invisible text layer over the original page. The document looks
// identical but becomes searchable and selectable.
//
// Everything is served from the app's own origin (public/tesseract/ and
// public/tessdata/): the worker script, the WASM core and the language data.
// Script files are fetched once per session and kept as blob URLs, language
// data is cached by Tesseract in IndexedDB, so each language downloads once.
import { PDFDocument, degrees, setCharacterSqueeze, setTextRenderingMode, TextRenderingMode } from 'pdf-lib'
import { renderPageToImage, openPdfDocument, serializedPdfOp, pdfjsLib, releasePdf } from './pdfText.js'
import { fontForText } from './fonts.js'
import { pageFrame, placeAt } from './pageFrame.js'

// Languages shipped in public/tessdata (tessdata best_int, LSTM).
export const OCR_LANGUAGES = [
  { code: 'eng', name: 'English' },
  { code: 'deu', name: 'German' },
  { code: 'fra', name: 'French' },
  { code: 'spa', name: 'Spanish' },
  { code: 'ita', name: 'Italian' },
  { code: 'por', name: 'Portuguese' },
  { code: 'nld', name: 'Dutch' },
  { code: 'rus', name: 'Russian' },
  { code: 'chi_sim', name: 'Chinese (Simplified)' },
  { code: 'jpn', name: 'Japanese' },
  { code: 'kor', name: 'Korean' },
  { code: 'ara', name: 'Arabic' },
  { code: 'hin', name: 'Hindi' },
]
const KNOWN = new Set(OCR_LANGUAGES.map((l) => l.code))

const OEM_TESSERACT_ONLY = 0
const OEM_LSTM_ONLY = 1
const CACHE_PATH = 'swisspdf-tessdata-1'

function assetUrl(path) {
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
  return new URL(`${base}${path}`, location.href).href
}

// Same probe as wasm-feature-detect: a module that uses one SIMD opcode.
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])
const hasSimd = () => {
  try {
    return WebAssembly.validate(SIMD_PROBE)
  } catch {
    return false
  }
}

// Worker script and core as blob URLs, fetched once per session. The full
// core (not the -lstm one) has the legacy engine too, which OSD needs.
let scriptsPromise = null
function loadScripts() {
  if (!scriptsPromise) {
    scriptsPromise = (async () => {
      const get = async (path) => {
        const res = await fetch(assetUrl(path))
        if (!res.ok) throw new Error(`${path}: ${res.status}`)
        return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: 'text/javascript' }))
      }
      const core = hasSimd() ? 'tesseract/tesseract-core-simd.wasm.js' : 'tesseract/tesseract-core.wasm.js'
      const [workerPath, coreUrl] = await Promise.all([get('tesseract/worker.min.js'), get(core)])
      // the worker treats a corePath that does not end in "js" as a folder
      return { workerPath, corePath: `${coreUrl}#core.js` }
    })().catch((err) => {
      scriptsPromise = null
      throw new Error(`Could not load the OCR engine (${err.message}). Check your connection and try again.`)
    })
  }
  return scriptsPromise
}

// Progress from the Tesseract worker goes to whoever runs a page right now.
let onEngineProgress = null

const workers = new Map() // key -> Promise<worker>
async function makeWorker(langs, oem, legacyLang) {
  const [{ createWorker }, paths] = await Promise.all([import('tesseract.js'), loadScripts()])
  return createWorker(langs, oem, {
    ...paths,
    workerBlobURL: false,
    langPath: assetUrl('tessdata'),
    gzip: true,
    cachePath: CACHE_PATH,
    legacyCore: true,
    legacyLang,
    logger: (m) => onEngineProgress?.(m),
  })
}

function getWorker(key, create) {
  if (!workers.has(key)) {
    const p = create()
    p.catch(() => workers.delete(key))
    workers.set(key, p)
  }
  return workers.get(key)
}

function langKey(langs) {
  const list = (Array.isArray(langs) ? langs : String(langs || 'eng').split('+')).filter((l) => KNOWN.has(l))
  return list.length ? list.join('+') : 'eng'
}

// One recognition worker at a time: a different language set replaces it.
async function textWorker(langs) {
  const key = `text:${langKey(langs)}`
  for (const k of workers.keys()) if (k.startsWith('text:') && k !== key) await stopWorker(k)
  return getWorker(key, () => makeWorker(langKey(langs), OEM_LSTM_ONLY, false))
}

const osdWorker = () => getWorker('osd', () => makeWorker('osd', OEM_TESSERACT_ONLY, true))

// Canvas PNGs carry no resolution: OSD ignores user_defined_dpi, logs
// "Invalid resolution 0 dpi" and assumes 70. A pHYs chunk after IHDR fixes it.
let crcTable = null
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
export function pngWithDpi(png, dpi) {
  const ppm = Math.round(dpi / 0.0254)
  const chunk = new Uint8Array(21)
  const v = new DataView(chunk.buffer)
  v.setUint32(0, 9)
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // pHYs
  v.setUint32(8, ppm)
  v.setUint32(12, ppm)
  chunk[16] = 1 // unit: metre
  v.setUint32(17, crc32(chunk.subarray(4, 17)))
  const at = 8 + 25 // signature + IHDR
  const out = new Uint8Array(png.length + chunk.length)
  out.set(png.subarray(0, at))
  out.set(chunk, at)
  out.set(png.subarray(at), at + chunk.length)
  return out
}

async function detectAt(png, dpi, signal) {
  const osd = await cancellable(osdWorker(), signal)
  return cancellable(osd.detect(pngWithDpi(png, dpi)), signal)
}

async function stopWorker(key) {
  const p = workers.get(key)
  workers.delete(key)
  try {
    await (await p)?.terminate()
  } catch {
    /* already gone */
  }
}

// Stops every engine worker (cancel). The next call starts fresh ones.
export async function stopOcr() {
  await Promise.all([...workers.keys()].map(stopWorker))
}

function abortError() {
  const err = new Error('Cancelled')
  err.name = 'AbortError'
  err.cancelled = true
  return err
}

// Races an engine call against the cancel signal; cancelling kills the
// workers, the only way to stop a recognition half way.
function cancellable(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      stopOcr()
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function flattenWords(data) {
  return (
    data.words ??
    (data.blocks ?? [])
      .flatMap((b) => b.paragraphs ?? [])
      .flatMap((p) => p.lines ?? [])
      .flatMap((l) => l.words ?? [])
  )
}

// ---------- images ----------
async function decode(bytes) {
  return createImageBitmap(new Blob([bytes], { type: 'image/png' }))
}

// Rotates PNG bytes clockwise by 90, 180 or 270 degrees.
async function rotatePng(bytes, cw) {
  const img = await decode(bytes)
  try {
    const sideways = cw === 90 || cw === 270
    const canvas = document.createElement('canvas')
    canvas.width = sideways ? img.height : img.width
    canvas.height = sideways ? img.width : img.height
    const c = canvas.getContext('2d')
    c.translate(canvas.width / 2, canvas.height / 2)
    c.rotate((cw * Math.PI) / 180)
    c.drawImage(img, -img.width / 2, -img.height / 2)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    img.close?.()
  }
}

// A point in an image turned `cw` degrees clockwise, back in the unturned
// image (w x h).
function unturn(x, y, cw, w, h) {
  switch (cw) {
    case 90:
      return { x: y, y: h - x }
    case 180:
      return { x: w - x, y: h - y }
    case 270:
      return { x: w - y, y: x }
    default:
      return { x, y }
  }
}

// Undo Tesseract's deskew: it turned the image by `rad` about its centre.
function unskew(x, y, rad, w, h) {
  if (!rad) return { x, y }
  const cx = w / 2
  const cy = h / 2
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const dx = x - cx
  const dy = y - cy
  return { x: cx + dx * c + dy * s, y: cy - dx * s + dy * c }
}

// Render width for a target dpi, capped so huge pages stay in memory.
function renderWidth(frame, dpi) {
  const MAX_SIDE = 6000
  const MAX_AREA = 36e6
  let scale = dpi / 72
  scale = Math.min(scale, MAX_SIDE / Math.max(frame.width, frame.height))
  scale = Math.min(scale, Math.sqrt(MAX_AREA / (frame.width * frame.height)))
  return Math.max(200, Math.round(frame.width * scale))
}

// ---------- text layer detection ----------
// Per page: number of non-space characters pdf.js finds, and (withModes)
// whether any of the text is drawn visibly. An old OCR layer is all
// invisible (render mode 3, or 7 = clip only).
function pageTextLayers(bytes, { withModes = false } = {}) {
  return serializedPdfOp(async () => {
    const doc = await openPdfDocument(bytes)
    const { OPS } = pdfjsLib
    const SHOW = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText])
    const out = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      try {
        const tc = await page.getTextContent()
        const chars = tc.items.reduce((k, it) => k + (it.str ?? '').replace(/\s/g, '').length, 0)
        let visible = false
        if (withModes && chars) {
          // visible = text drawn in a painting mode that no later page-sized
          // image covers (old OCR layers are invisible, or sit under the scan)
          const ops = await page.getOperatorList({ intent: 'print' })
          const [vx0, vy0, vx1, vy1] = page.view
          const pageArea = Math.abs((vx1 - vx0) * (vy1 - vy0))
          const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
          const stack = []
          let mode = 0
          let ctm = [1, 0, 0, 1, 0, 0]
          let shown = false
          for (let i = 0; i < ops.fnArray.length; i++) {
            const fn = ops.fnArray[i]
            if (fn === OPS.save) stack.push([mode, ctm])
            else if (fn === OPS.restore) [mode, ctm] = stack.pop() ?? [0, [1, 0, 0, 1, 0, 0]]
            else if (fn === OPS.transform) ctm = mul(ctm, ops.argsArray[i])
            else if (fn === OPS.setTextRenderingMode) mode = ops.argsArray[i][0]
            else if (SHOW.has(fn) && mode !== 3 && mode !== 7) shown = true
            else if (shown && (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject)) {
              // the unit square of the image in page space
              if (Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]) >= pageArea * 0.9) shown = false
            }
          }
          visible = shown
        }
        out.push({ chars, visible })
      } finally {
        page.cleanup()
      }
    }
    return out
  })
}

// Removes all text from the given pages (1-based) with MuPDF, leaving images
// and drawings: drops an old invisible OCR layer before a new one is added.
async function stripText(bytes, pages) {
  const mupdf = await import('mupdf')
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes.slice(0)), 'application/pdf')
  try {
    const pdf = doc.asPDF()
    for (const n of pages) {
      const page = pdf.loadPage(n - 1)
      const [x0, y0, x1, y1] = page.getBounds()
      const annot = page.createAnnotation('Redact')
      annot.setRect([x0 - 1e4, y0 - 1e4, x1 + 1e4, y1 + 1e4])
      page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE)
      page.destroy?.()
    }
    return doc.saveToBuffer('garbage=compact').asUint8Array().slice()
  } finally {
    doc.destroy?.()
  }
}
const HAS_TEXT = 30 // characters: a page number or a stamp is not a text layer

// OSD confidence needed to turn a page. Wrong reads on the corpus scans reach
// 1.0; right ones on printed pages start at 2.2.
export const OSD_THRESHOLD = 2

// Word confidence (0 to 100) needed to go into the text layer. On the fax
// 20 to 40 holds real words (Samuel, Washington, communities) with junk,
// below 20 is mostly junk: 397 words at 40, 423 at 20, 450 at 0. Below
// SURE_CONFIDENCE a word must look like one: 3+ letters, no digits or signs.
export const MIN_CONFIDENCE = 20
const SURE_CONFIDENCE = 40
const WORDLIKE = /^\p{L}[\p{L}\p{M}'\u2019-]{2,}[.,;:]?$/u

// ---------- per-page recognition ----------
// Returns words with boxes in the page's view space (points from the top-left
// of the page as displayed), plus the angle of the text as seen.
async function recognizePage(bytes, n, frame, { langs, autoRotate, deskew, dpi, minConfidence, signal, onStage }) {
  const width = renderWidth(frame, dpi)
  onStage('rendering', 0)
  // a 300 dpi render takes a moment: do not wait for it after a cancel
  const img = await cancellable(renderPageToImage(bytes, n, { width, format: 'image/png' }), signal)
  const W = img.width
  const H = img.height
  const realDpi = (W / frame.width) * 72
  let png = img.bytes
  let turn = 0
  if (autoRotate) {
    onStage('detecting orientation', 0)
    try {
      const { data } = await detectAt(png, realDpi, signal)
      const deg = data?.orientation_degrees ?? 0
      if (deg && (data.orientation_confidence ?? 0) >= OSD_THRESHOLD) turn = deg
    } catch (err) {
      if (err?.cancelled) throw err
      // no orientation (too little text): read it as it is
    }
    if (turn) png = await cancellable(rotatePng(png, turn), signal)
  }
  const worker = await cancellable(textWorker(langs), signal)
  onStage('recognizing', 0)
  const { data } = await cancellable(worker.recognize(png, { rotateAuto: !!deskew, user_defined_dpi: String(Math.round(realDpi)) }, { text: true, blocks: true }), signal)
  const rw = turn === 90 || turn === 270 ? H : W
  const rh = turn === 90 || turn === 270 ? W : H
  const rad = data.rotateRadians || 0
  const s = frame.width / W
  const words = []
  for (const w of flattenWords(data)) {
    const text = (w.text ?? '').trim()
    if (!text || w.confidence < minConfidence) continue
    if (w.confidence < SURE_CONFIDENCE && !WORDLIKE.test(text)) continue
    const { x0, y0, x1, y1 } = w.bbox
    // baseline at the left edge of the word, in the deskewed upright image
    const by = w.baseline && Number.isFinite(w.baseline.y0) && w.baseline.y0 > y0 ? Math.min(y1, w.baseline.y0 + ((w.baseline.y1 - w.baseline.y0) * (x0 - w.baseline.x0)) / Math.max(1, w.baseline.x1 - w.baseline.x0)) : y1
    const origin = unskew(x0, by, rad, rw, rh)
    const back = unturn(origin.x, origin.y, turn, W, H)
    words.push({
      text,
      vx: back.x * s,
      vy: back.y * s,
      w: (x1 - x0) * s,
      h: (y1 - y0) * s,
      // the image was turned `turn` clockwise to read it, so the text runs
      // `turn` degrees counter-clockwise on the page; deskew adds its angle
      angle: turn - (rad * 180) / Math.PI,
      confidence: w.confidence,
    })
  }
  return { words, text: data.text ?? '', turned: turn, skew: (rad * 180) / Math.PI }
}

// Draws one invisible word, fitted to its box. Returns false when no bundled
// font has its characters (that word is left out).
async function drawWord(doc, page, frame, word) {
  let font
  try {
    font = await fontForText(doc, word.text)
  } catch (err) {
    if (err.code === 'UNSUPPORTED_CHAR' || /mixes scripts/.test(err.message)) return false
    throw err
  }
  const size = Math.max(3, word.h * 0.92)
  let natural = 0
  try {
    natural = font.widthOfTextAtSize(word.text, size)
  } catch {
    return false
  }
  const squeeze = natural > 0 ? Math.min(400, Math.max(25, (100 * word.w) / natural)) : 100
  const at = placeAt(frame, word.vx, word.vy, 0, 0, word.angle)
  page.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible), setCharacterSqueeze(squeeze))
  try {
    page.drawText(word.text, { x: at.x, y: at.y, size, font, rotate: at.rotate })
  } catch {
    page.pushOperators(setCharacterSqueeze(100), setTextRenderingMode(TextRenderingMode.Fill))
    return false
  }
  page.pushOperators(setCharacterSqueeze(100), setTextRenderingMode(TextRenderingMode.Fill))
  return true
}

// Recognize one page's words with their pixel boxes, used by the converters'
// auto-OCR fallback for scanned pages.
export async function recognizeWords(bytes, pageNum, lang = 'eng') {
  const img = await renderPageToImage(bytes, pageNum, { width: 1600, format: 'image/png' })
  // the real resolution: 1600 px across the page as shown
  const widthPt = await serializedPdfOp(async () => {
    const page = await (await openPdfDocument(bytes)).getPage(pageNum)
    try {
      return page.getViewport({ scale: 1 }).width
    } finally {
      page.cleanup()
    }
  })
  const worker = await textWorker(lang)
  const dpi = Math.round((img.width / Math.max(1, widthPt)) * 72)
  const { data } = await worker.recognize(img.bytes, { user_defined_dpi: String(dpi) }, { text: true, blocks: true })
  return { words: flattenWords(data), imgW: img.width, imgH: img.height }
}

// ---------- auto rotate ----------
// Orientation of one page as shown (its /Rotate applied): how far to turn it
// clockwise to make the text upright, and how sure OSD is. Pages with too
// little text give { degrees: 0, confidence: 0 }.
async function detectPage(bytes, n, frame, { dpi, signal }) {
  const img = await cancellable(renderPageToImage(bytes, n, { width: renderWidth(frame, dpi), format: 'image/png' }), signal)
  try {
    const { data } = await detectAt(img.bytes, (img.width / frame.width) * 72, signal)
    return { degrees: ((data?.orientation_degrees ?? 0) + 360) % 360, confidence: data?.orientation_confidence ?? 0 }
  } catch (err) {
    if (err?.cancelled) throw err
    return { degrees: 0, confidence: 0 }
  }
}

// Turns sideways and upside-down pages upright by changing their /Rotate;
// the page content is not touched.
// options:
//   threshold    minimum OSD confidence to act on a page
//   infer        pages below the threshold take the turn most confident
//                pages agree on (a batch scanned the wrong way round)
//   dpi          render resolution for detection
//   onProgress(done, total, label), signal
// Returns { bytes, pages: [{ page, degrees, confidence, turn }], turned }.
export async function autoRotatePdf(bytes, { threshold = OSD_THRESHOLD, infer = true, dpi = 200, onProgress = () => {}, signal } = {}) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const count = doc.getPageCount()
  const pages = []
  for (let n = 1; n <= count; n++) {
    if (signal?.aborted) throw abortError()
    onProgress(n - 1, count, `Page ${n} of ${count}, detecting orientation`)
    const frame = pageFrame(doc.getPage(n - 1))
    const res = await detectPage(bytes, n, frame, { dpi, signal })
    pages.push({ page: n, ...res, turn: res.confidence >= threshold ? res.degrees : null })
  }
  // most common turn among the confident pages; it is inferred for the rest
  // only when at least 2 pages (or half of all pages) agree, so one stray read
  // cannot turn a whole file
  const sure = pages.filter((p) => p.turn != null)
  const votes = new Map()
  for (const p of sure) votes.set(p.turn, (votes.get(p.turn) ?? 0) + 1)
  const [common, agree] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]
  const fallback = infer && common && agree > sure.length / 2 && (agree >= 2 || agree >= pages.length / 2) ? common : 0
  const turned = []
  for (const p of pages) {
    p.inferred = p.turn == null && fallback !== 0
    if (p.turn == null) p.turn = fallback
    if (!p.turn) continue
    const page = doc.getPage(p.page - 1)
    page.setRotation(degrees((((page.getRotation().angle + p.turn) % 360) + 360) % 360))
    turned.push(p.page)
  }
  onProgress(count, count, 'Saving')
  const out = turned.length ? await doc.save() : new Uint8Array(bytes)
  return { bytes: out, pages, turned }
}

// options:
//   langs        ['eng', 'deu', ...] (or lang: 'eng+deu')
//   textPages    'skip' leaves pages that already have a text layer alone,
//                'force' reads every page and replaces an old invisible
//                text layer (visible text stays), 'all' reads every page and
//                keeps what is there (doubles an old layer: tests only).
//                Default 'skip', so a caller that forgets it adds no copy
//   autoRotate   detect sideways / upside-down scans (OSD)
//   deskew       straighten slightly tilted scans
//   dpi          render resolution, 300 by default
//   minConfidence  words Tesseract is less sure of are left out
//   pages        page numbers to consider (default all)
//   onProgress(done, total, label)  done is fractional within a page
//   signal       AbortSignal: stops the engine at once
export async function ocrPdf(
  bytes,
  { langs, lang, textPages = 'skip', autoRotate = true, deskew = true, dpi = 300, minConfidence = MIN_CONFIDENCE, pages = null, onProgress = () => {}, signal } = {},
) {
  const languages = langs ?? (lang ? String(lang).split('+') : ['eng'])
  const force = textPages === 'force'
  const layers = await pageTextLayers(bytes, { withModes: force })
  const pageCount = layers.length
  const list = (pages ?? Array.from({ length: pageCount }, (_, i) => i + 1)).filter((n) => n >= 1 && n <= pageCount)
  const todo = list.filter((n) => textPages !== 'skip' || layers[n - 1].chars < HAS_TEXT)
  const skippedPages = list.filter((n) => !todo.includes(n))
  // force: an old invisible text layer is replaced, not doubled; visible text
  // (a born-digital page) is kept as it is
  const replacedPages = force ? todo.filter((n) => layers[n - 1].chars > 0 && !layers[n - 1].visible) : []
  const visibleTextPages = force ? todo.filter((n) => layers[n - 1].visible) : []
  const source = bytes
  if (replacedPages.length) bytes = await stripText(bytes, replacedPages)
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })

  let totalWords = 0
  let skippedWords = 0
  const rotatedPages = []
  const pageTexts = []
  for (const [i, n] of todo.entries()) {
    if (signal?.aborted) throw abortError()
    const label = (stage) => `Page ${n} of ${pageCount}, ${stage}`
    onProgress(i, todo.length, label('rendering'))
    onEngineProgress = (m) => {
      if (m.status === 'recognizing text') onProgress(i + Math.min(0.99, m.progress ?? 0), todo.length, label('recognizing'))
    }
    const page = doc.getPage(n - 1)
    const frame = pageFrame(page)
    let res
    try {
      res = await recognizePage(bytes, n, frame, {
        langs: languages,
        autoRotate,
        deskew,
        dpi,
        minConfidence,
        signal,
        onStage: (stage) => onProgress(i, todo.length, label(stage)),
      })
    } finally {
      onEngineProgress = null
    }
    if (res.turned) rotatedPages.push(n)
    for (const word of res.words) {
      if (await drawWord(doc, page, frame, word)) totalWords++
      else skippedWords++
    }
    pageTexts.push(res.text.trim())
  }
  onProgress(todo.length, todo.length, 'Saving')
  const out = todo.length ? await doc.save() : new Uint8Array(bytes)
  if (bytes !== source) releasePdf(bytes)
  return {
    bytes: out,
    totalWords,
    skippedWords,
    pageCount,
    ocrPages: todo,
    skippedPages,
    replacedPages,
    visibleTextPages,
    rotatedPages,
    text: pageTexts.join('\n\n'),
  }
}
