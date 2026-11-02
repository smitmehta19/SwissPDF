// Edit text that is already in a PDF, in place (Edit PDF > Edit text).
// Worker-safe: MuPDF, pdf-lib and fonts.js only, no DOM.
//
// How it works:
// 1. MuPDF structured text finds each line: font, size, colour, baseline and
//    glyph quads.
// 2. Text-only redaction on a thin band around the baseline removes just the
//    edited glyphs.
// 3. The new text is drawn with the same PDF font when the file already draws
//    every needed character with that font (ToUnicode or /Widths alone are no
//    proof), and an ink test shows each glyph really has ink. Otherwise a close
//    fallback: a standard font picked by name (bold/italic kept) for Latin,
//    Noto through fonts.js (shaping, bidi) for other scripts. The fallback is
//    laid out in a tiny pdf-lib file and grafted in as a form XObject, so a big
//    file is never re-parsed by pdf-lib.
// 4. Longer text pushes the rest of its line right; nothing else moves. With
//    fit, the new text is squeezed to the old width instead.
// 5. Shaped-script fallbacks (Devanagari) sit in an ActualText span so they
//    extract; other text reads back from its own glyphs (an ActualText over
//    Latin made poppler read words reversed and out of place).
// 6. Interactive edits save fast (appended); finalizeEdits does the garbage
//    collected save so the old text is really gone from the file.
//
// API. pageNum is 1-based. Boxes are view space: points from the top-left of
// the visible page (rotation and CropBox applied), as pdf.js renders at scale 1.
//
// pageTextModel(bytes, pageNum) -> {
//   page: { width, height, rotate, box: [x0, y0, x1, y1] (user space), scanned },
//   signed: boolean, // a signed signature field: editing removes it
//   runs: [{ id, text, bbox: [x0, y0, x1, y1], baseline, origin: [x, y], dir: [dx, dy],
//            fontName, fontSize, color: [r, g, b] (0..1), bold, italic, script,
//            editable, why: null | 'scanned' | 'hidden' | 'vertical' | 'no-unicode' | 'xfa-dynamic'
//                 | 'type3' | 'covered' | 'form-field' | 'comment',
//            words: [{ i, text, bbox, covered }] }] }
//   covered: something opaque is painted over it after the text (a box
//   hiding it); a covered word is refused 'covered'.
//   One run = one line. Run ids hold only for the bytes they came from: read
//   the model again after every edit.
//   Form field values (id p<n>-f<k>, why 'form-field') and FreeText comments
//   (id p<n>-c<k>, why 'comment') are listed so the UI can say where to edit
//   them; they have editable false, origin and baseline null, fontSize 0,
//   fontName '', dir [1, 0] and no words.
//
// editText(bytes, edits, { fit = false, final = false, spill = true })
//   -> { bytes, report, signatureRemoved, xfaRemoved, ms: { edit, save, total } (numbers) }
//   spill: a single line edit on a page that does not fit its line goes on
//   onto new lines below it, the rest of its paragraph moving down whole; an
//   emptied line closes up (rows below move up). Report adds
//   spill: { lines (rows gained, -1 closed), moved (rows moved) }. When that
//   cannot be done the edit runs as before; a 'no-room' refusal then reads
//   'no-room-below'.
//   A line edit that would grow off the page or through a drawing under it
//   (a box or cell border, a rule, a fill) and cannot spill is refused
//   'off-page' / 'crosses-drawing' (fit: true squeezes it instead).
//   xfaRemoved: the file had an XFA copy of its form (/AcroForm /XFA, which
//   keeps the old text); it was dropped
//   final false (interactive): a fast appending save; the old text is still
//   in the bytes. Call finalizeEdits once before the file leaves the tool.
//   edits: [{ pageNum, runId, wordIndex (null = whole line), text, old? }]
//     old: optional, the text the UI thinks it replaces ('stale' if not).
//   report (same order as edits): [{ runId, wordIndex,
//     font: 'original' | 'fallback' | null (deleted), fallbackName,
//     overflow (the line now passes its paragraph's right edge (justified
//       paragraph: the edge itself; ragged: 10% of its width past the widest
//       line), the page margin or the next text on the same row; a line that
//       only gets longer inside its paragraph is not overflow),
//     refused: null | reason, char (for 'unsupported-char'),
//     fit (scale used or null), shift (pt this edit's start moved: an earlier
//     edit on the line pushed it), pushed (pt the text after it moved),
//     box (new text), changedBox (old + new + moved text) }]
//   noPush: null | 'rtl' | 'covered' | 'opacity' | 'render-mode' | 'clip' |
//     'encoding' (why the rest of the line stayed and the text was squeezed)
//   Refusal reasons: the run's why, or 'not-found', 'stale', 'conflict',
//   'no-unicode', 'unsupported-char', 'no-glyph', 'covered' (something is
//   painted over the word), 'no-room', 'tight-lines' (removing the word
//   would touch the next line; page left unchanged). Other edits still apply.
//
// Paragraphs (phase 2). pageTextModel also returns
//   paragraphs: [{ id 'p<n>-g<k>', runIds, bbox, text ('\n' = hard break),
//     align: left|right|centre|justify, dir: ltr|rtl, editable, why
//     (run whys, 'no-unicode', 'covered', 'layout', 'encoding'), lines, fontSize }]
// and editText takes { pageNum, paragraphId, text, old? } ('' deletes), one
// per page per call. Report: { paragraphId, font: 'original' | 'fallback' |
//   'mixed' | null, fallbackName, lines, overflow, refused, char, fit, box,
//   changedBox }. Source line breaks are kept while the text fits them, else
//   it re-wraps; more lines use free space below, then a squeeze to 85%,
//   then 'no-room'. Layout math lives in editParagraph.js.
//
// finalizeEdits(bytes) -> { bytes, ms }: garbage-collected save that drops
//   every earlier version and loose object (old text included).
//
// isScanned(bytes, pageNum) -> boolean
//
// Edits of text drawn by an earlier edit take that draw out whole (each new
// run sits in a /Span with an /SPDFBox entry) instead of stacking a new draw.
// The rest of a line is pushed only where that is safe: nothing painted over
// it, full opacity, plain fill, inside its clip; otherwise the new text is
// squeezed into the old width ('no-room' below 60%). ActualText, Alt and E
// that named a removed word are cut. Known limit: new text is drawn after
// the page content, so it reads last in copy/paste and is not in the
// structure tree.
import { findParagraphs, diffWords, splitWords, layoutWindow, spillLayout, joinAccents } from './editParagraph.js'

let mupdfPromise = null
const getMupdf = () => (mupdfPromise ??= import('mupdf'))

const copy = (bytes) => new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).slice()
const takeBytes = (buf) => new Uint8Array(buf.asUint8Array ? buf.asUint8Array() : buf).slice()

function openPdf(mupdf, bytes) {
  const doc = mupdf.Document.openDocument(copy(bytes), 'application/pdf')
  const pdf = doc.asPDF()
  if (!pdf) {
    doc.destroy?.()
    throw new Error('Not a PDF file.')
  }
  return pdf
}

// ---------- geometry ----------
const qbox = (q) => [Math.min(q[0], q[2], q[4], q[6]), Math.min(q[1], q[3], q[5], q[7]), Math.max(q[0], q[2], q[4], q[6]), Math.max(q[1], q[3], q[5], q[7])]
const unionBox = (bs) => bs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])])
const inv = (m) => {
  const [a, b, c, d, e, f] = m
  const det = a * d - b * c
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}
const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]
const applyV = (m, v) => [m[0] * v[0] + m[2] * v[1], m[1] * v[0] + m[3] * v[1]]
const norm = (v) => {
  const l = Math.hypot(v[0], v[1]) || 1
  return [v[0] / l, v[1] / l]
}
const dot = (p, d) => p[0] * d[0] + p[1] * d[1]
const r2 = (x) => Math.round(x * 100) / 100
// text closer than this to the visible page edge counts as past the margin
const PAGE_MARGIN = 4
const f4 = (x) => +x.toFixed(4)
const toView = (box, bounds) => [box[0] - bounds[0], box[1] - bounds[1], box[2] - bounds[0], box[3] - bounds[1]].map(r2)
// extent of a quad along a direction
const along = (q, d) => {
  const v = [dot([q[0], q[1]], d), dot([q[2], q[3]], d), dot([q[4], q[5]], d), dot([q[6], q[7]], d)]
  return [Math.min(...v), Math.max(...v)]
}

// Box of text drawn from `o` along `dir` for `adv` points (up is left of dir).
function orientedBox(o, dir, adv, size) {
  const up = [dir[1], -dir[0]]
  const pts = [[0, -0.25], [0, 0.95], [adv, -0.25], [adv, 0.95]].map(([a, h]) => [o[0] + dir[0] * a + up[0] * h * size, o[1] + dir[1] * a + up[1] * h * size])
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]
}

// Redaction band around the baseline, perpendicular to the line: the full
// quad would clip glyphs on tightly spaced neighbouring lines.
function redactBand(chars, dir) {
  const box = unionBox(chars.map((c) => qbox(c.quad)))
  const s = chars[0].size
  const o = chars[0].origin
  if (Math.abs(dir[0]) >= Math.abs(dir[1])) {
    const up = dir[0] > 0 ? -1 : 1
    const y1 = o[1] + up * 0.45 * s
    const y2 = o[1] - up * 0.05 * s
    return [box[0] + 0.15, Math.min(y1, y2), box[2] - 0.15, Math.max(y1, y2)]
  }
  const up = dir[1] > 0 ? 1 : -1
  const x1 = o[0] + up * 0.45 * s
  const x2 = o[0] - up * 0.05 * s
  return [Math.min(x1, x2), box[1] + 0.15, Math.max(x1, x2), box[3] - 0.15]
}

// ---------- scripts ----------
const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u
// scripts that need shaping: always drawn with Noto through fonts.js
const COMPLEX = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Thai}\p{Script=Lao}\p{Script=Tibetan}\p{Script=Myanmar}\p{Script=Khmer}]/u
const NO_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u
// no Unicode mapping: MuPDF gives U+FFFD, control or private-use characters
const BAD_CHAR = /[\ufffd\u0000-\u0008\u000e-\u001f\u007f-\u009f\ue000-\uf8ff]/u
const SCRIPT_NAMES = [
  ['arabic', /\p{Script=Arabic}/u],
  ['hebrew', /\p{Script=Hebrew}/u],
  ['devanagari', /\p{Script=Devanagari}/u],
  ['bengali', /\p{Script=Bengali}/u],
  ['tamil', /\p{Script=Tamil}/u],
  ['thai', /\p{Script=Thai}/u],
  ['cjk', /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['greek', /\p{Script=Greek}/u],
  ['latin', /\p{Script=Latin}/u],
]
function scriptOf(text) {
  for (const ch of text) {
    const hit = SCRIPT_NAMES.find(([, re]) => re.test(ch))
    if (hit) return hit[0]
  }
  return 'other'
}

const stripPrefix = (n) => String(n).replace(/^\//, '').replace(/^[A-Z]{6}\+/, '')
const isBold = (name) => /bold|medi|black|heavy|semibold|demi|-bd\b|bd$|\bbd\b/i.test(stripPrefix(name))
const isItalic = (name) => /ital|oblique|-it\b|slant|bdit$/i.test(stripPrefix(name))

// Standard font for a fallback, by name (MuPDF's bold/serif flags are often wrong).
function standardFor(name) {
  const n = stripPrefix(name).toLowerCase()
  const bold = isBold(n)
  const ital = isItalic(n)
  const fam = /cour|mono|consol|sftt|cmtt|typewriter/.test(n) ? 'C' : /times|roman|serif|nimbusrom|cmr|georgia|garamond|minion|cambria|book|century|schlbk/.test(n) && !/sans|helvetica|arial/.test(n) ? 'T' : 'H'
  const T = {
    H: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
    T: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
    C: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
  }[fam]
  return T[(bold ? 1 : 0) + (ital ? 2 : 0)]
}

function colorRGB(c) {
  if (c.length === 1) return [c[0], c[0], c[0]]
  if (c.length === 4) return [(1 - c[0]) * (1 - c[3]), (1 - c[1]) * (1 - c[3]), (1 - c[2]) * (1 - c[3])]
  return c.slice(0, 3)
}
function colorOp(c) {
  if (c.length === 1) return `${f4(c[0])} g`
  if (c.length === 4) return `${c.map(f4).join(' ')} k`
  return `${c.slice(0, 3).map(f4).join(' ')} rg`
}

// Stroke colour (same colour space as the fill).
const strokeOp = (c) => colorOp(c).replace(/ (g|rg|k)$/, (m, op) => ` ${op.toUpperCase()}`)
// Synthetic bold for a fallback with no bold face (Noto Arabic, Devanagari):
// fill plus a thin outline in the text colour.
const fakeBold = (c, size) => `${strokeOp(c)} 2 Tr ${f4(0.03 * size)} w `
const needsFakeBold = (orig, draw) => draw?.kind === 'form' && isBold(orig) && !/bold/i.test(draw.name)

// UTF-16BE hex with BOM, for ActualText
function utf16Hex(s) {
  let h = 'FEFF'
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase()
  return h
}

// ---------- fonts in the file ----------
const BASE14 = new Set(['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique', 'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic', 'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique', 'Symbol', 'ZapfDingbats'])

// Font dicts a page can reach (its own and nested form XObjects).
function pageFontDicts(pageObj) {
  const out = []
  const seen = new Set()
  const visit = (res) => {
    if (!res || !res.isDictionary()) return
    const fd = res.get('Font')
    if (fd.isDictionary()) fd.forEach((v, k) => out.push({ key: k, ref: v }))
    const xo = res.get('XObject')
    if (xo.isDictionary()) {
      xo.forEach((v) => {
        const n = v.isIndirect() ? v.asIndirect() : null
        if (n != null) {
          if (seen.has(n)) return
          seen.add(n)
        }
        if (v.isDictionary() && v.get('Subtype').toString() === '/Form') visit(v.get('Resources'))
      })
    }
  }
  visit(pageObj.getInheritable('Resources'))
  return out
}

function hexToBytes(h) {
  const a = []
  for (let i = 0; i < h.length; i += 2) a.push(parseInt(h.slice(i, i + 2), 16))
  return a
}
function utf16(h) {
  const a = hexToBytes(h)
  let s = ''
  for (let i = 0; i + 1 < a.length; i += 2) s += String.fromCharCode((a[i] << 8) | a[i + 1])
  return s
}

// ToUnicode CMap -> Map(unicode string -> code), plus the code width in bytes
function parseToUnicode(text) {
  const map = new Map()
  let bytes = null
  const cs = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(text)
  if (cs) {
    const m = /<([0-9a-fA-F]+)>/.exec(cs[1])
    if (m) bytes = m[1].length / 2
  }
  for (const blk of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      const code = parseInt(m[1], 16)
      bytes ??= m[1].length / 2
      const u = utf16(m[2])
      if (u && !map.has(u)) map.set(u, code)
    }
  }
  for (const blk of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]*)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(m[1], 16)
      const hi = parseInt(m[2], 16)
      bytes ??= m[1].length / 2
      if (m[4] != null) {
        const base = hexToBytes(m[4])
        for (let c = lo; c <= hi && c - lo < 65536; c++) {
          const b = base.slice()
          let carry = c - lo
          for (let i = b.length - 1; i >= 0 && carry; i--) {
            const v = b[i] + carry
            b[i] = v & 255
            carry = v >> 8
          }
          const u = utf16(b.map((x) => x.toString(16).padStart(2, '0')).join(''))
          if (u && !map.has(u)) map.set(u, c)
        }
      } else {
        const list = [...m[5].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => x[1])
        list.forEach((h, i) => {
          const u = utf16(h)
          if (u && !map.has(u)) map.set(u, lo + i)
        })
      }
    }
  }
  return { map, bytes: bytes ?? 1 }
}

// glyph names for simple fonts without ToUnicode
const NAMED = { space: ' ', hyphen: '-', period: '.', comma: ',', colon: ':', semicolon: ';', zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', parenleft: '(', parenright: ')', slash: '/', ampersand: '&', quoteright: '\u2019', quoteleft: '\u2018', fi: 'fi', fl: 'fl' }

// WinAnsi codes 0x80..0x9f
const WIN_ANSI_HIGH = ['\u20ac', '', '\u201a', '\u0192', '\u201e', '\u2026', '\u2020', '\u2021', '\u02c6', '\u2030', '\u0160', '\u2039', '\u0152', '', '\u017d', '', '', '\u2018', '\u2019', '\u201c', '\u201d', '\u2022', '\u2013', '\u2014', '\u02dc', '\u2122', '\u0161', '\u203a', '\u0153', '', '\u017e', '\u0178']

// What we need to write with a font dict: unicode -> code, widths, code size.
function fontInfo(mupdf, ref) {
  const info = { ref, base: '', sub: '', rev: new Map(), bytes: 1, widths: new Map(), dw: 0, ok: true }
  try {
    info.base = ref.get('BaseFont').toString()
    info.sub = ref.get('Subtype').toString()
    if (info.sub === '/Type3') {
      info.ok = false
      return info
    }
    const tu = ref.get('ToUnicode')
    if (info.sub === '/Type0') {
      info.bytes = 2
      if (!/Identity-[HV]/.test(ref.get('Encoding').toString())) info.ok = false
      const df = ref.get('DescendantFonts').get(0)
      info.dw = df.get('DW').isNull() ? 1000 : df.get('DW').asNumber()
      // code = glyph id: moved glyphs can be drawn again by id (shaped Arabic)
      const c2g = df.get('CIDToGIDMap')
      // embedded only: for a substituted font MuPDF's glyph ids are the substitute's
      const fdsc = df.get('FontDescriptor')
      info.byGid = info.ok && df.get('Subtype').toString() === '/CIDFontType2' && (c2g.isNull() || c2g.toString() === '/Identity') && fdsc.isDictionary() && !fdsc.get('FontFile2').isNull()
      const W = df.get('W')
      if (W.isArray()) {
        for (let i = 0; i < W.length; ) {
          const c = W.get(i).asNumber()
          const n = W.get(i + 1)
          if (n.isArray()) {
            for (let j = 0; j < n.length; j++) info.widths.set(c + j, n.get(j).asNumber())
            i += 2
          } else {
            const w = W.get(i + 2).asNumber()
            for (let x = c; x <= n.asNumber(); x++) info.widths.set(x, w)
            i += 3
          }
        }
      }
    } else {
      const fc = ref.get('FirstChar')
      const W = ref.get('Widths')
      if (W.isArray()) for (let i = 0; i < W.length; i++) info.widths.set(fc.asNumber() + i, W.get(i).asNumber())
      else if (BASE14.has(stripPrefix(info.base))) info.base14 = stripPrefix(info.base)
      else info.ok = false
    }
    if (!tu.isNull() && tu.isStream()) {
      const p = parseToUnicode(new TextDecoder('latin1').decode(takeBytes(tu.readStream())))
      info.rev = p.map
      // simple fonts are always 1-byte codes, whatever the CMap says
      info.bytes = info.sub === '/Type0' ? p.bytes : 1
    } else if (info.sub !== '/Type0') {
      for (let c = 32; c < 127; c++) info.rev.set(String.fromCharCode(c), c)
      // WinAnsi (the usual base encoding) has curly quotes, dashes and Latin-1 up top
      const encName = ref.get('Encoding')
      const base = encName.isDictionary() ? encName.get('BaseEncoding').toString() : encName.toString()
      if (base === '/WinAnsiEncoding') {
        WIN_ANSI_HIGH.forEach((u, k) => u && info.rev.set(u, 0x80 + k))
        for (let c = 0xa1; c < 0x100; c++) if (c !== 0xad) info.rev.set(String.fromCharCode(c), c)
      }
      const enc = ref.get('Encoding')
      const diff = enc.isDictionary() ? enc.get('Differences') : null
      if (diff && diff.isArray()) {
        let code = 0
        for (let i = 0; i < diff.length; i++) {
          const v = diff.get(i)
          if (v.isNumber()) code = v.asNumber()
          else {
            const n = v.toString().slice(1)
            const u = n.length === 1 ? n : (NAMED[n] ?? (/^uni[0-9A-F]{4}$/.test(n) ? String.fromCharCode(parseInt(n.slice(3), 16)) : null))
            if (u) info.rev.set(u, code)
            code++
          }
        }
      }
    } else info.ok = false
    if (info.base14) {
      const f = new mupdf.Font(info.base14)
      for (const [u, c] of info.rev) {
        const g = f.encodeCharacter(u.codePointAt(0))
        if (g > 0) info.widths.set(c, Math.round(f.advanceGlyph(g) * 1000))
      }
    }
    // a simple-font code with no width is not in the font
    if (info.sub !== '/Type0') for (const [u, c] of [...info.rev]) if (info.widths.size && !info.widths.get(c)) info.rev.delete(u)
  } catch {
    info.ok = false
  }
  return info
}

// unicode text -> [{ code, u }] (single chars first, then ligatures), null if a char has no code
function encode(info, text) {
  const out = []
  const ligs = [...info.rev.keys()].filter((k) => k.length > 1).sort((a, b) => b.length - a.length)
  for (let i = 0; i < text.length; ) {
    const cp = String.fromCodePoint(text.codePointAt(i))
    if (info.rev.has(cp)) {
      out.push({ code: info.rev.get(cp), u: cp })
      i += cp.length
      continue
    }
    const k = ligs.find((l) => text.startsWith(l, i))
    if (!k) return null
    out.push({ code: info.rev.get(k), u: k })
    i += k.length
  }
  return out
}
const widthOf = (info, code) => info.widths.get(code) ?? info.dw ?? 0
const hexOf = (info, codes) => codes.map((c) => c.code.toString(16).padStart(info.bytes * 2, '0')).join('')

// Font dicts for a MuPDF font name. MuPDF keeps the subset prefix but cuts
// names at 31 characters, so a 31-char name matches by prefix.
function fontDicts(mupdf, page, name) {
  page.fontCache ??= new Map()
  if (page.fontCache.has(name)) return page.fontCache.get(name)
  page.dicts ??= pageFontDicts(page.obj)
  const full = (d) => d.ref.get('BaseFont').toString().replace(/^\//, '')
  let found = page.dicts.filter((d) => full(d) === name || (name.length >= 31 && full(d).startsWith(name)))
  if (!found.length) {
    const want = stripPrefix(name)
    found = page.dicts.filter((d) => stripPrefix(full(d)) === want)
  }
  // one info per object
  const seen = new Set()
  const infos = []
  for (const d of found) {
    const n = d.ref.isIndirect() ? d.ref.asIndirect() : null
    if (n != null && seen.has(n)) continue
    if (n != null) seen.add(n)
    infos.push(fontInfo(mupdf, d.ref))
  }
  page.fontCache.set(name, infos)
  return infos
}

// ---------- reading a page ----------
// mupdf.js 1.28 hands stext and text-walk fonts to callbacks as borrowed
// pointers but still registers a finalizer that drops them: a double free,
// and on a 40-page scan enough finalizers to slow everything after it
// (seconds per call). Unhook it and read the name once per font per walk.
function fontName(font, names) {
  font.constructor._finalizer?.unregister(font)
  const k = font.pointer
  let n = names.get(k)
  if (n === undefined) {
    n = font.getName()
    names.set(k, n)
  }
  return n
}
// Char -> { c, origin, font, size, quad, color }; lines with their block box.
function readLines(page) {
  const lines = []
  let block = null
  let cur = null
  const names = new Map()
  const st = page.toStructuredText('preserve-whitespace')
  try {
    st.walk({
      beginTextBlock(bbox) {
        block = Array.isArray(bbox) || ArrayBuffer.isView(bbox) ? [...bbox] : bbox && 'x' in bbox ? [bbox.x, bbox.y, bbox.x + bbox.w, bbox.y + bbox.h] : null
      },
      beginLine(bbox, wmode, dir) {
        cur = { wmode, dir: norm([dir[0], dir[1]]), chars: [], block }
      },
      onChar(c, origin, font, size, quad, color) {
        cur.chars.push({ c, origin: [origin[0], origin[1]], font: fontName(font, names), size, quad: [...quad], color: [...color] })
      },
      endLine() {
        if (cur.chars.some((ch) => ch.c.trim())) lines.push(cur)
        cur = null
      },
    })
  } finally {
    st.destroy?.()
  }
  return lines
}

// Image coverage and which text is hidden: drawn before an image that covers
// it (OCR under a scan) or invisible (render mode 3). No image callbacks on
// the device: mupdf.js 1.28 double-frees images handed to them.
function hiddenFacts(mupdf, page, bounds) {
  const area = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]) || 1
  const st = page.toStructuredText('preserve-images')
  let blocks
  try {
    blocks = JSON.parse(st.asJSON()).blocks ?? []
  } finally {
    st.destroy?.()
  }
  let img = 0
  for (const b of blocks) if (b.type === 'image') img += b.bbox.w * b.bbox.h
  const inBox = (bb, p) => p[0] >= bb.x - 0.5 && p[0] <= bb.x + bb.w + 0.5 && p[1] >= bb.y - 0.5 && p[1] <= bb.y + bb.h + 0.5
  const invisible = []
  const dev = new mupdf.Device({
    ignoreText(text, ctm) {
      try {
        invisible.push(text.getBounds(null, ctm))
      } catch {
        /* no bounds */
      }
      text.destroy?.()
    },
  })
  try {
    page.runPageContents(dev, mupdf.Matrix.identity)
  } finally {
    dev.close()
    dev.destroy?.()
  }
  return {
    coverage: img / area,
    under(p) {
      const ti = blocks.findIndex((b) => b.type === 'text' && inBox(b.bbox, p))
      return ti >= 0 && blocks.slice(ti + 1).some((b) => b.type === 'image' && inBox(b.bbox, p))
    },
    invisible: (p) => invisible.some((r) => p[0] >= r[0] - 0.5 && p[0] <= r[2] + 0.5 && p[1] >= r[1] - 0.5 && p[1] <= r[3] + 0.5),
  }
}

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'word' }) : null

