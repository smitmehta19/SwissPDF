// Office ↔ PDF conversions, fully in-browser.
//   Word→PDF:  docx-preview renders real pages, html2canvas rasterizes them.
//   Excel→PDF: SheetJS -> styled HTML tables -> rasterized, paged by rows/columns.
//   PPT→PDF:   pptxviewjs renders each slide to canvas.
//   PDF→Word:  pdf.js text + positions -> columns, tables, paragraphs (layout.js) -> docx.
//   PDF→Excel: same layout -> typed cells (cellValues.js) -> SheetJS workbook.
//   PDF→PPT:   text boxes + pictures per slide, vector art as a background -> pptxgenjs.
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

// Quick mode: each sheet is paged into blocks of rows and columns (formatted
// cell text, as Excel shows it), so long sheets never hit canvas limits.
// Empty sheets (chart sheets, blank tabs) have no range and are skipped.
const ROWS_PER_PAGE = 45
const COLS_PER_PAGE = 12
const MAX_CANVAS_SIDE = 12000

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export async function xlsxToPdf(arrayBuffer, onProgress = () => {}) {
  const XLSX = await import('xlsx')
  const html2canvas = (await import('html2canvas')).default
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  if (wb.SheetNames.length === 0) throw new Error('This workbook has no sheets.')
  const host = offscreenHost(1200)
  try {
    const images = []
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name]
      if (!ws?.['!ref']) continue
      const range = XLSX.utils.decode_range(ws['!ref'])
      const rows = range.e.r - range.s.r + 1
      const cols = range.e.c - range.s.c + 1
      const rowPages = Math.ceil(rows / ROWS_PER_PAGE)
      const colPages = Math.ceil(cols / COLS_PER_PAGE)
      for (let rp = 0; rp < rowPages; rp++) {
        for (let cp = 0; cp < colPages; cp++) {
          const r0 = range.s.r + rp * ROWS_PER_PAGE
          const c0 = range.s.c + cp * COLS_PER_PAGE
          const r1 = Math.min(range.e.r, r0 + ROWS_PER_PAGE - 1)
          const c1 = Math.min(range.e.c, c0 + COLS_PER_PAGE - 1)
          const part = rowPages * colPages > 1 ? ` (${rp * colPages + cp + 1} of ${rowPages * colPages})` : ''
          onProgress(`rendering sheet "${name}"${part}`)
          let body = ''
          for (let r = r0; r <= r1; r++) {
            body += '<tr>'
            for (let c = c0; c <= c1; c++) {
              const cell = ws[XLSX.utils.encode_cell({ r, c })]
              const text = cell ? (cell.w ?? XLSX.utils.format_cell(cell)) : ''
              const num = cell?.t === 'n'
              body += `<td style="border:1px solid #cbd5e1;padding:4px 10px;font-size:13px;white-space:nowrap;${num ? 'text-align:right' : ''}">${escapeHtml(text)}</td>`
            }
            body += '</tr>'
          }
          host.innerHTML = `
            <div style="padding:24px;font-family:Segoe UI,Arial,sans-serif;background:#fff;display:inline-block;min-width:600px">
              <h2 style="margin:0 0 12px;font-size:20px">${escapeHtml(name)}${escapeHtml(part)}</h2>
              <table style="border-collapse:collapse">${body}</table>
            </div>`
          const target = host.firstElementChild
          const side = Math.max(target.offsetWidth, target.offsetHeight, 1)
          const scale = Math.max(1, Math.min(3, MAX_CANVAS_SIDE / side))
          const canvas = await html2canvas(target, { scale, backgroundColor: '#ffffff' })
          images.push(await canvasToNormalizedImage(canvas))
        }
      }
    }
    if (images.length === 0) throw new Error('Every sheet in this workbook is empty.')
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

// ---------- PDF -> Office (layout analysis in layout.js) ----------

async function loadExtract() {
  const [extract, layout, cells] = await Promise.all([import('./pdfExtract.js'), import('./layout.js'), import('./cellValues.js')])
  return { ...layout, ...cells, extractDocument: extract.extractDocument }
}

const NO_TEXT = 'No text found: even OCR could not read anything in this document.'

