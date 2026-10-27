// Document structure and cleanup: bookmarks, metadata, attachments,
// annotations, images, sanitize, flatten, permissions, info, auto rename.
// Bytes in, bytes or plain data out. Everything except headingBookmarks and
// firstHeading (pdf.js text, page only) can run in the ops worker.
//
// MuPDF objects: calling get() on a missing (null) object throws, so walk
// dictionaries with at(), and destroy every document in finally.
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib'
import { pageFrame } from './pageFrame.js'

const ENCRYPTED_MSG = 'This PDF is password-protected. Unlock it first.'

let mupdfPromise = null
let loadedMupdf = null // set once loaded, for sync use in saveMu
// MuPDF logs each free xref slot on the console; `leftovers` walks them all
// with the log muted. Only takes effect when MuPDF loads here first.
let quiet = 0
function getMupdf() {
  globalThis.$libmupdf_wasm_Module ??= { printErr: (...a) => quiet || console.error(...a) }
  if (!mupdfPromise) mupdfPromise = import('mupdf').then((m) => (loadedMupdf = m))
  return mupdfPromise
}

// Runs fn(doc, mupdf) on a MuPDF copy of the file and always frees it.
async function withMupdf(bytes, fn) {
  const mupdf = await getMupdf()
  let doc
  try {
    doc = mupdf.Document.openDocument(new Uint8Array(bytes.slice(0)), 'application/pdf')
  } catch (err) {
    throw new Error(`Not a readable PDF (${err.message}).`)
  }
  try {
    if (doc.needsPassword()) throw new Error(ENCRYPTED_MSG)
    const pdf = doc.asPDF()
    if (!pdf) throw new Error('Not a PDF.')
    return await fn(pdf, mupdf)
  } finally {
    doc.destroy?.()
  }
}

// garbage drops the objects we cut loose (old scripts, images,
// attachments), so they are really gone from the file. compress packs the
// content streams MuPDF rewrote, objstms the small objects (i-9: 810 KB
// without, 510 KB with).
// PDF/A-1 forbids object streams: those files keep plain objects. `extra`
// adds options (encryption).
//
// Two passes, for two MuPDF 1.28 bugs: on a document whose objects were all
// resolved (the object walk), garbage=compact loses content (attention p13
// figure text 863 -> 409 chars); and objstms without compact fails on an
// xref with gaps ("cannot find object in xref"). So the edited document is
// saved with plain garbage, and a fresh copy of that is compacted.
function saveMu(doc, extra = '') {
  const meta = at(doc.getTrailer(), 'Root', 'Metadata')
  let pdfa1 = false
  if (meta?.isStream()) pdfa1 = /pdfaid:part(?:>\s*|\s*=\s*["'])1\b/.test(new TextDecoder().decode(takeBytes(meta.readStream())))
  const first = takeBytes(doc.saveToBuffer('garbage,compress'))
  const fresh = loadedMupdf.Document.openDocument(first, 'application/pdf')
  try {
    return takeBytes(fresh.asPDF().saveToBuffer(`garbage=compact,compress${pdfa1 ? '' : ',objstms'}${extra ? `,${extra}` : ''}`))
  } finally {
    fresh.destroy?.()
  }
}

// A MuPDF Buffer's bytes are a view into WASM memory that the next
// allocation can detach: copy at once, then free the Buffer.
function takeBytes(buf) {
  try {
    return buf.asUint8Array().slice()
  } finally {
    buf.destroy?.()
  }
}

// pdf-lib writes every object it parsed, also ones nothing points to any
// more (an old outline, an old XMP packet): a MuPDF save drops them.
const compact = (bytes) => withMupdf(bytes, (doc) => saveMu(doc))

// Null-safe walk: at(dict, 'Names', 'JavaScript') -> PDFObject or null.
function at(o, ...keys) {
  for (const k of keys) {
    if (!o || !(o.isDictionary() || o.isArray())) return null
    o = o.get(k)
    if (o.isNull()) return null
  }
  return o && !o.isNull() ? o : null
}
const nameOf = (o) => (o && o.isName() ? o.asName() : null)
// asNumber() goes through a 32-bit float: flag words above 2^24 lose bit 1
// (fw9 comb fields, Ff 25165825 reads as 25165824). Read integers as text.
const intOf = (o) => (o?.isInteger() ? parseInt(o.toString(), 10) : o?.isNumber() ? Math.trunc(o.asNumber()) : 0)
const strOf = (o) => (o && o.isString() ? o.asString() : null)

// Object numbers reachable from the trailer. Walking 1..countObjects makes
// MuPDF log "cannot find object in xref" for every free slot, and loose
// objects go with the save anyway.
function reachableNums(doc) {
  const seen = new Set()
  const stack = [doc.getTrailer()]
  while (stack.length) {
    stack.pop().forEach((v) => {
      if (v.isIndirect()) {
        const n = v.asIndirect()
        if (!seen.has(n)) {
          seen.add(n)
          stack.push(v)
        }
      } else if (v.isDictionary() || v.isArray()) stack.push(v)
    })
  }
  return [...seen].sort((a, b) => a - b)
}

// What only an earlier version of the file (an incremental update) or a loose
// object still holds: a garbage-collected save drops it, a change worth
// reporting. MuPDF reads every in-use object, so names are unescaped and an
// embedded file stream needs no /Type. -> { objects, files, images, revisions }
function leftovers(doc, bytes) {
  const live = new Set(reachableNums(doc))
  const out = { objects: 0, files: 0, images: 0, revisions: 0 }
  let specs = 0
  let streams = 0
  quiet++
  try {
    for (let i = 1; i < doc.countObjects(); i++) {
      if (live.has(i)) continue
      let o
      try {
        o = doc.newIndirect(i).resolve()
      } catch {
        continue
      }
      if (!o || o.isNull() || !(o.isDictionary() || o.isArray())) continue
      const type = nameOf(at(o, 'Type'))
      if (type === 'ObjStm' || type === 'XRef') continue
      out.objects++
      if (o.isDictionary() && at(o, 'EF')) specs++
      if (type === 'EmbeddedFile') streams++
      if (nameOf(at(o, 'Subtype')) === 'Image') out.images++
    }
  } finally {
    quiet--
  }
  out.files = specs || streams
  // an earlier xref section (not the first-page one of a linearized file)
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.byteLength, 1024)))
  if (doc.countVersions() > 1 && !/\/Linearized\b/.test(head)) out.revisions = 1
  return out
}

// Every reachable indirect object of the file, resolved.
function* objects(doc) {
  for (const i of reachableNums(doc)) {
    let o
    try {
      o = doc.newIndirect(i).resolve()
    } catch {
      continue
    }
    if (o && !o.isNull()) yield [i, o]
  }
}

// Calls fn(dict) for an object and every direct dict nested inside it.
function eachDict(o, fn, depth = 0) {
  if (!o || depth > 12 || (depth > 0 && o.isIndirect())) return
  if (o.isDictionary()) {
    fn(o)
    const kids = []
    o.forEach((v) => kids.push(v))
    for (const v of kids) eachDict(v, fn, depth + 1)
  } else if (o.isArray()) {
    for (let i = 0; i < o.length; i++) eachDict(o.get(i), fn, depth + 1)
  }
}

// pdf-lib without touching Producer / ModDate. Files pdf-lib cannot read go
// through the intake repair first; owner-only restricted files (open without
// a password) are decrypted by MuPDF first.
async function loadLib(bytes) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (err) {
    if (/encrypt/i.test(String(err))) {
      const plain = await withMupdf(bytes, (doc) => takeBytes(doc.saveToBuffer('encrypt=none')))
      return PDFDocument.load(plain, { updateMetadata: false })
    }
    const { normalizePdf } = await import('./intake.js')
    const res = await normalizePdf(bytes, {})
    return PDFDocument.load(res.bytes, { updateMetadata: false })
  }
}

const lookup = (ctx, o) => (o instanceof PDFRef ? ctx.lookup(o) : o)
const pdfText = (o) => (o instanceof PDFString || o instanceof PDFHexString ? o.decodeText() : null)

// ---------- dates ----------

// "D:20240131120000+01'00'" -> "2024-01-31T12:00:00+01:00" (null if unreadable)
export function pdfDateToIso(s) {
  const m = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?\s*([Zz+-])?\s*(\d{2})?'?(\d{2})?'?/.exec(String(s ?? '').trim())
  if (!m) return null
  const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', sign, oh = '00', om = '00'] = m
  const tz = !sign ? '' : sign.toUpperCase() === 'Z' ? 'Z' : `${sign}${oh}:${om}`
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}${tz}`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

// Any date string -> PDF date in local time with its offset.
export function toPdfDate(value) {
  const d = value instanceof Date ? value : new Date(value)
  // PDF dates have a 4-digit year
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1000 || d.getFullYear() > 9999) return null
  const p = (n) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const a = Math.abs(off)
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${sign}${p(Math.floor(a / 60))}'${p(a % 60)}'`
}

