// Office ↔ PDF conversions, fully in-browser.
//   Word→PDF:  docx-preview renders real pages, html2canvas rasterizes them.
//   Excel→PDF: SheetJS -> styled HTML tables -> rasterized, one page per sheet.
//   PPT→PDF:   pptxviewjs renders each slide to canvas.
//   PDF→Word:  pdf.js text + positions -> paragraph/heading reconstruction -> docx.
//   PDF→Excel: pdf.js positions -> row/column clustering -> SheetJS workbook.
//   PDF→PPT:   pdf.js page renders -> pptxgenjs, one slide per page.
import { imagesToPdf, normalizeImage } from './imageOps.js'
import { renderPageToImage } from './pdfText.js'

// ---------- shared helpers ----------

// PNG keeps text razor-sharp (JPEG softens edges); scale 3 = ~288 DPI.
async function canvasToNormalizedImage(canvas) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Could not capture the rendered page.')
  return normalizeImage(new Uint8Array(await blob.arrayBuffer()))
}

function offscreenHost(width = 900) {
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;background:#fff;`
  document.body.appendChild(host)
  return host
}

// ---------- Office -> PDF ----------

export async function docxToPdf(arrayBuffer, onProgress = () => {}) {
  const { renderAsync } = await import('docx-preview')
  const html2canvas = (await import('html2canvas')).default
  const host = offscreenHost(1000)
  try {
    onProgress('laying out document')
    await renderAsync(arrayBuffer, host, undefined, {
      inWrapper: true,
      ignoreLastRenderedPageBreak: false,
    })
    const pages = [...host.querySelectorAll('section.docx')]
    if (pages.length === 0) throw new Error('No pages could be rendered from this document.')
    const images = []
    for (let i = 0; i < pages.length; i++) {
      onProgress(`capturing page ${i + 1} of ${pages.length}`)
      const canvas = await html2canvas(pages[i], { scale: 3, backgroundColor: '#ffffff' })
      images.push(await canvasToNormalizedImage(canvas))
    }
    return imagesToPdf(images, { pageSize: 'fit' })
  } finally {
    host.remove()
  }
}

export async function xlsxToPdf(arrayBuffer, onProgress = () => {}) {
  const XLSX = await import('xlsx')
  const html2canvas = (await import('html2canvas')).default
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  if (wb.SheetNames.length === 0) throw new Error('This workbook has no sheets.')
  const host = offscreenHost(1200)
  try {
    const images = []
    for (let i = 0; i < wb.SheetNames.length; i++) {
      const name = wb.SheetNames[i]
      onProgress(`rendering sheet "${name}"`)
      const html = XLSX.utils.sheet_to_html(wb.Sheets[name], { header: '', footer: '' })
      host.innerHTML = `
        <div style="padding:24px;font-family:Segoe UI,Arial,sans-serif;background:#fff;display:inline-block;min-width:600px">
          <h2 style="margin:0 0 12px;font-size:20px">${name}</h2>
          <div class="sheet-html">${html}</div>
        </div>`
      host.querySelectorAll('table').forEach((t) => {
        t.style.borderCollapse = 'collapse'
        t.querySelectorAll('td').forEach((td) => {
          td.style.border = '1px solid #cbd5e1'
          td.style.padding = '4px 10px'
          td.style.fontSize = '13px'
        })
      })
      const target = host.firstElementChild
      const canvas = await html2canvas(target, { scale: 3, backgroundColor: '#ffffff' })
      images.push(await canvasToNormalizedImage(canvas))
    }
    return imagesToPdf(images, { pageSize: 'fit' })
  } finally {
    host.remove()
  }
}

export async function pptxToPdf(arrayBuffer, onProgress = () => {}) {
  const { PPTXViewer } = await import('pptxviewjs')
  onProgress('parsing presentation')
  const viewer = new PPTXViewer({ slideSizeMode: 'actual' })
  try {
    await viewer.loadFile(arrayBuffer)
    const count = viewer.getSlideCount()
    if (!count) throw new Error('No slides found in this presentation.')
    const images = []
    for (let i = 0; i < count; i++) {
      onProgress(`rendering slide ${i + 1} of ${count}`)
      const canvas = document.createElement('canvas')
      await viewer.renderSlide(i, canvas, { scale: 2, quality: 'high' })
      images.push(await canvasToNormalizedImage(canvas))
    }
    return imagesToPdf(images, { pageSize: 'fit' })
  } finally {
    viewer.destroy?.()
  }
}

// ---------- PDF -> Office (layout analysis in pdfExtract.js) ----------

