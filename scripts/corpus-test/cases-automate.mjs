// S3 Automate on real corpus files: each built-in automation on its 3 files
// (one run per file, timed), a 3-file batch, a batch with a file that fails
// a step while the others go through, and cancel mid-run. Ops live in
// page-harness-automate.js; every output is reopened here in pdf.js and MuPDF
// and checked for each step's effect.
import { openMupdf, probe } from './validate.mjs'
import { checkLinearized } from './lin-check.mjs'

const PASSWORD = 'S3 mail-Pw 7741'
const TEXT_FILES = ['reports/pdfjs-tracemonkey.pdf', 'invoices/aws-invoice.pdf', 'forms/irs-fw9.pdf']
const SCAN_FILES = ['scanned/fax-jean-schmidt-doe.pdf', 'derived/sub-ndl-konoye-p1.pdf', 'scanned/lincoln-ellsworth-letter-1861.pdf']

// Dictionary value, or null when the object or the key is missing (MuPDF
// throws on get() of a null object).
const at = (o, k) => {
  if (!o || o.isNull() || !o.isDictionary()) return null
  const v = o.get(k)
  return v && !v.isNull() ? v : null
}

const words = (s) => (String(s ?? '').match(/[\p{L}\p{N}]{3,}/gu) ?? []).length

// Structure facts from MuPDF objects: info keys, XMP, annotation types,
// form fields, scripts, attached files, encryption.
function facts(bytes, password) {
  const { doc, needsPassword, authOk } = openMupdf(bytes, password)
  try {
    const pdf = doc.asPDF()
    const out = { needsPassword, authOk, encryption: doc.getMetaData('encryption') ?? 'None', info: [], xmp: false, annots: {}, fields: 0, scripts: 0, files: 0 }
    const info = pdf.getTrailer().get('Info')
    if (info && !info.isNull() && info.isDictionary()) info.forEach((v, k) => String(v ?? '').length && out.info.push(k))
    const root = pdf.getTrailer().get('Root')
    out.xmp = !!at(root, 'Metadata')
    const fields = at(at(root, 'AcroForm'), 'Fields')
    out.fields = fields && fields.isArray() ? fields.length : 0
    const names = at(root, 'Names')
    if (at(names, 'JavaScript')) out.scripts++
    if (at(names, 'EmbeddedFiles')) out.files++
    for (let i = 0; i < pdf.countPages(); i++) {
      const annots = at(pdf.findPage(i), 'Annots')
      if (!annots || !annots.isArray()) continue
      for (let k = 0; k < annots.length; k++) {
        const t = at(annots.get(k).resolve(), 'Subtype')
        const name = t && t.isName() ? t.asName() : '?'
        out.annots[name] = (out.annots[name] ?? 0) + 1
      }
    }
    // any JavaScript action or attached file stream anywhere in the file
    const n = pdf.countObjects()
    for (let i = 1; i < n; i++) {
      let o
      try {
        o = pdf.newIndirect(i).resolve()
      } catch {
        continue
      }
      if (!o || !o.isDictionary()) continue
      const s = at(o, 'S')
      if ((s?.isName() && s.asName() === 'JavaScript') || at(o, 'JS')) out.scripts++
      const type = at(o, 'Type')
      if (type?.isName() && type.asName() === 'EmbeddedFile') out.files++
    }
    // where each link goes: page of the link, then URI or target page
    out.links = []
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i)
      for (const l of page.getLinks()) {
        let to
        try {
          to = l.isExternal() ? l.getURI() : `page ${doc.resolveLink(l)}`
        } catch {
          to = 'unresolved'
        }
        out.links.push(`${i}:${to}`)
      }
      page.destroy?.()
    }
    out.links.sort()
    return out
  } finally {
    doc.destroy?.()
  }
}

const short = (rel) => rel.split('/').pop().replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 24)