// Words of a line: whitespace-separated, and dictionary words inside text
// written without spaces (Chinese, Japanese, Thai). -> [{ a, b }] char ranges
function wordRanges(chars) {
  const out = []
  let a = -1
  const flush = (end) => {
    if (a < 0) return
    const text = chars.slice(a, end + 1).map((c) => c.c).join('')
    if (segmenter && NO_SPACES.test(text)) {
      const at = [] // string index -> char index
      chars.slice(a, end + 1).forEach((c, k) => {
        for (let j = 0; j < c.c.length; j++) at.push(a + k)
      })
      for (const s of segmenter.segment(text)) {
        if (!s.segment.trim()) continue
        out.push({ a: at[s.index], b: at[s.index + s.segment.length - 1] })
      }
    } else out.push({ a, b: end })
    a = -1
  }
  chars.forEach((c, i) => {
    if (!c.c.trim()) flush(i - 1)
    else if (a < 0) a = i
  })
  flush(chars.length - 1)
  return out
}

const textOf = (chars) => chars.map((c) => c.c).join('')
const isBad = (chars) => {
  const vis = chars.filter((c) => c.c.trim())
  return vis.length > 0 && vis.filter((c) => BAD_CHAR.test(c.c)).length / vis.length >= 0.3
}

// Everything both entry points need about one page.
function readPage(mupdf, doc, idx) {
  const page = doc.loadPage(idx)
  const bounds = page.getBounds()
  const obj = page.getObject()
  const P = { page, obj, bounds, idx, mupdf, doc }
  P.lines = readLines(page)
  const hid = hiddenFacts(mupdf, page, bounds)
  P.F = paintFacts(mupdf, page)
  const vis = (c) => c.c.trim()
  const hiddenChar = (c) => hid.under(c.origin) || hid.invisible(c.origin)
  const all = P.lines.flatMap((l) => l.chars.filter(vis))
  P.scanned = hid.coverage >= 0.5 && all.every(hiddenChar)
  P.runs = P.lines.map((line, li) => {
    const chars = line.chars
    const v = chars.filter(vis)
    let why = null
    if (P.scanned) why = v.every((c) => hid.invisible(c.origin)) && v.length ? 'hidden' : 'scanned'
    else if (v.every(hiddenChar)) why = 'hidden'
    else if (line.wmode === 1) why = 'vertical'
    else if (isBad(chars)) why = 'no-unicode'
    else if ([...new Set(v.map((c) => c.font))].some((n) => fontDicts(mupdf, P, n).some((i) => i.sub === '/Type3'))) why = 'type3'
    // something opaque is painted over the whole line (a box hiding it)
    else if (v.length && v.every((c) => coveredChar(P.F, c))) why = 'covered'
    const first = v[0] ?? chars[0]
    return { id: `p${idx + 1}-l${li}`, li, why, words: wordRanges(chars), first }
  })
  return P
}

function publicRun(P, run) {
  const line = P.lines[run.li]
  const chars = line.chars
  const b = P.bounds
  const ch = run.first
  const dir = line.dir
  const horiz = Math.abs(dir[0]) >= Math.abs(dir[1])
  return {
    id: run.id,
    text: textOf(chars),
    bbox: toView(unionBox(chars.map((c) => qbox(c.quad))), b),
    baseline: r2(horiz ? ch.origin[1] - b[1] : ch.origin[0] - b[0]),
    origin: [r2(ch.origin[0] - b[0]), r2(ch.origin[1] - b[1])],
    dir: [f4(dir[0]), f4(dir[1])],
    fontName: stripPrefix(ch.font),
    fontSize: r2(ch.size),
    color: colorRGB(ch.color).map(f4),
    bold: isBold(ch.font),
    italic: isItalic(ch.font),
    script: scriptOf(textOf(chars)),
    editable: !run.why,
    why: run.why,
    words: run.words.map((w, i) => ({ i, text: textOf(chars.slice(w.a, w.b + 1)), bbox: toView(unionBox(chars.slice(w.a, w.b + 1).map((c) => qbox(c.quad))), b), covered: chars.slice(w.a, w.b + 1).some((c) => c.c.trim() && coveredChar(P.F, c)) })),
  }
}

// Paragraphs of a page (stext blocks split where the text size changes),
// computed once per read.
function paragraphsOf(P) {
  if (P.paras) return P.paras
  P.paras = findParagraphs(ownLinesHome(P), P.runs, { bad: (c) => BAD_CHAR.test(c.c), covered: (c) => coveredChar(P.F, c), stuck: (c) => !canRedraw(P, c), bold: (c) => isBold(c.font), hyphen: (a, b) => hyphenKind(P, a, b), pageBox: P.bounds })
  return P.paras
}
// A re-wrap redraws every glyph: in its own font when the char re-encodes
// there, else through a fallback, which has WinAnsi and the Noto scripts.
// A math sign from a font with a built-in encoding (TeX CMSY "∗") has neither.
const WIN_ANSI_EXTRA = /[\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013\u2014\u2018-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]/u
const NOTO_SCRIPT = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Tamil}\p{Script=Thai}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Latin}\p{M}]/u
// a scratch document for probes while reading the model (freed with the page)
const scratchOf = (P) => (P.S ??= { doc: new P.mupdf.PDFDocument() })
function canRedraw(P, c) {
  P.redrawCache ??= new Map()
  const k = `${c.font}|${c.c}`
  if (!P.redrawCache.has(k)) {
    const cp = c.c.codePointAt(0)
    // ... or by glyph id (an unchanged word keeps its own glyphs, see gidDraw)
    const ok = cp < 0x250 || WIN_ANSI_EXTRA.test(c.c) || NOTO_SCRIPT.test(c.c) || fontDicts(P.mupdf, P, c.font).some((i) => (i.ok && encode(i, c.c)) || i.byGid || (i.ok && i.sub !== '/Type0' && i.sub !== '/Type3' && i.widths.size && P.F.gidsAt(c).length > 0 && P.F.gidsAt(c).every((x) => codeMap(P.mupdf, scratchOf(P), i).has(x.gid))))
    P.redrawCache.set(k, ok)
  }
  return P.redrawCache.get(k)
}
// A hyphen at a line end, between `a` and `b`: decided from the document's
// own words (3 pages on each side, mid-line words only; not this page, so
// an edit here cannot flip the decision for its next read): the joined
// form appears -> 'soft'; the hyphenated form appears, or `b` has its own
// hyphen or a capital -> 'real'; else 'keep' (the break stays where it is).
function hyphenKind(P, a, b) {
  const bare = (s) => s.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
  const r = bare(b)
  if (/[-\u2010]/.test(r) || /^\p{Lu}/u.test(r)) return 'real'
  if (!P.midWords) {
    P.midWords = new Set()
    const n = P.doc.countPages()
    for (let i = Math.max(0, P.idx - 3); i <= Math.min(n - 1, P.idx + 3); i++) {
      if (i === P.idx) continue
      const lines = (() => {
        const pg = P.doc.loadPage(i)
        try {
          return readLines(pg)
        } finally {
          pg.destroy?.()
        }
      })()
      for (const l of lines) {
        const toks = textOf(l.chars).split(/\s+/).filter(Boolean)
        for (const t of toks.slice(0, -1)) P.midWords.add(bare(t).toLowerCase())
      }
    }
  }
  const left = bare(a).toLowerCase()
  if (P.midWords.has(`${left}-${r.toLowerCase()}`)) return 'real'
  if (P.midWords.has(`${left}${r.toLowerCase()}`)) return 'soft'
  return 'keep'
}

// A line we drew again (word or line edit) comes after the page content, so
// MuPDF reads it as a block of its own and its paragraph gets a hole. Put
// such a one-line block back into the block it sits in: same size, inside
// its column, within a line gap of its lines. -> lines with `block` set
// (copies; P.lines stays as read) and `own` marking our redrawn lines.
function ownLinesHome(P) {
  const spans = [...ownSpans(P.obj), ...ownSpans(P.obj, 'SPDFRun')]
  if (!spans.length) return P.lines
  const inBox = (c, b) => {
    const q = qbox(c.quad)
    const x = (q[0] + q[2]) / 2
    const y = (q[1] + q[3]) / 2
    return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]
  }
  const lines = P.lines.map((l) => {
    const v = l.chars.filter((c) => c.c.trim())
    return { ...l, own: v.length > 0 && v.every((c) => spans.some((s) => inBox(c, s.box))) }
  })
  const blocks = new Map()
  lines.forEach((l, i) => l.block && (blocks.get(l.block) ?? blocks.set(l.block, []).get(l.block)).push(i))
  const geo = (idx) => {
    const l = lines[idx[0]]
    const dir = l.dir
    const down = [-dir[1], dir[0]]
    const v = idx.flatMap((i) => lines[i].chars.filter((c) => c.c.trim()))
    const vs = idx.map((i) => dot(lines[i].chars.find((c) => c.c.trim()).origin, down))
    const xs = v.map((c) => along(c.quad, dir))
    return { dir, top: Math.min(...vs), bottom: Math.max(...vs), x0: Math.min(...xs.map((x) => x[0])), x1: Math.max(...xs.map((x) => x[1])), size: v[0]?.size ?? 0, rows: new Set(vs.map((x) => Math.round(x))).size }
  }
  // lines a paragraph edit drew (span tagged with the paragraph's top-left):
  // back into the block that still starts there, else together
  const anchors = new Map()
  lines.forEach((l, i) => {
    if (!l.own) return
    const v = l.chars.filter((c) => c.c.trim())
    const sp = spans.find((x) => x.para && v.some((c) => inBox(c, x.box)))
    if (!sp) return
    const k = sp.para.map((x) => x.toFixed(1)).join()
    ;(anchors.get(k) ?? anchors.set(k, { at: sp.para, idx: [] }).get(k)).idx.push(i)
  })
  for (const { at, idx } of anchors.values()) {
    const tops = [...blocks.entries()].filter(([, ix]) => !ix.every((i) => lines[i].own)).map(([b, ix]) => [b, unionBox(ix.flatMap((i) => lines[i].chars.filter((c) => c.c.trim()).map((c) => qbox(c.quad))))])
    const home = tops.find(([, bb]) => Math.abs(bb[0] - at[0]) < 1.5 && Math.abs(bb[1] - at[1]) < 1.5)?.[0] ?? lines[idx[0]].block
    for (const i of idx) lines[i].block = home
    // the paragraph's own lines left as they were (below the window) too
    if (at.length === 4) {
      lines.forEach((l) => {
        const v = l.chars.filter((c) => c.c.trim())
        if (v.length && v.every((c) => {
          const q = qbox(c.quad)
          const x = (q[0] + q[2]) / 2
          const y = (q[1] + q[3]) / 2
          return x >= at[0] - 1 && x <= at[2] + 1 && y >= at[1] - 1 && y <= at[3] + 1
        })) l.block = home
      })
    }
  }
  blocks.clear()
  lines.forEach((l, i) => l.block && (blocks.get(l.block) ?? blocks.set(l.block, []).get(l.block)).push(i))
  const all = [...blocks.entries()].map(([b, idx]) => ({ b, idx, own: idx.every((i) => lines[i].own), g: geo(idx) }))
  for (const o of all.filter((x) => x.own && x.g.rows === 1)) {
    const lead = 1.25 * o.g.size
    const home = all
      .filter((x) => !x.own && Math.abs(x.g.dir[0] - o.g.dir[0]) < 0.01 && Math.abs(x.g.dir[1] - o.g.dir[1]) < 0.01 && Math.abs(x.g.size - o.g.size) <= 0.06 * o.g.size)
      .filter((x) => o.g.top > x.g.top - 1.2 * lead && o.g.top < x.g.bottom + 1.2 * lead && o.g.x0 > x.g.x0 - 2 && o.g.x0 < x.g.x1 && o.g.x1 > x.g.x0)
      .sort((p, q) => Math.abs(o.g.top - (p.g.top + p.g.bottom) / 2) - Math.abs(o.g.top - (q.g.top + q.g.bottom) / 2))[0]
    if (home) for (const i of o.idx) lines[i].block = home.b
  }
  return lines
}

const ALIGN = { start: ['left', 'right'], end: ['right', 'left'], centre: ['centre', 'centre'], justify: ['justify', 'justify'] }
function publicParagraph(P, g) {
  const quads = g.lineIdx.flatMap((li) => P.lines[li].chars.filter((c) => c.c.trim()).map((c) => qbox(c.quad)))
  return {
    id: `p${P.idx + 1}-g${g.k}`,
    runIds: g.lineIdx.map((li) => P.runs[li].id),
    bbox: toView(unionBox(quads), P.bounds),
    text: g.text,
    align: ALIGN[g.align][g.frame.rtl ? 1 : 0],
    dir: g.frame.rtl ? 'rtl' : 'ltr',
    editable: g.editable,
    why: g.why,
    lines: g.rows.length,
    fontSize: r2(g.size),
  }
}

// Form field values and comments: shown so the UI can say why they are not
// edited here (Forms tool, comment tools).
function fieldRuns(P) {
  const out = []
  const b = P.bounds
  const base = { baseline: null, origin: null, dir: [1, 0], fontName: '', fontSize: 0, color: [0, 0, 0], bold: false, italic: false, editable: false, words: [] }
  try {
    P.page.getWidgets().forEach((w, k) => {
      let text = ''
      try {
        text = String(w.getValue?.() ?? '')
      } catch {
        /* no value */
      }
      if (!text.trim()) return
      out.push({ ...base, id: `p${P.idx + 1}-f${k}`, text, bbox: toView(w.getBounds(), b), script: scriptOf(text), why: 'form-field' })
    })
  } catch {
    /* no widgets */
  }
  try {
    P.page.getAnnotations().forEach((a, k) => {
      if (a.getType() !== 'FreeText') return
      const text = String(a.getContents?.() ?? '')
      if (!text.trim()) return
      out.push({ ...base, id: `p${P.idx + 1}-c${k}`, text, bbox: toView(a.getBounds(), b), script: scriptOf(text), why: 'comment' })
    })
  } catch {
    /* no annotations */
  }
  return out
}

function pageBoxes(P) {
  const read = (k) => {
    const v = P.obj.getInheritable(k)
    return v.isArray() ? [0, 1, 2, 3].map((i) => v.get(i).asNumber()) : null
  }
  const n = (r) => r && [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])]
  const media = n(read('MediaBox')) ?? [0, 0, 612, 792]
  const crop = n(read('CropBox'))
  let box = media
  if (crop) {
    const c = [Math.max(crop[0], media[0]), Math.max(crop[1], media[1]), Math.min(crop[2], media[2]), Math.min(crop[3], media[3])]
    if (c[2] > c[0] && c[3] > c[1]) box = c
  }
  const rot = P.obj.getInheritable('Rotate')
  const r = rot.isNumber() ? rot.asNumber() : 0
  return { box: box.map(r2), rotate: r % 90 ? 0 : ((r % 360) + 360) % 360 }
}

// ---------- signatures ----------
function inheritable(obj, key) {
  for (let o = obj, n = 0; o && o.isDictionary() && n < 32; o = o.get('Parent'), n++) {
    const v = o.get(key)
    if (!v.isNull()) return v
  }
  return null
}

// Signed signature fields (indirect numbers of the field dicts).
function signedFields(doc) {
  const out = new Set()
  const af = doc.getTrailer().get('Root').get('AcroForm')
  if (!af.isDictionary()) return out
  const walk = (arr, depth) => {
    if (!arr.isArray() || depth > 32) return
    for (let i = 0; i < arr.length; i++) {
      const f = arr.get(i)
      if (!f.isDictionary()) continue
      const ft = inheritable(f, 'FT')
      if (ft && ft.toString() === '/Sig' && !f.get('V').isNull() && f.isIndirect()) out.add(f.asIndirect())
      walk(f.get('Kids'), depth + 1)
    }
  }
  walk(af.get('Fields'), 0)
  return out
}

// Any content change breaks a signature: drop the signed fields and their
// widgets (and the DocMDP permissions that point at them).
function dropSignatures(doc) {
  const sigs = signedFields(doc)
  if (!sigs.size) return false
  const hit = (o) => o.isIndirect() && sigs.has(o.asIndirect())
  const prune = (arr) => {
    if (!arr.isArray()) return
    for (let i = arr.length - 1; i >= 0; i--) {
      const o = arr.get(i)
      if (hit(o) || (o.isDictionary() && hit(o.get('Parent')))) arr.delete(i)
      else if (o.isDictionary()) prune(o.get('Kids'))
    }
  }
  for (let i = 0; i < doc.countPages(); i++) prune(doc.findPage(i).get('Annots'))
  const root = doc.getTrailer().get('Root')
  const af = root.get('AcroForm')
  prune(af.get('Fields'))
  af.delete('SigFlags')
  if (!root.get('Perms').isNull()) root.delete('Perms')
  return true
}

// ---------- which characters a font already draws ----------
// Cache per file (several model reads and edits hit the same bytes in the
// worker): font name -> chars drawn with it, filled lazily page by page.
const usageCache = new Map()
function fingerprint(b) {
  let h1 = 2166136261 ^ b.length
  let h2 = 0x9e3779b9
  for (let i = 0; i < b.length; i++) {
    h1 = Math.imul(h1 ^ b[i], 16777619)
    h2 = (Math.imul(h2 ^ b[i], 0x01000193) + i) | 0
  }
  return `${b.length}:${h1 >>> 0}:${h2 >>> 0}`
}
function usageFor(bytes) {
  const key = fingerprint(bytes)
  if (!usageCache.has(key)) {
    if (usageCache.size >= 4) usageCache.delete(usageCache.keys().next().value)
    usageCache.set(key, { done: new Set(), byFont: new Map() })
  }
  return usageCache.get(key)
}
function addUsage(usage, idx, lines) {
  if (usage.done.has(idx)) return
  usage.done.add(idx)
  for (const l of lines) {
    for (const c of l.chars) {
      if (!usage.byFont.has(c.font)) usage.byFont.set(c.font, new Set())
      usage.byFont.get(c.font).add(c.c)
    }
  }
}
// True when every char of `need` is drawn with `font` somewhere in the first
// 40 pages. Scans lazily and stops as soon as all are found (by page count,
// not time, so the answer does not depend on machine load).
function proveUse(doc, usage, font, need) {
  const missing = () => need.filter((c) => !usage.byFont.get(font)?.has(c))
  if (!missing().length) return true
  const n = Math.min(doc.countPages(), 40)
  for (let i = 0; i < n && missing().length; i++) {
    if (usage.done.has(i)) continue
    const p = doc.loadPage(i)
    try {
      addUsage(usage, i, readLines(p))
    } finally {
      p.destroy?.()
    }
  }
  return !missing().length
}

