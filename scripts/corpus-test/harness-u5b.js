// U5-B structure tool ops for the corpus runner (op "u5b:<name>"). Runs in
// the app page. The main op runs the real tool: its run() through the job
// runner (ops worker, the `doc` op), then the shell's output check, timed as
// "Run to result" (everything after Run except the workspace store write).
// Node checks the outputs in cases-u5b.mjs with its own pdf.js and MuPDF.

const mupdfLib = () => import(/* @vite-ignore */ '/node_modules/mupdf/dist/mupdf.js')

// Deterministic bytes for an attachment payload.
export function payload(n, seed = 2463534242) {
  const out = new Uint8Array(n)
  let x = seed
  for (let i = 0; i < n; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    out[i] = x & 255
  }
  return out
}

// Workspace-like file records, ids unique per case (tools cache by id). Every
// file goes through intake first, as in the shell (owner-only restrictions
// are lifted there, a user password stops it).
async function records({ lib }, s, files) {
  const { normalizePdf } = await lib('intake')
  const out = []
  for (const [i, raw] of files.entries()) {
    const { bytes, pageCount } = await normalizePdf(raw, {})
    out.push({ id: `${s.id}-${i}`, name: s.files[i].split('/').pop(), size: bytes.byteLength, pageCount, type: 'application/pdf', bytes })
  }
  return out
}

// Runs a tool like the shell does: runJob, then assertValidOutput on PDFs.
async function runTool({ lib }, toolId, files, options) {
  const tool = (await import(/* @vite-ignore */ `/src/tools/v2/${toolId}.jsx`)).default
  const { runJob } = await import('/src/app/jobs.js')
  const { assertValidOutput } = await lib('pdfOps')
  const summary = tool.summary(files, options)
  if (!summary.ready) throw new Error(`not ready: ${summary.line}`)
  const t0 = performance.now()
  const outs = await runJob(tool, files, options).promise
  for (const o of outs) if (!o.type) await assertValidOutput(o.bytes)
  return { outs, runMs: Math.round(performance.now() - t0), summary }
}

// Option builders: what the user would do in the Options panel first.
const BUILD = {
  // rename the first bookmark, add a nested branch
  async bookmarks({ lib }, s, files) {
    const d = await lib('docOps')
    const f = files[0]
    const before = (await d.readBookmarks(f.bytes)).items
    const items = before.map((it) => ({ ...it }))
    if (items[0]) items[0].title = `${items[0].title} (edited é)`
    items.push(
      { title: 'Added top', level: 1, page: Math.min(2, f.pageCount ?? 1), y: 120, open: true, uri: null },
      { title: 'Added child', level: 2, page: Math.min(3, f.pageCount ?? 1), y: null, open: false, uri: null },
      { title: 'Added grandchild', level: 3, page: 1, y: 40, open: true, uri: null },
    )
    return { options: { trees: { [f.id]: items }, dirty: { [f.id]: true }, sel: null, at: null, levels: 2 }, meta: { before, written: items } }
  },
  async bookmarksHeadings({ lib }, s, files) {
    const d = await lib('docOps')
    const f = files[0]
    const found = await d.headingBookmarks(f.bytes, { levels: 2 })
    return { options: { trees: { [f.id]: found }, dirty: { [f.id]: true }, sel: null, at: null, levels: 2 }, meta: { written: found } }
  },
  async metadata({ lib }, s, files) {
    const d = await lib('docOps')
    const f = files[0]
    const before = await d.readMetadata(f.bytes)
    const e = s.params.deleteAll
      ? { info: before.info, custom: before.custom, deleteAll: true }
      : { info: { ...before.info, ...s.params.info }, custom: [...before.custom, ...s.params.custom], deleteAll: false }
    return { options: { edits: { [f.id]: e }, dirty: { [f.id]: true }, fileId: null }, meta: { before } }
  },
  async attachments(ctx, s, files) {
    const add = [
      { name: 'corpus-payload.bin', bytes: payload(s.params.size ?? 50000), mime: 'application/octet-stream' },
      { name: 'notes über.txt', bytes: new TextEncoder().encode('SwissPDF attachment check'), mime: 'text/plain' },
    ]
    // several MB each: reads of one file used to detach the bytes of the last
    if (s.params.big) add.push(...[1, 2].map((k) => ({ name: `big-${k}.bin`, bytes: payload(s.params.big, 1000 + k), mime: 'application/octet-stream' })))
    return { options: { mode: 'manage', fileId: null, add, remove: {} } }
  },
}

// Probe text inside the synthetic associated files (not a real value).
export const PROBE = 'U5B-PROBE-ASSOCIATED-FILE-7731'

