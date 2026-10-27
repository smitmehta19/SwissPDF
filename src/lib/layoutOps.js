// Page layout ops: N-up, booklet, overlay, scale / page size, single large
// page, stamp, blank page detection and linearize.
// Imposition (N-up, booklet, single page, overlay pages) embeds every source
// page as a form XObject (vector, nothing is rasterized) and places it with
// one matrix built from pageFrame.js, so rotated pages and offset
// CropBox/MediaBox origins come out the way a viewer shows them. Form fields
// and comments are drawn into the page first (their values stay visible but
// are no longer editable); links and the tag structure cannot follow a page
// onto a sheet. Bookmarks, title and language are carried over.
// Page size keeps the page objects themselves (new boxes, content scaled), so
// fields, comments, links, bookmarks and tags all stay.
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRef,
  PDFNull,
  PDFNumber,
  PDFHexString,
  PDFStream,
  PDFRawStream,
  PDFObjectStream,
  StandardFonts,
  rgb,
  degrees,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  drawObject,
  setGraphicsState,
  rectangle,
  clip,
  endPath,
} from 'pdf-lib'
import { loadPdf } from './pdfOps.js'
import { readOutline } from './splitOps.js'
import { pageFrame, placeAt } from './pageFrame.js'
import { layoutText, runsWidth, runsHeight, drawRuns } from './fonts.js'

// Sheet sizes in points, portrait.
export const SHEETS = {
  a3: [841.89, 1190.55],
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  letter: [612, 792],
  legal: [612, 1008],
}

// Most viewers (Acrobat) stop at 200 inches a side.
export const MAX_SIDE = 14400

// ---------- geometry ----------
// The matrix [a b c d e f] of an affine point function, from three points.
function affine(fn) {
  const o = fn(0, 0)
  const a = fn(1, 0)
  const b = fn(0, 1)
  return [a.x - o.x, a.y - o.y, b.x - o.x, b.y - o.y, o.x, o.y]
}

// m1 first, then m2 (PDF row-vector convention).
function then(m1, m2) {
  const [a, b, c, d, e, f] = m1
  const [A, B, C, D, E, F] = m2
  return [a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D, e * A + f * C + E, e * B + f * D + F]
}

// Scale and offset that fit a w x h page into a box, centred (contain).
function fitInto(w, h, box) {
  const s = Math.min(box.w / w, box.h / h)
  return { s, x: box.x + (box.w - w * s) / 2, y: box.y + (box.h - h * s) / 2 }
}

// A blank sheet whose view space is its user space flipped (rotation 0).
function addSheet(doc, w, h) {
  const page = doc.addPage([w, h])
  return { page, frame: pageFrame(page) }
}

const hasContent = (page) => !!page.node.Contents()
const N = (k) => PDFName.of(k)
const nums = (arr) => (arr instanceof PDFArray ? arr.asArray().map((v) => v?.asNumber?.() ?? 0) : null)

// Gives a page a /Contents array (pages made with addPage have none), so
// streams can be put before and after its content.
function contentsArray(page) {
  const ctx = page.doc.context
  if (!page.node.get(N('Contents'))) page.node.set(N('Contents'), ctx.obj([]))
  page.node.normalize()
}

// Annotation flags: Hidden, NoView.
const F_HIDDEN = 2
const F_NOVIEW = 32

// The normal appearance stream of an annotation (by /AS for state dicts).
function appearanceOf(ctx, a) {
  const ap = ctx.lookup(a.get(N('AP')))
  if (!(ap instanceof PDFDict)) return null
  let ref = ap.get(N('N'))
  const n = ctx.lookup(ref)
  if (n instanceof PDFDict && !(n instanceof PDFStream)) {
    const as = a.get(N('AS'))
    ref = as ? n.get(as) : null
  }
  return ref instanceof PDFRef && ctx.lookup(ref) instanceof PDFStream ? ref : null
}

// Draws every visible annotation's appearance into the page content (form
// field values, comments, stamps), so they survive being embedded as a form.
// Links have no appearance to keep. Returns counts of what was drawn or lost.
function bakeAnnotations(src, indices) {
  const ctx = src.context
  const report = { fields: 0, comments: 0, links: 0 }
  // fields saved without appearances (NeedAppearances) get them first
  try {
    const af = ctx.lookup(src.catalog.get(N('AcroForm')))
    if (af instanceof PDFDict && af.get(N('NeedAppearances'))?.toString() === 'true') src.getForm().updateFieldAppearances()
  } catch {
    /* fonts the standard set cannot draw: keep the stored appearances */
  }
  const pages = src.getPages()
  for (const i of indices) {
    const page = pages[i]
    const annots = ctx.lookup(page.node.get(N('Annots')))
    if (!(annots instanceof PDFArray)) continue
    const ops = []
    for (const item of annots.asArray()) {
      const a = ctx.lookup(item)
      if (!(a instanceof PDFDict)) continue
      const sub = a.get(N('Subtype'))?.toString()
      if (sub === '/Link') {
        report.links++
        continue
      }
      if (sub === '/Popup') continue
      const flags = ctx.lookup(a.get(N('F')))?.asNumber?.() ?? 0
      if (flags & (F_HIDDEN | F_NOVIEW)) continue
      const ref = appearanceOf(ctx, a)
      const rect = nums(ctx.lookup(a.get(N('Rect'))))
      if (!ref || !rect) continue
      const form = ctx.lookup(ref)
      const bbox = nums(ctx.lookup(form.dict.get(N('BBox'))))
      if (!bbox) continue
      // BBox through the form's Matrix, then fitted onto Rect (12.5.5)
      const m = nums(ctx.lookup(form.dict.get(N('Matrix')))) ?? [1, 0, 0, 1, 0, 0]
      const pts = [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[1]],
        [bbox[0], bbox[3]],
        [bbox[2], bbox[3]],
      ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
      const bx0 = Math.min(...pts.map((p) => p[0]))
      const bx1 = Math.max(...pts.map((p) => p[0]))
      const by0 = Math.min(...pts.map((p) => p[1]))
      const by1 = Math.max(...pts.map((p) => p[1]))
      if (bx1 - bx0 <= 0 || by1 - by0 <= 0) continue
      const [rx0, rx1] = [Math.min(rect[0], rect[2]), Math.max(rect[0], rect[2])]
      const [ry0, ry1] = [Math.min(rect[1], rect[3]), Math.max(rect[1], rect[3])]
      const sx = (rx1 - rx0) / (bx1 - bx0)
      const sy = (ry1 - ry0) / (by1 - by0)
      if (!form.dict.get(N('Subtype'))) form.dict.set(N('Subtype'), N('Form'))
      const name = page.node.newXObject('Ann', ref)
      ops.push(pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, sy, rx0 - bx0 * sx, ry0 - by0 * sy), drawObject(name), popGraphicsState())
      if (sub === '/Widget') report.fields++
      else report.comments++
    }
    if (ops.length) {
      contentsArray(page)
      page.pushOperators(...ops)
    }
  }
  return report
}

