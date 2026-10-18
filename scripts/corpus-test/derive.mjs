// Builds derived fixtures from REAL corpus files into test-corpus/derived/:
// encryption and geometry cases the downloaded corpus lacks, plus page
// subsets so slow tools (OCR) run on real scans in reasonable time.
// Usage: node scripts/corpus-test/derive.mjs [--force]
import * as mupdf from 'mupdf'
import { PDFDocument, degrees } from 'pdf-lib'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './server.mjs'

const CORPUS = join(ROOT, 'test-corpus')
export const DERIVED = join(CORPUS, 'derived')
export const OWNER_PW = 'Own3r-Corpus'
export const USER_PW = 'Us3r-Corpus'

// print, high-quality print and copy denied; everything else allowed.
// PDF P value bits: 3 print (4), 5 copy (16), 12 hq print (2048).
const P_NO_PRINT_COPY = (0xfffffffc & ~(4 | 16 | 2048)) | 0

const read = (rel) => new Uint8Array(readFileSync(join(CORPUS, rel)))
const openPdf = (bytes) => mupdf.Document.openDocument(bytes, 'application/pdf').asPDF()

function encrypt(srcRel, { user = '', owner = OWNER_PW, permissions = P_NO_PRINT_COPY }) {
  const doc = openPdf(read(srcRel))
  const opts = `encrypt=aes-256,user-password=${user},owner-password=${owner},permissions=${permissions},garbage`
  const out = doc.saveToBuffer(opts).asUint8Array().slice()
  doc.destroy?.()
  return out
}

// New doc with the given 0-based pages of a corpus file, grafted by MuPDF.
function subset(srcRel, pages) {
  const src = openPdf(read(srcRel))
  const dst = new mupdf.PDFDocument()
  for (const i of pages) dst.graftPage(-1, src, i)
  const out = dst.saveToBuffer('garbage,compress').asUint8Array().slice()
  src.destroy?.()
  dst.destroy?.()
  return out
}

// Every page /Rotate 90 with a CropBox inset unevenly from the MediaBox, so
// visible origin != MediaBox origin.
async function rotatedCropped(srcRel) {
  const doc = await PDFDocument.load(read(srcRel))
  for (const page of doc.getPages()) {
    const mb = page.getMediaBox()
    page.setCropBox(mb.x + 40, mb.y + 60, mb.width - 40 - 25, mb.height - 60 - 30)
    page.setRotation(degrees(90))
  }
  return doc.save()
}

// Non-zero-origin MediaBox: shift every box by (+200, +300) and move content
// with it, so the page looks the same but origin is far from 0,0.
async function shiftedOrigin(srcRel) {
  const doc = await PDFDocument.load(read(srcRel))
  for (const page of doc.getPages()) {
    const mb = page.getMediaBox()
    page.translateContent(200, 300)
    page.setMediaBox(mb.x + 200, mb.y + 300, mb.width, mb.height)
    page.setCropBox(mb.x + 200, mb.y + 300, mb.width, mb.height)
  }
  return doc.save()
}

// Moves the page origin to (dx, dy) (content moved with it), insets the
// CropBox unevenly, and sets /Rotate.
function reshape(page, { dx = 0, dy = 0, rotate = 0, inset = [0, 0, 0, 0] }) {
  const mb = page.getMediaBox()
  if (dx || dy) {
    page.translateContent(dx, dy)
    page.setMediaBox(mb.x + dx, mb.y + dy, mb.width, mb.height)
  }
  const m = page.getMediaBox()
  const [l, b, r, t] = inset
  if (l || b || r || t) page.setCropBox(m.x + l, m.y + b, m.width - l - r, m.height - b - t)
  if (rotate) page.setRotation(degrees(rotate))
}

// New doc from [file, 0-based page, reshape options] parts, copied by pdf-lib.
async function fromPages(parts) {
  const out = await PDFDocument.create()
  for (const [rel, idx, shape] of parts) {
    const src = await PDFDocument.load(read(rel), { ignoreEncryption: true })
    const [p] = await out.copyPages(src, [idx])
    out.addPage(p)
    if (shape) reshape(p, shape)
  }
  return out.save()
}

const TM = 'reports/pdfjs-tracemonkey.pdf'
const FAX = 'scanned/fax-jean-schmidt-doe.pdf'