// ---------- drawing ----------
// Same font: the first dict with this name that can encode the text, with
// the char spacing the original word implies. exact: one TJ that puts every
// glyph at its original origin (moved text keeps its kerning).
// A ToUnicode map can give one letter to two codes (us-budget maps an "E"
// glyph code to "e" too), and the first one is not always the glyph the
// file draws for it. Where the page shows which glyph a font draws for a
// letter, use that glyph's code. Once per font dict per page read.
function drawnCodes(mupdf, P, info, name) {
  if (info.drawnFixed || !info.ok || !P.F) return
  info.drawnFixed = true
  const simple = info.sub !== '/Type0'
  if (!simple && !info.byGid) return
  const map = simple ? codeMap(mupdf, scratchOf(P), info) : null
  const votes = new Map()
  for (const l of P.lines) {
    for (const c of l.chars) {
      if (c.font !== name || [...c.c].length !== 1 || !c.c.trim()) continue
      const gs = P.F.gidsAt(c)
      if (gs.length !== 1) continue
      const code = simple ? codeFor(info, map, gs[0].gid, c.c) : gs[0].gid
      if (code == null || !info.widths.get(code)) continue
      const v = votes.get(c.c) ?? votes.set(c.c, new Map()).get(c.c)
      v.set(code, (v.get(code) ?? 0) + 1)
    }
  }
  for (const [u, v] of votes) info.rev.set(u, [...v].sort((a, b) => b[1] - a[1])[0][0])
}

// spacing accents (TeX draws "¨" then a dotless "ı") and combining marks
const ACCENT = /^[\u00a8\u00b4`\u02c6-\u02dd\u00b8\u00af\p{M}]$/u

function sameFont(mupdf, P, chars, text, dir, { exact = false } = {}) {
  const sz = chars[0].size
  const orig = textOf(chars)
  const oneFont = chars.every((c) => c.font === chars[0].font)
  const infos = fontDicts(mupdf, P, chars[0].font)
  if (infos.length === 1) drawnCodes(mupdf, P, infos[0], chars[0].font)
  for (const info of infos) {
    if (!info.ok) continue
    const codes = encode(info, text)
    if (!codes || !codes.every((c) => info.widths.has(c.code) || info.dw)) continue
    let tc = 0
    const oc = oneFont ? encode(info, orig) : null
    if (oc && oc.length === chars.length && chars.length > 1) {
      const n = chars.length
      const measured = dot(chars[n - 1].origin, dir) - dot(chars[0].origin, dir)
      const natural = (oc.slice(0, -1).reduce((s, c) => s + widthOf(info, c.code), 0) * sz) / 1000
      tc = (measured - natural) / (n - 1)
      if (Math.abs(tc) < 0.02) tc = 0
    }
    let tj = null
    if (exact) {
      if (codes.length !== chars.length) continue
      // a ligature glyph read as two chars: the second sits inside the first,
      // and drawing both at their origins overprints
      // (an accent placed over the next letter is not a ligature: keep it)
      if (codes.slice(0, -1).some((c, i) => !ACCENT.test(chars[i].c) && !ACCENT.test(chars[i + 1].c) && dot(chars[i + 1].origin, dir) - dot(chars[i].origin, dir) < 0.5 * ((widthOf(info, c.code) * sz) / 1000))) continue
      tj = codes
        .map((c, i) => {
          const hx = `<${hexOf(info, [c])}>`
          if (i === codes.length - 1) return hx
          const actual = dot(chars[i + 1].origin, dir) - dot(chars[i].origin, dir)
          const adj = -((actual - (widthOf(info, c.code) * sz) / 1000) * 1000) / sz
          return Math.abs(adj) < 0.5 ? hx : `${hx} ${adj.toFixed(1)}`
        })
        .join(' ')
      tc = 0
    }
    const pos = []
    let x = 0
    for (const c of codes) {
      const w = (widthOf(info, c.code) * sz) / 1000
      pos.push([x, w, c.u])
      x += w + tc
    }
    return { kind: 'same', ref: info.ref, info, codes, tc, tj, adv: x, pos, name: stripPrefix(info.base) }
  }
  return null
}

// Fallback: lay the text out in a tiny pdf-lib file with fonts.js, graft
// that page into this document as a form XObject (origin on the baseline).
// Throws UNSUPPORTED_CHAR when no bundled font has a character.
async function fallbackForm(mupdf, doc, text, standard, size) {
  const [{ PDFDocument }, fonts] = await Promise.all([import('pdf-lib'), import('./fonts.js')])
  const tmp = await PDFDocument.create()
  const runs = await fonts.layoutText(tmp, text, { standard })
  const adv = fonts.runsWidth(runs, size)
  const pg = tmp.addPage([adv + 4 * size, 4 * size])
  fonts.drawRuns(pg, runs, { x: 0, y: 0, size })
  const src = mupdf.Document.openDocument(await tmp.save({ useObjectStreams: false }), 'application/pdf').asPDF()
  try {
    const sp = src.findPage(0)
    const contents = sp.get('Contents')
    const list = contents.isArray() ? Array.from({ length: contents.length }, (_, i) => contents.get(i)) : [contents]
    let content = list.map((s) => new TextDecoder('latin1').decode(takeBytes(s.readStream()))).join('\n')
    // the colour is set around the form, where the original colour space is known
    content = content.replace(/^(?:-?[\d.]+\s+){1,4}(?:rg|g|k)\s*$/gm, '')
    // ActualText makes shaped scripts (Devanagari) extract in logical order.
    // Not for right-to-left text: MuPDF and pdf.js already read those glyphs
    // back in logical order, and MuPDF reverses an ActualText over them.
    if (COMPLEX.test(text) && !RTL.test(text)) content = `/Span <</ActualText <${utf16Hex(text)}>>> BDC\n${content}\nEMC\n`
    const dict = doc.newDictionary()
    dict.put('Type', doc.newName('XObject'))
    dict.put('Subtype', doc.newName('Form'))
    const bbox = doc.newArray()
    for (const v of [-2 * size, -2 * size, adv + 2 * size, 3 * size]) bbox.push(v)
    dict.put('BBox', bbox)
    dict.put('Resources', doc.graftObject(sp.get('Resources')))
    const form = doc.addStream(content, dict)
    return { kind: 'form', form, adv, name: [...new Set(runs.map((r) => r.font.name))].join(' + ') }
  } finally {
    src.destroy?.()
  }
}

// Many fallback texts in one tiny pdf-lib file: pages [{ pieces: [{ text, x,
// standard, size }] }], one form per page (origin on the baseline, pieces at
// x). The caller's tagged span carries the ActualText. -> [{ kind, form, adv, name }]
async function fallbackForms(mupdf, doc, pages) {
  const [{ PDFDocument }, fonts] = await Promise.all([import('pdf-lib'), import('./fonts.js')])
  const tmp = await PDFDocument.create()
  const meta = []
  for (const pg of pages) {
    const laid = []
    let adv = 0
    const names = new Set()
    for (const pc of pg.pieces) {
      const runs = await fonts.layoutText(tmp, pc.text, { standard: pc.standard })
      laid.push([pc, runs])
      adv = Math.max(adv, pc.x + fonts.runsWidth(runs, pc.size))
      for (const r of runs) names.add(r.font.name)
    }
    const H = Math.max(...pg.pieces.map((p) => p.size))
    const page = tmp.addPage([adv + 4 * H, 4 * H])
    for (const [pc, runs] of laid) fonts.drawRuns(page, runs, { x: pc.x, y: 0, size: pc.size })
    meta.push({ adv, H, name: [...names].join(' + ') })
  }
  const src = mupdf.Document.openDocument(await tmp.save({ useObjectStreams: false }), 'application/pdf').asPDF()
  try {
    const map = doc.newGraftMap()
    return meta.map((m, i) => {
      const sp = src.findPage(i)
      const contents = sp.get('Contents')
      const list = contents.isArray() ? Array.from({ length: contents.length }, (_, k) => contents.get(k)) : [contents]
      const content = list
        .map((s) => new TextDecoder('latin1').decode(takeBytes(s.readStream())))
        .join('\n')
        .replace(/^(?:-?[\d.]+\s+){1,4}(?:rg|g|k)\s*$/gm, '')
      const dict = doc.newDictionary()
      dict.put('Type', doc.newName('XObject'))
      dict.put('Subtype', doc.newName('Form'))
      const bbox = doc.newArray()
      for (const v of [-2 * m.H, -2 * m.H, m.adv + 2 * m.H, 3 * m.H]) bbox.push(v)
      dict.put('BBox', bbox)
      dict.put('Resources', map.graftObject(sp.get('Resources')))
      return { kind: 'form', form: doc.addStream(content, dict), adv: m.adv, name: m.name }
    })
  } finally {
    src.destroy?.()
  }
}

// Draws the new text alone on a page of a scratch document and checks each
// glyph left ink (a subset can map a char to an empty or missing glyph and
// text checks would not notice). Fallback text: some ink at all.
// S = { doc }: the scratch document. No shared graft map: a map does not see
// objects added to the source after its first use (our new fallback forms).
function inkOk(mupdf, S, draw, size) {
  const doc = S.doc
  const k = Math.max(3, 24 / size)
  const W = draw.adv + 2 * size
  const H = 2.5 * size
  const res = doc.newDictionary()
  let content
  if (draw.kind === 'same') {
    const fd = doc.newDictionary()
    fd.put('F', S.doc.graftObject(draw.ref))
    res.put('Font', fd)
    content = `BT /F ${f4(size)} Tf ${f4(draw.tc)} Tc 0 g 1 0 0 1 ${f4(size)} ${f4(0.8 * size)} Tm <${hexOf(draw.info, draw.codes)}> Tj ET`
  } else {
    const xo = doc.newDictionary()
    xo.put('X', S.doc.graftObject(draw.form))
    res.put('XObject', xo)
    content = `q 0 g 1 0 0 1 ${f4(size)} ${f4(0.8 * size)} cm /X Do Q`
  }
  doc.insertPage(-1, doc.addPage([0, 0, W, H], 0, res, content))
  const n = doc.countPages() - 1
  const sp = doc.loadPage(n)
  try {
    const pix = sp.toPixmap(mupdf.Matrix.scale(k, k), mupdf.ColorSpace.DeviceGray, false, true)
    const w = pix.getWidth()
    const h = pix.getHeight()
    const px = new Uint8Array(pix.getPixels()) // copy at once: a view on WASM memory
    pix.destroy?.()
    const col = new Uint8Array(w)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[y * w + x] < 160) col[x] = 1
    if (draw.kind !== 'same') return col.some(Boolean)
    for (const [x, gw, u] of draw.pos) {
      if (!u.trim() || gw <= 0) continue
      const x0 = Math.floor((size + x + 0.2 * gw) * k)
      const x1 = Math.ceil((size + x + 0.8 * gw) * k)
      let ink = false
      for (let c = Math.max(0, x0); c <= Math.min(w - 1, x1) && !ink; c++) ink = !!col[c]
      if (!ink) return false
    }
    return true
  } finally {
    sp.destroy?.()
    doc.deletePage(n)
  }
}

// Rows drawn by drawRows on a scratch page read back as the words they
// hold, in order. rows: [[item]] (item.actual or .text, .glue). The scratch
// page takes the page's own boxes and rotation (MuPDF places spaces by
// position: another box read a space the real page did not). Any error: false.
function spillReadsBack(mupdf, S, P, drawRows, rows) {
  const doc = S.doc
  let n = -1
  try {
    const res = doc.newDictionary()
    const fd = doc.newDictionary()
    const xd = doc.newDictionary()
    const named = (dict, prefix) => {
      const seen = new Map()
      return (obj) => {
        const k = obj.isIndirect() ? obj.asIndirect() : obj
        if (!seen.has(k)) {
          const name = `${prefix}${seen.size}`
          dict.put(name, doc.graftObject(obj))
          seen.set(k, name)
        }
        return seen.get(k)
      }
    }
    const font = named(fd, 'F')
    const form = named(xd, 'X')
    const { content } = drawRows(font, (f) => form(f.form))
    res.put('Font', fd)
    res.put('XObject', xd)
    const pg = doc.addPage([0, 0, 612, 792], 0, res, content)
    for (const k of ['MediaBox', 'CropBox', 'Rotate']) {
      const v = P.obj.getInheritable(k)
      if (!v.isNull()) pg.put(k, doc.graftObject(v))
    }
    doc.insertPage(-1, pg)
    n = doc.countPages() - 1
    const sp = doc.loadPage(n)
    const st = sp.toStructuredText('preserve-whitespace')
    const got = st.asText()
    st.destroy?.()
    sp.destroy?.()
    const want = rows.map((its) => its.map((it, k) => (k > 0 && it.glue ? '' : ' ') + (it.actual ?? it.text)).join('')).join(' ')
    const words = (s) => s.normalize('NFKC').split(/\s+/).filter(Boolean)
    const a = words(got)
    const b = words(want)
    return a.length === b.length && a.every((w, i) => w === b[i])
  } catch {
    return false
  } finally {
    if (n >= 0) doc.deletePage(n)
  }
}

function freeName(dict, prefix) {
  for (let i = 1; ; i++) if (dict.get(`${prefix}${i}`).isNull()) return `${prefix}${i}`
}

// The page's own resource dict (inherited ones are copied down) and a sub-dict.
function ownResources(doc, pobj) {
  let res = pobj.get('Resources')
  if (!res.isDictionary()) {
    const inh = pobj.getInheritable('Resources')
    res = doc.newDictionary()
    if (inh.isDictionary()) inh.forEach((v, k) => res.put(k, v))
    pobj.put('Resources', res)
  }
  return res
}
function subDict(doc, res, key) {
  let d = res.get(key)
  if (!d.isDictionary()) {
    d = doc.newDictionary()
    res.put(key, d)
  }
  return d
}

// ---------- content streams (tokenizer as in redactOps.js) ----------
const WS = new Set([0, 9, 10, 12, 13, 32])
const DELIMS = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37])
const latin1 = (b, s, e) => {
  let out = ''
  for (let i = s; i < e; i++) out += String.fromCharCode(b[i])
  return out
}
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/

function* lex(b) {
  const n = b.length
  let i = 0
  while (i < n) {
    const c = b[i]
    const s = i
    if (WS.has(c)) {
      i++
    } else if (c === 37) {
      while (i < n && b[i] !== 10 && b[i] !== 13) i++
    } else if (c === 47) {
      i++
      while (i < n && !WS.has(b[i]) && !DELIMS.has(b[i])) i++
      yield { type: 'name', value: latin1(b, s + 1, i).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), start: s, end: i }
    } else if (c === 40) {
      let depth = 1
      i++
      while (i < n && depth) {
        if (b[i] === 92) i++
        else if (b[i] === 40) depth++
        else if (b[i] === 41) depth--
        i++
      }
      yield { type: 'str', start: s, end: i }
    } else if (c === 60 && b[i + 1] === 60) {
      i += 2
      yield { type: '<<', start: s, end: i }
    } else if (c === 60) {
      while (i < n && b[i] !== 62) i++
      i++
      yield { type: 'hex', start: s, end: i }
    } else if (c === 62 && b[i + 1] === 62) {
      i += 2
      yield { type: '>>', start: s, end: i }
    } else if (c === 91 || c === 93) {
      i++
      yield { type: c === 91 ? '[' : ']', start: s, end: i }
    } else if (DELIMS.has(c)) {
      i++
    } else {
      while (i < n && !WS.has(b[i]) && !DELIMS.has(b[i])) i++
      const word = latin1(b, s, i)
      if (NUMBER.test(word)) {
        yield { type: 'num', value: +word, start: s, end: i }
        continue
      }
      yield { type: 'kw', value: word, start: s, end: i }
      if (word !== 'ID') continue
      const from = ++i
      let j = from
      while (j < n && !(b[j] === 69 && b[j + 1] === 73 && WS.has(b[j - 1]) && (j + 2 >= n || WS.has(b[j + 2]) || DELIMS.has(b[j + 2])))) j++
      yield { type: 'data', start: from, end: j }
      yield { type: 'kw', value: 'EI', start: j, end: Math.min(n, j + 2) }
      i = j + 2
    }
  }
}

// Operators with their operands and byte range; arrays and dicts come as { type, items }.
function* contentOps(b) {
  let operands = []
  let start = -1
  const open = []
  const push = (x) => (open.length ? open[open.length - 1].items.push(x) : operands.push(x))
  for (const t of lex(b)) {
    if (start < 0) start = t.start
    if (t.type === '[' || t.type === '<<') open.push({ type: t.type === '[' ? 'array' : 'dict', items: [], start: t.start })
    else if (t.type === ']' || t.type === '>>') {
      const c = open.pop()
      if (c) push({ ...c, end: t.end })
    } else if (t.type === 'kw' && !open.length && !['true', 'false', 'null'].includes(t.value)) {
      yield { op: t.value, operands, start, end: t.end }
      operands = []
      start = -1
    } else push(t)
  }
}

const ESC = { n: 10, r: 13, t: 9, b: 8, f: 12 }
// Text of a string token: literal or hex, UTF-16BE with BOM or PDFDocEncoding (as Latin-1).
function strValue(b, t) {
  const bytes = []
  if (t.type === 'hex') {
    const h = latin1(b, t.start + 1, t.end - 1).replace(/[^0-9a-fA-F]/g, '')
    for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.slice(i, i + 2).padEnd(2, '0'), 16))
  } else {
    for (let i = t.start + 1; i < t.end - 1; i++) {
      const c = b[i]
      if (c !== 92) {
        bytes.push(c)
        continue
      }
      const e = b[++i]
      if (e >= 48 && e <= 55) {
        let v = e - 48
        for (let k = 0; k < 2 && b[i + 1] >= 48 && b[i + 1] <= 55; k++) v = v * 8 + (b[++i] - 48)
        bytes.push(v & 255)
      } else if (e === 10 || e === 13) {
        if (e === 13 && b[i + 1] === 10) i++
      } else bytes.push(ESC[String.fromCharCode(e)] ?? e)
    }
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = ''
    for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1])
    return s
  }
  return String.fromCharCode(...bytes)
}

const asList = (obj) => (obj.isArray() ? Array.from({ length: obj.length }, (_, k) => obj.get(k)) : obj.isNull() ? [] : [obj])
const squashS = (s) => String(s).replace(/\s+/g, '')

// Marked content can carry the text itself (ActualText) or a description of
// it (Alt, E). After a redaction, cut those entries from spans that now show
// nothing (their glyphs were removed) or that still name an edited word.
const MC_TEXT = new Set(['ActualText', 'Alt', 'E'])
const SHOWS = new Set(['Tj', 'TJ', "'", '"', 'Do'])
// Does a string still name removed text? Words of 4+ letters match inside
// it (ActualText can hold pieces of words); shorter ones (an initial, "of")
// only as whole words of a short string, so common words elsewhere stay.
function namesOld(v, olds) {
  const toks = new Set(String(v).split(/[\s\p{P}]+/u).filter(Boolean))
  return olds.some((w) => {
    const t = String(w).replace(/^\p{P}+|\p{P}+$/gu, '')
    return t.length >= 4 && toks.has(t)
  })
}

// lost(index): the span with that page-wide index (BDC/BMC in order) lost
// glyphs in this edit. Empty spans are cut too. counter: { n } across streams.
function cleanMarked(b, lost, props, counter = { n: 0 }) {
  const cuts = []
  const stack = []
  for (const o of contentOps(b)) {
    if (o.op === 'BDC' || o.op === 'BMC') stack.push({ o, shows: 0, idx: counter.n++ })
    else if (SHOWS.has(o.op)) stack.forEach((s) => s.shows++)
    else if (o.op === 'EMC') {
      const s = stack.pop()
      if (!s || s.o.op !== 'BDC') continue
      const strip = (v) => (s.shows === 0 && v.trim() !== '') || lost(s.idx)
      const p = s.o.operands[1]
      if (p?.type === 'dict') {
        for (let k = 0; k + 1 < p.items.length; k += 2) {
          const key = p.items[k]
          const v = p.items[k + 1]
          if (key.type === 'name' && MC_TEXT.has(key.value) && (v.type === 'str' || v.type === 'hex') && strip(strValue(b, v))) cuts.push([key.start, v.end])
        }
      } else if (p?.type === 'name' && props?.isDictionary()) {
        const d = props.get(p.value)
        if (d.isDictionary()) {
          for (const k of MC_TEXT) {
            const v = d.get(k)
            if (v.isString() && strip(v.asString())) d.delete(k)
          }
        }
      }
    }
  }
  if (!cuts.length) return null
  cuts.sort((x, y) => x[0] - y[0])
  const parts = []
  let at = 0
  for (const [s, e] of cuts) {
    if (s < at) continue
    parts.push(b.subarray(at, s), new Uint8Array([32]))
    at = e
  }
  parts.push(b.subarray(at))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

// cleanMarked on the page streams and every form XObject they draw.
function cleanPageMarked(pobj, lost) {
  const seen = new Set()
  const counter = { n: 0 }
  // forms are not compared before/after: only their emptied spans go
  const fix = (ref, props, test = lost) => {
    if (!ref.isStream()) return
    const out = cleanMarked(takeBytes(ref.readStream()), test, props, test === lost ? counter : { n: 0 })
    if (out) ref.writeStream(out)
  }
  const walk = (res) => {
    if (!res.isDictionary()) return
    const xo = res.get('XObject')
    if (!xo.isDictionary()) return
    xo.forEach((x) => {
      if (!x.isIndirect() || seen.has(x.asIndirect()) || x.get('Subtype').toString() !== '/Form') return
      seen.add(x.asIndirect())
      const r = x.get('Resources')
      fix(x, r.isDictionary() ? r.get('Properties') : null, () => false)
      walk(r)
    })
  }
  const res = pobj.getInheritable('Resources')
  for (const s of asList(pobj.get('Contents'))) fix(s, res.isDictionary() ? res.get('Properties') : null)
  walk(res)
}

// Per marked-content span of a page (BDC/BMC in order): its MCID and how
// many bytes of glyph codes it shows (nested spans count for each level).
function markedShows(b, props) {
  const out = []
  const stack = []
  const bytesOf = (t) => (t.type === 'str' || t.type === 'hex' ? strValue(b, t).length : t.type === 'array' ? t.items.reduce((n, x) => n + bytesOf(x), 0) : 0)
  for (const o of contentOps(b)) {
    if (o.op === 'BDC' || o.op === 'BMC') {
      let mcid = null
      const p = o.operands[1]
      if (p?.type === 'dict') {
        const k = p.items.findIndex((x) => x.type === 'name' && x.value === 'MCID')
        if (k >= 0 && p.items[k + 1]?.type === 'num') mcid = p.items[k + 1].value
      } else if (p?.type === 'name' && props?.isDictionary()) {
        const d = props.get(p.value)
        if (d.isDictionary() && d.get('MCID').isNumber()) mcid = d.get('MCID').asNumber()
      }
      const e = { mcid, shown: 0 }
      out.push(e)
      stack.push(e)
    } else if (o.op === 'EMC') stack.pop()
    else if (SHOWS.has(o.op) && o.op !== 'Do') {
      const n = o.operands.reduce((m, t) => m + bytesOf(t), 0)
      for (const e of stack) e.shown += n
    }
  }
  return out
}
const joinStreams = (pobj) => {
  const parts = asList(pobj.get('Contents')).filter((r) => r.isStream()).map((r) => takeBytes(r.readStream()))
  const b = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, 0))
  let o = 0
  for (const p of parts) {
    b.set(p, o)
    b[o + p.length] = 10
    o += p.length + 1
  }
  return b
}

// The structure tree can hold the text too (StructElem /ActualText, /Alt,
// /E, /T). Elements of this page whose strings name removed text lose those
// entries. Walks only from the StructTreeRoot, with a node budget (us-budget
// has a large tree); elements on other pages are left alone.
const STRUCT_TEXT = ['ActualText', 'Alt', 'E', 'T']
function cleanStruct(doc, pobj, mcids, olds = null) {
  if (!mcids.size && !olds?.length) return 0
  const root = doc.getTrailer().get('Root').get('StructTreeRoot')
  if (!root.isDictionary()) return 0
  const pageNum = pobj.isIndirect() ? pobj.asIndirect() : null
  const pgOf = (o, inherited) => {
    const p = o.isDictionary() ? o.get('Pg') : null
    return p && p.isIndirect() ? p.asIndirect() : inherited
  }
  const seen = new Set()
  let budget = 200000
  let cut = 0
  const stack = [[root.get('K'), null]]
  while (stack.length && budget-- > 0) {
    const [node, pg] = stack.pop()
    if (node.isArray()) {
      for (let i = 0; i < node.length; i++) stack.push([node.get(i), pg])
      continue
    }
    if (!node.isDictionary()) continue
    if (node.isIndirect()) {
      const n = node.asIndirect()
      if (seen.has(n)) continue
      seen.add(n)
    }
    const type = node.get('Type').toString()
    if (type === '/MCR' || type === '/OBJR') continue
    const page = pgOf(node, pg)
    // its own marked content on this page: MCID numbers, or MCRs (with their /Pg)
    const k = node.get('K')
    const kids = k.isArray() ? Array.from({ length: k.length }, (_, i) => k.get(i)) : [k]
    const mine = kids.some((x) => (x.isNumber() ? page === pageNum && mcids.has(x.asNumber()) : x.isDictionary() && x.get('Type').toString() === '/MCR' && pgOf(x, page) === pageNum && x.get('MCID').isNumber() && mcids.has(x.get('MCID').asNumber())))
    // spans that could not be compared: whole removed words, this page only
    const named = (v) => olds && page === pageNum && namesOld(v, olds)
    for (const key of STRUCT_TEXT) {
      const v = node.get(key)
      if (v.isString() && (mine || named(v.asString()))) {
        node.delete(key)
        cut++
      }
    }
    stack.push([k, page])
  }
  return cut
}

// Our own earlier draws: /Span <</SPDFBox [x0 y0 x1 y1] ...>> BDC ... EMC in
// the page streams (box in MuPDF page space), with the resources they use.
// key 'SPDFRun' finds the rest-of-line runs a line edit moved (not cut whole).
function ownSpans(pobj, key = 'SPDFBox') {
  const out = []
  for (const ref of asList(pobj.get('Contents'))) {
    if (!ref.isStream()) continue
    const b = takeBytes(ref.readStream())
    const stack = []
    for (const o of contentOps(b)) {
      if (o.op === 'BDC' || o.op === 'BMC') stack.push({ o, names: [] })
      else if (o.op === 'Tf' && o.operands[0]?.type === 'name') stack.forEach((s) => s.names.push(['Font', o.operands[0].value]))
      else if (o.op === 'Do' && o.operands[0]?.type === 'name') stack.forEach((s) => s.names.push(['XObject', o.operands[0].value]))
      else if (o.op === 'gs' && o.operands[0]?.type === 'name') stack.forEach((s) => s.names.push(['ExtGState', o.operands[0].value]))
      else if (o.op === 'EMC') {
        const s = stack.pop()
        const p = s?.o.operands[1]
        if (p?.type !== 'dict') continue
        const k = p.items.findIndex((x) => x.type === 'name' && x.value === key)
        const arr = k >= 0 ? p.items[k + 1] : null
        const pk = p.items.findIndex((x) => x.type === 'name' && x.value === 'SPDFPara')
        const para = pk >= 0 && p.items[pk + 1]?.type === 'array' ? p.items[pk + 1].items.map((x) => x.value) : null
        if (arr?.type === 'array' && arr.items.length === 4) out.push({ ref, start: s.o.start, end: o.end, box: arr.items.map((x) => x.value), names: s.names, para })
      }
    }
  }
  return out
}

// Cuts our spans out of the page streams and drops the resources only they used.
function cutOwn(doc, pobj, spans) {
  const byRef = new Map()
  for (const s of spans) (byRef.get(s.ref) ?? byRef.set(s.ref, []).get(s.ref)).push(s)
  for (const [ref, list] of byRef) {
    let b = takeBytes(ref.readStream())
    for (const s of list.sort((x, y) => y.start - x.start)) b = new Uint8Array([...b.subarray(0, s.start), 32, ...b.subarray(s.end)])
    ref.writeStream(b)
  }
  // what earlier edits left empty: run tags whose glyphs a later redaction
  // removed, placement wrappers whose draw was cut (see placeContent)
  const W = String.raw`q\s+(?:-?[\d.]+\s+){6}cm\s+0\s+Tc\s+0\s+Tw\s+100\s+Tz\s+0\s+TL\s+0\s+Ts\s+0\s+Tr\s+Q\s`
  const EMPTY = [new RegExp(String.raw`/Span\s*<<\s*/SPDFRun\s*\[[^\]]*\]\s*>>\s*BDC\s+(?:BT\s+ET\s+)?EMC`, 'g'), new RegExp(String.raw`ET\s+${W}BT\s+(?:-?[\d.]+\s+){6}Tm\s`, 'g'), new RegExp(W, 'g')]
  for (const ref of asList(pobj.get('Contents'))) {
    if (!ref.isStream()) continue
    const raw = takeBytes(ref.readStream())
    const txt = latin1(raw, 0, raw.length)
    // a run span whose text a later redaction removed shows nothing any more
    const runs = txt.replace(/\/Span\s*<<\s*\/SPDFRun\s*\[[^\]]*\]\s*>>\s*BDC([\s\S]*?)EMC/g, (m, inner) => (/T[jJ]|Do|['"]\s/.test(inner) ? m : ' '))
    const clean = EMPTY.reduce((t, re) => t.replace(re, ' '), runs)
    if (clean !== txt) ref.writeStream(Uint8Array.from(clean, (c) => c.charCodeAt(0)))
  }
  const used = new Set()
  for (const ref of asList(pobj.get('Contents'))) {
    if (!ref.isStream()) continue
    for (const o of contentOps(takeBytes(ref.readStream()))) {
      if ((o.op === 'Tf' || o.op === 'Do' || o.op === 'gs') && o.operands[0]?.type === 'name') used.add(o.operands[0].value)
    }
  }
  const res = pobj.getInheritable('Resources')
  if (!res.isDictionary()) return
  for (const s of spans) {
    for (const [cat, name] of s.names) {
      const d = res.get(cat)
      if (!used.has(name) && /^SPDFEdit/.test(name) && d.isDictionary()) d.delete(name)
    }
  }
}

// mupdf.js 1.28 hands images and shadings to device callbacks without a
// reference and frees them when collected: unhook that (see redactOps.js).
function borrowed(mupdf, obj) {
  for (const cls of [mupdf.Image, mupdf.Shade]) if (obj instanceof cls) cls._finalizer?.unregister(obj)
}
const release = (...objs) => objs.forEach((o) => o?.destroy?.())

// Draw order facts of a page: per glyph origin { seq, alpha, mode, clip },
// and what is painted (paths, images, shadings) with its order. Alpha counts
// transparency groups; paint under alpha 0.5 (a faint seal) does not hide
// text and is left out, as is what a soft mask draws.
// region: only text objects that touch it get their glyphs walked (cost).
function paintFacts(mupdf, page, region = null) {
  const glyphs = new Map()
  // glyph ids by origin key, in drawing order (several glyphs can share one)
  const gids = new Map()
  const paints = []
  const clips = []
  let seq = 0
  const key = (p) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`
  const clipNow = () => clips.reduce((acc, c) => (!c ? acc : !acc ? c : [Math.max(acc[0], c[0]), Math.max(acc[1], c[1]), Math.min(acc[2], c[2]), Math.min(acc[3], c[3])]), null)
  const mark = (text, ctm, mode, alpha) => {
    seq++
    const clip = clipNow()
    if (region && !overlaps(text.getBounds(null, ctm), region)) return
    try {
      text.walk({
        showGlyph(font, trm, gid) {
          font.constructor._finalizer?.unregister(font)
          const p = apply(ctm, [trm[4], trm[5]])
          const k = key(p)
          if (mode === 'fill') (gids.get(k) ?? gids.set(k, []).get(k)).push({ gid, p })
          const g = glyphs.get(k)
          // two glyphs of one text object on one origin (an accent) are not a second mode
          glyphs.set(k, g && g.seq === seq ? (g.mode.split('+').includes(mode) ? g : { ...g, mode: `${g.mode}+${mode}` }) : { seq, alpha, mode, clip })
        },
      })
    } catch {
      /* no glyphs */
    }
  }
  const imgBox = (m) => {
    const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map((p) => apply(m, p))
    return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]
  }
  const bounds = page.getBounds()
  const groups = []
  let masking = 0
  const ga = (alpha) => groups.reduce((x, g) => x * g, alpha ?? 1)
  // white: a white fill (gray 1, RGB 1 1 1, CMYK 0 0 0 0), unseen on a white
  // page (report-style invoices put one under each field)
  const paint = (box, alpha, white = false) => {
    seq++
    if (!masking && ga(alpha) >= 0.5) paints.push(white ? { seq, box, white } : { seq, box })
  }
  const isWhite = (cs, color) => {
    // a spot colour at tint 1 is full ink: only device colour spaces count
    if (!(cs?.isGray?.() || cs?.isRGB?.() || cs?.isCMYK?.())) return false
    const c = Array.from(color ?? [])
    return c.length === 4 ? c.every((v) => v <= 0.02) : (c.length === 1 || c.length === 3) && c.every((v) => v >= 0.98)
  }
  const dev = new mupdf.Device({
    fillText(text, ctm, cs, color, alpha) {
      if (!masking) mark(text, ctm, 'fill', ga(alpha))
      release(text, cs)
    },
    strokeText(text, stroke, ctm, cs, color, alpha) {
      if (!masking) {
        seq--
        mark(text, ctm, 'stroke', ga(alpha))
      }
      release(text, stroke, cs)
    },
    clipText(text, ctm) {
      if (!masking) mark(text, ctm, 'clip', 1)
      clips.push(text.getBounds(null, ctm))
      release(text)
    },
    clipStrokeText(text, stroke, ctm) {
      if (!masking) mark(text, ctm, 'clip', 1)
      clips.push(text.getBounds(stroke, ctm))
      release(text, stroke)
    },
    ignoreText(text) {
      release(text)
    },
    fillPath(path, evenOdd, ctm, cs, color, alpha) {
      paint(path.getBounds(null, ctm), alpha, isWhite(cs, color))
      release(path, cs)
    },
    strokePath(path, stroke, ctm, cs, color, alpha) {
      paint(path.getBounds(stroke, ctm), alpha)
      release(path, stroke, cs)
    },
    clipPath(path, evenOdd, ctm) {
      clips.push(path.getBounds(null, ctm))
      release(path)
    },
    clipStrokePath(path, stroke, ctm) {
      clips.push(path.getBounds(stroke, ctm))
      release(path, stroke)
    },
    fillShade(shade, ctm, alpha) {
      borrowed(mupdf, shade)
      paint(bounds, alpha)
    },
    fillImage(image, ctm, alpha) {
      borrowed(mupdf, image)
      paint(imgBox(ctm), alpha)
    },
    fillImageMask(image, ctm, cs, color, alpha) {
      borrowed(mupdf, image)
      paint(imgBox(ctm), alpha)
      release(cs)
    },
    clipImageMask(image, ctm) {
      borrowed(mupdf, image)
      clips.push(imgBox(ctm))
    },
    popClip() {
      clips.pop()
    },
    // a soft mask: what it draws is not painted; it then acts as a clip
    beginMask(area, luminosity, cs) {
      masking++
      release(cs)
    },
    endMask() {
      masking--
      clips.push(null)
    },
    beginGroup(area, cs, isolated, knockout, blendmode, alpha) {
      groups.push(alpha)
      release(cs)
    },
    endGroup() {
      groups.pop()
    },
  })
  try {
    page.runPageContents(dev, mupdf.Matrix.identity)
  } finally {
    dev.close()
    dev.destroy?.()
  }
  // annotations are not counted: they render above all page content, the
  // new text included, so moving text under one reveals nothing
  return { glyph: (c) => glyphs.get(key(c.origin)) ?? null, gidsAt: (c) => gids.get(key(c.origin)) ?? [], paints }
}

