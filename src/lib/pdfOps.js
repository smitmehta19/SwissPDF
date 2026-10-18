// Every PDF operation in the app lives here as a pure function on bytes.
// UI components and the self-test harness both call these, so what the
// health check verifies is exactly what the tools run.
import {
  PDFDocument,
  PDFPage,
  PDFObjectCopier,
  PDFDict,
  PDFArray,
  PDFName,
  PDFRef,
  PDFNull,
  PDFNumber,
  PDFString,
  PDFHexString,
  degrees,
} from 'pdf-lib'

const ENCRYPTED_MSG = 'This PDF is password-protected. Unlock it first.'
const INVALID_MSG = 'Not a valid PDF file.'

async function tryLoad(bytes, options) {
  try {
    const doc = await PDFDocument.load(bytes, options)
    return doc.getPageCount() > 0 ? { doc } : { err: new Error('no pages found') }
  } catch (err) {
    return { err }
  }
}

// pdf-lib first; if it cannot read the file, intake repairs/unlocks it
// (MuPDF) and we retry on those bytes.
async function openPdf(bytes, options) {
  const first = await tryLoad(bytes, options)
  if (first.doc) return first.doc
  let normalized = null
  try {
    const { normalizePdf } = await import('./intake.js')
    normalized = await normalizePdf(bytes, {})
  } catch (err) {
    if (err?.code === 'NEEDS_PASSWORD' || err?.code === 'WRONG_PASSWORD') throw new Error(ENCRYPTED_MSG)
  }
  if (normalized?.bytes) {
    const second = await tryLoad(normalized.bytes, options)
    if (second.doc) return second.doc
  }
  if (/encrypted/i.test(String(first.err))) throw new Error(ENCRYPTED_MSG)
  throw new Error(INVALID_MSG)
}

export async function loadPdf(bytes) {
  return openPdf(bytes)
}

// Light check of an output before it is offered for download: header, EOF
// marker and a page count from a cheap parse (pdf.js, then MuPDF, then
// pdf-lib), so a broken result surfaces as an error instead of a corrupt file.
export async function assertValidOutput(bytes) {
  try {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    if (data.length < 32) throw new Error('output is empty')
    if (!latin1(data.subarray(0, 1024)).includes('%PDF-')) throw new Error('missing %PDF header')
    if (!latin1(data.subarray(Math.max(0, data.length - 4096))).includes('%%EOF')) throw new Error('missing %%EOF marker')
    const pageCount = await countPages(data)
    if (!(pageCount >= 1)) throw new Error('output has no pages')
    return { pageCount }
  } catch (err) {
    throw new Error(`Self-check failed: the produced PDF is invalid (${err.message}). Nothing was downloaded.`)
  }
}

function latin1(arr) {
  let s = ''
  for (let i = 0; i < arr.length; i += 8192) s += String.fromCharCode.apply(null, arr.subarray(i, i + 8192))
  return s
}

async function countPages(data) {
  let lastErr
  try {
    // shared pdf.js worker, document not kept open
    const { countPdfPages } = await import('./pdfText.js')
    const n = await countPdfPages(data)
    if (n >= 1) return n
  } catch (err) {
    lastErr = err
  }
  try {
    const mupdf = await import('mupdf')
    const doc = mupdf.Document.openDocument(data.slice(), 'application/pdf')
    try {
      const n = doc.countPages()
      if (n >= 1) return n
    } finally {
      doc.destroy?.()
    }
  } catch (err) {
    lastErr = err
  }
  try {
    return (await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false })).getPageCount()
  } catch (err) {
    throw lastErr ?? err
  }
}

// inputs: array of raw bytes, or { bytes, pageNumbers, name } where pageNumbers
// is a 1-based ordered subset of pages to contribute (per-file edits before
// merging) and name (optional) titles the file's top-level bookmark.
export async function mergePdfs(inputs) {
  const parts = []
  for (const [i, input] of inputs.entries()) {
    const bytes = input?.bytes ?? input
    const src = await openPdf(bytes, { updateMetadata: false })
    const indices = input?.pageNumbers ? input.pageNumbers.map((n) => n - 1) : src.getPageIndices()
    if (indices.some((idx) => !(idx >= 0 && idx < src.getPageCount()))) {
      throw new Error('A selected page no longer exists in the source file.')
    }
    parts.push({ src, indices, title: partTitle(input?.name, src, i) })
  }
  const used = parts.filter((p) => p.indices.length > 0)
  if (used.length === 0) {
    throw new Error('Every page was deleted, there is nothing to merge.')
  }
  const out = await assemble(used, { wrap: used.length > 1 })
  return out.save()
}