function toXmpDate(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const p = (n) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const a = Math.abs(off)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(Math.floor(a / 60))}:${p(a % 60)}`
}

// ---------- bookmarks ----------

// Flat list in reading order: [{ title, level (1 = top), page (1-based or
// null), y (points from the top of the visible page, or null), fit (the
// destination view: XYZ, Fit, FitH...), open, uri }]
export async function readBookmarks(bytes) {
  return withMupdf(bytes, (doc) => {
    const out = []
    const walk = (items, level) => {
      for (const it of items ?? []) {
        if (out.length >= 20000 || level > 32) return
        let page = Number.isInteger(it.page) && it.page >= 0 ? it.page + 1 : null
        let y = null
        let uri = null
        let fit = null
        if (it.uri) {
          if (/^#/.test(it.uri)) {
            try {
              const dest = doc.resolveLinkDestination(it.uri)
              if (dest.page >= 0) page = dest.page + 1
              fit = dest.type ?? null
              if (/^(XYZ|FitB?H)$/.test(dest.type) && Number.isFinite(dest.y) && dest.y > 0) y = Math.round(dest.y * 10) / 10
            } catch {
              /* unresolvable destination: keep the page MuPDF gave */
            }
          } else uri = it.uri
        }
        out.push({ title: (it.title ?? '').trim(), level, page, y, fit, open: !!it.open, uri })
        walk(it.down, level + 1)
      }
    }
    walk(doc.loadOutline() ?? [], 1)
    return { items: out, pageCount: doc.countPages() }
  })
}

// Flat list -> tree. Levels are clamped so a child is at most one deeper.
export function bookmarkTree(items) {
  const root = { children: [] }
  const stack = [{ node: root, level: 0 }]
  for (const it of items) {
    const level = Math.max(1, Math.min(it.level || 1, stack[stack.length - 1].level + 1))
    while (stack[stack.length - 1].level >= level) stack.pop()
    const node = { ...it, level, children: [] }
    stack[stack.length - 1].node.children.push(node)
    stack.push({ node, level })
  }
  return root.children
}

// Replaces the outline with `items` (flat list as readBookmarks returns,
// targets in view space). Writes /Title, /Parent, /Prev, /Next, /First,
// /Last, /Count and an explicit /Dest per item; old outline objects go.
export async function writeBookmarks(bytes, items) {
  const doc = await loadLib(bytes)
  const ctx = doc.context
  const catalog = doc.catalog
  const pages = doc.getPages()

  // drop the old outline tree
  const old = catalog.get(PDFName.of('Outlines'))
  const seen = new Set()
  const drop = (ref) => {
    let r = ref
    while (r instanceof PDFRef && !seen.has(r.toString())) {
      seen.add(r.toString())
      const d = ctx.lookup(r)
      if (!(d instanceof PDFDict)) break
      drop(d.get(PDFName.of('First')))
      const next = d.get(PDFName.of('Next'))
      ctx.delete(r)
      r = next
    }
  }
  if (old instanceof PDFRef) {
    const root = ctx.lookup(old)
    if (root instanceof PDFDict) drop(root.get(PDFName.of('First')))
    ctx.delete(old)
  }
  catalog.delete(PDFName.of('Outlines'))

  const tree = bookmarkTree(items.filter((it) => (it.title ?? '').trim()))
  if (!tree.length) {
    if (String(catalog.get(PDFName.of('PageMode')) ?? '') === '/UseOutlines') catalog.delete(PDFName.of('PageMode'))
    return compact(await doc.save())
  }

  // keeps the view of the original destination (fit page, fit width)
  const destOf = (it) => {
    if (it.uri || it.page == null) return null
    const n = Math.min(Math.max(1, it.page), pages.length)
    const page = pages[n - 1]
    const f = pageFrame(page)
    if (/^FitB?$/.test(it.fit ?? '') || f.rotation !== 0) return ctx.obj([page.ref, PDFName.of(it.fit === 'FitB' ? 'FitB' : 'Fit')])
    const top = PDFNumber.of(Math.round((it.y == null ? f.y1 : f.toUser(0, Math.max(0, it.y)).y) * 100) / 100)
    if (/^FitB?H$/.test(it.fit ?? '')) return ctx.obj([page.ref, PDFName.of(it.fit), top])
    return ctx.obj([page.ref, PDFName.of('XYZ'), PDFNull, top, PDFNull])
  }
  // visible descendants when open (PDF 32000 12.3.3)
  const visible = (node) => node.children.reduce((n, c) => n + 1 + (c.open !== false ? visible(c) : 0), 0)

  const rootRef = ctx.nextRef()
  const build = (nodes, parentRef) => {
    const refs = nodes.map(() => ctx.nextRef())
    nodes.forEach((node, i) => {
      const d = ctx.obj({})
      d.set(PDFName.of('Title'), PDFHexString.fromText(node.title.trim()))
      d.set(PDFName.of('Parent'), parentRef)
      if (i > 0) d.set(PDFName.of('Prev'), refs[i - 1])
      if (i < nodes.length - 1) d.set(PDFName.of('Next'), refs[i + 1])
      const dest = destOf(node)
      if (dest) d.set(PDFName.of('Dest'), dest)
      else if (node.uri) d.set(PDFName.of('A'), ctx.obj({ S: 'URI', URI: PDFString.of(node.uri) }))
      if (node.children.length) {
        const kids = build(node.children, refs[i])
        d.set(PDFName.of('First'), kids[0])
        d.set(PDFName.of('Last'), kids[kids.length - 1])
        const n = node.children.reduce((s, c) => s + 1 + (c.open !== false ? visible(c) : 0), 0)
        d.set(PDFName.of('Count'), PDFNumber.of(node.open !== false ? n : -node.children.length))
      }
      ctx.assign(refs[i], d)
    })
    return refs
  }
  const top = build(tree, rootRef)
  const rootDict = ctx.obj({ Type: 'Outlines' })
  rootDict.set(PDFName.of('First'), top[0])
  rootDict.set(PDFName.of('Last'), top[top.length - 1])
  rootDict.set(PDFName.of('Count'), PDFNumber.of(visible({ children: tree })))
  ctx.assign(rootRef, rootDict)
  catalog.set(PDFName.of('Outlines'), rootRef)
  return compact(await doc.save())
}

// Text lines with their size, per page, from pdf.js (page only).
async function textLines(bytes, { from = 1, to = Infinity, onPage, check } = {}) {
  const { openPdfDocument, serializedPdfOp } = await import('./pdfText.js')
  const { buildLines } = await import('./layout.js')
  return serializedPdfOp(async () => {
    // cached by pdfText: never destroy it here
    const doc = await openPdfDocument(bytes)
    const last = Math.min(doc.numPages, to)
    const pages = []
    for (let n = from; n <= last; n++) {
      check?.()
      const page = await doc.getPage(n)
      const vp = page.getViewport({ scale: 1 })
      const tc = await page.getTextContent()
      // upright text only: a sideways stamp (arXiv id) is not a heading
      const items = tc.items
        .filter((it) => it.str && it.str.trim() && Math.abs(it.transform[1]) < 0.01 && Math.abs(it.transform[2]) < 0.01 && it.transform[0] > 0)
        .map((it) => ({ text: it.str, x: it.transform[4], y: it.transform[5], size: Math.hypot(it.transform[2], it.transform[3]), width: it.width }))
      // lines per text size, so a big figure label on the same baseline as a
      // heading does not lift the heading into its size
      const bySize = new Map()
      for (const it of items) {
        const k = Math.round(it.size * 2) / 2
        if (!bySize.has(k)) bySize.set(k, [])
        bySize.get(k).push(it)
      }
      const lines = [...bySize.values()]
        .flatMap((group) => buildLines(group))
        .map((l) => {
          const sorted = [...l.items].sort((a, b) => a.x - b.x)
          const text = sorted
            .map((it) => it.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
          const [vx, vy] = vp.convertToViewportPoint(sorted[0].x, l.y + l.size)
          return { text, size: Math.round(l.size * 10) / 10, y: Math.max(0, Math.round(vy)), x: vx, chars: text.length, page: n }
        })
        .sort((a, b) => a.y - b.y || a.x - b.x)
      pages.push({ page: n, lines, rotated: vp.rotation % 180 !== 0 || vp.rotation !== 0 })
      page.cleanup()
      onPage?.(n, last)
    }
    return pages
  })
}

const headingLike = (t) => t.length >= 2 && t.length <= 120 && /\p{L}/u.test(t) && !/^[\d\s.,:;()-]+$/.test(t)
// Big text that reads like a sentence or a list of names is not a heading:
// the arXiv licence banner, author lines (tracemonkey).
// An all-caps headline may run longer (FDIC: 22 words).
const sentenceLike = (t) => /^\p{Ll}/u.test(t) || /,\s*$/.test(t) || (t.match(/,/g) ?? []).length >= 3 || t.split(/\s+/).length > (t === t.toUpperCase() ? 30 : 18)

// Character-weighted median line size: the body text size.
function bodySize(lines) {
  const sizes = lines.flatMap((l) => Array(Math.min(l.chars, 400)).fill(l.size)).sort((a, b) => a - b)
  return sizes[Math.floor(sizes.length / 2)] || 10
}

// Bookmarks from heading-sized text: lines clearly bigger than the body text,
// grouped into up to `levels` size levels. -> flat list like readBookmarks.
export async function headingBookmarks(bytes, { levels = 2, onPage, check } = {}) {
  const pages = await textLines(bytes, { onPage, check })
  const all = pages.flatMap((p) => p.lines)
  const body = bodySize(all)
  let heads = []
  for (const p of pages) {
    let prev = null
    for (const l of p.lines) {
      if (!(l.size >= body * 1.15) || !headingLike(l.text)) {
        prev = null
        continue
      }
      // a heading wrapped over two lines becomes one bookmark
      if (prev && prev.page === l.page && Math.abs(prev.size - l.size) < 0.6 && l.y - prev.y < l.size * 2.2 && prev.title.length + l.text.length < 160) {
        prev.title = `${prev.title} ${l.text}`
        prev.y2 = l.y
        continue
      }
      prev = { title: l.text, size: l.size, page: l.page, y: p.rotated ? null : Math.max(0, l.y - 4), y2: l.y }
      heads.push(prev)
    }
  }
  heads = heads.filter((h) => !sentenceLike(h.title))
  // page 1 of a paper: between the title and "Abstract" come authors and
  // affiliations, not headings
  const first = heads.filter((h) => h.page === 1)
  const abs = first.findIndex((h) => /^abstract\b/i.test(h.title))
  if (abs > 1) {
    const front = new Set(first.slice(1, abs))
    heads = heads.filter((h) => !front.has(h))
  }
  // the same big text three times or more is a running header or a figure
  // label (attention paper: "Input-Input Layer5" x4), not a heading
  const seen = new Map()
  for (const h of heads) seen.set(h.title.toLowerCase(), (seen.get(h.title.toLowerCase()) ?? 0) + 1)
  heads = heads.filter((h) => seen.get(h.title.toLowerCase()) < 3)
  // size levels, biggest first; sizes within 0.6 pt are one level
  const sizes = [...new Set(heads.map((h) => h.size))].sort((a, b) => b - a)
  const tiers = []
  for (const s of sizes) if (!tiers.length || tiers[tiers.length - 1] - s > 0.6) tiers.push(s)
  const levelOf = (s) => tiers.findIndex((t) => t - s <= 0.6) + 1
  // a size used for most lines of every page is running text, not a heading
  return heads
    .map((h) => ({ title: h.title.slice(0, 200), level: levelOf(h.size), page: h.page, y: h.y, open: true, uri: null }))
    .filter((h) => h.level >= 1 && h.level <= levels)
}

// ---------- metadata ----------

export const INFO_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Trapped']

function xmpText(xmp) {
  if (!xmp) return {}
  const unesc = (s) =>
    s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&amp;/g, '&')
      .trim()
  const prop = (tag) => {
    const el = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xmp)
    if (el) {
      const lis = [...el[1].matchAll(/<rdf:li(?:\s[^>]*)?>([\s\S]*?)<\/rdf:li>/g)].map((m) => unesc(m[1]))
      return lis.length ? lis.join(', ') : unesc(el[1])
    }
    const attr = new RegExp(`\\s${tag}="([^"]*)"`).exec(xmp)
    return attr ? unesc(attr[1]) : null
  }
  return {
    Title: prop('dc:title'),
    Author: prop('dc:creator'),
    Subject: prop('dc:description'),
    Keywords: prop('pdf:Keywords'),
    Creator: prop('xmp:CreatorTool'),
    Producer: prop('pdf:Producer'),
    CreationDate: prop('xmp:CreateDate'),
    ModDate: prop('xmp:ModifyDate'),
    Trapped: prop('pdf:Trapped'),
    pdfaPart: prop('pdfaid:part'),
    pdfaConformance: prop('pdfaid:conformance'),
    pdfuaPart: prop('pdfuaid:part'),
  }
}

function readXmp(doc) {
  const ref = doc.catalog.get(PDFName.of('Metadata'))
  const s = lookup(doc.context, ref)
  if (!(s instanceof PDFRawStream)) return null
  try {
    return new TextDecoder().decode(decodePDFRawStream(s).decode())
  } catch {
    return null
  }
}