// Synthetic inputs built from a corpus file in the page with MuPDF.
const PREP = {
  // Factur-X style: an invoice XML in the name tree and in the catalog /AF,
  // a second file only in a page /AF
  async facturx(bytes) {
    const mupdf = await mupdfLib()
    const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf').asPDF()
    try {
      const now = new Date()
      const xml = new TextEncoder().encode(`<?xml version="1.0"?><Invoice><Note>${PROBE}</Note></Invoice>`)
      const spec = doc.addEmbeddedFile('factur-x.xml', 'text/xml', xml, now, now, false)
      doc.insertEmbeddedFile('factur-x.xml', spec)
      const af = doc.newArray()
      af.push(spec)
      doc.getTrailer().get('Root').put('AF', af)
      const pageSpec = doc.addEmbeddedFile('page-note.xml', 'text/xml', new TextEncoder().encode(`<note>${PROBE}-PAGE</note>`), now, now, false)
      const paf = doc.newArray()
      paf.push(pageSpec)
      doc.findPage(0).put('AF', paf)
      return { bytes: doc.saveToBuffer('compress').asUint8Array().slice() }
    } finally {
      doc.destroy()
    }
  },
  // tagged copy: the structure tree points at the file attachment annotation
  async tagAnnot(bytes) {
    const mupdf = await mupdfLib()
    const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf').asPDF()
    try {
      const page = doc.findPage(0)
      const annots = page.get('Annots')
      let target = null
      for (let i = 0; i < annots.length; i++) if (annots.get(i).get('Subtype').asName() === 'FileAttachment') target = annots.get(i)
      const objr = doc.newDictionary()
      objr.put('Type', doc.newName('OBJR'))
      objr.put('Obj', target)
      objr.put('Pg', page)
      const elem = doc.addObject(doc.newDictionary())
      elem.put('Type', doc.newName('StructElem'))
      elem.put('S', doc.newName('Annot'))
      const k = doc.newArray()
      k.push(objr)
      elem.put('K', k)
      const root = doc.addObject(doc.newDictionary())
      root.put('Type', doc.newName('StructTreeRoot'))
      root.put('K', elem)
      elem.put('P', root)
      doc.getTrailer().get('Root').put('StructTreeRoot', root)
      return { bytes: doc.saveToBuffer('compress').asUint8Array().slice() }
    } finally {
      doc.destroy()
    }
  },
  // an object nothing points to, holding the probe text
  async orphan(bytes) {
    const mupdf = await mupdfLib()
    const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf').asPDF()
    try {
      const d = doc.newDictionary()
      d.put('Note', doc.newString(`${PROBE}-ORPHAN`))
      doc.addObject(d)
      return { bytes: doc.saveToBuffer('compress').asUint8Array().slice() }
    } finally {
      doc.destroy()
    }
  },
  // the XFA packets joined into one stream (allowed by the spec)
  async xfaSingle(bytes) {
    const mupdf = await mupdfLib()
    const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf').asPDF()
    try {
      const af = doc.getTrailer().get('Root').get('AcroForm')
      const x = af.get('XFA')
      let text = ''
      for (let i = 0; i + 1 < x.length; i += 2) text += new TextDecoder().decode(x.get(i + 1).readStream().asUint8Array())
      af.put('XFA', doc.addStream(new TextEncoder().encode(text), {}))
      return { bytes: doc.saveToBuffer('compress').asUint8Array().slice() }
    } finally {
      doc.destroy()
    }
  },
}

// Sets the read-only flag on every terminal field and widget, and marks XFA
// template fields readOnly, so unlocking has something to do.
async function lockForm(bytes) {
  const mupdf = await mupdfLib()
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf').asPDF()
  try {
    let fields = 0
    let xfa = 0
    const root = doc.getTrailer().get('Root')
    const walk = (node, depth) => {
      if (!node.isDictionary() || depth > 32) return
      const kids = node.get('Kids')
      const fieldKids = kids.isArray() ? Array.from({ length: kids.length }, (_, i) => kids.get(i)).filter((k) => !k.get('T').isNull()) : []
      if (fieldKids.length) return fieldKids.forEach((k) => walk(k, depth + 1))
      const ff = node.get('Ff')
      node.put('Ff', (ff.isInteger() ? parseInt(ff.toString(), 10) : 0) | 1)
      fields++
    }
    const list = root.get('AcroForm').get('Fields')
    if (list.isArray()) for (let i = 0; i < list.length; i++) walk(list.get(i), 0)
    const x = root.get('AcroForm').get('XFA')
    const lock = (s) => {
      const text = new TextDecoder().decode(s.readStream().asUint8Array())
      const locked = text.replace(/<field\b(?![^>]*\saccess=)/g, () => (xfa++, '<field access="readOnly"'))
      s.writeStream(new TextEncoder().encode(locked))
    }
    if (x.isStream()) lock(x)
    else if (x.isArray()) {
      for (let i = 0; i + 1 < x.length; i += 2) if (x.get(i).asString() === 'template') lock(x.get(i + 1))
    }
    return { bytes: doc.saveToBuffer('compress').asUint8Array().slice(), fields, xfa }
  } finally {
    doc.destroy()
  }
}