export default function register({ add, checkPdf, inputFacts, readRel, allText, MIN }) {
  // One row per file. check(ctx, { rel, f, p, out, run, meta }) adds the step checks.
  const templateRows = (template, files, { overrides, quick = false, timeout = 3 * MIN, password, check }) => {
    for (const [k, rel] of files.entries()) {
      add({
        id: `s3-${template.replace(/^tpl-/, '')}-${short(rel)}`,
        tool: 'automate',
        op: 'automate:run',
        files: [rel],
        params: { template, overrides },
        timeout,
        quick: quick && k === 0,
        async validate(ctx) {
          const run = ctx.meta?.runs?.[0]
          ctx.check('automation ran', !!run && !run.error, run?.error ?? '')
          if (!run || run.error) return
          const f = await inputFacts(rel)
          const out = run.outputs[0]
          ctx.check('one output for the file', run.outputs.length === 1, `${run.outputs.length} outputs`)
          const steps = run.report[0]?.log ?? []
          ctx.check('every step ran or had nothing to do', steps.every((l) => l.status !== 'failed'), steps.map((l) => `${l.tool} ${l.status}`).join(', '))
          const lastLabel = run.labels.find((l) => /^File 1 of 1, step \d+ of \d+: /.test(l))
          ctx.check('progress names file and step', !!lastLabel, run.labels.slice(0, 3).join(' | '))
          const p = await checkPdf(ctx, 'out-0.pdf', { pages: f.pdfjs.pages, password })
          if (!p?.pdfjs.ok) return
          await check(ctx, { rel, f, p, out, run, bytes: ctx.out('out-0.pdf') })
          ctx.check('no network fetches outside the page origin', ctx.external.length === 0, ctx.external.slice(0, 3).join(', '))
          ctx.metric(`run ${run.runMs} ms; ${steps.map((l) => `${l.tool} ${l.status === 'done' ? `${l.ms}ms` : l.status}`).join(', ')}`)
        },
      })
    }
  }

  // ----- Clean copy to share: sanitize, flatten, remove annotations, clear metadata, compress -----
  // input -> output for each step's target, so a check on a file without the
  // thing reads "0 -> 0" rather than passing silently
  const nonLink = (a) => Object.entries(a).filter(([t]) => t !== 'Link').reduce((n, [, v]) => n + v, 0)
  const shareChecks = async (ctx, { rel, f, p, bytes }) => {
    const x = facts(bytes)
    const i = facts(readRel(rel))
    ctx.check('no scripts left (sanitize)', x.scripts === 0, `${i.scripts} -> ${x.scripts} script objects`)
    ctx.check('no attached files left (sanitize)', x.files === 0, `${i.files} -> ${x.files} attached file objects`)
    ctx.check('no form fields (flatten)', x.fields === 0 && !x.annots.Widget, `${i.fields} -> ${x.fields} fields, ${i.annots.Widget ?? 0} -> ${x.annots.Widget ?? 0} widgets`)
    ctx.check('no annotations except links (remove annotations)', nonLink(x.annots) === 0, `${nonLink(i.annots)} -> ${nonLink(x.annots)}: ${JSON.stringify(x.annots)}`)
    const lost = i.links.filter((l, k) => x.links[k] !== l)
    ctx.check('links kept, same targets', x.links.length === i.links.length && lost.length === 0, `${i.links.length} -> ${x.links.length} links${lost.length ? `, changed: ${lost.slice(0, 3).join(', ')}` : ''}`)
    ctx.check('document info cleared (metadata)', x.info.length === 0, `${i.info.length} -> ${x.info.length} fields ${x.info.join(', ')}`)
    ctx.check('XMP metadata cleared (metadata)', !x.xmp, `${i.xmp} -> ${x.xmp}`)
    ctx.metric(`in: ${i.scripts} scripts, ${i.files} files, ${i.fields} fields, ${nonLink(i.annots)} annots, ${i.annots.Link ?? 0} links, ${i.info.length} info, xmp ${i.xmp}`)
    ctx.check('text kept', words(allText(p)) >= words(allText({ pdfjs: f.pdfjs })) * 0.95, `${words(allText(p))} words, input ${words(allText({ pdfjs: f.pdfjs }))}`)
    ctx.check('not larger than the input', bytes.length <= f.size * 1.02, `${bytes.length} vs ${f.size}`, { soft: true })
  }
  templateRows('tpl-share', TEXT_FILES, { quick: true, check: shareChecks })
  // the plan's annotations file: comments and links to tell apart
  templateRows('tpl-share', ['quirks/pdfjs-tracemonkey_with_annotations.pdf'], { check: shareChecks })
  // a paper with 113 links (internal and web): they must all survive
  templateRows('tpl-share', ['reports/arxiv-1706.03762-attention.pdf'], {
    async check(ctx, a) {
      await shareChecks(ctx, a)
      const n = facts(a.bytes).links.length
      ctx.check('the paper still has its links', n >= 100, `${n} links`)
    },
  })

  // ----- Small and locked: compress, protect -----
  templateRows('tpl-mail', TEXT_FILES, {
    overrides: { 1: { password: PASSWORD, repeat: PASSWORD } },
    password: PASSWORD,
    quick: true,
    async check(ctx, { f, p, out, bytes }) {
      ctx.check('output marked locked for the workspace', out.locked && out.pageCount === f.pdfjs.pages, JSON.stringify(out))
      const x = facts(bytes, PASSWORD)
      ctx.check('needs a password in MuPDF, the password opens it', x.needsPassword && x.authOk === true, `${x.encryption}`)
      ctx.check('AES-256', /AES/.test(x.encryption) && /256/.test(x.encryption), x.encryption)
      const bare = await probe(bytes)
      ctx.check('pdf.js refuses it without the password', !bare.pdfjs.ok, bare.pdfjs.error ?? 'opened')
      ctx.check('text readable with the password', words(allText(p)) >= words(allText({ pdfjs: f.pdfjs })) * 0.95, `${words(allText(p))} words`)
    },
  })

  // ----- Scan to searchable: auto rotate, OCR, compress -----
  templateRows('tpl-scan', SCAN_FILES, {
    timeout: 15 * MIN,
    async check(ctx, { rel, f, p, run }) {
      const log = run.report[0].log
      const by = (name) => log.find((l) => l.tool === name)
      const ran = (l) => l?.status === 'done' || l?.status === 'nochange'
      ctx.check('auto rotate ran', ran(by('Auto rotate')), `${by('Auto rotate')?.status}: ${by('Auto rotate')?.note ?? ''}`)
      const ocr = by('OCR')
      ctx.check('OCR read the pages, or every page already had text', ocr?.status === 'done' || (ocr?.status === 'skipped' && /text layer/.test(ocr.note)), `${ocr?.status}: ${ocr?.note}`)
      ctx.check('compress ran', ran(by('Compress')), `${by('Compress')?.status}: ${by('Compress')?.note ?? ''}`)
      if (!/fax/.test(rel)) ctx.check('OCR read this scan (no text layer to skip)', ocr?.status === 'done', `${ocr?.status}: ${ocr?.note}`)
      const before = words(allText({ pdfjs: f.pdfjs }))
      const after = words(allText(p))
      ctx.check('searchable text kept or added', after >= before, `${after} words, input ${before}`)
      if (ocr?.status === 'done') ctx.check('OCR added words', after > before, `+${after - before}`, { soft: true })
    },
  })

  // ----- Numbered draft: page numbers, watermark -----
  templateRows('tpl-draft', TEXT_FILES, {
    quick: true,
    async check(ctx, { f, p }) {
      const n = f.pdfjs.pages
      const texts = p.pdfjs.texts ?? []
      ctx.check('page 1 says "Page 1 of N"', (texts[0] ?? '').includes(`Page 1 of ${n}`), (texts[0] ?? '').slice(-60))
      ctx.check('last page numbered', (texts[Math.min(n, texts.length) - 1] ?? '').includes(`Page ${Math.min(n, texts.length)} of ${n}`))
      ctx.check('DRAFT mark on every page read', texts.length > 0 && texts.every((t) => t.includes('DRAFT')), `${texts.filter((t) => t.includes('DRAFT')).length} of ${texts.length}`)
    },
  })

  // ----- Long-term copy: repair, fast web view -----
  templateRows('tpl-archive', TEXT_FILES, {
    async check(ctx, { f, p, bytes }) {
      const { problems } = checkLinearized(bytes)
      ctx.check('linearized (dict, xref sections, hint tables)', problems.length === 0, problems.slice(0, 3).join('; '))
      ctx.check('text kept', words(allText(p)) >= words(allText({ pdfjs: f.pdfjs })) * 0.98, `${words(allText(p))} words`)
    },
  })

  // ----- batch: 3 files in one run -----
  add({
    id: 's3-batch-draft-3',
    tool: 'automate',
    op: 'automate:run',
    files: TEXT_FILES,
    params: { template: 'tpl-draft', batch: true },
    timeout: 4 * MIN,
    quick: true,
    async validate(ctx) {
      const run = ctx.meta?.runs?.[0]
      ctx.check('batch ran', !!run && !run.error, run?.error ?? '')
      if (!run || run.error) return
      ctx.check('3 outputs, one per file', run.outputs.length === 3 && run.outputs.map((o) => o.index).join() === '0,1,2', JSON.stringify(run.outputs.map((o) => o.index)))
      ctx.check('progress walks every file and step', run.labels.includes('File 3 of 3, step 2 of 2: Watermark') && run.labels.includes('File 1 of 3, step 1 of 2: Page numbers'), run.labels.join(' | ').slice(0, 200))
      for (const [i, rel] of TEXT_FILES.entries()) {
        const f = await inputFacts(rel)
        const p = await checkPdf(ctx, `out-${i}.pdf`, { pages: f.pdfjs.pages, label: rel.split('/').pop() })
        if (p?.pdfjs.ok) ctx.check(`${rel.split('/').pop()}: numbered and marked`, (p.pdfjs.texts[0] ?? '').includes(`Page 1 of ${f.pdfjs.pages}`) && (p.pdfjs.texts[0] ?? '').includes('DRAFT'))
      }
      ctx.metric(`batch run ${run.runMs} ms for 3 files`)
    },
  })

  // ----- batch with a failing step: the dynamic XFA form stops at Flatten -----
  const MIXED = ['reports/pdfjs-tracemonkey.pdf', 'forms/xfa-imm1344e-filled.pdf', 'invoices/aws-invoice.pdf']
  add({
    id: 's3-batch-share-one-fails',
    tool: 'automate',
    op: 'automate:run',
    files: MIXED,
    params: { template: 'tpl-share', batch: true },
    timeout: 4 * MIN,
    quick: true,
    async validate(ctx) {
      const run = ctx.meta?.runs?.[0]
      ctx.check('batch ran', !!run && !run.error, run?.error ?? '')
      if (!run || run.error) return
      ctx.check('the 2 other files came through', run.outputs.map((o) => o.index).join() === '0,2', JSON.stringify(run.outputs.map((o) => o.index)))
      const bad = run.report[1]
      ctx.check('the form stopped at step 2, Flatten', bad?.status === 'failed' && bad.failed.step === 2 && bad.failed.tool === 'Flatten', JSON.stringify(bad?.failed))
      ctx.check('the reason is named', /XFA/i.test(bad?.failed?.message ?? ''), bad?.failed?.message)
      ctx.check('later steps did not run on it', bad?.log.length === 2, bad?.log.map((l) => l.tool).join(', '))
      for (const i of [0, 2]) {
        const f = await inputFacts(MIXED[i])
        const p = await checkPdf(ctx, `out-${i}.pdf`, { pages: f.pdfjs.pages, label: MIXED[i].split('/').pop() })
        if (p?.pdfjs.ok) {
          const x = facts(ctx.out(`out-${i}.pdf`))
          ctx.check(`${MIXED[i].split('/').pop()}: cleaned`, x.info.length === 0 && x.scripts === 0 && !Object.keys(x.annots).some((t) => t !== 'Link'), JSON.stringify({ info: x.info, scripts: x.scripts, annots: x.annots }))
        }
      }
      ctx.metric(`batch run ${run.runMs} ms; failed: ${bad?.failed?.message?.slice(0, 80)}`)
    },
  })

  // ----- cancel mid-run -----
  add({
    id: 's3-cancel-scan',
    tool: 'automate',
    op: 'automate:cancel',
    files: ['scanned/lincoln-ellsworth-letter-1861.pdf'],
    params: { template: 'tpl-scan', afterMs: 4000 },
    timeout: 5 * MIN,
    async validate(ctx) {
      ctx.check('run ended as cancelled', ctx.meta?.cancelled === true, ctx.meta?.error ?? `outputs ${ctx.meta?.outputs}`)
      ctx.check('stopped soon after Cancel', ctx.meta?.msAfter != null && ctx.meta.msAfter < 5000, `${ctx.meta?.msAfter} ms after Cancel`)
    },
  })
  // cancel inside OCR, 3 s after its first progress
  add({
    id: 's3-cancel-in-ocr',
    tool: 'automate',
    op: 'automate:cancel',
    files: ['scanned/lincoln-ellsworth-letter-1861.pdf'],
    params: { template: 'tpl-scan', whenLabel: 'step 2 of 3: OCR', afterMs: 3000 },
    timeout: 5 * MIN,
    async validate(ctx) {
      ctx.check('OCR step had started', (ctx.meta?.labels ?? []).some((l) => l.includes('step 2 of 3: OCR')), (ctx.meta?.labels ?? []).join(' | '))
      ctx.check('run ended as cancelled', ctx.meta?.cancelled === true, ctx.meta?.error ?? `outputs ${ctx.meta?.outputs}`)
      ctx.check('stopped soon after Cancel', ctx.meta?.msAfter != null && ctx.meta.msAfter < 5000, `${ctx.meta?.msAfter} ms after Cancel`)
      ctx.metric(`stopped ${ctx.meta?.msAfter} ms after Cancel inside OCR`)
    },
  })
}