// pageNumbers are 1-based. Returns bytes of a new PDF with just those pages.
export async function extractPages(bytes, pageNumbers) {
  const src = await openPdf(bytes, { updateMetadata: false })
  const indices = pageNumbers.map((n) => n - 1)
  if (indices.length === 0 || indices.some((i) => !(i >= 0 && i < src.getPageCount()))) {
    throw new Error('A selected page does not exist in this file.')
  }
  return (await assemble([{ src, indices }])).save()
}

export async function removePages(bytes, pageNumbers) {
  const src = await openPdf(bytes, { updateMetadata: false })
  const toRemove = new Set(pageNumbers)
  const keep = src.getPageIndices().filter((i) => !toRemove.has(i + 1))
  if (keep.length === 0) {
    throw new Error('That would remove every page, nothing would be left.')
  }
  return (await assemble([{ src, indices: keep }])).save()
}

// ranges: [{from, to}] 1-based inclusive. Returns one output per range.
export async function splitByRanges(bytes, ranges) {
  const src = await openPdf(bytes, { updateMetadata: false })
  const outputs = []
  for (const { from, to } of ranges) {
    const indices = []
    for (let n = from; n <= to; n++) indices.push(n - 1)
    if (indices.length === 0 || indices.some((i) => !(i >= 0 && i < src.getPageCount()))) {
      throw new Error(`Range ${from}-${to} is outside this file.`)
    }
    const out = await assemble([{ src, indices }])
    outputs.push({ from, to, bytes: await out.save() })
  }
  return outputs
}

// angleDelta: 90 | 180 | 270, added to each page's existing rotation.
// pageNumbers: 1-based list, or null for all pages.
export async function rotatePdf(bytes, angleDelta, pageNumbers = null) {
  if (![90, 180, 270].includes(angleDelta)) {
    throw new Error('Rotation must be 90, 180, or 270 degrees.')
  }
  const doc = await loadPdf(bytes)
  const targets = pageNumbers ? new Set(pageNumbers) : null
  doc.getPages().forEach((page, i) => {
    if (targets && !targets.has(i + 1)) return
    const current = page.getRotation().angle
    page.setRotation(degrees(((current + angleDelta) % 360 + 360) % 360))
  })
  return doc.save()
}

// newOrder: array of 0-based source indices in their new sequence.
// Must be a permutation of every page exactly once.
export async function reorderPages(bytes, newOrder) {
  const src = await openPdf(bytes, { updateMetadata: false })
  const count = src.getPageCount()
  const seen = new Set(newOrder)
  if (newOrder.length !== count || seen.size !== count || newOrder.some((i) => i < 0 || i >= count)) {
    throw new Error('Reorder list must contain every page exactly once.')
  }
  return (await assemble([{ src, indices: newOrder }])).save()
}

export async function getPageCount(bytes) {
  const doc = await loadPdf(bytes)
  return doc.getPageCount()
}

// Reads each page's effective rotation, used by tests and the health check.
export async function getRotations(bytes) {
  const doc = await loadPdf(bytes)
  return doc.getPages().map((p) => p.getRotation().angle)
}

// ---------------------------------------------------------------------------
// Page assembly that keeps document structure.
//
// pdf-lib copyPages only copies page objects. Here every page of a part is
// copied with one copier whose map is pre-seeded: kept source pages point to
// their new refs, dropped pages (and their widgets) to null. Links and
// destinations then resolve to the new pages instead of dragging in copies of
// pages that were left out. On top of that the document-level structures are
// rebuilt: bookmarks, named destinations, AcroForm fields, page labels,
// optional content and metadata.
// ---------------------------------------------------------------------------