// Smart OCR fallback: pages WITH a text layer use it untouched (it is ground
// truth: exact characters, positions, fonts); pages WITHOUT one (scans) get
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
    onProgress(`page ${i + 1} looks scanned, recognizing text (OCR, first run downloads the engine)`)
    page.ocrTried = true
    const { recognizeWords } = await import('./ocrOps.js')
    const { words, imgW, imgH } = await recognizeWords(bytes, i + 1)
    // OCR works on the rendered (visible) page: map back to user space
    const v = page.view ?? { x0: 0, y0: 0, w: page.width, h: page.height }
    const sx = page.width / imgW
    const sy = page.height / imgH
    let added = 0
    for (const w of words) {
      if (!w.text?.trim() || w.confidence < 40) continue
      const { x0, y0, x1, y1 } = w.bbox
      page.items.push({
        text: w.text,
        x: v.x0 + x0 * sx,
        y: v.y0 + page.height - y1 * sy,
        size: Math.max(4, (y1 - y0) * sy),
        width: (x1 - x0) * sx,
        bold: false,
        italic: false,
        font: '',
        color: null,
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

async function readPages(bytes, onProgress) {
  const L = await loadExtract()
  onProgress('analyzing layout')
  const pages = await L.extractDocument(bytes, {
    onPage: (n, total) => {
      if (n % 5 === 0 || n === total) onProgress(`reading page ${n} of ${total}`)
    },
  })
  const ocrPages = await ensureTextForPages(bytes, pages, onProgress)
  return { L, pages, ocrPages, bodySize: L.bodyFontSize(pages) }
}

const viewOf = (page) => page.view ?? { x0: 0, y0: 0, w: page.width, h: page.height, rotate: 0 }

const b64 = (bytes) =>
  btoa(
    Array.from({ length: Math.ceil(bytes.length / 0x8000) }, (_, i) =>
      String.fromCharCode(...bytes.subarray(i * 0x8000, (i + 1) * 0x8000)),
    ).join(''),
  )

// layout: 'flow' rebuilds paragraphs/tables that reflow like a normal Word
// document (reports, letters); 'exact' pins every text block, image, and form
// field at its true page position in editable frames (payslips, forms,
// invoices: anything where the layout IS the document).
export async function pdfToDocx(bytes, onProgress = () => {}, layout = 'flow') {
  const { L, pages, ocrPages, bodySize } = await readPages(bytes, onProgress)
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
    AlignmentType,
    LineRuleType,
    Header,
    Footer,
    PageNumber,
  } = await import('docx')

  const PT_TO_EMU = 12700
  const PT_TO_PX = 96 / 72
  const PT_TO_TWIP = 20
  // Anchored at their true page position, wrapped so text flows around.
  const floatingImage = (img, page) => {
    const v = viewOf(page)
    return new ImageRun({
      type: 'png',
      data: img.png,
      transformation: { width: Math.round(img.w * PT_TO_PX), height: Math.round(img.h * PT_TO_PX) },
      floating: {
        horizontalPosition: {
          relative: HorizontalPositionRelativeFrom.PAGE,
          offset: Math.max(0, Math.round((img.x - v.x0) * PT_TO_EMU)),
        },
        verticalPosition: {
          relative: VerticalPositionRelativeFrom.PAGE,
          offset: Math.max(0, Math.round((v.y0 + v.h - img.yTop) * PT_TO_EMU)),
        },
        wrap: { type: TextWrappingType.SQUARE },
        behindDocument: false,
      },
    })
  }

  const ALIGN = { left: AlignmentType.LEFT, right: AlignmentType.RIGHT, center: AlignmentType.CENTER, justify: AlignmentType.JUSTIFIED }
  const textRun = (r, rtl = false, extra = {}) =>
    new TextRun({
      text: r.text,
      bold: r.bold,
      italics: r.italic,
      size: Math.round(Math.max(6, Math.min(r.size, 72)) * 2),
      font: r.font || undefined,
      color: r.color || undefined,
      rightToLeft: rtl || undefined,
      ...extra,
    })

  let extractedChars = 0
  let tableCount = 0
  let imageCount = 0
  let fieldCount = 0

  // ---- exact layout: one section per page, page-sized, framed blocks ----
  if (layout === 'exact') {
    const sections = pages.map((page, pi) => {
      onProgress(`pinning page ${pi + 1} of ${pages.length}`)
      const v = viewOf(page)
      const kids = []
      if (page.images.length > 0) {
        imageCount += page.images.length
        kids.push(new Paragraph({ children: page.images.map((img) => floatingImage(img, page)) }))
      }
      // label/value pairs stay separate; stacked lines of one block share a frame
      const frames = L.buildFrames(L.buildLines(page.items)).map((f) => {
        const runs = []
        f.lines.forEach((line, li) => {
          const lr = L.paragraphRuns([line])
          extractedChars += L.runsText(lr).length
          lr.forEach((r, ri) => runs.push(textRun(r, line.rtl, li > 0 && ri === 0 ? { break: 1 } : {})))
        })
        return {
          top: f.top,
          x: f.x0,
          width: f.x1 - f.x0 + 6,
          height: f.top - f.bottom + f.size * 0.4,
          pitch: f.lines.length > 1 ? f.pitch : null,
          rtl: f.rtl,
          runs,
        }
      })
      const fields = page.formFields.map((f) => {
        fieldCount++
        return {
          top: f.y + f.h,
          x: f.x,
          width: Math.max(f.w, 30),
          height: Math.max(f.h, 12),
          border: true,
          runs: [new TextRun({ text: f.value || ' ', size: Math.round(Math.min(Math.max(f.h * 0.55, 8), 14) * 2) })],
        }
      })
      const blocks = [...frames, ...fields].sort((b1, b2) => b2.top - b1.top)
      const border = { style: BorderStyle.SINGLE, size: 4, color: '888888' }
      for (const fr of blocks) {
        kids.push(
          new Paragraph({
            frame: {
              type: 'absolute',
              position: {
                x: Math.max(0, Math.round((fr.x - v.x0) * PT_TO_TWIP)),
                y: Math.max(0, Math.round((v.y0 + v.h - fr.top) * PT_TO_TWIP)),
              },
              width: Math.round(fr.width * PT_TO_TWIP),
              height: Math.round(fr.height * PT_TO_TWIP),
              anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
            },
            spacing: fr.pitch ? { line: Math.round(fr.pitch * PT_TO_TWIP), lineRule: LineRuleType.EXACT, before: 0, after: 0 } : { before: 0, after: 0 },
            bidirectional: fr.rtl || undefined,
            alignment: fr.rtl ? AlignmentType.RIGHT : undefined,
            border: fr.border ? { top: border, bottom: border, left: border, right: border } : undefined,
            children: fr.runs,
          }),
        )
      }
      if (kids.length === 0) kids.push(new Paragraph({ text: '' }))
      return {
        properties: {
          page: {
            size: { width: Math.round(v.w * PT_TO_TWIP), height: Math.round(v.h * PT_TO_TWIP) },
            margin: { top: 0, bottom: 0, left: 0, right: 0 },
          },
        },
        children: kids,
      }
    })
    if (extractedChars === 0 && imageCount === 0 && fieldCount === 0) throw new Error(NO_TEXT)
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
      ocrTried: pages.filter((p) => p.ocrTried).length,
    }
  }

  // ---- flow layout ----
  const furniture = L.detectFurniture(pages)
  const children = []

  const cellParagraphs = (table, r, c) => {
    const items = table.cellItems?.[r]?.[c]
    if (items?.length) {
      const runs = L.paragraphRuns(L.buildLines(items))
      return [new Paragraph({ children: runs.map((x) => textRun(x, L.isRtlText(x.text))), bidirectional: runs.some((x) => L.isRtlText(x.text)) || undefined })]
    }
    return [new Paragraph(table.rows[r][c] || '')]
  }
  const wordTable = (t) => {
    const nCols = Math.max(...t.rows.map((r) => r.length))
    const bounds = t.colBounds
    const total = 9000
    const columnWidths =
      bounds && bounds.length === nCols + 1
        ? bounds.slice(1).map((b, i) => Math.max(300, Math.round(((b - bounds[i]) / (bounds[nCols] - bounds[0])) * total)))
        : Array.from({ length: nCols }, () => Math.round(total / nCols))
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths,
      rows: t.rows.map(
        (cells, r) =>
          new TableRow({
            children: Array.from({ length: nCols }, (_, c) => new TableCell({ children: cellParagraphs(t, r, c) })),
          }),
      ),
    })
  }

  const emitParagraph = (p) => {
    const runs = L.paragraphRuns(p.lines)
    if (!runs.length) return
    const text = L.runsText(runs)
    extractedChars += text.length
    const looksHeading =
      p.size > bodySize * 1.35 ||
      (p.lines.length === 1 && p.bold && text.length < 120 && !/[.,;]$/.test(text))
    children.push(
      new Paragraph({
        heading: looksHeading ? (p.size > bodySize * 1.8 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2) : undefined,
        alignment: ALIGN[p.align],
        bidirectional: p.rtl || undefined,
        children: runs.map((r) => textRun(r, p.rtl)),
      }),
    )
  }

  pages.forEach((page, pi) => {
    onProgress(`rebuilding page ${pi + 1} of ${pages.length}`)
    if (pi > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    const { blocks } = L.layoutPage(page, { bodySize, skip: furniture[pi].skip })

    // Anchor this page's images (at their true positions) to a leading paragraph.
    if (page.images.length > 0) {
      imageCount += page.images.length
      children.push(new Paragraph({ children: page.images.map((img) => floatingImage(img, page)) }))
    }
    let run = []
    const flushLines = () => {
      for (const p of L.buildParagraphs(run, bodySize)) emitParagraph(p)
      run = []
    }
    for (const block of blocks) {
      if (block.type === 'line') {
        run.push(block)
        continue
      }
      flushLines()
      tableCount++
      extractedChars += block.table.rows.flat().join('').length
      children.push(wordTable(block.table))
      children.push(new Paragraph({ text: '' }))
    }
    flushLines()
  })

  if (extractedChars === 0 && imageCount === 0) throw new Error(NO_TEXT)

  // Repeating header / footer bands become the Word header and footer, with
  // the changing page number as a PAGE field.
  const band = (name) => {
    const keys = new Map()
    furniture.forEach((f, pi) => {
      for (const s of f[name]) {
        if (!keys.has(s.key)) keys.set(s.key, { samples: [], first: s })
        keys.get(s.key).samples[pi] = s
      }
    })
    if (!keys.size) return null
    const v = viewOf(pages[0])
    const paras = [...keys.values()]
      .sort((a, b) => b.first.line.y - a.first.line.y)
      .map(({ samples, first }) => {
        const tpl = L.furnitureTemplate(samples)
        const mid = (first.x0 + first.x1) / 2 - v.x0
        const align = Math.abs(mid - v.w / 2) < v.w * 0.08 ? AlignmentType.CENTER : first.x0 - v.x0 > v.w * 0.5 ? AlignmentType.RIGHT : AlignmentType.LEFT
        const size = Math.round(Math.max(6, Math.min(first.line.size, 20)) * 2)
        extractedChars += first.text.length
        return new Paragraph({
          alignment: align,
          children: tpl.parts.map((part) =>
            typeof part === 'string' ? new TextRun({ text: part, size }) : new TextRun({ children: [PageNumber.CURRENT], size }),
          ),
        })
      })
    return paras
  }
  const headerParas = band('header')
  const footerParas = band('footer')
  const section = { children }
  if (headerParas) section.headers = { default: new Header({ children: headerParas }) }
  if (footerParas) section.footers = { default: new Footer({ children: footerParas }) }
  const doc = new Document({ sections: [section] })
  const blob = await Packer.toBlob(doc)
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    chars: extractedChars,
    pages: pages.length,
    tables: tableCount,
    images: imageCount,
    headers: (headerParas?.length ?? 0) + (footerParas?.length ?? 0),
    ocrPages,
    ocrTried: pages.filter((p) => p.ocrTried).length,
  }
}