// Interleave detected tables and remaining text lines in reading order.
function pageBlocks(page) {
  const { detectTables, buildLines, detectColumns } = pageBlocks.deps
  const { tables, usedItems } = detectTables(page)
  const freeItems = page.items.filter((it) => !usedItems.has(it))
  const lines = buildLines(freeItems)
  const columnBounds = detectColumns(lines, page.width)
  const blocks = [
    ...tables.map((t) => ({ top: t.top, type: 'table', table: t })),
    ...lines.map((l) => ({ top: l.y, type: 'line', line: l })),
  ]
  blocks.sort((b1, b2) => b2.top - b1.top)
  return { blocks, columnBounds }
}

async function loadExtract() {
  const mod = await import('./pdfExtract.js')
  pageBlocks.deps = mod
  return mod
}

const numericCell = (text) => {
  const cleaned = text.replace(/[,\s]/g, '')
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : text
}

// Smart OCR fallback: pages WITH a text layer use it untouched (it is ground
// truth — exact characters, positions, fonts); pages WITHOUT one (scans) get
// OCR'd and the recognized words joined into the same pipeline.
async function ensureTextForPages(bytes, pages, onProgress) {
  let ocrPages = 0
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    if (page.items.length > 2) continue // real text layer present
    const looksScanned =
      page.images.some((img) => img.w * img.h > 0.5 * page.width * page.height) ||
      (page.items.length === 0 && page.images.length > 0)
    if (!looksScanned) continue
    onProgress(`page ${i + 1} looks scanned — recognizing text (OCR, first run downloads the engine)`)
    const { recognizeWords } = await import('./ocrOps.js')
    const { words, imgW, imgH } = await recognizeWords(bytes, i + 1)
    const sx = page.width / imgW
    const sy = page.height / imgH
    let added = 0
    for (const w of words) {
      if (!w.text?.trim() || w.confidence < 40) continue
      const { x0, y0, x1, y1 } = w.bbox
      page.items.push({
        text: w.text,
        x: x0 * sx,
        y: page.height - y1 * sy,
        size: Math.max(4, (y1 - y0) * sy),
        width: (x1 - x0) * sx,
        bold: false,
        italic: false,
      })
      added++
    }
    if (added > 0) {
      ocrPages++
      // Drop the full-page scan image so it doesn't sit on top of the now
      // editable text; keep smaller genuine pictures.
      page.images = page.images.filter((img) => img.w * img.h < 0.5 * page.width * page.height)
    }
  }
  return ocrPages
}

