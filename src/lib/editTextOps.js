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
// 5. Every new run sits in an ActualText span, so complex scripts extract.
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
//            editable, why: null | 'scanned' | 'hidden' | 'vertical' | 'no-unicode'
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
// editText(bytes, edits, { fit = false, final = false })
//   -> { bytes, report, signatureRemoved, ms: { edit, save, total } (numbers) }
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
  const P = { page, obj, bounds, idx }
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
function sameFont(mupdf, P, chars, text, dir, { exact = false } = {}) {
  const sz = chars[0].size
  const orig = textOf(chars)
  const oneFont = chars.every((c) => c.font === chars[0].font)
  for (const info of fontDicts(mupdf, P, chars[0].font)) {
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
    if (!RTL.test(text)) content = `/Span <</ActualText <${utf16Hex(text)}>>> BDC\n${content}\nEMC\n`
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
function cleanMarked(b, olds, props) {
  const cuts = []
  const stack = []
  const hasOld = (v) => olds.some((w) => squashS(w) && squashS(v).includes(squashS(w)))
  for (const o of contentOps(b)) {
    if (o.op === 'BDC' || o.op === 'BMC') stack.push({ o, shows: 0 })
    else if (SHOWS.has(o.op)) stack.forEach((s) => s.shows++)
    else if (o.op === 'EMC') {
      const s = stack.pop()
      if (!s || s.o.op !== 'BDC') continue
      const strip = (v) => (s.shows === 0 && v.trim() !== '') || hasOld(v)
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
function cleanPageMarked(pobj, olds) {
  const seen = new Set()
  const fix = (ref, props) => {
    if (!ref.isStream()) return
    const out = cleanMarked(takeBytes(ref.readStream()), olds, props)
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
      fix(x, r.isDictionary() ? r.get('Properties') : null)
      walk(r)
    })
  }
  const res = pobj.getInheritable('Resources')
  for (const s of asList(pobj.get('Contents'))) fix(s, res.isDictionary() ? res.get('Properties') : null)
  walk(res)
}

// Our own earlier draws: /Span <</SPDFBox [x0 y0 x1 y1] ...>> BDC ... EMC in
// the page streams (box in MuPDF page space), with the resources they use.
function ownSpans(pobj) {
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
        const k = p.items.findIndex((x) => x.type === 'name' && x.value === 'SPDFBox')
        const arr = k >= 0 ? p.items[k + 1] : null
        if (arr?.type === 'array' && arr.items.length === 4) out.push({ ref, start: s.o.start, end: o.end, box: arr.items.map((x) => x.value), names: s.names })
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
        showGlyph(font, trm) {
          font.constructor._finalizer?.unregister(font)
          const k = key(apply(ctm, [trm[4], trm[5]]))
          const g = glyphs.get(k)
          glyphs.set(k, g && g.seq === seq ? { ...g, mode: `${g.mode}+${mode}` } : { seq, alpha, mode, clip })
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
  const paint = (box, alpha) => {
    seq++
    if (!masking && ga(alpha) >= 0.5) paints.push({ seq, box })
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
      paint(path.getBounds(null, ctm), alpha)
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
  return { glyph: (c) => glyphs.get(key(c.origin)) ?? null, paints }
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

// ---------- one page ----------
async function editPage(mupdf, doc, P, list, { fit }, usage, scratch) {
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
    let noPush = rtl ? 'rtl' : null
    // a whole line that is centred or right-aligned keeps that alignment
    const anchor = whole && !rtl ? (centred ? 'centre' : rightAligned ? 'right' : null) : null
    if (anchor) noPush = 'aligned'
    // shorter text pulls the rest of a left-aligned line back
    const pull = !centred && !rightAligned
    let s = 0
    if (!noPush) {
      for (let k = 0; k < group.length; k++) {
        const t = group[k]
        t.shift = s
        s = s + t.adv - (t.oldEnd - t.oldStart)
        if (!pull) s = Math.max(0, s)
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
        g.draw = noPush ? null : sameFont(mupdf, P, g.chars, textOf(g.chars), dir, { exact: true })
        if (!noPush && !g.draw) noPush = 'encoding'
      }
      // the stretch the line grows into must not be painted over either
      const from = Math.min(...group.map((t) => t.oldEnd))
      const tailEnd = lineMoves.length ? Math.max(...lineMoves[lineMoves.length - 1].chars.map((c) => along(c.quad, dir)[1])) + lineMoves[lineMoves.length - 1].shift : 0
      const to = Math.max(tailEnd, ...group.map((t) => t.oldStart + t.shift + t.adv))
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
    const endOf = () => {
      const tail = lineMoves.length ? lineMoves[lineMoves.length - 1] : null
      let e = tail ? Math.max(...tail.chars.map((c) => along(c.quad, dir)[1])) + tail.shift : lineEnd
      for (const t of group) e = Math.max(e, t.oldStart + t.shift + t.adv)
      return e
    }
    // pushing (or growing) into the next column would overprint it
    if (!noPush && endOf() > rowNext - 0.3) noPush = 'collision'
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
      // too narrow to read: refuse rather than squeeze
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
      else if (anchor === 'right' || t.rtl) t.start = t.oldEnd - t.adv
      else t.start = t.oldStart + t.shift
    }
    const newEnd = Math.max(endOf(), ...group.map((t) => t.start + t.adv))
    const newStart = Math.min(lineStart, ...group.map((t) => t.start))
    const past = newEnd > blockEnd + 0.5 || (newEnd > pageEnd && newEnd > lineEnd + 0.3) || newStart < pageStart + PAGE_MARGIN - 0.01
    for (const t of group) {
      const grew = t.adv > t.oldEnd - t.oldStart + 0.3
      const others = chars.filter((c, i) => c.c.trim() && (i < t.a || i > t.b))
      const hits = others.some((c) => {
        const [lo, hi] = along(c.quad, dir)
        return hi > t.start + 0.3 && lo < t.start + t.adv - 0.3 && !(lo >= t.oldMin - 0.3 && hi <= t.oldEnd + 0.3)
      })
      t.rep.overflow = (grew && (past || (t.rtl && hits))) || (noPush === 'collision' && t.scale < 1)
      t.rep.noPush = noPush
      t.rep.align = anchor
      t.rep.shift = r2(t.shift)
      t.rep.pushed = r2(lineMoves.filter((g) => line.chars.indexOf(g.chars[0]) > t.b).reduce((m, g) => (Math.abs(g.shift) > Math.abs(m) ? g.shift : m), 0))
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

  // snapshot, so a removal that took more than it should can be undone
  const snapContents = P.obj.get('Contents')
  const snapStreams = asList(snapContents).filter((r) => r.isStream()).map((r) => [r, takeBytes(r.readStream())])
  const snapRes = P.obj.get('Resources')
  const resCopy = snapRes.isDictionary() ? doc.newDictionary() : null
  if (resCopy) snapRes.forEach((v, k) => resCopy.put(k, v.isDictionary() && !v.isIndirect() ? (() => {
    const d = doc.newDictionary()
    v.forEach((vv, kk) => d.put(kk, vv))
    return d
  })() : v))

  cutOwn(doc, P.obj, targets.flatMap((t) => t.mine))
  for (const x of live) for (const r of x.rects) page.createAnnotation('Redact').setRect(r)
  page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE)
  const inlineOk = restoreInline(P.obj, snapStreams.map(([, bytes]) => bytes))

  // every other glyph on the page must still be there, the edited ones gone
  const near = (list, c) => list.some((a) => a.c === c.c && Math.abs(a.origin[0] - c.origin[0]) < 0.1 && Math.abs(a.origin[1] - c.origin[1]) < 0.1)
  const after = readLines(page).flatMap((l) => l.chars.filter((c) => c.c.trim()))
  const lost = others.filter((c) => !near(after, c))
  const left = [...gone].filter((c) => !c.c.trim() ? false : near(after, c))
  if (lost.length || left.length || !inlineOk) {
    for (const [r, bytes] of snapStreams) r.writeStream(bytes)
    P.obj.put('Contents', snapContents)
    if (resCopy) P.obj.put('Resources', resCopy)
    else P.obj.delete('Resources')
    for (const t of targets) t.rep.refused = inlineOk ? 'tight-lines' : 'inline-image'
    return 0
  }
  // ActualText / Alt of the removed words must not stay behind
  cleanPageMarked(P.obj, targets.flatMap((t) => [t.old, textOf(t.chars)]))
  const Ti = inv(page.getTransform())

  // draw the new text after the page content, each in a tagged span
  const p2 = doc.loadPage(P.idx)
  const pobj = p2.getObject()
  const res = ownResources(doc, pobj)
  let content = ''
  const tm = (o, dir) => {
    const du = norm(applyV(Ti, dir))
    const uu = norm(applyV(Ti, [dir[1], -dir[0]]))
    const ou = apply(Ti, o)
    return [du[0], du[1], uu[0], uu[1], ou[0], ou[1]]
  }
  const point = (t, d) => {
    const o = t.ch0.origin
    const k = d - dot(o, t.dir)
    return [o[0] + t.dir[0] * k, o[1] + t.dir[1] * k]
  }
  for (const t of targets) {
    const o = point(t, t.start)
    t.rep.font = t.draw ? (t.draw.kind === 'same' ? 'original' : 'fallback') : null
    // bundled Noto fonts are regular only: say so when the original was bold
    t.rep.fallbackName = t.draw?.kind === 'form' ? t.draw.name + (isBold(t.ch0.font) && !/bold/i.test(t.draw.name) ? ' (no bold version)' : '') : null
    t.rep.fit = t.scale !== 1 ? f4(t.scale) : null
    const nb = orientedBox(o, t.dir, t.adv, t.size)
    t.rep.box = toView(nb, P.bounds)
    const lineMoved = moved.filter((m) => t.line.chars.includes(m.chars[0]))
    const mb = lineMoved.map((m) => {
      const bx = unionBox(m.chars.map((c) => qbox(c.quad)))
      return unionBox([bx, [bx[0] + t.dir[0] * m.shift, bx[1] + t.dir[1] * m.shift, bx[2] + t.dir[0] * m.shift, bx[3] + t.dir[1] * m.shift]])
    })
    t.rep.changedBox = toView(unionBox([unionBox(t.chars.map((c) => qbox(c.quad))), nb, ...mb]), P.bounds)
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
      content += `/Span <</ActualText <${utf16Hex(t.text)}> ${tag}>> BDC\nq ${gs}BT /${name} ${f4(t.size)} Tf ${f4(t.draw.tc)} Tc ${f4(t.scale * 100)} Tz ${colorOp(t.ch0.color)} ${m.map(f4).join(' ')} Tm <${hexOf(t.draw.info, t.draw.codes)}> Tj ET Q\nEMC\n`
    } else {
      const xd = subDict(doc, res, 'XObject')
      const name = freeName(xd, 'SPDFEditFx')
      xd.put(name, t.draw.form)
      const cm = [m[0] * t.scale, m[1] * t.scale, m[2], m[3], m[4], m[5]]
      // the form carries its own ActualText span
      content += `/Span <<${tag}>> BDC\nq ${gs}${colorOp(t.ch0.color)} ${cm.map(f4).join(' ')} cm /${name} Do Q\nEMC\n`
    }
  }
  for (const g of moved) {
    const c0 = g.chars[0]
    const dir = g.dir
    const o = [c0.origin[0] + dir[0] * g.shift, c0.origin[1] + dir[1] * g.shift]
    const fd = subDict(doc, res, 'Font')
    const name = freeName(fd, 'SPDFEdit')
    fd.put(name, g.draw.ref)
    content += `BT /${name} ${f4(g.size)} Tf 0 Tc ${colorOp(c0.color)} ${tm(o, dir).map(f4).join(' ')} Tm [${g.draw.tj}] TJ ET\n`
  }
  if (content) {
    const old = pobj.get('Contents')
    const arr = doc.newArray()
    arr.push(doc.addStream('q\n', {}))
    if (old.isArray()) for (let i = 0; i < old.length; i++) arr.push(old.get(i))
    else if (!old.isNull()) arr.push(old)
    arr.push(doc.addStream('\nQ\n', {}))
    arr.push(doc.addStream(`q\n${content}Q\n`, {}))
    pobj.put('Contents', arr)
  }
  p2.destroy?.()
  return targets.length
}

// ---------- entry points ----------
export async function pageTextModel(bytes, pageNum) {
  const mupdf = await getMupdf()
  const doc = openPdf(mupdf, bytes)
  try {
    const idx = pageNum - 1
    if (!(idx >= 0 && idx < doc.countPages())) throw new Error(`No page ${pageNum}.`)
    const P = readPage(mupdf, doc, idx)
    try {
      addUsage(usageFor(bytes), idx, P.lines)
      const b = P.bounds
      return {
        page: { width: r2(b[2] - b[0]), height: r2(b[3] - b[1]), ...pageBoxes(P), scanned: P.scanned },
        signed: signedFields(doc).size > 0,
        runs: [...P.runs.map((r) => publicRun(P, r)), ...fieldRuns(P)],
      }
    } finally {
      P.page.destroy?.()
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
    return P.scanned
  } finally {
    doc.destroy?.()
  }
}

// The save that makes an edited file safe to hand out: garbage collection
// drops the old content streams (with the old text) and every earlier
// version. The op never resolves the object walk, so MuPDF's compact-save
// bug does not apply; the two-pass save is the fallback if objstms trips
// over a gap in the xref.
function finalSave(mupdf, doc) {
  try {
    return takeBytes(doc.saveToBuffer('garbage,compress,objstms'))
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
export async function editText(bytes, edits, { fit = false, final = false } = {}) {
  const t0 = Date.now()
  const mupdf = await getMupdf()
  const report = edits.map((e) => ({ runId: e.runId, wordIndex: e.wordIndex ?? null, font: null, fallbackName: null, overflow: false, noPush: null, refused: null, fit: null, shift: 0, pushed: 0, box: null, changedBox: null }))
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
        applied += await editPage(mupdf, doc, P, list, { fit }, usage, scratch)
      } finally {
        P.page.destroy?.()
      }
    }
    if (!applied) {
      const total = Date.now() - t0
      return { bytes: copy(bytes), report, signatureRemoved: false, ms: { edit: total, save: 0, total } }
    }
    const signatureRemoved = dropSignatures(doc)
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
    return { bytes: out, report, signatureRemoved, ms: { edit: tSave - t0, save: end - tSave, total: end - t0 } }
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
