// U5-B structure and cleanup tools on real corpus files. Every case runs the
// tool's own run() in the page (harness-u5b.js "tool" op) and checks the
// output here with pdf.js and MuPDF. Removal checks walk every object of
// the output file (decoded streams included), so a removed thing that only
// lost its reference still fails.
import JSZip from 'jszip'
import * as mupdf from 'mupdf'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { withPdfjs, openMupdf, formFacts, outlineCount, textOf } from './validate.mjs'
import { payload, PROBE } from './harness-u5b.js'

const latin1 = (b) => Buffer.from(b).toString('latin1')
const utf16 = (s) => latin1(Buffer.from(s, 'utf16le').swap16())

// Every object of a file: { strings, streams, dicts } where strings holds
// each string value (raw bytes as Latin-1 and decoded), streams each decoded
// stream with its dict, dicts each dictionary (direct ones included).
function objectsOf(bytes) {
  const { doc } = openMupdf(bytes)
  const pdf = doc.asPDF()
  const out = { strings: [], streams: [], dicts: [] }
  const walk = (o, depth) => {
    if (!o || depth > 40) return
    if (o.isString()) {
      out.strings.push(latin1(o.asByteString()))
      out.strings.push(o.asString())
    } else if (o.isArray()) {
      for (let i = 0; i < o.length; i++) {
        const v = o.get(i)
        if (!v.isIndirect()) walk(v, depth + 1)
      }
    } else if (o.isDictionary()) {
      out.dicts.push(o)
      o.forEach((v) => {
        if (!v.isIndirect()) walk(v, depth + 1)
      })
    }
  }
  const origWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = () => true
  try {
    const n = pdf.countObjects()
    for (let i = 1; i < n; i++) {
      // stream calls need the indirect reference, not the resolved dict
      const ref = pdf.newIndirect(i)
      let o
      try {
        o = ref.resolve()
      } catch {
        continue
      }
      if (!o || o.isNull()) continue
      walk(o, 0)
      if (ref.isStream()) {
        try {
          out.streams.push({ num: i, dict: ref, text: latin1(ref.readStream().asUint8Array()) })
        } catch {
          /* undecodable stream */
        }
      }
    }
  } finally {
    process.stderr.write = origWrite
  }
  out.doc = doc
  out.has = (text) => {
    const forms = [text, utf16(text)]
    return out.strings.some((s) => forms.some((f) => s.includes(f))) || out.streams.some((s) => forms.some((f) => s.text.includes(f)))
  }
  return out
}
// Decoded page content (per page) and Form XObject streams (sorted) of a
// file. cut: take inline images out with a plain regex (independent of the
// app's scanner). inline: how many inline images were found.
const INLINE = /(?<=^|[\0\t\n\f\r ])BI[\0\t\n\f\r ][\s\S]*?[\0\t\n\f\r ]EI(?=[\0\t\n\f\r ]|$)/g
function contentOf(bytes, cut) {
  const { doc } = openMupdf(bytes)
  const pdf = doc.asPDF()
  const orig = process.stderr.write.bind(process.stderr)
  process.stderr.write = () => true
  let inline = 0
  const fix = (t) => {
    inline += (t.match(INLINE) ?? []).length
    return cut ? t.replace(INLINE, '') : t
  }
  try {
    const pages = []
    for (let i = 0; i < pdf.countPages(); i++) {
      const c = pdf.findPage(i).get('Contents')
      const parts = c.isArray() ? Array.from({ length: c.length }, (_, k) => c.get(k)) : [c]
      pages.push(fix(parts.filter((p) => p.isStream()).map((p) => latin1(p.readStream().asUint8Array())).join('\n')))
    }
    const forms = []
    for (let i = 1; i < pdf.countObjects(); i++) {
      const ref = pdf.newIndirect(i)
      if (ref.isStream() && nameIs(ref, 'Subtype', 'Form')) forms.push(fix(latin1(ref.readStream().asUint8Array())))
    }
    return { pages, forms: forms.sort(), inline }
  } finally {
    process.stderr.write = orig
    doc.destroy()
  }
}

const nameIs = (d, key, value) => {
  const v = d.get(key)
  return v.isName() && v.asName() === value
}

// Image XObjects drawn on pages (not soft masks).
function imageObjects(o) {
  const masks = new Set()
  for (const d of o.dicts) {
    for (const k of ['SMask', 'Mask']) {
      const m = d.get(k)
      if (m.isIndirect()) masks.add(m.asIndirect())
    }
  }
  return o.streams.filter((s) => nameIs(s.dict, 'Subtype', 'Image') && !masks.has(s.num))
}

// Mean RGB of an encoded image or of a PDF image, decoded by MuPDF.
function meanRgb(pix) {
  const rgb = pix.getColorSpace()?.isRGB() ? pix : pix.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, false)
  const p = rgb.getPixels()
  const n = rgb.getNumberOfComponents()
  const sum = [0, 0, 0]
  for (let i = 0; i < p.length; i += n) for (let c = 0; c < 3; c++) sum[c] += p[i + c]
  const count = p.length / n
  return sum.map((v) => v / count)
}

const outName = (ctx, re) => (ctx.meta?.outputs ?? []).find((o) => re.test(o.original))?.name

