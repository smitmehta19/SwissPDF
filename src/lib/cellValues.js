// Text from a PDF cell -> typed spreadsheet cell (SheetJS cell object).
// Numbers, currency, percent, parentheses negatives, locale decimals and
// dates become real values with a number format; IDs stay text.

const CURRENCY = { $: '$', '€': '€', '£': '£', '¥': '¥', '₹': '₹', USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥' }
const CUR_RE = /^(?:(USD|EUR|GBP|INR|JPY|CHF|CAD|AUD)\s*|([$€£¥₹]|Rs\.?|CHF|C\$|A\$|US\$)\s*)?(.*?)(?:\s*([$€£¥₹]|USD|EUR|GBP|INR|JPY|CHF|CAD|AUD))?$/i

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

// Number style of a whole document: decimal comma ("1.234,56") or point.
// Decimal comma needs at least MIN_COMMA hits and a clear (2:1) majority over
// the point evidence. Grouped thousands with commas ("1,250", "12,000") count
// as point evidence: a few "4,25" tokens must not turn them into 1.25 and 12.
const MIN_COMMA = 2
export function detectNumberLocale(texts) {
  let comma = 0
  let point = 0
  let groupComma = 0
  let groupDot = 0
  let dmy = 0
  let mdy = 0
  for (const t of texts) {
    for (const m of t.matchAll(/\b\d{1,3}(?:([.\s   ])\d{3})*,\d{1,2}\b(?![.,]\d)/g)) if (m[1] !== undefined || /,\d{2}\b/.test(m[0])) comma++
    for (const m of t.matchAll(/\b\d{1,3}(?:,\d{3})*\.\d{1,2}\b(?![.,]\d)/g)) if (m[0]) point++
    for (const m of t.matchAll(/(?<![\d.,])\d{1,3}(?:,\d{3})+(?![.,]?\d)/g)) if (m[0]) groupComma++
    for (const m of t.matchAll(/(?<![\d.,])\d{1,3}(?:\.\d{3})+(?![.,]?\d)/g)) if (m[0]) groupDot++
    for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/g)) {
      if (+m[1] > 12 && +m[2] <= 12) dmy++
      else if (+m[2] > 12 && +m[1] <= 12) mdy++
    }
  }
  const commaScore = comma + groupDot / 2
  const pointScore = point + groupComma
  const decimalComma = comma >= MIN_COMMA && commaScore > 2 * pointScore
  // thousands commas seen: in a decimal-comma document "1,250" still reads
  // as one thousand two hundred fifty
  return { decimalComma, dayFirst: dmy > mdy || (dmy === mdy && decimalComma), thousandsComma: groupComma > 0 && groupComma >= groupDot }
}

const serial = (y, m, d) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const t = Date.UTC(y, m - 1, d)
  const back = new Date(t)
  if (back.getUTCDate() !== d) return null // 31 Feb
  return (t - Date.UTC(1899, 11, 30)) / 86400000
}
const fullYear = (y) => (y < 100 ? (y < 50 ? 2000 + y : 1900 + y) : y)

function parseDate(s, { dayFirst }) {
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return { v: serial(+m[1], +m[2], +m[3]), z: 'yyyy-mm-dd' }
  m = s.match(/^(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})$/)
  // "3.1.12" with dots and a two-digit year is a version or section number
  if (m && m[2] === '.' && m[4].length === 2) return null
  if (m) {
    let a = +m[1]
    let b = +m[3]
    let df = dayFirst
    if (a > 12) df = true
    else if (b > 12) df = false
    const [d, mo] = df ? [a, b] : [b, a]
    const sep = m[2]
    const z = df ? `dd${sep}mm${sep}yyyy` : `mm${sep}dd${sep}yyyy`
    return { v: serial(fullYear(+m[4]), mo, d), z }
  }
  // "Jan 5, 2024", "January 5 2024", "5 Jan 2024", "05-Jan-2024", "Jan 2024"
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*,?\s+(\d{4})$/)
  if (m && MONTHS[m[1].toLowerCase()]) return { v: serial(+m[3], MONTHS[m[1].toLowerCase()], +m[2]), z: 'mmm d, yyyy' }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})\.?[\s-](\d{4}|\d{2})$/)
  if (m && MONTHS[m[2].toLowerCase()]) return { v: serial(fullYear(+m[3]), MONTHS[m[2].toLowerCase()], +m[1]), z: 'd mmm yyyy' }
  return null
}