const N = (s) => PDFName.of(s)
const K = {
  Annots: N('Annots'),
  Subtype: N('Subtype'),
  Widget: N('Widget'),
  Link: N('Link'),
  Dest: N('Dest'),
  D: N('D'),
  A: N('A'),
  S: N('S'),
  GoTo: N('GoTo'),
  P: N('P'),
  Kids: N('Kids'),
  Names: N('Names'),
  Nums: N('Nums'),
  Dests: N('Dests'),
  T: N('T'),
  DA: N('DA'),
  Q: N('Q'),
  DR: N('DR'),
  Fields: N('Fields'),
  AcroForm: N('AcroForm'),
  NeedAppearances: N('NeedAppearances'),
  SigFlags: N('SigFlags'),
  CO: N('CO'),
  Outlines: N('Outlines'),
  First: N('First'),
  Next: N('Next'),
  Title: N('Title'),
  Count: N('Count'),
  C: N('C'),
  F: N('F'),
  Pages: N('Pages'),
  PageLabels: N('PageLabels'),
  St: N('St'),
  Metadata: N('Metadata'),
  OCProperties: N('OCProperties'),
  OCGs: N('OCGs'),
  OFF: N('OFF'),
  StructTreeRoot: N('StructTreeRoot'),
}
const MAX_OUTLINE_ITEMS = 20000

function deref(ctx, obj) {
  return obj instanceof PDFRef ? ctx.lookup(obj) : obj
}

function decodeText(obj) {
  if (obj instanceof PDFString || obj instanceof PDFHexString) return obj.decodeText()
  if (obj instanceof PDFName) return obj.decodeText()
  return ''
}

