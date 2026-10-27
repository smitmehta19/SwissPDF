// Runs inside the app page (served by Vite). Calls the app's real ops from
// /src/lib on corpus files fetched from /test-corpus, uploads every output to
// the runner, and returns small JSON facts. Node validates the outputs.

async function load(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`fetch ${path}: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

// Uploads in 8 MB chunks: Playwright copies request bodies into its protocol
// messages, and one 100 MB body overflows Node's string limit.
const CHUNK = 8 * 1024 * 1024
async function save(caseId, name, bytes) {
  const url = `/__corpus/out/${encodeURIComponent(caseId)}/${encodeURIComponent(name)}`
  for (let at = 0, part = 0; at < bytes.length || part === 0; at += CHUNK, part++) {
    const res = await fetch(`${url}?part=${part}`, { method: 'POST', body: bytes.subarray(at, at + CHUNK) })
    if (!res.ok) throw new Error(`upload ${name}: ${res.status}`)
  }
  return { name, size: bytes.length }
}

const lib = (name) => import(/* @vite-ignore */ `/src/lib/${name}.js`)

// Black-on-transparent PNG used as a signature / stamp image.
async function signaturePng() {
  const c = document.createElement('canvas')
  c.width = 400
  c.height = 120
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.font = 'bold 64px serif'
  ctx.fillText('J. Corpus', 20, 85)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

// Share of non-white pixels in an encoded image (blank-render detector).
async function inkRatio(bytes) {
  const bmp = await createImageBitmap(new Blob([bytes]))
  const w = 300
  const h = Math.max(1, Math.round((bmp.height / bmp.width) * w))
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data
  let ink = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) ink++
  return { ratio: ink / (w * h), width: bmp.width, height: bmp.height }
}

// Where does `term` sit on the visible page? Returns viewport rects (scale 1).
async function termRects(bytes, term) {
  const { openPdfDocument, serializedPdfOp } = await lib('pdfText')
  return serializedPdfOp(async () => {
    // cached by the app: do not destroy
    const doc = await openPdfDocument(bytes)
    const rects = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const vp = page.getViewport({ scale: 1 })
      const tc = await page.getTextContent()
      for (const it of tc.items) {
        const at = it.str.toLowerCase().indexOf(term.toLowerCase())
        if (at === -1) continue
        // run rectangle in user space along the baseline, then to viewport
        const [a, b, c, d, e, f] = it.transform
        const ul = Math.hypot(a, b) || 1
        const fontH = Math.hypot(c, d) || 1
        const u = [a / ul, b / ul]
        const v = [c / fontH, d / fontH]
        const perChar = it.width / Math.max(1, it.str.length)
        const s0 = [e + u[0] * at * perChar, f + u[1] * at * perChar]
        const s1 = [s0[0] + u[0] * term.length * perChar, s0[1] + u[1] * term.length * perChar]
        const up = (q) => [q[0] + v[0] * fontH * 0.7, q[1] + v[1] * fontH * 0.7]
        const pts = [s0, s1, up(s0), up(s1)].map((q) => vp.convertToViewportPoint(q[0], q[1]))
        const xs = pts.map((q) => q[0])
        const ys = pts.map((q) => q[1])
        const x = Math.min(...xs)
        const y = Math.min(...ys)
        rects.push({ page: n, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, vw: vp.width, vh: vp.height })
      }
    }
    return rects
  })
}

// Dark-pixel share inside each rect after rendering the output page.
async function darkShare(bytes, rects) {
  const { openPdfDocument, serializedPdfOp } = await lib('pdfText')
  return serializedPdfOp(async () => {
    const doc = await openPdfDocument(bytes)
    const out = []
    for (const r of rects) {
      const page = await doc.getPage(r.page)
      const vp = page.getViewport({ scale: 2 })
      const sx = vp.width / r.vw
      const sy = vp.height / r.vh
      const c = document.createElement('canvas')
      c.width = Math.ceil(vp.width)
      c.height = Math.ceil(vp.height)
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise
      const x = Math.max(0, Math.floor(r.x * sx))
      const y = Math.max(0, Math.floor(r.y * sy))
      const w = Math.max(1, Math.min(c.width - x, Math.floor(r.w * sx)))
      const h = Math.max(1, Math.min(c.height - y, Math.floor(r.h * sy)))
      const d = ctx.getImageData(x, y, w, h).data
      let dark = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 60) dark++
      out.push(dark / (w * h))
    }
    return out
  })
}

const OPS = {
  async merge(s, files) {
    const { mergePdfs } = await lib('pdfOps')
    const bytes = await mergePdfs(files)
    return { outputs: [await save(s.id, 'merged.pdf', bytes)] }
  },
  async split(s, [src]) {
    const { splitByRanges, getPageCount } = await lib('pdfOps')
    const n = await getPageCount(src)
    const cut = Math.max(1, Math.floor(n / 2))
    const ranges = n > 1 ? [{ from: 1, to: cut }, { from: cut + 1, to: n }] : [{ from: 1, to: 1 }]
    const outs = await splitByRanges(src, ranges)
    const outputs = []
    for (const [i, o] of outs.entries()) outputs.push(await save(s.id, `part${i + 1}.pdf`, o.bytes))
    return { outputs, meta: { ranges } }
  },
  async extract(s, [src]) {
    const { extractPages } = await lib('pdfOps')
    const bytes = await extractPages(src, s.params.pages)
    return { outputs: [await save(s.id, 'extracted.pdf', bytes)] }
  },
  async remove(s, [src]) {
    const { removePages } = await lib('pdfOps')
    const bytes = await removePages(src, s.params.pages)
    return { outputs: [await save(s.id, 'removed.pdf', bytes)] }
  },
  async rotate(s, [src]) {
    const { rotatePdf } = await lib('pdfOps')
    const bytes = await rotatePdf(src, s.params.angle ?? 90)
    return { outputs: [await save(s.id, 'rotated.pdf', bytes)] }
  },
  async organize(s, [src]) {
    const { reorderPages, getPageCount } = await lib('pdfOps')
    const n = await getPageCount(src)
    const order = Array.from({ length: n }, (_, i) => n - 1 - i)
    const bytes = await reorderPages(src, order)
    return { outputs: [await save(s.id, 'reversed.pdf', bytes)], meta: { pages: n } }
  },
  async compressClean(s, [src]) {
    const { cleanPdf } = await lib('mupdfOps')
    const res = await cleanPdf(src)
    return { outputs: [await save(s.id, 'compressed.pdf', res.bytes)], meta: { note: res.note, before: src.length } }
  },
  // Mirrors CompressTool "Maximum" mode: rasterize every page to JPEG.
  async compressRaster(s, [src]) {
    const { getPageCount } = await lib('pdfOps')
    const { renderPageToImage } = await lib('pdfText')
    const { imagesToPdf, normalizeImage } = await lib('imageOps')
    const n = await getPageCount(src)
    const images = []
    for (let p = 1; p <= n; p++) {
      const img = await renderPageToImage(src, p, { width: 1300, format: 'image/jpeg', quality: 0.8 })
      images.push(await normalizeImage(img.bytes))
    }
    let bytes = await imagesToPdf(images, { pageSize: 'fit' })
    let note = null
    if (bytes.length >= src.length) {
      bytes = src
      note = 'kept original'
    }
    return { outputs: [await save(s.id, 'compressed.pdf', bytes)], meta: { note, before: src.length } }
  },
  async repair(s, [src]) {
    const { repairPdf } = await lib('mupdfOps')
    const res = await repairPdf(src)
    const { bytes, ...meta } = res
    return { outputs: [await save(s.id, 'repaired.pdf', bytes)], meta }
  },
  async watermark(s, [src]) {
    const { watermarkText } = await lib('stampOps')
    const bytes = await watermarkText(src, { text: 'CORPUSMARK', position: 'middle-center', ...s.params })
    return { outputs: [await save(s.id, 'watermarked.pdf', bytes)] }
  },
  async pagenumbers(s, [src]) {
    const { addPageNumbers } = await lib('stampOps')
    const bytes = await addPageNumbers(src, { format: 'page-n', position: 'bottom-center', ...s.params })
    return { outputs: [await save(s.id, 'numbered.pdf', bytes)] }
  },
  async sign(s, [src]) {
    const { signPdf } = await lib('stampOps')
    const png = await signaturePng()
    const bytes = await signPdf(src, png, { pageNum: s.params.pageNum ?? 1, fx: 0.5, fy: 0.85, widthPct: 25 })
    return { outputs: [await save(s.id, 'signed.pdf', bytes)] }
  },
  // Crop the same box the Crop tool sends: fractions of the visible page
  // (as rendered), measured from its top-left, applied to every page.
  async crop(s, [src]) {
    const { cropPdf } = await lib('stampOps')
    const box = { fx: 0.1, fy: 0.1, fw: 0.5, fh: 0.5 }
    const bytes = await cropPdf(src, box)
    return { outputs: [await save(s.id, 'cropped.pdf', bytes)], meta: { box } }
  },
  async edit(s, [src]) {
    const { applyEdits } = await lib('editOps')
    const bytes = await applyEdits(src, [
      { type: 'text', pageIndex: 0, x: 50, y: 50, text: 'EDITMARK', size: 14, font: 'helvetica', color: '#cc0000' },
      { type: 'rect', pageIndex: 0, x: 40, y: 40, w: 120, h: 30, color: '#0000cc' },
    ])
    return { outputs: [await save(s.id, 'edited.pdf', bytes)] }
  },
  async editNonLatin(s, [src]) {
    const { applyEdits } = await lib('editOps')
    const bytes = await applyEdits(src, [{ type: 'text', pageIndex: 0, x: 50, y: 50, text: s.params.text, size: 14 }])
    return { outputs: [await save(s.id, 'edited.pdf', bytes)] }
  },
  // Every element type on one page, in view points (as the editor sends them).
  async editAll(s, [src]) {
    const { applyEdits } = await lib('editOps')
    const pageIndex = s.params.pageIndex ?? 0
    const png = await signaturePng()
    const els = [
      { type: 'text', x: 50, y: 50, text: s.params.text ?? 'EDITMARK', size: 14, font: 'helvetica', color: '#cc0000' },
      { type: 'rect', x: 40, y: 40, w: 120, h: 30, color: '#0000cc' },
      { type: 'ellipse', x: 60, y: 100, w: 80, h: 40, color: '#067647' },
      { type: 'line', x: 40, y: 160, x2: 200, y2: 180, color: '#111111' },
      { type: 'highlight', x: 40, y: 200, w: 160, h: 16 },
      { type: 'ink', points: [{ x: 40, y: 240 }, { x: 70, y: 260 }, { x: 100, y: 235 }], color: '#6938ef' },
      { type: 'image', x: 150, y: 120, w: 100, h: 30, bytes: png, imgType: 'png' },
    ].map((e) => ({ ...e, pageIndex }))
    const bytes = await applyEdits(src, els)
    return { outputs: [await save(s.id, 'edited.pdf', bytes)] }
  },
  async protect(s, [src]) {
    const { protectPdf } = await lib('cryptoOps')
    const bytes = await protectPdf(src, s.params.password, s.params.owner ?? null)
    return { outputs: [await save(s.id, 'protected.pdf', bytes)] }
  },
  async unlock(s, [src]) {
    const { unlockPdf, inspectPdf } = await lib('cryptoOps')
    const before = await inspectPdf(src)
    const res = await unlockPdf(src, s.params.password ?? '')
    return {
      outputs: [await save(s.id, 'unlocked.pdf', res.bytes)],
      meta: { before, hadUserPassword: res.hadUserPassword, removed: res.removedRestrictions },
    }
  },
  async ocr(s, [src]) {
    const { ocrPdf } = await lib('ocrOps')
    // 'all': these rows were written for the old default (read every page, keep any text)
    const res = await ocrPdf(src, { textPages: 'all' })
    return {
      outputs: [await save(s.id, 'ocr.pdf', res.bytes)],
      meta: { totalWords: res.totalWords, pageCount: res.pageCount, sample: res.text.slice(0, 200) },
    }
  },
  async pdf2word(s, [src]) {
    const { pdfToDocx } = await lib('officeOps')
    const res = await pdfToDocx(src, () => {}, s.params.layout ?? 'flow')
    const { bytes, ...meta } = res
    return { outputs: [await save(s.id, 'out.docx', bytes)], meta }
  },
  async pdf2excel(s, [src]) {
    const { pdfToXlsx } = await lib('officeOps')
    const res = await pdfToXlsx(src)
    const { bytes, ...meta } = res
    return { outputs: [await save(s.id, 'out.xlsx', bytes)], meta }
  },
  async pdf2ppt(s, [src]) {
    const { pdfToPptx } = await lib('officeOps')
    const { openPdfDocument, serializedPdfOp } = await lib('pdfText')
    const n = await serializedPdfOp(async () => (await openPdfDocument(src)).numPages)
    const bytes = await pdfToPptx(src, n)
    return { outputs: [await save(s.id, 'out.pptx', bytes)], meta: { pages: n } }
  },
  async pdf2md(s, [src]) {
    const { pdfToMarkdown } = await lib('markdownOps')
    const res = await pdfToMarkdown(src)
    const bytes = new TextEncoder().encode(res.text)
    return { outputs: [await save(s.id, 'out.md', bytes)], meta: { pages: res.pages, tables: res.tables, headings: res.headings } }
  },
  async appText(s, [src]) {
    const { getPageTexts } = await lib('pdfText')
    const texts = await getPageTexts(src)
    return { outputs: [], meta: { texts: texts.slice(0, 5) } }
  },
  async officeQuick(s, [src]) {
    const office = await lib('officeOps')
    const fn = { docx: office.docxToPdf, xlsx: office.xlsxToPdf, pptx: office.pptxToPdf }[s.params.kind]
    const buf = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength)
    const bytes = await fn(buf)
    return { outputs: [await save(s.id, 'out.pdf', bytes)] }
  },
  async officeHifi(s, [src]) {
    const { convertToPdfHiFi, engineAvailable } = await lib('libreOffice')
    if (!engineAvailable()) return { skip: 'page is not cross-origin isolated' }
    const name = s.files[0].split('/').pop()
    const bytes = await convertToPdfHiFi(src, name)
    return { outputs: [await save(s.id, 'out.pdf', bytes)] }
  },
  async officeEngine() {
    const { loadEngine } = await lib('libreOffice')
    try {
      await loadEngine()
      return { outputs: [], meta: { loaded: true } }
    } catch (err) {
      return { outputs: [], meta: { loaded: false, error: String(err.message ?? err) } }
    }
  },
  async img2pdf(s, files) {
    // same path as the Images to PDF tool: every TIFF page, fit at 150 dpi
    const { decodeImages, imagesToPdf } = await lib('imageOps')
    const images = []
    for (const f of files) images.push(...(await decodeImages(f)))
    const bytes = await imagesToPdf(images, { pageSize: s.params.pageSize ?? 'fit', dpi: 150 })
    return {
      outputs: [await save(s.id, 'images.pdf', bytes)],
      meta: { decoded: images.map((i) => ({ type: i.type, w: i.width, h: i.height, size: i.bytes.length })) },
    }
  },
  // First batch of page previews, as the page grids render them.
  async thumbs(s, [src]) {
    const { renderThumbnails } = await lib('pdfText')
    const t0 = performance.now()
    const urls = await renderThumbnails(src, 110, null, 1, s.params.count ?? 100)
    const ms = Math.round(performance.now() - t0)
    const first = await (await fetch(urls[0])).arrayBuffer()
    return { outputs: [], meta: { count: urls.filter((u) => u?.startsWith('data:image/png')).length, ms, firstInk: (await inkRatio(new Uint8Array(first))).ratio } }
  },
  // Remove the file while its previews render: rendering must stop.
  async thumbsCancel(s, [src]) {
    const { renderThumbnails, releasePdf } = await lib('pdfText')
    let done = 0
    let released = null
    const t0 = performance.now()
    const run = renderThumbnails(src, 110, () => {
      done++
      if (done === 3) {
        released = performance.now()
        releasePdf(src)
      }
    }, 1, 100)
    let error = null
    try {
      await run
    } catch (err) {
      error = err.name
    }
    return { outputs: [], meta: { done, error, stopMs: Math.round(performance.now() - (released ?? t0)) } }
  },
  async pdf2img(s, [src]) {
    // same path as the PDF to images tool (MuPDF redraws blank image pages)
    const { renderPageForExport } = await lib('mupdfRender')
    const pages = s.params.pages ?? [1]
    const outputs = []
    const ink = []
    for (const p of pages) {
      const img = await renderPageForExport(src, p, { width: 1500, format: 'image/png' })
      outputs.push(await save(s.id, `page${p}.png`, img.bytes))
      ink.push((await inkRatio(img.bytes)).ratio)
    }
    return { outputs, meta: { ink } }
  },
  // Search a term, redact the hits, then check pixels where the term was.
  async redact(s, [src]) {
    const { findTextBoxes, redactPdf } = await lib('redactOps')
    const boxes = await findTextBoxes(src, [s.params.term])
    if (boxes.length === 0) return { outputs: [], meta: { boxes: 0 } }
    const before = await termRects(src, s.params.term)
    const bytes = await redactPdf(src, boxes)
    const covered = before.length ? await darkShare(bytes, before.slice(0, 6)) : []
    return {
      outputs: [await save(s.id, 'redacted.pdf', bytes)],
      meta: { boxes: boxes.length, pagesHit: [...new Set(boxes.map((b) => b.pageNum))], covered, areas: areasOf(boxes) },
    }
  },
  // A scan numbered with our own Page numbers tool, then a box redacted in
  // remove mode: still a scan (small text on top), so the page becomes a
  // JPEG picture with the box painted black, not a huge flat image.
  async redactStampedScan(s, [src]) {
    const { addPageNumbers, watermarkText } = await lib('stampOps')
    const { redactPdf } = await lib('redactOps')
    // our own Page numbers, or our own Watermark (big diagonal text on top)
    const numbered = s.params?.watermark ? await watermarkText(src, { text: s.params.watermark, fontSize: s.params.fontSize ?? 48 }) : await addPageNumbers(src, { format: 'n-of-total' })
    const box = { pageNum: 1, fx: 0.2, fy: 0.3, fw: 0.6, fh: 0.2 }
    const res = await redactPdf(numbered, [box], { method: 'remove', report: true })
    // the box in fractions of the visible page, a little inside its edges
    const rect = { page: 1, x: box.fx + 0.01, y: box.fy + 0.01, w: box.fw - 0.02, h: box.fh - 0.02, vw: 1, vh: 1 }
    const [covered] = await darkShare(res.bytes, [rect])
    return { outputs: [await save(s.id, 'redacted.pdf', res.bytes)], meta: { rasterPages: res.rasterPages, numberedSize: numbered.byteLength, size: res.bytes.byteLength, covered } }
  },
  async redactFind(s, [src]) {
    const { findTextBoxes } = await lib('redactOps')
    const boxes = await findTextBoxes(src, [s.params.term])
    return { outputs: [], meta: { boxes: boxes.length } }
  },
  async formsList(s, [src]) {
    const { listFields } = await lib('formOps')
    const t0 = performance.now()
    const fields = await listFields(src)
    return {
      outputs: [],
      meta: { widgets: fields.length, names: [...new Set(fields.map((f) => f.name))].length, ms: Math.round(performance.now() - t0) },
    }
  },
  async formsFill(s, [src]) {
    const { listFields, fillFields } = await lib('formOps')
    const fields = await listFields(src)
    // skip comb / short fields that cannot hold the test value
    // same intake as the app (unlocks restricted files, so field names decode)
    const { loadPdf } = await lib('pdfOps')
    const form = (await loadPdf(src)).getForm()
    const roomy = (n) => {
      try {
        const max = form.getTextField(n).getMaxLength()
        return max === undefined || max >= 8
      } catch {
        return false
      }
    }
    const text = [...new Set(fields.filter((f) => f.type === 'text' && !f.readOnly).map((f) => f.name))].filter(roomy).slice(0, 3)
    const values = Object.fromEntries(text.map((n, i) => [n, `CORPUS${i + 1}`]))
    const res = await fillFields(src, values, { flatten: !!s.params.flatten })
    return { outputs: [await save(s.id, 'filled.pdf', res.bytes)], meta: { filled: res.filled, values } }
  },
  // Fill the first roomy text fields with the given (non-Latin) text.
  async formsFillText(s, [src]) {
    const { listFields, fillFields } = await lib('formOps')
    const fields = await listFields(src)
    // same intake as the app (unlocks restricted files, so field names decode)
    const { loadPdf } = await lib('pdfOps')
    const form = (await loadPdf(src)).getForm()
    const roomy = (n) => {
      try {
        const f = form.getTextField(n)
        return !f.isCombed() && (f.getMaxLength() === undefined || f.getMaxLength() >= 20)
      } catch {
        return false
      }
    }
    const names = [...new Set(fields.filter((f) => f.type === 'text' && !f.readOnly).map((f) => f.name))].filter(roomy).slice(0, 2)
    const values = Object.fromEntries(names.map((n) => [n, s.params.text]))
    const res = await fillFields(src, values, { flatten: !!s.params.flatten })
    return { outputs: [await save(s.id, 'filled.pdf', res.bytes)], meta: { filled: res.filled, values } }
  },
  // Add a text field (with a value) and a checkbox at view points on page 1.
  async formsAdd(s, [src]) {
    const { addFields } = await lib('formOps')
    const res = await addFields(src, [
      { type: 'text', name: 'c_text', pageIndex: 0, x: 60, y: 80, w: 200, h: 22, value: s.params.text ?? 'ADDED' },
      { type: 'checkbox', name: 'c_check', pageIndex: 0, x: 60, y: 120, w: 14, h: 14 },
    ])
    return { outputs: [await save(s.id, 'added.pdf', res.bytes)], meta: { added: res.added } }
  },
  async formsFlatten(s, [src]) {
    const { flattenForm } = await lib('formOps')
    const res = await flattenForm(src)
    return { outputs: [await save(s.id, 'flattened.pdf', res.bytes)], meta: { flattened: res.flattened } }
  },
  async compare(s, [a, b]) {
    const { comparePdfs } = await lib('compareOps')
    const res = await comparePdfs(a, b)
    return {
      outputs: [],
      meta: {
        identical: res.identical,
        added: res.added,
        removed: res.removed,
        changedPages: res.pages.filter((p) => p.added + p.removed > 0 || p.onlyInA || p.onlyInB).map((p) => p.index + 1),
      },
    }
  },
  // HTML with head styles and real paragraph text taken from a corpus PDF.
  async html2pdf(s, [src]) {
    const { getPageTexts } = await lib('pdfText')
    const { htmlToPdf } = await lib('htmlOps')
    const text = (await getPageTexts(src))[0].slice(0, 2500)
    const html = `<!doctype html><html><head><style>h1{color:rgb(220,0,0)} p{font-size:15px}</style></head>
      <body><h1>Corpus heading</h1>${'<p>' + text.replace(/[<&]/g, ' ') + '</p>'}</body></html>`
    const bytes = await htmlToPdf(html)
    const { renderPageToImage } = await lib('pdfText')
    const img = await renderPageToImage(bytes, 1, { width: 800, format: 'image/png' })
    const bmp = await createImageBitmap(new Blob([img.bytes]))
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    const d = ctx.getImageData(0, 0, bmp.width, Math.min(bmp.height, 300)).data
    let red = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 80 && d[i + 2] < 80) red++
    return { outputs: [await save(s.id, 'html.pdf', bytes)], meta: { redPixels: red, sourceText: text.slice(0, 300) } }
  },
  async health() {
    const { runSelfTest } = await lib('selfTest')
    const results = await runSelfTest()
    return { outputs: [], meta: { total: results.length, failed: results.filter((r) => !r.pass).map((r) => `${r.name}: ${r.detail}`) } }
  },
  // ----- U4-I: LibreOffice engine, fonts, HTML with real text -----
  // Restarts the engine twice: cold (Cache Storage cleared, real download)
  // and warm (from Cache Storage), recording the progress events.
  async iEngine() {
    const lo = await lib('libreOffice')
    if (!lo.engineAvailable()) return { skip: 'page is not cross-origin isolated' }
    for (const key of await caches.keys()) if (key.startsWith('swisspdf-libreoffice')) await caches.delete(key)
    lo.resetEngine()
    const coldPcts = []
    await lo.loadEngine((m, i) => i?.phase === 'download' && coldPcts.push(i.percent))
    const cold = lo.engineStats()
    lo.resetEngine()
    const pcts = []
    await lo.loadEngine((m, i) => i?.phase === 'download' && pcts.push(i.percent))
    const again = lo.loadEngine()
    return {
      outputs: [],
      meta: {
        cold,
        warm: lo.engineStats(),
        coldProgressEvents: coldPcts.length,
        coldLastPercent: coldPcts.at(-1) ?? null,
        progressEvents: pcts.length,
        lastPercent: pcts.at(-1) ?? null,
        oneBoot: (await again) === (await lo.loadEngine()),
        frames: document.querySelectorAll('iframe[src*="lo_frame"]').length,
        pinned: Object.keys(lo.ENGINE_BUILD.files),
        base: lo.ENGINE_BUILD.base,
      },
    }
  },
  async iOfficeHifi(s, [src]) {
    const lo = await lib('libreOffice')
    if (!lo.engineAvailable()) return { skip: 'page is not cross-origin isolated' }
    const name = s.files[0].split('/').pop()
    await lo.loadEngine()
    const t0 = performance.now()
    const bytes = await lo.convertToPdfHiFi(src, name)
    return { outputs: [await save(s.id, 'out.pdf', bytes)], meta: { convertMs: Math.round(performance.now() - t0) } }
  },
  // A Word file whose runs ask for fonts the engine lacks or only has as
  // metric twins, in Latin, CJK and Devanagari.
  async iFontProbe(s) {
    const lo = await lib('libreOffice')
    if (!lo.engineAvailable()) return { skip: 'page is not cross-origin isolated' }
    const { Document, Packer, Paragraph, TextRun } = await import('docx')
    const para = (font, text) => new Paragraph({ children: [new TextRun({ text: `${font}: ${text}`, font, size: 24 })] })
    const children = s.params.runs.map(([font, text]) => para(font, text))
    const doc = new Document({ sections: [{ children }] })
    const docx = new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer())
    const bytes = await lo.convertToPdfHiFi(docx, 'font-probe.docx')
    return { outputs: [await save(s.id, 'out.pdf', bytes)] }
  },
  async iHtml(s) {
    const html = s.params.html ?? (await (await fetch(s.params.src)).text())
    const { htmlToPdfHiFi, htmlToPdf, sanitizeHtml } = await lib('htmlOps')
    let engine = null
    const t0 = performance.now()
    const bytes = s.params.hifi
      ? await htmlToPdfHiFi(html, { pageSize: s.params.pageSize, fallback: false, onEngine: (n, r) => (engine = [n, r ?? null]) })
      : await htmlToPdf(html, { pageSize: s.params.pageSize })
    const ms = Math.round(performance.now() - t0)
    // colour check on page 1: red heading and the blue table header
    const { renderPageToImage } = await lib('pdfText')
    const img = await renderPageToImage(bytes, 1, { width: 800, format: 'image/png' })
    const bmp = await createImageBitmap(new Blob([img.bytes]))
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
    let red = 0
    let blue = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 180 && d[i + 1] < 80 && d[i + 2] < 80) red++
      if (d[i] < 60 && d[i + 1] < 90 && d[i + 2] > 120) blue++
    }
    const sourceText = sanitizeHtml(html).body.textContent
    return { outputs: [await save(s.id, 'html.pdf', bytes)], meta: { engine, ms, red, blue, sourceText } }
  },
  // A hang: a 1 ms budget must kill the engine, and the next job reboots it.
  async iHang(s, [src]) {
    const lo = await lib('libreOffice')
    if (!lo.engineAvailable()) return { skip: 'page is not cross-origin isolated' }
    await lo.loadEngine()
    let error = null
    try {
      await lo.convertToPdfHiFi(src, 'hang.docx', () => {}, { timeoutMs: 1 })
    } catch (err) {
      error = String(err.message ?? err)
    }
    const loadedAfter = lo.engineLoaded()
    const framesAfter = document.querySelectorAll('iframe[src*="lo_frame"]').length
    const t0 = performance.now()
    const bytes = await lo.convertToPdfHiFi(src, 'again.docx')
    return {
      outputs: [await save(s.id, 'out.pdf', bytes)],
      meta: { error, loadedAfter, framesAfter, rebootMs: Math.round(performance.now() - t0), framesEnd: document.querySelectorAll('iframe[src*="lo_frame"]').length },
    }
  },
  // ----- U4 Dev H: conversion fidelity (h-* cases) -----
  async hWord(s, [src]) {
    const { pdfToDocx } = await lib('officeOps')
    const t0 = performance.now()
    const { bytes, ...meta } = await pdfToDocx(src, () => {}, s.params.layout ?? 'flow')
    meta.convertMs = Math.round(performance.now() - t0)
    return { outputs: [await save(s.id, 'out.docx', bytes)], meta }
  },
  async hExcel(s, [src]) {
    const { pdfToXlsx } = await lib('officeOps')
    const t0 = performance.now()
    const { bytes, ...meta } = await pdfToXlsx(src, () => {}, { joinPages: !!s.params.joinPages })
    meta.convertMs = Math.round(performance.now() - t0)
    // the workbook as written, before upload: tells a writer bug from a transfer one
    const XLSX = await import('xlsx')
    meta.size = bytes.length
    try {
      meta.zipOk = XLSX.read(bytes, { type: 'array' }).SheetNames.length > 0
    } catch (err) {
      meta.zipOk = false
      meta.zipError = String(err.message ?? err)
    }
    return { outputs: [await save(s.id, 'out.xlsx', bytes)], meta }
  },
  async hPpt(s, [src]) {
    const { pdfToPptx } = await lib('officeOps')
    const { openPdfDocument, serializedPdfOp } = await lib('pdfText')
    const n = await serializedPdfOp(async () => (await openPdfDocument(src)).numPages)
    const t0 = performance.now()
    const bytes = await pdfToPptx(src, n, () => {}, { editable: s.params.editable ?? true })
    return { outputs: [await save(s.id, 'out.pptx', bytes)], meta: { pages: n, convertMs: Math.round(performance.now() - t0) } }
  },
  async hMd(s, [src]) {
    const { pdfToMarkdown } = await lib('markdownOps')
    const res = await pdfToMarkdown(src)
    return { outputs: [await save(s.id, 'out.md', new TextEncoder().encode(res.text))], meta: { tables: res.tables, headings: res.headings } }
  },
}

// ----- G3 (edit canvas tools): true redaction, search, page numbers, sign, forms -----
// Search (term, phrase, patterns or regex), remove with MuPDF, then check the
// pixels where the term was and report what the redaction did.
OPS.g3RedactRemove = async (s, [src]) => {
  const { findMatches, redactPdf } = await lib('redactOps')
  const q = s.params.query ?? { terms: [s.params.term] }
  const boxes = await findMatches(src, q)
  // whole pages and boxes drawn by hand (view points) next to the search
  const whole = [...(s.params.wholePages ?? []).map((p) => ({ pageNum: p, whole: true })), ...(s.params.boxes ?? [])]
  if (boxes.length + whole.length === 0) return { outputs: [], meta: { boxes: 0 } }
  const before = s.params.term ? await termRects(src, s.params.term) : []
  const t0 = performance.now()
  const res = await redactPdf(src, [...boxes, ...whole], { method: s.params.method ?? 'remove', query: q, report: true })
  const ms = Math.round(performance.now() - t0)
  const covered = before.length ? await darkShare(res.bytes, before.slice(0, 6)) : []
  return {
    outputs: [await save(s.id, 'redacted.pdf', res.bytes)],
    meta: {
      boxes: boxes.length,
      matches: [...new Set(boxes.map((b) => b.match))].slice(0, 12),
      sources: [...new Set(boxes.map((b) => b.source))],
      pagesHit: res.pages,
      rasterPages: res.rasterPages,
      cleaned: res.cleaned ?? null,
      covered,
      ms,
      areas: areasOf([...boxes, ...whole]),
    },
  }
}
// Redaction boxes for the raw check in Node (comments are deleted, not boxed).
function areasOf(boxes) {
  return boxes.filter((b) => !b.annot).map(({ pageNum, x, y, w, h, whole }) => ({ pageNum, x, y, w, h, whole }))
}
OPS.g3PageNumbers = async (s, [src]) => {
  const { addPageNumbers } = await lib('stampOps')
  const bytes = await addPageNumbers(src, s.params)
  return { outputs: [await save(s.id, 'numbered.pdf', bytes)] }
}
// Signature on page 1, initials on every page, a date on the last page.
OPS.g3SignMulti = async (s, [src]) => {
  const { stampItems } = await lib('stampOps')
  const { getPageCount } = await lib('pdfOps')
  const png = await signaturePng()
  const n = await getPageCount(src)
  const bytes = await stampItems(src, [
    { png, pages: [1], fx: 0.5, fy: 0.85, widthPct: 25 },
    { png, pages: 'all', fx: 0.9, fy: 0.95, widthPct: 8 },
    { text: 'DATE 2026-10-17', size: 12, pages: [n], fx: 0.3, fy: 0.9 },
  ])
  return { outputs: [await save(s.id, 'signed.pdf', bytes)], meta: { pages: n } }
}
OPS.g3FormsInspect = async (s, [src]) => {
  const { inspectForm } = await lib('formOps')
  const t0 = performance.now()
  const res = await inspectForm(src)
  return { outputs: [], meta: { xfa: res.xfa, count: res.count, widgets: res.fields.length, ms: Math.round(performance.now() - t0) } }
}
// Fill the first roomy text fields; reports whether the XFA copy was removed.
OPS.g3FormsFill = async (s, [src]) => {
  const { inspectForm, fillFields } = await lib('formOps')
  const { fields } = await inspectForm(src)
  const names = [...new Set(fields.filter((f) => f.type === 'text' && !f.readOnly && (f.maxLength === undefined || f.maxLength >= 8)).map((f) => f.name))].slice(0, 3)
  const values = Object.fromEntries(names.map((n, i) => [n, `G3VALUE${i + 1}`]))
  const res = await fillFields(src, values, { flatten: !!s.params.flatten })
  return { outputs: [await save(s.id, 'filled.pdf', res.bytes)], meta: { filled: res.filled, values, xfaRemoved: res.xfaRemoved } }
}

// Fill a form field, then search and redact its value.
OPS.g3RedactFormValue = async (s, [src]) => {
  const { inspectForm, fillFields } = await lib('formOps')
  const { findMatches, redactPdf } = await lib('redactOps')
  const { fields } = await inspectForm(src)
  const name = fields.find((f) => f.type === 'text' && !f.readOnly && !f.maxLength)?.name
  const filled = (await fillFields(src, { [name]: s.params.value })).bytes
  const boxes = await findMatches(filled, { terms: [s.params.value] })
  if (!boxes.length) return { outputs: [], meta: { boxes: 0, name } }
  const res = await redactPdf(filled, boxes, { method: 'remove', report: true })
  return { outputs: [await save(s.id, 'redacted.pdf', res.bytes)], meta: { boxes: boxes.length, name, field: boxes.some((b) => b.field), areas: areasOf(boxes) } }
}

export async function run(spec) {
  // G2 ops live in their own file
  let fn = OPS[spec.op] ?? (await import('./page-harness-g2.js')).OPS[spec.op]
  // "<unit>:<op>" lives next to this file: page-harness-<unit>.js (ops take spec, files)
  // or harness-<unit>.js (ops also get { save, lib, load } first)
  const ext = /^([\w-]+):(\w+)$/.exec(spec.op)
  if (!fn && ext) {
    try {
      fn = (await import(/* @vite-ignore */ `/scripts/corpus-test/page-harness-${ext[1]}.js`)).OPS[ext[2]]
    } catch {
      fn = (await import(/* @vite-ignore */ `/scripts/corpus-test/harness-${ext[1]}.js`)).OPS[ext[2]]?.bind(null, { save, lib, load })
    }
  }
  if (!fn) throw new Error(`unknown op ${spec.op}`)
  const files = []
  for (const f of spec.files ?? []) files.push(await load(f))
  const t0 = performance.now()
  const res = (await fn(spec, files)) ?? {}
  return { ...res, opMs: Math.round(performance.now() - t0) }
}