// layout: 'flow' rebuilds paragraphs/tables that reflow like a normal Word
// document (reports, letters); 'exact' pins every text block, image, and form
// field at its true page position in editable frames (payslips, forms,
// invoices — anything where the layout IS the document).
export async function pdfToDocx(bytes, onProgress = () => {}, layout = 'flow') {
  onProgress('analyzing layout')
  const { extractDocument, lineCells, buildLines } = await loadExtract()
  const pages = await extractDocument(bytes)
  const ocrPages = await ensureTextForPages(bytes, pages, onProgress)
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    PageBreak,
    Table,
    TableRow,
    TableCell,
    WidthType,
    ImageRun,
    HorizontalPositionRelativeFrom,
    VerticalPositionRelativeFrom,
    TextWrappingType,
    FrameAnchorType,
    BorderStyle,
  } = await import('docx')

  const PT_TO_EMU = 12700
  const PT_TO_PX = 96 / 72
  // Anchored at their true page position, wrapped so text flows around.
  const floatingImage = (img, page) =>
    new ImageRun({
      type: 'png',
      data: img.png,
      transformation: { width: Math.round(img.w * PT_TO_PX), height: Math.round(img.h * PT_TO_PX) },
      floating: {
        horizontalPosition: {
          relative: HorizontalPositionRelativeFrom.PAGE,
          offset: Math.round(img.x * PT_TO_EMU),
        },
        verticalPosition: {
          relative: VerticalPositionRelativeFrom.PAGE,
          offset: Math.round((page.height - img.yTop) * PT_TO_EMU),
        },
        wrap: { type: TextWrappingType.SQUARE },
        behindDocument: false,
      },
    })

  const allSizes = pages.flatMap((p) => p.items.map((it) => it.size)).sort((a, b) => a - b)
  const median = allSizes[Math.floor(allSizes.length / 2)] || 12
  const children = []
  let extractedChars = 0
  let tableCount = 0
  let imageCount = 0
  let fieldCount = 0

  const PT_TO_TWIP = 20

  const lineRuns = (line) => {
    // merge consecutive items with identical style into runs
    const runs = []
    for (const it of line.items) {
      const prev = runs[runs.length - 1]
      if (prev && prev.bold === it.bold && prev.italic === it.italic && Math.abs(prev.size - it.size) < 1) {
        prev.text += (it.x - prev.endX > 1 ? ' ' : '') + it.text
        prev.endX = it.x + it.width
      } else {
        runs.push({ text: it.text, bold: it.bold, italic: it.italic, size: it.size, endX: it.x + it.width })
      }
    }
    return runs.map(
      (r) =>
        new TextRun({
          text: r.text,
          bold: r.bold,
          italics: r.italic,
          size: Math.round(Math.max(8, Math.min(r.size, 36)) * 2),
        }),
    )
  }

  // ---- exact layout: one section per page, page-sized, framed blocks ----
  if (layout === 'exact') {
    const sections = pages.map((page, pi) => {
      onProgress(`pinning page ${pi + 1} of ${pages.length}`)
      const kids = []
      if (page.images.length > 0) {
        imageCount += page.images.length
        kids.push(new Paragraph({ children: page.images.map((img) => floatingImage(img, page)) }))
      }
      const lines = buildLines(page.items)
      // Split each line into segments at large horizontal gaps so label/value
      // pairs and side-by-side columns become separately editable blocks.
      const segmentsOf = (line) => {
        const segs = []
        let current = null
        for (const it of line.items) {
          if (current && it.x - current.endX < Math.max(12, line.size * 1.5)) {
            current.items.push(it)
            current.endX = it.x + it.width
          } else {
            current = { items: [it], endX: it.x + it.width }
            segs.push(current)
          }
        }
        return segs
      }
      const blocks = [
        ...lines.flatMap((line) =>
          segmentsOf(line).map((seg) => {
            const x0 = Math.min(...seg.items.map((i) => i.x))
            const x1 = Math.max(...seg.items.map((i) => i.x + i.width))
            extractedChars += seg.items.reduce((s, i) => s + i.text.length, 0)
            return {
              top: line.y + line.size * 0.85,
              frame: {
                x: x0,
                width: x1 - x0 + 6,
                height: line.size * 1.6,
                runs: lineRuns({ ...line, items: seg.items }),
              },
            }
          }),
        ),
        ...page.formFields.map((f) => {
          fieldCount++
          return {
            top: f.y + f.h,
            frame: {
              x: f.x,
              width: Math.max(f.w, 30),
              height: Math.max(f.h, 12),
              border: true,
              runs: [
                new TextRun({
                  text: f.value || ' ',
                  size: Math.round(Math.min(Math.max(f.h * 0.55, 8), 14) * 2),
                }),
              ],
            },
          }
        }),
      ]
      blocks.sort((b1, b2) => b2.top - b1.top)
      for (const block of blocks) {
        const fr = block.frame
        kids.push(
          new Paragraph({
            frame: {
              type: 'absolute',
              position: {
                x: Math.round(fr.x * PT_TO_TWIP),
                y: Math.round((page.height - block.top) * PT_TO_TWIP),
              },
              width: Math.round(fr.width * PT_TO_TWIP),
              height: Math.round(fr.height * PT_TO_TWIP),
              anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
            },
            border: fr.border
              ? {
                  top: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
                  bottom: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
                  left: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
                  right: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
                }
              : undefined,
            children: fr.runs,
          }),
        )
      }
      if (kids.length === 0) kids.push(new Paragraph({ text: '' }))
      return {
        properties: {
          page: {
            size: {
              width: Math.round(page.width * PT_TO_TWIP),
              height: Math.round(page.height * PT_TO_TWIP),
            },
            margin: { top: 0, bottom: 0, left: 0, right: 0 },
          },
        },
        children: kids,
      }
    })
    if (extractedChars === 0 && imageCount === 0 && fieldCount === 0) {
      throw new Error('No text found — even OCR could not read anything in this document.')
    }
    const doc = new Document({ sections })
    const blob = await Packer.toBlob(doc)
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      chars: extractedChars,
      pages: pages.length,
      tables: 0,
      images: imageCount,
      fields: fieldCount,
      ocrPages,
    }
  }

  pages.forEach((page, pi) => {
    onProgress(`rebuilding page ${pi + 1} of ${pages.length}`)
    if (pi > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    const { blocks } = pageBlocks(page)

    // Anchor this page's images (at their true positions) to a leading paragraph.
    if (page.images.length > 0) {
      imageCount += page.images.length
      children.push(new Paragraph({ children: page.images.map((img) => floatingImage(img, page)) }))
    }

    let paragraphLines = []
    const flushParagraph = () => {
      if (paragraphLines.length === 0) return
      const size = Math.max(...paragraphLines.map((l) => l.size))
      const text = paragraphLines.map((l) => l.items.map((i) => i.text).join(' ')).join(' ')
      extractedChars += text.length
      const looksHeading =
        size > median * 1.35 || (paragraphLines.length === 1 && paragraphLines[0].items.every((i) => i.bold))
      if (looksHeading) {
        children.push(new Paragraph({ text, heading: size > median * 1.8 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2 }))
      } else {
        const runs = paragraphLines.flatMap((l, idx) => {
          const r = lineRuns(l)
          return idx > 0 ? [new TextRun({ text: ' ' }), ...r] : r
        })
        children.push(new Paragraph({ children: runs }))
      }
      paragraphLines = []
    }

    let prevLine = null
    for (const block of blocks) {
      if (block.type === 'table') {
        flushParagraph()
        prevLine = null
        tableCount++
        const t = block.table
        extractedChars += t.rows.flat().join('').length
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: t.rows.map(
              (cells) =>
                new TableRow({
                  children: cells.map(
                    (cellText) => new TableCell({ children: [new Paragraph(cellText || '')] }),
                  ),
                }),
            ),
          }),
        )
        children.push(new Paragraph({ text: '' }))
      } else {
        const line = block.line
        if (prevLine && (prevLine.y - line.y > line.size * 1.8 || Math.abs(line.size - prevLine.size) > 2)) {
          flushParagraph()
        }
        paragraphLines.push(line)
        prevLine = line
      }
    }
    flushParagraph()
  })

  if (extractedChars === 0 && imageCount === 0) {
    throw new Error('No text found — even OCR could not read anything in this document.')
  }
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    chars: extractedChars,
    pages: pages.length,
    tables: tableCount,
    images: imageCount,
    ocrPages,
  }
}