// Title, author, subject, keywords and language of src onto doc.
function copyInfo(src, doc) {
  for (const [get, set, wrap = (v) => v] of [
    ['getTitle', 'setTitle'],
    ['getAuthor', 'setAuthor'],
    ['getSubject', 'setSubject'],
    ['getKeywords', 'setKeywords', (v) => [v]],
  ]) {
    try {
      const v = src[get]()
      if (v) doc[set](wrap(v))
    } catch {
      /* malformed info entry */
    }
  }
  const lang = src.catalog.get(N('Lang'))
  if (lang) doc.catalog.set(N('Lang'), lang)
}

// Bookmarks of the source, rebuilt on doc. destFor(pageIndex) -> dest array
// items ([ref, /Fit] etc.) or null. Returns the number of bookmarks kept.
async function copyOutline(bytes, doc, destFor) {
  let items
  try {
    items = (await readOutline(bytes)).items
  } catch {
    return 0
  }
  const ctx = doc.context
  // nest the flat list by level
  const root = { children: [] }
  const stack = [root]
  for (const it of items) {
    const node = { ...it, children: [] }
    while (stack.length > it.level) stack.pop()
    stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  if (!root.children.length) return 0
  const rootRef = ctx.nextRef()
  const build = (list, parentRef) => {
    const refs = list.map(() => ctx.nextRef())
    list.forEach((item, i) => {
      const d = ctx.obj({})
      d.set(N('Title'), PDFHexString.fromText(item.title || 'Untitled'))
      d.set(N('Parent'), parentRef)
      if (i > 0) d.set(N('Prev'), refs[i - 1])
      if (i < list.length - 1) d.set(N('Next'), refs[i + 1])
      const dest = item.page ? destFor(item.page - 1) : null
      if (dest) d.set(N('Dest'), ctx.obj(dest))
      if (item.children.length) {
        const kids = build(item.children, refs[i])
        d.set(N('First'), kids[0])
        d.set(N('Last'), kids[kids.length - 1])
        d.set(N('Count'), PDFNumber.of(-item.children.length))
      }
      ctx.assign(refs[i], d)
    })
    return refs
  }
  const top = build(root.children, rootRef)
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: top[0], Last: top[top.length - 1], Count: top.length }))
  doc.catalog.set(N('Outlines'), rootRef)
  return items.length
}

// What an imposed copy kept and lost: { fields, comments, links (lost),
// bookmarks, tags (lost: true when the source was tagged) }.
async function impositionReport(bytes, src, doc, baked, destFor) {
  copyInfo(src, doc)
  const bookmarks = await copyOutline(bytes, doc, destFor)
  return { ...baked, bookmarks, tags: !!src.catalog.get(N('StructTreeRoot')) }
}

// Embeds pages of src (another PDFDocument) into doc as forms, clipped to
// each page's visible box. One call so shared fonts and images are copied
// once. Visible annotations are drawn into the page first.
// Returns { items: [{ form | null, frame }] in the order of `indices`, baked }.
async function embedPages(doc, src, indices) {
  const baked = bakeAnnotations(src, indices)
  const pages = src.getPages()
  const items = indices.map((i) => ({ page: pages[i], frame: pageFrame(pages[i]), form: null }))
  items.baked = baked
  const live = items.filter((it) => hasContent(it.page))
  for (const it of live) {
    // annotations point back at pages and would drag the whole source in
    it.page.node.delete(PDFName.of('Annots'))
    it.page.node.delete(PDFName.of('B'))
  }
  const forms = await doc.embedPages(
    live.map((it) => it.page),
    live.map(({ frame: f }) => ({ left: f.x0, bottom: f.y0, right: f.x1, top: f.y1 })),
    // identity: the form keeps the page's own user space, the draw matrix maps it
    live.map(() => [1, 0, 0, 1, 0, 0]),
  )
  live.forEach((it, k) => (it.form = forms[k]))
  return items
}

// Operators that draw an embedded page so its visible page (view space of
// srcFrame) lands on the view-space box `to` of the target page, upright as
// the target is shown. to = { s, x, y } from fitInto.
function formOps(target, item, to, { opacity = 1 } = {}) {
  const name = target.page.node.newXObject('Lay', item.form.ref)
  const place = [to.s, 0, 0, to.s, to.x, to.y]
  const m = then(then(affine(item.frame.toView), place), affine(target.frame.toUser))
  const ops = [pushGraphicsState()]
  if (opacity < 1) {
    const gs = target.page.node.newExtGState('GS', target.page.doc.context.obj({ Type: 'ExtGState', ca: opacity, CA: opacity }))
    ops.push(setGraphicsState(gs))
  }
  ops.push(concatTransformationMatrix(...m), drawObject(name), popGraphicsState())
  return ops
}

function drawForm(target, item, to, opts) {
  if (!item.form) return // a page without content stays empty
  target.page.pushOperators(...formOps(target, item, to, opts))
}

// Same, but under the page's existing content.
function drawFormBelow(target, item, to, opts) {
  if (!item.form) return
  const { page } = target
  const ctx = page.doc.context
  contentsArray(page)
  const ref = ctx.register(ctx.contentStream(formOps(target, item, to, opts)))
  page.node.Contents().insert(0, ref)
}

// Thin frame around a placed page (view-space box on a rotation-0 sheet).
function drawBorder(sheet, box, width) {
  sheet.page.drawRectangle({
    x: box.x,
    y: sheet.frame.height - box.y - box.h,
    width: box.w,
    height: box.h,
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: width,
  })
}

const sizeOf = (frame) => ({ w: frame.width, h: frame.height })
const allIndices = (doc) => doc.getPageIndices()

// Sheet size from a name, or the first page's visible size ('auto').
function sheetSize(name, first) {
  if (name && name !== 'auto' && SHEETS[name]) return SHEETS[name].slice()
  return [first.w, first.h]
}

function orient([w, h], orientation) {
  if (orientation === 'landscape') return [Math.max(w, h), Math.min(w, h)]
  if (orientation === 'portrait') return [Math.min(w, h), Math.max(w, h)]
  return [w, h]
}

// ---------- N-up ----------
export const NUP_GRIDS = { 2: [2, 1], 4: [2, 2], 6: [3, 2], 9: [3, 3], 16: [4, 4] }