// Digits and spaces inside a right-to-left line, in page order (exact).
function visualExact(mupdf, P, chars, dir) {
  const v = chars.slice().sort((a, b) => dot(a.origin, dir) - dot(b.origin, dir))
  const d = sameFont(mupdf, P, v, textOf(v), dir, { exact: true })
  return d && { ...d, origin: v[0].origin }
}

// Glyph id -> code of a simple font, found by drawing codes 0..255 once on a
// scratch page and reading back the glyph each one shows (a built-in
// encoding, TeX CMSY "∗", has no other way back from glyph to code).
function codeMap(mupdf, S, info) {
  if (info.gidCodes) return info.gidCodes
  const map = new Map()
  info.gidCodes = map
  const doc = S.doc
  const res = doc.newDictionary()
  const fd = doc.newDictionary()
  fd.put('F', doc.graftObject(info.ref))
  res.put('Font', fd)
  // each code at its own height, so a code with no glyph cannot shift the rest
  const shows = Array.from({ length: 256 }, (_, i) => `1 0 0 1 0 ${i * 2} Tm <${i.toString(16).padStart(2, '0')}> Tj`).join(' ')
  doc.insertPage(-1, doc.addPage([0, 0, 10, 600], 0, res, `BT /F 1 Tf ${shows} ET`))
  const n = doc.countPages() - 1
  const sp = doc.loadPage(n)
  const dev = new mupdf.Device({
    fillText(text, ctm) {
      text.walk({
        showGlyph(f, trm, gid) {
          f.constructor._finalizer?.unregister(f)
          // page space is y down: code = (600 - y) / 2
          const code = Math.round((600 - apply(ctm, [trm[4], trm[5]])[1]) / 2)
          if (gid > 0 && code >= 0 && code < 256) (map.get(gid) ?? map.set(gid, []).get(gid)).push(code)
        },
      })
      release(text)
    },
  })
  try {
    sp.runPageContents(dev, mupdf.Matrix.identity)
  } finally {
    dev.close()
    dev.destroy?.()
    sp.destroy?.()
    doc.deletePage(n)
  }
  return map
}

// Of the codes that draw a glyph, the one whose ToUnicode reads as `u`.
function codeFor(info, map, gid, u) {
  const list = map.get(gid)
  if (!list) return null
  const r = info.rev.get(u)
  return list.includes(r) ? r : list[0]
}

// Glyphs drawn again by glyph id at their own origins (one TJ): fonts whose
// codes are glyph ids (re-encoding shaped Arabic through ToUnicode would
// pick the wrong letter forms), or with S, simple fonts through codeMap.
// -> { ref, tj, origin } or null
function gidDraw(mupdf, P, chars, dir, S = null) {
  let info = fontDicts(mupdf, P, chars[0].font).find((i) => i.byGid)
  let codeOf = (gid) => gid
  if (!info && S) {
    info = fontDicts(mupdf, P, chars[0].font).find((i) => i.ok && i.sub !== '/Type0' && i.sub !== '/Type3' && i.widths.size)
    if (info) {
      const m = codeMap(mupdf, S, info)
      codeOf = (gid, u) => codeFor(info, m, gid, u)
    }
  }
  if (!info) return null
  const seen = new Set()
  const list = []
  for (const c of chars) {
    for (const g of P.F.gidsAt(c)) {
      const k = `${g.gid}@${g.p[0].toFixed(2)},${g.p[1].toFixed(2)}`
      if (seen.has(k)) continue
      seen.add(k)
      list.push({ ...g, u: c.c })
    }
  }
  if (!list.length) return null
  const up = [dir[1], -dir[0]]
  const base = dot(list[0].p, up)
  // one baseline only (a raised mark needs its own position)
  if (list.some((g) => Math.abs(dot(g.p, up) - base) > 0.05)) return null
  list.sort((a, b) => dot(a.p, dir) - dot(b.p, dir))
  const codes = list.map((g) => codeOf(g.gid, g.u))
  if (codes.some((c) => c == null)) return null
  const sz = chars[0].size
  const tj = list
    .map((g, i) => {
      const hx = `<${codes[i].toString(16).padStart(info.bytes * 2, '0')}>`
      if (i === list.length - 1) return hx
      const actual = dot(list[i + 1].p, dir) - dot(g.p, dir)
      const adj = -((actual - (widthOf(info, codes[i]) * sz) / 1000) * 1000) / sz
      return Math.abs(adj) < 0.5 ? hx : `${hx} ${adj.toFixed(1)}`
    })
    .join(' ')
  return { ref: info.ref, tj, origin: list[0].p }
}

const overlaps = (a, r) => a[0] < r[2] - 0.01 && a[2] > r[0] + 0.01 && a[1] < r[3] - 0.01 && a[3] > r[1] + 0.01
// The inked middle of a glyph box (its quad is font-box tall).
const core = (c) => {
  const q = qbox(c.quad)
  const dy = (q[3] - q[1]) * 0.2
  const dx = (q[2] - q[0]) * 0.2
  return [q[0] + dx, q[1] + dy, q[2] - dx, q[3] - dy]
}
// Painted after the glyph and over it.
const coveredChar = (F, c, after = F.glyph(c)?.seq ?? 0) => F.paints.some((p) => p.seq > after && overlaps(p.box, core(c)))

// Redaction rects per glyph: a band from just below the baseline to mid
// height, or a thin band (0.25 to 0.35 em) for tight line spacing.
function glyphRects(chars, dir, thin) {
  const [lo, hi] = thin ? [0.25, 0.35] : [-0.05, 0.45]
  return chars.map((c) => {
    const s = c.size
    const o = c.origin
    const q = qbox(c.quad)
    if (Math.abs(dir[0]) >= Math.abs(dir[1])) {
      const up = dir[0] > 0 ? -1 : 1
      const ins = Math.min(0.15, (q[2] - q[0]) * 0.2)
      const y1 = o[1] + up * hi * s
      const y2 = o[1] + up * lo * s
      return [q[0] + ins, Math.min(y1, y2), q[2] - ins, Math.max(y1, y2)]
    }
    const up = dir[1] > 0 ? 1 : -1
    const ins = Math.min(0.15, (q[3] - q[1]) * 0.2)
    const x1 = o[0] + up * hi * s
    const x2 = o[0] + up * lo * s
    return [Math.min(x1, x2), q[1] + ins, Math.max(x1, x2), q[3] - ins]
  })
}

// Inline images (BI ... EI) of a content stream, as byte ranges.
function inlineImages(b) {
  const out = []
  let start = -1
  for (const t of lex(b)) {
    if (t.type !== 'kw') continue
    if (t.value === 'BI') start = t.start
    else if (t.value === 'EI' && start >= 0) {
      out.push([start, t.end])
      start = -1
    }
  }
  return out
}

// MuPDF's redaction filter re-writes inline images and breaks some (an
// abbreviated Indexed colour space /CS [/I /RGB ...] comes out as
// /CS /I true: "unknown colorspace", the image is lost). Text-only
// redaction never changes them, so the original bytes go back, in order.
// False when the counts differ (the caller undoes the edit).
function restoreInline(pobj, before) {
  const orig = before.flatMap((b) => inlineImages(b).map(([s, e]) => b.slice(s, e)))
  const now = asList(pobj.get('Contents'))
    .filter((r) => r.isStream())
    .map((r) => {
      const b = takeBytes(r.readStream())
      return { r, b, segs: inlineImages(b) }
    })
  const total = now.reduce((n, x) => n + x.segs.length, 0)
  if (total !== orig.length) return false
  let k = 0
  for (const x of now) {
    if (!x.segs.length) continue
    const parts = []
    let at = 0
    for (const [s, e] of x.segs) {
      parts.push(x.b.subarray(at, s), orig[k++])
      at = e
    }
    parts.push(x.b.subarray(at))
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let o = 0
    for (const p of parts) {
      out.set(p, o)
      o += p.length
    }
    x.r.writeStream(out)
  }
  return true
}

