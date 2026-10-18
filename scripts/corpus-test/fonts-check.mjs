// Node check for src/lib/fonts.js: bidi order, per character coverage and
// clear errors. Lays out lines, reads back what each run draws (glyph code
// points in visual order), saves a PDF and extracts it with MuPDF.
// Usage: node scripts/corpus-test/fonts-check.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { ROOT } from './server.mjs'

const FONTS = join(ROOT, 'public', 'fonts')
let offline = false
globalThis.fetch = async (url) => {
  if (offline) throw new TypeError('Failed to fetch')
  const name = String(url).split('/').pop()
  const bytes = readFileSync(join(FONTS, name))
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }
}
const { layoutText, drawRuns, fontForText } = await import('../../src/lib/fonts.js')
const mupdf = await import('mupdf')

// What a run puts on the page, left to right.
function visual(runs) {
  return runs
    .map((r) => {
      const fk = r.font.embedder?.font
      if (typeof fk?.layout !== 'function') return r.text
      return fk
        .layout(r.text, r.font.embedder.fontFeatures)
        .glyphs.map((g) => String.fromCodePoint(...(g.codePoints.length ? g.codePoints : [0xfffd])))
        .join('')
    })
    .join('')
}
const rev = (s) => [...s].reverse().join('')

let fails = 0
function check(name, ok, detail = '') {
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`)
}

async function extract(lines) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([600, 80 + lines.length * 30])
  let y = page.getHeight() - 40
  for (const l of lines) {
    drawRuns(page, await layoutText(doc, l), { x: 20, y, size: 14 })
    y -= 30
  }
  const bytes = await doc.save()
  const m = mupdf.Document.openDocument(bytes, 'application/pdf')
  try {
    return m.loadPage(0).toStructuredText().asText()
  } finally {
    m.destroy()
  }
}

// bidi: numbers keep logical (left to right) reading order in RTL lines
const doc = await PDFDocument.create()
const cases = [
  ['ar decimal', '\u0627\u0644\u0633\u0639\u0631 3.14 \u062f\u0648\u0644\u0627\u0631', (v) => v === `${rev('\u062f\u0648\u0644\u0627\u0631')} 3.14 ${rev('\u0627\u0644\u0633\u0639\u0631')}`],
  ['ar indic digits', '\u0635\u0641\u062d\u0629 \u0661\u0660', (v) => v === `\u0661\u0660 ${rev('\u0635\u0641\u062d\u0629')}`],
  ['ar mixed', '\u0645\u0633\u0648\u062f\u0629 2024 DRAFT', (v) => v === `DRAFT 2024 ${rev('\u0645\u0633\u0648\u062f\u0629')}`],
  ['he date', '\u05ea\u05d0\u05e8\u05d9\u05da 12/05/2024', (v) => v === `12/05/2024 ${rev('\u05ea\u05d0\u05e8\u05d9\u05da')}`],
  ['he percent', '\u05d4\u05e0\u05d7\u05d4 25%', (v) => v === `25% ${rev('\u05d4\u05e0\u05d7\u05d4')}`],
  ['ltr with ar word', 'Total \u0633\u0639\u0631 12', (v) => v.startsWith('Total ') && v.includes('12')],
]
for (const [name, text, ok] of cases) {
  const v = visual(await layoutText(doc, text))
  check(`bidi ${name}`, ok(v), JSON.stringify(v))
}

// coverage: Traditional Chinese, Korean with Hanja, Bengali, Tamil, Thai, symbols
const scripts = [
  ['zh-hant', '\u6a5f\u5bc6 \u9ad4 \u6587\u4ef6'],
  ['ko-hanja', '\ub300\ud55c\ubbfc\uad6d \u5927\u97d3\u6c11\u570b'],
  ['bn', '\u0997\u09cb\u09aa\u09a8\u09c0\u09af\u09bc \u09e7\u09e8\u09e9'],
  ['ta', '\u0bb0\u0b95\u0b9a\u0bbf\u0baf\u0bae\u0bcd'],
  ['th', '\u0e25\u0e31\u0e1a\u0e40\u0e09\u0e1e\u0e32\u0e30'],
  ['symbols', '\u2713 Approved \u2605 \u2192 done'],
  ['decomposed accent', 'Cafe\u0301'],
]
const txt = await extract(scripts.map(([, t]) => t))
check('no U+FFFD in extracted text (MuPDF)', !txt.includes('\ufffd'), JSON.stringify(txt.slice(0, 200)))
for (const [name, t] of scripts) {
  const words = t.normalize('NFC').split(' ').filter((w) => !/[\u0900-\u0dff\u0e00-\u0e7f]/.test(w))
  check(`${name} extracts back`, words.every((w) => txt.includes(w)), words.filter((w) => !txt.includes(w)).join(' '))
}

// clear errors instead of boxes
async function errorOf(fn) {
  try {
    await fn()
    return null
  } catch (err) {
    return err.message
  }
}
const repro = '\u6a5f\u5bc6 \u9ad4 \u6587\u4ef6 \u09e7\u09e8 \u{1f600}'
let msg = await errorOf(() => layoutText(doc, repro))
check('review #1 repro errors naming the emoji', /U\+1F600/.test(msg ?? ''), msg)
msg = await errorOf(() => layoutText(doc, 'Han \u{20000}'))
check('char in no font errors naming it', /U\+20000/.test(msg ?? ''), msg)
msg = await errorOf(() => fontForText(doc, '\u{1f600}'))
check('fontForText errors on emoji', /U\+1F600/.test(msg ?? ''), msg)
const f = await fontForText(doc, '\u6a5f\u5bc6')
check('fontForText picks a font with the Traditional glyphs', f.embedder?.font?.hasGlyphForCodePoint(0x6a5f), f.name)

// offline: friendly message
offline = true
const fresh = await PDFDocument.create()
msg = await errorOf(() => layoutText(fresh, '\u0917\u094b\u092a\u0928\u0940\u092f'))
check('offline font load error is friendly', /Couldn't load the font for Hindi text\. Check your connection/.test(msg ?? ''), msg)
offline = false
const back = visual(await layoutText(fresh, '\u0917\u094b\u092a\u0928\u0940\u092f'))
check('font loads again once online', back.includes('\u0917'), back)

// winAnsi cache keyed per font (Symbol has no Latin letters)
const sym = await layoutText(doc, 'abc', { standard: StandardFonts.Symbol })
const hel = await layoutText(doc, 'abc')
check('winAnsi cache keyed per font', hel[0].font !== sym[0].font)

console.log(fails ? `${fails} failed` : 'all passed')
process.exit(fails ? 1 : 0)