// Columns, rows and sheet size for N pages per sheet. Without fixed values it
// tries both orientations and both grid turns and keeps the one that shows
// the first page biggest.
export function nupPlan(first, { perSheet = 4, cols = null, rows = null, sheet = 'auto', orientation = 'auto', margin = 18, gap = 12 } = {}) {
  const [c0, r0] = cols && rows ? [cols, rows] : (NUP_GRIDS[perSheet] ?? [2, 2])
  const base = sheetSize(sheet, first)
  const grids = cols && rows ? [[c0, r0]] : [[c0, r0], [r0, c0]]
  const orients = orientation === 'auto' ? ['portrait', 'landscape'] : [orientation]
  let best = null
  for (const o of orients) {
    for (const [c, r] of grids) {
      const [W, H] = orient(base, o)
      const cw = (W - 2 * margin - (c - 1) * gap) / c
      const ch = (H - 2 * margin - (r - 1) * gap) / r
      if (cw <= 0 || ch <= 0) continue
      const s = Math.min(cw / first.w, ch / first.h)
      if (!best || s > best.s + 1e-9) best = { s, cols: c, rows: r, W, H, cw, ch }
    }
  }
  if (!best) throw new Error('The margins leave no room for the pages. Make them smaller.')
  return best
}

// Cell of the k-th page on a sheet: { col, row }.
export function nupCell(k, cols, rows, order = 'rows', direction = 'ltr') {
  let col = order === 'cols' ? Math.floor(k / rows) : k % cols
  const row = order === 'cols' ? k % rows : Math.floor(k / cols)
  if (direction === 'rtl') col = cols - 1 - col
  return { col, row }
}

// opts: { perSheet (2|4|6|9|16), cols, rows (custom grid), order ('rows' |
//   'cols'), direction ('ltr' | 'rtl'), sheet ('auto' | a3 | a4 | a5 |
//   letter | legal), orientation ('auto' | 'portrait' | 'landscape'),
//   margin, gap (points), border, borderWidth, check }
// Returns { bytes, report } (report: see impositionReport).
export async function nUp(bytes, opts = {}) {
  const { order = 'rows', direction = 'ltr', margin = 18, gap = 12, border = false, borderWidth = 1, check = null } = opts
  const src = await loadPdf(bytes)
  const doc = await PDFDocument.create()
  const items = await embedPages(doc, src, allIndices(src))
  const plan = nupPlan(sizeOf(items[0].frame), { ...opts, margin, gap })
  const per = plan.cols * plan.rows
  const sheets = []
  items.forEach((item, i) => {
    check?.()
    const k = i % per
    if (k === 0) sheets.push(addSheet(doc, plan.W, plan.H))
    const sheet = sheets[sheets.length - 1]
    const { col, row } = nupCell(k, plan.cols, plan.rows, order, direction)
    const cell = { x: margin + col * (plan.cw + gap), y: margin + row * (plan.ch + gap), w: plan.cw, h: plan.ch }
    const to = fitInto(item.frame.width, item.frame.height, cell)
    drawForm(sheet, item, to)
    if (border) drawBorder(sheet, { x: to.x, y: to.y, w: item.frame.width * to.s, h: item.frame.height * to.s }, borderWidth)
  })
  const report = await impositionReport(bytes, src, doc, items.baked, (i) => [sheets[Math.floor(i / per)].page.ref, N('Fit')])
  return { bytes: await doc.save(), report }
}

// ---------- booklet ----------
// Sheet sides of a 2-up saddle-stitch booklet, as 0-based page slots (null =
// blank padding). Spine left (left-to-right books): the outer front shows
// last | first. Spine right mirrors every side.
export function bookletSides(n, spine = 'left') {
  const total = Math.max(4, Math.ceil(n / 4) * 4)
  const at = (i) => (i < n ? i : null)
  const sides = []
  for (let s = 0; s < total / 4; s++) {
    const lo = 2 * s
    const hi = total - 1 - 2 * s
    let front = [at(hi), at(lo)]
    let back = [at(lo + 1), at(hi - 1)]
    if (spine === 'right') {
      front = front.reverse()
      back = back.reverse()
    }
    sides.push({ sheet: s + 1, side: 'front', slots: front }, { sheet: s + 1, side: 'back', slots: back })
  }
  return sides
}

// opts: { spine ('left' | 'right'), gutter (points of extra space at the
//   spine), border, sides ('both' | 'front' | 'back': print passes for
//   manual duplex), longEdge (turn the backs 180 degrees: a landscape
//   booklet sheet comes out right on short-edge duplex, a printer that can
//   only flip on the long edge prints the backs upside down), sheet ('auto' =
//   two pages side by side at their own size, or a sheet name: landscape),
//   check }
// Returns { bytes, report }.
export async function booklet(bytes, opts = {}) {
  const { spine = 'left', gutter = 0, border = false, sides = 'both', longEdge = false, sheet = 'auto', check = null } = opts
  const src = await loadPdf(bytes)
  const doc = await PDFDocument.create()
  const items = await embedPages(doc, src, allIndices(src))
  // one cell size for every page: the largest visible page
  const cw0 = Math.max(...items.map((it) => it.frame.width))
  const ch0 = Math.max(...items.map((it) => it.frame.height))
  let W = 2 * cw0 + gutter
  let H = ch0
  if (sheet !== 'auto' && SHEETS[sheet]) [W, H] = orient(SHEETS[sheet], 'landscape')
  const cw = (W - gutter) / 2
  const plan = bookletSides(items.length, spine).filter((s) => sides === 'both' || s.side === sides)
  const sheetOf = new Map()
  for (const side of plan) {
    check?.()
    const target = addSheet(doc, W, H)
    side.slots.forEach((slot, k) => {
      if (slot === null) return
      if (!sheetOf.has(slot)) sheetOf.set(slot, target.page.ref)
      const item = items[slot]
      // pages sit against the spine
      const cell = { x: k === 0 ? 0 : cw + gutter, y: 0, w: cw, h: H }
      const fit = fitInto(item.frame.width, item.frame.height, cell)
      const pw = item.frame.width * fit.s
      const to = { ...fit, x: k === 0 ? cw - pw : cw + gutter }
      drawForm(target, item, to)
      if (border) drawBorder(target, { x: to.x, y: to.y, w: pw, h: item.frame.height * fit.s }, 1)
    })
    if (longEdge && side.side === 'back') target.page.setRotation(degrees(180))
  }
  const report = await impositionReport(bytes, src, doc, items.baked, (i) => (sheetOf.has(i) ? [sheetOf.get(i), N('Fit')] : null))
  return { bytes: await doc.save(), report }
}

// ---------- overlay ----------
// Which overlay page (0-based into the joined overlay pages, or null) goes
// on base page i.
//   sequential   overlay page i on base page i, then nothing
//   interleaved  overlay pages cycle: i mod count
//   repeat       each overlay page covers `repeat` base pages in turn, cycling
export function overlayIndex(i, count, mode = 'sequential', repeat = 1) {
  if (count === 0) return null
  if (mode === 'interleaved') return i % count
  if (mode === 'repeat') return Math.floor(i / Math.max(1, repeat)) % count
  return i < count ? i : null
}

