// In-browser self-test: generates known PDFs from scratch, runs every core
// operation on them, and reads the OUTPUT content back (via pdf.js) to prove
// each tool still works in this exact browser + dependency combination.
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  mergePdfs,
  splitByRanges,
  extractPages,
  removePages,
  rotatePdf,
  reorderPages,
  getRotations,
  getPageCount,
} from './pdfOps.js'
import { parseRangeSpec, everyNRanges, formatPages } from './pageRanges.js'
import { getPageTexts, renderPageToImage } from './pdfText.js'
import { imagesToPdf, normalizeImage, sniffImageType } from './imageOps.js'

async function makeTestPdf(label, pageCount) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([300, 400])
    page.drawText(`${label}-P${i}`, { x: 40, y: 340, size: 18, font })
  }
  return doc.save()
}

// A page with a title and a real ruled 3x3 table — ground truth for the
// table-detection pipeline used by PDF→Word and PDF→Excel.
async function makeTablePdf() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([400, 300])
  page.drawText('Quarterly Report', { x: 40, y: 260, size: 20, font: bold })
  const xs = [40, 150, 260, 360]
  const ys = [220, 190, 160, 130]
  for (const y of ys) page.drawLine({ start: { x: xs[0], y }, end: { x: xs[3], y }, thickness: 1 })
  for (const x of xs) page.drawLine({ start: { x, y: ys[3] }, end: { x, y: ys[0] }, thickness: 1 })
  const cells = [
    ['Item', 'Qty', 'Price'],
    ['Widget', '4', '9.50'],
    ['Gadget', '12', '19.99'],
  ]
  cells.forEach((row, r) =>
    row.forEach((text, c) => {
      page.drawText(text, { x: xs[c] + 6, y: ys[r] - 20, size: 11, font: r === 0 ? bold : font })
    }),
  )
  return doc.save()
}