function bytesKey(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

// Named destinations live either in the catalog /Dests dict (PDF names) or in
// the /Names /Dests tree (strings). Keys carry their kind so both survive.
function destKey(obj) {
  if (obj instanceof PDFName) return 'n:' + obj.decodeText()
  if (obj instanceof PDFString || obj instanceof PDFHexString) return 's:' + bytesKey(obj.asBytes())
  return null
}

function keyObject(key) {
  const body = key.slice(2)
  if (key.startsWith('n:')) return PDFName.of(body)
  let hex = ''
  for (let i = 0; i < body.length; i++) hex += body.charCodeAt(i).toString(16).padStart(2, '0')
  return PDFHexString.of(hex)
}

function walkTree(ctx, node, leafKey, cb, seen = new Set(), depth = 0) {
  if (depth > 32) return
  if (node instanceof PDFRef) {
    if (seen.has(node)) return
    seen.add(node)
  }
  const dict = deref(ctx, node)
  if (!(dict instanceof PDFDict)) return
  const leaves = dict.lookup(leafKey)
  if (leaves instanceof PDFArray) {
    for (let i = 0; i + 1 < leaves.size(); i += 2) cb(deref(ctx, leaves.get(i)), leaves.get(i + 1))
  }
  const kids = dict.lookup(K.Kids)
  if (kids instanceof PDFArray) {
    for (let i = 0; i < kids.size(); i++) walkTree(ctx, kids.get(i), leafKey, cb, seen, depth + 1)
  }
}

// A destination value (array, or dict with /D) as the explicit array.
function destArray(ctx, value) {
  let v = deref(ctx, value)
  if (v instanceof PDFDict) v = deref(ctx, v.get(K.D))
  return v instanceof PDFArray ? v : null
}

// Everything about a source that does not depend on which pages are kept.
// Cached so a split parses the outline and name tables once.
const sourceCache = new WeakMap()
function sourceInfo(src) {
  let info = sourceCache.get(src)
  if (info) return info
  const ctx = src.context
  const catalog = src.catalog
  const pageRefs = src.getPages().map((p) => p.ref)
  const indexByRef = new Map(pageRefs.map((r, i) => [r, i]))
  const pageOf = (arr) => {
    const first = arr?.get(0)
    if (first instanceof PDFRef) return indexByRef.has(first) ? indexByRef.get(first) : -1
    if (first instanceof PDFNumber) {
      const n = first.asNumber()
      return n >= 0 && n < pageRefs.length ? n : -1
    }
    return -1
  }

  const dests = new Map()
  const oldDests = catalog.lookup(K.Dests)
  if (oldDests instanceof PDFDict) {
    for (const [name, value] of oldDests.entries()) {
      const arr = destArray(ctx, value)
      if (arr) dests.set(destKey(name), arr)
    }
  }
  const names = catalog.lookup(K.Names)
  if (names instanceof PDFDict && names.get(K.Dests)) {
    walkTree(ctx, names.get(K.Dests), K.Names, (key, value) => {
      const k = destKey(key)
      const arr = destArray(ctx, value)
      if (k && arr) dests.set(k, arr)
    })
  }

  // Outline as plain items holding source objects.
  let budget = MAX_OUTLINE_ITEMS
  const seen = new Set()
  const readItems = (firstRef, depth) => {
    const items = []
    let ref = firstRef
    while (ref && budget > 0 && depth < 64) {
      if (ref instanceof PDFRef) {
        if (seen.has(ref)) break
        seen.add(ref)
      }
      const d = deref(ctx, ref)
      if (!(d instanceof PDFDict)) break
      budget--
      const item = { title: decodeText(d.lookup(K.Title)), dest: null, page: null, action: null, open: false, children: [] }
      let target = d.get(K.Dest)
      const action = deref(ctx, d.get(K.A))
      if (!target && action instanceof PDFDict) {
        if (action.get(K.S) === K.GoTo) target = action.get(K.D)
        else item.action = action
      }
      if (target) {
        const t = deref(ctx, target)
        const arr = t instanceof PDFArray ? t : dests.get(destKey(t)) ?? null
        item.page = arr ? pageOf(arr) : -1
        item.dest = item.page >= 0 ? arr : null
      }
      const count = d.lookup(K.Count)
      item.open = count instanceof PDFNumber && count.asNumber() > 0
      item.color = d.get(K.C)
      item.flags = d.get(K.F)
      item.children = readItems(d.get(K.First), depth + 1)
      items.push(item)
      ref = d.get(K.Next)
    }
    return items
  }
  const outlineRoot = catalog.lookup(K.Outlines)
  const outline = outlineRoot instanceof PDFDict ? readItems(outlineRoot.get(K.First), 0) : []

  // Page label ranges, sorted by start page.
  const labels = []
  const pl = catalog.get(K.PageLabels)
  if (pl) {
    walkTree(ctx, pl, K.Nums, (num, value) => {
      const d = deref(ctx, value)
      if (!(num instanceof PDFNumber) || !(d instanceof PDFDict)) return
      const s = d.lookup(K.S)
      const st = d.lookup(K.St)
      labels.push({
        start: num.asNumber(),
        S: s instanceof PDFName ? s.decodeText() : null,
        P: decodeText(d.lookup(K.P)),
        St: st instanceof PDFNumber ? st.asNumber() : 1,
      })
    })
    labels.sort((a, b) => a.start - b.start)
  }

  // Objects a page could point at that must never be deep-copied with it.
  const blocked = [src.context.trailerInfo.Root]
  for (const key of [K.Pages, K.StructTreeRoot, K.Outlines, K.AcroForm, K.Names, K.Dests]) {
    const v = catalog.get(key)
    if (v instanceof PDFRef) blocked.push(v)
  }
  collectPageTreeNodes(ctx, catalog.get(K.Pages), blocked)

  info = { pageRefs, pageOf, dests, outline, labels, blocked }
  sourceCache.set(src, info)
  return info
}

function collectPageTreeNodes(ctx, node, out, depth = 0) {
  const d = deref(ctx, node)
  if (!(d instanceof PDFDict) || depth > 64 || d.get(N('Type')) !== K.Pages) return
  if (node instanceof PDFRef) out.push(node)
  const kids = d.lookup(K.Kids)
  if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) collectPageTreeNodes(ctx, kids.get(i), out, depth + 1)
}

function annotRefs(ctx, pageNode) {
  const annots = deref(ctx, pageNode.get(K.Annots))
  if (!(annots instanceof PDFArray)) return []
  const refs = []
  for (let i = 0; i < annots.size(); i++) if (annots.get(i) instanceof PDFRef) refs.push(annots.get(i))
  return refs
}

function partTitle(name, src, i) {
  const fromName = typeof name === 'string' ? name.replace(/\.pdf$/i, '').trim() : ''
  if (fromName) return fromName
  const title = (src.getTitle() ?? '').trim()
  return title || `Document ${i + 1}`
}