// Lays the pages of one or more overlay PDFs on the base pages, fitted to
// each base page as shown (rotation and CropBox of both sides respected).
// The base file keeps everything; fields and comments of the overlay pages
// are drawn in, their links are dropped.
// opts: { mode, repeat, position ('foreground' | 'background'), opacity,
//   pages (base page numbers, null = all), check }
// Returns { bytes, report: { links } } (overlay links not kept).
export async function overlayPdfs(baseBytes, overlays, opts = {}) {
  const { mode = 'sequential', repeat = 1, position = 'foreground', opacity = 1, pages = null, check = null } = opts
  if (!overlays?.length) throw new Error('Add a PDF to lay over the base file.')
  const doc = await loadPdf(baseBytes)
  const items = []
  let links = 0
  for (const bytes of overlays) {
    const ov = await loadPdf(bytes)
    const embedded = await embedPages(doc, ov, allIndices(ov))
    links += embedded.baked.links
    items.push(...embedded)
  }
  const targets = pages ? new Set(pages) : null
  let placed = 0
  let k = 0
  doc.getPages().forEach((page, i) => {
    check?.()
    if (targets && !targets.has(i + 1)) return
    const j = overlayIndex(targets ? k++ : i, items.length, mode, repeat)
    if (j === null) return
    const target = { page, frame: pageFrame(page) }
    const item = items[j]
    const to = fitInto(item.frame.width, item.frame.height, { x: 0, y: 0, w: target.frame.width, h: target.frame.height })
    if (position === 'background') drawFormBelow(target, item, to, { opacity })
    else drawForm(target, item, to, { opacity })
    if (item.form) placed++
  })
  if (placed === 0) throw new Error('No overlay page landed on a base page. Check the mode and pages.')
  return { bytes: await doc.save(), report: { links } }
}

// ---------- scale / page size ----------
// Target size of one page. size: 'keep' | sheet name; orientation: 'auto'
// (follow the page) | 'portrait' | 'landscape'; mode 'fit' | 'factor'.
export function scaledSize(view, { size = 'keep', orientation = 'auto', mode = 'fit', factor = 1 } = {}) {
  if (size === 'keep' || !SHEETS[size]) {
    const f = mode === 'factor' ? factor : 1
    return orient([view.w * f, view.h * f], orientation)
  }
  const auto = view.w > view.h ? 'landscape' : 'portrait'
  return orient(SHEETS[size], orientation === 'auto' ? auto : orientation)
}

// x, y point lists (QuadPoints, Vertices, L, CL...) through m.
const movePoints = (arr, m) => arr.map((v, i) => (i % 2 === 0 ? m[0] * v + m[4] : m[3] * v + m[5]))

// Annotation geometry of one page through the scale matrix m (no rotation).
function moveAnnotations(ctx, page, m, seen) {
  const annots = ctx.lookup(page.node.get(N('Annots')))
  if (!(annots instanceof PDFArray)) return 0
  let moved = 0
  for (const item of annots.asArray()) {
    const a = ctx.lookup(item)
    if (!(a instanceof PDFDict) || seen.has(a)) continue
    seen.add(a)
    for (const key of ['Rect', 'QuadPoints', 'Vertices', 'L', 'CL']) {
      const v = nums(ctx.lookup(a.get(N(key))))
      if (v) a.set(N(key), ctx.obj(movePoints(v, m)))
    }
    const ink = ctx.lookup(a.get(N('InkList')))
    if (ink instanceof PDFArray) a.set(N('InkList'), ctx.obj(ink.asArray().map((p) => movePoints(nums(ctx.lookup(p)) ?? [], m))))
    const rd = nums(ctx.lookup(a.get(N('RD'))))
    if (rd) a.set(N('RD'), ctx.obj(rd.map((v) => v * m[0])))
    moved++
  }
  return moved
}

// Destinations ([page /XYZ left top zoom] and the other forms) that point at
// a scaled page get their coordinates moved too.
function moveDestinations(ctx, matrices) {
  const seen = new Set()
  const fix = (arr) => {
    const page = arr.get(0)
    const kind = arr.get(1)?.toString()
    const m = page instanceof PDFRef ? matrices.get(page.tag) : null
    if (!m) return
    const x = (i) => {
      const v = arr.get(i)?.asNumber?.()
      if (v !== undefined) arr.set(i, PDFNumber.of(m[0] * v + m[4]))
    }
    const y = (i) => {
      const v = arr.get(i)?.asNumber?.()
      if (v !== undefined) arr.set(i, PDFNumber.of(m[3] * v + m[5]))
    }
    if (kind === '/XYZ') x(2), y(3)
    else if (kind === '/FitH' || kind === '/FitBH') y(2)
    else if (kind === '/FitV' || kind === '/FitBV') x(2)
    else if (kind === '/FitR') x(2), y(3), x(4), y(5)
  }
  const walk = (obj) => {
    if (obj instanceof PDFArray) {
      if (seen.has(obj)) return
      seen.add(obj)
      if (obj.size() >= 2 && obj.get(0) instanceof PDFRef && /^\/(XYZ|Fit\w*)$/.test(obj.get(1)?.toString() ?? '')) fix(obj)
      else obj.asArray().forEach(walk)
    } else if (obj instanceof PDFDict && !(obj instanceof PDFStream)) {
      if (seen.has(obj)) return
      seen.add(obj)
      for (const [, v] of obj.entries()) walk(v)
    }
  }
  for (const [, obj] of ctx.enumerateIndirectObjects()) walk(obj)
}

// New page size per page, content fitted (centred, aspect kept) or scaled
// by a factor around the page centre. The pages stay the same objects:
// boxes are replaced, the content is scaled with one matrix, and
// annotations (fields, comments, links) and destinations move with it.
// Rotation is kept, so the page reads the same way.
// opts: { size, orientation, mode, factor, check }
// Returns { bytes, report: { annotations } }.
export async function scalePages(bytes, opts = {}) {
  const { mode = 'fit', factor = 1, check = null } = opts
  if (!(factor > 0)) throw new Error('The scale factor must be above 0.')
  const doc = await loadPdf(bytes)
  const ctx = doc.context
  const matrices = new Map()
  const seen = new Set()
  let annotations = 0
  for (const page of doc.getPages()) {
    check?.()
    const f = pageFrame(page)
    const view = sizeOf(f)
    const [W, H] = scaledSize(view, opts)
    if (W > MAX_SIDE || H > MAX_SIDE) throw new Error('That makes pages over 200 inches a side, which viewers cannot open. Use a smaller factor.')
    const s = mode === 'factor' ? factor : Math.min(W / view.w, H / view.h)
    // the new box in user space (the page keeps its /Rotate)
    const [uw, uh] = f.rotation % 180 ? [H, W] : [W, H]
    const m = [s, 0, 0, s, uw / 2 - (s * (f.x0 + f.x1)) / 2, uh / 2 - (s * (f.y0 + f.y1)) / 2]
    contentsArray(page)
    const start = ctx.contentStream([pushGraphicsState(), concatTransformationMatrix(...m), rectangle(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0), clip(), endPath()])
    page.node.wrapContentStreams(ctx.register(start), ctx.register(ctx.contentStream([popGraphicsState()])))
    const box = ctx.obj([0, 0, uw, uh])
    page.node.set(N('MediaBox'), box)
    // an inherited CropBox would still apply, so set it rather than delete
    page.node.set(N('CropBox'), ctx.obj([0, 0, uw, uh]))
    for (const key of ['BleedBox', 'TrimBox', 'ArtBox']) page.node.delete(N(key))
    annotations += moveAnnotations(ctx, page, m, seen)
    matrices.set(page.ref.tag, m)
  }
  moveDestinations(ctx, matrices)
  return { bytes: await doc.save(), report: { annotations } }
}