// { info: { Title... (dates as ISO) }, custom: [{ key, value }], xmp: { present,
//   values }, pdfa: '2b' | null }. Fields missing from Info fall back to XMP.
export async function readMetadata(bytes) {
  const doc = await loadLib(bytes)
  const ctx = doc.context
  const infoDict = lookup(ctx, ctx.trailerInfo.Info)
  const info = Object.fromEntries(INFO_KEYS.map((k) => [k, '']))
  const custom = []
  if (infoDict instanceof PDFDict) {
    for (const [k, v0] of infoDict.entries()) {
      const key = k.decodeText()
      const v = lookup(ctx, v0)
      const value = v instanceof PDFName ? v.decodeText() : (pdfText(v) ?? (v instanceof PDFNumber ? String(v.asNumber()) : null))
      if (value == null) continue
      if (INFO_KEYS.includes(key)) info[key] = key.endsWith('Date') ? (pdfDateToIso(value) ?? value) : value
      else custom.push({ key, value })
    }
  }
  const xmp = readXmp(doc)
  const xv = xmpText(xmp)
  for (const k of INFO_KEYS) if (!info[k] && xv[k]) info[k] = xv[k]
  return {
    info,
    custom,
    xmp: { present: !!xmp, values: xmp ? Object.fromEntries(INFO_KEYS.map((k) => [k, xv[k] ?? ''])) : null },
    pdfa: xv.pdfaPart ? `${xv.pdfaPart}${(xv.pdfaConformance ?? '').toLowerCase()}` : null,
  }
}

// control characters are not allowed in XML
const xmlEsc = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function buildXmp(info, keep) {
  const line = (tag, v) => (v ? `   <${tag}>${xmlEsc(v)}</${tag}>\n` : '')
  const alt = (tag, v) => (v ? `   <${tag}><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(v)}</rdf:li></rdf:Alt></${tag}>\n` : '')
  const seq = (tag, v) => (v ? `   <${tag}><rdf:Seq><rdf:li>${xmlEsc(v)}</rdf:li></rdf:Seq></${tag}>\n` : '')
  const ids =
    (keep.pdfaPart ? `   <pdfaid:part>${xmlEsc(keep.pdfaPart)}</pdfaid:part>\n` : '') +
    (keep.pdfaConformance ? `   <pdfaid:conformance>${xmlEsc(keep.pdfaConformance)}</pdfaid:conformance>\n` : '') +
    (keep.pdfuaPart ? `   <pdfuaid:part>${xmlEsc(keep.pdfuaPart)}</pdfuaid:part>\n` : '')
  return (
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n' +
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"' +
    (keep.pdfaPart ? ' xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"' : '') +
    (keep.pdfuaPart ? ' xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/"' : '') +
    '>\n' +
    '   <dc:format>application/pdf</dc:format>\n' +
    alt('dc:title', info.Title) +
    seq('dc:creator', info.Author) +
    alt('dc:description', info.Subject) +
    line('pdf:Keywords', info.Keywords) +
    line('pdf:Producer', info.Producer) +
    line('pdf:Trapped', info.Trapped) +
    line('xmp:CreatorTool', info.Creator) +
    line('xmp:CreateDate', info.CreationDate && toXmpDate(info.CreationDate)) +
    line('xmp:ModifyDate', info.ModDate && toXmpDate(info.ModDate)) +
    line('xmp:MetadataDate', toXmpDate(new Date())) +
    ids +
    '  </rdf:Description>\n' +
    ' </rdf:RDF>\n' +
    '</x:xmpmeta>\n' +
    // padding lets other tools edit the packet in place
    `${' '.repeat(99)}\n`.repeat(20) +
    '<?xpacket end="w"?>'
  )
}

