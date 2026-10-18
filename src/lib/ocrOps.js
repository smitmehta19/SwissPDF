// OCR backed by Tesseract.js: renders each PDF page, recognizes the text, and
// lays an INVISIBLE text layer over the original page — the document looks
// identical but becomes searchable and selectable.
import { renderPageToImage } from './pdfText.js'
import { loadPdf } from './pdfOps.js'
import { fontForText } from './fonts.js'

let workerPromise = null
async function getWorker(lang = 'eng') {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      return createWorker(lang)
    })()
  }
  return workerPromise
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

function pngToDataUrl(bytes) {
  const b64 = Array.from({ length: Math.ceil(bytes.length / 0x8000) }, (_, ci) =>
    String.fromCharCode(...bytes.subarray(ci * 0x8000, (ci + 1) * 0x8000)),
  ).join('')
  return `data:image/png;base64,${btoa(b64)}`
}

// Recognize one page's words with their pixel boxes — used by the converters'
// auto-OCR fallback for scanned pages.
export async function recognizeWords(bytes, pageNum, lang = 'eng') {
  const img = await renderPageToImage(bytes, pageNum, { width: 1600, format: 'image/png' })
  const worker = await getWorker(lang)
  const { data } = await worker.recognize(pngToDataUrl(img.bytes), {}, { text: true, blocks: true })
  return { words: flattenWords(data), imgW: img.width, imgH: img.height }
}

// onProgress(pageNum, pageCount, stage)
export async function ocrPdf(bytes, { lang = 'eng', onProgress = () => {} } = {}) {
  const RENDER_WIDTH = 1600
  const doc = await loadPdf(bytes)
  const pageCount = doc.getPageCount()
  const worker = await getWorker(lang)

  let totalWords = 0
  const pageTexts = []
  for (let n = 1; n <= pageCount; n++) {
    onProgress(n, pageCount, 'rendering')
    const img = await renderPageToImage(bytes, n, { width: RENDER_WIDTH, format: 'image/png' })
    onProgress(n, pageCount, 'recognizing')
    // data URL instead of Blob: tesseract's worker-side Blob path relies on
    // FileReader, which is flaky in some worker contexts.
    const b64 = btoa(
      Array.from({ length: Math.ceil(img.bytes.length / 0x8000) }, (_, ci) =>
        String.fromCharCode(...img.bytes.subarray(ci * 0x8000, (ci + 1) * 0x8000)),
      ).join(''),
    )
    const { data } = await worker.recognize(`data:image/png;base64,${b64}`, {}, { text: true, blocks: true })
    const words =
      data.words ??
      (data.blocks ?? [])
        .flatMap((b) => b.paragraphs ?? [])
        .flatMap((p) => p.lines ?? [])
        .flatMap((l) => l.words ?? [])
    const page = doc.getPage(n - 1)
    const { width: pw, height: ph } = page.getSize()
    const scaleX = pw / img.width
    const scaleY = ph / img.height
    for (const word of words) {
      if (!word.text?.trim() || word.confidence < 40) continue
      const { x0, y0, x1, y1 } = word.bbox
      const boxH = (y1 - y0) * scaleY
      const size = Math.max(4, boxH * 0.9)
      // Helvetica for Latin words, a Noto font for other scripts
      const font = await fontForText(doc, word.text)
      page.drawText(word.text, {
        x: x0 * scaleX,
        y: ph - y1 * scaleY + boxH * 0.15,
        size,
        font,
        opacity: 0, // invisible but selectable/searchable
      })
      totalWords++
    }
    pageTexts.push(words.map((w) => w.text).join(' '))
  }
  return { bytes: await doc.save(), totalWords, pageCount, text: pageTexts.join('\n\n') }
}