// Form XObjects (nested) the page draws that hold inline images, by name path
// from the page resources: MuPDF's redaction filter may rewrite a form in
// place or swap in a filtered copy, and the name path finds either.
function snapForms(pobj) {
  const out = []
  const seen = new Set()
  const walk = (res, path) => {
    if (!res.isDictionary()) return
    const xo = res.get('XObject')
    if (!xo.isDictionary()) return
    xo.forEach((x, name) => {
      if (!x.isIndirect() || seen.has(x.asIndirect()) || x.get('Subtype').toString() !== '/Form') return
      seen.add(x.asIndirect())
      const p = [...path, name]
      const bytes = takeBytes(x.readStream())
      if (inlineImages(bytes).length) out.push({ path: p, ref: x, bytes })
      walk(x.get('Resources'), p)
    })
  }
  walk(pageRes(pobj), [])
  return out
}
const pageRes = (pobj) => pobj.getInheritable('Resources')
function formAt(pobj, path) {
  let res = pageRes(pobj)
  let x = null
  for (const name of path) {
    if (!res.isDictionary()) return null
    const xo = res.get('XObject')
    if (!xo.isDictionary()) return null
    x = xo.get(name)
    if (!x.isStream()) return null
    res = x.get('Resources')
  }
  return x
}
// Puts the inline images of those forms back byte for byte. False when a
// form lost or gained one (the caller undoes the edit).
function restoreFormInline(pobj, snap) {
  for (const s of snap) {
    const x = formAt(pobj, s.path)
    if (!x) return false
    const orig = inlineImages(s.bytes).map(([a, b]) => s.bytes.slice(a, b))
    const now = takeBytes(x.readStream())
    const segs = inlineImages(now)
    if (segs.length !== orig.length) return false
    const parts = []
    let at = 0
    segs.forEach(([a, b], k) => {
      parts.push(now.subarray(at, a), orig[k])
      at = b
    })
    parts.push(now.subarray(at))
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let o = 0
    for (const p of parts) {
      out.set(p, o)
      o += p.length
    }
    x.writeStream(out)
  }
  return true
}
function undoForms(snap) {
  for (const s of snap) s.ref.writeStream(s.bytes)
}

// ---------- one page ----------
// decide(t): for a single line edit, called once its fit on the line is known
// (before anything changes); true -> returns { spill: true } untouched
async function editPage(mupdf, doc, P, list, { fit }, usage, scratch, decide = null) {
  addUsage(usage, P.idx, P.lines)
  const own = ownSpans(P.obj)
  const F = P.F
  const inBox = (c, b) => {
    const q = qbox(c.quad)
    const x = (q[0] + q[2]) / 2
    const y = (q[1] + q[3]) / 2
    return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]
  }
  const targets = []
  for (const { e, rep } of list) {
    const run = P.runs.find((r) => r.id === e.runId)
    if (!run) {
      rep.refused = 'not-found'
      continue
    }
    if (run.why) {
      rep.refused = run.why
      continue
    }
    const line = P.lines[run.li]
    let a
    let b
    if (e.wordIndex == null) {
      a = line.chars.findIndex((c) => c.c.trim())
      b = line.chars.length - 1
      while (b > a && !line.chars[b].c.trim()) b--
    } else {
      const w = run.words[e.wordIndex]
      if (!w) {
        rep.refused = 'not-found'
        continue
      }
      ;({ a, b } = w)
    }
    const old = textOf(line.chars.slice(a, b + 1))
    const fold = (x) => String(x).replace(/\s+/g, ' ').trim()
    if (e.old != null && fold(e.old) !== fold(old) && fold(e.old) !== fold(textOf(line.chars))) {
      rep.refused = 'stale'
      continue
    }
    if (line.chars.slice(a, b + 1).some((c) => BAD_CHAR.test(c.c))) {
      rep.refused = 'no-unicode'
      continue
    }
    let text = String(e.text ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .normalize('NFC')
    // a whole line starts where it started (no stray leading space)
    if (e.wordIndex == null) text = text.trim()
    // a word we drew earlier: take our whole earlier draw out instead of
    // redacting inside it, and redraw what it held around the new text
    const mine = own.filter((s) => line.chars.slice(a, b + 1).some((c) => c.c.trim() && inBox(c, s.box)))
    const ownChars = new Set()
    if (mine.length) {
      const idx = line.chars.flatMap((c, i) => (c.c.trim() && mine.some((s) => inBox(c, s.box)) ? [i] : []))
      const na = Math.min(a, ...idx)
      const nb = Math.max(b, ...idx)
      text = textOf(line.chars.slice(na, a)) + text + textOf(line.chars.slice(b + 1, nb + 1))
      ;[a, b] = [na, nb]
      for (const i of idx) ownChars.add(line.chars[i])
    }
    if (targets.some((t) => t.li === run.li && t.a <= b && a <= t.b)) {
      rep.refused = 'conflict'
      continue
    }
    const chars = line.chars.slice(a, b + 1)
    // text something is painted over (a white box, an image) stays as it is
    if (chars.some((c) => c.c.trim() && !ownChars.has(c) && coveredChar(F, c))) {
      rep.refused = 'covered'
      continue
    }
    const g0 = F.glyph(chars.find((c) => c.c.trim()))
    targets.push({ rep, li: run.li, line, a, b, chars, old, text, mine, ownChars, alpha: g0?.alpha ?? 1, dir: line.dir, size: chars.find((c) => c.c.trim()).size })
  }

  // fonts and widths; everything that can fail happens before the redaction
  const plan = async (t, force) => {
    const ch0 = t.chars.find((c) => c.c.trim())
    const along0 = t.chars.filter((c) => c.c.trim()).map((c) => along(c.quad, t.dir))
    t.rtl = RTL.test(t.old) || RTL.test(t.text)
    t.oldMin = Math.min(...along0.map((x) => x[0]))
    t.oldEnd = Math.max(...along0.map((x) => x[1]))
    t.oldStart = t.rtl ? t.oldMin : dot(ch0.origin, t.dir)
    t.ch0 = ch0
    t.draw = null
    t.adv = 0
    if (!t.text.trim()) return
    const complex = COMPLEX.test(t.text) || COMPLEX.test(t.old)
    const orig = t.chars.filter((c) => c.font === ch0.font && !t.ownChars.has(c))
    if (!force && !complex && orig.length) {
      const need = [...new Set([...t.text].filter((c) => c.trim()))]
      if (proveUse(doc, usage, ch0.font, need)) t.draw = sameFont(mupdf, P, orig, t.text, t.dir)
    }
    if (!t.draw) {
      const dict = fontDicts(mupdf, P, ch0.font)[0]
      t.draw = await fallbackForm(mupdf, doc, t.text, standardFor(dict?.base || ch0.font), t.size)
    }
    t.adv = t.draw.adv
  }
  for (const t of targets.slice()) {
    try {
      await plan(t, false)
      if (t.draw && !inkOk(mupdf, scratch(), t.draw, t.size)) {
        const was = t.draw.kind
        await plan(t, true)
        if (was !== 'same' || !inkOk(mupdf, scratch(), t.draw, t.size)) throw Object.assign(new Error('no ink'), { code: 'NO_INK' })
      }
    } catch (err) {
      t.rep.refused = err.code === 'UNSUPPORTED_CHAR' ? 'unsupported-char' : err.code === 'NO_INK' ? 'no-glyph' : 'draw-failed'
      if (err.char) t.rep.char = err.char
      targets.splice(targets.indexOf(t), 1)
    }
  }
  if (!targets.length) return 0

  const single = decide && list.length === 1 && targets.length === 1 ? targets[0] : null
  // per line: push the rest of the line right, or squeeze the new text into
  // the old width when pushing is not safe
  const moved = []
  const lines = new Map()
  for (const t of targets) (lines.get(t.li) ?? lines.set(t.li, []).get(t.li)).push(t)
  for (const group of lines.values()) {
    group.sort((x, y) => x.a - y.a)
    const line = group[0].line
    const dir = line.dir
    const chars = line.chars
    const squeeze = (t) => {
      t.scale = 1
      const oldAdv = t.oldEnd - t.oldStart
      if (t.adv > oldAdv + 0.01 && t.adv > 0) {
        t.scale = oldAdv / t.adv
        t.adv = oldAdv
      }
    }
    for (const t of group) {
      t.scale = 1
      if (fit) squeeze(t)
      t.shift = 0
    }
    const rtl = group.some((t) => t.rtl)
    const vis = chars.filter((c) => c.c.trim())
    const lineStart = Math.min(...vis.map((c) => along(c.quad, dir)[0]))
    const lineEnd = Math.max(...vis.map((c) => along(c.quad, dir)[1]))
    const paraLines = line.block ? P.lines.filter((l) => l.block === line.block) : [line]
    const corners = line.block ? [[line.block[0], line.block[1]], [line.block[2], line.block[1]], [line.block[0], line.block[3]], [line.block[2], line.block[3]]].map((p) => dot(p, dir)) : null
    const b = P.bounds
    const pageSpan = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map((p) => dot(p, dir))
    const pageStart = Math.min(...pageSpan)
    const pageEnd = Math.max(...pageSpan) - PAGE_MARGIN
    // Alignment of the line: centred in its paragraph (or, alone in its
    // block, on the page), right-aligned in its paragraph, else left.
    const mid = (lineStart + lineEnd) / 2
    const multi = corners && paraLines.length >= 2
    const centred = multi ? Math.abs(mid - (Math.min(...corners) + Math.max(...corners)) / 2) < 1.5 && lineStart > Math.min(...corners) + 3 : Math.abs(mid - (pageStart + pageEnd + PAGE_MARGIN) / 2) < 2 && lineStart > pageStart + 36
    const rightAligned = !centred && multi && Math.abs(lineEnd - Math.max(...corners)) < 0.75 && lineStart > Math.min(...corners) + 3
    const firstVis = chars.indexOf(vis[0])
    const lastVis = chars.indexOf(vis[vis.length - 1])
    const whole = group.length === 1 && group[0].a <= firstVis && group[0].b >= lastVis
    let lineMoves = []
    // a right-to-left line pushes the rest of it to the left (mirror of LTR);
    // mixed edits on one line (RTL and LTR words) still stay put
    const allRtl = rtl && group.every((t) => t.rtl)
    const sign = allRtl ? -1 : 1
    let noPush = rtl && !allRtl ? 'rtl' : null
    // a whole line that is centred or right-aligned keeps that alignment
    const anchor = whole && !rtl ? (centred ? 'centre' : rightAligned ? 'right' : null) : null
    if (anchor) noPush = 'aligned'
    // shorter text pulls the rest of a left-aligned (RTL: right-aligned) line
    // back, unless the row goes on in another piece close by (a gap would open)
    const sz0 = group[0].size
    const upv = [dir[1], -dir[0]]
    const bandOf = (cs) => cs.map((c) => along(c.quad, upv))
    const lb = bandOf(vis)
    const lband = [Math.min(...lb.map((x) => x[0])), Math.max(...lb.map((x) => x[1]))]
    const sibling = P.lines.some((l) => l !== line && l.chars.some((c) => {
      if (!c.c.trim()) return false
      const [a, z] = along(c.quad, upv)
      if (Math.min(z, lband[1]) - Math.max(a, lband[0]) < 0.3 * (lband[1] - lband[0])) return false
      const [lo, hi] = along(c.quad, dir)
      return allRtl ? hi <= lineStart + 0.5 && hi > lineStart - 2 * sz0 : lo >= lineEnd - 0.5 && lo < lineEnd + 2 * sz0
    }))
    const pull = !centred && (allRtl || !rightAligned) && !sibling
    let s = 0
    if (!noPush) {
      for (let k = 0; k < group.length; k++) {
        const t = group[k]
        t.shift = s
        s = s + sign * (t.adv - (t.oldEnd - t.oldStart))
        if (!pull) s = sign > 0 ? Math.max(0, s) : Math.min(0, s)
        const to = k + 1 < group.length ? group[k + 1].a - 1 : chars.length - 1
        if (Math.abs(s) <= 0.3) continue
        let g = null
        for (let i = t.b + 1; i <= to; i++) {
          const c = chars[i]
          // a space MuPDF made up from a gap has nothing to move; a real
          // space glyph moves with the text, else it would sit between the
          // words in the wrong place (pulled text runs into it)
          if (!c.c.trim() && !F.glyph(c)) {
            g = null
            continue
          }
          const col = c.color.join()
          if (!g || g.font !== c.font || Math.abs(g.size - c.size) > 0.01 || g.color !== col) {
            g = { font: c.font, size: c.size, color: col, chars: [], shift: s, dir }
            lineMoves.push(g)
          }
          g.chars.push(c)
        }
      }
      // never redraw on top of something painted over the line, and keep
      // what the original drawing state does (opacity, outline, clip)
      const lineSeq = Math.min(...chars.map((c) => F.glyph(c)?.seq ?? Infinity))
      for (const g of lineMoves) {
        for (const c of g.chars) {
          const gl = F.glyph(c)
          const shifted = core(c).map((v, i) => v + dir[i % 2] * g.shift)
          if (gl && gl.alpha < 0.999) noPush ??= 'opacity'
          else if (gl && gl.mode !== 'fill') noPush ??= 'render-mode'
          else if (coveredChar(F, c)) noPush ??= 'covered'
          else if (gl?.clip && !(shifted[0] >= gl.clip[0] && shifted[1] >= gl.clip[1] && shifted[2] <= gl.clip[2] && shifted[3] <= gl.clip[3])) noPush ??= 'clip'
        }
        // RTL letters only by glyph id; spaces and digits in a simple font re-encode
        g.draw = noPush ? null : allRtl ? gidDraw(mupdf, P, g.chars, dir) ?? (RTL.test(textOf(g.chars)) ? null : visualExact(mupdf, P, g.chars, dir)) : sameFont(mupdf, P, g.chars, textOf(g.chars), dir, { exact: true }) ?? sameFont(mupdf, P, g.chars, textOf(g.chars), dir)
        if (!noPush && !g.draw) noPush = 'encoding'
      }
      // the stretch the line grows into must not be painted over either
      let from = Math.min(...group.map((t) => t.oldEnd))
      const tailEnd = lineMoves.length ? Math.max(...lineMoves[lineMoves.length - 1].chars.map((c) => along(c.quad, dir)[1])) + lineMoves[lineMoves.length - 1].shift : 0
      let to = Math.max(tailEnd, ...group.map((t) => t.oldStart + t.shift + t.adv))
      if (allRtl) {
        // growing to the left: from the new left end to the old one
        const tail = lineMoves.length ? lineMoves[lineMoves.length - 1] : null
        to = Math.min(...group.map((t) => t.oldMin))
        from = Math.min(tail ? Math.min(...tail.chars.map((c) => along(c.quad, dir)[0])) + tail.shift : Infinity, ...group.map((t) => t.oldEnd + t.shift - t.adv))
      }
      if (!noPush && to > from + 0.3) {
        const t0 = group[0]
        const o = t0.ch0.origin
        const k = from - dot(o, dir)
        const ob = orientedBox([o[0] + dir[0] * k, o[1] + dir[1] * k], dir, to - from, t0.size * 0.6)
        if (F.paints.some((p) => p.seq > lineSeq && overlaps(p.box, ob))) noPush = 'covered'
      }
    }
    // text of another line further along the same row (the next column)
    const up = [dir[1], -dir[0]]
    const bands = vis.map((c) => along(c.quad, up))
    const band = [Math.min(...bands.map((x) => x[0])), Math.max(...bands.map((x) => x[1]))]
    const rowChars = P.lines
      .filter((l) => l !== line)
      .flatMap((l) => l.chars)
      .filter((c) => {
        if (!c.c.trim()) return false
        const [a, z] = along(c.quad, up)
        return along(c.quad, dir)[0] >= lineEnd - 0.5 && Math.min(z, band[1]) - Math.max(a, band[0]) > 0.3 * (band[1] - band[0])
      })
    const rowNext = rowChars.length ? Math.min(...rowChars.map((c) => along(c.quad, dir)[0])) : Infinity
    // and before it (the column to the left of a right-to-left line)
    const prevChars = P.lines
      .filter((l) => l !== line)
      .flatMap((l) => l.chars)
      .filter((c) => {
        if (!c.c.trim()) return false
        const [a, z] = along(c.quad, up)
        return along(c.quad, dir)[1] <= lineStart + 0.5 && Math.min(z, band[1]) - Math.max(a, band[0]) > 0.3 * (band[1] - band[0])
      })
    const rowPrev = prevChars.length ? Math.max(...prevChars.map((c) => along(c.quad, dir)[1])) : -Infinity
    const startOf = () => {
      const tail = lineMoves.length ? lineMoves[lineMoves.length - 1] : null
      let e = tail ? Math.min(...tail.chars.map((c) => along(c.quad, dir)[0])) + tail.shift : lineStart
      for (const t of group) e = Math.min(e, t.oldEnd + t.shift - t.adv)
      return e
    }
    const endOf = () => {
      const tail = lineMoves.length ? lineMoves[lineMoves.length - 1] : null
      let e = tail ? Math.max(...tail.chars.map((c) => along(c.quad, dir)[1])) + tail.shift : lineEnd
      for (const t of group) e = Math.max(e, t.oldStart + t.shift + t.adv)
      return e
    }
    // pushing (or growing) into the next column would overprint it
    if (!noPush && !allRtl && endOf() > rowNext - 0.3) noPush = 'collision'
    if (!noPush && allRtl && startOf() < rowPrev + 0.3) noPush = 'collision'
    if (noPush) {
      lineMoves = []
      for (const t of group) {
        t.shift = 0
        if (t.rtl || noPush === 'aligned') continue
        // room: the old width, or up to the next column when nothing of the
        // line follows the word
        const after = chars.slice(t.b + 1).filter((c) => c.c.trim())
        const room = noPush === 'collision' && !after.length && rowNext < Infinity ? Math.max(t.oldEnd - t.oldStart, rowNext - 0.3 * t.size - t.oldStart) : t.oldEnd - t.oldStart
        t.scale = 1
        if (t.adv > room + 0.01 && t.adv > 0) {
          t.scale = room / t.adv
          t.adv = room
        }
      }
      // too narrow to read: refuse rather than squeeze (paragraph edits stop
      // at 85%; a line edit keeps the phase 1 floor, see the engine status)
      for (const t of group.filter((x) => x.scale < 0.6)) {
        t.rep.refused = 'no-room'
        t.rep.noPush = noPush
        t.rep.overflow = true
        targets.splice(targets.indexOf(t), 1)
      }
    }
    moved.push(...lineMoves)
    // Overflow: the line's new end passes
    // - the right edge of its paragraph (the stext block, i.e. its widest
    //   line), when the paragraph has two lines or more (with slack for
    //   ragged text, see below); a one-line block (a label, a table cell)
    //   has no column edge of its own;
    // - the visible page minus a small margin;
    // or the text had to be squeezed because the next column is in the way.
    let blockEnd = Infinity
    if (multi) {
      const edge = Math.max(...corners)
      const ends = paraLines.map((l) => Math.max(...l.chars.filter((c) => c.c.trim()).map((c) => along(c.quad, dir)[1])))
      // justified: 3+ lines end at the edge, a hard column edge. Ragged
      // text has no fixed edge: allow 10% of the paragraph width past it.
      const justified = ends.filter((e) => Math.abs(e - edge) < 0.75).length >= 3
      blockEnd = justified ? edge : edge + 0.1 * (edge - Math.min(...corners))
    }
    for (const t of group) {
      if (anchor === 'centre') t.start = (t.oldMin + t.oldEnd) / 2 - t.adv / 2
      else if (t.rtl && !noPush) t.start = t.oldEnd + t.shift - t.adv
      else if (anchor === 'right' || t.rtl) t.start = t.oldEnd - t.adv
      else t.start = t.oldStart + t.shift
    }
    const newEnd = Math.max(endOf(), ...group.map((t) => t.start + t.adv))
    for (const t of group) t.newEnd = newEnd
    const newStart = Math.min(lineStart, ...group.map((t) => t.start))
    // a right-to-left line grows past its paragraph's left edge (same slack)
    const blockStart = multi && allRtl ? Math.min(...corners) - 0.1 * (Math.max(...corners) - Math.min(...corners)) : -Infinity
    const past = newEnd > blockEnd + 0.5 || (newEnd > pageEnd && newEnd > lineEnd + 0.3) || newStart < pageStart + PAGE_MARGIN - 0.01 || (newStart < blockStart - 0.5 && newStart < lineStart - 0.3)
    // A line that grows off the page, or through a drawing under it (a box
    // or cell it sat in, a rule or fill it did not touch), would be clipped
    // or look broken: refused after a spill was tried (blocked below)
    // (measured where the words are drawn: endOf counts a right-to-left,
    // centred or right-aligned word as growing to the right)
    const spans = [...group.map((t) => [t.start, t.start + t.adv]), ...lineMoves.flatMap((g) => g.chars.filter((c) => c.c.trim()).map((c) => along(c.quad, dir).map((v) => v + g.shift)))]
    const drawnEnd = Math.max(lineEnd, ...spans.map((x) => x[1]))
    const drawnStart = Math.min(lineStart, ...spans.map((x) => x[0]))
    const offPage = (drawnEnd > pageEnd && drawnEnd > lineEnd + 0.3) || (drawnStart < pageStart + PAGE_MARGIN - 0.01 && drawnStart < lineStart - 0.3)
    let crosses = false
    if (!offPage && (drawnEnd > lineEnd + 0.3 || drawnStart < lineStart - 0.3)) {
      const o = vis[0].origin
      const band = (a, z) => orientedBox([o[0] + dir[0] * (a - dot(o, dir)), o[1] + dir[1] * (a - dot(o, dir))], dir, z - a, vis[0].size * 0.6)
      const oldBox = band(lineStart, lineEnd)
      const newBox = band(Math.min(drawnStart, lineStart), Math.max(drawnEnd, lineEnd))
      const grown = [drawnEnd > lineEnd + 0.3 && band(lineEnd + 0.3, drawnEnd), drawnStart < lineStart - 0.3 && band(drawnStart, lineStart - 0.3)].filter(Boolean)
      const inside = (a, b) => b[0] >= a[0] - 0.5 && b[1] >= a[1] - 0.5 && b[2] <= a[2] + 0.5 && b[3] <= a[3] + 0.5
      const seq0 = Math.min(...vis.map((c) => F.glyph(c)?.seq ?? Infinity))
      crosses = F.paints.some((p) => p.seq < seq0 && !p.white && ((inside(p.box, oldBox) && !inside(p.box, newBox)) || (!overlaps(p.box, oldBox) && grown.some((x) => overlaps(p.box, x)))))
    }
    for (const t of group) {
      t.blocked = offPage ? 'off-page' : crosses ? 'crosses-drawing' : null
      t.lineMoves = lineMoves
      t.group = group
    }
    for (const t of group) {
      const grew = t.adv > t.oldEnd - t.oldStart + 0.3
      const others = chars.filter((c, i) => c.c.trim() && (i < t.a || i > t.b))
      const hits = others.some((c) => {
        const [lo, hi] = along(c.quad, dir)
        return hi > t.start + 0.3 && lo < t.start + t.adv - 0.3 && !(lo >= t.oldMin - 0.3 && hi <= t.oldEnd + 0.3)
      })
      t.rep.overflow = (grew && (past || (t.rtl && noPush && hits))) || (noPush === 'collision' && t.scale < 1)
      t.rep.noPush = noPush
      t.rep.align = anchor
      t.rep.shift = r2(t.shift)
      t.rep.pushed = r2(lineMoves.filter((g) => line.chars.indexOf(g.chars[0]) > t.b).reduce((m, g) => (Math.abs(g.shift) > Math.abs(m) ? g.shift : m), 0))
    }
  }
  if (single && decide(single)) return { spill: true }
  for (const t of targets.filter((x) => x.blocked && !x.rep.refused)) {
    // fitScale: the squeeze Fit to width would need (the UI offers it at 0.6 and up)
    const fitScale = r2(Math.min(...t.group.map((x) => Math.min(1, (x.oldEnd - x.oldStart) / (x.adv / (x.scale || 1) || 1)))))
    Object.assign(t.rep, { refused: t.blocked, overflow: false, noPush: null, shift: 0, pushed: 0, fitScale })
    targets.splice(targets.indexOf(t), 1)
    // the rest of its line stays where it is
    for (const g of t.lineMoves) if (moved.includes(g)) moved.splice(moved.indexOf(g), 1)
  }
  if (!targets.length) return 0

  // an underline or strike (thin paint drawn after the line, across it or just
  // under it) under the edited word or the words it moves would no longer
  // match them: refused 'decorated'; edits that move none of them stay allowed
  for (const t of targets.slice()) {
    const vis = t.line.chars.filter((c) => c.c.trim())
    const band = unionBox(vis.map((c) => qbox(c.quad)))
    const sz = t.size
    // from strike height down to just under the baseline
    const oy = t.ch0.origin[1]
    const zone = Math.abs(t.dir[0]) >= Math.abs(t.dir[1]) ? [band[0], oy - 0.5 * sz, band[2], oy + 0.35 * sz] : band
    const lineSeq = Math.min(...vis.map((c) => F.glyph(c)?.seq ?? Infinity))
    const thin = (b) => Math.min(b[2] - b[0], b[3] - b[1]) <= 0.25 * sz
    const decor = F.paints.filter((p) => p.seq > lineSeq && thin(p.box) && overlaps(p.box, zone))
    if (!decor.length) continue
    const touched = [...t.chars.filter((c) => c.c.trim()), ...moved.filter((m) => t.line.chars.includes(m.chars[0])).flatMap((m) => m.chars)]
    if (decor.some((p) => touched.some((c) => {
      const q = qbox(c.quad)
      return p.box[0] < q[2] - 0.3 && p.box[2] > q[0] + 0.3
    }))) {
      t.rep.refused = 'decorated'
      targets.splice(targets.indexOf(t), 1)
      for (const m of moved.filter((x) => t.line.chars.includes(x.chars[0]))) moved.splice(moved.indexOf(m), 1)
    }
  }
  if (!targets.length) return 0

  // removal rects per glyph; a rect that would touch a glyph of another line
  // (tight line spacing) is retried thin, else that line is refused
  const page = P.page
  const sets = [...targets.map((t) => ({ t, chars: t.chars.filter((c) => c.c.trim() && !t.ownChars.has(c)), dir: t.dir })), ...moved.map((m) => ({ m, chars: m.chars, dir: m.dir }))]
  const gone = new Set([...sets.flatMap((x) => x.chars), ...targets.flatMap((t) => [...t.ownChars])])
  const others = P.lines.flatMap((l) => l.chars.filter((c) => c.c.trim() && !gone.has(c)))
  const refuseLine = (li) => {
    for (const t of targets.filter((x) => x.li === li)) {
      t.rep.refused = 'tight-lines'
      targets.splice(targets.indexOf(t), 1)
    }
    for (const m of moved.filter((x) => P.lines[li].chars.includes(x.chars[0]))) moved.splice(moved.indexOf(m), 1)
  }
  for (const x of sets) {
    const li = x.t ? x.t.li : P.lines.findIndex((l) => l.chars.includes(x.chars[0]))
    for (const thin of [false, true]) {
      x.rects = glyphRects(x.chars, x.dir, thin)
      if (!x.rects.some((r) => others.some((c) => overlaps(qbox(c.quad), r)))) break
      x.rects = null
    }
    if (!x.rects) refuseLine(li)
  }
  if (!targets.length) return 0
  const live = sets.filter((x) => (x.t ? targets.includes(x.t) : moved.includes(x.m)))

  const bad = removeGlyphs(mupdf, doc, P, live.flatMap((x) => x.rects), gone, others, targets.flatMap((t) => t.mine), targets.flatMap((t) => [t.old, textOf(t.chars)]))
  if (bad) {
    for (const t of targets) t.rep.refused = bad
    return 0
  }

  // draw the new text after the page content, each in a tagged span
  const p2 = doc.loadPage(P.idx)
  const pobj = p2.getObject()
  const res = ownResources(doc, pobj)
  let content = ''
  // drawn in reading order: line, then along it (right to left for RTL)
  const pieces = []
  const along0 = (li, u, rtl) => [li, rtl ? -u : u]
  const tm = tmFor(P.page)
  const point = (t, d) => {
    const o = t.ch0.origin
    const k = d - dot(o, t.dir)
    return [o[0] + t.dir[0] * k, o[1] + t.dir[1] * k]
  }
  for (const t of targets) {
    const o = point(t, t.start)
    t.rep.font = t.draw ? (t.draw.kind === 'same' ? 'original' : 'fallback') : null
    // bundled Noto fonts are regular only: say so when the original was bold
    t.rep.fallbackName = t.draw?.kind === 'form' ? t.draw.name + (needsFakeBold(t.ch0.font, t.draw) ? ' (synthetic bold)' : '') : null
    t.rep.fit = t.scale !== 1 ? f4(t.scale) : null
    const nb = orientedBox(o, t.dir, t.adv, t.size)
    t.rep.box = toView(nb, P.bounds)
    const lineMoved = moved.filter((m) => t.line.chars.includes(m.chars[0]))
    const mb = lineMoved.map((m) => {
      const bx = unionBox(m.chars.map((c) => qbox(c.quad)))
      return unionBox([bx, [bx[0] + t.dir[0] * m.shift, bx[1] + t.dir[1] * m.shift, bx[2] + t.dir[0] * m.shift, bx[3] + t.dir[1] * m.shift]])
    })
    const cb = unionBox([unionBox(t.chars.map((c) => qbox(c.quad))), nb, ...mb])
    // marks and anti-aliasing of moved right-to-left text reach a little out
    t.rep.changedBox = toView(t.rtl ? [cb[0] - 0.5, cb[1] - 0.5, cb[2] + 0.5, cb[3] + 0.5] : cb, P.bounds)
    if (!t.draw) continue
    const m = tm(o, t.dir)
    let gs = ''
    if (t.alpha < 0.999) {
      const gd = subDict(doc, res, 'ExtGState')
      const name = freeName(gd, 'SPDFEditGs')
      const st = doc.newDictionary()
      st.put('Type', doc.newName('ExtGState'))
      st.put('ca', f4(t.alpha))
      st.put('CA', f4(t.alpha))
      gd.put(name, doc.addObject(st))
      gs = `/${name} gs `
    }
    const tag = `/SPDFBox [${nb.map((v) => f4(v)).join(' ')}]`
    if (t.draw.kind === 'same') {
      const fd = subDict(doc, res, 'Font')
      const name = freeName(fd, 'SPDFEdit')
      fd.put(name, t.draw.ref)
      pieces.push([along0(t.li, t.start, t.rtl), `/Span <<${tag}>> BDC\nq ${gs}BT /${name} ${f4(t.size)} Tf ${f4(t.draw.tc)} Tc ${f4(t.scale * 100)} Tz ${colorOp(t.ch0.color)} ${m.map(f4).join(' ')} Tm <${hexOf(t.draw.info, t.draw.codes)}> Tj ET Q\nEMC\n`])
    } else {
      const xd = subDict(doc, res, 'XObject')
      const name = freeName(xd, 'SPDFEditFx')
      xd.put(name, t.draw.form)
      const cm = [m[0] * t.scale, m[1] * t.scale, m[2], m[3], m[4], m[5]]
      // the form carries its own ActualText span when it needs one
      const bold = needsFakeBold(t.ch0.font, t.draw) ? fakeBold(t.ch0.color, t.size) : ''
      pieces.push([along0(t.li, t.start, t.rtl), `/Span <<${tag}>> BDC\nq ${gs}${colorOp(t.ch0.color)} ${bold}${cm.map(f4).join(' ')} cm /${name} Do Q\nEMC\n`])
    }
  }
  for (const g of moved) {
    const c0 = g.chars[0]
    const dir = g.dir
    const o0 = g.draw.origin ?? c0.origin
    const o = [o0[0] + dir[0] * g.shift, o0[1] + dir[1] * g.shift]
    const fd = subDict(doc, res, 'Font')
    const name = freeName(fd, 'SPDFEdit')
    fd.put(name, g.draw.ref)
    // exact TJ, or (a ligature that splits) the same font at its own widths
    const show = g.draw.tj ? `0 Tc ${colorOp(c0.color)} ${tm(o, dir).map(f4).join(' ')} Tm [${g.draw.tj}] TJ` : `${f4(g.draw.tc)} Tc ${colorOp(c0.color)} ${tm(o, dir).map(f4).join(' ')} Tm <${hexOf(g.draw.info, g.draw.codes)}> Tj`
    // tagged so a later read knows the line is ours (ownLinesHome)
    const bx = unionBox(g.chars.map((c) => qbox(c.quad)))
    const mb = [bx[0] + dir[0] * g.shift, bx[1] + dir[1] * g.shift, bx[2] + dir[0] * g.shift, bx[3] + dir[1] * g.shift]
    pieces.push([along0(P.lines.indexOf(P.lines.find((l) => l.chars.includes(c0))), dot(o, dir), RTL.test(textOf(g.chars))), `/Span <</SPDFRun [${mb.map(f4).join(' ')}]>> BDC\nBT /${name} ${f4(g.size)} Tf ${show} ET\nEMC\n`])
  }
  content = pieces.sort((x, y) => x[0][0] - y[0][0] || x[0][1] - y[0][1]).map((x) => x[1]).join('')
  // where copy and search read the new text: in place, or at the page end
  // a line that now runs past its column is drawn after the page content
  // as before: read in place it can join the next column's text
  const order = targets.some((t) => t.rep.overflow) ? (appendContent(doc, pobj, content), 'appended') : placeContent(mupdf, doc, P, pobj, content, gone)
  for (const t of targets) t.rep.order = order
  p2.destroy?.()
  return targets.length
}