// Custom keys: any text without spaces or PDF delimiters (pdf-lib writes
// other characters as #xx), not a standard key.
export function cleanKey(key) {
  const k = [
    ...String(key ?? '')
      .normalize('NFC')
      .replace(/[\s()<>[\]{}/%#\u0000-\u001f]/g, ''),
  ]
    .slice(0, 64)
    .join('')
  return k && !INFO_KEYS.includes(k) ? k : null
}

// Writes the Info dictionary and a matching XMP packet. `info` holds the
// standard keys (empty = left out), `custom` extra keys. deleteAll removes
// both the Info dictionary and the XMP packet.
export async function writeMetadata(bytes, { info = {}, custom = [], deleteAll = false } = {}) {
  const doc = await loadLib(bytes)
  const ctx = doc.context
  const oldXmp = readXmp(doc)
  const oldInfo = ctx.trailerInfo.Info
  if (oldInfo instanceof PDFRef) ctx.delete(oldInfo)
  ctx.trailerInfo.Info = undefined
  const oldMeta = doc.catalog.get(PDFName.of('Metadata'))
  if (oldMeta instanceof PDFRef) ctx.delete(oldMeta)
  doc.catalog.delete(PDFName.of('Metadata'))
  if (deleteAll) return compact(await doc.save())

  const values = {}
  const dict = ctx.obj({})
  for (const k of INFO_KEYS) {
    const v = String(info[k] ?? '').trim()
    if (!v) continue
    if (k === 'Trapped') {
      if (!['True', 'False', 'Unknown'].includes(v)) throw new Error('Trapped must be True, False or Unknown.')
      dict.set(PDFName.of(k), PDFName.of(v))
    } else if (k.endsWith('Date')) {
      const d = toPdfDate(v)
      if (!d) throw new Error(`${k === 'ModDate' ? 'Modified' : 'Created'} date is not a valid date.`)
      dict.set(PDFName.of(k), PDFString.of(d))
    } else dict.set(PDFName.of(k), PDFHexString.fromText(v))
    values[k] = v
  }
  for (const { key, value } of custom) {
    const k = cleanKey(key)
    if (k && String(value ?? '').trim()) dict.set(PDFName.of(k), PDFHexString.fromText(String(value).trim()))
  }
  if (dict.entries().length) ctx.trailerInfo.Info = ctx.register(dict)
  const xmp = new TextEncoder().encode(buildXmp(values, xmpText(oldXmp)))
  const stream = ctx.stream(xmp, { Type: 'Metadata', Subtype: 'XML', Length: xmp.length })
  doc.catalog.set(PDFName.of('Metadata'), ctx.register(stream))
  return compact(await doc.save())
}

// ---------- attachments ----------

const isoOf = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null)

// Object numbers of the file streams a file spec points to.
function specStreams(spec) {
  const out = []
  for (const k of ['F', 'UF', 'DOS', 'Mac', 'Unix']) {
    const s = at(spec, 'EF', k)
    if (s?.isIndirect()) out.push(s.asIndirect())
  }
  return out
}

// File contents, copied out of WASM memory at once (null if unreadable).
function fileData(doc, spec) {
  try {
    const buf = doc.getEmbeddedFileContents(spec)
    return buf ? takeBytes(buf) : null
  } catch {
    return null
  }
}

// Attachments of the file. withData: also their bytes (extract only).
function attachmentsOf(doc, { withData = false } = {}) {
  const out = []
  let files = {}
  try {
    files = doc.getEmbeddedFiles() ?? {}
  } catch {
    files = {}
  }
  const item = (spec, fields) => {
    let params = {}
    try {
      params = doc.getFilespecParams(spec)
    } catch {
      /* unreadable file spec */
    }
    const data = fileData(doc, spec)
    return {
      name: params.filename || fields.fallback,
      mime: params.mimetype || 'application/octet-stream',
      size: data ? data.byteLength : null,
      created: isoOf(params.creationDate),
      modified: isoOf(params.modificationDate),
      streams: specStreams(spec),
      data: withData ? data : null,
      ...fields,
    }
  }
  for (const [key, spec] of Object.entries(files)) out.push(item(spec, { id: `file:${key}`, key, fallback: key, source: 'file', page: null }))
  const pages = doc.countPages()
  for (let i = 0; i < pages; i++) {
    const page = doc.loadPage(i)
    page.getAnnotations().forEach((a, n) => {
      if (a.getType() !== 'FileAttachment') return
      let spec = null
      try {
        spec = a.getFileSpec()
      } catch {
        /* annotation without a file spec */
      }
      const obj = a.getObject()
      const fields = { id: `page:${i}:${n}`, key: null, fallback: `attachment-p${i + 1}`, source: 'page', page: i + 1, annot: obj?.isIndirect() ? obj.asIndirect() : null }
      out.push(spec ? item(spec, fields) : { ...fields, name: fields.fallback, mime: 'application/octet-stream', size: null, streams: [], data: null })
    })
  }
  // associated files (/AF) of the document and pages that are not listed yet
  const listed = new Set(out.flatMap((a) => a.streams))
  const fromAf = (holder, page) => {
    const af = at(holder, 'AF')
    const specs = af?.isArray() ? Array.from({ length: af.length }, (_, k) => af.get(k)) : af ? [af] : []
    for (const spec of specs) {
      const streams = specStreams(spec)
      if (!streams.length || streams.some((n) => listed.has(n))) continue
      streams.forEach((n) => listed.add(n))
      out.push(item(spec, { id: `af:${streams[0]}`, key: null, fallback: `associated-${streams[0]}`, source: 'af', page }))
    }
  }
  fromAf(doc.getTrailer().get('Root'), null)
  for (let i = 0; i < pages; i++) fromAf(doc.findPage(i), i + 1)
  return out.map(({ fallback, ...a }) => a)
}

// "name (2).ext", built from the original name each time.
function uniqueName(name, used) {
  const m = /^(.*?)(\.[^.\s]{1,8})?$/.exec(name)
  let out = name
  for (let n = 2; used.has(out.toLowerCase()); n++) out = `${m[1]} (${n})${m[2] ?? ''}`
  used.add(out.toLowerCase())
  return out
}

// [{ id, name, mime, size, created, modified, source: 'file'|'page', page }]
export async function listAttachments(bytes) {
  return withMupdf(bytes, (doc) => attachmentsOf(doc).map(({ data, streams, annot, ...rest }) => rest))
}

// Files out of the PDF: [{ id, name, mime, bytes }]. ids = null for all.
export async function extractAttachments(bytes, ids = null) {
  return withMupdf(bytes, (doc) => {
    const used = new Set()
    return attachmentsOf(doc, { withData: true })
      .filter((a) => a.data && (!ids || ids.includes(a.id)))
      .map((a) => ({ id: a.id, name: uniqueName(safeFileName(a.name, { keepExt: true }) ?? 'attachment', used), mime: a.mime, bytes: a.data }))
  })
}

// Cuts every link to the given file streams (associated files /AF on the
// catalog, pages and annotations, collections, other file specs) and empties
// the streams, so their bytes are gone even if a link is missed.
function dropFileStreams(doc, nums) {
  if (!nums.size) return
  const hits = (spec) => specStreams(spec).some((n) => nums.has(n))
  for (const [, obj] of objects(doc)) {
    eachDict(obj, (d) => {
      const af = at(d, 'AF')
      if (af?.isArray()) {
        const keep = doc.newArray()
        for (let i = 0; i < af.length; i++) if (!hits(af.get(i))) keep.push(af.get(i))
        if (keep.length !== af.length) keep.length ? d.put('AF', keep) : d.delete('AF')
      } else if (af?.isDictionary() && hits(af)) d.delete('AF')
      if (at(d, 'EF') && hits(d)) d.delete('EF')
    })
  }
  for (const n of nums) {
    const ref = doc.newIndirect(n)
    if (!ref.isStream()) continue
    const o = ref.resolve()
    for (const k of ['Params', 'Subtype', 'DecodeParms', 'Filter']) if (at(o, k)) o.delete(k)
    ref.writeStream(new Uint8Array(0))
  }
}

// add: [{ name, bytes, mime }], remove: ids from listAttachments.
export async function editAttachments(bytes, { add = [], remove = [] } = {}) {
  return withMupdf(bytes, (doc) => {
    const list = attachmentsOf(doc).filter((x) => remove.includes(x.id))
    const streams = new Set(list.flatMap((a) => a.streams))
    const annots = new Set(list.map((a) => a.annot).filter((n) => n != null))
    let removed = 0
    for (const a of list.filter((x) => x.source === 'file')) {
      doc.deleteEmbeddedFile(a.key)
      removed++
    }
    // annotations: delete by index from the end so earlier indexes stay valid
    const byPage = new Map()
    for (const a of list.filter((x) => x.source === 'page')) {
      const [, p, n] = a.id.split(':').map(Number)
      if (!byPage.has(p)) byPage.set(p, [])
      byPage.get(p).push(n)
    }
    for (const [p, idx] of byPage) {
      const page = doc.loadPage(p)
      const all = page.getAnnotations()
      for (const n of idx.sort((a, b) => b - a)) {
        if (all[n]) {
          page.deleteAnnotation(all[n])
          removed++
        }
      }
    }
    removed += list.filter((x) => x.source === 'af').length
    dropStructRefs(doc, annots)
    dropFileStreams(doc, streams)
    const names = new Set(Object.keys(doc.getEmbeddedFiles() ?? {}).map((k) => k.toLowerCase()))
    const added = []
    for (const f of add) {
      // cut the stem, keep the extension
      const raw = String(f.name || '').trim() || 'attachment'
      const ext = /\.[^.\s]{1,8}$/.exec(raw)?.[0] ?? ''
      const name = uniqueName(raw.length > 200 ? raw.slice(0, 200 - ext.length) + ext : raw, names)
      const now = new Date()
      const spec = doc.addEmbeddedFile(name, f.mime || 'application/octet-stream', f.bytes, now, now, false)
      doc.insertEmbeddedFile(name, spec)
      added.push(name)
    }
    return { bytes: saveMu(doc), added, removed }
  })
}

// ---------- annotations ----------

export const ANNOT_GROUPS = {
  links: ['Link'],
  comments: ['Text', 'FreeText'],
  markup: ['Highlight', 'Underline', 'StrikeOut', 'Squiggly', 'Caret'],
  drawings: ['Ink', 'Square', 'Circle', 'Line', 'Polygon', 'PolyLine'],
  stamps: ['Stamp'],
  files: ['FileAttachment'],
  media: ['Sound', 'Movie', 'Screen', 'RichMedia', '3D'],
  widgets: ['Widget'],
}
const groupOf = (subtype) => Object.keys(ANNOT_GROUPS).find((g) => ANNOT_GROUPS[g].includes(subtype)) ?? (subtype === 'Popup' ? 'popups' : 'other')

function annotEntries(page) {
  const arr = at(page, 'Annots')
  if (!arr || !arr.isArray()) return []
  const out = []
  for (let i = 0; i < arr.length; i++) {
    const ref = arr.get(i)
    const a = ref.resolve?.() ?? ref
    if (!a || !a.isDictionary()) continue
    out.push({ ref, dict: a, subtype: nameOf(at(a, 'Subtype')) ?? 'Unknown' })
  }
  return out
}

// Counts per group over all pages: { links: 3, comments: 1, ... }
export async function annotationSummary(bytes) {
  return withMupdf(bytes, (doc) => {
    const counts = {}
    for (let i = 0; i < doc.countPages(); i++) {
      for (const a of annotEntries(doc.findPage(i))) {
        const g = groupOf(a.subtype)
        if (g !== 'popups') counts[g] = (counts[g] ?? 0) + 1
      }
    }
    return counts
  })
}

// Tagged PDFs point at annotations from the structure tree (OBJR /Obj):
// take those OBJRs out of their parent's /K, else the save keeps the
// removed annotations alive.
function dropStructRefs(doc, nums) {
  if (!nums.size) return
  const gone = (o) => {
    const ob = at(o, 'Obj')
    return !!ob?.isIndirect() && nums.has(ob.asIndirect())
  }
  for (const [, obj] of objects(doc)) {
    eachDict(obj, (d) => {
      const k = at(d, 'K')
      if (k?.isArray()) {
        const keep = doc.newArray()
        for (let i = 0; i < k.length; i++) if (!(k.get(i).isDictionary() && gone(k.get(i)))) keep.push(k.get(i))
        if (keep.length !== k.length) keep.length ? d.put('K', keep) : d.delete('K')
      } else if (k?.isDictionary() && gone(k)) d.delete('K')
      // an OBJR outside any /K: at least drop its link
      if (gone(d)) d.delete('Obj')
    })
  }
}

// Removes annotations of the given groups (ANNOT_GROUPS keys plus 'other').
// Popups go with their parent. Removing widgets also removes the form.
export async function removeAnnotations(bytes, { groups = Object.keys(ANNOT_GROUPS).filter((g) => g !== 'widgets').concat('other') } = {}) {
  const want = new Set(groups)
  return withMupdf(bytes, (doc) => {
    if (want.has('widgets') && dynamicXfa(doc.getTrailer().get('Root'))) throw new Error(`${DYNAMIC_XFA_MSG} Leave "Form fields" out.`)
    const removed = {}
    const goneRefs = new Set()
    let widgetsLeft = 0
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.findPage(i)
      const entries = annotEntries(page)
      if (!entries.length) continue
      const gone = new Set()
      for (const e of entries) {
        if (want.has(groupOf(e.subtype))) gone.add(e)
      }
      // popups follow their parent (orphans go with the comments)
      const goneNums = new Set([...gone].filter((g) => g.ref.isIndirect()).map((g) => g.ref.asIndirect()))
      for (const e of entries) {
        if (e.subtype !== 'Popup') continue
        const parent = at(e.dict, 'Parent')
        const pnum = parent?.isIndirect() ? parent.asIndirect() : null
        if ((pnum != null && goneNums.has(pnum)) || (!parent && want.has('comments'))) gone.add(e)
      }
      for (const e of gone) {
        const g = groupOf(e.subtype)
        if (g !== 'popups') removed[g] = (removed[g] ?? 0) + 1
        if (e.ref.isIndirect()) goneRefs.add(e.ref.asIndirect())
      }
      const keep = entries.filter((e) => !gone.has(e))
      widgetsLeft += keep.filter((e) => e.subtype === 'Widget').length
      if (!gone.size) continue
      if (!keep.length) page.delete('Annots')
      else {
        const arr = doc.newArray()
        for (const e of keep) {
          arr.push(e.ref)
          const popup = at(e.dict, 'Popup')
          if (popup?.isIndirect() && [...gone].some((g) => g.ref.isIndirect() && g.ref.asIndirect() === popup.asIndirect())) e.dict.delete('Popup')
        }
        page.put('Annots', arr)
      }
    }
    if (want.has('widgets') && widgetsLeft === 0) {
      const root = doc.getTrailer().get('Root')
      if (at(root, 'AcroForm')) root.delete('AcroForm')
    }
    const total = Object.values(removed).reduce((a, b) => a + b, 0)
    if (total) dropStructRefs(doc, goneRefs)
    return { bytes: total ? saveMu(doc) : new Uint8Array(bytes.slice(0)), removed, total }
  })
}

// ---------- images ----------

// Image XObjects reachable from a resources dict (forms included).
function imagesIn(res, seen, found, depth = 0) {
  const xo = at(res, 'XObject')
  if (!xo || depth > 8) return
  xo.forEach((v) => {
    const num = v.isIndirect() ? v.asIndirect() : null
    if (num != null && seen.has(num)) return
    if (num != null) seen.add(num)
    const st = nameOf(at(v, 'Subtype'))
    if (st === 'Image') found.push(v)
    else if (st === 'Form') imagesIn(at(v, 'Resources'), seen, found, depth + 1)
  })
}

// Byte-exact string <-> bytes (TextDecoder 'latin1' is really windows-1252).
function bin(b) {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000))
  return s
}
const unbin = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0))

const WS = /[\0\t\n\f\r ]/
const DELIM = /[()<>[\]{}/%]/

// Removes inline images (BI <dict> ID <data> EI) from content stream text.
// Strings, hex strings and comments are skipped so a "BI" inside them is not
// taken. -> { text, count }
export function stripInlineImages(s) {
  let out = ''
  let from = 0
  let count = 0
  let i = 0
  const n = s.length
  const skipString = (k) => {
    let depth = 0
    for (; k < n; k++) {
      if (s[k] === '\\') k++
      else if (s[k] === '(') depth++
      else if (s[k] === ')' && --depth === 0) return k + 1
    }
    return n
  }
  // end of the inline image whose data starts at d (after "ID" + 1 space)
  const imageEnd = (dict, d) => {
    const len = /\/(?:L|Length)\s+(\d+)/.exec(dict)
    if (len) {
      const m = /^\s*EI(?=[\0\t\n\f\r ]|$)/.exec(s.slice(d + Number(len[1]), d + Number(len[1]) + 64))
      if (m) return d + Number(len[1]) + m[0].length
    }
    const re = /[\0\t\n\f\r ]EI(?=[\0\t\n\f\r ]|$)/g
    re.lastIndex = d
    for (let m = re.exec(s); m; m = re.exec(s)) {
      // real end: plain operator text follows, not more binary data
      const after = s.slice(m.index + 3, m.index + 35)
      if (/^[\x20-\x7e\0\t\n\f\r]*$/.test(after)) return m.index + 3
    }
    return -1
  }
  while (i < n) {
    const c = s[i]
    if (WS.test(c)) i++
    else if (c === '%') {
      while (i < n && s[i] !== '\n' && s[i] !== '\r') i++
    } else if (c === '(') i = skipString(i)
    else if (c === '<' && s[i + 1] !== '<') {
      const e = s.indexOf('>', i)
      i = e < 0 ? n : e + 1
    } else if (DELIM.test(c)) i++
    else {
      let e = i
      while (e < n && !WS.test(s[e]) && !DELIM.test(s[e])) e++
      if (s.slice(i, e) === 'BI') {
        const id = /[\0\t\n\f\r ]ID[\0\t\n\f\r ]/.exec(s.slice(e))
        const end = id ? imageEnd(s.slice(e, e + id.index), e + id.index + 4) : -1
        if (end < 0) return { text: s, count: 0 } // unreadable: leave the stream alone
        out += s.slice(from, i)
        from = end
        count++
        i = end
      } else i = e
    }
  }
  return { text: count ? out + s.slice(from) : s, count }
}