function uniqueName(base, taken) {
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`
    if (!taken.has(candidate)) return candidate
  }
}

// parts: [{ src, indices (0-based, may repeat), title }]. wrap: give every
// part its own top-level bookmark (merge). Returns a new PDFDocument.
async function assemble(parts, { wrap = false } = {}) {
  const out = await PDFDocument.create()
  const ctx = out.context
  const state = {
    outline: [],
    dests: new Map(), // out key -> dest array
    fieldRoots: [],
    rootNames: new Set(),
    acro: null,
    labels: [],
    anyLabels: false,
  }

  for (const [partIndex, part] of parts.entries()) {
    await part.src.flush()
    const info = sourceInfo(part.src)
    const sctx = part.src.context
    const srcPages = part.src.getPages()
    const kept = new Set(part.indices)
    const copier = PDFObjectCopier.for(sctx, ctx)
    const seed = copier.traversedObjects
    for (const ref of info.blocked) seed.set(ref, PDFNull)

    // Reserve a new ref per kept page; dropped pages and their annotations map to null.
    const newRefByIndex = new Map()
    for (const [i, ref] of info.pageRefs.entries()) {
      if (kept.has(i)) {
        const newRef = ctx.nextRef()
        newRefByIndex.set(i, newRef)
        seed.set(ref, newRef)
      } else {
        seed.set(ref, PDFNull)
        for (const a of annotRefs(sctx, srcPages[i].node)) if (!seed.has(a)) seed.set(a, PDFNull)
      }
    }
    const partRefs = new Set(newRefByIndex.values())
    const firstOutPage = out.getPageCount()
    const placed = new Set()
    const outNodes = []
    for (const i of part.indices) {
      let node
      let ref
      if (!placed.has(i)) {
        placed.add(i)
        ref = newRefByIndex.get(i)
        node = copier.copy(srcPages[i].node)
        ctx.assign(ref, node)
      } else {
        // Same page picked twice: share content and resources, own annotations.
        ref = ctx.nextRef()
        node = ctx.lookup(newRefByIndex.get(i)).clone()
        node.delete(K.Annots)
        ctx.assign(ref, node)
        const annots = annotRefs(ctx, ctx.lookup(newRefByIndex.get(i)))
          .map((a) => ctx.lookup(a))
          .filter((a) => a instanceof PDFDict && a.get(K.Subtype) !== K.Widget)
          .map((a) => {
            const copy = a.clone()
            copy.set(K.P, ref)
            return ctx.register(copy)
          })
        if (annots.length) node.set(K.Annots, ctx.obj(annots))
      }
      out.addPage(PDFPage.of(node, ref, out))
      outNodes.push({ node, srcIndex: i })
    }

    const copyDest = (arr) => {
      const copy = copier.copy(arr)
      if (copy.get(0) instanceof PDFNumber) copy.set(0, newRefByIndex.get(copy.get(0).asNumber()) ?? PDFNull)
      return copy
    }

    // Named destinations whose page is kept; renamed when another part already used the name.
    const nameMap = new Map()
    for (const [key, arr] of info.dests) {
      const page = info.pageOf(arr)
      if (!kept.has(page)) continue
      let outKey = key
      if (state.dests.has(outKey)) {
        for (let n = 2; state.dests.has(outKey); n++) outKey = `${key}-${n}`
      }
      state.dests.set(outKey, copyDest(arr))
      nameMap.set(key, outKey)
    }

    // Links: retarget renamed names, drop links whose target page is gone.
    const keptAnnots = new Set()
    for (const { node } of outNodes) {
      const annots = deref(ctx, node.get(K.Annots))
      if (!(annots instanceof PDFArray)) continue
      const keep = []
      for (let j = 0; j < annots.size(); j++) {
        const ref = annots.get(j)
        const a = deref(ctx, ref)
        if (!(a instanceof PDFDict)) continue
        if (a.get(K.Subtype) === K.Link && !fixLink(ctx, a, partRefs, nameMap, newRefByIndex)) {
          if (ref instanceof PDFRef) ctx.delete(ref)
          continue
        }
        keep.push(ref)
        if (ref instanceof PDFRef) keptAnnots.add(ref)
      }
      if (keep.length !== annots.size()) node.set(K.Annots, ctx.obj(keep))
    }

    mergeForm(ctx, part.src, copier, keptAnnots, state, partIndex)
    mergeOptionalContent(ctx, part.src, copier, out, partIndex)

    // Bookmarks: keep entries whose page is kept, lift children of dropped ones.
    const mapItems = (items) => {
      const res = []
      for (const item of items) {
        const children = mapItems(item.children)
        if (item.page != null && item.page >= 0 && !kept.has(item.page)) {
          res.push(...children)
          continue
        }
        res.push({
          title: item.title,
          dest: item.dest ? copyDest(item.dest) : null,
          action: item.action ? copier.copy(item.action) : null,
          color: item.color ? copier.copy(item.color) : null,
          flags: item.flags ? copier.copy(item.flags) : null,
          open: item.open,
          children,
        })
      }
      return res
    }
    const items = mapItems(info.outline)
    if (wrap) {
      const firstRef = out.getPage(firstOutPage).ref
      state.outline.push({
        title: part.title ?? `Document ${partIndex + 1}`,
        dest: ctx.obj([firstRef, N('Fit')]),
        open: items.length > 0 && items.length <= 40,
        children: items,
      })
    } else {
      state.outline.push(...items)
    }

    // Page labels per output page; plain source page numbers where a part has none.
    if (info.labels.length) state.anyLabels = true
    for (const { srcIndex } of outNodes) state.labels.push(labelAt(info.labels, srcIndex))

    if (partIndex === 0) copyDocumentLevel(out, part.src, copier)
  }

  writeOutline(ctx, out, state.outline)
  writeDests(ctx, out, state.dests)
  if (state.acro && state.fieldRoots.length) {
    state.acro.set(K.Fields, ctx.obj(state.fieldRoots))
    out.catalog.set(K.AcroForm, ctx.register(state.acro))
  }
  if (state.anyLabels) writeLabels(ctx, out, state.labels)
  return out
}

// Returns false when the link points at a page that is not in the output.
function fixLink(ctx, annot, partRefs, nameMap, newRefByIndex) {
  let holder = annot
  let key = K.Dest
  let target = annot.get(K.Dest)
  if (!target) {
    const action = deref(ctx, annot.get(K.A))
    if (!(action instanceof PDFDict) || action.get(K.S) !== K.GoTo) return true
    holder = action
    key = K.D
    target = action.get(K.D)
  }
  if (!target) return true
  const t = deref(ctx, target)
  if (t instanceof PDFArray) {
    const first = t.get(0)
    if (first instanceof PDFRef) return partRefs.has(first)
    if (first instanceof PDFNumber) {
      const ref = newRefByIndex.get(first.asNumber())
      if (!ref) return false
      t.set(0, ref)
      return true
    }
    return false
  }
  const k = destKey(t)
  if (!k) return true
  const outKey = nameMap.get(k)
  if (!outKey) return false
  if (outKey !== k) holder.set(key, keyObject(outKey))
  return true
}

// AcroForm: copy the field trees, keep only widgets on kept pages, rename a
// root field when another part already has one with the same name (the same
// form merged twice), merge /DR and carry /DA, /Q, NeedAppearances. XFA is
// dropped: it would no longer match the pages.
function mergeForm(ctx, src, copier, keptAnnots, state, partIndex) {
  const af = src.catalog.lookup(K.AcroForm)
  if (!(af instanceof PDFDict)) return
  const fields = af.lookup(K.Fields)
  if (!(fields instanceof PDFArray)) return
  const alive = new Set()
  const roots = []
  for (let i = 0; i < fields.size(); i++) {
    const copied = copier.copy(fields.get(i))
    if (pruneField(ctx, copied, keptAnnots, alive, 0)) roots.push(copied)
  }
  if (roots.length === 0) return

  if (!state.acro) state.acro = ctx.obj({})
  const acro = state.acro
  const da = af.lookup(K.DA)
  const q = af.lookup(K.Q)
  if (partIndex === 0 || !acro.get(K.DA)) {
    if (da) acro.set(K.DA, copier.copy(da))
    if (q) acro.set(K.Q, copier.copy(q))
  }
  for (const root of roots) {
    const dict = deref(ctx, root)
    // Later parts keep their own defaults on their root fields.
    if (da && !dict.get(K.DA) && decodeText(acro.lookup(K.DA)) !== decodeText(da)) dict.set(K.DA, copier.copy(da))
    const outQ = acro.lookup(K.Q)
    if (q instanceof PDFNumber && !dict.get(K.Q) && !(outQ instanceof PDFNumber && outQ.asNumber() === q.asNumber())) dict.set(K.Q, q)
    const t = dict.lookup(K.T)
    if (t) {
      let name = decodeText(t)
      if (state.rootNames.has(name)) {
        name = uniqueName(name, state.rootNames)
        dict.set(K.T, PDFHexString.fromText(name))
      }
      state.rootNames.add(name)
    }
    state.fieldRoots.push(root)
  }

  const need = af.lookup(K.NeedAppearances)
  if (need && need.asBoolean?.()) acro.set(K.NeedAppearances, need)
  const sig = af.lookup(K.SigFlags)
  if (sig instanceof PDFNumber) {
    const prev = acro.lookup(K.SigFlags)
    acro.set(K.SigFlags, PDFNumber.of((prev instanceof PDFNumber ? prev.asNumber() : 0) | sig.asNumber()))
  }
  const co = af.lookup(K.CO)
  if (co instanceof PDFArray) {
    const list = acro.lookup(K.CO) instanceof PDFArray ? acro.lookup(K.CO) : ctx.obj([])
    for (let i = 0; i < co.size(); i++) {
      const ref = co.get(i)
      const mapped = copier.traversedObjects.get(ref)
      if (mapped instanceof PDFRef && alive.has(mapped)) list.push(mapped)
    }
    if (list.size()) acro.set(K.CO, list)
  }
  const dr = af.lookup(K.DR)
  if (dr instanceof PDFDict) {
    const copied = copier.copy(dr)
    const have = acro.lookup(K.DR)
    if (!(have instanceof PDFDict)) acro.set(K.DR, copied)
    else {
      for (const [cat, sub] of copied.entries()) {
        const target = have.lookup(cat)
        const add = deref(ctx, sub)
        if (!(target instanceof PDFDict)) have.set(cat, sub)
        else if (add instanceof PDFDict) for (const [k, v] of add.entries()) if (!target.get(k)) target.set(k, v)
      }
    }
  }
}

// Keeps a field when it (or one of its kids) has a widget on a kept page.
function pruneField(ctx, obj, keptAnnots, alive, depth) {
  if (depth > 32) return false
  const dict = deref(ctx, obj)
  if (!(dict instanceof PDFDict)) return false
  const kids = dict.lookup(K.Kids)
  if (!(kids instanceof PDFArray)) {
    // a field without widgets carries data only and is kept
    const keep = dict.get(K.Subtype) !== K.Widget || (obj instanceof PDFRef && keptAnnots.has(obj))
    if (keep && obj instanceof PDFRef) alive.add(obj)
    return keep
  }
  const next = []
  for (let i = 0; i < kids.size(); i++) if (pruneField(ctx, kids.get(i), keptAnnots, alive, depth + 1)) next.push(kids.get(i))
  if (next.length === 0) return false
  if (next.length !== kids.size()) dict.set(K.Kids, ctx.obj(next))
  if (obj instanceof PDFRef) alive.add(obj)
  return true
}

// Layers: without /OCProperties viewers would show hidden layers.
function mergeOptionalContent(ctx, src, copier, out, partIndex) {
  const oc = src.catalog.lookup(K.OCProperties)
  if (!(oc instanceof PDFDict)) return
  const have = out.catalog.lookup(K.OCProperties)
  if (!(have instanceof PDFDict) || partIndex === 0) {
    out.catalog.set(K.OCProperties, copier.copy(oc))
    return
  }
  const copied = copier.copy(oc)
  const ocgs = have.lookup(K.OCGs)
  const addOcgs = copied.lookup(K.OCGs)
  if (ocgs instanceof PDFArray && addOcgs instanceof PDFArray) for (let i = 0; i < addOcgs.size(); i++) ocgs.push(addOcgs.get(i))
  const d = have.lookup(K.D)
  const addD = copied.lookup(K.D)
  const off = addD instanceof PDFDict ? addD.lookup(K.OFF) : null
  if (d instanceof PDFDict && off instanceof PDFArray) {
    const list = d.lookup(K.OFF) instanceof PDFArray ? d.lookup(K.OFF) : ctx.obj([])
    for (let i = 0; i < off.size(); i++) list.push(off.get(i))
    d.set(K.OFF, list)
  }
}

// Metadata, XMP, language and viewer settings come from the first file.
function copyDocumentLevel(out, src, copier) {
  const fields = [
    ['getTitle', 'setTitle'],
    ['getAuthor', 'setAuthor'],
    ['getSubject', 'setSubject'],
    ['getKeywords', 'setKeywords', (v) => [v]],
    ['getCreator', 'setCreator'],
    ['getProducer', 'setProducer'],
    ['getCreationDate', 'setCreationDate'],
  ]
  for (const [get, set, wrapValue = (v) => v] of fields) {
    try {
      const v = src[get]()
      if (v) out[set](wrapValue(v))
    } catch {
      /* malformed info entry: skip it */
    }
  }
  out.setModificationDate(new Date())
  for (const key of ['Metadata', 'Lang', 'ViewerPreferences', 'PageLayout', 'PageMode']) {
    const v = src.catalog.get(N(key))
    if (v) out.catalog.set(N(key), copier.copy(v))
  }
}

function writeOutline(ctx, out, items) {
  if (items.length === 0) return
  const rootRef = ctx.nextRef()
  const visible = (item) => item.children.length + item.children.reduce((n, c) => n + (c.open ? visible(c) : 0), 0)
  const build = (list, parentRef) => {
    const refs = list.map(() => ctx.nextRef())
    list.forEach((item, i) => {
      const dict = ctx.obj({})
      dict.set(K.Title, PDFHexString.fromText(item.title || 'Untitled'))
      dict.set(N('Parent'), parentRef)
      if (i > 0) dict.set(N('Prev'), refs[i - 1])
      if (i < list.length - 1) dict.set(K.Next, refs[i + 1])
      if (item.dest) dict.set(K.Dest, item.dest)
      else if (item.action) dict.set(K.A, item.action)
      if (item.color) dict.set(K.C, item.color)
      if (item.flags) dict.set(K.F, item.flags)
      if (item.children.length) {
        const kids = build(item.children, refs[i])
        dict.set(K.First, kids[0])
        dict.set(N('Last'), kids[kids.length - 1])
        const n = visible(item)
        dict.set(K.Count, PDFNumber.of(item.open ? n : -n))
      }
      ctx.assign(refs[i], dict)
    })
    return refs
  }
  const top = build(items, rootRef)
  const total = items.length + items.reduce((n, c) => n + (c.open ? visible(c) : 0), 0)
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: top[0], Last: top[top.length - 1], Count: total }))
  out.catalog.set(K.Outlines, rootRef)
}

function writeDests(ctx, out, dests) {
  if (dests.size === 0) return
  const strings = []
  const names = ctx.obj({})
  for (const [key, arr] of dests) {
    if (key.startsWith('n:')) names.set(keyObject(key), arr)
    else strings.push([key, arr])
  }
  if (names.entries().length) out.catalog.set(K.Dests, ctx.register(names))
  if (strings.length) {
    // Name tree keys must be sorted by their bytes.
    strings.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    const flat = ctx.obj([])
    for (const [key, arr] of strings) {
      flat.push(keyObject(key))
      flat.push(arr)
    }
    const tree = ctx.obj({})
    tree.set(K.Names, flat)
    const namesDict = ctx.obj({})
    namesDict.set(K.Dests, ctx.register(tree))
    out.catalog.set(K.Names, ctx.register(namesDict))
  }
}

function labelAt(ranges, index) {
  let r = null
  for (const range of ranges) {
    if (range.start <= index) r = range
    else break
  }
  if (!r) return { S: 'D', P: '', value: index + 1 }
  return { S: r.S, P: r.P, value: r.St + index - r.start }
}

function writeLabels(ctx, out, labels) {
  const nums = ctx.obj([])
  let prev = null
  labels.forEach((l, i) => {
    const continues = prev && prev.S === l.S && prev.P === l.P && (l.S == null || l.value === prev.value + 1)
    if (!continues) {
      const dict = ctx.obj({})
      if (l.S) dict.set(K.S, N(l.S))
      if (l.P) dict.set(K.P, PDFHexString.fromText(l.P))
      if (l.S && l.value !== 1) dict.set(K.St, PDFNumber.of(l.value))
      nums.push(PDFNumber.of(i))
      nums.push(dict)
    }
    prev = l
  })
  const tree = ctx.obj({})
  tree.set(K.Nums, nums)
  out.catalog.set(K.PageLabels, ctx.register(tree))
}
