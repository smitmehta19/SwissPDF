// Font picking for text we write into PDFs. Plain Latin text uses the pdf-lib
// standard fonts (no file embedded). Anything WinAnsi cannot encode gets a
// self-hosted Noto font for its script (public/fonts, OFL), loaded on first
// use and subset on embed so only the used glyphs land in the output.
//
// Every character is checked against the font that will draw it. CJK falls
// back across the Chinese, Japanese and Korean subsets; a character no bundled
// font has throws an error naming it, so a save never carries empty boxes.
//
// Bidi follows the Unicode algorithm for one line without explicit embeddings
// (weak types, numbers, neutrals, reordering). fontkit shapes each run and
// reverses Arabic/Hebrew runs itself; other runs are put in visual order here.
import { StandardFonts } from 'pdf-lib'

const FILES = {
  latin: 'NotoSans-Regular.ttf', // Latin ext, Greek, Cyrillic, symbols
  symbols: 'NotoSansSymbols2-Regular.ttf', // arrows, dingbats, misc symbols
  arabic: 'NotoSansArabic-Regular.ttf',
  hebrew: 'NotoSansHebrew-Regular.ttf',
  deva: 'NotoSansDevanagari-Regular.ttf',
  beng: 'NotoSansBengali-Regular.ttf',
  taml: 'NotoSansTamil-Regular.ttf',
  thai: 'NotoSansThai-Regular.ttf',
  sc: 'NotoSansSC-Regular.ttf', // GB2312 set
  tc: 'NotoSansTC-Regular.ttf', // Big5 level 1
  jp: 'NotoSansJP-Regular.ttf', // JIS X 0208 set
  kr: 'NotoSansKR-Regular.ttf', // KS X 1001 Hangul
}
const LABEL = {
  latin: 'this',
  symbols: 'symbol',
  arabic: 'Arabic',
  hebrew: 'Hebrew',
  deva: 'Hindi',
  beng: 'Bengali',
  taml: 'Tamil',
  thai: 'Thai',
  sc: 'Chinese',
  tc: 'Chinese',
  jp: 'Japanese',
  kr: 'Korean',
}
const RTL = new Set(['arabic', 'hebrew'])