// Removes every picture and keeps text and vector art exactly as they are:
// image XObjects become a 1x1 mask that paints nothing (their data goes,
// every Do still finds its XObject), inline images are cut out of the
// content streams of pages, forms, patterns and Type 3 glyphs.
// -> { bytes, images, pages, inline }
export async function removeImages(bytes, { onPage, check } = {}) {
  return withMupdf(bytes, (doc) => {
    // images only an old revision still holds go with the save
    const loose = leftovers(doc, bytes).images
    const n = doc.countPages()
    const content = new Set() // content stream object numbers
    const drawn = new Set()
    const pageOf = new Map()
    let pagesWithImages = 0
    for (let i = 0; i < n; i++) {
      check?.()
      const pageObj = doc.findPage(i)
      const found = []
      imagesIn(pageObj.getInheritable('Resources'), new Set(), found)
      for (const f of found) if (f.isIndirect()) drawn.add(f.asIndirect())
      if (found.length) pagesWithImages++
      const c = pageObj.get('Contents')
      const parts = c.isArray() ? Array.from({ length: c.length }, (_, k) => c.get(k)) : [c]
      for (const p of parts) {
        if (p.isIndirect()) {
          content.add(p.asIndirect())
          if (!found.length) pageOf.set(p.asIndirect(), i)
        }
      }
      onPage?.(i + 1, n)
    }
    for (const [num, o] of objects(doc)) {
      if (nameOf(at(o, 'Subtype')) === 'Form' || at(o, 'PatternType')?.asNumber?.() === 1) content.add(num)
      const procs = at(o, 'CharProcs')
      if (procs?.isDictionary()) procs.forEach((v) => v.isIndirect() && content.add(v.asIndirect()))
    }
    let inline = 0
    const inlinePages = new Set()
    for (const num of content) {
      check?.()
      const ref = doc.newIndirect(num)
      if (!ref.isStream()) continue
      const text = bin(takeBytes(ref.readStream()))
      if (!/(^|[\0\t\n\f\r ])BI[\0\t\n\f\r ]/.test(text)) continue
      const res = stripInlineImages(text)
      if (!res.count) continue
      ref.writeStream(unbin(res.text))
      inline += res.count
      if (pageOf.has(num)) inlinePages.add(pageOf.get(num))
    }
    let blanked = 0
    for (const i of reachableNums(doc)) {
      const ref = doc.newIndirect(i)
      let o
      try {
        o = ref.resolve()
      } catch {
        continue
      }
      if (!o?.isDictionary() || nameOf(at(o, 'Subtype')) !== 'Image' || !ref.isStream()) continue
      if (at(o, 'ImageMask') && intOf(at(o, 'Width')) === 1 && intOf(at(o, 'Height')) === 1) continue
      for (const k of ['ColorSpace', 'SMask', 'Mask', 'Decode', 'DecodeParms', 'Filter', 'Interpolate', 'Intent', 'Metadata', 'Alternates', 'SMaskInData', 'OC']) if (at(o, k)) o.delete(k)
      o.put('Width', 1)
      o.put('Height', 1)
      o.put('BitsPerComponent', 1)
      o.put('ImageMask', true)
      ref.writeStream(new Uint8Array([0xff]))
      blanked++
    }
    if (!blanked && !inline && !loose) return { bytes: new Uint8Array(bytes.slice(0)), images: 0, pages: 0, inline: 0, blanked: 0, loose: 0 }
    // blanked also counts soft masks and images outside the pages' resources
    return { bytes: saveMu(doc), images: drawn.size + inline, pages: pagesWithImages + inlinePages.size, inline, blanked, loose }
  })
}

// ---------- sanitize ----------

export const SANITIZE_DEFAULTS = { javascript: true, embeddedFiles: true, xmp: false, metadata: false, links: false, fonts: false }
const EXTERNAL = new Set(['URI', 'Launch', 'GoToR', 'GoToE', 'SubmitForm', 'ImportData'])
const isJsAction = (o) => {
  for (let a = o, k = 0; a && a.isDictionary() && k < 20; a = at(a, 'Next'), k++) {
    const s = nameOf(at(a, 'S'))
    if (s === 'JavaScript' || s === 'Launch' || at(a, 'JS')) return true
  }
  return false
}

// Strips active and hidden content. Returns { bytes, report } where report
// counts what was removed per kind.
export async function sanitizePdf(bytes, options = {}) {
  const o = { ...SANITIZE_DEFAULTS, ...options }
  return withMupdf(bytes, (doc) => {
    const r = { scripts: 0, openAction: 0, triggers: 0, xfa: 0, xfaScripts: 0, attachments: 0, xmp: 0, info: 0, links: 0, fonts: 0, earlier: 0 }
    const root = doc.getTrailer().get('Root')
    const xfa = new Set(xfaPackets(root).map((p) => (p.stream.isIndirect() ? p.stream.asIndirect() : -1)))
    // file streams as found before anything is cut (a removal can leave one
    // hanging off a link that goes later); ones only an old revision still
    // holds go with the save
    const isFile = (x) => nameOf(at(x, 'Type')) === 'EmbeddedFile'
    const startFiles = new Set()
    if (o.embeddedFiles) for (const [num, x] of objects(doc)) if (isFile(x) && !xfa.has(num)) startFiles.add(num)
    const left = leftovers(doc, bytes)
    const names = at(root, 'Names')
    if (o.javascript) {
      const js = at(names, 'JavaScript')
      if (js) {
        try {
          r.scripts += Object.keys(doc.loadNameTree('JavaScript')).length || 1
        } catch {
          r.scripts++
        }
        names.delete('JavaScript')
      }
      const oa = at(root, 'OpenAction')
      if (oa && oa.isDictionary() && isJsAction(oa)) {
        root.delete('OpenAction')
        r.openAction++
      }
      // XFA forms carry their own scripts. A static one has an AcroForm copy,
      // so its XFA goes; a dynamic one is the whole form, so only its
      // <script> elements go.
      const af = at(root, 'AcroForm')
      if (at(af, 'XFA')) {
        if (dynamicXfa(root)) {
          for (const p of xfaPackets(root)) {
            if (p.name === 'config') continue
            const text = streamText(p.stream)
            const cut = p.name === 'xdp' ? withoutConfig(text) : text
            const n = (cut.match(XFA_SCRIPT) ?? []).length
            if (!n) continue
            p.stream.writeStream(new TextEncoder().encode(p.name === 'xdp' ? replaceOutsideConfig(text, XFA_SCRIPT, '') : text.replace(XFA_SCRIPT, '')))
            r.xfaScripts += n
          }
        } else {
          af.delete('XFA')
          r.xfa++
          if (at(root, 'NeedsRendering')) root.delete('NeedsRendering')
        }
      }
    }
    if (o.embeddedFiles) {
      const ef = at(names, 'EmbeddedFiles')
      if (ef) {
        try {
          r.attachments += Object.keys(doc.getEmbeddedFiles()).length
        } catch {
          r.attachments++
        }
        names.delete('EmbeddedFiles')
      }
      if (at(root, 'Collection')) root.delete('Collection')
    }
    if (o.xmp && at(root, 'Metadata')) {
      root.delete('Metadata')
      r.xmp++
    }
    if (o.metadata && at(doc.getTrailer(), 'Info')) {
      doc.getTrailer().delete('Info')
      r.info++
    }
    // every object (and dicts nested in it)
    for (const [, obj] of objects(doc)) {
      eachDict(obj, (d) => {
        if (o.javascript) {
          if (at(d, 'AA')) {
            d.delete('AA')
            r.triggers++
          }
          for (const k of ['A', 'Next']) {
            const a = at(d, k)
            if (a && a.isDictionary() && isJsAction(a)) {
              d.delete(k)
              r.scripts++
            }
          }
          const s = nameOf(at(d, 'S'))
          if ((s === 'JavaScript' || s === 'Launch') && (at(d, 'JS') || at(d, 'F') || at(d, 'Win'))) {
            for (const k of ['JS', 'F', 'Win', 'Mac', 'Unix']) if (at(d, k)) d.delete(k)
            r.scripts++
          }
        }
        // associated files on the catalog, pages, annotations (Factur-X)
        if (o.embeddedFiles && at(d, 'AF')) d.delete('AF')
        if (o.links) {
          const a = at(d, 'A')
          if (a && a.isDictionary() && EXTERNAL.has(nameOf(at(a, 'S')))) {
            d.delete('A')
            r.links++
          }
        }
        if (o.xmp && d !== root && at(d, 'Metadata') && nameOf(at(d, 'Type')) !== 'Catalog') {
          d.delete('Metadata')
          r.xmp++
        }
        // some writers leave /Type out of font descriptors
        if (o.fonts && (nameOf(at(d, 'Type')) === 'FontDescriptor' || at(d, 'FontName'))) {
          let hit = false
          for (const k of ['FontFile', 'FontFile2', 'FontFile3']) {
            if (at(d, k)) {
              d.delete(k)
              hit = true
            }
          }
          if (hit) r.fonts++
        }
      })
    }
    // file attachment annotations, and links without an action left
    const goneRefs = new Set()
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.findPage(i)
      const entries = annotEntries(page)
      const gone = entries.filter((e) => (o.embeddedFiles && e.subtype === 'FileAttachment') || (o.links && e.subtype === 'Link' && !at(e.dict, 'A') && !at(e.dict, 'Dest')))
      if (!gone.length) continue
      r.attachments += gone.filter((e) => e.subtype === 'FileAttachment').length
      const arr = doc.newArray()
      for (const e of entries) if (!gone.includes(e)) arr.push(e.ref)
      if (arr.length) page.put('Annots', arr)
      else page.delete('Annots')
      for (const e of gone) if (e.ref.isIndirect()) goneRefs.add(e.ref.asIndirect())
    }
    dropStructRefs(doc, goneRefs)
    if (o.embeddedFiles) {
      // any file stream still reachable some other way is emptied. Some
      // writers type XFA packets /EmbeddedFile too (imm1344e, fw9): not those.
      const files = new Set(startFiles)
      for (const [num, obj] of objects(doc)) {
        if (nameOf(at(obj, 'Type')) === 'EmbeddedFile' && !xfa.has(num)) files.add(num)
        eachDict(obj, (d) => specStreams(d).forEach((n) => files.add(n)))
      }
      dropFileStreams(doc, files)
      if (!r.attachments && files.size) r.attachments = files.size
      r.attachments += left.files
    }
    // anything else an earlier version still holds goes with the save too
    if (left.revisions || left.objects > left.files) r.earlier = 1
    return { bytes: saveMu(doc), report: r }
  })
}

// What active content is left: { scripts, jsKeys, openActionJs, triggers,
// embeddedFiles, fileAnnots, launch }. Used by info and the checks.
export async function scanActiveContent(bytes) {
  return withMupdf(bytes, (doc) => activeContent(doc))
}

