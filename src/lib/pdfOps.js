// Every PDF operation in the app lives here as a pure function on bytes.
// UI components and the self-test harness both call these — so what the
// health check verifies is exactly what the tools run.
import { PDFDocument, degrees } from 'pdf-lib'

export async function loadPdf(bytes) {
  try {
    return await PDFDocument.load(bytes)
  } catch (err) {
    if (/encrypted/i.test(String(err))) {
      throw new Error('This PDF is password-protected — unlock it first.')
    }
    throw new Error('Not a valid PDF file.')
  }
}

// Re-parse an operation's output before it is offered for download, so a
// broken result surfaces as an error instead of a corrupt file.
export async function assertValidOutput(bytes) {
  try {
    const doc = await PDFDocument.load(bytes)
    const pageCount = doc.getPageCount()
    if (pageCount < 1) throw new Error('output has no pages')
    return { pageCount }
  } catch (err) {
    throw new Error(`Self-check failed — the produced PDF is invalid (${err.message}). Nothing was downloaded.`)
  }
}

// inputs: array of raw bytes, or { bytes, pageNumbers } where pageNumbers is a
// 1-based ordered subset of pages to contribute (per-file edits before merging).
export async function mergePdfs(inputs) {
  const merged = await PDFDocument.create()
  for (const input of inputs) {
    const bytes = input?.bytes ?? input
    const src = await loadPdf(bytes)
    const indices = input?.pageNumbers
      ? input.pageNumbers.map((n) => n - 1)
      : src.getPageIndices()
    if (indices.some((i) => i < 0 || i >= src.getPageCount())) {
      throw new Error('A selected page no longer exists in the source file.')
    }
    const pages = await merged.copyPages(src, indices)
    pages.forEach((p) => merged.addPage(p))
  }
  if (merged.getPageCount() === 0) {
    throw new Error('Every page was deleted — there is nothing to merge.')
  }
  return merged.save()
}

// pageNumbers are 1-based. Returns bytes of a new PDF with just those pages.
export async function extractPages(bytes, pageNumbers) {
  const src = await loadPdf(bytes)
  const out = await PDFDocument.create()
  const indices = pageNumbers.map((n) => n - 1)
  const pages = await out.copyPages(src, indices)
  pages.forEach((p) => out.addPage(p))
  return out.save()
}

export async function removePages(bytes, pageNumbers) {
  const src = await loadPdf(bytes)
  const toRemove = new Set(pageNumbers)
  const keep = src.getPageIndices().filter((i) => !toRemove.has(i + 1))
  if (keep.length === 0) {
    throw new Error('That would remove every page — nothing would be left.')
  }
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, keep)
  pages.forEach((p) => out.addPage(p))
  return out.save()
}

// ranges: [{from, to}] 1-based inclusive. Returns one output per range.
export async function splitByRanges(bytes, ranges) {
  const src = await loadPdf(bytes)
  const outputs = []
  for (const { from, to } of ranges) {
    const out = await PDFDocument.create()
    const indices = []
    for (let n = from; n <= to; n++) indices.push(n - 1)
    const pages = await out.copyPages(src, indices)
    pages.forEach((p) => out.addPage(p))
    outputs.push({ from, to, bytes: await out.save() })
  }
  return outputs
}

// angleDelta: 90 | 180 | 270, added to each page's existing rotation.
// pageNumbers: 1-based list, or null for all pages.
export async function rotatePdf(bytes, angleDelta, pageNumbers = null) {
  if (![90, 180, 270].includes(angleDelta)) {
    throw new Error('Rotation must be 90, 180, or 270 degrees.')
  }
  const doc = await loadPdf(bytes)
  const targets = pageNumbers ? new Set(pageNumbers) : null
  doc.getPages().forEach((page, i) => {
    if (targets && !targets.has(i + 1)) return
    const current = page.getRotation().angle
    page.setRotation(degrees(((current + angleDelta) % 360 + 360) % 360))
  })
  return doc.save()
}

// newOrder: array of 0-based source indices in their new sequence.
// Must be a permutation of every page exactly once.
export async function reorderPages(bytes, newOrder) {
  const src = await loadPdf(bytes)
  const count = src.getPageCount()
  const seen = new Set(newOrder)
  if (newOrder.length !== count || seen.size !== count || newOrder.some((i) => i < 0 || i >= count)) {
    throw new Error('Reorder list must contain every page exactly once.')
  }
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, newOrder)
  pages.forEach((p) => out.addPage(p))
  return out.save()
}

export async function getPageCount(bytes) {
  const doc = await loadPdf(bytes)
  return doc.getPageCount()
}

// Reads each page's effective rotation — used by tests and the health check.
export async function getRotations(bytes) {
  const doc = await loadPdf(bytes)
  return doc.getPages().map((p) => p.getRotation().angle)
}