export const FIXTURES = [
  {
    name: 'owner-only-tracemonkey.pdf',
    from: 'reports/pdfjs-tracemonkey.pdf',
    what: 'owner password only (no user password), print + copy denied',
    make: () => encrypt('reports/pdfjs-tracemonkey.pdf', {}),
  },
  {
    name: 'owner-only-irs-fw9.pdf',
    from: 'forms/irs-fw9.pdf',
    what: 'owner password only, print + copy denied, AcroForm',
    make: () => encrypt('forms/irs-fw9.pdf', {}),
  },
  {
    name: 'owner-only-aws-invoice.pdf',
    from: 'invoices/aws-invoice.pdf',
    what: 'owner password only, print + copy denied, invoice',
    make: () => encrypt('invoices/aws-invoice.pdf', {}),
  },
  {
    name: 'user-pw-TAMReview.pdf',
    from: 'reports/pdfjs-TAMReview.pdf',
    what: `user password "${USER_PW}" required to open`,
    password: USER_PW,
    make: () => encrypt('reports/pdfjs-TAMReview.pdf', { user: USER_PW, permissions: -4 }),
  },
  {
    name: 'rot90-cropbox-bert.pdf',
    from: 'reports/arxiv-1810.04805-bert.pdf',
    what: '/Rotate 90 on every page + CropBox inset 40/60/25/30 pt from the MediaBox',
    make: () => rotatedCropped('reports/arxiv-1810.04805-bert.pdf'),
  },
  {
    name: 'origin-shift-aws-invoice.pdf',
    from: 'invoices/aws-invoice.pdf',
    what: 'MediaBox and CropBox moved to origin (200, 300), content moved with them',
    make: () => shiftedOrigin('invoices/aws-invoice.pdf'),
  },
  {
    name: 'sub-fips-p5-6.pdf',
    from: 'scanned/fips-document-facsimile-transmission.pdf',
    what: 'pages 5-6 of a printed government scan (OCR target)',
    make: () => subset('scanned/fips-document-facsimile-transmission.pdf', [4, 5]),
  },
  {
    name: 'sub-lincoln-p3-4.pdf',
    from: 'scanned/lincoln-ellsworth-letter-1861.pdf',
    what: 'pages 3-4 of a scanned 1861 letter set',
    make: () => subset('scanned/lincoln-ellsworth-letter-1861.pdf', [2, 3]),
  },
  {
    name: 'sub-ndl-konoye-p1.pdf',
    from: 'scanned/ndl-konoye-handwritten-request.pdf',
    what: 'page 1 of a large Japanese handwritten scan',
    make: () => subset('scanned/ndl-konoye-handwritten-request.pdf', [0]),
  },
  {
    name: 'sub-darwin-p10-11.pdf',
    from: 'scanned/darwin-origin-of-species-ia.pdf',
    what: 'pages 10-11 of a scanned book with an OCR text layer',
    make: () => subset('scanned/darwin-origin-of-species-ia.pdf', [9, 10]),
  },
  {
    name: 'compare-tracemonkey-base.pdf',
    from: 'reports/pdfjs-tracemonkey.pdf',
    what: 'pages 1-5 (compare version A)',
    make: () => subset('reports/pdfjs-tracemonkey.pdf', [0, 1, 2, 3, 4]),
  },
  {
    name: 'compare-tracemonkey-inserted.pdf',
    from: 'reports/pdfjs-tracemonkey.pdf',
    what: 'pages 1, 2, 9, 3, 4, 5 (compare version B: one page inserted)',
    make: () => subset('reports/pdfjs-tracemonkey.pdf', [0, 1, 8, 2, 3, 4]),
  },
  {
    name: 'c-rot180-origin.pdf',
    from: TM,
    what: 'pages 1-2, /Rotate 180, MediaBox origin (150, 250), CropBox inset 30/50/20/40 pt',
    make: () => fromPages([0, 1].map((i) => [TM, i, { dx: 150, dy: 250, rotate: 180, inset: [30, 50, 20, 40] }])),
  },
  {
    name: 'c-rot270-cropbox.pdf',
    from: TM,
    what: 'pages 1-2, /Rotate 270, CropBox inset 45/25/35/55 pt',
    make: () => fromPages([0, 1].map((i) => [TM, i, { rotate: 270, inset: [45, 25, 35, 55] }])),
  },
  {
    name: 'c-mixed.pdf',
    from: `${TM} + ${FAX}`,
    what: 'mixed sizes: letter portrait, landscape scan page, /Rotate 90 + origin (-300, 120) + CropBox, scan page /Rotate 270, /Rotate -90',
    make: () =>
      fromPages([
        [TM, 0],
        [FAX, 1],
        [TM, 2, { dx: -300, dy: 120, rotate: 90, inset: [10, 20, 30, 40] }],
        [FAX, 0, { rotate: 270 }],
        [TM, 3, { rotate: -90 }],
      ]),
  },
  {
    name: 'c-fw9-rot90.pdf',
    from: 'forms/irs-fw9.pdf',
    what: 'IRS W-9 form with /Rotate 90 on every page (add and fill fields sideways)',
    make: async () => {
      const doc = await PDFDocument.load(read('forms/irs-fw9.pdf'), { ignoreEncryption: true })
      doc.getPages().forEach((p) => p.setRotation(degrees(90)))
      return doc.save()
    },
  },
]

export async function deriveAll({ force = false, log = console.log } = {}) {
  mkdirSync(DERIVED, { recursive: true })
  const manifest = []
  for (const f of FIXTURES) {
    const dest = join(DERIVED, f.name)
    if (force || !existsSync(dest)) {
      const bytes = await f.make()
      writeFileSync(dest, bytes)
      log(`derived ${f.name} (${bytes.length} bytes)`)
    }
    manifest.push({ name: f.name, from: f.from, what: f.what, password: f.password ?? null })
  }
  writeFileSync(join(DERIVED, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

if (process.argv[1] && /[\\/]derive\.mjs$/.test(process.argv[1])) {
  await deriveAll({ force: process.argv.includes('--force') })
}