function activeContent(doc) {
  const root = doc.getTrailer().get('Root')
  const res = { documentScripts: 0, jsActions: 0, triggers: 0, launch: 0, openActionJs: false, embeddedFiles: 0, fileAnnots: 0, xfa: !!at(root, 'AcroForm', 'XFA') }
  if (at(root, 'Names', 'JavaScript')) {
    try {
      res.documentScripts = Object.keys(doc.loadNameTree('JavaScript')).length || 1
    } catch {
      res.documentScripts = 1
    }
  }
  const oa = at(root, 'OpenAction')
  res.openActionJs = !!(oa && oa.isDictionary() && isJsAction(oa))
  for (const [, obj] of objects(doc)) {
    eachDict(obj, (d) => {
      if (at(d, 'AA')) res.triggers++
      const s = nameOf(at(d, 'S'))
      if (at(d, 'JS') || s === 'JavaScript') res.jsActions++
      if (s === 'Launch') res.launch++
      if (nameOf(at(d, 'Subtype')) === 'FileAttachment') res.fileAnnots++
    })
  }
  if (at(root, 'Names', 'EmbeddedFiles')) {
    try {
      res.embeddedFiles = Object.keys(doc.getEmbeddedFiles()).length
    } catch {
      res.embeddedFiles = 1
    }
  }
  return res
}

// ---------- flatten ----------

// mode 'forms': field values baked into the pages (formOps.flattenForm).
// mode 'full': forms, then every other annotation's appearance baked into the
// page content; links stay clickable.
export async function flattenPdf(bytes, { mode = 'forms' } = {}) {
  let out = new Uint8Array(bytes.slice(0))
  let fields = 0
  let formError = null
  const form = await withMupdf(out, (doc) => {
    const root = doc.getTrailer().get('Root')
    return { has: !!at(root, 'AcroForm'), dynamic: dynamicXfa(root), ...fieldFacts(root) }
  })
  // a dynamic XFA form has no real fields outside its XFA: nothing to bake,
  // and dropping the XFA would empty the form
  if (form.dynamic) throw new Error(`${DYNAMIC_XFA_MSG} It cannot be flattened here.`)
  const hasForm = form.has && form.fields > 0
  if (hasForm) {
    try {
      const { flattenForm } = await import('./formOps.js')
      const res = await flattenForm(out)
      out = res.bytes
      fields = res.flattened ?? 0
    } catch (err) {
      formError = err.message
    }
  }
  let annots = 0
  if (mode === 'full' || formError) {
    const res = await withMupdf(out, (doc) => {
      let count = 0
      for (let i = 0; i < doc.countPages(); i++) {
        for (const a of annotEntries(doc.findPage(i))) {
          if (a.subtype === 'Link' || a.subtype === 'Popup') continue
          if (a.subtype === 'Widget' ? true : mode === 'full') count++
        }
      }
      if (!count) return null
      doc.bake(mode === 'full', true)
      const root = doc.getTrailer().get('Root')
      if (at(root, 'AcroForm')) root.delete('AcroForm')
      return { bytes: saveMu(doc), count }
    })
    if (res) {
      out = res.bytes
      annots = res.count
    }
  }
  if (formError && !annots && !fields) throw new Error(`Could not flatten the form: ${formError}`)
  if (fields || annots) {
    // no XFA copy may survive (viewers would show its old values), and the
    // flattened fields' objects go too
    out = await withMupdf(out, (doc) => {
      const root = doc.getTrailer().get('Root')
      const af = at(root, 'AcroForm')
      if (at(af, 'XFA')) af.delete('XFA')
      if (at(root, 'NeedsRendering')) root.delete('NeedsRendering')
      return saveMu(doc)
    })
  }
  return { bytes: out, fields, annots }
}

// ---------- permissions ----------

// The 8 permission flags (PDF 32000 table 22) and their P bits.
export const PERMISSIONS = [
  { key: 'print', bit: 3, label: 'Print' },
  { key: 'print-hq', bit: 12, label: 'Print in high quality' },
  { key: 'copy', bit: 5, label: 'Copy text and images' },
  { key: 'accessibility', bit: 10, label: 'Extract for accessibility' },
  { key: 'edit', bit: 4, label: 'Change the document' },
  { key: 'annotate', bit: 6, label: 'Add comments' },
  { key: 'form', bit: 9, label: 'Fill in forms' },
  { key: 'assemble', bit: 11, label: 'Insert, rotate and delete pages' },
]

// P value: reserved bits 7, 8 and 13-32 set, then the allowed flags.
export function permissionValue(allow) {
  let p = 0xfffff0c0 | 0
  for (const f of PERMISSIONS) if (allow[f.key]) p |= 1 << (f.bit - 1)
  return p
}

export const MAX_PASSWORD_BYTES = 127

// AES-256 with an owner password and an empty open password: anyone can
// open the file, the viewer is asked to respect `allow`.
export async function setPermissions(bytes, { ownerPassword, allow = {} } = {}) {
  if (!ownerPassword) throw new Error('An owner password is required.')
  // MuPDF splits its option string on commas
  if (/[,\0]/.test(ownerPassword)) throw new Error('The password cannot contain a comma.')
  // AES-256 uses only the first 127 bytes: a longer password would match anything with that start
  if (new TextEncoder().encode(ownerPassword).length > MAX_PASSWORD_BYTES) throw new Error(`The password is too long (${MAX_PASSWORD_BYTES} bytes at most).`)
  // saveMu adds garbage, so unused objects do not survive
  const out = await withMupdf(bytes, (doc) => saveMu(doc, `encrypt=aes-256,owner-password=${ownerPassword},user-password=,permissions=${permissionValue(allow)}`))
  const read = await readPermissions(out)
  const wrong = PERMISSIONS.filter((f) => !!read.allow[f.key] !== !!allow[f.key] && !(f.key === 'print-hq' && !allow.print))
  if (read.needsPassword || wrong.length) throw new Error('The restricted file did not read back as set.')
  return { bytes: out, allow: read.allow }
}

// { encrypted, method, needsPassword, allow: { print: true, ... } }
export async function readPermissions(bytes) {
  const mupdf = await getMupdf()
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes.slice(0)), 'application/pdf')
  try {
    if (doc.needsPassword()) return { encrypted: true, method: doc.getMetaData('encryption') ?? null, needsPassword: true, allow: {} }
    const method = doc.getMetaData('encryption')
    const allow = Object.fromEntries(PERMISSIONS.map((f) => [f.key, doc.hasPermission(f.key)]))
    return { encrypted: !!method && method !== 'None', method: method && method !== 'None' ? method : null, needsPassword: false, allow }
  } finally {
    doc.destroy?.()
  }
}

// ---------- info ----------

const FONT_TYPES = new Set(['Type0', 'Type1', 'MMType1', 'Type3', 'TrueType'])

function fontFacts(f) {
  const subtype = nameOf(at(f, 'Subtype')) ?? 'Unknown'
  const base = nameOf(at(f, 'BaseFont')) ?? (subtype === 'Type3' ? '(Type 3)' : '(unnamed)')
  let desc = at(f, 'FontDescriptor')
  let cid = null
  if (subtype === 'Type0') {
    const d = at(f, 'DescendantFonts', 0)
    desc = at(d, 'FontDescriptor')
    cid = nameOf(at(d, 'Subtype'))
  }
  const file = ['FontFile', 'FontFile2', 'FontFile3'].find((k) => at(desc, k))
  return {
    name: base.replace(/^[A-Z]{6}\+/, ''),
    type: cid ? `${subtype} (${cid})` : subtype,
    embedded: subtype === 'Type3' || !!file,
    subset: /^[A-Z]{6}\+/.test(base),
    encoding: nameOf(at(f, 'Encoding')),
  }
}

function walkResources(res, seenRes, cb, depth = 0) {
  if (!res || !res.isDictionary() || depth > 8) return
  const key = res.isIndirect() ? `r${res.asIndirect()}` : null
  if (key) {
    if (seenRes.has(key)) return
    seenRes.add(key)
  }
  const fonts = at(res, 'Font')
  if (fonts) fonts.forEach((f) => cb('font', f))
  const xo = at(res, 'XObject')
  if (xo)
    xo.forEach((x) => {
      const st = nameOf(at(x, 'Subtype'))
      if (st === 'Image') cb('image', x)
      else if (st === 'Form') walkResources(at(x, 'Resources'), seenRes, cb, depth + 1)
    })
}

function fieldFacts(root) {
  const af = at(root, 'AcroForm')
  const out = { fields: 0, widgets: 0, types: {}, signatures: 0, signed: 0, xfa: 'none', needAppearances: false }
  if (!af) return out
  out.needAppearances = !!at(af, 'NeedAppearances')?.asBoolean?.()
  const seen = new Set()
  const walk = (node, ft, depth) => {
    if (!node || !node.isDictionary() || depth > 32) return
    const num = node.isIndirect() ? node.asIndirect() : null
    if (num != null) {
      if (seen.has(num)) return
      seen.add(num)
    }
    const type = nameOf(at(node, 'FT')) ?? ft
    const kids = at(node, 'Kids')
    const fieldKids = kids && kids.isArray() ? Array.from({ length: kids.length }, (_, i) => kids.get(i)).filter((k) => at(k, 'T')) : []
    if (fieldKids.length) {
      for (const k of fieldKids) walk(k, type, depth + 1)
      return
    }
    out.fields++
    // a field with several boxes on the page (radio group) has widget kids
    out.widgets += kids && kids.isArray() && kids.length ? kids.length : 1
    out.types[type ?? 'Unknown'] = (out.types[type ?? 'Unknown'] ?? 0) + 1
    if (type === 'Sig') {
      out.signatures++
      if (at(node, 'V')) out.signed++
    }
  }
  const fields = at(af, 'Fields')
  if (fields && fields.isArray()) for (let i = 0; i < fields.length; i++) walk(fields.get(i), null, 0)
  if (at(af, 'XFA')) out.xfa = out.fields - out.signatures === 0 || at(root, 'NeedsRendering')?.asBoolean?.() ? 'dynamic' : 'static'
  return out
}