function expectEqual(actual, expected, what) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`)
}

// Returns [{ name, pass, detail }]. onProgress(name) fires as each check starts.
export async function runSelfTest(onProgress = () => {}) {
  const results = []
  const check = async (name, fn) => {
    onProgress(name)
    try {
      const detail = (await fn()) || 'ok'
      results.push({ name, pass: true, detail })
    } catch (err) {
      results.push({ name, pass: false, detail: err.message })
    }
  }

  let a = null
  let b = null

  await check('Generate test PDFs (pdf-lib)', async () => {
    a = await makeTestPdf('A', 3)
    b = await makeTestPdf('B', 2)
    expectEqual(await getPageCount(a), 3, 'test PDF A page count')
    return 'created 3-page and 2-page test documents'
  })

  await check('Read text back (pdf.js engine)', async () => {
    expectEqual(await getPageTexts(a), ['A-P1', 'A-P2', 'A-P3'], 'page texts')
    return 'text extraction matches what was written'
  })

  await check('Merge', async () => {
    const merged = await mergePdfs([a, b])
    expectEqual(await getPageTexts(merged), ['A-P1', 'A-P2', 'A-P3', 'B-P1', 'B-P2'], 'merged order')
    return '3 + 2 pages merged in order'
  })

  await check('Merge with per-file page edits', async () => {
    // A contributes pages 3,1 (page 2 deleted, order flipped); B contributes only page 2.
    const merged = await mergePdfs([
      { bytes: a, pageNumbers: [3, 1] },
      { bytes: b, pageNumbers: [2] },
    ])
    expectEqual(await getPageTexts(merged), ['A-P3', 'A-P1', 'B-P2'], 'edited merge')
    let threw = false
    try {
      await mergePdfs([{ bytes: a, pageNumbers: [] }])
    } catch {
      threw = true
    }
    if (!threw) throw new Error('merging zero pages should be refused')
    return 'deleted/reordered pages honored; zero-page merge refused'
  })

  await check('Split by ranges', async () => {
    const parts = await splitByRanges(a, parseRangeSpec('1-2, 3', 3).ranges)
    expectEqual(parts.length, 2, 'number of parts')
    expectEqual(await getPageTexts(parts[0].bytes), ['A-P1', 'A-P2'], 'part 1')
    expectEqual(await getPageTexts(parts[1].bytes), ['A-P3'], 'part 2')
    return '"1-2, 3" produced correct parts'
  })

  await check('Split every N pages', async () => {
    const parts = await splitByRanges(a, everyNRanges(2, 3))
    expectEqual(parts.map((p) => [p.from, p.to]), [[1, 2], [3, 3]], 'ranges')
    return 'every-2-pages split of a 3-page file -> 2 + 1'
  })

  await check('Extract pages', async () => {
    const out = await extractPages(a, parseRangeSpec('1, 3', 3).pages)
    expectEqual(await getPageTexts(out), ['A-P1', 'A-P3'], 'extracted pages')
    return 'pages 1 and 3 extracted'
  })

  await check('Remove pages', async () => {
    const out = await removePages(a, parseRangeSpec('2', 3).pages)
    expectEqual(await getPageTexts(out), ['A-P1', 'A-P3'], 'remaining pages')
    return 'page 2 removed, others intact'
  })

  await check('Remove-all guard', async () => {
    try {
      await removePages(a, [1, 2, 3])
    } catch {
      return 'removing every page is correctly refused'
    }
    throw new Error('removing all pages should be refused but was not')
  })

  await check('Rotate', async () => {
    const out = await rotatePdf(a, 90)
    expectEqual(await getRotations(out), [90, 90, 90], 'rotations after +90')
    const out2 = await rotatePdf(out, 270)
    expectEqual(await getRotations(out2), [0, 0, 0], 'rotations after +270 more')
    return '90° applied, 90°+270° returns to upright'
  })

  await check('Rotate selected pages only', async () => {
    const out = await rotatePdf(a, 180, [2])
    expectEqual(await getRotations(out), [0, 180, 0], 'only page 2 rotated')
    return 'page 2 rotated 180°, pages 1 and 3 untouched'
  })

  await check('Reorder pages', async () => {
    const out = await reorderPages(a, [2, 0, 1])
    expectEqual(await getPageTexts(out), ['A-P3', 'A-P1', 'A-P2'], 'new order')
    return 'order 3,1,2 verified by reading page text'
  })

  await check('Range parser edge cases', async () => {
    expectEqual(parseRangeSpec('2-', 5).pages, [2, 3, 4, 5], 'open-ended range')
    expectEqual(parseRangeSpec('1-3, 2-4', 5).pages, [1, 2, 3, 4], 'overlap de-dup')
    for (const bad of ['', '0', '9', '5-2', 'abc', '1-99']) {
      let threw = false
      try {
        parseRangeSpec(bad, 5)
      } catch {
        threw = true
      }
      if (!threw) throw new Error(`invalid spec "${bad}" was accepted`)
    }
    return 'valid specs parse, 6 kinds of invalid input rejected'
  })

  await check('Images to PDF (JPG + PNG)', async () => {
    const makeImage = async (mime) => {
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 80
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#cc2222'
      ctx.fillRect(0, 0, 120, 80)
      const blob = await new Promise((res) => canvas.toBlob(res, mime, 0.9))
      return new Uint8Array(await blob.arrayBuffer())
    }
    const jpg = await normalizeImage(await makeImage('image/jpeg'))
    const png = await normalizeImage(await makeImage('image/png'))
    expectEqual([jpg.type, png.type], ['jpeg', 'png'], 'sniffed types')
    const pdf = await imagesToPdf([jpg, png], { pageSize: 'fit' })
    expectEqual(await getPageCount(pdf), 2, 'one page per image')
    const doc = await PDFDocument.load(pdf)
    const size = doc.getPage(0).getSize()
    expectEqual([Math.round(size.width), Math.round(size.height)], [120, 80], 'fit page size')
    const a4pdf = await imagesToPdf([jpg], { pageSize: 'a4', margin: 24 })
    const a4size = (await PDFDocument.load(a4pdf)).getPage(0).getSize()
    expectEqual([Math.round(a4size.width), Math.round(a4size.height)], [595, 842], 'A4 page size')
    return 'JPG and PNG embed correctly; fit and A4 page sizes verified'
  })

  await check('PDF to image export', async () => {
    const jpg = await renderPageToImage(a, 2, { width: 400, format: 'image/jpeg' })
    if (sniffImageType(jpg.bytes) !== 'jpeg') throw new Error('JPG export is not a JPEG file')
    expectEqual(jpg.width, 400, 'requested width')
    const png = await renderPageToImage(a, 1, { width: 300, format: 'image/png' })
    if (sniffImageType(png.bytes) !== 'png') throw new Error('PNG export is not a PNG file')
    // Round trip: exported image back into a PDF still one page, right shape.
    const back = await imagesToPdf([await normalizeImage(jpg.bytes)], { pageSize: 'fit' })
    expectEqual(await getPageCount(back), 1, 'round-trip page count')
    return 'JPG/PNG exports verified at requested sizes; round trip works'
  })

  await check('Compress (smart clean, MuPDF engine)', async () => {
    const { cleanPdf } = await import('./mupdfOps.js')
    const res = await cleanPdf(a)
    if (res.note) {
      // tiny test docs are often already tight — content must still be intact
      expectEqual(await getPageTexts(res.bytes), ['A-P1', 'A-P2', 'A-P3'], 'kept-original texts')
      return `engine ran; ${res.note}; content intact`
    }
    expectEqual(await getPageTexts(res.bytes), ['A-P1', 'A-P2', 'A-P3'], 'compressed texts')
    return `compressed ${a.length} → ${res.bytes.length} bytes with content intact`
  })

  await check('Repair damaged PDF', async () => {
    const { repairPdf } = await import('./mupdfOps.js')
    // A 6-page doc with its tail torn off — the same damage class as a broken
    // download: xref gone, some object-stream data destroyed, pages themselves
    // still present in the surviving bytes.
    const big = await makeTestPdf('R', 6)
    const damaged = big.slice(0, big.length - 250)
    const res = await repairPdf(damaged)
    if (res.recovered + res.rasterized < 1) throw new Error('nothing was recovered')
    const texts = await getPageTexts(res.bytes)
    expectEqual(texts.length, res.pageCount, 'repaired page count')
    expectEqual(texts[0], 'R-P1', 'first page content survives')
    const withContent = texts.filter((t) => t.trim()).length
    let threw = false
    try {
      await repairPdf(new Uint8Array([1, 2, 3, 4, 5]))
    } catch {
      threw = true
    }
    if (!threw) throw new Error('garbage input should be reported unrecoverable')
    return `${res.recovered}/${res.pageCount} page structures recovered (${withContent}/${res.pageCount} with content); garbage input refused cleanly`
  })

  await check('Watermark text', async () => {
    const { watermarkText } = await import('./stampOps.js')
    const out = await watermarkText(a, { text: 'DRAFT', pages: [1, 3] })
    const texts = await getPageTexts(out)
    if (!texts[0].includes('DRAFT') || !texts[2].includes('DRAFT')) {
      throw new Error('watermark missing on targeted pages')
    }
    if (texts[1].includes('DRAFT')) throw new Error('watermark leaked onto an untargeted page')
    if (!texts[0].includes('A-P1')) throw new Error('original content damaged')
    return 'stamped only pages 1 and 3; original content untouched'
  })

  await check('Page numbers', async () => {
    const { addPageNumbers } = await import('./stampOps.js')
    const out = await addPageNumbers(a, { format: 'n-of-total' })
    const texts = await getPageTexts(out)
    expectEqual(
      texts.map((t) => t.includes('of 3')),
      [true, true, true],
      '"n of total" labels',
    )
    if (!texts[1].includes('2 of 3')) throw new Error('wrong number on page 2')
    return '"1 of 3 … 3 of 3" stamped correctly'
  })

  await check('Crop', async () => {
    const { cropPdf } = await import('./stampOps.js')
    const out = await cropPdf(a, { x: 30, y: 40, w: 200, h: 150 }, [2])
    const doc = await PDFDocument.load(out)
    const cb = doc.getPage(1).getCropBox()
    const size = doc.getPage(1).getSize()
    expectEqual(
      [Math.round(cb.x), Math.round(cb.y), Math.round(cb.width), Math.round(cb.height)],
      [30, Math.round(400 - 40 - 150), 200, 150],
      'crop box (bottom-left origin)',
    )
    const cbOther = doc.getPage(0).getCropBox()
    if (Math.round(cbOther.width) === 200) throw new Error('crop leaked onto untargeted page')
    return `page 2 cropped to 200×150 at (30,40) from top-left; other pages untouched (page is ${Math.round(size.width)}×${Math.round(size.height)})`
  })

  await check('Sign (place signature image)', async () => {
    const { signPdf } = await import('./stampOps.js')
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 60
    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = '#000'
    ctx.beginPath()
    ctx.moveTo(10, 30)
    ctx.bezierCurveTo(60, 5, 140, 55, 190, 30)
    ctx.stroke()
    const png = new Uint8Array(
      await (await new Promise((res) => canvas.toBlob(res, 'image/png'))).arrayBuffer(),
    )
    const out = await signPdf(a, png, { pageNum: 2, fx: 0.5, fy: 0.8, widthPct: 25 })
    expectEqual(await getPageCount(out), 3, 'page count intact')
    expectEqual((await getPageTexts(out))[1].includes('A-P2'), true, 'page content intact')
    return 'signature embedded on page 2 without disturbing content'
  })

  await check('Protect + Unlock (AES-256, MuPDF)', async () => {
    const { protectPdf, unlockPdf, inspectPdf } = await import('./cryptoOps.js')
    const locked = await protectPdf(a, 'test-secret-1')
    const info = await inspectPdf(locked)
    if (!info.needsUserPassword) throw new Error('open-password not detected')
    let refused = false
    try {
      await PDFDocument.load(locked)
    } catch {
      refused = true
    }
    if (!refused) throw new Error('encrypted file opened without a password')
    let wrongRefused = false
    try {
      await unlockPdf(locked, 'wrong-password')
    } catch {
      wrongRefused = true
    }
    if (!wrongRefused) throw new Error('wrong password was accepted')
    const unlocked = await unlockPdf(locked, 'test-secret-1')
    expectEqual(await getPageTexts(unlocked.bytes), ['A-P1', 'A-P2', 'A-P3'], 'content after round trip')
    return 'encrypt → refuses wrong password → unlocks with right one, content intact'
  })

  await check('Remove printing restrictions (no password)', async () => {
    // The "prints with an error" case: owner-restricted, opens without a
    // password, but printing/copying blocked. Must be removable with none.
    const mupdf = await import('mupdf')
    const src = mupdf.Document.openDocument(new Uint8Array(a.slice(0)), 'application/pdf')
    // permissions bitmask with print (bit 3) and copy (bit 5) cleared
    const restricted = src
      .saveToBuffer('encrypt=aes-256,owner-password=ownersecret,permissions=-2564')
      .asUint8Array()
      .slice()
    const { inspectPdf, unlockPdf } = await import('./cryptoOps.js')
    const info = await inspectPdf(restricted)
    if (info.needsUserPassword) throw new Error('wrongly flagged as needing an open-password')
    if (!info.restrictedOnly) throw new Error('restriction not detected — the whole point of this case')
    if (info.denied.length === 0) throw new Error('no denied permissions reported')
    // remove WITHOUT any password
    const freed = await unlockPdf(restricted, '')
    if (freed.hadUserPassword) throw new Error('should not have needed a password')
    const after = await inspectPdf(freed.bytes)
    if (after.restrictedOnly) throw new Error('restrictions survived — file still not printable')
    expectEqual(await getPageTexts(freed.bytes), ['A-P1', 'A-P2', 'A-P3'], 'content intact after unlocking')
    return `detected blocked: ${info.deniedLabels.join(', ')}; removed with no password, content intact`
  })

  await check('OCR (Tesseract engine — needs one-time model download)', async () => {
    const { ocrPdf } = await import('./ocrOps.js')
    // Build a "scan": text drawn as pixels only, no text layer.
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 400
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 800, 400)
    ctx.fillStyle = '#111'
    ctx.font = 'bold 48px Arial'
    ctx.fillText('SWISS PDF RESCUE', 60, 200)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
    const scanned = await imagesToPdf(
      [await normalizeImage(new Uint8Array(await blob.arrayBuffer()))],
      { pageSize: 'fit' },
    )
    expectEqual((await getPageTexts(scanned))[0], '', 'scan has no text layer before OCR')
    const res = await ocrPdf(scanned)
    const after = (await getPageTexts(res.bytes))[0].toUpperCase()
    if (!after.includes('SWISS') || !after.includes('RESCUE')) {
      throw new Error(`recognized text missing expected words, got: "${after.slice(0, 60)}"`)
    }
    return `scan had no text; after OCR it reads "${after.slice(0, 40).trim()}…" — searchable`
  })

  await check('PDF to Word (.docx)', async () => {
    const { pdfToDocx } = await import('./officeOps.js')
    const res = await pdfToDocx(a)
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(res.bytes)
    const xml = await zip.file('word/document.xml').async('string')
    for (const marker of ['A-P1', 'A-P2', 'A-P3']) {
      if (!xml.includes(marker)) throw new Error(`"${marker}" missing from the Word document`)
    }
    return `valid .docx with all page text present (${res.chars} chars)`
  })

  await check('PDF to Excel (.xlsx)', async () => {
    const { pdfToXlsx } = await import('./officeOps.js')
    const res = await pdfToXlsx(a)
    const XLSX = await import('xlsx')
    const wb = XLSX.read(res.bytes, { type: 'array' })
    expectEqual(wb.SheetNames.length, 3, 'one sheet per page')
    const cell = XLSX.utils.sheet_to_json(wb.Sheets['Page 2'], { header: 1 })[0][0]
    if (!String(cell).includes('A-P2')) throw new Error(`unexpected first cell on page 2: "${cell}"`)
    return 'valid workbook, 3 sheets, page text in the right sheet'
  })

  await check('PDF to PowerPoint (.pptx)', async () => {
    const { pdfToPptx } = await import('./officeOps.js')
    const bytes = await pdfToPptx(a, 3)
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(bytes)
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    expectEqual(slides.length, 3, 'one slide per page')
    const media = Object.keys(zip.files).filter((f) => f.startsWith('ppt/media/'))
    if (media.length < 3) throw new Error('slide images missing')
    return 'valid .pptx with 3 image slides'
  })

  await check('PDF table detection (ruled table → real cells)', async () => {
    const tablePdf = await makeTablePdf()
    // Excel: the grid must come back as an actual cell matrix with typed numbers
    const { pdfToXlsx, pdfToDocx } = await import('./officeOps.js')
    const xres = await pdfToXlsx(tablePdf)
    if (xres.tables < 1) throw new Error('no table detected on the page (Excel path)')
    const XLSX = await import('xlsx')
    const wb = XLSX.read(xres.bytes, { type: 'array' })
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Page 1'], { header: 1 })
    const flat = rows.map((r) => JSON.stringify(r))
    if (!flat.some((r) => r === JSON.stringify(['Item', 'Qty', 'Price']))) {
      throw new Error(`header row not found as exact cells; got ${flat.slice(0, 6).join(' ; ')}`)
    }
    if (!flat.some((r) => r === JSON.stringify(['Widget', 4, 9.5]))) {
      throw new Error(`data row with typed numbers not found; got ${flat.slice(0, 6).join(' ; ')}`)
    }
    // Word: the table must be a real Word table, the title a heading, bold preserved
    const dres = await pdfToDocx(tablePdf)
    if (dres.tables < 1) throw new Error('no table emitted in the Word document')
    const JSZip = (await import('jszip')).default
    const xml = await (await JSZip.loadAsync(dres.bytes)).file('word/document.xml').async('string')
    if (!xml.includes('<w:tbl')) throw new Error('document.xml has no <w:tbl> table element')
    for (const t of ['Widget', 'Gadget', 'Quarterly Report']) {
      if (!xml.includes(t)) throw new Error(`"${t}" missing from Word output`)
    }
    if (!/Heading/.test(xml)) throw new Error('title was not styled as a heading')
    return 'grid detected; Excel gets exact typed cells, Word gets a real table + heading'
  })

  await check('Word to PDF', async () => {
    const { Document, Packer, Paragraph, TextRun } = await import('docx')
    const docx = new Document({
      sections: [
        {
          children: [
            new Paragraph({ children: [new TextRun({ text: 'SwissPDF Word conversion test', size: 48 })] }),
            new Paragraph({ children: [new TextRun('Second paragraph of the test document.')] }),
          ],
        },
      ],
    })
    const buf = await (await Packer.toBlob(docx)).arrayBuffer()
    const { docxToPdf } = await import('./officeOps.js')
    const pdf = await docxToPdf(buf)
    const pages = await getPageCount(pdf)
    if (pages < 1) throw new Error('no pages produced')
    return `generated a .docx, converted it to a valid ${pages}-page PDF`
  })

  await check('Excel to PDF', async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Product', 'Qty', 'Price'],
        ['Widget', 4, 9.5],
        ['Gadget', 2, 19.99],
      ]),
      'Orders',
    )
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const { xlsxToPdf } = await import('./officeOps.js')
    const pdf = await xlsxToPdf(buf)
    expectEqual(await getPageCount(pdf), 1, 'one page per sheet')
    return 'generated a workbook, converted to a valid 1-page PDF'
  })

  await check('PowerPoint to PDF', async () => {
    const PptxGenJS = (await import('pptxgenjs')).default
    const pptx = new PptxGenJS()
    const s1 = pptx.addSlide()
    s1.addText('SwissPDF slide one', { x: 1, y: 1, w: 8, h: 1, fontSize: 32 })
    const s2 = pptx.addSlide()
    s2.addText('Second slide', { x: 1, y: 1, w: 8, h: 1, fontSize: 24 })
    const buf = await pptx.write({ outputType: 'arraybuffer' })
    const { pptxToPdf } = await import('./officeOps.js')
    const pdf = await pptxToPdf(buf)
    expectEqual(await getPageCount(pdf), 2, 'one page per slide')
    return 'generated a 2-slide deck, converted to a valid 2-page PDF'
  })

  await check('PDF to Word keeps images (positioned)', async () => {
    // Build a PDF with an embedded photo-like PNG + text, convert, and check
    // the image lands in the Word file as an anchored drawing.
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 120
    const ctx = canvas.getContext('2d')
    const grad = ctx.createLinearGradient(0, 0, 160, 120)
    grad.addColorStop(0, '#2266cc')
    grad.addColorStop(1, '#cc6622')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 160, 120)
    const pngBytes = new Uint8Array(
      await (await new Promise((res) => canvas.toBlob(res, 'image/png'))).arrayBuffer(),
    )
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([400, 300])
    page.drawText('Report with a picture', { x: 40, y: 270, size: 14, font })
    const png = await doc.embedPng(pngBytes)
    page.drawImage(png, { x: 120, y: 90, width: 160, height: 120 })
    const pdf = await doc.save()

    const { pdfToDocx } = await import('./officeOps.js')
    const res = await pdfToDocx(pdf)
    if (res.images !== 1) throw new Error(`expected 1 image, extractor found ${res.images}`)
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(res.bytes)
    const media = Object.keys(zip.files).filter(
      (f) => f.startsWith('word/media/') && !zip.files[f].dir,
    )
    if (media.length !== 1) throw new Error(`docx media folder has ${media.length} files`)
    const imgBytes = await zip.file(media[0]).async('uint8array')
    if (imgBytes.length < 300) throw new Error('embedded image is suspiciously small')
    const xml = await zip.file('word/document.xml').async('string')
    if (!xml.includes('<wp:anchor')) throw new Error('image is not anchored/positioned')
    if (!xml.includes('Report with a picture')) throw new Error('text lost alongside the image')
    return 'image extracted, embedded in word/media, anchored at its page position'
  })

  await check('PDF to Word exact layout (payslip / form mode)', async () => {
    // Payslip-like page: scattered label/value pairs with NO ruling lines,
    // plus two real AcroForm text fields — the cases that broke flowing mode.
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const page = doc.addPage([500, 400])
    page.drawText('PAYSLIP', { x: 200, y: 370, size: 18, font: bold })
    page.drawText('Employee:', { x: 40, y: 330, size: 10, font })
    page.drawText('Jane Doe', { x: 140, y: 330, size: 10, font: bold })
    page.drawText('Period:', { x: 300, y: 330, size: 10, font })
    page.drawText('July 2026', { x: 380, y: 330, size: 10, font })
    page.drawText('Gross pay', { x: 40, y: 290, size: 10, font })
    page.drawText('5,400.00', { x: 200, y: 290, size: 10, font })
    page.drawText('Net pay', { x: 40, y: 270, size: 10, font })
    page.drawText('4,102.50', { x: 200, y: 270, size: 10, font })
    const form = doc.getForm()
    const nameField = form.createTextField('emp.name')
    nameField.setText('Jane Doe')
    nameField.addToPage(page, { x: 300, y: 240, width: 150, height: 18 })
    const noteField = form.createTextField('emp.note')
    noteField.addToPage(page, { x: 300, y: 210, width: 150, height: 18 })
    const pdf = await doc.save()

    const { pdfToDocx } = await import('./officeOps.js')
    const res = await pdfToDocx(pdf, () => {}, 'exact')
    if (res.fields !== 2) throw new Error(`expected 2 form fields, found ${res.fields}`)
    const JSZip = (await import('jszip')).default
    const xml = await (await JSZip.loadAsync(res.bytes)).file('word/document.xml').async('string')
    // 1 title + 4 label/value segments on the header line + 2 pay rows split
    // into label+amount + 2 form fields => 11 independently editable frames
    const frameCount = (xml.match(/<w:framePr/g) || []).length
    if (frameCount < 10) throw new Error(`only ${frameCount} positioned frames — labels/values not separately editable`)
    for (const t of ['PAYSLIP', 'Employee:', 'Jane Doe', '5,400.00', '4,102.50']) {
      if (!xml.includes(t)) throw new Error(`"${t}" missing from exact-layout output`)
    }
    // page size must match the PDF page (500x400pt = 10000x8000 twips)
    if (!/w:pgSz[^>]*w:w="10000"[^>]*w:h="8000"/.test(xml) && !/w:pgSz[^>]*w="10000"/.test(xml)) {
      throw new Error('Word page size does not match the PDF page')
    }
    return `${frameCount} pinned frames, 2 form fields carried over, page size matched`
  })

  await check('Auto-OCR fallback inside PDF→Word (scanned pages)', async () => {
    // A "scan": the page is one big image of text, zero text layer.
    const canvas = document.createElement('canvas')
    canvas.width = 1000
    canvas.height = 700
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 1000, 700)
    ctx.fillStyle = '#111'
    ctx.font = 'bold 52px Arial'
    ctx.fillText('SCANNED INVOICE', 80, 150)
    ctx.font = '40px Arial'
    ctx.fillText('Total due 725', 80, 350)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
    const scanned = await imagesToPdf(
      [await normalizeImage(new Uint8Array(await blob.arrayBuffer()))],
      { pageSize: 'fit' },
    )
    const { pdfToDocx } = await import('./officeOps.js')
    const res = await pdfToDocx(scanned, () => {}, 'exact')
    if (res.ocrPages !== 1) throw new Error(`expected 1 OCR'd page, got ${res.ocrPages}`)
    const JSZip = (await import('jszip')).default
    const xml = await (await JSZip.loadAsync(res.bytes)).file('word/document.xml').async('string')
    for (const t of ['SCANNED', 'INVOICE', '725']) {
      if (!xml.toUpperCase().includes(t)) throw new Error(`"${t}" not recognized into the Word file`)
    }
    if (!xml.includes('<w:framePr')) throw new Error('OCR text was not pinned into frames')
    return 'textless page detected, OCR ran automatically, words pinned editable at their positions'
  })

  await check('PDF to Markdown', async () => {
    const { pdfToMarkdown } = await import('./markdownOps.js')
    const tablePdf = await makeTablePdf()
    const res = await pdfToMarkdown(tablePdf)
    if (!/^#{1,2} Quarterly Report/m.test(res.text)) {
      throw new Error(`title did not become a heading; got: ${res.text.slice(0, 80)}`)
    }
    if (!res.text.includes('| Item | Qty | Price |')) throw new Error('table header row missing')
    if (!/\|\s*---\s*\|/.test(res.text)) throw new Error('markdown table separator missing')
    if (!res.text.includes('| Widget | 4 | 9.50 |')) throw new Error('table data row missing')
    return `heading + ${res.tables} markdown table produced`
  })

  await check('Compare PDFs (word-level diff)', async () => {
    const { comparePdfs } = await import('./compareOps.js')
    const makeDoc = async (lines) => {
      const d = await PDFDocument.create()
      const f = await d.embedFont(StandardFonts.Helvetica)
      const p = d.addPage([300, 200])
      lines.forEach((t, i) => p.drawText(t, { x: 30, y: 160 - i * 24, size: 12, font: f }))
      return d.save()
    }
    const v1 = await makeDoc(['alpha beta gamma', 'second line here'])
    const v2 = await makeDoc(['alpha DELTA gamma', 'second line here'])
    const same = await comparePdfs(v1, v1)
    if (!same.identical) throw new Error('identical files reported as different')
    const diff = await comparePdfs(v1, v2)
    if (diff.identical) throw new Error('changed file reported as identical')
    if (diff.added !== 1 || diff.removed !== 1) {
      throw new Error(`expected 1 added / 1 removed, got ${diff.added}/${diff.removed}`)
    }
    const removedWord = diff.pages[0].removedBoxes[0]
    const addedWord = diff.pages[0].addedBoxes[0]
    if (removedWord.text !== 'beta' || addedWord.text !== 'DELTA') {
      throw new Error(`wrong words flagged: -${removedWord.text} +${addedWord.text}`)
    }
    if (!(removedWord.w > 0 && removedWord.h > 0)) throw new Error('diff box has no position')
    return 'identical files match; single word change located precisely with a box'
  })

  await check('Redact destroys content (not just covers it)', async () => {
    const { redactPdf, findTextBoxes } = await import('./redactOps.js')
    const d = await PDFDocument.create()
    const f = await d.embedFont(StandardFonts.Helvetica)
    const p = d.addPage([300, 200])
    p.drawText('Account 4455-9911', { x: 30, y: 150, size: 12, font: f })
    p.drawText('Keep this line', { x: 30, y: 120, size: 12, font: f })
    const src = await d.save()
    const boxes = await findTextBoxes(src, ['4455-9911'])
    if (boxes.length !== 1) throw new Error(`search found ${boxes.length} matches, expected 1`)
    const out = await redactPdf(src, boxes)
    const texts = await getPageTexts(out)
    const joined = texts.join(' ')
    if (joined.includes('4455-9911')) {
      throw new Error('SECRET SURVIVED — redacted text is still extractable')
    }
    if (joined.trim() !== '') {
      throw new Error(`redacted page should carry no extractable text, got: "${joined.slice(0, 40)}"`)
    }
    if (out.length < 1000) throw new Error('output looks empty')
    return 'searched text located, redacted page contains no recoverable text at all'
  })

  await check('HTML to PDF', async () => {
    const { htmlToPdf } = await import('./htmlOps.js')
    const bytes = await htmlToPdf(
      '<h1>Invoice 42</h1><p>Payable to <b>Acme</b></p><script>window.__x=1</script>',
    )
    const pages = await getPageCount(bytes)
    if (pages < 1) throw new Error('no pages produced')
    if (window.__x !== undefined) throw new Error('script in the HTML was executed — must be stripped')
    return `rendered to a valid ${pages}-page PDF with scripts stripped`
  })

  await check('PDF Forms — all field types (detect, fill, flatten)', async () => {
    const { listFields, fillFields, flattenForm } = await import('./formOps.js')
    const doc = await PDFDocument.create()
    const page = doc.addPage([400, 360])
    const form = doc.getForm()
    form.createTextField('f.name').addToPage(page, { x: 40, y: 320, width: 200, height: 20 })
    form.createCheckBox('f.agree').addToPage(page, { x: 40, y: 290, width: 16, height: 16 })
    const dd = form.createDropdown('f.country')
    dd.addOptions(['USA', 'India', 'UK'])
    dd.addToPage(page, { x: 40, y: 250, width: 150, height: 18 })
    const radio = form.createRadioGroup('f.plan')
    radio.addOptionToPage('Basic', page, { x: 40, y: 210, width: 15, height: 15 })
    radio.addOptionToPage('Pro', page, { x: 140, y: 210, width: 15, height: 15 })
    const list = form.createOptionList('f.colors')
    list.addOptions(['Red', 'Green', 'Blue'])
    list.addToPage(page, { x: 40, y: 150, width: 120, height: 50 })
    const src = await doc.save()

    const found = await listFields(src)
    // radio yields one entry per option → 6 widget entries total
    expectEqual(found.length, 6, 'widget entries (radio counts twice)')
    const radios = found.filter((f) => f.type === 'radio')
    expectEqual(
      radios.map((f) => f.widgetOption),
      ['Basic', 'Pro'],
      'each radio widget tagged with its option',
    )
    const filled = await fillFields(src, {
      'f.name': 'Sam Lee',
      'f.agree': true,
      'f.country': 'India',
      'f.plan': 'Pro',
      'f.colors': 'Green',
    })
    expectEqual(filled.filled, 5, 'all five fields filled')
    const after = await listFields(filled.bytes)
    const val = (n) => after.find((f) => f.name === n)?.value
    expectEqual(val('f.name'), 'Sam Lee', 'text')
    expectEqual(val('f.agree'), 'on', 'checkbox')
    expectEqual(val('f.country'), 'India', 'dropdown')
    expectEqual(val('f.plan'), 'Pro', 'radio')
    expectEqual(val('f.colors'), 'Green', 'list')

    const flat = await flattenForm(filled.bytes)
    expectEqual((await listFields(flat.bytes)).length, 0, 'no fields after flatten')
    return 'text, checkbox, dropdown, radio and list all detected, filled and flattened'
  })

  await check('PDF Forms — create all field types on a flat PDF', async () => {
    const { addFields, listFields } = await import('./formOps.js')
    const plain = await makeTestPdf('F', 1)
    const withNew = await addFields(plain, [
      { type: 'text', name: 'note', pageIndex: 0, x: 30, y: 40, w: 150, h: 18 },
      { type: 'checkbox', name: 'ok', pageIndex: 0, x: 30, y: 70, w: 15, h: 15 },
      { type: 'dropdown', name: 'size', options: ['S', 'M', 'L'], pageIndex: 0, x: 30, y: 100, w: 100, h: 18 },
      { type: 'radio', name: 'ship', options: ['Air', 'Sea'], pageIndex: 0, x: 30, y: 130, w: 120, h: 15 },
    ])
    const fields = await listFields(withNew.bytes)
    const names = new Set(fields.map((f) => f.name))
    for (const n of ['note', 'ok', 'size', 'ship']) {
      if (!names.has(n)) throw new Error(`created field "${n}" missing`)
    }
    const ship = fields.filter((f) => f.name === 'ship')
    expectEqual(ship.length, 2, 'radio group created with 2 options')
    const size = fields.find((f) => f.name === 'size')
    expectEqual(size.options, ['S', 'M', 'L'], 'dropdown options')
    return 'created text, checkbox, dropdown and a 2-option radio group on a flat PDF'
  })

  await check('Detect fill-in areas on a blank form', async () => {
    const { detectFillAreas } = await import('./formOps.js')
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([400, 300])
    // two write-on lines + an underscore blank
    page.drawText('Name', { x: 40, y: 250, size: 12, font })
    page.drawLine({ start: { x: 90, y: 246 }, end: { x: 320, y: 246 }, thickness: 1 })
    page.drawText('Date', { x: 40, y: 210, size: 12, font })
    page.drawLine({ start: { x: 90, y: 206 }, end: { x: 220, y: 206 }, thickness: 1 })
    page.drawText('Ref: ________', { x: 40, y: 170, size: 12, font })
    const bytes = await doc.save()
    const areas = await detectFillAreas(bytes)
    if (areas.length < 3) throw new Error(`expected 3+ fill areas, found ${areas.length}`)
    const lines = areas.filter((x) => x.source === 'line').length
    const unders = areas.filter((x) => x.source === 'underscore').length
    if (lines < 2 || unders < 1) throw new Error(`expected 2 lines + 1 underscore, got ${lines}/${unders}`)
    return `found ${lines} write-on lines and ${unders} underscore blank`
  })

  await check('Edit PDF (text, shapes, ink, image)', async () => {
    const { applyEdits } = await import('./editOps.js')
    const src = await makeTestPdf('E', 2)
    const canvas = document.createElement('canvas')
    canvas.width = 40
    canvas.height = 30
    canvas.getContext('2d').fillRect(0, 0, 40, 30)
    const png = new Uint8Array(
      await (await new Promise((r) => canvas.toBlob(r, 'image/png'))).arrayBuffer(),
    )
    const out = await applyEdits(src, [
      { type: 'text', pageIndex: 0, x: 40, y: 60, text: 'Approved by SwissPDF', size: 13, color: '#d92d20' },
      { type: 'rect', pageIndex: 0, x: 30, y: 100, w: 120, h: 40, color: '#1570cb', borderWidth: 2 },
      { type: 'ellipse', pageIndex: 0, x: 30, y: 160, w: 80, h: 40, color: '#067647' },
      { type: 'line', pageIndex: 0, x: 20, y: 220, x2: 200, y2: 240, color: '#111111' },
      { type: 'highlight', pageIndex: 1, x: 20, y: 50, w: 160, h: 16 },
      { type: 'ink', pageIndex: 1, points: [{ x: 30, y: 120 }, { x: 60, y: 140 }, { x: 90, y: 110 }], color: '#6938ef' },
      { type: 'image', pageIndex: 1, x: 150, y: 200, w: 60, h: 45, bytes: png, imgType: 'png' },
    ])
    expectEqual(await getPageCount(out), 2, 'page count unchanged')
    const texts = await getPageTexts(out)
    if (!texts[0].includes('Approved by SwissPDF')) throw new Error('added text missing from page 1')
    if (!texts[0].includes('E-P1')) throw new Error('original page content was damaged')
    if (out.length <= src.length) throw new Error('edits do not appear to have been written')
    return 'text, rectangle, ellipse, line, highlight, freehand ink and an image all applied'
  })

  await check('High-fidelity engine (LibreOffice WASM)', async () => {
    const { engineAvailable } = await import('./libreOffice.js')
    if (!engineAvailable()) {
      throw new Error('cross-origin isolation is off — the high-fidelity engine cannot start in this hosting setup')
    }
    // Only exercise the engine if it is already booted — never force the
    // ~200MB download from a health check.
    const { Document, Packer, Paragraph } = await import('docx')
    const probe = new Document({ sections: [{ children: [new Paragraph('Engine probe text')] }] })
    const buf = await (await Packer.toBlob(probe)).arrayBuffer()
    const lo = await import('./libreOffice.js')
    if (!lo.engineLoaded()) {
      return 'isolation active; engine downloads on demand (not booted yet — used by Office→PDF high-fidelity mode)'
    }
    const pdf = await lo.convertToPdfHiFi(buf, 'probe.docx')
    const texts = await getPageTexts(pdf)
    if (!texts[0].includes('Engine probe text')) throw new Error('engine output lost the text layer')
    return 'engine converts with true selectable text'
  })

  await check('Click-selection round trip', async () => {
    expectEqual(formatPages([3, 1, 2, 5]), '1-3, 5', 'formatPages output')
    expectEqual(parseRangeSpec(formatPages([1, 2, 3, 5, 9]), 10).pages, [1, 2, 3, 5, 9], 'round trip')
    return 'thumbnail clicks and the range box stay in sync'
  })

  return results
}