// ---------- single large page ----------
// Every page stacked top to bottom on one tall page, centred across.
// Pages over 200 inches are out of spec (Acrobat will not open them), so a
// taller stack is scaled down to fit, to no less than 1/5 of its size.
// Returns { bytes, scale, report }.
export async function singleLargePage(bytes, { check = null } = {}) {
  const src = await loadPdf(bytes)
  const doc = await PDFDocument.create()
  const items = await embedPages(doc, src, allIndices(src))
  const W = Math.max(...items.map((it) => it.frame.width))
  const H = items.reduce((s, it) => s + it.frame.height, 0)
  const s = Math.min(1, (MAX_SIDE - 1) / Math.max(W, H))
  if (s < 0.2) throw new Error(`The pages stack to ${Math.round(H / 72)} inches; one PDF page can be 200. Split the file into parts of about ${Math.max(1, Math.floor((items.length * MAX_SIDE) / H))} pages first.`)
  const sheet = addSheet(doc, W * s, H * s)
  const tops = []
  let y = 0
  for (const item of items) {
    check?.()
    tops.push(y)
    drawForm(sheet, item, { s, x: ((W - item.frame.width) / 2) * s, y: y * s })
    y += item.frame.height
  }
  // bookmarks jump to the top of their page on the long sheet
  const report = await impositionReport(bytes, src, doc, items.baked, (i) => [sheet.page.ref, N('XYZ'), PDFNull, PDFNumber.of((H - tops[i]) * s), PDFNull])
  return { bytes: await doc.save(), scale: s, report }
}

// ---------- stamp ----------
export const STAMP_MARGINS = { small: 18, medium: 36, large: 72 }

function parseColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return rgb(0.8, 0.1, 0.1)
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

// Centre (view space) of a w x h box at a 3x3 grid cell, `margin` from the edges.
function cellCentre(frame, w, h, position, margin) {
  const [v, hz] = String(position).split('-')
  const x = { left: margin, center: (frame.width - w) / 2, right: frame.width - w - margin }[hz] ?? (frame.width - w) / 2
  const y = { top: margin, middle: (frame.height - h) / 2, bottom: frame.height - h - margin }[v] ?? (frame.height - h) / 2
  return { cx: x + w / 2, cy: y + h / 2 }
}

// Bounding box of a w x h box turned by deg.
function turnedBox(w, h, deg) {
  const t = (deg * Math.PI) / 180
  return { w: Math.abs(w * Math.cos(t)) + Math.abs(h * Math.sin(t)), h: Math.abs(w * Math.sin(t)) + Math.abs(h * Math.cos(t)) }
}

// The stamp text for one page. Tokens: {n} page number, {p} page count,
// {date} today (YYYY-MM-DD).
export function stampText(text, n, total, date = new Date()) {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return String(text).replaceAll('{n}', n).replaceAll('{p}', total).replaceAll('{date}', d)
}

// Text or image stamp on the visible page, upright as shown, at a 3x3 grid
// cell. Text in any script fonts.js covers.
// opts: { kind ('text' | 'image'), text, image ({ bytes, type: 'png' |
//   'jpeg' }), position, margin (points or small/medium/large), fontSize,
//   widthPct (image width, % of page width), rotate (degrees, counter-
//   clockwise as seen), opacity, color, pages (list, null = all), check }
// Returns { bytes, report: { shrunk (pages where the text was made smaller to fit) } }.
export async function stampPdf(bytes, opts = {}) {
  const {
    kind = 'text',
    text = '',
    image = null,
    position = 'top-right',
    margin = 'medium',
    fontSize = 24,
    widthPct = 20,
    rotate = 0,
    opacity = 1,
    color = '#d92d20',
    pages = null,
    check = null,
  } = opts
  if (kind === 'text' && !String(text).trim()) throw new Error('Type the stamp text.')
  if (kind === 'image' && !image?.bytes) throw new Error('Choose an image for the stamp.')
  const marginPt = typeof margin === 'number' ? margin : (STAMP_MARGINS[margin] ?? STAMP_MARGINS.medium)
  const doc = await loadPdf(bytes)
  const list = doc.getPages()
  const targets = pages ? new Set(pages) : null
  const fill = parseColor(color)
  const img = kind === 'image' ? (image.type === 'jpeg' ? await doc.embedJpg(image.bytes) : await doc.embedPng(image.bytes)) : null
  const runsCache = new Map()
  let placed = 0
  let shrunk = 0
  for (const [i, page] of list.entries()) {
    check?.()
    if (targets && !targets.has(i + 1)) continue
    const frame = pageFrame(page)
    if (img) {
      const w = (frame.width * widthPct) / 100
      const h = (w / img.width) * img.height
      const box = turnedBox(w, h, rotate)
      const { cx, cy } = cellCentre(frame, box.w, box.h, position, marginPt)
      const at = placeAt(frame, cx, cy, w / 2, h / 2, rotate)
      page.drawImage(img, { x: at.x, y: at.y, width: w, height: h, rotate: at.rotate, opacity })
    } else {
      const line = stampText(text, i + 1, list.length)
      if (!runsCache.has(line)) runsCache.set(line, await layoutText(doc, line, { standard: StandardFonts.HelveticaBold }))
      const runs = runsCache.get(line)
      // a stamp wider than the page between the margins is shrunk to fit
      const room = Math.max(1, frame.width - 2 * marginPt)
      const full = turnedBox(runsWidth(runs, fontSize), runsHeight(runs, fontSize), rotate).w
      const size = full > room ? (fontSize * room) / full : fontSize
      if (size < fontSize) shrunk++
      const w = runsWidth(runs, size)
      const h = runsHeight(runs, size)
      const box = turnedBox(w, h, rotate)
      const { cx, cy } = cellCentre(frame, box.w, box.h, position, marginPt)
      const at = placeAt(frame, cx, cy, w / 2, h / 2, rotate)
      drawRuns(page, runs, { x: at.x, y: at.y, size, rotate: at.rotate, color: fill, opacity })
    }
    placed++
  }
  if (placed === 0) throw new Error('No pages to stamp. Check the page list.')
  return { bytes: await doc.save(), report: { shrunk } }
}