// Everything worth knowing about a file, as plain JSON.
export async function pdfInfo(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.byteLength, 2048)))
  const meta = await readMetadata(bytes).catch(() => null)
  return withMupdf(bytes, (doc) => {
    const trailer = doc.getTrailer()
    const root = trailer.get('Root')
    const n = doc.countPages()
    const pages = []
    const fonts = new Map()
    const images = new Map()
    const seenRes = new Set()
    const sizes = new Map()
    let annotTotal = 0
    for (let i = 0; i < n; i++) {
      const pageObj = doc.findPage(i)
      const page = doc.loadPage(i)
      const [x0, y0, x1, y1] = page.getBounds()
      const rotation = (((pageObj.getInheritable('Rotate')?.asNumber?.() ?? 0) % 360) + 360) % 360
      const width = Math.round((x1 - x0) * 100) / 100
      const height = Math.round((y1 - y0) * 100) / 100
      const pageFonts = new Set()
      let pageImages = 0
      walkResources(pageObj.getInheritable('Resources'), seenRes, (kind, o) => {
        const key = o.isIndirect() ? o.asIndirect() : `d${fonts.size + images.size}`
        if (kind === 'font') {
          if (!fonts.has(key)) fonts.set(key, { ...fontFacts(o), pages: 0 })
          pageFonts.add(key)
        } else {
          pageImages++
          if (!images.has(key)) {
            const filters = at(o, 'Filter')
            const list = !filters ? [] : filters.isArray() ? Array.from({ length: filters.length }, (_, k) => nameOf(filters.get(k))) : [nameOf(filters)]
            const cs = at(o, 'ColorSpace')
            images.set(key, {
              width: at(o, 'Width')?.asNumber?.() ?? null,
              height: at(o, 'Height')?.asNumber?.() ?? null,
              bitsPerComponent: at(o, 'BitsPerComponent')?.asNumber?.() ?? null,
              colorSpace: cs ? (cs.isName() ? cs.asName() : nameOf(at(cs, 0))) : at(o, 'ImageMask') ? 'mask' : null,
              filter: list.filter(Boolean).join('+') || 'none',
            })
          }
        }
      })
      for (const k of pageFonts) fonts.get(k).pages++
      const annots = annotEntries(pageObj)
      annotTotal += annots.length
      const sizeKey = `${width} x ${height}${rotation ? `, rotated ${rotation}` : ''}`
      sizes.set(sizeKey, (sizes.get(sizeKey) ?? 0) + 1)
      if (i < 2000) pages.push({ page: i + 1, width, height, rotation, label: page.getLabel?.() || null, annotations: annots.length, images: pageImages, fonts: pageFonts.size })
    }
    const kinds = {}
    for (const im of images.values()) kinds[im.filter] = (kinds[im.filter] ?? 0) + 1
    const active = activeContent(doc)
    const attachments = attachmentsOf(doc).map(({ data, key, id, streams, annot, ...rest }) => rest)
    const perms = Object.fromEntries(PERMISSIONS.map((f) => [f.key, doc.hasPermission(f.key)]))
    const enc = doc.getMetaData('encryption')
    let outline = 0
    const countOutline = (items) => items?.forEach((it) => (outline++, countOutline(it.down)))
    try {
      countOutline(doc.loadOutline())
    } catch {
      /* broken outline */
    }
    const fontList = [...fonts.values()].map(({ _seen, ...f }) => f).sort((a, b) => a.name.localeCompare(b.name))
    return {
      file: { size: bytes.byteLength, version: (doc.getMetaData('format') ?? '').replace(/^PDF\s*/, '') || null, linearized: /\/Linearized\b/.test(head), repaired: doc.wasRepaired(), incrementalUpdates: Math.max(0, doc.countVersions() - 1) },
      metadata: meta ? { ...meta.info, custom: meta.custom, xmp: meta.xmp.present, pdfa: meta.pdfa } : null,
      pages: { count: n, sizes: [...sizes].map(([size, count]) => ({ size, count })), list: pages, labels: !!at(root, 'PageLabels') },
      fonts: { count: fontList.length, notEmbedded: fontList.filter((f) => !f.embedded).length, list: fontList },
      images: { count: images.size, kinds, list: [...images.values()].slice(0, 500) },
      forms: fieldFacts(root),
      annotations: annotTotal,
      outline: { items: outline },
      encryption: { encrypted: !!enc && enc !== 'None', method: enc && enc !== 'None' ? enc : null, permissions: perms },
      javascript: { documentScripts: active.documentScripts, actions: active.jsActions, triggers: active.triggers, openAction: active.openActionJs, launch: active.launch },
      attachments: { count: attachments.length, list: attachments },
      structure: { tagged: !!at(root, 'MarkInfo', 'Marked')?.asBoolean?.() || !!at(root, 'StructTreeRoot'), language: strOf(at(root, 'Lang')), optionalContent: !!at(root, 'OCProperties'), outputIntents: !!at(root, 'OutputIntents') },
    }
  })
}

// ---------- auto rename ----------

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

// A name that works on Windows, macOS and Linux, or null when nothing usable
// is left. keepExt keeps an existing extension (attachments).
export function safeFileName(text, { max = 80, keepExt = false } = {}) {
  let s = String(text ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  let ext = ''
  if (keepExt) {
    const m = /(\.[A-Za-z0-9]{1,8})$/.exec(s)
    if (m) {
      ext = m[1]
      s = s.slice(0, -ext.length)
    }
  }
  if (s.length > max) {
    const cut = s.slice(0, max)
    const sp = cut.lastIndexOf(' ')
    s = sp > max * 0.6 ? cut.slice(0, sp) : cut
  }
  s = s.replace(/^[\s.]+|[\s.]+$/g, '')
  if (!s || !/[\p{L}\p{N}]/u.test(s)) return null
  if (RESERVED.test(s)) s = `${s}_`
  return s + ext
}

// Biggest text near the top of the first pages (pdf.js, page only).
export async function firstHeading(bytes, { pages = 2 } = {}) {
  const list = await textLines(bytes, { from: 1, to: pages })
  for (const p of list) {
    const lines = p.lines.filter((l) => headingLike(l.text))
    if (!lines.length) continue
    const body = bodySize(p.lines)
    const top = Math.max(...lines.map((l) => l.size))
    if (top < body * 1.1 && p.page < list.length) continue
    // the biggest line, joined with a second line of the same size below it
    const i = p.lines.findIndex((l) => l.size === top && headingLike(l.text))
    let title = p.lines[i].text
    const next = p.lines[i + 1]
    if (next && Math.abs(next.size - top) < 0.6 && next.y - p.lines[i].y < top * 2.2 && headingLike(next.text)) title = `${title} ${next.text}`
    return title
  }
  return null
}

// Suggested file name: { name, from: 'title' | 'heading' | null }
export async function autoName(bytes, { prefer = 'title' } = {}) {
  const title = async () => {
    const m = await readMetadata(bytes).catch(() => null)
    const t = m?.info?.Title?.trim()
    // generator junk, not a title
    if (!t || /^(untitled|microsoft word - |document\d*$|\.?pdf$)/i.test(t) || /\.(docx?|pdf|indd|tex)$/i.test(t)) return null
    return t
  }
  const order = prefer === 'heading' ? [['heading', () => firstHeading(bytes)], ['title', title]] : [['title', title], ['heading', () => firstHeading(bytes)]]
  for (const [from, get] of order) {
    const name = safeFileName(await get())
    if (name) return { name: `${name}.pdf`, from }
  }
  return { name: null, from: null }
}

// ---------- unlock forms ----------

// XFA attributes that stop a field being filled in.
const XFA_LOCK = /\saccess\s*=\s*"(?:readOnly|protected|nonInteractive)"/g

// The XFA packets as [{ name, stream }] (one unnamed packet when XFA is a
// single stream).
function xfaPackets(root) {
  const x = at(root, 'AcroForm', 'XFA')
  if (!x) return []
  if (x.isStream()) return [{ name: 'xdp', stream: x }]
  if (!x.isArray()) return []
  const out = []
  for (let i = 0; i + 1 < x.length; i += 2) {
    const s = x.get(i + 1)
    if (s.isStream()) out.push({ name: strOf(x.get(i)) ?? '', stream: s })
  }
  return out
}
const streamText = (s) => new TextDecoder().decode(takeBytes(s.readStream()))

// XFA script elements; Adobe writes "</script\n>". An empty <script .../>
// has no end tag and must not swallow what follows.
const XFA_SCRIPT = /<script\b[^>]*(?<!\/)>[\s\S]*?<\/script\s*>/g
// The config packet: its <script> holds settings (runScripts), not code.
const XFA_CONFIG = /<config\b[\s\S]*?<\/config\s*>/g
const withoutConfig = (t) => t.replace(XFA_CONFIG, '')
// t.replace(re, by) outside the config packet of a whole-XDP stream
function replaceOutsideConfig(t, re, by) {
  let out = ''
  let from = 0
  for (const m of t.matchAll(XFA_CONFIG)) {
    out += t.slice(from, m.index).replace(re, by) + m[0]
    from = m.index + m[0].length
  }
  return out + t.slice(from).replace(re, by)
}

// A dynamic XFA form lives only in its XFA (NeedsRendering, or no AcroForm
// field besides signatures). Dropping its XFA leaves the "Please wait" page.
function dynamicXfa(root) {
  if (!at(root, 'AcroForm', 'XFA')) return false
  if (at(root, 'NeedsRendering')?.asBoolean?.()) return true
  const f = fieldFacts(root)
  return f.fields - f.signatures === 0
}
export const DYNAMIC_XFA_MSG = 'This is a dynamic XFA form: the form exists only as XFA, and this change would leave only its "Please wait" page.'

// Clears the read-only flag of every form field (Ff bit 1) and widget
// (annotation flag ReadOnly), and drops the access locks of an XFA template.
// -> { bytes, fields, widgets, xfa, total }; the input comes back unchanged
// when nothing was locked.
export async function unlockForms(bytes) {
  return withMupdf(bytes, (doc) => {
    const root = doc.getTrailer().get('Root')
    if (!at(root, 'AcroForm')) throw new Error('This PDF has no form fields.')
    let fields = 0
    let widgets = 0
    let xfa = 0
    const seen = new Set()
    const unlock = (node) => {
      if (!node || !node.isDictionary()) return false
      if (node.isIndirect()) {
        if (seen.has(node.asIndirect())) return false
        seen.add(node.asIndirect())
      }
      const ff = intOf(at(node, 'Ff'))
      if (ff & 1) {
        node.put('Ff', ff & ~1)
        fields++
      }
      const f = intOf(at(node, 'F'))
      if (nameOf(at(node, 'Subtype')) === 'Widget' && f & 64) {
        node.put('F', f & ~64)
        widgets++
      }
      return true
    }
    const walk = (node, depth) => {
      if (depth > 32 || !unlock(node)) return
      const kids = at(node, 'Kids')
      if (kids?.isArray()) for (let i = 0; i < kids.length; i++) walk(kids.get(i), depth + 1)
    }
    const list = at(root, 'AcroForm', 'Fields')
    if (list?.isArray()) for (let i = 0; i < list.length; i++) walk(list.get(i), 0)
    // widgets that are not in the field tree
    for (let i = 0; i < doc.countPages(); i++) {
      for (const a of annotEntries(doc.findPage(i))) if (a.subtype === 'Widget') unlock(a.dict)
    }
    for (const p of xfaPackets(root)) {
      // the form packet keeps saved state, access included; a single-stream
      // XFA holds every packet
      if (!['template', 'form', 'xdp'].includes(p.name)) continue
      const text = streamText(p.stream)
      const n = ((p.name === 'xdp' ? withoutConfig(text) : text).match(XFA_LOCK) ?? []).length
      if (!n) continue
      p.stream.writeStream(new TextEncoder().encode(p.name === 'xdp' ? replaceOutsideConfig(text, XFA_LOCK, '') : text.replace(XFA_LOCK, '')))
      xfa += n
    }
    const total = fields + widgets + xfa
    return { bytes: total ? saveMu(doc) : new Uint8Array(bytes.slice(0)), fields, widgets, xfa, total }
  })
}

// ---------- show JavaScript ----------

const EVENTS = { K: 'Keystroke', F: 'Format', V: 'Validate', C: 'Calculate', E: 'Mouse enter', X: 'Mouse exit', D: 'Mouse down', U: 'Mouse up', Fo: 'Focus', Bl: 'Blur', PO: 'Page open', PC: 'Page close', PV: 'Page visible', PI: 'Page hidden', WC: 'Before close', WS: 'Before save', DS: 'After save', WP: 'Before print', DP: 'After print' }
const PAGE_EVENTS = { O: 'Page open', C: 'Page close' }

// Script text of a JS entry: a string, or a stream (UTF-16 with a BOM, else
// PDFDocEncoding read as Latin-1).
function jsText(o) {
  if (!o) return null
  if (o.isString()) return o.asString()
  if (!o.isStream()) return null
  const b = takeBytes(o.readStream())
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2))
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder().decode(b.subarray(3))
  return new TextDecoder('latin1').decode(b)
}