export async function pdfToXlsx(bytes, onProgress = () => {}) {
  onProgress('analyzing layout')
  const { extractDocument, lineCells } = await loadExtract()
  const pages = await extractDocument(bytes)
  const ocrPages = await ensureTextForPages(bytes, pages, onProgress)
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  let cellsTotal = 0
  let tableCount = 0

  pages.forEach((page, pi) => {
    onProgress(`building sheet for page ${pi + 1}`)
    const { blocks, columnBounds } = pageBlocks(page)
    const rows = []
    for (const block of blocks) {
      if (block.type === 'table') {
        tableCount++
        for (const cells of block.table.rows) {
          rows.push(cells.map(numericCell))
          cellsTotal += cells.filter((c) => c !== '').length
        }
        rows.push([])
      } else {
        const cells = lineCells(block.line, columnBounds)
        rows.push(cells.map(numericCell))
        cellsTotal += cells.filter((c) => c !== '').length
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(rows.length ? rows : [['(no text on this page)']])
    // reasonable column widths from content
    const colWidths = []
    rows.forEach((r) => r.forEach((c, i) => {
      colWidths[i] = Math.max(colWidths[i] ?? 8, Math.min(50, String(c ?? '').length + 2))
    }))
    ws['!cols'] = colWidths.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, `Page ${pi + 1}`)
  })

  if (cellsTotal === 0) {
    throw new Error('No text found — even OCR could not read anything in this document.')
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return { bytes: new Uint8Array(out), cells: cellsTotal, pages: pages.length, tables: tableCount, ocrPages }
}

export async function pdfToPptx(bytes, pageCount, onProgress = () => {}) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  let layoutSet = false
  for (let n = 1; n <= pageCount; n++) {
    onProgress(`rendering page ${n} of ${pageCount}`)
    const img = await renderPageToImage(bytes, n, { width: 1600, format: 'image/jpeg', quality: 0.92 })
    const wIn = 10
    const hIn = (img.height / img.width) * wIn
    if (!layoutSet) {
      pptx.defineLayout({ name: 'PDF', width: wIn, height: hIn })
      pptx.layout = 'PDF'
      layoutSet = true
    }
    const slide = pptx.addSlide()
    const b64 = btoa(
      Array.from({ length: Math.ceil(img.bytes.length / 0x8000) }, (_, i) =>
        String.fromCharCode(...img.bytes.subarray(i * 0x8000, (i + 1) * 0x8000)),
      ).join(''),
    )
    slide.addImage({ data: `image/jpeg;base64,${b64}`, x: 0, y: 0, w: wIn, h: hIn })
  }
  const out = await pptx.write({ outputType: 'arraybuffer' })
  return new Uint8Array(out)
}