// Rows for one page: [{ kind: 'table' | 'text', cols, rows: [[text]] }].
function pageSegments(L, page, bodySize, skip) {
  const { blocks } = L.layoutPage(page, { bodySize, skip })
  const lineBlocks = blocks.filter((b) => b.type === 'line').map((b) => b.line)
  const columnBounds = L.detectColumns(lineBlocks, page.width)
  const segs = []
  for (const block of blocks) {
    if (block.type === 'table') {
      const rows = block.table.rows
      segs.push({ kind: 'table', cols: Math.max(...rows.map((r) => r.length)), rows })
    } else {
      const cells = L.lineCells(block.line, columnBounds)
      const last = segs[segs.length - 1]
      if (last?.kind === 'text') last.rows.push(cells)
      else segs.push({ kind: 'text', rows: [cells] })
    }
  }
  return segs
}

// One sheet per page by default. joinPages: one sheet; a table that goes on
// over the page break (same column count) continues without a gap, and a
// repeated header row is dropped.
export async function pdfToXlsx(bytes, onProgress = () => {}, { joinPages = false } = {}) {
  const { L, pages, ocrPages, bodySize } = await readPages(bytes, onProgress)
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const locale = L.detectNumberLocale(pages.map((p) => p.items.map((i) => i.text).join(' ')))
  const furniture = joinPages ? L.detectFurniture(pages) : null
  let cellsTotal = 0
  let tableCount = 0

  const toSheet = (rows) => {
    const typed = rows.map((r) => r.map((c) => L.typedCell(c, locale)))
    const ws = XLSX.utils.aoa_to_sheet(typed.length ? typed : [['(no text on this page)']])
    // reasonable column widths from content
    const colWidths = []
    rows.forEach((r) =>
      r.forEach((c, i) => {
        colWidths[i] = Math.max(colWidths[i] ?? 8, Math.min(50, String(c ?? '').length + 2))
      }),
    )
    ws['!cols'] = colWidths.map((wch) => ({ wch }))
    return ws
  }
  const count = (rows) => rows.reduce((s, r) => s + r.filter((c) => c !== '').length, 0)

  const joined = []
  let prevTable = null
  pages.forEach((page, pi) => {
    onProgress(`building sheet for page ${pi + 1}`)
    const segs = pageSegments(L, page, bodySize, furniture?.[pi].skip)
    tableCount += segs.filter((s) => s.kind === 'table').length
    if (!joinPages) {
      const rows = []
      for (const s of segs) {
        rows.push(...s.rows)
        if (s.kind === 'table') rows.push([])
      }
      cellsTotal += count(rows)
      XLSX.utils.book_append_sheet(wb, toSheet(rows), `Page ${pi + 1}`)
      return
    }
    segs.forEach((s, si) => {
      const continues = si === 0 && s.kind === 'table' && prevTable && prevTable.cols === s.cols
      let rows = s.rows
      if (continues) {
        if (rows[0]?.join('|') === prevTable.rows[0]?.join('|')) rows = rows.slice(1)
      } else if (joined.length) joined.push([])
      joined.push(...rows)
      cellsTotal += count(rows)
    })
    const last = segs[segs.length - 1]
    prevTable = last?.kind === 'table' ? (segs.length === 1 && prevTable && prevTable.cols === last.cols ? prevTable : last) : null
  })
  if (joinPages) XLSX.utils.book_append_sheet(wb, toSheet(joined), 'All pages')

  if (cellsTotal === 0) throw new Error(NO_TEXT)
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return { bytes: new Uint8Array(out), cells: cellsTotal, pages: pages.length, tables: tableCount, ocrPages, sheets: wb.SheetNames.length }
}