// ---------- spill ----------
// A single line edit that does not fit its line (past the paragraph's edge,
// squeezed, or refused for room), or that empties a line with lines below:
// -> { g, r0, words } for editParagraph's spill mode, or null (edit as before).
// Paragraphs here keep hyphen breaks as they are (no hyphen lookup).
function spillPlan(P, t) {
  if (t.rep.refused && t.rep.refused !== 'no-room') return null
  if (t.rtl || RTL.test(t.text) || Math.abs(t.dir[1]) > 0.01 || t.dir[0] < 0) return null
  const vis = t.line.chars.filter((c) => c.c.trim())
  const whole = t.chars.includes(vis[0]) && t.chars.includes(vis[vis.length - 1])
  const emptied = whole && !t.text.trim()
  P.parasKeep ??= findParagraphs(ownLinesHome(P), P.runs, { bad: (c) => BAD_CHAR.test(c.c), covered: (c) => coveredChar(P.F, c), stuck: (c) => !canRedraw(P, c), bold: (c) => isBold(c.font), hyphen: () => 'keep', pageBox: P.bounds })
  const g = P.parasKeep.find((x) => x.lineIdx.includes(t.li))
  if (!g || !g.editable || g.frame.rtl || (g.align !== 'start' && g.align !== 'justify')) return null
  if (!(g.leading > 0.9 * g.size && g.leading < 2.2 * g.size)) return null
  const n = g.rows.length
  const r0 = g.rows.findIndex((r) => r.lines.includes(t.li))
  if (r0 < 0) return null
  if (emptied) {
    if (r0 === n - 1) return null
  } else {
    const slack = g.align === 'justify' ? 0.5 : 0.1 * (g.R - g.L)
    const past = n >= 2 && t.newEnd > g.R + slack
    if (!(t.rep.refused === 'no-room' || t.rep.overflow || t.scale < 1 || past || t.blocked)) return null
  }
  // the line's words in the paragraph; a hyphenated word that starts above
  // or goes on below keeps its piece on this line as it is
  const W = g.words.filter((w) => w.parts.some((pt) => pt.li === t.li))
  if (!W.length) return null
  const i0 = g.words.indexOf(W[0])
  const i1 = g.words.indexOf(W[W.length - 1])
  if (i1 - i0 + 1 !== W.length) return null
  const head = W[0].joined && W[0].rows[0] < r0 ? W[0] : null
  const tail = W[W.length - 1].joined && W[W.length - 1].rows[W[W.length - 1].rows.length - 1] > r0 ? W[W.length - 1] : null
  const chars = t.line.chars
  const piece = (w) => textOf(chars.filter((c) => w.chars.includes(c)))
  let S = (textOf(chars.slice(0, t.a)) + t.text + textOf(chars.slice(t.b + 1))).replace(/\s+/g, ' ').trim()
  if (head) {
    const h = piece(head)
    if (!S.startsWith(h) || (S.length > h.length && S[h.length] !== ' ')) return null
    S = S.slice(h.length)
  }
  if (tail) {
    const z = piece(tail)
    if (!S.endsWith(z) || (S.length > z.length && S[S.length - z.length - 1] !== ' ')) return null
    S = S.slice(0, S.length - z.length)
  }
  const mid = splitWords(joinAccents(S.trim()))
  if (mid.length && !tail) mid[mid.length - 1].brk = !!W[W.length - 1].brk
  const keep = (w) => ({ text: w.text, brk: !!w.brk, glue: !!w.glue })
  const words = [...g.words.slice(0, i0).map(keep), ...(head ? [keep(head)] : []), ...mid, ...(tail ? [keep(tail)] : []), ...g.words.slice(i1 + 1).map(keep)]
  // word map: every word off the line is itself; only the line's own words
  // are diffed (a whole-paragraph diff tied a new word to a later row's copy)
  const same = (k) => ({ from: k, style: k })
  const oldMid = []
  for (let k = i0 + (head ? 1 : 0); k <= i1 - (tail ? 1 : 0); k++) oldMid.push(k)
  const dm = diffWords(oldMid.map((k) => g.words[k].text), mid.map((w) => w.text))
  const diff = [
    ...g.words.slice(0, i0).map((_, k) => same(k)),
    ...(head ? [same(i0)] : []),
    ...dm.map((d) => ({ from: d.from != null ? oldMid[d.from] : null, style: d.style != null ? oldMid[d.style] : (oldMid[0] ?? i0) })),
    ...(tail ? [same(i1)] : []),
    ...g.words.slice(i1 + 1).map((_, k) => same(i1 + 1 + k)),
  ]
  // line spacing from the baselines themselves (row v is rounded)
  const base = g.rows.map((r) => P.lines[r.lines[0]].chars.find((c) => c.c.trim())).map((c) => (c ? dot(c.origin, g.frame.down) : null))
  const gaps = base.slice(1).map((v, k) => (v != null && base[k] != null ? v - base[k] : 0)).filter((d) => d > 0.5 * g.size && d < 2.5 * g.size).sort((a, b) => a - b)
  const lead = gaps.length ? gaps[gaps.length >> 1] : g.leading
  // the edited row's own baseline (row v is on a 0.2 pt grid): new words sit on it
  const vs = g.rows[r0].lines.flatMap((li) => P.lines[li].chars.filter((c) => c.c.trim()).map((c) => dot(c.origin, g.frame.down))).sort((a, b) => a - b)
  const v0 = vs.length ? vs[vs.length >> 1] : null
  return { g, r0, words, diff, lead, v0 }
}

// ---------- one paragraph ----------
// Squeeze steps tried when the text does not fit as it is.
const SQUEEZE = [1, 0.97, 0.94, 0.91, 0.88, 0.85]

// Style of an old word: its biggest same-look group of glyphs.
function styleOf(w) {
  const groups = new Map()
  for (const c of w.chars) {
    const k = `${c.font}|${c.size.toFixed(2)}|${c.color.join()}`
    ;(groups.get(k) ?? groups.set(k, []).get(k)).push(c)
  }
  let chars = [...groups.values()].sort((a, b) => b.length - a.length)[0]
  // a word hyphenated across lines: its spacing is measured on its first
  // line only (glyphs up to the jump to the next line), hyphen left out
  const one = [chars[0]]
  for (let i = 1; i < chars.length && Math.hypot(chars[i].origin[0] - chars[i - 1].origin[0], chars[i].origin[1] - chars[i - 1].origin[1]) < 2 * chars[0].size; i++) one.push(chars[i])
  const plain = one.filter((c) => !/^[-\u2010]$/.test(c.c))
  if (plain.length) chars = plain
  return { chars, ch: chars[0], font: chars[0].font, size: chars[0].size, color: chars[0].color }
}
// consecutive glyphs with one look
function tokensOf(chars) {
  const out = []
  for (const c of chars) {
    const t = out[out.length - 1]
    if (t && t[0].font === c.font && Math.abs(t[0].size - c.size) < 0.01 && t[0].color.join() === c.color.join()) t.push(c)
    else out.push([c])
  }
  return out
}

