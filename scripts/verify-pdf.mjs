// Dev utility: prints page count and the text markers found in each page's
// content stream, in page order. Usage: node scripts/verify-pdf.mjs <file.pdf>
import { PDFDocument, PDFName, PDFRawStream, PDFArray } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

const bytes = await readFile(process.argv[2])
const doc = await PDFDocument.load(bytes)
console.log(`pages: ${doc.getPageCount()}`)

doc.getPages().forEach((page, i) => {
  const contents = page.node.get(PDFName.of('Contents'))
  const streams = []
  const resolve = (ref) => doc.context.lookup(ref)
  const obj = resolve(contents)
  if (obj instanceof PDFArray) {
    for (let j = 0; j < obj.size(); j++) streams.push(resolve(obj.get(j)))
  } else {
    streams.push(obj)
  }
  let text = ''
  for (const s of streams) {
    if (s instanceof PDFRawStream) {
      const raw = s.getContents()
      const filter = s.dict.get(PDFName.of('Filter'))
      try {
        text += String(filter) === '/FlateDecode' ? inflateSync(raw).toString('latin1') : Buffer.from(raw).toString('latin1')
      } catch {
        text += Buffer.from(raw).toString('latin1')
      }
    }
  }
  // pdf-lib writes text operands as hex strings: <44...> Tj — decode them all.
  const hexStrings = [...text.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) =>
    Buffer.from(m[1], 'hex').toString('latin1'),
  )
  const literalStrings = [...text.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((m) => m[1])
  const decoded = [...hexStrings, ...literalStrings].join(' | ')
  const rotation = page.getRotation().angle
  console.log(`page ${i + 1} [rot ${rotation}]: ${decoded || '(no text found)'}`)
})
