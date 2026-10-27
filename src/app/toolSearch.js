// Tool search for the side panel and the Ctrl+K palette. Everyday words map
// to tools ("shrink" finds Compress, "join" finds Merge), and every word of
// the query must start a word of the tool's text ("convert jpg", "delete
// page"; "word" does not find "password").
const WORDS = {
  merge: 'join combine append put together',
  split: 'separate break divide cut',
  extract: 'pick pages take pages copy pages',
  remove: 'delete page delete pages',
  organize: 'reorder sort pages arrange move pages delete page',
  rotate: 'turn flip',
  compress: 'shrink reduce size smaller optimize optimise make small',
  linearize: 'fast web view',
  ocr: 'scan recognise recognize searchable text',
  img2pdf: 'jpg jpeg png heic photo picture image convert',
  pdf2img: 'jpg jpeg png photo picture image convert',
  word2pdf: 'docx doc convert',
  excel2pdf: 'xlsx xls spreadsheet convert',
  ppt2pdf: 'pptx presentation slides convert',
  pdf2word: 'docx doc convert',
  pdf2excel: 'xlsx spreadsheet table convert',
  pdf2ppt: 'pptx presentation slides convert',
  pdf2md: 'markdown text convert',
  html2pdf: 'web page website convert',
  sign: 'esign e-sign signature',
  protect: 'password encrypt lock secure',
  unlock: 'remove password decrypt',
  redact: 'black out hide censor',
  watermark: 'stamp text logo',
  pagenumbers: 'page numbers numbering',
  edit: 'add text annotate write',
  forms: 'fill form fields',
  metadata: 'title author properties',
  repair: 'fix broken damaged',
  compare: 'diff difference',
  info: 'details properties',
}

// Small words a query may hold that say nothing about the tool.
const STOP = new Set(['a', 'an', 'the', 'to', 'into', 'and', 'of', 'for', 'my', 'from', 'in', 'as'])

const tokens = (text) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

// Everything a tool can be found by, lower case.
export const searchText = (t) => [t.name, t.description, t.io, t.category, WORDS[t.id]].filter(Boolean).join(' ').toLowerCase()

export function queryWords(q) {
  const all = tokens(q)
  const words = all.filter((w) => !STOP.has(w))
  return words.length ? words : all
}

// Every query word starts a word of the text.
export function matchesAll(text, q) {
  const have = tokens(text)
  const words = queryWords(q)
  return words.length > 0 && words.every((w) => have.some((h) => h.startsWith(w)))
}

// "pdf to jpg": the words before "to" name the input, the ones after the
// output. A tool whose io ("PDF → JPG/PNG") reads that way ranks first.
function direction(t, q) {
  const m = /^(.+?)\s+(?:to|into)\s+(.+)$/i.exec(q.trim())
  const [from, to] = String(t.io ?? '').split('→')
  if (!m || to === undefined) return 0
  const left = tokens(`${from} ${t.name.split(/\s+to\s+/i)[0]}`)
  const right = tokens(`${to} ${t.name.split(/\s+to\s+/i)[1] ?? ''} ${WORDS[t.id] ?? ''}`)
  const has = (list, words) => words.every((w) => list.some((h) => h.startsWith(w)))
  return has(left, queryWords(m[1])) && has(right, queryWords(m[2])) ? 1 : 0
}

// Tools for a query: the right direction first, then name hits, then the rest.
export function searchTools(tools, q) {
  const query = q.trim().toLowerCase()
  if (!query) return tools
  const hits = tools.filter((t) => matchesAll(searchText(t), query))
  const byName = (t) => (matchesAll(t.name, query) ? 0 : 1)
  const rank = (t) => -direction(t, query) * 2 + byName(t)
  return hits.map((t, i) => [t, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([t]) => t)
}