// Plain number text (no currency, no %) -> { value, decimals, grouped } | null
function parseNumber(s, { decimalComma, thousandsComma }) {
  let t = s.replace(/[   ]/g, ' ').trim()
  let neg = false
  if (/^\(.*\)$/.test(t)) {
    neg = true
    t = t.slice(1, -1).trim()
  }
  if (/^[-−–]/.test(t)) {
    neg = !neg
    t = t.slice(1).trim()
  } else if (/^\+/.test(t)) t = t.slice(1).trim()
  if (/-$/.test(t)) {
    // trailing minus (accounting exports)
    neg = !neg
    t = t.slice(0, -1).trim()
  }
  // the document also writes thousands with commas: 1,250 is not 1.25
  if (decimalComma && thousandsComma && /^\d{1,3}(?:,\d{3})+$/.test(t)) decimalComma = false
  const dec = decimalComma ? ',' : '.'
  const grp = decimalComma ? '[.\\s]' : '[,\\s]'
  const re = new RegExp(`^(\\d{1,3}(?:${grp}\\d{3})+|\\d+)(?:\\${dec}(\\d+))?$`)
  let m = t.match(re)
  if (!m && /^\d+[.,]\d+$/.test(t) && !/^\d{1,3}[.,]\d{3}$/.test(t)) {
    // "12.5" in a comma document, or "12,5" in a point document: one
    // separator with not exactly three digits after it is a decimal mark
    m = t.match(/^(\d+)[.,](\d+)$/)
  }
  if (!m) return null
  const intPart = m[1].replace(/[.,\s]/g, '')
  const frac = m[2] ?? ''
  if (intPart.length > 15) return null
  const value = Number(`${intPart}${frac ? `.${frac}` : ''}`)
  if (!Number.isFinite(value)) return null
  return { value: neg ? -value : value, decimals: frac.length, grouped: intPart.length !== m[1].length, neg, parens: /^\(.*\)$/.test(s.trim()) }
}

const fmtNumber = (decimals, grouped, parens) => {
  const base = `${grouped ? '#,##0' : '0'}${decimals ? `.${'0'.repeat(Math.min(decimals, 6))}` : ''}`
  return parens ? `${base};(${base})` : base
}

// Returns a SheetJS cell: { t: 'n', v, z } | { t: 's', v } | null for empty.
export function typedCell(raw, locale = { decimalComma: false, dayFirst: false }) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const asText = { t: 's', v: text }
  // IDs: leading zeros, long digit strings, phone-like, grouped codes
  const digitsOnly = text.replace(/[\s-]/g, '')
  // a full date wins over the leading-zero ID rule ("01-15-2024")
  if (/^\d{1,2}([/.-])\d{1,2}\1\d{4}$/.test(text)) {
    const d = parseDate(text, locale)
    if (d && d.v != null) return { t: 'n', v: d.v, z: d.z }
  }
  if (/^0\d+$/.test(digitsOnly) && !/^0[.,]/.test(text)) return { ...asText, z: '@' }
  if (/^\d{16,}$/.test(digitsOnly)) return { ...asText, z: '@' }
  if (/^\d+(-\d+){2,}$/.test(text) && !parseDate(text, locale)) return { ...asText, z: '@' }
  if (/^\+\d/.test(text) && /\d[\s-]\d/.test(text)) return asText

  const date = parseDate(text, locale)
  if (date && date.v != null) return { t: 'n', v: date.v, z: date.z }

  // percent
  let m = text.match(/^(.*?)\s*%$/)
  if (m) {
    const n = parseNumber(m[1], locale)
    if (n) return { t: 'n', v: n.value / 100, z: `0${n.decimals ? `.${'0'.repeat(Math.min(n.decimals, 6))}` : ''}%` }
    return asText
  }
  // currency prefix / suffix, also inside parentheses: "($1,234.00)"
  let inner = text
  let parens = false
  if (/^\(.*\)$/.test(inner)) {
    parens = true
    inner = inner.slice(1, -1).trim()
  }
  // a sign before the currency symbol: "-$5.00"
  let sign = ''
  const sg = inner.match(/^([-−–])\s*(?=\D)/)
  if (sg) {
    sign = '-'
    inner = inner.slice(sg[0].length)
  }
  m = inner.match(CUR_RE)
  const sym = m && (m[1] || m[2] || m[4])
  if (sym && m[3] && (!sign || m[1] || m[2])) {
    const n = parseNumber(parens ? `(${sign}${m[3]})` : sign + m[3], locale)
    if (n) {
      const s = CURRENCY[sym.toUpperCase()] ?? CURRENCY[sym] ?? sym
      const base = `"${s}"${fmtNumber(n.decimals, true, false)}`
      return { t: 'n', v: n.value, z: parens || n.parens ? `${base};("${s}"${fmtNumber(n.decimals, true, false)})` : base }
    }
    return asText
  }
  const n = parseNumber(text, locale)
  if (n) return { t: 'n', v: n.value, z: fmtNumber(n.decimals, n.grouped, n.parens) }
  return asText
}
