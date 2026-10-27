// Restricted (owner-only) inputs keep their restrictions on the results
// (decision 2026-10-27). Runs the app's own intake + prepareRestricted /
// keepRestrictions around real tool ops in Chromium, the way the shell calls
// them, and checks every result's /P against the original in Node:
//  - owner-only tracemonkey: intake -> compress -> watermark -> merge with a
//    plain PDF, each result restricted like the original;
//  - a restriction-only Protect result, then watermarked and merged;
//  - Unlock / Protect / Permissions and Automate chains with those steps
//    are left alone, as are non-PDF outputs and plain inputs.
// Usage: node scripts/corpus-test/restrict-keep.mjs
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as mupdf from 'mupdf'
import { startServer, ROOT } from './server.mjs'

const C = (r) => join(ROOT, 'test-corpus', r)
let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`)
}

// { encrypted, needsPassword, P, pages } of a PDF, read with MuPDF in Node
function secOf(bytes) {
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  try {
    const enc = doc.getTrailer().get('Encrypt')
    const has = enc && !enc.isNull()
    return {
      encrypted: has,
      needsPassword: doc.needsPassword(),
      P: has ? parseInt(enc.get('P').toString(), 10) | 0 : null,
      pages: doc.needsPassword() ? null : doc.countPages(),
      method: doc.getMetaData('encryption'),
    }
  } finally {
    doc.destroy()
  }
}
const MASK = 0xf3c
const sameFlags = (a, b) => (a & MASK) === (b & MASK)

const ORIG = readFileSync(C('derived/owner-only-tracemonkey.pdf'))
const PLAIN = readFileSync(C('reports/pdfjs-tracemonkey.pdf'))
const orig = secOf(ORIG)
check('input is owner-only with restrictions', orig.encrypted && !orig.needsPassword && (orig.P & MASK) !== MASK, `P=${orig.P} ${orig.method}`)

const dev = await startServer()
const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto(`${dev.url}/`, { waitUntil: 'load' })

const b64 = (b) => Buffer.from(b).toString('base64')
const res = await page.evaluate(
  async ({ orig, plain }) => {
    const unb = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
    const enb = (b) => {
      let s = ''
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
      return btoa(s)
    }
    const intake = await import('/src/lib/intake.js')
    const { mergePdfs } = await import('/src/lib/pdfOps.js')
    const { watermarkText } = await import('/src/lib/stampOps.js')
    const { cleanPdf } = await import('/src/lib/mupdfOps.js')
    const { protectPdf } = await import('/src/lib/cryptoOps.js')
    const out = {}
    const PDF = 'application/pdf'
    // one shell run: prepare inputs, run the op, keep restrictions on outputs
    const run = async (toolId, inputs, op, options = {}) => {
      const ready = await intake.prepareRestricted(toolId, inputs, options)
      const outputs = await op(ready)
      const n = await intake.keepRestrictions(toolId, outputs, ready, options)
      return { ready, outputs, n }
    }

    // user-added owner-only file: intake keeps the flags on the record
    const norm = await intake.normalizePdf(unb(orig))
    out.intake = { restrictions: norm.restrictions ?? null, notices: norm.notices }
    const rec = { id: 'a', name: 'a.pdf', type: PDF, bytes: norm.bytes, restrictions: norm.restrictions }

    const r1 = await run('compress', [rec], async ([f]) => [{ name: 'c.pdf', bytes: (await cleanPdf(f.bytes)).bytes, parentIds: [f.id], note: 'Smaller.' }])
    out.compress = { bytes: enb(r1.outputs[0].bytes), note: r1.outputs[0].note, n: r1.n }
    // the stored result (encrypted, no restrictions field) goes into the next tool
    const r2 = await run('watermark', [{ id: 'b', type: PDF, bytes: r1.outputs[0].bytes }], async ([f]) => [
      { name: 'w.pdf', bytes: await watermarkText(f.bytes, { text: 'DRAFT' }), parentIds: [f.id] },
    ])
    out.prepared = { restrictions: r2.ready[0].restrictions ?? null, decrypted: r2.ready[0].bytes !== r1.outputs[0].bytes }
    out.watermark = { bytes: enb(r2.outputs[0].bytes), note: r2.outputs[0].note }
    const r3 = await run('merge', [{ id: 'w', type: PDF, bytes: r2.outputs[0].bytes }, { id: 'p', type: PDF, bytes: unb(plain) }], async (fs) => [
      { name: 'm.pdf', bytes: await mergePdfs(fs.map((f) => f.bytes)), parentIds: fs.map((f) => f.id) },
    ])
    out.merge = { bytes: enb(r3.outputs[0].bytes), note: r3.outputs[0].note }

    // restriction-only Protect result, later watermarked and merged
    const prot = await protectPdf(unb(plain), '', 'Owner-pw-1', { deny: ['print', 'copy'] })
    const r4 = await run('watermark', [{ id: 'q', type: PDF, bytes: prot }], async ([f]) => [{ name: 'w2.pdf', bytes: await watermarkText(f.bytes, { text: 'X' }), parentIds: [f.id] }])
    out.protWatermark = { bytes: enb(r4.outputs[0].bytes), note: r4.outputs[0].note }
    const r5 = await run('merge', [{ id: 'q', type: PDF, bytes: prot }, { id: 'p', type: PDF, bytes: unb(plain) }], async (fs) => [
      { name: 'm2.pdf', bytes: await mergePdfs(fs.map((f) => f.bytes)), parentIds: fs.map((f) => f.id) },
    ])
    out.protMerge = { bytes: enb(r5.outputs[0].bytes) }

    // left alone
    const encIn = { id: 'e', type: PDF, bytes: r1.outputs[0].bytes }
    const skip = {}
    for (const t of ['unlock', 'protect', 'permissions']) {
      const ready = await intake.prepareRestricted(t, [encIn])
      const outs = [{ bytes: norm.bytes, parentIds: ['a'] }]
      skip[t] = { same: ready[0] === encIn, n: await intake.keepRestrictions(t, outs, [rec]), untouched: outs[0].bytes === norm.bytes }
    }
    // Automate decides on the chain it runs, not on every saved chain
    const saved = [
      { id: 'x', steps: [{ tool: 'compress' }, { tool: 'unlock' }] },
      { id: 'y', steps: [{ tool: 'permissions' }] },
      { id: 'z', steps: [{ tool: 'compress' }] },
    ]
    const keepN = (o) => intake.keepRestrictions('automate', [{ bytes: norm.bytes, parentIds: ['a'] }], [rec], o)
    skip.automateUnlock = { n: await keepN({ pick: 'x', mine: saved }) }
    skip.automatePlain = { n: await keepN({ pick: 'z', mine: saved }) }
    skip.automateTemplate = { n: await keepN({ pick: 'tpl-share', mine: saved }) }
    skip.automateLockTemplate = { n: await keepN({ pick: 'tpl-mail', mine: saved }) }
    // its steps always get the decrypted file, even when the chain lifts restrictions
    const autoReady = await intake.prepareRestricted('automate', [encIn], { pick: 'x', mine: saved })
    skip.automateDecrypts = { decrypted: autoReady[0].bytes !== encIn.bytes && !!autoReady[0].restrictions }
    const nonPdf = [{ bytes: new Uint8Array([1, 2, 3]), type: 'image/png', parentIds: ['a'] }]
    skip.nonPdf = { n: await intake.keepRestrictions('pdf2img', nonPdf, [rec]) }
    const plainIn = { id: 'p', type: PDF, bytes: unb(plain) }
    const pr = await intake.prepareRestricted('merge', [plainIn])
    skip.plain = { same: pr[0] === plainIn, n: await intake.keepRestrictions('merge', [{ bytes: plainIn.bytes, parentIds: ['p'] }], pr) }
    out.skip = skip
    return out
  },
  { orig: b64(ORIG), plain: b64(PLAIN) },
)

check('intake reads the original flags', res.intake.restrictions?.permissions === orig.P, `${JSON.stringify(res.intake.restrictions)} vs P=${orig.P}`)
const plainPages = secOf(PLAIN).pages
for (const [k, label, pages] of [
  ['compress', 'compress of the restricted file', orig.pages],
  ['watermark', 'watermark of that (encrypted) result', orig.pages],
  ['merge', 'merge of that with a plain PDF', orig.pages + plainPages],
]) {
  const s = secOf(Buffer.from(res[k].bytes, 'base64'))
  check(`${label}: opens freely, AES, same flags, ${pages} pages`, s.encrypted && !s.needsPassword && /AES/i.test(s.method ?? '') && sameFlags(s.P, orig.P) && s.pages === pages, `P=${s.P} ${s.method} ${s.pages} pages`)
}
check('result note says so', res.compress.note === 'Smaller. Kept the original restrictions.' && /Kept the original restrictions/.test(res.watermark.note ?? '') && /Kept the original restrictions/.test(res.merge.note ?? ''), res.compress.note)
check('stored encrypted result is decrypted for the next tool, with its flags', res.prepared.decrypted && sameFlags(res.prepared.restrictions?.permissions, orig.P), JSON.stringify(res.prepared))

for (const k of ['protWatermark', 'protMerge']) {
  const bytes = Buffer.from(res[k].bytes, 'base64')
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  const perms = { print: doc.hasPermission('print'), copy: doc.hasPermission('copy'), edit: doc.hasPermission('edit') }
  doc.destroy()
  check(`Protect restriction-only result, then ${k === 'protMerge' ? 'merged' : 'watermarked'}: print and copy still blocked`, !perms.print && !perms.copy && perms.edit, JSON.stringify(perms))
}
for (const t of ['unlock', 'protect', 'permissions']) check(`${t}: input and output left alone`, res.skip[t].same && res.skip[t].n === 0 && res.skip[t].untouched, JSON.stringify(res.skip[t]))
check('automate running a chain with an unlock step: restrictions not put back', res.skip.automateUnlock.n === 0)
check('automate running a plain saved chain (others lift restrictions): kept', res.skip.automatePlain.n === 1)
check('automate running a template while a saved chain has Permissions: kept', res.skip.automateTemplate.n === 1)
check('automate running the Protect template: not put back', res.skip.automateLockTemplate.n === 0)
check('automate always gets the decrypted file', res.skip.automateDecrypts.decrypted)
check('non-PDF output: left alone', res.skip.nonPdf.n === 0)
check('plain input: left alone', res.skip.plain.same && res.skip.plain.n === 0)

await browser.close()
await dev.server.close()
console.log(failed ? `${failed} FAILED` : 'ALL PASS')
process.exit(failed ? 1 : 0)