// Scripts of an action and its Next chain.
function actionScripts(a, out = [], depth = 0) {
  if (!a || depth > 20) return out
  if (a.isArray()) {
    for (let i = 0; i < a.length; i++) actionScripts(a.get(i), out, depth + 1)
    return out
  }
  if (!a.isDictionary()) return out
  if (nameOf(at(a, 'S')) === 'JavaScript' || at(a, 'JS')) {
    const code = jsText(at(a, 'JS'))
    if (code != null) out.push(code)
  }
  return actionScripts(at(a, 'Next'), out, depth + 1)
}

// Full field name: the /T parts joined with dots.
function fieldName(node) {
  const parts = []
  for (let n = node, k = 0; n && n.isDictionary() && k < 32; n = at(n, 'Parent'), k++) {
    const t = strOf(at(n, 'T'))
    if (t) parts.unshift(t)
  }
  return parts.join('.')
}

// Every script in the file: [{ where, name, page, event, code }] where
// `where` is document, open, document-event, field, page, annotation or xfa.
// XFA scripts are found by their <script> elements, not run or parsed.
export async function listJavaScript(bytes) {
  return withMupdf(bytes, (doc) => {
    const out = []
    const push = (where, name, page, event, action) => {
      for (const code of actionScripts(action)) out.push({ where, name, page, event, code })
    }
    const root = doc.getTrailer().get('Root')
    if (at(root, 'Names', 'JavaScript')) {
      let tree = {}
      try {
        tree = doc.loadNameTree('JavaScript')
      } catch {
        /* broken name tree */
      }
      for (const [name, action] of Object.entries(tree)) push('document', name, null, null, action)
    }
    const oa = at(root, 'OpenAction')
    if (oa?.isDictionary()) push('open', 'Open action', null, 'Document open', oa)
    const aa = at(root, 'AA')
    if (aa?.isDictionary()) aa.forEach((v, k) => push('document-event', EVENTS[k] ?? k, null, EVENTS[k] ?? k, v))

    // pages first, so widgets know their page
    const pageOf = new Map()
    const pageCount = doc.countPages()
    for (let i = 0; i < pageCount; i++) {
      for (const a of annotEntries(doc.findPage(i))) if (a.ref.isIndirect()) pageOf.set(a.ref.asIndirect(), i + 1)
    }
    const seen = new Set()
    const fromNode = (node, where, name, page) => {
      push(where, name, page, EVENTS.U, at(node, 'A'))
      const events = at(node, 'AA')
      if (events?.isDictionary()) events.forEach((v, k) => push(where, name, page, EVENTS[k] ?? k, v))
    }
    const walk = (node, depth) => {
      if (!node || !node.isDictionary() || depth > 32) return
      if (node.isIndirect()) {
        if (seen.has(node.asIndirect())) return
        seen.add(node.asIndirect())
      }
      fromNode(node, 'field', fieldName(node), node.isIndirect() ? (pageOf.get(node.asIndirect()) ?? null) : null)
      const kids = at(node, 'Kids')
      if (kids?.isArray()) for (let i = 0; i < kids.length; i++) walk(kids.get(i), depth + 1)
    }
    const fields = at(root, 'AcroForm', 'Fields')
    if (fields?.isArray()) for (let i = 0; i < fields.length; i++) walk(fields.get(i), 0)

    for (let i = 0; i < pageCount; i++) {
      const page = doc.findPage(i)
      const pa = at(page, 'AA')
      if (pa?.isDictionary()) pa.forEach((v, k) => push('page', `Page ${i + 1}`, i + 1, PAGE_EVENTS[k] ?? k, v))
      for (const a of annotEntries(page)) {
        if (a.ref.isIndirect() && seen.has(a.ref.asIndirect())) continue
        if (a.subtype === 'Widget') fromNode(a.dict, 'field', fieldName(a.dict), i + 1)
        else fromNode(a.dict, 'annotation', `${a.subtype} annotation`, i + 1)
      }
    }
    for (const p of xfaPackets(root)) {
      if (p.name === 'config') continue
      const text = p.name === 'xdp' ? withoutConfig(streamText(p.stream)) : streamText(p.stream)
      for (const m of text.matchAll(XFA_SCRIPT)) {
        const body = /^<script\b[^>]*>([\s\S]*?)<\/script\s*>$/.exec(m[0])[1]
        const code = body
          .replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
          .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
          .replace(/&amp;/g, '&')
          .trim()
        if (!code) continue
        // the field and event it belongs to, from the nearest tags before it
        const before = text.slice(Math.max(0, m.index - 3000), m.index)
        const owner = [...before.matchAll(/<(?:field|subform|exclGroup|draw|pageArea|area)\b[^>]*\bname="([^"]*)"/g)].pop()?.[1]
        const event = [...before.matchAll(/<event\b[^>]*\bactivity="([^"]*)"/g)].pop()?.[1] ?? null
        out.push({ where: 'xfa', name: owner ? `XFA ${owner}` : 'XFA form', page: null, event, code })
      }
    }
    return out.map((s) => ({ ...s, code: s.code.length > 200000 ? `${s.code.slice(0, 200000)}\n/* cut at 200000 characters */` : s.code }))
  })
}

// ---------- extract images ----------

// A JPEG that any viewer shows right as it is: one DCT filter, gray or RGB,
// no mask and no Decode array. CMYK JPEGs are often stored inverted (Adobe),
// so they are decoded instead.
function plainJpeg(o) {
  const f = at(o, 'Filter')
  const filters = !f ? [] : f.isArray() ? Array.from({ length: f.length }, (_, i) => nameOf(f.get(i))) : [nameOf(f)]
  if (filters.length !== 1 || filters[0] !== 'DCTDecode') return false
  if (at(o, 'SMask') || at(o, 'Mask') || at(o, 'Decode') || at(o, 'ImageMask')) return false
  const cs = at(o, 'ColorSpace')
  if (cs?.isName()) return cs.asName() === 'DeviceGray' || cs.asName() === 'DeviceRGB'
  if (cs?.isArray() && nameOf(at(cs, 0)) === 'ICCBased') {
    const n = at(cs, 1, 'N')
    return !!n && (n.asNumber() === 1 || n.asNumber() === 3)
  }
  return false
}

// Copies pixmap samples into a new pixmap, row by row (strides may differ).
function copyPixels(src, dst, fn) {
  const w = src.getWidth()
  const h = src.getHeight()
  const sp = src.getPixels()
  const dp = dst.getPixels()
  // MuPDF's component count includes the alpha channel
  const sn = src.getNumberOfComponents()
  const dn = dst.getNumberOfComponents()
  const ss = src.getStride()
  const ds = dst.getStride()
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) fn(sp, y * ss + x * sn, dp, y * ds + x * dn, x, y)
}

// Decodes an image XObject to PNG or JPEG: gray stays gray, everything else
// becomes RGB, a soft mask becomes the PNG alpha (JPEG: on white).
function encodeImage(doc, mupdf, ref, format) {
  const img = doc.loadImage(ref)
  const temp = [img]
  try {
    let pix = img.toPixmap()
    temp.push(pix)
    const cs = pix.getColorSpace()
    const w = pix.getWidth()
    const h = pix.getHeight()
    let gray = !!cs?.isGray()
    if (!cs) {
      // stencil mask: alpha only, painted = black
      const g = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, w, h], false)
      temp.push(g)
      copyPixels(pix, g, (s, si, d, di) => (d[di] = 255 - s[si]))
      pix = g
      gray = true
    } else if (!gray && !cs.isRGB()) {
      pix = pix.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, true)
      temp.push(pix)
    }
    const n = gray ? 1 : 3
    const mask = img.getMask()
    let mpix = null
    if (mask) {
      temp.push(mask)
      mpix = mask.toPixmap()
      temp.push(mpix)
      // gray or alpha only: one sample, the coverage
      if (mpix.getWidth() !== w || mpix.getHeight() !== h || mpix.getNumberOfComponents() !== 1) mpix = null
    }
    const own = !!pix.getAlpha()
    if (mpix || own) {
      const withAlpha = format === 'png'
      const out = new mupdf.Pixmap(gray ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB, [0, 0, w, h], withAlpha)
      temp.push(out)
      const mp = mpix ? mpix.getPixels() : null
      const ms = mpix ? mpix.getStride() : 0
      const mn = mpix ? mpix.getNumberOfComponents() : 0
      copyPixels(pix, out, (s, si, d, di, x, y) => {
        // MuPDF pixmaps with alpha hold premultiplied colour
        const oa = own ? s[si + n] : 255
        const a = mp ? Math.round((mp[y * ms + x * mn] * oa) / 255) : oa
        for (let c = 0; c < n; c++) {
          const v = own ? (oa ? Math.min(255, Math.round((s[si + c] * 255) / oa)) : 0) : s[si + c]
          d[di + c] = withAlpha ? v : Math.round((v * a + 255 * (255 - a)) / 255)
        }
        if (withAlpha) d[di + n] = a
      })
      pix = out
    }
    return format === 'jpg' ? pix.asJPEG(90, false).slice() : pix.asPNG().slice()
  } finally {
    for (const t of temp.reverse()) t.destroy?.()
  }
}

// Every image XObject once (by object), in page order:
// { images: [{ name, bytes, page, width, height, kept }], failed }.
// format 'png' | 'jpg'; keepJpeg copies plain JPEGs as they are.
export async function extractImages(bytes, { format = 'png', keepJpeg = true, onPage, check } = {}) {
  return withMupdf(bytes, (doc, mupdf) => {
    const images = []
    let failed = 0
    const seen = new Set()
    const seenRes = new Set()
    const n = doc.countPages()
    const pad = (v, k) => String(v).padStart(k, '0')
    for (let i = 0; i < n; i++) {
      check?.()
      const found = []
      walkResources(doc.findPage(i).getInheritable('Resources'), seenRes, (kind, o) => kind === 'image' && found.push(o))
      let k = 0
      for (const ref of found) {
        if (!ref.isIndirect() || seen.has(ref.asIndirect())) continue
        seen.add(ref.asIndirect())
        const width = at(ref, 'Width')?.asNumber?.() ?? 0
        const height = at(ref, 'Height')?.asNumber?.() ?? 0
        const stem = `page${pad(i + 1, 3)}-${pad(++k, 2)}`
        try {
          if ((keepJpeg || format === 'jpg') && plainJpeg(ref)) {
            images.push({ name: `${stem}.jpg`, bytes: takeBytes(ref.readRawStream()), page: i + 1, width, height, kept: true })
          } else {
            images.push({ name: `${stem}.${format}`, bytes: encodeImage(doc, mupdf, ref, format), page: i + 1, width, height, kept: false })
          }
        } catch {
          failed++
        }
      }
      onPage?.(i + 1, n)
    }
    return { images, failed }
  })
}
