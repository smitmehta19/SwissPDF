// U5-A page layout and colour ops for the corpus runner (op names
// "u5a:<name>"). Loaded by page-harness.js; runs in the app page and calls
// the real lib ops.
// Input changes before an op (params):
//   mark        "QPAGE<n>" stamped in the middle of every page, so the runner
//               can find where each source page ended up
//   fill        the first text field filled with FILLED, saved as input.pdf
//   blankFirst  an empty page (no /Contents) put in front, saved as input.pdf

const lib = (name) => import(/* @vite-ignore */ `/src/lib/${name}.js`)

const CHUNK = 8 * 1024 * 1024
async function save(caseId, name, bytes) {
  const url = `/__corpus/out/${encodeURIComponent(caseId)}/${encodeURIComponent(name)}`
  for (let at = 0, part = 0; at < bytes.length || part === 0; at += CHUNK, part++) {
    const res = await fetch(`${url}?part=${part}`, { method: 'POST', body: bytes.subarray(at, at + CHUNK) })
    if (!res.ok) throw new Error(`upload ${name}: ${res.status}`)
  }
  return { name, size: bytes.length }
}

export const FILLED = 'U5A FILLED VALUE'

async function marked(src) {
  const { stampPdf } = await lib('layoutOps')
  return (await stampPdf(src, { text: 'QPAGE{n}', position: 'middle-center', fontSize: 14, color: '#000000' })).bytes
}

// The input after the param changes; saved as input.pdf when changed.
async function prepared(s, src) {
  let bytes = src
  if (s.params.fill || s.params.blankFirst) {
    const { PDFDocument, PDFTextField } = await import('pdf-lib')
    const doc = await PDFDocument.load(src, { ignoreEncryption: true, updateMetadata: false })
    if (s.params.fill) {
      const field = doc.getForm().getFields().find((f) => f instanceof PDFTextField && !f.isReadOnly())
      field.setText(FILLED)
    }
    if (s.params.blankFirst) doc.insertPage(0, [612, 792])
    bytes = await doc.save()
    await save(s.id, 'input.pdf', bytes)
  }
  return bytes
}

// Visible page sizes of the input (what the layout ops work from).
async function viewSizes(bytes) {
  const { PDFDocument } = await import('pdf-lib')
  const { pageFrame } = await lib('pageFrame')
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  return doc.getPages().map((p) => {
    const f = pageFrame(p)
    return [Math.round(f.width * 100) / 100, Math.round(f.height * 100) / 100]
  })
}

