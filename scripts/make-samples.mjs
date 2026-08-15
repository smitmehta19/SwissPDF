// Generates sample PDFs into public/samples/ for testing the tools.
// Run: npm run make-samples
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { mkdir, writeFile } from 'node:fs/promises'

const outDir = new URL('../public/samples/', import.meta.url)
await mkdir(outDir, { recursive: true })

async function makePdf(name, pageCount, label, color) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([595, 842]) // A4
    page.drawText(`${label} — page ${i} of ${pageCount}`, {
      x: 60,
      y: 760,
      size: 24,
      font,
      color,
    })
    page.drawText(`This page belongs to ${name}. Marker: ${label}-P${i}`, {
      x: 60,
      y: 700,
      size: 12,
      font,
    })
  }
  const bytes = await doc.save()
  await writeFile(new URL(name, outDir), bytes)
  console.log(`wrote public/samples/${name} (${pageCount} pages, ${bytes.length} bytes)`)
}

await makePdf('doc-a.pdf', 3, 'DOC-A', rgb(0.8, 0.1, 0.1))
await makePdf('doc-b.pdf', 2, 'DOC-B', rgb(0.1, 0.4, 0.8))
await makePdf('doc-c.pdf', 5, 'DOC-C', rgb(0.1, 0.6, 0.3))
await makePdf('single-page.pdf', 1, 'SINGLE', rgb(0.5, 0.2, 0.7))
await makePdf('doc-large.pdf', 60, 'BIG', rgb(0.2, 0.2, 0.2))
await makePdf('doc-xl.pdf', 130, 'XL', rgb(0.3, 0.3, 0.3))

// A deliberately corrupt "PDF" for edge-case testing.
await writeFile(new URL('corrupt.pdf', outDir), 'This is not a real PDF file at all.')
console.log('wrote public/samples/corrupt.pdf (invalid on purpose)')

// A repairable damaged PDF: doc-c with its tail torn off (broken xref).
const { readFile } = await import('node:fs/promises')
const whole = await readFile(new URL('doc-c.pdf', outDir))
await writeFile(new URL('damaged.pdf', outDir), whole.slice(0, whole.length - 300))
console.log('wrote public/samples/damaged.pdf (torn tail, repairable)')
