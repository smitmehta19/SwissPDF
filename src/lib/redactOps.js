// True redaction: the covered content is DESTROYED, not hidden. Each selected
// page is rasterized (dropping every text object, image and vector under the
// black boxes), then rebuilt as a PDF. Text under a redaction cannot be
// recovered by copy-paste, search, or by removing an overlay — because it no
// longer exists in the file.
import { PDFDocument, rgb } from 'pdf-lib'
import { pdfjsLib, serializedPdfOp } from './pdfText.js'
import { extractDocument } from './pdfExtract.js'

// boxes: [{ pageNum, x, y, w, h }] in PDF points, y from the TOP of the page.
export async function redactPdf(bytes, boxes, { onProgress = () => {}, scale = 2.5 } = {}) {
  if (boxes.length === 0) throw new Error('Draw at least one redaction box first.')
  const byPage = new Map()
  for (const b of boxes) {
    if (!byPage.has(b.pageNum)) byPage.set(b.pageNum, [])
    byPage.get(b.pageNum).push(b)
  }

  return serializedPdfOp(async () => {
    const src = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise
    const out = await PDFDocument.create()
    try {
      for (let n = 1; n <= src.numPages; n++) {
        const pageBoxes = byPage.get(n)
        const page = await src.getPage(n)
        const viewport = page.getViewport({ scale: 1 })
        if (!pageBoxes) {
          // untouched pages are copied verbatim (keeps text selectable)
          const original = await PDFDocument.load(bytes)
          const [copied] = await out.copyPages(original, [n - 1])
          out.addPage(copied)
          continue
        }
        onProgress(`redacting page ${n}`)
        const render = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(render.width)
        canvas.height = Math.ceil(render.height)
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: ctx, viewport: render, intent: 'print' }).promise
        // paint the black boxes over the pixels — the only surviving copy
        ctx.fillStyle = '#000000'
        for (const b of pageBoxes) {
          ctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale)
        }
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
        const png = await out.embedPng(new Uint8Array(await blob.arrayBuffer()))
        const newPage = out.addPage([viewport.width, viewport.height])
        newPage.drawImage(png, { x: 0, y: 0, width: viewport.width, height: viewport.height })
      }
      return out.save()
    } finally {
      await src.destroy()
    }
  })
}

// Finds every occurrence of the search terms, returning boxes ready to redact.
export async function findTextBoxes(bytes, terms, { caseSensitive = false } = {}) {
  const needles = terms.map((t) => (caseSensitive ? t : t.toLowerCase())).filter((t) => t.trim())
  if (needles.length === 0) return []
  const pages = await extractDocument(bytes)
  const boxes = []
  pages.forEach((page, pi) => {
    for (const it of page.items) {
      const hay = caseSensitive ? it.text : it.text.toLowerCase()
      for (const needle of needles) {
        let from = 0
        while (true) {
          const at = hay.indexOf(needle, from)
          if (at === -1) break
          // proportional box for the matched slice of this text item
          const perChar = it.width / Math.max(1, it.text.length)
          boxes.push({
            pageNum: pi + 1,
            x: it.x + at * perChar - 1,
            y: page.height - it.y - it.size - 1,
            w: needle.length * perChar + 2,
            h: it.size * 1.25,
            match: it.text.substr(at, needle.length),
          })
          from = at + needle.length
        }
      }
    }
  })
  return boxes
}
