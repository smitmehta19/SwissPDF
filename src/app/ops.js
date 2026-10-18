// Pure bytes-in / bytes-out ops that may run in the worker (opsWorker.js) or,
// when no worker can start, inline on the page. Nothing here may touch the
// DOM, pdf.js rendering or app state. Libraries load on first use.
export const OPS = {
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
}