export default function register({ add: addCase, checkPdf, inputFacts, readRel, allText, MIN }) {
  // every row also proves nothing left the page
  const add = (c) =>
    addCase({
      ...c,
      async validate(ctx) {
        await c.validate(ctx)
        const off = ctx.external ?? []
        ctx.check('no requests outside the page origin', off.length === 0, off.slice(0, 3).map((r) => r.url ?? r).join(', '))
      },
    })
  const tool = (id, toolId, files, params, validate, extra = {}) =>
    add({ id: `u5b-${id}`, tool: toolId, op: 'u5b:tool', files, params: { tool: toolId, ...params }, timeout: 3 * MIN, validate, ...extra })
  // per page, not per document: a lost figure on one page must fail
  const pagesKept = async (ctx, rel, bytes) => {
    const a = await textOf(readRel(rel), { maxPages: 60 })
    const b = await textOf(bytes, { maxPages: 60 })
    const bad = a.map((t, i) => [i + 1, t.length, (b[i] ?? '').length]).filter(([, x, y]) => y < x * 0.99)
    ctx.check('every page keeps its text (99%)', bad.length === 0, bad.slice(0, 4).map(([n, x, y]) => `p${n} ${x}->${y}`).join(', ') || `${a.length} pages`)
  }
  const run = (ctx) => ctx.metric(`run to result ${ctx.meta?.runMs} ms${ctx.meta?.outputs?.[0]?.note ? `: ${ctx.meta.outputs[0].note}` : ''}`)

  // ----- leftovers nothing points to (polish review B #1, #3) -----
  // A loose object (saved without garbage collection), like an attachment or
  // picture an incremental update dropped: the bytes stay in the file until a
  // garbage-collected save. Sanitize and Remove images must count that as a
  // change, never "nothing to do". Built with MuPDF, before the cases run.
  const LOOSE_FILE_REL = 'derived/synthetic/loose-attachment.pdf'
  const LOOSE_IMAGE_REL = 'derived/synthetic/loose-image.pdf'
  const LOOSE_SECRET = 'SECRET-SALARY-123456'
  const synthetic = new URL('../../test-corpus/derived/synthetic/', import.meta.url)
  mkdirSync(synthetic, { recursive: true })
  const looseFile = (name, dict, data) => {
    const target = new URL(name, synthetic)
    if (existsSync(target)) return
    const doc = new mupdf.PDFDocument()
    try {
      const res = doc.addObject(doc.newDictionary())
      const fonts = doc.newDictionary()
      fonts.put('F1', doc.addSimpleFont(new mupdf.Font('Helvetica')))
      res.put('Font', fonts)
      doc.insertPage(-1, doc.addPage([0, 0, 300, 300], 0, res, 'BT /F1 14 Tf 40 250 Td (Plain page) Tj ET'))
      const d = doc.newDictionary()
      for (const [k, v] of Object.entries(dict)) d.put(k, typeof v === 'number' ? v : doc.newName(v))
      doc.addStream(data, d)
      writeFileSync(target, doc.saveToBuffer('').asUint8Array().slice())
    } finally {
      doc.destroy()
    }
  }
  looseFile('loose-attachment.pdf', { Type: 'EmbeddedFile' }, LOOSE_SECRET)
  // a loose file spec whose stream has no /Type (allowed), and one whose
  // names are #-escaped: written by hand so the raw text is exactly that
  const rawPdf = (name, extra) => {
    const target = new URL(name, synthetic)
    if (existsSync(target)) return
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>',
      '<< /Length 0 >>\nstream\n\nendstream',
      ...extra,
    ]
    let out = '%PDF-1.7\n'
    const offsets = objs.map((o, i) => {
      const at = out.length
      out += `${i + 1} 0 obj\n${o}\nendobj\n`
      return at
    })
    const xref = out.length
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    writeFileSync(target, Buffer.from(out, 'latin1'))
  }
  const secretStream = (dict) => `<< ${dict}/Length ${LOOSE_SECRET.length} >>\nstream\n${LOOSE_SECRET}\nendstream`
  rawPdf('loose-attachment-notype.pdf', ['<< /Type /Filespec /F (secret.txt) /EF << /F 6 0 R >> >>', secretStream('')])
  rawPdf('loose-attachment-escaped.pdf', ['<< /Type /Filespec /F (secret.txt) /#45F << /F 6 0 R >> >>', secretStream('/Type /Embedded#46ile ')])
  tool('sanitize-loose-attachment', 'sanitize', [LOOSE_FILE_REL], {}, async (ctx) => {
    run(ctx)
    const note = ctx.meta?.outputs?.[0]?.note ?? ''
    ctx.check('reported as removed, not "nothing found"', /attached file/.test(note), note)
    const name = outName(ctx, /\.pdf$/)
    if (!(await checkPdf(ctx, name, { pages: 1 }))?.pdfjs.ok) return
    const o = objectsOf(ctx.out(name))
    ctx.check('no file stream left', !o.dicts.some((d) => nameIs(d, 'Type', 'EmbeddedFile')))
    ctx.check('attachment bytes gone', !o.has(LOOSE_SECRET))
  })
  for (const kind of ['notype', 'escaped']) {
    tool(`sanitize-loose-attachment-${kind}`, 'sanitize', [`derived/synthetic/loose-attachment-${kind}.pdf`], {}, async (ctx) => {
      run(ctx)
      const out0 = ctx.meta?.outputs?.[0]
      ctx.check('reported as removed, not "nothing found"', /attached file/.test(out0?.note ?? '') && !out0?.unchanged, out0?.note ?? 'no output')
      const name = outName(ctx, /\.pdf$/)
      if (!(await checkPdf(ctx, name, { pages: 1 }))?.pdfjs.ok) return
      ctx.check('attachment bytes gone', !objectsOf(ctx.out(name)).has(LOOSE_SECRET))
    })
  }
  tool('removeimages-loose-image', 'removeimages', [LOOSE_IMAGE_REL], {}, async (ctx) => {
    run(ctx)
    const out0 = ctx.meta?.outputs?.[0]
    ctx.check('reported as removed, not "no images"', /earlier version/.test(out0?.note ?? '') && !out0?.unchanged, out0?.note ?? 'no output')
    const name = outName(ctx, /\.pdf$/)
    if (!(await checkPdf(ctx, name, { pages: 1 }))?.pdfjs.ok) return
    ctx.check('no image stream left', !objectsOf(ctx.out(name)).dicts.some((d) => nameIs(d, 'Subtype', 'Image')))
  })

  // ----- bookmarks -----
  for (const [id, rel, quick] of [
    ['bookmarks-outlines-se', 'quirks/pdfjs-outlines_se.pdf', true],
    ['bookmarks-nested', 'quirks/pdfjs-nested_outline.pdf', false],
    // FitH destination: the fit-width view must survive
    ['bookmarks-goto-action', 'quirks/pdfjs-outline_goto_action.pdf', false],
    ['bookmarks-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', false],
  ]) {
    tool(
      id,
      'bookmarks',
      [rel],
      { build: 'bookmarks' },
      async (ctx) => {
        run(ctx)
        const f = await inputFacts(rel)
        const name = outName(ctx, /\.pdf$/)
        const p = await checkPdf(ctx, name, { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const written = ctx.meta.written
        const bytes = ctx.out(name)
        ctx.check('pdf.js outline count = written', (await outlineCount(bytes)) === written.length, `${await outlineCount(bytes)} vs ${written.length}`)
        const tree = await withPdfjs(bytes, (doc) => doc.getOutline())
        const flat = []
        const walk = (items, depth) => (items ?? []).forEach((it) => (flat.push({ title: it.title, depth, dest: it.dest, url: it.url }), walk(it.items, depth + 1)))
        walk(tree, 1)
        ctx.check('titles in order', flat.map((x) => x.title).join('|') === written.map((x) => x.title.trim()).join('|'), flat.slice(0, 4).map((x) => x.title).join(' | '))
        ctx.check('grandchild nested 3 deep', flat.find((x) => x.title === 'Added grandchild')?.depth === 3)
        // items without a target in the source stay without one
        const targets = written.filter((w) => w.page != null || w.uri).length
        ctx.check('bookmarks with a target keep one', flat.filter((x) => x.dest || x.url).length === targets, `${flat.filter((x) => x.dest || x.url).length} vs ${targets}`)
        // fit-page / fit-width views survive
        const fits = ctx.meta.before.filter((b) => /^Fit/.test(b.fit ?? '')).length
        if (fits) ctx.check('fit views kept', flat.filter((x) => Array.isArray(x.dest) && /^Fit/.test(x.dest[1]?.name ?? '')).length >= fits, `${fits} in source`)
        // old outline items are gone from the file, not only unlinked
        const o = objectsOf(bytes)
        const items = o.dicts.filter((d) => !d.get('Title').isNull() && !d.get('Parent').isNull()).length
        ctx.check('outline objects in file = written', items === written.length, `${items}`)
        await pagesKept(ctx, rel, bytes)
        o.doc.destroy()
      },
      { quick },
    )
  }
  tool('bookmarks-headings-attention', 'bookmarks', ['reports/arxiv-1706.03762-attention.pdf'], { build: 'bookmarksHeadings' }, async (ctx) => {
    run(ctx)
    const name = outName(ctx, /\.pdf$/)
    const p = await checkPdf(ctx, name, { pages: 15 })
    if (!p?.pdfjs.ok) return
    const titles = []
    const walk = (items) => (items ?? []).forEach((it) => (titles.push(it.title), walk(it.items)))
    walk(await withPdfjs(ctx.out(name), (doc) => doc.getOutline()))
    ctx.check('headings found', titles.length >= 8, `${titles.length}: ${titles.join(' | ')}`)
    ctx.check('Introduction and Conclusion found', titles.some((t) => /Introduction/.test(t)) && titles.some((t) => /Conclusion/.test(t)), titles.slice(0, 6).join(' | '))
  })

  // ----- metadata -----
  const INFO = { Title: 'U5B Title über', Author: 'Corpus Author', Subject: 'Structure check', Keywords: 'u5b, corpus', Trapped: 'True' }
  for (const [id, rel, quick] of [
    ['metadata-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', true],
    ['metadata-aws', 'invoices/aws-invoice.pdf', false],
    ['metadata-attention', 'reports/arxiv-1706.03762-attention.pdf', false],
  ]) {
    tool(
      id,
      'metadata',
      [rel],
      { build: 'metadata', info: INFO, custom: [{ key: 'Department', value: 'QA-77' }] },
      async (ctx) => {
        run(ctx)
        const f = await inputFacts(rel)
        const name = outName(ctx, /\.pdf$/)
        const p = await checkPdf(ctx, name, { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const m = await withPdfjs(ctx.out(name), (doc) => doc.getMetadata())
        for (const k of ['Title', 'Author', 'Subject', 'Keywords']) ctx.check(`${k} set`, m.info[k] === INFO[k], m.info[k])
        ctx.check('Trapped set', String(m.info.Trapped?.name ?? m.info.Trapped) === 'True', JSON.stringify(m.info.Trapped))
        ctx.check('custom field set', m.info.Custom?.Department === 'QA-77', JSON.stringify(m.info.Custom))
        ctx.check('XMP title matches', m.metadata?.get('dc:title') === INFO.Title, m.metadata?.get('dc:title'))
        const before = ctx.meta.before.info
        if (before.Producer) ctx.check('other fields kept', m.info.Producer === before.Producer, m.info.Producer)
        // only one XMP packet left in the file
        const o = objectsOf(ctx.out(name))
        const packets = o.streams.filter((s) => nameIs(s.dict, 'Type', 'Metadata') && /x:xmpmeta/.test(s.text) && !nameIs(s.dict, 'Subtype', 'Image'))
        ctx.check('one document XMP packet', packets.filter((s) => s.text.includes('Structure check')).length === 1, `${packets.length} packets`)
        await pagesKept(ctx, rel, ctx.out(name))
        o.doc.destroy()
      },
      { quick },
    )
    tool(`${id}-delete-all`, 'metadata', [rel], { build: 'metadata', deleteAll: true }, async (ctx) => {
      run(ctx)
      const f = await inputFacts(rel)
      const name = outName(ctx, /\.pdf$/)
      const p = await checkPdf(ctx, name, { pages: f.pdfjs.pages })
      if (!p?.pdfjs.ok) return
      const m = await withPdfjs(ctx.out(name), (doc) => doc.getMetadata())
      const left = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'].filter((k) => m.info[k])
      ctx.check('no info fields', left.length === 0, left.join(', '))
      ctx.check('no XMP', !m.metadata, '')
      // old values gone from every string and the XMP packets
      const o = objectsOf(ctx.out(name))
      const old = Object.entries(ctx.meta.before.info).filter(([k, v]) => !/Date|Trapped/.test(k) && String(v).length >= 4)
      const still = old.filter(([, v]) => o.strings.some((s) => s.includes(v) || s.includes(utf16(v))) || o.streams.some((s) => nameIs(s.dict, 'Type', 'Metadata') && s.text.includes(v)))
      ctx.check('old values gone from the file bytes', still.length === 0, still.map(([k]) => k).join(', ') || `${old.length} values checked`)
      ctx.check('no Info in trailer', o.doc.asPDF().getTrailer().get('Info').isNull())
      await pagesKept(ctx, rel, ctx.out(name))
      o.doc.destroy()
    })
  }

  // the pdf-lib path (metadata, bookmarks) keeps a dynamic XFA form whole
  for (const [id, toolId, build] of [
    ['metadata-xfa-imm1344e', 'metadata', 'metadata'],
    ['bookmarks-xfa-imm1344e', 'bookmarks', 'bookmarks'],
  ]) {
    tool(id, toolId, ['forms/xfa-imm1344e-filled.pdf'], { build, info: INFO, custom: [] }, async (ctx) => {
      run(ctx)
      const name = outName(ctx, /\.pdf$/)
      if (!(await checkPdf(ctx, name, { pages: 1 }))?.pdfjs.ok) return
      ctx.check('XFA form kept', (await formFacts(ctx.out(name))).hasXfa)
      const count = (objs, re) => objs.streams.reduce((n, s) => n + (s.text.match(re) ?? []).length, 0)
      const a = objectsOf(readRel('forms/xfa-imm1344e-filled.pdf'))
      const b = objectsOf(ctx.out(name))
      ctx.check('XFA fields kept', count(a, /<field\b/g) === count(b, /<field\b/g), `${count(a, /<field\b/g)} -> ${count(b, /<field\b/g)}`)
      a.doc.destroy()
      b.doc.destroy()
    })
  }

  // ----- attachments: add, list, extract, remove -----
  const BIG = 8 * 1024 * 1024
  for (const [id, rel, quick, big] of [
    ['attachments-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', true],
    ['attachments-aws', 'invoices/aws-invoice.pdf', false],
    ['attachments-fileattachment', 'quirks/pdfjs-annotation-fileattachment.pdf', false],
    // 2 x 8 MB: MuPDF buffer views used to be detached by the next read
    ['attachments-big-aws', 'invoices/aws-invoice.pdf', false, BIG],
  ]) {
    tool(
      id,
      'attachments',
      [rel],
      { build: 'attachments', then: 'attachments', size: 50000, big },
      async (ctx) => {
        if (big) {
          for (const k of [1, 2]) {
            const x = ctx.meta.extracted?.find((e) => e.original === `big-${k}.bin`)
            ctx.check(`${BIG / 1048576} MB file ${k} extracted byte-identical`, !!x && Buffer.compare(Buffer.from(ctx.out(x.name)), Buffer.from(payload(BIG, 1000 + k))) === 0, x ? `${x.size} bytes` : 'missing')
          }
        }
        run(ctx)
        const f = await inputFacts(rel)
        const name = ctx.meta.outputs[0]?.name
        const p = await checkPdf(ctx, name, { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const att = await withPdfjs(ctx.out(name), (doc) => doc.getAttachments())
        const names = Object.values(att ?? {}).map((a) => a.filename)
        ctx.check('pdf.js sees both new files', names.includes('corpus-payload.bin') && names.includes('notes über.txt'), names.join(', '))
        const want = payload(50000)
        const x = ctx.meta.extracted.find((e) => e.original === 'corpus-payload.bin')
        ctx.check('extracted payload is byte-identical', !!x && Buffer.compare(Buffer.from(ctx.out(x.name)), Buffer.from(want)) === 0, x ? `${x.size} bytes` : 'missing')
        const t = ctx.meta.extracted.find((e) => /notes/.test(e.original))
        ctx.check('extracted text file', !!t && latin1(ctx.out(t.name)) === 'SwissPDF attachment check')
        ctx.check('list after remove is empty', ctx.meta.after.length === 0, `${ctx.meta.after.length}`)
        await checkPdf(ctx, 'removed.pdf', { pages: f.pdfjs.pages, label: 'removed' })
        const slice = latin1(want.subarray(20000, 20032))
        const added = objectsOf(ctx.out(name))
        ctx.check('payload in the added file (probe works)', added.streams.some((s) => s.text.includes(slice)))
        added.doc.destroy()
        const gone = objectsOf(ctx.out('removed.pdf'))
        ctx.check('payload bytes gone after remove', !gone.streams.some((s) => s.text.includes(slice)))
        ctx.check('no embedded file streams left', !gone.streams.some((s) => nameIs(s.dict, 'Type', 'EmbeddedFile')))
        await pagesKept(ctx, rel, ctx.out(name))
        await pagesKept(ctx, rel, ctx.out('removed.pdf'))
        gone.doc.destroy()
      },
      { quick },
    )
  }
  // a page-level file attachment (annotation) is listed, extracted, removed
  add({
    id: 'u5b-attachments-remove-annotation',
    tool: 'attachments',
    op: 'u5b:attachRemove',
    files: ['quirks/pdfjs-annotation-fileattachment.pdf'],
    timeout: 2 * MIN,
    async validate(ctx) {
      ctx.metric(`run to result ${ctx.meta?.runMs} ms, ${ctx.meta?.before.length} attachment(s)`)
      ctx.check('attachment listed', ctx.meta.before.length >= 1, `${ctx.meta.before.length}`)
      ctx.check('extracted', ctx.meta.extracted.length === ctx.meta.before.length && ctx.meta.extracted.every((e) => e.size > 0))
      const p = await checkPdf(ctx, 'removed.pdf', { pages: 1 })
      if (!p?.pdfjs.ok) return
      ctx.check('none left', ctx.meta.after.length === 0)
      const o = objectsOf(ctx.out('removed.pdf'))
      ctx.check('no embedded file streams left', !o.streams.some((s) => nameIs(s.dict, 'Type', 'EmbeddedFile')))
      o.doc.destroy()
    },
  })
  // associated files (Factur-X: catalog /AF and name tree; a page /AF) and a
  // tagged file attachment (structure tree OBJR): removed means gone
  const assocGone = (ctx, name) => {
    const o = objectsOf(ctx.out(name))
    ctx.check('probe text gone from every object', !o.has(PROBE), '')
    ctx.check('no file stream with data left', !o.streams.some((s) => nameIs(s.dict, 'Type', 'EmbeddedFile') && s.text.length > 0))
    ctx.check('no /AF left', !o.dicts.some((d) => !d.get('AF').isNull()))
    o.doc.destroy()
  }
  add({
    id: 'u5b-attachments-facturx',
    tool: 'attachments',
    op: 'u5b:attachRemove',
    files: ['invoices/aws-invoice.pdf'],
    params: { prep: 'facturx' },
    timeout: 2 * MIN,
    async validate(ctx) {
      ctx.metric(`run to result ${ctx.meta?.runMs} ms, ${ctx.meta?.before.length} attachment(s)`)
      const src = objectsOf(ctx.out('input-prepared.pdf'))
      ctx.check('probe in the prepared input', src.has(PROBE))
      src.doc.destroy()
      ctx.check('none listed after remove', ctx.meta.after.length === 0)
      if (!(await checkPdf(ctx, 'removed.pdf', { pages: 1 }))?.pdfjs.ok) return
      assocGone(ctx, 'removed.pdf')
    },
  })
  add({
    id: 'u5b-attachments-tagged-annotation',
    tool: 'attachments',
    op: 'u5b:attachRemove',
    files: ['quirks/pdfjs-annotation-fileattachment.pdf'],
    params: { prep: 'tagAnnot' },
    timeout: 2 * MIN,
    async validate(ctx) {
      ctx.metric(`run to result ${ctx.meta?.runMs} ms, ${ctx.meta?.before.length} attachment(s)`)
      if (!(await checkPdf(ctx, 'removed.pdf', { pages: 1 }))?.pdfjs.ok) return
      const o = objectsOf(ctx.out('removed.pdf'))
      ctx.check('file annotation gone', !o.dicts.some((d) => nameIs(d, 'Subtype', 'FileAttachment')))
      ctx.check('no file stream with data left', !o.streams.some((s) => nameIs(s.dict, 'Type', 'EmbeddedFile') && s.text.length > 0))
      ctx.check('no OBJR left pointing nowhere', !o.dicts.some((d) => nameIs(d, 'Type', 'OBJR')))
      o.doc.destroy()
    },
  })
  tool('sanitize-facturx', 'sanitize', ['invoices/aws-invoice.pdf'], { prep: 'facturx' }, async (ctx) => {
    run(ctx)
    const name = outName(ctx, /\.pdf$/)
    if (!(await checkPdf(ctx, name, { pages: 1 }))?.pdfjs.ok) return
    assocGone(ctx, name)
  })

  // AES-256 with an open password (not in the manifest): a clear refusal
  add({
    id: 'u5b-attachments-encrypted',
    tool: 'attachments',
    op: 'u5b:attachRemove',
    files: ['quirks/pdfjs-encrypted-attachment.pdf'],
    timeout: 2 * MIN,
    allowError: true,
    async validate(ctx) {
      ctx.check('asks to unlock first', /password/i.test(ctx.error ?? ''), ctx.error ?? 'no error')
    },
  })

  // ----- remove annotations -----
  const ANNOT_KEEP = new Set(['Widget', 'Popup'])
  for (const [id, rel, options, quick] of [
    ['removeannots-tracemonkey', 'quirks/pdfjs-tracemonkey_with_annotations.pdf', { mode: 'all', widgets: false, groups: [] }, true],
    ['removeannots-fileattachment', 'quirks/pdfjs-annotation-fileattachment.pdf', { mode: 'all', widgets: false, groups: [] }, false],
    ['removeannots-fw9-fields', 'forms/irs-fw9.pdf', { mode: 'all', widgets: true, groups: [] }, false],
  ]) {
    tool(
      id,
      'removeannots',
      [rel],
      { options },
      async (ctx) => {
        run(ctx)
        const f = await inputFacts(rel)
        const name = outName(ctx, /\.pdf$/)
        const p = await checkPdf(ctx, name, { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const left = await withPdfjs(ctx.out(name), async (doc) => {
          const types = []
          for (let i = 1; i <= doc.numPages; i++) for (const a of await (await doc.getPage(i)).getAnnotations()) types.push(a.subtype)
          return types
        })
        const allowed = options.widgets ? new Set() : ANNOT_KEEP
        ctx.check('no annotations left on pages', left.every((t) => allowed.has(t)), left.slice(0, 6).join(', '))
        const o = objectsOf(ctx.out(name))
        const annotDicts = o.dicts.filter((d) => d.get('Subtype').isName() && !d.get('Rect').isNull() && !nameIs(d, 'Type', 'XObject') && !allowed.has(d.get('Subtype').asName()))
        ctx.check('annotation objects gone from the file', annotDicts.length === 0, `${annotDicts.length} left`)
        if (options.widgets) {
          ctx.check('form gone', o.dicts.every((d) => d.get('FT').isNull()) && o.doc.asPDF().getTrailer().get('Root').get('AcroForm').isNull())
        }
        o.doc.destroy()
        await pagesKept(ctx, rel, ctx.out(name))
      },
      { quick },
    )
  }

  // ----- remove images -----
  for (const [id, rel, quick] of [
    ['removeimages-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', true],
    ['removeimages-aws', 'invoices/aws-invoice.pdf', false],
    ['removeimages-attention', 'reports/arxiv-1706.03762-attention.pdf', false],
    // inline images (BI ... ID ... EI) in the content streams
    ['removeimages-inline-hebrew', 'intl/udhr-hebrew.pdf', false],
    ['removeimages-inline-gpt3', 'reports/arxiv-2005.14165-gpt3.pdf', false],
  ]) {
    tool(
      id,
      'removeimages',
      [rel],
      {},
      async (ctx) => {
        run(ctx)
        const f = await inputFacts(rel)
        const name = outName(ctx, /\.pdf$/)
        const p = await checkPdf(ctx, name, { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const src = objectsOf(readRel(rel))
        const srcImages = src.streams.filter((s) => nameIs(s.dict, 'Subtype', 'Image'))
        // a sample of each source image's pixel data, to look for afterwards
        const samples = srcImages
          .filter((s) => s.text.length >= 400)
          .map((s) => s.text.slice(200, 232))
          .filter((t) => new Set(t).size >= 8) // flat runs could match font data

        src.doc.destroy()
        const o = objectsOf(ctx.out(name))
        // images out of reach of the page filter are left as 1x1 empty masks
        const real = o.streams.filter((s) => nameIs(s.dict, 'Subtype', 'Image') && !(s.dict.get('ImageMask').isBoolean() &&s.dict.get('Width').asNumber() === 1 && s.dict.get('Height').asNumber() === 1))
        const kept = samples.filter((t) => o.streams.some((s) => s.text.includes(t)))
        o.doc.destroy()
        ctx.check('image objects gone from the file', real.length === 0, `${srcImages.length} -> ${real.length}`)
        ctx.check('image data gone from the bytes', kept.length === 0, `${kept.length} of ${samples.length} samples found`)
        await pagesKept(ctx, rel, ctx.out(name))
        // text and vector art untouched: page and form content streams are the
        // source's, minus the inline image spans (cut here by a plain regex)
        const a = contentOf(readRel(rel), true)
        const b = contentOf(ctx.out(name), false)
        const pageDiff = a.pages.findIndex((t, i) => t !== b.pages[i])
        ctx.check('page content unchanged apart from inline images', pageDiff < 0 && a.pages.length === b.pages.length, pageDiff < 0 ? `${a.pages.length} pages, ${a.inline} inline images in the source` : `page ${pageDiff + 1} differs`)
        ctx.check('form content unchanged apart from inline images', a.forms.join('\n\0') === b.forms.join('\n\0'), `${a.forms.length} vs ${b.forms.length} forms`)
        ctx.check('no inline images left', b.inline === 0, `${b.inline}`)
        ctx.check('smaller file', ctx.out(name).length < readRel(rel).length)
      },
      { quick },
    )
  }

  // ----- extract images -----
  for (const [id, rel, format, quick] of [
    ['extractimages-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', 'png', false],
    ['extractimages-aws', 'invoices/aws-invoice.pdf', 'png', true],
    ['extractimages-attention', 'reports/arxiv-1706.03762-attention.pdf', 'png', false],
    ['extractimages-cmyk-png', 'quirks/pdfjs-cmykjpeg.pdf', 'png', true],
    ['extractimages-cmyk-jpg', 'quirks/pdfjs-cmykjpeg.pdf', 'jpg', false],
  ]) {
    tool(
      id,
      'extractimages',
      [rel],
      { options: { format, keepJpeg: true } },
      async (ctx) => {
        run(ctx)
        const name = outName(ctx, /\.zip$/)
        const bytes = name && ctx.out(name)
        if (!bytes) return ctx.check('zip written', false)
        const zip = await JSZip.loadAsync(bytes)
        const entries = Object.keys(zip.files).filter((n) => !zip.files[n].dir)
        const src = objectsOf(readRel(rel))
        const images = imageObjects(src)
        ctx.check('one file per image object', entries.length === images.length, `${entries.length} files, ${images.length} images`)
        // every entry decodes, with the image's size
        let bad = 0
        let alpha = 0
        for (const n of entries) {
          try {
            const img = new mupdf.Image(await zip.file(n).async('uint8array'))
            if (!(img.getWidth() > 0)) bad++
            if (img.getMask() || img.toPixmap().getAlpha()) alpha++
          } catch {
            bad++
          }
        }
        ctx.check('every file decodes', bad === 0, `${bad} bad`)
        const jpegs = images.filter((s) => nameIs(s.dict, 'Filter', 'DCTDecode') && s.dict.get('SMask').isNull() && (nameIs(s.dict, 'ColorSpace', 'DeviceRGB') || nameIs(s.dict, 'ColorSpace', 'DeviceGray')))
        if (jpegs.length) {
          const raw = jpegs[0].dict.readRawStream().asUint8Array()
          const kept = []
          for (const n of entries.filter((e) => e.endsWith('.jpg'))) kept.push(Buffer.compare(Buffer.from(await zip.file(n).async('uint8array')), Buffer.from(raw)) === 0)
          ctx.check('plain JPEG kept byte-for-byte', kept.some(Boolean), `${kept.length} jpg files`)
        }
        if (/cmyk/.test(rel)) {
          // colours match MuPDF's own decode of the PDF image (not inverted)
          const pdf = src.doc.asPDF()
          const ref = pdf.loadImage(pdf.newIndirect(images[0].num))
          const want = meanRgb(ref.toPixmap())
          const got = meanRgb(new mupdf.Image(await zip.file(entries[0]).async('uint8array')).toPixmap())
          const diff = Math.max(...want.map((v, i) => Math.abs(v - got[i])))
          ctx.check('colours match the PDF render', diff < 10, `mean diff ${diff.toFixed(1)} (want ${want.map((v) => v.toFixed(0))}, got ${got.map((v) => v.toFixed(0))})`)
        }
        if (/tracemonkey/.test(rel)) ctx.check('soft masks become PNG alpha', alpha > 0, `${alpha} with alpha`)
        src.doc.destroy()
      },
      { quick },
    )
  }

  // ----- flatten -----
  // a dynamic XFA form (no AcroForm fields, or only a signature field as in
  // imm1344e) is refused, not emptied to its "Please wait" page
  for (const [id, toolId, rel, options] of [
    ['flatten-xfa-dynamic', 'flatten', 'forms/xfa-issue14315.pdf', { mode: 'forms' }],
    ['flatten-xfa-imm1344e', 'flatten', 'forms/xfa-imm1344e-filled.pdf', { mode: 'forms' }],
    ['flatten-full-xfa-imm1344e', 'flatten', 'forms/xfa-imm1344e-filled.pdf', { mode: 'full' }],
    ['removeannots-fields-xfa-imm1344e', 'removeannots', 'forms/xfa-imm1344e-filled.pdf', { mode: 'all', widgets: true, groups: [] }],
  ]) {
    tool(id, toolId, [rel], { options }, async (ctx) => {
      ctx.check('refused with a clear message', /dynamic XFA form/.test(ctx.error ?? ''), ctx.error ?? 'no error')
    }, { allowError: true })
  }
  // Sanitize keeps a dynamic XFA form and takes out its scripts
  tool('sanitize-xfa-imm1344e', 'sanitize', ['forms/xfa-imm1344e-filled.pdf'], {}, async (ctx) => {
    run(ctx)
    const name = outName(ctx, /\.pdf$/)
    if (!(await checkPdf(ctx, name, { pages: 1 }))?.pdfjs.ok) return
    const facts = await formFacts(ctx.out(name))
    ctx.check('XFA form kept', facts.hasXfa)
    const o = objectsOf(ctx.out(name))
    const scripts = o.streams.reduce((n, s) => n + (s.text.replace(/<config\b[\s\S]*?<\/config\s*>/g, '').match(/<script\b[^>]*(?<!\/)>[\s\S]*?<\/script\s*>/g) ?? []).filter((m) => m.replace(/<[^>]*>/g, '').trim()).length, 0)
    ctx.check('no XFA scripts left', scripts === 0, `${scripts}`)
    ctx.check('no JS entries in the file', o.dicts.every((d) => d.get('JS').isNull() && !nameIs(d, 'S', 'JavaScript')))
    ctx.check('form data kept', o.streams.some((s) => /<(?:xfa:)?datasets\b/.test(s.text)))
    // the form itself is intact: same fields and subforms as the source
    const count = (objs, re) => objs.streams.reduce((n, s) => n + (s.text.match(re) ?? []).length, 0)
    const src = objectsOf(readRel('forms/xfa-imm1344e-filled.pdf'))
    for (const [label, re] of [['fields', /<field\b/g], ['subforms', /<subform\b/g]]) {
      ctx.check(`XFA ${label} kept`, count(o, re) === count(src, re), `${count(src, re)} -> ${count(o, re)}`)
    }
    src.doc.destroy()
    o.doc.destroy()
  })
  for (const [id, rel, quick] of [
    ['flatten-fw9', 'forms/irs-fw9.pdf', true],
    ['flatten-i9', 'forms/uscis-i-9.pdf', false],
    ['flatten-fw4', 'forms/irs-fw4.pdf', false],
  ]) {
    tool(
      id,
      'flatten',
      [rel],
      { options: { mode: 'forms' }, fill: true },
      async (ctx) => {
        run(ctx)
        const f = await inputFacts(rel)
        const name = outName(ctx, /\.pdf$/)
        const p = await checkPdf(ctx, name, { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const facts = await formFacts(ctx.out(name))
        ctx.check('no fields left', facts.count === 0, `${facts.count}`)
        ctx.check('no XFA left', !facts.hasXfa)
        const values = Object.values(ctx.meta.values ?? {})
        if (values.length) ctx.check('filled values in the page text', values.every((v) => allText(p).includes(v)), values.join(', '))
        const o = objectsOf(ctx.out(name))
        ctx.check('field objects gone from the file', o.dicts.every((d) => d.get('FT').isNull()))
        ctx.check('XFA packets gone from the file', !o.streams.some((s) => /<xdp:xdp|<template[\s>]/.test(s.text)))
        o.doc.destroy()
      },
      { quick },
    )
  }
  tool('flatten-full-tracemonkey', 'flatten', ['quirks/pdfjs-tracemonkey_with_annotations.pdf'], { options: { mode: 'full' } }, async (ctx) => {
    run(ctx)
    const name = outName(ctx, /\.pdf$/)
    const p = await checkPdf(ctx, name, { pages: 14 })
    if (!p?.pdfjs.ok) return
    const left = await withPdfjs(ctx.out(name), async (doc) => {
      const types = []
      for (let i = 1; i <= doc.numPages; i++) for (const a of await (await doc.getPage(i)).getAnnotations()) types.push(a.subtype)
      return types
    })
    ctx.check('only links left', left.every((t) => t === 'Link'), [...new Set(left)].join(', '))
    await pagesKept(ctx, 'quirks/pdfjs-tracemonkey_with_annotations.pdf', ctx.out(name))
  })

  // ----- unlock forms -----
  for (const [id, rel, quick, prep] of [
    ['unlockforms-fw9', 'forms/irs-fw9.pdf', true],
    ['unlockforms-i9', 'forms/uscis-i-9.pdf', false],
    ['unlockforms-xfa', 'forms/xfa-imm1344e-filled.pdf', false],
    // fw9 with its XFA as one stream instead of named packets
    ['unlockforms-xfa-single-stream', 'forms/irs-fw9.pdf', false, 'xfaSingle'],
  ]) {
    tool(
      id,
      'unlockforms',
      [rel],
      { lock: true, prep },
      async (ctx) => {
        run(ctx)
        const f = await inputFacts(rel)
        ctx.check('input was locked first', ctx.meta.locked.fields + ctx.meta.locked.xfa > 0, JSON.stringify(ctx.meta.locked))
        if (ctx.meta.locked.fields) {
          // pdf.js field objects carry `editable: false` for read-only fields
          const seen = await withPdfjs(ctx.out('input-locked.pdf'), async (doc) => {
            const all = Object.values((await doc.getFieldObjects()) ?? {}).flat()
            return { all: all.length, ro: all.filter((x) => x.editable === false).length, types: [...new Set(all.map((x) => x.type))].join(',') }
          })
          // pdf.js lists only signature fields of the XFA form (imm1344e)
          const onlySig = seen.types.split(',').every((t) => !t || t === 'signature')
          ctx.check('pdf.js sees the locked input as read-only', seen.ro > 0 || onlySig, JSON.stringify(seen))
        }
        const name = outName(ctx, /\.pdf$/)
        const p = await checkPdf(ctx, name, { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const ro = await withPdfjs(ctx.out(name), async (doc) => Object.values((await doc.getFieldObjects()) ?? {}).flat().filter((x) => x.editable === false).length)
        ctx.check('no read-only fields (pdf.js)', ro === 0, `${ro}`)
        const before = await formFacts(readRel(rel))
        const after = await formFacts(ctx.out(name))
        ctx.check('fields and values kept', after.count === before.count && JSON.stringify(after.values) === JSON.stringify(before.values), `${before.count} -> ${after.count}`)
        await pagesKept(ctx, rel, ctx.out(name))
        const o = objectsOf(ctx.out(name))
        // asNumber() is a 32-bit float: read the flag word as text
        const flagged = o.dicts.filter((d) => d.get('Ff').isInteger() && parseInt(d.get('Ff').toString(), 10) & 1).length
        ctx.check('no read-only flags in the file', flagged === 0, `${flagged}`)
        if (ctx.meta.locked.xfa) ctx.check('XFA unlocked', !o.streams.some((s) => /<field\b[^>]*access="readOnly"/.test(s.text)) && /XFA lock/.test(ctx.meta.outputs[0]?.note ?? ''), ctx.meta.outputs[0]?.note)
        o.doc.destroy()
      },
      { quick },
    )
  }

  // a form with nothing locked (dynamic XFA, no fields) comes back unchanged
  tool('unlockforms-xfa-nothing-locked', 'unlockforms', ['forms/xfa-issue14315.pdf'], {}, async (ctx) => {
    run(ctx)
    const o = ctx.meta.outputs[0]
    ctx.check('says nothing was locked', /No read-only fields/.test(o?.note ?? ''), o?.note)
    ctx.check('bytes unchanged', !!o && Buffer.compare(Buffer.from(ctx.out(o.name)), Buffer.from(readRel('forms/xfa-issue14315.pdf'))) === 0)
  })

  // ----- sanitize -----
  const SAN_ALL = { javascript: true, embeddedFiles: true, xmp: true, metadata: true, links: true, fonts: true }
  for (const [id, rel, options, quick] of [
    ['sanitize-fw9', 'forms/irs-fw9.pdf', null, true],
    ['sanitize-i9', 'forms/uscis-i-9.pdf', null, false],
    ['sanitize-fileattachment', 'quirks/pdfjs-annotation-fileattachment.pdf', null, false],
    ['sanitize-all-tracemonkey', 'quirks/pdfjs-tracemonkey_with_annotations.pdf', SAN_ALL, false],
    ['sanitize-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', null, false],
    ['sanitize-aws', 'invoices/aws-invoice.pdf', null, false],
    ['sanitize-attention', 'reports/arxiv-1706.03762-attention.pdf', null, false],
  ]) {
    tool(
      id,
      'sanitize',
      [rel],
      options ? { options } : {},
      async (ctx) => {
        run(ctx)
        const f = await inputFacts(rel)
        const name = outName(ctx, /\.pdf$/)
        const p = await checkPdf(ctx, name, { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const out = ctx.out(name)
        const js = await withPdfjs(out, async (doc) => {
          const fields = Object.values((await doc.getFieldObjects()) ?? {}).flat()
          return { doc: Object.keys((await doc.getJSActions()) ?? {}).length, fields: fields.filter((x) => x.actions && Object.keys(x.actions).length).length, att: Object.keys((await doc.getAttachments()) ?? {}).length }
        })
        ctx.check('no document scripts (pdf.js)', js.doc === 0, `${js.doc}`)
        ctx.check('no field scripts (pdf.js)', js.fields === 0, `${js.fields}`)
        ctx.check('no attachments (pdf.js)', js.att === 0, `${js.att}`)
        // source scripts gone from the bytes
        const src = objectsOf(readRel(rel))
        const snippets = src.dicts
          .map((d) => d.get('JS'))
          .filter((v) => !v.isNull())
          .map((v) => (v.isString() ? v.asString() : v.isStream() ? latin1(v.readStream().asUint8Array()) : ''))
          .map((s) => s.trim().slice(0, 40))
          .filter((s) => s.length >= 20)
        src.doc.destroy()
        const o = objectsOf(out)
        ctx.check('no JS entries in the file', o.dicts.every((d) => d.get('JS').isNull() && !nameIs(d, 'S', 'JavaScript')))
        const kept = snippets.filter((s) => o.has(s))
        ctx.check('script text gone from the bytes', kept.length === 0, `${kept.length} of ${snippets.length} left`)
        ctx.check('no embedded files in the file', !o.streams.some((s) => nameIs(s.dict, 'Type', 'EmbeddedFile')))
        if (options?.fonts) ctx.check('no embedded fonts', !o.dicts.some((d) => ['FontFile', 'FontFile2', 'FontFile3'].some((k) => !d.get(k).isNull())))
        if (options?.metadata) ctx.check('no Info', o.doc.asPDF().getTrailer().get('Info').isNull())
        if (options?.xmp) ctx.check('no XMP', !o.streams.some((s) => nameIs(s.dict, 'Type', 'Metadata')))
        if (options?.links) ctx.check('no URI actions', !o.dicts.some((d) => nameIs(d, 'S', 'URI')))
        o.doc.destroy()
        await pagesKept(ctx, rel, out)
      },
      { quick },
    )
  }

  // ----- change permissions -----
  const ALLOW = { print: true, 'print-hq': true, copy: false, accessibility: true, edit: false, annotate: false, form: false, assemble: false }
  for (const [id, rel, quick, prep] of [
    ['permissions-owner-only-aws', 'derived/owner-only-aws-invoice.pdf', true],
    ['permissions-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', false],
    ['permissions-fw9', 'forms/irs-fw9.pdf', false],
    ['permissions-orphan-aws', 'invoices/aws-invoice.pdf', false, 'orphan'],
  ]) {
    tool(
      id,
      'permissions',
      [rel],
      { options: { allow: ALLOW, owner: 'Own3r-pass', confirm: 'Own3r-pass' }, prep },
      async (ctx) => {
        run(ctx)
        const f = await inputFacts(rel)
        const name = outName(ctx, /\.pdf$/)
        const p = await checkPdf(ctx, name, { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const { doc, needsPassword } = openMupdf(ctx.out(name))
        ctx.check('opens without a password', !needsPassword)
        ctx.check('AES-256', /AES/.test(doc.getMetaData('encryption') ?? ''), doc.getMetaData('encryption'))
        const got = { print: doc.hasPermission('print'), copy: doc.hasPermission('copy'), edit: doc.hasPermission('edit'), annotate: doc.hasPermission('annotate'), form: doc.hasPermission('form') }
        ctx.check('flags as set (MuPDF)', got.print && !got.copy && !got.edit && !got.annotate && !got.form, JSON.stringify(got))
        doc.destroy()
        const perms = await withPdfjs(ctx.out(name), (d) => d.getPermissions())
        ctx.check('pdf.js sees print but not copy', !!perms && perms.includes(4) && !perms.includes(16), JSON.stringify(perms))
        const { doc: owner } = openMupdf(ctx.out(name))
        ctx.check('owner password lifts it', owner.authenticatePassword('Own3r-pass') >= 4 || owner.hasPermission('copy'), '')
        owner.destroy()
        await pagesKept(ctx, rel, ctx.out(name))
        if (prep === 'orphan') {
          // the encrypting save drops unused objects too
          const o = objectsOf(ctx.out(name))
          ctx.check('orphan object gone', !o.has(`${PROBE}-ORPHAN`))
          o.doc.destroy()
        }
      },
      { quick },
    )
  }

  // ----- info -----
  for (const [id, rel, quick] of [
    ['info-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', true],
    ['info-aws', 'invoices/aws-invoice.pdf', false],
    ['info-fw9', 'forms/irs-fw9.pdf', false],
    ['info-attention', 'reports/arxiv-1706.03762-attention.pdf', false],
  ]) {
    tool(
      id,
      'info',
      [rel],
      {},
      async (ctx) => {
        run(ctx)
        const f = await inputFacts(rel)
        const name = outName(ctx, /\.json$/)
        let info = null
        try {
          info = JSON.parse(Buffer.from(ctx.out(name)).toString('utf8'))
        } catch (err) {
          return ctx.check('report is JSON', false, err.message)
        }
        ctx.check('page count', info.pages.count === f.pdfjs.pages, `${info.pages.count}`)
        ctx.check('per-page list', info.pages.list.length === f.pdfjs.pages)
        const src = objectsOf(readRel(rel))
        const images = imageObjects(src).length
        src.doc.destroy()
        ctx.check('image count matches the file', info.images.count === images, `${info.images.count} vs ${images}`)
        if (/fw9/.test(rel)) ctx.check('form fields and XFA', info.forms.fields > 20 && info.forms.xfa !== 'none' && info.javascript.documentScripts > 0, `${info.forms.fields} fields, xfa ${info.forms.xfa}, ${info.javascript.documentScripts} scripts`)
        if (/tracemonkey/.test(rel)) ctx.check('fonts listed', info.fonts.count > 5, `${info.fonts.count}`)
        ctx.check('inputs kept (report only)', ctx.meta.outputs.length === 1)
      },
      { quick },
    )
  }

  // ----- auto rename -----
  for (const [id, rel, want, quick] of [
    ['autorename-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', /Trace-based Just-in-Time/i, true],
    ['autorename-attention', 'reports/arxiv-1706.03762-attention.pdf', /Attention Is All You Need/i, false],
    ['autorename-aws', 'invoices/aws-invoice.pdf', /\w/, false],
  ]) {
    tool(
      id,
      'autorename',
      [rel],
      {},
      async (ctx) => {
        run(ctx)
        const o = ctx.meta.outputs[0]
        ctx.check('renamed', !!o && o.original !== rel.split('/').pop(), o?.original)
        if (!o) return
        ctx.check('name from the document', want.test(o.original), o.original)
        ctx.check('safe file name', /^[^<>:"/\\|?*\u0000-\u001f]+\.pdf$/.test(o.original) && o.original.length <= 84, o.original)
        ctx.check('bytes unchanged', Buffer.compare(Buffer.from(ctx.out(o.name)), Buffer.from(readRel(rel))) === 0)
      },
      { quick },
    )
  }

  // ----- show JavaScript -----
  // the structure test files have no scripts: a clear message, no empty file
  tool('showjs-none-outlines', 'showjs', ['quirks/pdfjs-outlines_se.pdf'], {}, async (ctx) => {
    ctx.check('says no JavaScript found', /No JavaScript found/.test(ctx.error ?? ''), ctx.error ?? 'no error')
  }, { allowError: true })
  for (const [id, rel, quick] of [
    ['showjs-fw9', 'forms/irs-fw9.pdf', true],
    ['showjs-i9', 'forms/uscis-i-9.pdf', false],
    ['showjs-xfa', 'forms/xfa-issue14315.pdf', false],
    ['showjs-xfa-imm1344e', 'forms/xfa-imm1344e-filled.pdf', false],
  ]) {
    tool(
      id,
      'showjs',
      [rel],
      {},
      async (ctx) => {
        run(ctx)
        const name = outName(ctx, /\.js$/)
        const text = name ? Buffer.from(ctx.out(name)).toString('utf8') : ''
        ctx.check('report written', text.length > 0)
        // every script pdf.js finds is in the report
        const codes = await withPdfjs(readRel(rel), async (doc) => {
          const out = []
          for (const list of Object.values((await doc.getJSActions()) ?? {})) out.push(...list)
          for (const f of Object.values((await doc.getFieldObjects()) ?? {}).flat()) for (const list of Object.values(f.actions ?? {})) out.push(...list)
          return [...new Set(out.map((c) => c.trim()).filter(Boolean))]
        })
        const norm = (s) => s.replace(/\s+/g, ' ').trim()
        const report = norm(text)
        const missing = codes.filter((c) => !report.includes(norm(c).slice(0, 200)))
        ctx.check('every pdf.js script listed', codes.length > 0 && missing.length === 0, `${codes.length - missing.length} of ${codes.length}${missing[0] ? `, missing: ${missing[0].slice(0, 60)}` : ''}`)
        // pdf.js never lists XFA scripts: count the <script> elements with code
        // (outside the config packet) and compare
        const src = objectsOf(readRel(rel))
        // counted by tags, not by the app's open/close pattern: every <script
        // opening tag, minus self-closing ones, minus empty bodies
        let opened = 0
        let selfClosed = 0
        let empty = 0
        for (const s of src.streams) {
          const t = s.text.replace(/<config\b[\s\S]*?<\/config\s*>/g, '')
          opened += (t.match(/<script\b/g) ?? []).length
          selfClosed += (t.match(/<script\b[^>]*\/>/g) ?? []).length
          empty += (t.match(/<script\b[^>]*[^/]>\s*(?:<!\[CDATA\[\s*\]\]>)?\s*<\/script\s*>/g) ?? []).length
        }
        const xfa = opened - selfClosed - empty
        ctx.metric(`run to result ${ctx.meta?.runMs} ms: ${opened} XFA <script> tags, ${selfClosed} self-closing, ${empty} empty`)
        src.doc.destroy()
        const listed = (text.match(/^\/\/ ---- \d+\. XFA form/gm) ?? []).length
        ctx.check('every XFA script listed', listed === xfa, `${listed} listed, ${xfa} in the file`)
        ctx.check('input kept as it is', ctx.meta.outputs.length === 1 && ctx.meta.outputs[0].type === 'text/javascript')
      },
      { quick },
    )
  }
}