// Scripts with their own font, in the order fontForText prefers them.
const SCRIPTS = [
  ['arabic', /\p{Script=Arabic}/u],
  ['hebrew', /\p{Script=Hebrew}/u],
  ['deva', /\p{Script=Devanagari}/u],
  ['beng', /\p{Script=Bengali}/u],
  ['taml', /\p{Script=Tamil}/u],
  ['thai', /\p{Script=Thai}/u],
]
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3000-\u303f\u30fb\u30fc\uff00-\uffef]/u
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u
const HANGUL = /\p{Script=Hangul}/u
const CJK_FONTS = ['sc', 'tc', 'jp', 'kr']
const MARK = /\p{M}/u
const INVISIBLE = /[\p{Cf}\u180b-\u180f\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/u
const EMOJI = /\p{Extended_Pictographic}/u
const NEUTRAL = /[\s\p{P}\p{S}\p{N}]/u

function fontUrl(file) {
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
  return `${base}fonts/${file}`
}

function loadError(group) {
  return new Error(`Couldn't load the font for ${LABEL[group]} text. Check your connection and try again.`)
}

export function unsupportedChar(ch) {
  const cp = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
  const what = EMOJI.test(ch) ? 'Emoji are not supported yet' : 'No bundled font can draw this character'
  const err = new Error(`${what}: "${ch}" (U+${cp}). Remove it and try again.`)
  err.code = 'UNSUPPORTED_CHAR'
  err.char = ch
  return err
}

// Font file bytes are fetched once per session and shared by all documents.
const fileCache = new Map()
function loadFile(group) {
  const file = FILES[group]
  if (!fileCache.has(file)) {
    const p = (async () => {
      try {
        const res = await fetch(fontUrl(file))
        if (!res.ok) throw new Error(String(res.status))
        return new Uint8Array(await res.arrayBuffer())
      } catch {
        throw loadError(group)
      }
    })()
    p.catch(() => fileCache.delete(file))
    fileCache.set(file, p)
  }
  return fileCache.get(file)
}

// fontkit is large, so it loads only when a non-Latin font is needed. Its
// Indic/Universal shapers (Devanagari) expect a global regeneratorRuntime.
let fontkitPromise = null
const loadFontkit = () =>
  (fontkitPromise ??= (async () => {
    const rt = await import('regenerator-runtime')
    globalThis.regeneratorRuntime ??= rt.default ?? rt
    const m = await import('@pdf-lib/fontkit')
    return m.default ?? m
  })())

// Parsed fonts for coverage checks, shared by all documents.
const parsedCache = new Map()
function parsedFont(group) {
  if (!parsedCache.has(group)) {
    const p = Promise.all([loadFontkit(), loadFile(group)]).then(([fk, bytes]) => fk.create(bytes))
    p.catch(() => parsedCache.delete(group))
    parsedCache.set(group, p)
  }
  return parsedCache.get(group)
}

async function covers(group, ch) {
  return (await parsedFont(group)).hasGlyphForCodePoint(ch.codePointAt(0))
}

// Per document: embedded fonts by key.
const docFonts = new WeakMap()
function cacheFor(doc) {
  if (!docFonts.has(doc)) docFonts.set(doc, new Map())
  return docFonts.get(doc)
}

// Noto Arabic splits dots off letters in 'ccmp'; those extra glyphs have no
// Unicode mapping and come back as junk when text is copied. The precomposed
// letters shape and join the same, so ccmp stays off for Arabic.
const FEATURES = { arabic: { ccmp: false } }

async function embedCustom(doc, group) {
  const [fontkit, bytes] = await Promise.all([loadFontkit(), loadFile(group)])
  doc.registerFontkit(fontkit)
  return doc.embedFont(bytes, { subset: true, features: FEATURES[group] })
}

function embedGroup(doc, group, standard) {
  const cache = cacheFor(doc)
  const key = group === 'std' ? `std:${standard}` : group
  if (!cache.has(key)) {
    const p = group === 'std' ? doc.embedFont(standard) : embedCustom(doc, group)
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return cache.get(key)
}

const winAnsiCache = new Map()
function winAnsi(font, ch) {
  const key = `${font.name}:${ch}`
  if (!winAnsiCache.has(key)) {
    let ok = true
    try {
      font.encodeText(ch)
    } catch {
      ok = false
    }
    winAnsiCache.set(key, ok)
  }
  return winAnsiCache.get(key)
}

const scriptOf = (ch) => SCRIPTS.find(([, re]) => re.test(ch))?.[0] ?? null

// Kana means Japanese first, Hangul Korean first, else Chinese; then the
// rest in sc -> tc -> jp -> kr order.
function cjkOrder(text) {
  const first = KANA.test(text) ? 'jp' : HANGUL.test(text) ? 'kr' : 'sc'
  return [first, ...CJK_FONTS.filter((g) => g !== first)]
}

async function firstCovering(groups, ch) {
  for (const g of groups) if (await covers(g, ch)) return g
  return null
}

// One font group per character (null = neutral that std can draw, it joins a
// neighbouring run later; DROP = invisible character no font here has).
const DROP = 'drop'
async function assignGroups(chars, std, line) {
  const groups = chars.map((ch) => {
    if (winAnsi(std, ch)) return NEUTRAL.test(ch) ? null : 'std'
    return scriptOf(ch) ?? (CJK.test(ch) ? 'cjk' : INVISIBLE.test(ch) ? 'invisible' : MARK.test(ch) ? 'mark' : 'other')
  })

  // CJK: one font for the whole line when one covers it all, so the glyphs
  // match in style; per character fallback otherwise.
  const cjkAt = groups.flatMap((g, i) => (g === 'cjk' ? [i] : []))
  if (cjkAt.length) {
    const order = cjkOrder(line)
    let whole = null
    for (const g of order) {
      let all = true
      for (const i of cjkAt) if (!(await covers(g, chars[i]))) all = false
      if (all) {
        whole = g
        break
      }
    }
    for (const i of cjkAt) {
      const g = whole ?? (await firstCovering(order, chars[i]))
      if (!g) throw unsupportedChar(chars[i])
      groups[i] = g
    }
  }

  const present = [...new Set(groups.filter((g) => FILES[g]))]
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const g = groups[i]
    if (FILES[g]) {
      if (!(await covers(g, ch))) throw unsupportedChar(ch)
    } else if (g === 'other') {
      // emoji are in none of the CJK fonts: do not load them just to look
      const order = [...present, 'latin', 'symbols', ...(EMOJI.test(ch) ? [] : cjkOrder(line))]
      groups[i] = await firstCovering([...new Set(order)], ch)
      if (!groups[i]) throw unsupportedChar(ch)
    } else if (g === 'mark') {
      // combining mark: stays with its base; a std base moves to Noto Sans
      const prev = i > 0 ? groups[i - 1] : null
      if (FILES[prev] && (await covers(prev, ch))) groups[i] = prev
      else if (prev === 'std' && (await covers('latin', chars[i - 1])) && (await covers('latin', ch))) {
        groups[i - 1] = 'latin'
        groups[i] = 'latin'
      } else {
        groups[i] = await firstCovering(['latin', 'symbols'], ch)
        if (!groups[i]) throw unsupportedChar(ch)
      }
    } else if (g === 'invisible') {
      // joiners and variation selectors: keep only where the run font has them
      const prev = i > 0 ? groups[i - 1] : null
      groups[i] = FILES[prev] && (await covers(prev, ch)) ? prev : DROP
    }
  }
  return groups
}

// ---------- bidi (UAX #9, one line, no explicit embeddings) ----------
const MIRROR = { '(': ')', ')': '(', '<': '>', '>': '<', '[': ']', ']': '[', '{': '}', '}': '{', '\u00ab': '\u00bb', '\u00bb': '\u00ab', '\u2039': '\u203a', '\u203a': '\u2039' }
const AN_RE = /[\u0600-\u0605\u0660-\u0669\u066b\u066c\u06dd\u08e2\u{10e60}-\u{10e7e}]/u
const EN_RE = /[0-9\u00b2\u00b3\u00b9\u06f0-\u06f9\u2070\u2074-\u2079\u2080-\u2089\uff10-\uff19]/u
const ES_RE = /[+\-\u207a\u207b\u208a\u208b\u2212\ufe62\ufe63\uff0b\uff0d]/u
const ET_RE = /[#$%\u00a2-\u00a5\u00b0\u00b1\u0609\u060a\u066a\u2030-\u2034\u20a0-\u20cf\u212e\u2213\ufe5f\ufe69\ufe6a\uff03-\uff05\uffe0\uffe1\uffe5\uffe6\p{Sc}]/u
const CS_RE = /[,./:\u00a0\u060c\u202f\u2044\ufe50\ufe52\ufe55\uff0c\uff0e\uff0f\uff1a]/u

function bidiType(ch) {
  if (ch === '\u200e') return 'L'
  if (ch === '\u200f') return 'R'
  if (ch === '\u061c') return 'AL'
  if (AN_RE.test(ch)) return 'AN'
  if (/[\p{Mn}\p{Me}]/u.test(ch)) return 'NSM'
  if (EN_RE.test(ch)) return 'EN'
  if (ES_RE.test(ch)) return 'ES'
  if (CS_RE.test(ch)) return 'CS'
  if (ET_RE.test(ch)) return 'ET'
  if (/\p{Script=Hebrew}/u.test(ch)) return 'R'
  if (/[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}]/u.test(ch)) return 'AL'
  if (/[\p{Cf}\ufe00-\ufe0f]/u.test(ch)) return 'BN'
  if (/[\p{Zs}\u2028]/u.test(ch)) return 'WS'
  if (/[\p{P}\p{S}]/u.test(ch)) return 'ON'
  return 'L'
}

// Returns { levels (per character), rtl (paragraph direction) }.
export function bidiLevels(chars) {
  const all = chars.map(bidiType)
  const idx = all.flatMap((t, i) => (t === 'BN' ? [] : [i])) // X9: BN ignored
  const t = idx.map((i) => all[i])
  const n = t.length
  const first = t.find((x) => x === 'L' || x === 'R' || x === 'AL')
  const para = first === 'R' || first === 'AL' ? 1 : 0
  const sos = para ? 'R' : 'L'
  // W1-W3
  for (let i = 0; i < n; i++) if (t[i] === 'NSM') t[i] = i ? t[i - 1] : sos
  let strong = sos
  for (let i = 0; i < n; i++) {
    if (t[i] === 'L' || t[i] === 'R' || t[i] === 'AL') strong = t[i]
    else if (t[i] === 'EN' && strong === 'AL') t[i] = 'AN'
  }
  for (let i = 0; i < n; i++) if (t[i] === 'AL') t[i] = 'R'
  // W4: one separator inside a number joins it
  for (let i = 1; i < n - 1; i++) {
    if (t[i] === 'ES' && t[i - 1] === 'EN' && t[i + 1] === 'EN') t[i] = 'EN'
    else if (t[i] === 'CS' && t[i - 1] === t[i + 1] && (t[i - 1] === 'EN' || t[i - 1] === 'AN')) t[i] = t[i - 1]
  }
  // W5: terminators next to a number (%, currency) join it
  for (let i = 0; i < n; i++) {
    if (t[i] !== 'ET') continue
    let j = i
    while (j < n && t[j] === 'ET') j++
    if ((i > 0 && t[i - 1] === 'EN') || (j < n && t[j] === 'EN')) for (let k = i; k < j; k++) t[k] = 'EN'
    i = j - 1
  }
  // W6, W7
  for (let i = 0; i < n; i++) if (t[i] === 'ES' || t[i] === 'ET' || t[i] === 'CS') t[i] = 'ON'
  strong = sos
  for (let i = 0; i < n; i++) {
    if (t[i] === 'L' || t[i] === 'R') strong = t[i]
    else if (t[i] === 'EN' && strong === 'L') t[i] = 'L'
  }
  // N1, N2: neutrals take the direction around them, else the paragraph's
  const dir = (x) => (x === 'L' ? 'L' : 'R')
  const neutral = (x) => x === 'ON' || x === 'WS'
  for (let i = 0; i < n; i++) {
    if (!neutral(t[i])) continue
    let j = i
    while (j < n && neutral(t[j])) j++
    const before = i ? dir(t[i - 1]) : sos
    const after = j < n ? dir(t[j]) : sos
    const d = before === after ? before : sos
    for (let k = i; k < j; k++) t[k] = d
    i = j - 1
  }
  // I1, I2
  const lv = t.map((x) => (para ? (x === 'R' ? 1 : 2) : x === 'L' ? 0 : x === 'R' ? 1 : 2))
  // L1: trailing whitespace goes back to the paragraph level
  for (let k = n - 1; k >= 0 && all[idx[k]] === 'WS'; k--) lv[k] = para
  const levels = new Array(chars.length).fill(para)
  let last = para
  for (let i = 0, k = 0; i < chars.length; i++) {
    if (k < n && idx[k] === i) last = levels[i] = lv[k++]
    else levels[i] = last
  }
  return { levels, rtl: para === 1 }
}

// L2: reverse every maximal sequence at each level from the highest down.
function reorder(runs) {
  if (!runs.length) return runs
  const out = runs.slice()
  const max = Math.max(...out.map((r) => r.level))
  const minOdd = Math.min(...out.map((r) => r.level).filter((l) => l % 2), Infinity)
  for (let lvl = max; lvl >= minOdd && lvl > 0; lvl--) {
    for (let i = 0; i < out.length; i++) {
      if (out[i].level < lvl) continue
      let j = i
      while (j < out.length && out[j].level >= lvl) j++
      out.splice(i, j - i, ...out.slice(i, j).reverse())
      i = j
    }
  }
  return out
}

// Does fontkit reverse this run? It does when the first non-common
// character belongs to a right-to-left script.
function fontkitReverses(text) {
  const ch = [...text].find((c) => !/[\p{Script=Common}\p{Script=Inherited}]/u.test(c))
  return !!ch && /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u.test(ch)
}

// Splits one line into runs [{ text, font, rtl }] in visual (left to right)
// order; draw them with drawRuns. Throws if a character has no glyph in any
// bundled font, or if a font fails to load.
export async function layoutText(doc, text, { standard = StandardFonts.Helvetica } = {}) {
  const line = String(text ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .normalize('NFC')
  const std = await embedGroup(doc, 'std', standard)
  let chars = [...line]
  if (chars.every((ch) => winAnsi(std, ch))) return [{ text: line, font: std, rtl: false }]

  let groups = await assignGroups(chars, std, line)
  const keep = groups.map((g) => g !== DROP)
  chars = chars.filter((_, i) => keep[i])
  groups = groups.filter((_, i) => keep[i])
  const { levels } = bidiLevels(chars)

  // Neutrals (spaces, punctuation, digits) join the neighbour on their level.
  const strong = groups.slice()
  for (let i = 0; i < chars.length; i++) {
    if (groups[i]) continue
    let p = i - 1
    while (p >= 0 && !strong[p]) p--
    let q = i + 1
    while (q < chars.length && !strong[q]) q++
    let g = 'std'
    if (p >= 0 && levels[p] === levels[i]) g = strong[p]
    else if (q < chars.length && levels[q] === levels[i]) g = strong[q]
    if (g !== 'std' && !(await covers(g, chars[i]))) g = 'std'
    groups[i] = g
  }

  const fonts = new Map([['std', std]])
  for (const g of new Set(groups)) if (!fonts.has(g)) fonts.set(g, await embedGroup(doc, g, standard))

  const runs = []
  chars.forEach((ch, i) => {
    const last = runs[runs.length - 1]
    if (last && last.group === groups[i] && last.level === levels[i]) last.chars.push(ch)
    else runs.push({ group: groups[i], level: levels[i], chars: [ch] })
  })
  return reorder(runs).map((r) => {
    const odd = r.level % 2 === 1
    const logical = r.chars.join('')
    // fontkit reverses RTL-script runs itself; flip the rest by hand so each
    // run ends up in visual order (odd level = right to left)
    const flips = r.group !== 'std' && fontkitReverses(logical)
    const textOut = odd === flips ? logical : r.chars.slice().reverse().map((c) => (odd ? MIRROR[c] ?? c : c)).join('')
    return { text: textOut, font: fonts.get(r.group), rtl: odd }
  })
}

export function runsWidth(runs, size) {
  return runs.reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0)
}

export function runsHeight(runs, size) {
  return Math.max(...runs.map((r) => r.font.heightAtSize(size, { descender: false })))
}

// Draws runs along one baseline starting at (x, y), turned by `rotate`
// (a pdf-lib degrees() value). Other options pass through to drawText.
export function drawRuns(page, runs, { x, y, size, rotate, ...rest }) {
  const angle = ((rotate?.angle ?? 0) * Math.PI) / 180
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  let adv = 0
  for (const r of runs) {
    page.drawText(r.text, { ...rest, x: x + adv * c, y: y + adv * s, size, font: r.font, rotate })
    adv += r.font.widthOfTextAtSize(r.text, size)
  }
}

// One font for a whole string, for places that take a single font (form
// field appearances, OCR words). Tries the fonts of the scripts in the text
// first; CJK fonts also cover Latin, Greek and Cyrillic. Throws when no single
// bundled font has every character.
export async function fontForText(doc, text, { standard = StandardFonts.Helvetica } = {}) {
  const s = String(text ?? '').replace(/[\r\n\t]/g, '')
  const std = await embedGroup(doc, 'std', standard)
  const chars = [...s]
  if (chars.every((ch) => winAnsi(std, ch))) return std
  const need = [...new Set(chars)]
  const order = []
  if (chars.some((ch) => CJK.test(ch))) order.push(...cjkOrder(s))
  for (const [g, re] of SCRIPTS) if (re.test(s)) order.push(g)
  order.push('latin', 'symbols')
  for (const g of order) {
    let all = true
    for (const ch of need) if (!(await covers(g, ch))) all = false
    if (all) return embedGroup(doc, g, standard)
  }
  for (const ch of need) {
    if (!(await firstCovering(order, ch))) throw unsupportedChar(ch)
  }
  throw new Error('This text mixes scripts that no single font here can show. Use one script per field.')
}