async function signaturePng() {
  const c = document.createElement('canvas')
  c.width = 400
  c.height = 120
  const g = c.getContext('2d')
  g.fillStyle = '#000'
  g.font = 'bold 64px serif'
  g.fillText('J. Corpus', 20, 85)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

// RGBA pixels of a page rendered by pdf.js (print intent) at a fixed width.
async function pagePixels(bytes, n, width) {
  const { renderPageToImage } = await lib('pdfText')
  const img = await renderPageToImage(bytes, n, { width, format: 'image/png' })
  const bmp = await createImageBitmap(new Blob([img.bytes]))
  const c = new OffscreenCanvas(bmp.width, bmp.height)
  const g = c.getContext('2d')
  g.drawImage(bmp, 0, 0)
  bmp.close?.()
  return { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }
}

// Output pixels against the expected colour map of the input pixels.
// Returns { mean, p99, max } of the per-channel error (0-255).
async function pixelError(input, output, n, map, width = 300) {
  const a = await pagePixels(input, n, width)
  const b = await pagePixels(output, n, width)
  if (a.w !== b.w || a.h !== b.h) return { mean: 255, p99: 255, max: 255, size: `${a.w}x${a.h} vs ${b.w}x${b.h}` }
  const hist = new Uint32Array(256)
  let sum = 0
  for (let i = 0; i < a.data.length; i += 4) {
    const want = map(a.data[i], a.data[i + 1], a.data[i + 2])
    for (let k = 0; k < 3; k++) {
      const e = Math.abs(want[k] - b.data[i + k])
      hist[e]++
      sum += e
    }
  }
  const total = (a.data.length / 4) * 3
  let seen = 0
  let p99 = 0
  for (let e = 0; e < 256; e++) {
    seen += hist[e]
    if (seen >= total * 0.99) {
      p99 = e
      break
    }
  }
  let max = 255
  while (max > 0 && hist[max] === 0) max--
  return { mean: Math.round((sum / total) * 100) / 100, p99, max }
}

// Layout ops by name: input bytes -> { bytes, report, scale? }.
async function layoutOp(s, name, input, extra = []) {
  const ops = await lib('layoutOps')
  return ops[name](input, ...extra, s.params.opts ?? {})
}

async function imposition(s, src, name, out) {
  const base = await prepared(s, src)
  const res = await layoutOp(s, name, s.params.mark ? await marked(base) : base)
  return { outputs: [await save(s.id, out, res.bytes)], meta: { sizes: await viewSizes(base), report: res.report, scale: res.scale } }
}

export const OPS = {
  nup: (s, [src]) => imposition(s, src, 'nUp', 'nup.pdf'),
  booklet: (s, [src]) => imposition(s, src, 'booklet', 'booklet.pdf'),
  scale: (s, [src]) => imposition(s, src, 'scalePages', 'scaled.pdf'),
  single: (s, [src]) => imposition(s, src, 'singleLargePage', 'single.pdf'),
  async overlay(s, [src, ...overlays]) {
    const base = await prepared(s, src)
    const res = await layoutOp(s, 'overlayPdfs', base, [overlays])
    return { outputs: [await save(s.id, 'overlay.pdf', res.bytes)], meta: { sizes: await viewSizes(base), report: res.report } }
  },
  async stamp(s, [src]) {
    const { stampPdf } = await lib('layoutOps')
    const opts = { ...(s.params.opts ?? {}) }
    if (s.params.image) opts.image = { bytes: await signaturePng(), type: 'png' }
    const res = await stampPdf(src, opts)
    return { outputs: [await save(s.id, 'stamped.pdf', res.bytes)], meta: { sizes: await viewSizes(src), report: res.report } }
  },
  // Blank page detection. With insert: [positions], blank pages are first
  // put into the real file (1-based positions in the new file): an empty
  // page, and pages painted white with faint specks (a clean scan's look).
  async blank(s, [src]) {
    const { findBlankPages } = await lib('layoutOps')
    const { removePages, getPageCount } = await lib('pdfOps')
    let input = src
    const inserted = []
    if (s.params.insert?.length) {
      const { PDFDocument, rgb } = await import('pdf-lib')
      const doc = await PDFDocument.load(src, { ignoreEncryption: true, updateMetadata: false })
      for (const [k, at] of s.params.insert.entries()) {
        const near = doc.getPage(Math.min(at - 1, doc.getPageCount() - 1))
        const { width, height } = near.getSize()
        const page = doc.insertPage(at - 1, [width, height])
        if (k % 2 === 1) {
          page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) })
          for (let i = 0; i < 12; i++) page.drawRectangle({ x: (i * 37) % width, y: (i * 53) % height, width: 1, height: 1, color: rgb(0.97, 0.97, 0.97) })
        }
        inserted.push(at)
      }
      input = await doc.save()
      await save(s.id, 'with-blanks.pdf', input)
    }
    const t0 = performance.now()
    const found = await findBlankPages(input, s.params.opts ?? {})
    const ms = Math.round(performance.now() - t0)
    const detected = found.map((p) => p.page)
    const outputs = []
    if (detected.length) outputs.push(await save(s.id, 'no-blanks.pdf', await removePages(input, detected)))
    return { outputs, meta: { inserted, detected, found, ms, pages: await getPageCount(input) } }
  },
  async linearize(s, [src]) {
    const { linearizePdf } = await lib('layoutOps')
    const t0 = performance.now()
    const bytes = await linearizePdf(src)
    const ms = Math.round(performance.now() - t0)
    return { outputs: [await save(s.id, 'linearized.pdf', bytes)], meta: { ms } }
  },
  // Colour tools. kind 'adjust' | 'replace'; pages = pages to pixel-check in
  // pdf.js against the colour map of the input.
  async colour(s, [src]) {
    const c = await lib('colorOps')
    const input = await prepared(s, src)
    const o = s.params.opts ?? {}
    const t0 = performance.now()
    const res = s.params.kind === 'adjust' ? await c.adjustColors(input, o) : await c.replaceColors(input, o)
    const ms = Math.round(performance.now() - t0)
    const map = s.params.kind === 'adjust' ? c.adjustMap(o) : c.replaceMap(o)
    const errors = []
    for (const n of s.params.pages ?? [1]) errors.push({ page: n, ...(await pixelError(input, res.bytes, n, map)) })
    return { outputs: [await save(s.id, 'colour.pdf', res.bytes)], meta: { ms, method: res.method, errors, sizes: await viewSizes(input) } }
  },
}