// ---------- blank pages ----------
// Scanned paper is never pure white, so marks are measured against the
// page's own paper: the median brightness. Returns { paper (0-255), clean
// (share of pixels not darker than the paper by more than threshold) }.
// data: RGBA or RGB pixels (step 4 or 3).
export function paperShare(data, threshold = 30, step = 4) {
  const hist = new Uint32Array(256)
  const n = Math.floor(data.length / step)
  for (let i = 0; i < data.length; i += step) hist[Math.round(0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2])]++
  let paper = 0
  for (let seen = 0; paper < 255; paper++) {
    seen += hist[paper]
    if (seen >= n / 2) break
  }
  let ink = 0
  for (let v = 0; v < paper - threshold; v++) ink += hist[v]
  return { paper, clean: 1 - ink / n }
}

// A blank page's paper is light; dark endpapers and covers are not blank.
export const MIN_PAPER = 150

async function decodeShare(bytes, threshold) {
  const bmp = await createImageBitmap(new Blob([bytes]))
  const c = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, bmp.width, bmp.height)
  ctx.drawImage(bmp, 0, 0)
  bmp.close?.()
  return paperShare(ctx.getImageData(0, 0, c.width, c.height).data, threshold)
}

// Pages that look blank (browser only: renders pages). A page with any text
// is never blank; the rest are drawn small and count as blank when their
// paper is light and at least whitePercent % of the pixels are no darker
// than the paper by more than threshold (0-255).
// Returns [{ page, white }] (white = clean share in %, 1 decimal).
export async function findBlankPages(bytes, { threshold = 30, whitePercent = 99.9, width = 300, onPage = null, check = null } = {}) {
  const { getPageTexts } = await import('./pdfText.js')
  const { renderPageForExport, closeMupdf } = await import('./mupdfRender.js')
  const texts = await getPageTexts(bytes)
  const blank = []
  try {
    for (const [i, t] of texts.entries()) {
      check?.()
      onPage?.(i + 1, texts.length)
      if (t.replace(/\s+/g, '')) continue
      const img = await renderPageForExport(bytes, i + 1, { width, format: 'image/png' })
      const { paper, clean } = await decodeShare(img.bytes, threshold)
      if (paper >= MIN_PAPER && clean * 100 >= whitePercent) blank.push({ page: i + 1, white: Math.round(clean * 1000) / 10 })
    }
  } finally {
    closeMupdf()
  }
  return blank
}

// ---------- linearize (fast web view) ----------
// MuPDF 1.26+ dropped linearization, so this writes the layout of ISO 32000
// Annex F itself: linearization dict, first-page xref stream, catalog,
// primary hint stream (page offset + shared object tables), first page,
// other pages, shared objects, the rest, main xref stream. Objects are
// renumbered so each section is one run of numbers. Pages and what they use
// are written as plain objects (the hint tables point at them); the rest
// (structure tree, outlines, names, page tree) goes into object streams, so
// tagged files do not grow. Inherited page attributes are pushed down to the
// pages first.

const enc = new TextEncoder()
const SKIP = new Set(['Parent', 'P', 'B'].map((k) => PDFName.of(k)))
const PACK = 100 // objects per object stream

// Refs inside an object. Page walks skip the keys that point back up or
// across (Parent, P, B).
function refsIn(obj, out, all = false) {
  if (obj instanceof PDFRef) out.push(obj)
  else if (obj instanceof PDFDict) {
    for (const [k, v] of obj.entries()) if (all || !SKIP.has(k)) refsIn(v, out, all)
  } else if (obj instanceof PDFArray) for (const v of obj.asArray()) refsIn(v, out, all)
  else if (obj instanceof PDFStream) {
    // stream lengths are written direct, an indirect /Length is dropped
    for (const [k, v] of obj.dict.entries()) if (k !== PDFName.of('Length') && (all || !SKIP.has(k))) refsIn(v, out, all)
  }
  return out
}

const typeOf = (obj) => {
  const d = obj instanceof PDFStream ? obj.dict : obj
  return d instanceof PDFDict ? d.get(PDFName.of('Type')) : null
}

// Objects reachable from the start refs, in visit order. A page walk never
// enters another page, the page tree, the catalog or the structure tree (a
// signature field can point at the catalog); `all` follows every key and node.
const STOP = new Set(['Page', 'Pages', 'Catalog', 'StructTreeRoot', 'StructElem', 'Outlines'].map((k) => PDFName.of(k)))
function closure(ctx, start, all = false) {
  const seen = []
  const stack = [...start].reverse()
  const starts = new Set(start.map((r) => r.tag))
  const local = new Set()
  while (stack.length) {
    const ref = stack.pop()
    if (local.has(ref.tag)) continue
    const obj = ctx.lookup(ref)
    if (obj === undefined) continue
    const t = typeOf(obj)
    if (!all && !starts.has(ref.tag) && STOP.has(t)) continue
    local.add(ref.tag)
    seen.push(ref)
    const kids = refsIn(obj, [], all)
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i])
  }
  return seen
}

// Deep copy of obj with refs renumbered (unknown refs become null).
function remap(obj, map, ctx) {
  if (obj instanceof PDFRef) {
    const n = map.get(obj.tag)
    return n ? PDFRef.of(n, 0) : PDFNull
  }
  if (obj instanceof PDFDict) {
    const d = PDFDict.withContext(ctx)
    for (const [k, v] of obj.entries()) d.set(k, remap(v, map, ctx))
    return d
  }
  if (obj instanceof PDFArray) {
    const a = PDFArray.withContext(ctx)
    for (const v of obj.asArray()) a.push(remap(v, map, ctx))
    return a
  }
  if (obj instanceof PDFStream) {
    obj.updateDict?.()
    return PDFRawStream.of(remap(obj.dict, map, ctx), obj.getContents())
  }
  return obj
}

function objectBytes(num, obj) {
  const head = enc.encode(`${num} 0 obj\n`)
  const size = obj.sizeInBytes()
  const tail = enc.encode('\nendobj\n')
  const out = new Uint8Array(head.length + size + tail.length)
  out.set(head, 0)
  obj.copyBytesInto(out, head.length)
  out.set(tail, head.length + size)
  return out
}