export const OPS = {
  // params: { tool, options?, build?, lock?, fill?, then? }
  async tool(h, s, rawFiles) {
    let bytesIn = rawFiles
    const meta = {}
    if (s.params.prep) {
      bytesIn = [(await PREP[s.params.prep](rawFiles[0])).bytes]
      await h.save(s.id, 'input-prepared.pdf', bytesIn[0])
    }
    if (s.params.lock) {
      const locked = await lockForm(bytesIn[0])
      bytesIn = [locked.bytes]
      meta.locked = { fields: locked.fields, xfa: locked.xfa }
      await h.save(s.id, 'input-locked.pdf', locked.bytes)
    }
    if (s.params.fill) {
      // a few roomy text fields get values, so flattened values can be found
      const { inspectForm, fillFields } = await h.lib('formOps')
      const { fields } = await inspectForm(rawFiles[0])
      const names = [...new Set(fields.filter((f) => f.type === 'text' && !f.readOnly && !(f.maxLength > 0 && f.maxLength < 10) && f.w > 60).map((f) => f.name))].slice(0, 3)
      meta.values = Object.fromEntries(names.map((n, i) => [n, `FLAT${i + 1}VAL`]))
      bytesIn = [(await fillFields(rawFiles[0], meta.values)).bytes]
      await h.save(s.id, 'input-filled.pdf', bytesIn[0])
    }
    const files = await records(h, s, bytesIn)
    let options = s.params.options ?? (await import(/* @vite-ignore */ `/src/tools/v2/${s.params.tool}.jsx`)).default.defaults
    if (s.params.build) {
      const b = await BUILD[s.params.build](h, s, files)
      options = b.options
      Object.assign(meta, b.meta ?? {})
    }
    const { outs, runMs, summary } = await runTool(h, s.params.tool, files, options)
    meta.runMs = runMs
    meta.summary = summary.line
    meta.outputs = []
    for (const [i, o] of outs.entries()) {
      const name = `out${i}-${o.name.replace(/[^\w.-]+/g, '_')}`
      meta.outputs.push({ name, original: o.name, type: o.type ?? 'application/pdf', note: o.note ?? null, unchanged: !!o.unchanged, size: o.bytes.byteLength })
    }
    const saved = []
    for (const [i, o] of outs.entries()) saved.push(await h.save(s.id, meta.outputs[i].name, o.bytes))
    // attachments: extract from the result, then remove everything again
    if (s.params.then === 'attachments' && outs[0]) {
      const d = await h.lib('docOps')
      const [next] = await records(h, { ...s, id: `${s.id}-x`, files: [s.files[0]] }, [outs[0].bytes])
      const list = await d.listAttachments(next.bytes)
      meta.listed = list
      const x = await runTool(h, 'attachments', [next], { mode: 'extract', fileId: null, add: [], remove: {} })
      meta.extracted = []
      for (const [i, o] of x.outs.entries()) {
        const name = `x${i}-${o.name.replace(/[^\w.-]+/g, '_')}`
        meta.extracted.push({ name, original: o.name, type: o.type ?? 'application/pdf', size: o.bytes.byteLength })
        saved.push(await h.save(s.id, name, o.bytes))
      }
      const r = await runTool(h, 'attachments', [next], { mode: 'manage', fileId: null, add: [], remove: { [next.id]: list.map((a) => a.id) } })
      saved.push(await h.save(s.id, 'removed.pdf', r.outs[0].bytes))
      meta.after = await d.listAttachments(r.outs[0].bytes)
    }
    return { outputs: saved, meta }
  },
  // remove what a file has, as the tool would: list ids, then the tool run
  async attachRemove(h, s, rawFiles) {
    const d = await h.lib('docOps')
    let bytesIn = rawFiles
    if (s.params.prep) {
      bytesIn = [(await PREP[s.params.prep](rawFiles[0])).bytes]
      await h.save(s.id, 'input-prepared.pdf', bytesIn[0])
    }
    const [f] = await records(h, s, bytesIn)
    const list = await d.listAttachments(f.bytes)
    const { outs, runMs } = await runTool(h, 'attachments', [f], { mode: 'manage', fileId: null, add: [], remove: { [f.id]: list.map((a) => a.id) } })
    const x = await runTool(h, 'attachments', [f], { mode: 'extract', fileId: null, add: [], remove: {} })
    const saved = [await h.save(s.id, 'removed.pdf', outs[0].bytes)]
    const extracted = []
    for (const [i, o] of x.outs.entries()) {
      const name = `x${i}-${o.name.replace(/[^\w.-]+/g, '_')}`
      extracted.push({ name, original: o.name, size: o.bytes.byteLength })
      saved.push(await h.save(s.id, name, o.bytes))
    }
    return { outputs: saved, meta: { runMs, before: list, extracted, after: await d.listAttachments(outs[0].bytes) } }
  },
}
