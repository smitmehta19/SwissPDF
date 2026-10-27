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
// 6. Saved with garbage collection so the old text is really gone from the file.
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
//                 | 'type3' | 'form-field' | 'comment',
//            words: [{ i, text, bbox }] }] }
//   One run = one line. Run ids hold only for the bytes they came from: read
//   the model again after every edit.
//
// editText(bytes, edits, { fit = false }) -> { bytes, report, signatureRemoved }
//   edits: [{ pageNum, runId, wordIndex (null = whole line), text, old? }]
//     old: optional, the text the UI thinks it replaces ('stale' if not).
//   report (same order as edits): [{ runId, wordIndex,
//     font: 'original' | 'fallback' | null (deleted), fallbackName,
//     overflow, refused: null | reason, char (for 'unsupported-char'),
//     fit (scale used or null), shift (pt this edit's start moved: an earlier
//     edit on the line pushed it), pushed (pt the text after it moved),
//     box (new text), changedBox (old + new + moved text) }]
//   Refusal reasons: the run's why, or 'not-found', 'stale', 'conflict',
//   'no-unicode', 'unsupported-char'. Other edits still apply.
//
// isScanned(bytes, pageNum) -> boolean
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
// Char -> { c, origin, font, size, quad, color }; lines with their block box.
function readLines(page) {
  const lines = []
  let block = null
  let cur = null
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
        cur.chars.push({ c, origin: [origin[0], origin[1]], font: font.getName(), size, quad: [...quad], color: [...color] })
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
    words: run.words.map((w, i) => ({ i, text: textOf(chars.slice(w.a, w.b + 1)), bbox: toView(unionBox(chars.slice(w.a, w.b + 1).map((c) => qbox(c.quad))), b) })),
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
  let h = 2166136261 ^ b.length
  const step = Math.max(1, Math.floor(b.length / 8192))
  for (let i = 0; i < b.length; i += step) h = Math.imul(h ^ b[i], 16777619)
  for (let i = Math.max(0, b.length - 4096); i < b.length; i++) h = Math.imul(h ^ b[i], 16777619)
  return `${b.length}:${h >>> 0}`
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
// 40 pages. Scans lazily and stops as soon as all are found.
function proveUse(doc, usage, font, need) {
  const missing = () => need.filter((c) => !usage.byFont.get(font)?.has(c))
  if (!missing().length) return true
  const n = Math.min(doc.countPages(), 40)
  const t0 = Date.now()
  for (let i = 0; i < n && missing().length && Date.now() - t0 < 300; i++) {
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

// Draws the new text alone on a scratch page and checks each glyph left ink
// (a subset can map a char to an empty or missing glyph and text checks
// would not notice). Fallback text: some ink at all.
function inkOk(mupdf, doc, draw, size) {
  const k = Math.max(3, 24 / size)
  const W = draw.adv + 2 * size
  const H = 2.5 * size
  const res = doc.newDictionary()
  let content
  if (draw.kind === 'same') {
    const fd = doc.newDictionary()
    fd.put('F', draw.ref)
    res.put('Font', fd)
    content = `BT /F ${f4(size)} Tf ${f4(draw.tc)} Tc 0 g 1 0 0 1 ${f4(size)} ${f4(0.8 * size)} Tm <${hexOf(draw.info, draw.codes)}> Tj ET`
  } else {
    const xo = doc.newDictionary()
    xo.put('X', draw.form)
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

// ---------- one page ----------
async function editPage(mupdf, doc, P, list, { fit }, usage) {
  addUsage(usage, P.idx, P.lines)
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
    const chars = line.chars.slice(a, b + 1)
    const old = textOf(chars)
    if (e.old != null && String(e.old) !== old) {
      rep.refused = 'stale'
      continue
    }
    if (chars.some((c) => BAD_CHAR.test(c.c))) {
      rep.refused = 'no-unicode'
      continue
    }
    if (targets.some((t) => t.li === run.li && t.a <= b && a <= t.b)) {
      rep.refused = 'conflict'
      continue
    }
    const text = String(e.text ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .normalize('NFC')
    targets.push({ rep, li: run.li, line, a, b, chars, old, text, dir: line.dir, size: chars.find((c) => c.c.trim()).size })
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
    if (!force && !complex) {
      const need = [...new Set([...t.text].filter((c) => c.trim()))]
      if (proveUse(doc, usage, ch0.font, need)) t.draw = sameFont(mupdf, P, t.chars.filter((c) => c.font === ch0.font), t.text, t.dir)
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
      if (t.draw && !inkOk(mupdf, doc, t.draw, t.size)) {
        const was = t.draw.kind
        await plan(t, true)
        if (was !== 'same' || !inkOk(mupdf, doc, t.draw, t.size)) throw Object.assign(new Error('no ink'), { code: 'NO_INK' })
      }
    } catch (err) {
      t.rep.refused = err.code === 'UNSUPPORTED_CHAR' ? 'unsupported-char' : err.code === 'NO_INK' ? 'no-glyph' : 'draw-failed'
      if (err.char) t.rep.char = err.char
      targets.splice(targets.indexOf(t), 1)
    }
  }
  if (!targets.length) return 0

  // per line: squeeze (fit) or push the rest of the line right
  const moved = []
  const lines = new Map()
  for (const t of targets) (lines.get(t.li) ?? lines.set(t.li, []).get(t.li)).push(t)
  for (const group of lines.values()) {
    group.sort((x, y) => x.a - y.a)
    const line = group[0].line
    const dir = line.dir
    const chars = line.chars
    for (const t of group) {
      t.scale = 1
      const oldAdv = t.oldEnd - t.oldStart
      if (fit && t.adv > oldAdv + 0.01 && t.adv > 0) {
        t.scale = oldAdv / t.adv
        t.adv = oldAdv
      }
      t.shift = 0
    }
    const rtl = group.some((t) => t.rtl)
    const lineMoves = []
    let ok = !rtl
    let s = 0
    if (ok) {
      for (let k = 0; k < group.length; k++) {
        const t = group[k]
        t.shift = s
        s = Math.max(0, s + t.adv - (t.oldEnd - t.oldStart))
        const to = k + 1 < group.length ? group[k + 1].a - 1 : chars.length - 1
        if (s <= 0.3) continue
        let g = null
        for (let i = t.b + 1; i <= to; i++) {
          const c = chars[i]
          if (!c.c.trim()) {
            g = null
            continue
          }
          if (!g || g.font !== c.font || Math.abs(g.size - c.size) > 0.01) {
            g = { font: c.font, size: c.size, chars: [], shift: s, dir }
            lineMoves.push(g)
          }
          g.chars.push(c)
        }
      }
      for (const g of lineMoves) {
        g.draw = sameFont(mupdf, P, g.chars, textOf(g.chars), dir, { exact: true })
        if (!g.draw) ok = false
      }
    }
    if (!ok) {
      for (const t of group) t.shift = 0
      lineMoves.length = 0
    }
    moved.push(...lineMoves)
    // overflow: past the column (block) or the page, or over the next glyph
    const vis = chars.filter((c) => c.c.trim())
    const lineEnd = Math.max(...vis.map((c) => along(c.quad, dir)[1]))
    const blockEnd = line.block ? Math.max(...[[line.block[0], line.block[1]], [line.block[2], line.block[1]], [line.block[0], line.block[3]], [line.block[2], line.block[3]]].map((p) => dot(p, dir))) : lineEnd
    const b = P.bounds
    const pageEnd = Math.max(...[[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map((p) => dot(p, dir)))
    const tail = lineMoves.length ? lineMoves[lineMoves.length - 1] : null
    let newEnd = tail ? Math.max(...tail.chars.map((c) => along(c.quad, dir)[1])) + tail.shift : lineEnd
    for (const t of group) {
      t.start = t.rtl ? t.oldEnd - t.adv : t.oldStart + t.shift
      newEnd = Math.max(newEnd, t.start + t.adv)
    }
    const past = newEnd > Math.max(lineEnd, blockEnd) + 0.5 || newEnd > pageEnd + 0.01
    for (const t of group) {
      const grew = t.adv > t.oldEnd - t.oldStart + 0.3
      const others = chars.filter((c, i) => c.c.trim() && (i < t.a || i > t.b))
      const hits = others.some((c) => {
        const [lo, hi] = along(c.quad, dir)
        return hi > t.start + 0.3 && lo < t.start + t.adv - 0.3 && !(lo >= t.oldMin - 0.3 && hi <= t.oldEnd + 0.3)
      })
      t.rep.overflow = grew && (past || (!ok && hits) || (t.rtl && hits))
      t.rep.shift = r2(t.shift)
      t.rep.pushed = r2(lineMoves.filter((g) => line.chars.indexOf(g.chars[0]) > t.b).reduce((m, g) => Math.max(m, g.shift), 0))
    }
  }

  // remove the old glyphs (and the ones that move)
  const page = P.page
  const bands = [...targets.map((t) => [t.chars.filter((c) => c.c.trim()), t.dir]), ...moved.map((m) => [m.chars, m.dir])]
  for (const [set, dir] of bands) if (set.length) page.createAnnotation('Redact').setRect(redactBand(set, dir))
  page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE)
  const Ti = inv(page.getTransform())
  page.destroy?.()

  // draw: [q old Q] then the new text
  const p2 = doc.loadPage(P.idx)
  const pobj = p2.getObject()
  const res = ownResources(doc, pobj)
  let content = ''
  const tm = (o, dir, size) => {
    const du = norm(applyV(Ti, dir))
    const uu = norm(applyV(Ti, [dir[1], -dir[0]]))
    const ou = apply(Ti, o)
    return { m: [du[0], du[1], uu[0], uu[1], ou[0], ou[1]], du, uu, ou, size }
  }
  const point = (t, d) => {
    const o = t.ch0.origin
    const k = d - dot(o, t.dir)
    return [o[0] + t.dir[0] * k, o[1] + t.dir[1] * k]
  }
  for (const t of targets) {
    const o = point(t, t.start)
    t.rep.font = t.draw ? (t.draw.kind === 'same' ? 'original' : 'fallback') : null
    t.rep.fallbackName = t.draw?.kind === 'form' ? t.draw.name : null
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
    const { m, size } = tm(o, t.dir, t.size)
    const col = colorOp(t.ch0.color)
    const span = `/Span <</ActualText <${utf16Hex(t.text)}>>> BDC\n`
    if (t.draw.kind === 'same') {
      const fd = subDict(doc, res, 'Font')
      const name = freeName(fd, 'SPDFEdit')
      fd.put(name, t.draw.ref)
      content += `${span}BT /${name} ${f4(size)} Tf ${f4(t.draw.tc)} Tc ${f4(t.scale * 100)} Tz ${col} ${m.map(f4).join(' ')} Tm <${hexOf(t.draw.info, t.draw.codes)}> Tj ET\nEMC\n`
    } else {
      const xd = subDict(doc, res, 'XObject')
      const name = freeName(xd, 'SPDFEditFx')
      xd.put(name, t.draw.form)
      const cm = [m[0] * t.scale, m[1] * t.scale, m[2], m[3], m[4], m[5]]
      // the form carries its own ActualText span
      content += `q ${col} ${cm.map(f4).join(' ')} cm /${name} Do Q\n`
    }
  }
  for (const g of moved) {
    const c0 = g.chars[0]
    const dir = g.dir
    const o = [c0.origin[0] + dir[0] * g.shift, c0.origin[1] + dir[1] * g.shift]
    const { m } = tm(o, dir, g.size)
    const fd = subDict(doc, res, 'Font')
    const name = freeName(fd, 'SPDFEdit')
    fd.put(name, g.draw.ref)
    content += `BT /${name} ${f4(g.size)} Tf 0 Tc ${colorOp(c0.color)} ${m.map(f4).join(' ')} Tm [${g.draw.tj}] TJ ET\n`
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

export async function editText(bytes, edits, { fit = false } = {}) {
  const t0 = Date.now()
  const mupdf = await getMupdf()
  const report = edits.map((e) => ({ runId: e.runId, wordIndex: e.wordIndex ?? null, font: null, fallbackName: null, overflow: false, refused: null, fit: null, shift: 0, box: null, changedBox: null }))
  const doc = openPdf(mupdf, bytes)
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
        applied += await editPage(mupdf, doc, P, list, { fit }, usage)
      } finally {
        P.page.destroy?.()
      }
    }
    if (!applied) return { bytes: copy(bytes), report, signatureRemoved: false }
    const signatureRemoved = dropSignatures(doc)
    // One garbage-collected save drops the old content streams (with the old
    // text). The op never resolves the object walk, so MuPDF's compact-save
    // bug does not apply; the two-pass save is the fallback if objstms
    // trips over a gap in the xref.
    const tSave = Date.now()
    let out
    try {
      out = takeBytes(doc.saveToBuffer('garbage,compress,objstms'))
    } catch {
      const d2 = openPdf(mupdf, takeBytes(doc.saveToBuffer('garbage,compress')))
      try {
        out = takeBytes(d2.saveToBuffer('garbage=compact,compress,objstms'))
      } finally {
        d2.destroy?.()
      }
    }
    return { bytes: out, report, signatureRemoved, ms: { edit: tSave - t0, save: Date.now() - tSave } }
  } finally {
    doc.destroy?.()
  }
}