// Re-wraps one paragraph with new text. Same safety as line edits: every
// step that can fail runs before the removal, which is checked and undone
// on any loss. -> 1 applied, 0 refused (rep.refused set)
// spill: { g, r0 } a line edit that spills over (or empties) row r0 of g;
// only that row is laid out again, later rows move whole (spillLayout)
async function editParagraph(mupdf, doc, P, { e, rep }, { fit }, usage, scratch, spill = null) {
  const g = spill?.g ?? paragraphsOf(P).find((x) => `p${P.idx + 1}-g${x.k}` === e.paragraphId)
  const refuse = (why, extra = {}) => {
    rep.refused = why
    Object.assign(rep, extra)
    return 0
  }
  if (!g) return refuse('not-found')
  if (!g.editable) return refuse(g.why)
  const fold = (x) => String(x).replace(/\s+/g, ' ').trim()
  if (e.old != null && fold(e.old) !== fold(g.text)) return refuse('stale')
  addUsage(usage, P.idx, P.lines)
  const F = P.F
  const fr = g.frame
  const dir = fr.dir
  const chars = g.lineIdx.flatMap((li) => P.lines[li].chars.filter((c) => c.c.trim()))
  const mineSet = new Set(chars)
  const states = chars.map((c) => F.glyph(c)).filter(Boolean)
  if (states.some((s) => s.mode !== 'fill')) return refuse('render-mode')
  const alpha = states[0]?.alpha ?? 1
  const clip = states[0]?.clip ?? null
  // a spill redraws every moved row in the first glyph's state
  const sameClip = (a, b) => (!a && !b) || (!!a && !!b && a.every((v, i) => Math.abs(v - b[i]) < 0.01))
  if (spill && states.some((st) => Math.abs((st.alpha ?? 1) - alpha) > 0.001 || !sameClip(st.clip, clip))) return refuse('spill-blocked')
  const firstSeq = Math.min(...states.map((s) => s.seq), Infinity)

  const inBox = (c, b) => {
    const q = qbox(c.quad)
    const x = (q[0] + q[2]) / 2
    const y = (q[1] + q[3]) / 2
    return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]
  }
  const pageChars = P.lines.flatMap((l) => l.chars.filter((c) => c.c.trim()))

  // the new words and how each is drawn
  const text = String(e.text ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ')
  const news = e.words ?? splitWords(text)
  const diff = e.diff ?? diffWords(g.words.map((w) => w.text), news.map((w) => w.text))
  const removed = g.words.filter((_, i) => !diff.some((d) => d.from === i)).map((w) => w.text)
  let fallbackDoc = null
  const measure = async (txt, standard, size) => {
    const [{ PDFDocument }, fonts] = await Promise.all([import('pdf-lib'), import('./fonts.js')])
    fallbackDoc ??= await PDFDocument.create()
    return fonts.runsWidth(await fonts.layoutText(fallbackDoc, txt, { standard }), size)
  }
  const inkSeen = new Map()
  // Glyphs drawn again as they were: re-encoded in their font, else by
  // glyph id (shaped Arabic, a TeX math sign). Offsets from the left end on
  // the page. -> { kind: 'exact', toks, w, size } or null
  const exactOf = (cs, rowV) => {
    // a ligature ("fi" read as two chars) is drawn as its letters in the same
    // font: drawn by glyph id it reads back split ("diffi cult")
    const plain = (tc) => {
      const d = sameFont(mupdf, P, tc, textOf(tc), dir)
      if (!d) return null
      const key = `${tc[0].font}|${textOf(tc)}`
      if (!inkSeen.has(key)) inkSeen.set(key, inkOk(mupdf, scratch(), d, tc[0].size))
      return inkSeen.get(key) ? d : null
    }
    // every glyph of an unchanged word must leave ink (a code that maps to an
    // empty glyph printed hyphens as blanks)
    const inked = (tc, d) => {
      if (!d) return null
      const key = `exact|${tc[0].font}|${textOf(tc)}`
      if (!inkSeen.has(key)) inkSeen.set(key, inkOk(mupdf, scratch(), d, tc[0].size))
      return inkSeen.get(key) ? d : null
    }
    // a spill moves words as they are: their own bytes or glyph ids only (a
    // ligature re-encoded as letters printed "undefiined")
    const toks = tokensOf(cs).map((tc) => ({ chars: tc, draw: (COMPLEX.test(textOf(tc)) ? null : (inked(tc, sameFont(mupdf, P, tc, textOf(tc), dir, { exact: true })) ?? (spill ? null : plain(tc)))) ?? gidDraw(mupdf, P, tc, dir, scratch()) }))
    if (!toks.every((t) => t.draw)) return null
    const ext = cs.map((c) => along(c.quad, dir))
    const u0 = Math.min(...ext.map((x) => x[0]))
    return {
      kind: 'exact',
      // the glyphs' own text, one char per glyph, so a reader maps them one to one
      actual: textOf(cs),
      x0: u0,
      w: Math.max(...ext.map((x) => x[1])) - u0,
      size: cs[0].size,
      toks: toks.map((t) => {
        const o = t.draw.origin ?? t.chars[0].origin
        return { ...t, du: dot(o, dir) - u0, dv: dot(o, fr.down) - rowV }
      }),
    }
  }
  let items = []
  try {
    for (const [j, nw] of news.entries()) {
      const d = diff[j]
      const old = d.from != null ? g.words[d.from] : null
      const st = styleOf(g.words[d.style ?? 0])
      const it = { text: nw.text, brk: nw.brk, glue: nw.glue, size: st.size, color: st.color, style: st, rise: 0 }
      it.old = old
      if (old && !old.joined) {
        // unchanged: every glyph as it was, kerning and rises kept
        const ex = exactOf(old.chars, g.rows[old.row].v)
        if (ex) {
          Object.assign(it, ex)
          items.push(it)
          continue
        }
      }
      const complex = COMPLEX.test(nw.text) || COMPLEX.test(textOf(st.chars))
      const need = [...new Set([...nw.text].filter((c) => c.trim()))]
      let draw = null
      if (!complex && proveUse(doc, usage, st.font, need)) draw = sameFont(mupdf, P, st.chars, nw.text, dir)
      if (draw) {
        const key = `${st.font}|${nw.text}`
        if (!inkSeen.has(key)) inkSeen.set(key, inkOk(mupdf, scratch(), draw, st.size))
        if (!inkSeen.get(key)) draw = null
      }
      if (draw) {
        it.kind = 'same'
        it.draw = draw
        it.w = draw.adv
      } else {
        it.kind = 'form'
        it.standard = standardFor(fontDicts(mupdf, P, st.font)[0]?.base || st.font)
        it.w = await measure(nw.text, it.standard, st.size)
      }
      items.push(it)
    }
  } catch (err) {
    return refuse(err.code === 'UNSUPPORTED_CHAR' ? 'unsupported-char' : 'draw-failed', err.char ? { char: err.char } : {})
  }
  // ---- reflow window: lines above the first change are not touched, and
  // the layout stops at the first line where the source carries on as it was
  const n0 = g.rows.length
  const rowOfLi = new Map()
  g.rows.forEach((r, k) => r.lines.forEach((li) => rowOfLi.set(li, k)))
  const lineOfChar = new Map()
  g.lineIdx.forEach((li) => P.lines[li].chars.forEach((c) => lineOfChar.set(c, li)))
  // source pieces: each word on each line it sits on, ids 'word:piece'
  const pieces = g.words.map((w, wi) => {
    const byRow = new Map()
    for (const c of w.chars) {
      const k = rowOfLi.get(lineOfChar.get(c))
      ;(byRow.get(k) ?? byRow.set(k, []).get(k)).push(c)
    }
    return [...byRow].sort((x, y) => x[0] - y[0]).map(([k, cs], pi) => ({ id: `${wi}:${pi}`, row: k, chars: cs }))
  })
  const flat = pieces.flat()
  const tail = Array.from({ length: n0 + 1 }, (_, r) => flat.filter((pc) => pc.row >= r).map((pc) => pc.id))
  const firstId = g.rows.map((_, r) => flat.find((pc) => pc.row === r)?.id ?? null)
  // first changed word: old and new words (and hard breaks) agree before it
  let p0 = 0
  while (p0 < g.words.length && p0 < news.length && g.words[p0].text === news[p0].text && !!g.words[p0].brk === !!news[p0].brk) p0++
  if (p0 === g.words.length && p0 === news.length) {
    rep.lines = n0
    return 0
  }
  const r0 = spill ? spill.r0 : p0 < g.words.length ? pieces[p0][0].row : pieces[g.words.length - 1].at(-1).row
  const pieceItem = (pc, base, extra) => {
    const ex = exactOf(pc.chars, g.rows[pc.row].v)
    if (!ex) return null
    items.push({ ...base, ...ex, text: textOf(pc.chars), old: null, ...extra })
    return items.length - 1
  }
  const units = []
  for (let wi = 0; wi < p0; wi++) {
    // a word above the window ending on its first line: that half stays a piece
    const ps = pieces[wi]
    if (ps.at(-1).row < r0 || ps.length === ps.filter((pc) => pc.row >= r0).length) continue
    for (const pc of ps.filter((x) => x.row >= r0)) {
      const i = pieceItem(pc, items[wi], { brk: items[wi].brk, glue: false })
      if (i == null) return refuse('draw-failed')
      units.push({ i, ids: [pc.id] })
    }
  }
  for (let j = 0; j < news.length; j++) {
    const from = diff[j].from
    if (j < p0 && pieces[j][0].row < r0) continue
    const it = items[j]
    if (from == null) {
      units.push({ i: j, ids: [null] })
      continue
    }
    const ps = pieces[from]
    if (ps.length === 2 && it.old?.joined) {
      // its two halves as they were, or (when the break is known) the joined word
      const p1 = pieceItem(ps[0], it, { brk: false })
      const p2 = pieceItem(ps[1], it, { brk: it.brk, glue: false })
      if (p1 != null && p2 != null) units.push({ whole: spill || it.old.hyph === 'keep' ? null : j, p1, p2, ids: [ps[0].id, ps[1].id] })
      else if (spill) return refuse('draw-failed')
      else units.push({ i: j, ids: [null] })
    } else units.push({ i: j, ids: ps.map((pc) => pc.id) })
  }
  // reading direction per word; numbers and signs go with their neighbours
  const strong = items.map((it) => (RTL.test(it.text) ? true : /\p{L}/u.test(it.text) ? false : null))
  items.forEach((it, i) => {
    const p = strong.slice(0, i).reverse().find((x) => x != null)
    const n = strong.slice(i + 1).find((x) => x != null)
    it.rtl = strong[i] ?? (p != null && p === n ? p : fr.rtl)
  })

  // where things may not go: other text (the paragraph's lines outside the
  // window included), paint over or near, widgets, the page margin, the clip
  const rowChars = g.rows.map((r) => r.lines.flatMap((li) => P.lines[li].chars.filter((c) => c.c.trim())))
  const paraBox = unionBox(chars.map((c) => qbox(c.quad)))
  const grow = (b, d) => [b[0] - d, b[1] - d, b[2] + d, b[3] + d]
  const srcRows = g.rows.map((r, k) => grow(unionBox(rowChars[k].map((c) => qbox(c.quad))), 0.3 * r.size))
  // underline / strike: paint drawn after the text over its lines
  const decor = F.paints.filter((p) => p.seq > firstSeq && srcRows.some((q) => overlaps(p.box, q)))
  const pageOthers = pageChars.filter((c) => !mineSet.has(c))
  const annots = annotRects(P, !!spill)
  const paintIn = F.paints.filter((p) => !decor.includes(p) && (p.seq > firstSeq || !overlaps(p.box, grow(paraBox, 1)))).map((p) => p.box)
  const paintNew = F.paints.filter((p) => p.seq > firstSeq).map((p) => p.box)
  const blankSeen = new Map()
  const blank = (box) => {
    const k = box.map((v) => v.toFixed(1)).join()
    if (!blankSeen.has(k)) blankSeen.set(k, stripBlank(mupdf, P.page, box))
    return blankSeen.get(k)
  }
  const b = P.bounds
  const inside = (r) => r[0] >= b[0] + PAGE_MARGIN - 0.01 && r[1] >= b[1] + PAGE_MARGIN - 0.01 && r[2] <= b[2] - PAGE_MARGIN + 0.01 && r[3] <= b[3] - PAGE_MARGIN + 0.01
  const pointAt = (x, v, w = 0) => {
    const u = fr.rtl ? -(x + w) : x
    return [dir[0] * u + fr.down[0] * v, dir[1] * u + fr.down[1] * v]
  }
  // shaped scripts (Arabic, Devanagari) reach higher and lower than Latin
  const tallRow = (row) => row.items.some((p) => COMPLEX.test(items[p.i].text))
  const rowBox = (row, size, below = 0) => {
    const [hi, lo] = tallRow(row) ? [1.05, 0.5] : [0.85, 0.25]
    const p0b = pointAt(row.x0, row.v - hi * size)
    const p1b = pointAt(row.x0 + row.width, row.v + (lo + below) * size)
    return [Math.min(p0b[0], p1b[0]), Math.min(p0b[1], p1b[1]), Math.max(p0b[0], p1b[0]), Math.max(p0b[1], p1b[1])]
  }
  const horiz = Math.abs(dir[0]) >= Math.abs(dir[1])
  const rowOk = (row, last) => {
    const size = Math.max(...row.items.map((p) => items[p.i].size), g.size)
    // a new line below the old ones keeps a line gap clear under it
    const fresh = row.k >= n0
    // a spill keeps half a line clear above what comes next
    const box = rowBox(row, size, fresh ? (spill ? 0.6 : 0.15) : 0)
    if (!inside(box)) return false
    if (clip && !(box[0] >= clip[0] - 0.5 && box[1] >= clip[1] - 0.5 && box[2] <= clip[2] + 0.5 && box[3] <= clip[3] + 0.5)) return false
    const kept = rowChars.flatMap((cs, k) => (k < r0 || k > last ? cs : [])).map((c) => core(c))
    const glyphs = [...pageOthers.map((c) => core(c)), ...kept, ...annots]
    if (!fresh) return !glyphs.some((x) => overlaps(x, box)) && !paintIn.some((x) => overlaps(x, box))
    if (!horiz || glyphs.some((x) => overlaps(x, box)) || paintNew.some((x) => overlaps(x, box))) return false
    // the part below the old paragraph was blank paper before
    const below = dir[0] > 0 ? [box[0], Math.max(box[1], paraBox[3] + 0.5), box[2], box[3]] : [box[0], box[1], box[2], Math.min(box[3], paraBox[1] - 0.5)]
    return below[3] - below[1] < 0.5 || blank(below)
  }
  let layout = null
  let last = n0 - 1
  let scale = 1
  let spilled = null
  if (spill && units.length) {
    const pieceRow = new Map(flat.map((pc) => [pc.id, pc.row]))
    const w = spillLayout(g, items, units, { r0, row: (id) => pieceRow.get(id), lead: spill.lead })
    if (!w) return refuse('spill-blocked')
    // moved rows keep every glyph as it was
    if (w.rows.some((row) => row.kept != null && row.items.some((p) => items[p.i].kind !== 'exact'))) return refuse('spill-blocked')
    if (!w.rows.every((row) => rowOk(row, w.last))) return refuse('no-room')
    // a link or comment on a moved row would stay behind, and what is drawn
    // under a row (a highlight, a cell fill) must be the same where it goes
    const under = (bx) => F.paints.filter((p) => p.seq < firstSeq && overlaps(p.box, bx))
    const src0 = under(unionBox(rowChars[r0].map((c) => qbox(c.quad))))
    for (const row of w.rows) {
      if (w.delta === 0) break
      let from = src0
      let to = rowBox(row, Math.max(...row.items.map((p) => items[p.i].size)))
      if (row.kept != null) {
        const src = unionBox(rowChars[row.kept].map((c) => qbox(c.quad)))
        if (annots.some((a) => overlaps(a, src))) return refuse('spill-blocked')
        const d = row.v - g.rows[row.kept].v
        from = under(src)
        to = [src[0] + fr.down[0] * d, src[1] + fr.down[1] * d, src[2] + fr.down[0] * d, src[3] + fr.down[1] * d]
      }
      const at = under(to)
      if (at.length !== from.length || at.some((p) => !from.includes(p))) return refuse('spill-blocked')
    }
    // new words on the re-laid rows: on the row's real baseline
    const nudge = spill.v0 != null && Math.abs(spill.v0 - g.rows[r0].v) < 0.2 ? spill.v0 - g.rows[r0].v : 0
    for (const row of w.rows) if (row.kept == null) row.nv = row.v + nudge
    layout = w.rows
    last = w.last
    spilled = w
  } else if (units.length) {
    // squeeze only the window's lines, never the lines left as they are
    for (const s of SQUEEZE) {
      const w = layoutWindow(g, items, units, { r0, tail, firstId, s })
      if (fit && w.rows.length > w.last - r0 + 1) continue
      if (w.rows.every((row) => rowOk(row, w.last))) {
        layout = w.rows
        last = w.last
        scale = s
        break
      }
    }
    if (!layout) {
      // not longer, yet nothing fits: something on the lines is in the way
      const w = layoutWindow(g, items, units, { r0, tail, firstId, s: 1 })
      return w.rows.length <= w.last - r0 + 1 ? refuse('covered', { lines: n0 }) : refuse('no-room', { overflow: true, lines: n0 })
    }
  }
  // an underline or strike on a line that moves would no longer match its words
  // per window line: from strike height down to just under the baseline
  const winBoxes = g.rows.slice(r0, last + 1).map((r, j) => {
    const q = unionBox(rowChars[r0 + j].map((c) => qbox(c.quad)))
    const oy = rowChars[r0 + j][0].origin[1]
    return horiz ? [q[0], oy - 0.5 * r.size, q[2], oy + 0.35 * r.size] : q
  })
  if (decor.some((p) => winBoxes.some((q) => overlaps(p.box, q)))) return refuse('decorated')
  // what the window removes: its source lines (and our earlier draws there)
  const winChars = rowChars.slice(r0, last + 1).flat()
  const winSet = new Set(winChars)
  const others = pageChars.filter((c) => !winSet.has(c))
  const spans = ownSpans(P.obj).filter((s) => winChars.some((c) => inBox(c, s.box)))
  const ownChars = new Set(pageChars.filter((c) => spans.some((s) => inBox(c, s.box))))
  if ([...ownChars].some((c) => !winSet.has(c))) return refuse('conflict')

  // fallback words: one pdf-lib file per paragraph, one form per word (each
  // word gets its own ActualText span)
  const forms = new Map()
  if (layout) {
    const pages = layout.flatMap((row) => row.items.filter((p) => items[p.i].kind === 'form').map((p) => ({ p, pieces: [{ text: items[p.i].text, x: 0, standard: items[p.i].standard, size: items[p.i].size }] })))
    if (pages.length) {
      try {
        const made = await fallbackForms(mupdf, doc, pages)
        made.forEach((f, i) => forms.set(pages[i].p, { ...f, bold: isBold(items[pages[i].p.i].style.font) }))
      } catch (err) {
        return refuse(err.code === 'UNSUPPORTED_CHAR' ? 'unsupported-char' : 'draw-failed', err.char ? { char: err.char } : {})
      }
      for (const [p, f] of forms) if (!inkOk(mupdf, scratch(), f, items[p.i].size)) return refuse('no-glyph')
    }
  }

  // the rows as content: fontName(ref) / formName(form) give resource names
  const tm = tmFor(P.page)
  const Tz = scale !== 1 ? `${f4(scale * 100)} Tz ` : ''
  const drawRows = (fontName, formName, gs = '') => {
    let content = ''
    const boxes = []
    for (const row of layout ?? []) {
      let body = ''
      for (const p of row.items) {
        const it = items[p.i]
        let d = ''
        if (it.kind === 'exact') {
          for (const t of it.toks) {
            const c0 = t.chars[0]
            const left = fr.rtl ? -(p.x + p.w) : p.x
            const o = [dir[0] * (left + t.du * scale) + fr.down[0] * (row.v + t.dv), dir[1] * (left + t.du * scale) + fr.down[1] * (row.v + t.dv)]
            const show = t.draw.tj ? `0 Tc ${Tz}${colorOp(c0.color)} ${tm(o, dir).map(f4).join(' ')} Tm [${t.draw.tj}] TJ` : `${f4(t.draw.tc)} Tc ${Tz}${colorOp(c0.color)} ${tm(o, dir).map(f4).join(' ')} Tm <${hexOf(t.draw.info, t.draw.codes)}> Tj`
            d += `BT /${fontName(t.draw.ref)} ${f4(c0.size)} Tf ${show} ET\n`
          }
        } else if (it.kind === 'same') {
          const o = pointAt(p.x, row.nv ?? row.v, p.w)
          d = `BT /${fontName(it.draw.ref)} ${f4(it.size)} Tf ${f4(it.draw.tc)} Tc ${Tz}${colorOp(it.color)} ${tm(o, dir).map(f4).join(' ')} Tm <${hexOf(it.draw.info, it.draw.codes)}> Tj ET\n`
        } else {
          const f = forms.get(p)
          const name = formName(f)
          const m = tm(pointAt(p.x, row.nv ?? row.v, p.w), dir)
          const cm = [m[0] * scale, m[1] * scale, m[2], m[3], m[4], m[5]]
          const bold = needsFakeBold(it.style.font, f) ? fakeBold(it.color, it.size) : ''
          d = `q ${colorOp(it.color)} ${bold}${cm.map(f4).join(' ')} cm /${name} Do Q\n`
        }
        // right-to-left glyphs already read back in order (see fallbackForm);
        // same-font and Latin fallback glyphs read back by themselves
        body += it.kind !== 'form' || !COMPLEX.test(it.text) || RTL.test(it.text) ? d : `/Span <</ActualText <${utf16Hex(it.actual ?? it.text)}>>> BDC\n${d}EMC\n`
      }
      const size = Math.max(...row.items.map((p) => items[p.i].size))
      const rb = rowBox(row, size)
      // the reported box takes anti-aliasing and side bearings in
      boxes.push([rb[0] - 0.5, rb[1] - 0.5, rb[2] + 0.5, rb[3] + 0.5])
      content += `/Span <</SPDFBox [${rb.map(f4).join(' ')}] /SPDFPara [${paraBox.map(f4).join(' ')}]>> BDC\nq ${gs}${body}Q\nEMC\n`
    }
    return { content, boxes }
  }
  // a spill draws words one by one: on a scratch page they must read back as
  // the same words in the same order (a gap after a wide glyph read as no
  // space: "Euros -B 421")
  if (spilled && !spillReadsBack(mupdf, scratch(), P, drawRows, layout.map((row) => row.items.map((p) => items[p.i])))) return refuse('spill-blocked')

  // removal rects per stext line; thin where a thick band would touch other text
  const rects = []
  for (const li of g.rows.slice(r0, last + 1).flatMap((r) => r.lines)) {
    const cs = P.lines[li].chars.filter((c) => c.c.trim() && !ownChars.has(c))
    if (!cs.length) continue
    let rs = null
    for (const thin of [false, true]) {
      rs = glyphRects(cs, P.lines[li].dir, thin)
      if (!rs.some((r) => others.some((c) => overlaps(qbox(c.quad), r)))) break
      rs = null
    }
    if (!rs) return refuse('tight-lines')
    rects.push(...rs)
  }
  const bad = removeGlyphs(mupdf, doc, P, rects, new Set([...winChars, ...ownChars]), others, spans, removed)
  if (bad) return refuse(bad)

  // draw: one tagged span per line; ActualText only on shaped-script fallbacks
  const p2 = doc.loadPage(P.idx)
  const pobj = p2.getObject()
  const res = ownResources(doc, pobj)
  const fontNames = new Map()
  const fontName = (ref) => {
    const k = ref.isIndirect() ? ref.asIndirect() : ref
    if (!fontNames.has(k)) {
      const fd = subDict(doc, res, 'Font')
      const name = freeName(fd, 'SPDFEdit')
      fd.put(name, ref)
      fontNames.set(k, name)
    }
    return fontNames.get(k)
  }
  let gs = ''
  if (alpha < 0.999) {
    const gd = subDict(doc, res, 'ExtGState')
    const name = freeName(gd, 'SPDFEditGs')
    const st = doc.newDictionary()
    st.put('Type', doc.newName('ExtGState'))
    st.put('ca', f4(alpha))
    st.put('CA', f4(alpha))
    gd.put(name, doc.addObject(st))
    gs = `/${name} gs `
  }
  const { content, boxes } = drawRows(fontName, (f) => {
    const xd = subDict(doc, res, 'XObject')
    const name = freeName(xd, 'SPDFEditFx')
    xd.put(name, f.form)
    return name
  }, gs)
  rep.order = placeContent(mupdf, doc, P, pobj, content, new Set([...chars, ...ownChars]))
  p2.destroy?.()

  const used = (layout ?? []).flatMap((row) => row.items.map((p) => items[p.i]))
  const kinds = new Set(used.map((it) => (it.kind === 'form' ? 'fallback' : 'original')))
  rep.font = !used.length ? null : kinds.size > 1 ? 'mixed' : [...kinds][0]
  const fl = [...forms.values()]
  const names = [...new Set(fl.flatMap((f) => f.name.split(' + ')))]
  rep.fallbackName = names.length ? names.join(' + ') + (fl.some((f) => f.bold && !/bold/i.test(f.name)) ? ' (synthetic bold)' : '') : null
  // lines of the whole paragraph after the edit; the window replaced lines r0..last
  rep.lines = n0 - (last - r0 + 1) + (layout?.length ?? 0)
  rep.window = [r0, last]
  // underline / strike lines drawn over the old lines stay where they were
  rep.decorations = decor.length > 0
  rep.fit = scale !== 1 ? f4(scale) : null
  rep.overflow = (layout?.length ?? 0) > last - r0 + 1 || scale !== 1
  rep.box = boxes.length ? toView(unionBox(boxes), P.bounds) : null
  rep.changedBox = toView(unionBox([grow(unionBox(winChars.map((c) => qbox(c.quad))), 0.5), ...boxes]), P.bounds)
  if (spilled) {
    rep.overflow = false
    rep.spill = { lines: spilled.delta, moved: layout.filter((x) => x.kept != null).length }
  }
  return 1
}

