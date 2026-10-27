// Pure bytes-in / bytes-out ops that may run in the worker (opsWorker.js) or,
// when no worker can start, inline on the page. Nothing here may touch the
// DOM, pdf.js rendering or app state. Libraries load on first use.
const DOC_OPS = new Set(['readBookmarks', 'writeBookmarks', 'readMetadata', 'writeMetadata', 'listAttachments', 'extractAttachments', 'editAttachments', 'annotationSummary', 'removeAnnotations', 'removeImages', 'extractImages', 'sanitizePdf', 'scanActiveContent', 'flattenPdf', 'setPermissions', 'readPermissions', 'pdfInfo', 'unlockForms', 'listJavaScript'])

export const OPS = {
  // Redaction in a worker of its own (lane 'redact', see jobs.js): MuPDF's
  // memory grows with every redaction, so that worker is replaced every few
  // jobs. No callbacks cross into a worker: progress is per file, cancel
  // ends the worker.
  async redact(bytes, boxes, opts = {}) {
    const { redactPdf } = await import('../lib/redactOps.js')
    return redactPdf(bytes, boxes, { ...opts, onProgress: undefined, onPage: null, check: null })
  },
  // Loads pdf-lib and MuPDF ahead of the first Run (cold start).
  async warm() {
    await Promise.all([import('../lib/pdfOps.js'), import('../lib/mupdfOps.js'), import('mupdf')])
    return true
  },
  async normalize(bytes, opts) {
    const { normalizePdf } = await import('../lib/intake.js')
    return normalizePdf(bytes, opts)
  },
  async merge(inputs) {
    const { mergePdfs } = await import('../lib/pdfOps.js')
    return mergePdfs(inputs)
  },
  async rotate(bytes, angle, pages) {
    const { rotatePdf } = await import('../lib/pdfOps.js')
    return rotatePdf(bytes, angle, pages)
  },
  async split(bytes, ranges) {
    const { splitByRanges } = await import('../lib/pdfOps.js')
    return splitByRanges(bytes, ranges)
  },
  async extract(bytes, pages) {
    const { extractPages } = await import('../lib/pdfOps.js')
    return extractPages(bytes, pages)
  },
  async remove(bytes, pages) {
    const { removePages } = await import('../lib/pdfOps.js')
    return removePages(bytes, pages)
  },
  async outline(bytes) {
    const { readOutline } = await import('../lib/splitOps.js')
    return readOutline(bytes)
  },
  async orientations(bytes) {
    const { pageOrientations } = await import('../lib/splitOps.js')
    return pageOrientations(bytes)
  },
  async clean(bytes) {
    const { cleanPdf } = await import('../lib/mupdfOps.js')
    return cleanPdf(bytes)
  },
  async watermarkText(bytes, opts) {
    const { watermarkText } = await import('../lib/stampOps.js')
    return watermarkText(bytes, opts)
  },
  async watermarkImage(bytes, imageBytes, imageType, opts) {
    const { watermarkImage } = await import('../lib/stampOps.js')
    return watermarkImage(bytes, imageBytes, imageType, opts)
  },
  async pageEdit(bytes, plan) {
    const { applyPageEdits } = await import('./pageEdit.js')
    return applyPageEdits(bytes, plan)
  },
  // U5-B structure tools: the worker-safe docOps.js functions, by name
  async doc(name, ...args) {
    const ops = await import('../lib/docOps.js')
    if (!DOC_OPS.has(name)) throw new Error(`Unknown doc op ${name}`)
    return ops[name](...args)
  },
  // U5-A page layout and colour tools: worker-safe exports by name
  async layout(name, ...args) {
    const ops = await import('../lib/layoutOps.js')
    if (!['nUp', 'booklet', 'scalePages', 'singleLargePage', 'overlayPdfs', 'stampPdf', 'linearizePdf'].includes(name)) throw new Error(`Unknown layout op ${name}`)
    return ops[name](...args)
  },
  async color(name, ...args) {
    const ops = await import('../lib/colorOps.js')
    if (!['applyBlendSteps', 'replaceColors'].includes(name)) throw new Error(`Unknown colour op ${name}`)
    return ops[name](...args)
  },
  async protect(bytes, user, owner, opts) {
    const { protectPdf } = await import('../lib/cryptoOps.js')
    return protectPdf(bytes, user, owner, opts)
  },
  async unlock(bytes, password) {
    const { unlockPdf } = await import('../lib/cryptoOps.js')
    return unlockPdf(bytes, password)
  },
  async inspect(bytes) {
    const { inspectPdf } = await import('../lib/cryptoOps.js')
    return inspectPdf(bytes)
  },
  async repair(bytes) {
    const { repairPdf } = await import('../lib/mupdfOps.js')
    return repairPdf(bytes)
  },
  async compareDiff(pagesA, pagesB, opts) {
    const { diffPages } = await import('../lib/compareOps.js')
    return diffPages(pagesA, pagesB, opts)
  },
  // Edit existing text (editTextOps.js): page text model and the edit itself
  async editTextModel(bytes, pageNum) {
    const { pageTextModel } = await import('../lib/editTextOps.js')
    return pageTextModel(bytes, pageNum)
  },
  async editText(bytes, edits, opts) {
    const { editText } = await import('../lib/editTextOps.js')
    return editText(bytes, edits, opts)
  },
}