// Renders a page without its text and images (vector art only), so the
// editable text boxes and pictures can sit on top. MuPDF removes them with a
// full-page redaction on its own copy of the file.
async function vectorBackground(mupdf, doc, index, widthPx) {
  const pdfPage = doc.loadPage(index)
  try {
    const bounds = pdfPage.getBounds()
    const annot = pdfPage.createAnnotation('Redact')
    annot.setRect(bounds)
    pdfPage.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_REMOVE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE)
    const scale = widthPx / Math.max(1, bounds[2] - bounds[0])
    const pix = pdfPage.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
    try {
      return pix.asPNG().slice()
    } finally {
      pix.destroy?.()
    }
  } finally {
    pdfPage.destroy?.()
  }
}

// editable: text boxes + positioned pictures per slide, a raster background
// only where the page has vector art; each page keeps its aspect, letterboxed
// into the slide size of the most common page shape. editable: false gives
// one picture per slide (the old behaviour).
export async function pdfToPptx(bytes, pageCount, onProgress = () => {}, { editable = true } = {}) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  if (!editable) {
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
      pptx.addSlide().addImage({ data: `image/jpeg;base64,${b64(img.bytes)}`, x: 0, y: 0, w: wIn, h: hIn })
    }
    return new Uint8Array(await pptx.write({ outputType: 'arraybuffer' }))
  }

  const { L, pages } = await readPages(bytes, onProgress)
  // slide shape: the most common page aspect
  const aspects = new Map()
  for (const p of pages) {
    const v = viewOf(p)
    const k = (v.w / v.h).toFixed(2)
    aspects.set(k, (aspects.get(k) ?? 0) + 1)
  }
  const aspect = Number([...aspects.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0.77)
  const W = 10
  const H = W / aspect
  pptx.defineLayout({ name: 'PDF', width: W, height: H })
  pptx.layout = 'PDF'

  let mupdf = null
  let mdoc = null
  try {
    for (let pi = 0; pi < pages.length; pi++) {
      const page = pages[pi]
      onProgress(`building slide ${pi + 1} of ${pages.length}`)
      const v = viewOf(page)
      const s = Math.min(W / v.w, H / v.h) // inches per point
      const ox = (W - v.w * s) / 2
      const oy = (H - v.h * s) / 2
      const X = (x) => ox + (x - v.x0) * s
      const Y = (yTop) => oy + (v.y0 + v.h - yTop) * s
      const slide = pptx.addSlide()

      if (page.vectorPaths > 0) {
        if (!mdoc) {
          mupdf = await import('mupdf')
          mdoc = mupdf.Document.openDocument(new Uint8Array(bytes.slice(0)), 'application/pdf')
          // unrotated pages, so the background matches the upright text
          for (let i = 0; i < mdoc.countPages(); i++) mdoc.findPage(i).put('Rotate', 0)
        }
        try {
          const png = await vectorBackground(mupdf, mdoc, pi, 1600)
          slide.addImage({ data: `image/png;base64,${b64(png)}`, x: ox, y: oy, w: v.w * s, h: v.h * s })
        } catch {
          // no background: text and pictures still come through
        }
      }
      for (const img of page.images) {
        slide.addImage({ data: `image/png;base64,${b64(img.png)}`, x: X(img.x), y: Y(img.yTop), w: img.w * s, h: img.h * s })
      }
      for (const f of L.buildFrames(L.buildLines(page.items))) {
        const runs = []
        f.lines.forEach((line, li) => {
          const lr = L.paragraphRuns([line])
          lr.forEach((r, ri) =>
            runs.push({
              text: r.text,
              options: {
                bold: r.bold,
                italic: r.italic,
                fontSize: Math.max(4, Math.round(r.size * s * 72 * 2) / 2),
                fontFace: r.font || undefined,
                color: r.color || undefined,
                breakLine: ri === lr.length - 1 && li < f.lines.length - 1,
              },
            }),
          )
        })
        if (!runs.length) continue
        slide.addText(runs, {
          x: X(f.x0),
          y: Y(f.top),
          w: Math.max(0.2, (f.x1 - f.x0) * s * 1.08 + 0.05),
          h: Math.max(0.15, (f.top - f.bottom) * s + 0.04),
          margin: 0,
          valign: 'top',
          wrap: false,
          align: f.rtl ? 'right' : 'left',
          rtlMode: f.rtl || undefined,
          lineSpacing: f.lines.length > 1 ? Math.round(f.pitch * s * 72 * 10) / 10 : undefined,
        })
      }
    }
  } finally {
    mdoc?.destroy?.()
  }
  return new Uint8Array(await pptx.write({ outputType: 'arraybuffer' }))
}