// Big-endian bit writer for the hint tables.
class Bits {
  constructor() {
    this.bytes = []
    this.cur = 0
    this.n = 0
  }
  put(value, bits) {
    for (let i = bits - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | (Math.floor(value / 2 ** i) & 1)
      if (++this.n === 8) this.flush()
    }
  }
  flush() {
    if (this.n === 0) return
    this.bytes.push((this.cur << (8 - this.n)) & 255)
    this.cur = 0
    this.n = 0
  }
}
const bitsFor = (n) => (n <= 0 ? 0 : Math.floor(Math.log2(n)) + 1)
const pad10 = (n) => String(n).padStart(10, '0')
const sum = (list) => list.reduce((s, b) => s + b.length, 0)

// Cross-reference stream rows with fixed widths [1 4 2]: type, offset or
// object stream number, generation or index.
function xrefRows(rows) {
  const out = new Uint8Array(rows.length * 7)
  rows.forEach(([t, a, b], i) => {
    const o = i * 7
    out[o] = t
    out[o + 1] = (a >>> 24) & 255
    out[o + 2] = (a >>> 16) & 255
    out[o + 3] = (a >>> 8) & 255
    out[o + 4] = a & 255
    out[o + 5] = (b >>> 8) & 255
    out[o + 6] = b & 255
  })
  return out
}

// PNG Up predictor rows (each row minus the one above): xref rows then
// compress to a few bytes each.
function pngUp(data, cols) {
  const rows = data.length / cols
  const out = new Uint8Array(rows * (cols + 1))
  for (let r = 0; r < rows; r++) {
    out[r * (cols + 1)] = 2
    for (let i = 0; i < cols; i++) out[r * (cols + 1) + 1 + i] = (data[r * cols + i] - (r ? data[(r - 1) * cols + i] : 0)) & 255
  }
  return out
}

function streamObject(num, dictText, data) {
  const head = enc.encode(`${num} 0 obj\n${dictText.replace('%LEN%', data.length)}\nstream\n`)
  const tail = enc.encode('\nendstream\nendobj\n')
  const out = new Uint8Array(head.length + data.length + tail.length)
  out.set(head, 0)
  out.set(data, head.length)
  out.set(tail, head.length + data.length)
  return out
}

async function deflate(data) {
  const cs = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(cs).arrayBuffer())
}

