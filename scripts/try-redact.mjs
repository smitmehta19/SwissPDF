// Probe mupdf.js redaction API: add a Redact annotation, apply it, verify the
// text underneath is truly gone from the file.
import * as mupdf from 'mupdf'
import { readFile } from 'node:fs/promises'

const bytes = await readFile('public/samples/doc-a.pdf')
const doc = mupdf.Document.openDocument(bytes, 'application/pdf')
const page = doc.loadPage(0)

console.log('page methods with redact/annot:',
  Object.getOwnPropertyNames(Object.getPrototypeOf(page)).filter((m) => /redact|annot/i.test(m)))

// text position: 'A-P1' drawn at x:40 y:340 size:18 on a 300x400 page.
// MuPDF rect origin is top-left: y_top = 400 - 340 - 18 = ~42
const annot = page.createAnnotation('Redact')
console.log('annot created:', annot.getType())
annot.setRect([30, 35, 200, 70])
page.applyRedactions()

const out = doc.saveToBuffer('garbage,compress').asUint8Array()
console.log('saved size:', out.length)

// verify text gone
const doc2 = mupdf.Document.openDocument(out, 'application/pdf')
const st = doc2.loadPage(0).toStructuredText()
console.log('text after redaction:', JSON.stringify(st.asText()))
