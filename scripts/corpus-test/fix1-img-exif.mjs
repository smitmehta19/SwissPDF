// Images to PDF drops photo metadata (review integ-1 #10): EXIF with the GPS
// block must not reach the PDF unless "Keep photo metadata" is on, and the
// EXIF orientation is still applied. Runs the app's decodeImages +
// imagesToPdf in Chromium on the corpus phone photo.
// Usage: node scripts/corpus-test/fix1-img-exif.mjs [--lib /src/lib/imageOps.js]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { startServer, ROOT } from './server.mjs'

const at = process.argv.indexOf('--lib')
const lib = at > 0 ? process.argv[at + 1] : '/src/lib/imageOps.js'
const PHOTO = 'test-corpus/images/photo-24MP-punjab-smartphone.jpg'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}

// IFD0 entries of the first Exif APP1 block: { tag: valueOffset }
function exifTags(b) {
  const i = b.indexOf(Buffer.from('Exif\0\0', 'latin1'))
  if (i < 0) return null
  const t = i + 6
  const le = b[t] === 0x49
  const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o))
  const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o))
  const ifd = t + u32(t + 4)
  const tags = {}
  for (let k = 0; k < u16(ifd); k++) tags[u16(ifd + 2 + k * 12).toString(16)] = ifd + 2 + k * 12
  return { tags, le, u16 }
}
const has = (buf, s) => Buffer.from(buf).indexOf(Buffer.from(s, 'latin1')) >= 0

const src = readFileSync(join(ROOT, PHOTO))
const orig = exifTags(src)
check('input photo has EXIF with a GPS block (tag 8825)', !!orig?.tags['8825'], orig ? Object.keys(orig.tags).join(',') : 'no EXIF')
// a copy with orientation 6 (turned a quarter), to check it is still applied
const rotated = Buffer.from(src)
const oe = orig.tags['112']
if (oe) orig.le ? rotated.writeUInt16LE(6, oe + 8) : rotated.writeUInt16BE(6, oe + 8)
check('input has an orientation tag to patch', !!oe)

const dev = await startServer()
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto(`${dev.url}/`, { waitUntil: 'load' })

const run = (bytes, opts) =>
  page.evaluate(
    async ({ lib, b64, opts }) => {
      const m = await import(lib)
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const frames = await m.decodeImages(bytes, opts)
      // the embedded JPEG must still decode to the same picture size
      const bmp = await createImageBitmap(new Blob([frames[0].bytes]), { imageOrientation: 'none' })
      const size = [bmp.width, bmp.height]
      bmp.close()
      const pdf = await m.imagesToPdf(frames, { pageSize: 'fit', dpi: 150 })
      let s = ''
      for (let i = 0; i < pdf.length; i += 0x8000) s += String.fromCharCode(...pdf.subarray(i, i + 0x8000))
      return { pdf: btoa(s), orientation: frames[0].orientation, size, frameLen: frames[0].bytes.length }
    },
    { lib, b64: bytes.toString('base64'), opts },
  )

const def = await run(src, {})
const pdf = Buffer.from(def.pdf, 'base64')
check('default: no Exif block in the PDF', !has(pdf, 'Exif\0\0'), `${pdf.length} bytes`)
check('default: no XMP in the PDF', !has(pdf, 'http://ns.adobe.com/xap/1.0/'))
check('default: no GPS IFD pointer', !exifTags(pdf))
check('default: embedded JPEG decodes at full size', def.size.join('x') === '5472x3648' || def.size[0] > 4000, def.size.join('x'))
check('default: JPEG not re-encoded (same size minus metadata)', src.length - def.frameLen > 0 && src.length - def.frameLen < 200_000, `${src.length - def.frameLen} bytes removed`)

const keep = await run(src, { keepMetadata: true })
const kpdf = Buffer.from(keep.pdf, 'base64')
check('keep metadata: Exif with GPS stays', !!exifTags(kpdf)?.tags['8825'])

const rot = await run(rotated, {})
const rpdf = await PDFDocument.load(Buffer.from(rot.pdf, 'base64'))
const p = rpdf.getPage(0)
check('orientation 6 still read before stripping', rot.orientation === 6, String(rot.orientation))
check('orientation 6: page is portrait (turned upright)', p.getHeight() > p.getWidth(), `${p.getWidth().toFixed(0)}x${p.getHeight().toFixed(0)}`)
check('orientation 6: no Exif in the PDF', !has(Buffer.from(rot.pdf, 'base64'), 'Exif\0\0'))

await browser.close()
await dev.server.close()
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