// A page region (page space) renders as one flat colour: nothing drawn
// there (a cell fill or the paper itself is fine).
function stripBlank(mupdf, page, box) {
  const k = 2
  const r = [Math.floor(box[0] * k), Math.floor(box[1] * k), Math.ceil(box[2] * k), Math.ceil(box[3] * k)]
  if (r[2] <= r[0] || r[3] <= r[1]) return true
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, r, false)
  let px
  try {
    pix.clear(255)
    const dev = new mupdf.DrawDevice(mupdf.Matrix.scale(k, k), pix)
    try {
      page.run(dev, mupdf.Matrix.identity)
    } finally {
      dev.close()
      dev.destroy?.()
    }
    px = new Uint8Array(pix.getPixels()) // copy at once: a view on WASM memory
  } finally {
    pix.destroy?.()
  }
  const c = [px[0], px[1], px[2]]
  for (let i = 0; i < px.length; i += 3) if (Math.abs(px[i] - c[0]) > 24 || Math.abs(px[i + 1] - c[1]) > 24 || Math.abs(px[i + 2] - c[2]) > 24) return false
  return true
}

// Widget and annotation rects (page space): new lines stay clear of them.
function annotRects(P, links = false) {
  const out = []
  try {
    for (const w of P.page.getWidgets()) out.push(w.getBounds())
  } catch {
    /* none */
  }
  try {
    for (const a of P.page.getAnnotations()) if (a.getType() !== 'Redact') out.push(a.getBounds())
  } catch {
    /* none */
  }
  // links are not annotations to MuPDF; a link left over moved text points wrong
  try {
    if (links) for (const l of P.page.getLinks()) out.push(l.getBounds())
  } catch {
    /* none */
  }
  return out.map((r) => [...r])
}

// Text matrix (PDF user space) for a point and direction in page space.
function tmFor(page) {
  const Ti = inv(page.getTransform())
  return (o, dir) => {
    const du = norm(applyV(Ti, dir))
    const uu = norm(applyV(Ti, [dir[1], -dir[0]]))
    const ou = apply(Ti, o)
    return [du[0], du[1], uu[0], uu[1], ou[0], ou[1]]
  }
}

// Reading order: copy and search read content in drawing order, so text
// appended at the end reads last. Put the new draw where the old text was
// read: at a point of the (redacted) content after the text read before the
// edit and before the text read after it. Points: between operators at any
// q depth whose open levels set no clip, ExtGState, d0/d1 or unknown cm
// (the CTM there is undone), outside BX/EX and marked content; or inside a
// text object right before a line move (the line matrix is put back). Other
// state from open levels (dash, line width, colours) can reach the insert:
// the draw sets its own fill colour and text state, and the page must
// render the same (2x, MuPDF) as with the draw appended, else it is appended.
// gone: the removed glyphs (P.lines chars). -> 'inline' | 'appended'
function placeContent(mupdf, doc, P, pobj, content, gone) {
  if (!content) return null
  const original = pobj.get('Contents')
  const append = () => {
    pobj.put('Contents', original)
    appendContent(doc, pobj, content)
    return 'appended'
  }
  try {
    // reading-order neighbours in the source: last kept glyphs before the
    // first removed one, first kept glyphs after the last removed one
    const all = P.lines.flatMap((l) => l.chars.filter((c) => c.c.trim()))
    const idx = all.map((c, i) => (gone.has(c) ? i : -1)).filter((i) => i >= 0)
    if (!idx.length) return append()
    const kept = (c) => !gone.has(c)
    const before = all.slice(0, idx[0]).filter(kept).slice(-3)
    const after = all.slice(idx[idx.length - 1] + 1).filter(kept).slice(0, 3)
    const key = (o) => `${Math.round(o[0] * 10)},${Math.round(o[1] * 10)}`
    const old = asList(pobj.get('Contents')).filter((r) => r.isStream())
    const parts = old.map((r) => takeBytes(r.readStream()))
    const b = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, 0))
    let o = 0
    for (const p of parts) {
      b.set(p, o)
      b[o + p.length] = 10
      o += p.length + 1
    }
    // cut points and the CTM there. A q level that set a clip or an
    // ExtGState is not reasoned about: no cuts while it is open.
    const cuts = [{ at: 0, ctm: [1, 0, 0, 1, 0, 0] }]
    const stack = [{ ctm: [1, 0, 0, 1, 0, 0], dirty: false }]
    let bt = false
    let bx = 0
    let mc = 0
    const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]]
    let inImage = false
    // inside a text object (pdfTeX draws a page in one BT): a cut right
    // before a line move (Td TD Tm T*), where the line matrix is known
    // without glyph widths; the insert closes the BT and sets it back
    let tlm = null
    let tl = 0
    let tlKnown = true
    const nums = (op) => (op.operands.every((x) => x.type === 'num') ? op.operands.map((x) => x.value) : null)
    for (const op of contentOps(b)) {
      const k = op.op
      const cur = stack[stack.length - 1]
      if (k === 'BI') inImage = true
      else if (k === 'EI') inImage = false
      if (inImage) continue
      if (bt && !cur.dirty && !bx && !mc && tlm && (k === 'Td' || k === 'TD' || k === 'Tm' || (k === 'T*' && tlKnown))) cuts.push({ at: op.start, ctm: cur.ctm.slice(), tlm: tlm.slice() })
      if (k === 'TL') {
        const v = nums(op)
        if (v) tl = v[0]
        else tlKnown = false
      } else if (bt && (k === 'Td' || k === 'TD')) {
        const v = nums(op)
        tlm = v && tlm ? mul([1, 0, 0, 1, v[0], v[1]], tlm) : null
        if (k === 'TD' && v) tl = -v[1]
      } else if (bt && k === 'Tm') {
        const v = nums(op)
        tlm = v && v.length === 6 ? v : null
      } else if (bt && k === 'T*') tlm = tlm && tlKnown ? mul([1, 0, 0, 1, 0, -tl], tlm) : null
      else if (bt && (k === "'" || k === '"')) tlm = null
      if (k === 'q') stack.push({ ctm: cur.ctm.slice(), dirty: cur.dirty })
      else if (k === 'Q') {
        if (stack.length > 1) stack.pop()
        // TL set inside a level that closed: not known any more
        tlKnown = false
      } else if (k === 'BT') {
        bt = true
        tlm = [1, 0, 0, 1, 0, 0]
      } else if (k === 'ET') bt = false
      else if (k === 'BX') bx++
      else if (k === 'EX') bx = Math.max(0, bx - 1)
      else if (k === 'BDC' || k === 'BMC') mc++
      else if (k === 'EMC') mc = Math.max(0, mc - 1)
      else if (!bt && k === 'cm') {
        const v = nums(op)
        if (v && v.length === 6) cur.ctm = mul(v, cur.ctm)
        else cur.dirty = true
      } else if (k === 'W' || k === 'W*' || k === 'gs' || k === 'd0' || k === 'd1') cur.dirty = true
      const now = stack[stack.length - 1]
      if (!bt && !bx && !mc && !now.dirty) cuts.push({ at: op.end, ctm: now.ctm.slice() })
    }
    if (cuts.length < 2) return append()
    // which glyphs a prefix of the content draws
    const probe = doc.addStream('', {})
    const drawn = (at) => {
      // a prefix that stops inside a text object gets its ET
      const tail = cuts.find((c) => c.at === at)?.tlm ? new TextEncoder().encode('\nET\n') : new Uint8Array(0)
      const pre = new Uint8Array(at + tail.length)
      pre.set(b.subarray(0, at), 0)
      pre.set(tail, at)
      probe.writeStream(pre)
      pobj.put('Contents', probe)
      const pg = doc.loadPage(P.idx)
      const seen = new Set()
      const st = pg.toStructuredText('preserve-whitespace')
      try {
        st.walk({
          onChar(c, origin, font) {
            font.constructor._finalizer?.unregister(font)
            if (c.trim()) seen.add(key(origin))
          },
        })
      } finally {
        st.destroy?.()
        pg.destroy?.()
      }
      return seen
    }
    const has = (set, cs) => cs.every((c) => set.has(key(c.origin)))
    const none = (set, cs) => cs.every((c) => !set.has(key(c.origin)))
    // smallest cut whose prefix draws all of `before`
    let lo = 0
    let hi = cuts.length - 1
    if (before.length) {
      if (!has(drawn(cuts[hi].at), before)) hi = -1
      while (hi >= 0 && lo < hi) {
        const mid = (lo + hi) >> 1
        if (has(drawn(cuts[mid].at), before)) hi = mid
        else lo = mid + 1
      }
    } else hi = 0
    const pick = hi >= 0 ? cuts[hi] : null
    if (!pick || (after.length && !none(drawn(pick.at), after))) return append()
    // the draw at that point: CTM undone, text state set back to defaults
    const undo = inv(pick.ctm)
    const draw = `\nq ${undo.map(f4).join(' ')} cm 0 Tc 0 Tw 100 Tz 0 TL 0 Ts 0 Tr\n${content}Q\n`
    const block = pick.tlm ? `\nET${draw}BT ${pick.tlm.map(f4).join(' ')} Tm\n` : draw
    const enc = new TextEncoder()
    const ins = enc.encode(block)
    const inline = new Uint8Array(b.length + ins.length)
    inline.set(b.subarray(0, pick.at), 0)
    inline.set(ins, pick.at)
    inline.set(b.subarray(pick.at), pick.at + ins.length)
    // same pixels as the appended draw, else append
    const render = () => {
      const pg = doc.loadPage(P.idx)
      try {
        const pix = pg.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true)
        const px = new Uint8Array(pix.getPixels())
        pix.destroy?.()
        return px
      } finally {
        pg.destroy?.()
      }
    }
    probe.writeStream(inline)
    pobj.put('Contents', probe)
    const a = render()
    append()
    const z = render()
    let same = a.length === z.length
    for (let i = 0; same && i < a.length; i++) if (Math.abs(a[i] - z[i]) > 8) same = false
    if (!same) return 'appended'
    pobj.put('Contents', probe)
    return 'inline'
  } catch {
    return append()
  }
}

// New content goes after the page's own, which is wrapped in q ... Q.
function appendContent(doc, pobj, content) {
  if (!content) return
  const old = pobj.get('Contents')
  const arr = doc.newArray()
  arr.push(doc.addStream('q\n', {}))
  if (old.isArray()) for (let i = 0; i < old.length; i++) arr.push(old.get(i))
  else if (!old.isNull()) arr.push(old)
  arr.push(doc.addStream('\nQ\n', {}))
  arr.push(doc.addStream(`q\n${content}Q\n`, {}))
  pobj.put('Contents', arr)
}

// The removal both edit kinds share: our own earlier draws cut out whole,
// text-only redaction of `rects`, inline images put back, then every glyph
// in `others` must still be there and every one in `gone` gone, else the
// page is put back as it was. olds: removed text, cut from ActualText/Alt.
// -> null, or the refusal reason ('tight-lines', 'inline-image').
function removeGlyphs(mupdf, doc, P, rects, gone, others, spans, olds) {
  const page = P.page
  const snapContents = P.obj.get('Contents')
  const snapStreams = asList(snapContents).filter((r) => r.isStream()).map((r) => [r, takeBytes(r.readStream())])
  const snapRes = P.obj.get('Resources')
  const resCopy = snapRes.isDictionary() ? doc.newDictionary() : null
  if (resCopy) snapRes.forEach((v, k) => resCopy.put(k, v.isDictionary() && !v.isIndirect() ? (() => {
    const d = doc.newDictionary()
    v.forEach((vv, kk) => d.put(kk, vv))
    return d
  })() : v))
  const formSnap = snapForms(P.obj)

  cutOwn(doc, P.obj, spans)
  const props = () => {
    const r = P.obj.getInheritable('Resources')
    return r.isDictionary() ? r.get('Properties') : null
  }
  const marksBefore = markedShows(joinStreams(P.obj), props())
  for (const r of rects) page.createAnnotation('Redact').setRect(r)
  page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE)
  const inlineOk = restoreInline(P.obj, snapStreams.map(([, bytes]) => bytes)) && restoreFormInline(P.obj, formSnap)

  // every other glyph on the page must still be there, the edited ones gone
  const near = (list, c) => list.some((a) => a.c === c.c && Math.abs(a.origin[0] - c.origin[0]) < 0.1 && Math.abs(a.origin[1] - c.origin[1]) < 0.1)
  const after = readLines(page).flatMap((l) => l.chars.filter((c) => c.c.trim()))
  const lost = others.filter((c) => !near(after, c))
  const left = [...gone].filter((c) => (!c.c.trim() ? false : near(after, c)))
  if (lost.length || left.length || !inlineOk) {
    for (const [r, bytes] of snapStreams) r.writeStream(bytes)
    P.obj.put('Contents', snapContents)
    if (resCopy) P.obj.put('Resources', resCopy)
    else P.obj.delete('Resources')
    undoForms(formSnap)
    return inlineOk ? 'tight-lines' : 'inline-image'
  }
  // ActualText / Alt of the removed words must not stay behind
  // ActualText / Alt / E only where marked content lost glyphs in this edit
  const marksAfter = markedShows(joinStreams(P.obj), props())
  const same = marksAfter.length === marksBefore.length
  const lostIdx = new Set(same ? marksBefore.flatMap((e, i) => (marksAfter[i].shown < e.shown ? [i] : [])) : [])
  cleanPageMarked(P.obj, (i) => lostIdx.has(i))
  const mcids = new Set([...lostIdx].map((i) => marksBefore[i].mcid).filter((x) => x != null))
  cleanStruct(doc, P.obj, mcids, same ? null : olds)
  return null
}

// A dynamic XFA form: the form exists only as XFA (NeedsRendering, or no
// AcroForm fields besides signatures); the page content is just its "Please
// wait" page, and an edit would drop the form (same test as docOps dynamicXfa).
function dynamicXfa(doc) {
  const root = doc.getTrailer().get('Root')
  const af = root.get('AcroForm')
  if (!af.isDictionary() || af.get('XFA').isNull()) return false
  const nr = root.get('NeedsRendering')
  if (nr.isBoolean?.() && nr.asBoolean()) return true
  let fields = 0
  const walk = (arr, depth) => {
    if (!arr.isArray() || depth > 32) return
    for (let i = 0; i < arr.length; i++) {
      const fd = arr.get(i)
      if (!fd.isDictionary()) continue
      const kids = fd.get('Kids')
      const named = kids.isArray() && Array.from({ length: kids.length }, (_, k) => kids.get(k)).some((x) => x.isDictionary() && !x.get('T').isNull())
      if (named) walk(kids, depth + 1)
      else if (inheritable(fd, 'FT')?.toString() !== '/Sig') fields++
    }
  }
  walk(af.get('Fields'), 0)
  return fields === 0
}

// ---------- entry points ----------
// opts.paragraphs: also group paragraphs (costs a read of nearby pages for
// line-end hyphens); off by default.
export async function pageTextModel(bytes, pageNum, { paragraphs = false } = {}) {
  const mupdf = await getMupdf()
  const doc = openPdf(mupdf, bytes)
  try {
    const idx = pageNum - 1
    if (!(idx >= 0 && idx < doc.countPages())) throw new Error(`No page ${pageNum}.`)
    const P = readPage(mupdf, doc, idx)
    try {
      addUsage(usageFor(bytes), idx, P.lines)
      if (dynamicXfa(doc)) for (const r of P.runs) r.why = 'xfa-dynamic'
      const b = P.bounds
      return {
        page: { width: r2(b[2] - b[0]), height: r2(b[3] - b[1]), ...pageBoxes(P), scanned: P.scanned },
        signed: signedFields(doc).size > 0,
        runs: [...P.runs.map((r) => publicRun(P, r)), ...fieldRuns(P)],
        paragraphs: paragraphs ? paragraphsOf(P).map((g) => publicParagraph(P, g)) : [],
      }
    } finally {
      P.page.destroy?.()
      P.S?.doc.destroy?.()
    }
  } finally {
    doc.destroy?.()
  }
}

export async function isScanned(bytes, pageNum) {
  const mupdf = await getMupdf()
  const doc = openPdf(mupdf, bytes)
  try {
    const P = readPage(mupdf, doc, pageNum - 1)
    P.page.destroy?.()
    P.S?.doc.destroy?.()
    return P.scanned
  } finally {
    doc.destroy?.()
  }
}

// The save that makes an edited file safe to hand out: garbage collection
// drops the old content streams (with the old text) and every earlier
// version. The op never resolves the object walk, so MuPDF's compact-save
// bug does not apply; the two-pass save is the fallback if objstms trips
// over a gap in the xref. Compact (renumbered): plain `garbage` keeps a free
// xref slot for every object an edit made and dropped (placement probes,
// checks, about 30 per edit), so the file grew with each repeated edit.
function finalSave(mupdf, doc) {
  try {
    return takeBytes(doc.saveToBuffer('garbage=compact,compress,objstms'))
  } catch {
    const d2 = openPdf(mupdf, takeBytes(doc.saveToBuffer('garbage,compress')))
    try {
      return takeBytes(d2.saveToBuffer('garbage=compact,compress,objstms'))
    } finally {
      d2.destroy?.()
    }
  }
}

// Interactive edits: { final: false } (the default) saves fast, appending the
// change to the file; the old text is still inside until finalizeEdits runs.
// Use final: true, or finalizeEdits once before the file leaves the tool.
export async function editText(bytes, edits, { fit = false, final = false, spill = true } = {}) {
  const t0 = Date.now()
  const mupdf = await getMupdf()
  const report = edits.map((e) =>
    e.paragraphId != null
      ? { paragraphId: e.paragraphId, font: null, fallbackName: null, lines: 0, overflow: false, refused: null, fit: null, box: null, changedBox: null }
      : { runId: e.runId, wordIndex: e.wordIndex ?? null, font: null, fallbackName: null, overflow: false, noPush: null, refused: null, fit: null, shift: 0, pushed: 0, box: null, changedBox: null },
  )
  const doc = openPdf(mupdf, bytes)
  let S = null
  const scratch = () => {
    if (!S) {
      const d = new mupdf.PDFDocument()
      S = { doc: d }
    }
    return S
  }
  try {
    if (dynamicXfa(doc)) {
      for (const r of report) r.refused = 'xfa-dynamic'
      const total = Date.now() - t0
      return { bytes: copy(bytes), report, signatureRemoved: false, xfaRemoved: false, ms: { edit: total, save: 0, total } }
    }
    const usage = usageFor(bytes)
    const byPage = new Map()
    edits.forEach((e, k) => {
      const list = byPage.get(e.pageNum) ?? byPage.set(e.pageNum, []).get(e.pageNum)
      list.push({ e, rep: report[k] })
    })
    let applied = 0
    for (const [pageNum, list] of byPage) {
      if (!(pageNum >= 1 && pageNum <= doc.countPages())) {
        for (const x of list) x.rep.refused = 'not-found'
        continue
      }
      const P = readPage(mupdf, doc, pageNum - 1)
      try {
        // one paragraph edit per page per call; line edits on that page wait
        // for the next call (the paragraph changes their ids)
        const paras = list.filter((x) => x.e.paragraphId != null)
        if (paras.length) {
          for (const x of list) if (x !== paras[0]) x.rep.refused = 'conflict'
          applied += await editParagraph(mupdf, doc, P, paras[0], { fit }, usage, scratch)
        } else {
          // one line edit that does not fit its line: it spills onto new
          // lines (or an emptied line closes up); else as before
          const one = list.length === 1 && !fit && spill ? list[0] : null
          const init = one ? { ...one.rep } : null
          let plan = null
          const r = await editPage(mupdf, doc, P, list, { fit }, usage, scratch, one ? (t) => (plan = spillPlan(P, t)) != null : null)
          if (!r?.spill) applied += r
          else {
            const prep = {}
            if (await editParagraph(mupdf, doc, P, { e: { words: plan.words, diff: plan.diff }, rep: prep }, { fit }, usage, scratch, plan)) {
              for (const k of Object.keys(one.rep)) delete one.rep[k]
              Object.assign(one.rep, init, { font: prep.font, fallbackName: prep.fallbackName, box: prep.box, changedBox: prep.changedBox, order: prep.order, spill: prep.spill })
              applied += 1
            } else {
              for (const k of Object.keys(one.rep)) delete one.rep[k]
              Object.assign(one.rep, init)
              applied += await editPage(mupdf, doc, P, list, { fit }, usage, scratch)
              // the spill found no blank space below: say so
              if (one.rep.refused === 'no-room' && prep.refused === 'no-room') one.rep.refused = 'no-room-below'
            }
          }
        }
      } finally {
        P.page.destroy?.()
      P.S?.doc.destroy?.()
      }
    }
    if (!applied) {
      const total = Date.now() - t0
      return { bytes: copy(bytes), report, signatureRemoved: false, xfaRemoved: false, ms: { edit: total, save: 0, total } }
    }
    const signatureRemoved = dropSignatures(doc)
    // an XFA copy of the form keeps the old text (captions, labels): drop it
    // (the AcroForm fields stay; finalize then garbage-collects the packets)
    const af = doc.getTrailer().get('Root').get('AcroForm')
    const xfaRemoved = af.isDictionary() && !af.get('XFA').isNull()
    if (xfaRemoved) {
      af.delete('XFA')
      doc.getTrailer().get('Root').delete('NeedsRendering')
    }
    const tSave = Date.now()
    let out = null
    if (final) out = finalSave(mupdf, doc)
    else {
      try {
        out = takeBytes(doc.saveToBuffer('incremental'))
      } catch {
        out = takeBytes(doc.saveToBuffer('compress'))
      }
    }
    // the fonts of the edited file draw the same characters as before
    usageCache.set(fingerprint(out), usage)
    const end = Date.now()
    return { bytes: out, report, signatureRemoved, xfaRemoved, ms: { edit: tSave - t0, save: end - tSave, total: end - t0 } }
  } finally {
    S?.doc.destroy?.()
    doc.destroy?.()
  }
}

// Once, before an edited file leaves the tool: the garbage-collected save
// that drops every old version and loose object. -> { bytes, ms }
export async function finalizeEdits(bytes) {
  const t0 = Date.now()
  const mupdf = await getMupdf()
  const doc = openPdf(mupdf, bytes)
  try {
    const out = finalSave(mupdf, doc)
    return { bytes: out, ms: Date.now() - t0 }
  } finally {
    doc.destroy?.()
  }
}