export async function linearizePdf(bytes, { check = null } = {}) {
  const doc = await loadPdf(bytes)
  const ctx = doc.context
  const pages = doc.getPages()
  // inherited attributes go onto every page, so each page stands on its own
  for (const page of pages) {
    for (const key of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
      const name = PDFName.of(key)
      if (page.node.get(name) === undefined) {
        const v = page.node.getInheritableAttribute(name)
        if (v !== undefined) page.node.set(name, v)
      }
    }
  }
  const rootRef = ctx.trailerInfo.Root
  let infoRef = ctx.trailerInfo.Info instanceof PDFRef ? ctx.trailerInfo.Info : null
  // a direct Info dict becomes an object of its own
  if (!infoRef && ctx.trailerInfo.Info instanceof PDFDict) infoRef = ctx.register(ctx.trailerInfo.Info)
  const placed = new Set()
  const take = (refs) => refs.filter((r) => !placed.has(r.tag) && placed.add(r.tag))

  // which pages use each object (first page included)
  const pageSets = pages.map((p) => closure(ctx, [p.ref]))
  const users = new Map()
  pageSets.forEach((set, i) => set.forEach((r) => users.set(r.tag, (users.get(r.tag) ?? new Set()).add(i))))
  // objects the catalog also reaches (structure tree, outlines, names) count
  // as shared, as qpdf counts them
  for (const r of closure(ctx, [rootRef, ...(infoRef ? [infoRef] : [])])) users.get(r.tag)?.add('doc')
  const isShared = (r, i) => users.get(r.tag).size > 1 && r !== pages[i].ref
  check?.()

  // part 4: catalog and what opening the document needs
  const root = ctx.lookup(rootRef, PDFDict)
  // (optional content config too: viewers read it before drawing page 1)
  const open = ['ViewerPreferences', 'PageMode', 'Threads', 'OpenAction', 'AcroForm', 'OCProperties'].map((k) => root.get(PDFName.of(k))).filter(Boolean)
  const part4 = take([rootRef, ...closure(ctx, open.flatMap((v) => refsIn(v, []))).filter((r) => !users.has(r.tag))])
  // part 6: the first page and everything it uses
  const part6 = take(pageSets[0])
  // part 7: each other page with the objects only it uses
  const part7 = pages.slice(1).map((p, k) => take(pageSets[k + 1].filter((r) => !isShared(r, k + 1))))
  // part 8: objects shared by several pages
  const part8 = take(pageSets.slice(1).flat())
  // part 9: the rest (page tree, outlines, names, structure tree, info);
  // streams stay plain, everything else is packed into object streams
  const part9 = take(closure(ctx, [rootRef, ...(infoRef ? [infoRef] : [])], true))
  const part9plain = part9.filter((r) => ctx.lookup(r) instanceof PDFStream)
  const part9packed = part9.filter((r) => !(ctx.lookup(r) instanceof PDFStream))
  const packs = []
  for (let i = 0; i < part9packed.length; i += PACK) packs.push(part9packed.slice(i, i + PACK))

  // numbering: main section 1..n-1 (parts 7, 8, 9, object streams, main
  // xref); first-page section n.. (linearization dict, first-page xref,
  // part 4, part 6, hint stream)
  const map = new Map()
  let num = 1
  for (const r of [...part7.flat(), ...part8, ...part9plain, ...part9packed]) map.set(r.tag, num++)
  const packNums = packs.map(() => num++)
  const mainXrefNum = num++
  const n = num
  const linNum = num++
  const firstXrefNum = num++
  for (const r of [...part4, ...part6]) map.set(r.tag, num++)
  const hintNum = num++
  const total = num

  const ser = (r) => objectBytes(map.get(r.tag), remap(ctx.lookup(r), map, ctx))
  const b4 = part4.map(ser)
  const b6 = part6.map(ser)
  const b7 = part7.map((list) => list.map(ser))
  const b8 = part8.map(ser)
  const b9 = part9plain.map(ser)
  const bPacks = packs.map((list, k) =>
    objectBytes(
      packNums[k],
      PDFObjectStream.withContextAndObjects(
        ctx,
        list.map((r) => [PDFRef.of(map.get(r.tag), 0), remap(ctx.lookup(r), map, ctx)]),
        true,
      ),
    ),
  )
  check?.()

  const oldId = ctx.trailerInfo.ID
  let id
  if (oldId instanceof PDFArray) id = oldId.toString()
  else {
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('')
    id = `[<${hex}> <${hex}>]`
  }
  // object streams need 1.5; keep a newer source version
  const v = /%PDF-(\d)\.(\d)/.exec(new TextDecoder('latin1').decode(bytes.subarray(0, 1024)))
  const version = v && Number(`${v[1]}.${v[2]}`) > 1.5 ? `${v[1]}.${v[2]}` : '1.5'
  const header = new Uint8Array([...enc.encode(`%PDF-${version}\n%`), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])
  const linText = (L, hOff, hLen, E, T) =>
    `${linNum} 0 obj\n<< /Linearized 1 /L ${pad10(L)} /H [ ${pad10(hOff)} ${pad10(hLen)} ] /O ${map.get(pages[0].ref.tag)} /E ${pad10(E)} /N ${pages.length} /T ${pad10(T)} >>\nendobj\n`
  const info = infoRef && map.has(infoRef.tag) ? ` /Info ${map.get(infoRef.tag)} 0 R` : ''
  const trailerKeys = ` /Root ${map.get(rootRef.tag)} 0 R${info} /ID ${id}`
  // first-page xref stream: fixed widths, not compressed, so its length is
  // known before the offsets are
  const firstXref = (offsets, prev) => {
    const rows = []
    for (let k = n; k < total; k++) rows.push([1, offsets.get(k) ?? 0, 0])
    return streamObject(firstXrefNum, `<< /Type /XRef /Size ${total} /Index [ ${n} ${total - n} ] /W [ 1 4 2 ]${trailerKeys} /Prev ${pad10(prev)} /Length %LEN% >>`, xrefRows(rows))
  }
  const linLen = enc.encode(linText(0, 0, 0, 0, 0)).length
  const xrefLen = firstXref(new Map(), 0).length

  // Offsets as if there were no hint stream: hint tables use these.
  const at4 = header.length + linLen + xrefLen
  const at6 = at4 + sum(b4)
  const at8 = at6 + sum(b6) + b7.reduce((s, l) => s + sum(l), 0)

  // page offset hint table
  const nobj = [part6.length, ...part7.map((l) => l.length)]
  const plen = [sum(b6), ...b7.map(sum)]
  const sharedIndex = new Map()
  part6.forEach((r, i) => sharedIndex.set(r.tag, i))
  part8.forEach((r, i) => sharedIndex.set(r.tag, part6.length + i))
  const shared = pages.map((p, i) => (i === 0 ? [] : pageSets[i].filter((r) => isShared(r, i)).map((r) => sharedIndex.get(r.tag)).filter((x) => x !== undefined)))
  const minObj = Math.min(...nobj)
  const minLen = Math.min(...plen)
  const nbObj = bitsFor(Math.max(...nobj) - minObj)
  const nbLen = bitsFor(Math.max(...plen) - minLen)
  const nbShared = bitsFor(Math.max(0, ...shared.map((s) => s.length)))
  const nbId = bitsFor(part6.length + part8.length - 1)
  const bits = new Bits()
  bits.put(minObj, 32)
  bits.put(at6, 32) // first page object
  bits.put(nbObj, 16)
  bits.put(minLen, 32)
  bits.put(nbLen, 16)
  // content stream offsets and lengths: left at 0, readers do not use them
  bits.put(0, 32)
  bits.put(0, 16)
  bits.put(0, 32)
  bits.put(0, 16)
  bits.put(nbShared, 16)
  bits.put(nbId, 16)
  bits.put(0, 16) // numerator bits
  bits.put(1, 16) // denominator
  nobj.forEach((v) => bits.put(v - minObj, nbObj))
  bits.flush()
  plen.forEach((v) => bits.put(v - minLen, nbLen))
  bits.flush()
  shared.forEach((s) => bits.put(s.length, nbShared))
  bits.flush()
  shared.forEach((s) => s.forEach((x) => bits.put(x, nbId)))
  bits.flush()
  const sOffset = bits.bytes.length

  // shared object hint table: one group per object, first page objects first
  const glen = [...b6, ...b8].map((b) => b.length)
  const minG = Math.min(...glen)
  const nbG = bitsFor(Math.max(...glen) - minG)
  bits.put(part8.length ? map.get(part8[0].tag) : 0, 32)
  bits.put(part8.length ? at8 : 0, 32)
  bits.put(part6.length, 32)
  bits.put(part6.length + part8.length, 32)
  bits.put(0, 16) // every group is one object
  bits.put(minG, 32)
  bits.put(nbG, 16)
  glen.forEach((v) => bits.put(v - minG, nbG))
  bits.flush()
  glen.forEach(() => bits.put(0, 1)) // no MD5 signatures
  bits.flush()
  const hintBytes = streamObject(hintNum, `<< /Length %LEN% /S ${sOffset} >>`, new Uint8Array(bits.bytes))
  const hintLen = hintBytes.length

  // real offsets
  const firstXrefAt = header.length + linLen
  const offsets = new Map([
    [linNum, header.length],
    [firstXrefNum, firstXrefAt],
  ])
  let p = at4
  const place = (r, b) => {
    offsets.set(map.get(r.tag), p)
    p += b.length
  }
  part4.forEach((r, i) => place(r, b4[i]))
  offsets.set(hintNum, p)
  p += hintLen
  part6.forEach((r, i) => place(r, b6[i]))
  const E = p
  part7.forEach((list, k) => list.forEach((r, i) => place(r, b7[k][i])))
  part8.forEach((r, i) => place(r, b8[i]))
  part9plain.forEach((r, i) => place(r, b9[i]))
  bPacks.forEach((b, k) => {
    offsets.set(packNums[k], p)
    p += b.length
  })
  const mainAt = p
  offsets.set(mainXrefNum, mainAt)

  // main xref stream: every object of the main section, packed ones by
  // object stream and index
  const where = new Map()
  packs.forEach((list, k) => list.forEach((r, i) => where.set(map.get(r.tag), [packNums[k], i])))
  const rows = [[0, 0, 65535]]
  for (let k = 1; k < n; k++) rows.push(where.has(k) ? [2, ...where.get(k)] : [1, offsets.get(k), 0])
  const mainData = await deflate(pngUp(xrefRows(rows), 7))
  const mainBytes = streamObject(mainXrefNum, `<< /Type /XRef /Size ${n} /Index [ 0 ${n} ] /W [ 1 4 2 ]${trailerKeys} /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 7 >> /Length %LEN% >>`, mainData)
  const tail = enc.encode(`startxref\n${firstXrefAt}\n%%EOF\n`)
  const L = mainAt + mainBytes.length + tail.length
  // T: the white space before the main xref stream object (as Acrobat writes it)
  const T = mainAt - 1

  const parts = [header, enc.encode(linText(L, at6, hintLen, E, T)), firstXref(offsets, mainAt), ...b4, hintBytes, ...b6, ...b7.flat(), ...b8, ...b9, ...bPacks, mainBytes, tail]
  const out = new Uint8Array(L)
  let o = 0
  for (const b of parts) {
    out.set(b, o)
    o += b.length
  }
  if (o !== L) throw new Error('Linearize: layout length mismatch.')
  return out
}
