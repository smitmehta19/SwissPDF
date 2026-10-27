// G2 (optimize + security) corpus cases: OCR placement, languages, skip and
// cancel; protect permissions; unlock speed; repair keeping structure;
// compare with removed pages. Ops live in page-harness-g2.js. cases.mjs calls
// registerG2 with its own helpers.
import { openMupdf, outlineCount, formFacts, wordCoverage, textOf } from './validate.mjs'
import { placement } from './ocr-geometry.mjs'

export function registerG2({ add, checkPdf, inputFacts, readRel, MIN }) {
  const allText = (p) => (p?.pdfjs?.texts ?? []).join('\n')

  // ----- OCR -----
  add({
    id: 'g2-ocr-geometry',
    tool: 'ocr',
    op: 'ocrGeometry',
    files: ['reports/pdfjs-tracemonkey.pdf'],
    params: { skewDeg: 2.5 },
    quick: true,
    timeout: 10 * MIN,
    async validate(ctx) {
      const src = readRel('reports/pdfjs-tracemonkey.pdf')
      const geo = { W: ctx.meta.W, H: ctx.meta.H, skewDeg: ctx.meta.skewDeg }
      const parts = []
      for (const v of ['upright', 'turned', 'rot90crop', 'skew']) {
        const out = ctx.out(`ocr-${v}.pdf`)
        if (!out) {
          ctx.check(`${v}: output written`, false)
          continue
        }
        const r = await placement(src, out, v, geo)
        ctx.check(`${v}: words recognised`, r.found >= r.checked * 0.6, `${r.found} of ${r.checked} probe words`)
        ctx.check(`${v}: words placed on the scan`, r.found > 0 && r.within >= r.found * 0.85, `${r.within} of ${r.found} within 8 pt, median ${r.median?.toFixed(1)} pt`, { audit: 11 })
        parts.push(`${v} ${r.within}/${r.found} median ${r.median?.toFixed(1)}pt`)
      }
      ctx.check('sideways scan turned by OSD', (ctx.meta.variants.turned?.rotatedPages ?? []).includes(1), JSON.stringify(ctx.meta.variants.turned))
      ctx.check('no network fetches outside the page origin', ctx.external.length === 0, ctx.external.slice(0, 3).join(', '), { audit: 10 })
      ctx.metric(parts.join('; '))
    },
  })

  const scanLang = (id, rel, langs, min, extra = {}) =>
    add({
      id,
      tool: 'ocr',
      op: 'ocrScan',
      files: [rel],
      params: { langs },
      timeout: 10 * MIN,
      ...extra,
      async validate(ctx) {
        const src = await textOf(readRel(rel), { maxPages: 1 })
        const p = await checkPdf(ctx, 'ocr.pdf', { pages: 1 })
        if (!p?.pdfjs.ok) return
        const text = allText(p).normalize('NFC')
        const cov = wordCoverage(src[0] ?? '', text)
        if (extra.phrases) {
          // the source's own text layer is not usable here (no ToUnicode, or mixed): look for known UDHR words
          const missing = extra.phrases.filter((w) => !text.includes(w))
          ctx.check(`${langs.join('+')} text recognised`, missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${extra.phrases.length} key words found`, { audit: 10 })
        } else {
          ctx.check(`${langs.join('+')} text recognised`, (cov.ratio ?? 0) >= min, `coverage ${cov.ratio?.toFixed(2)} (want ${min})`, { audit: 10 })
        }
        ctx.check('no network fetches outside the page origin', ctx.external.length === 0, ctx.external.slice(0, 3).join(', '), { audit: 10 })
        ctx.metric(`${ctx.meta.totalWords} words, ${ctx.meta.skippedWords} without a font, coverage ${cov.ratio?.toFixed(2)}, "${(ctx.meta.sample ?? '').slice(0, 40).replace(/\s+/g, ' ')}"`)
      },
    })
  scanLang('g2-ocr-scan-chinese', 'intl/udhr-chinese-simplified.pdf', ['chi_sim'], 0.6, { quick: true })
  scanLang('g2-ocr-scan-japanese', 'intl/udhr-japanese.pdf', ['jpn'], 0.5)
  scanLang('g2-ocr-scan-korean', 'intl/udhr-korean.pdf', ['kor'], 0.4)
  scanLang('g2-ocr-scan-arabic', 'intl/udhr-arabic.pdf', ['ara', 'eng'], 0, { phrases: ['الإعلان', 'العالمي', 'لحقوق', 'الإنسان', 'Universal'] })
  scanLang('g2-ocr-scan-hindi', 'intl/udhr-hindi.pdf', ['hin'], 0, { phrases: ['मानव', 'घोषणा', 'नेशन्स'] })
  scanLang('g2-ocr-scan-mixed-eng-deu', 'reports/pdfjs-tracemonkey.pdf', ['eng', 'deu'], 0.8)

  // the 3 scans with the tool's options (turn, deskew; skip or force pages
  // that already have a text layer: the fax and most Lincoln pages have an
  // old OCR layer)
  const scanCase = (id, rel, langs, minWords, extra = {}) =>
    add({
      id,
      tool: 'ocr',
      op: 'ocr2',
      files: [rel],
      params: { langs, textPages: extra.textPages ?? 'skip', autoRotate: true, deskew: true },
      timeout: 15 * MIN,
      ...extra,
      async validate(ctx) {
        const f = await inputFacts(rel)
        const p = await checkPdf(ctx, 'ocr.pdf', { pages: f.pdfjs.pages })
        if (!p?.pdfjs.ok) return
        const words = (s) => (s.match(/[\p{L}\p{N}]{3,}/gu) ?? []).length
        // force replaces an old layer: count the new layer's words (meta), not the growth
        const added = extra.textPages === 'force' ? ctx.meta.totalWords : words(allText(p)) - words(allText({ pdfjs: f.pdfjs }))
        ctx.check(`searchable text added (${minWords}+ words)`, added >= minWords, `+${added} words`, extra.soft ? { soft: true } : {})
        const read = ctx.meta.ocrPages ?? []
        const skipped = ctx.meta.skippedPages ?? []
        if (extra.textPages === 'force') {
          ctx.check('every page read', read.length === f.pdfjs.pages, `read ${read.length} of ${f.pdfjs.pages}`)
          // the old OCR layer is replaced, not doubled
          const hits = (t) => (t.match(/Schmidt/g) ?? []).length
          const before = allText({ pdfjs: f.pdfjs })
          ctx.check('old text layer replaced, not doubled', hits(allText(p)) <= hits(before) + 2 && allText(p).length < before.length * 1.5, `"Schmidt" ${hits(before)} -> ${hits(allText(p))}, ${before.length} -> ${allText(p).length} chars, replaced on ${ctx.meta.replacedPages?.length ?? 0} pages`)
        }
        else ctx.check('pages without text read, the rest skipped', read.length > 0 && read.length + skipped.length === f.pdfjs.pages, `read ${read.length}, skipped ${skipped.length} of ${f.pdfjs.pages}`, { audit: 11 })
        ctx.check('no network fetches outside the page origin', ctx.external.length === 0, ctx.external.slice(0, 3).join(', '), { audit: 10 })
        ctx.metric(`${ctx.meta.totalWords} words on ${read.length} pages (${skipped.length} skipped), turned ${ctx.meta.rotatedPages?.length ?? 0}, "${(ctx.meta.sample ?? '').slice(0, 40).replace(/\s+/g, ' ')}"`)
      },
    })
  scanCase('g2-ocr-fax-force', 'scanned/fax-jean-schmidt-doe.pdf', ['eng'], 100, { quick: true, textPages: 'force' })
  // the pages left to read are handwriting and blank backs: little to find
  scanCase('g2-ocr-lincoln-36p', 'scanned/lincoln-ellsworth-letter-1861.pdf', ['eng'], 5)
  scanCase('g2-ocr-konoye-jpn', 'derived/sub-ndl-konoye-p1.pdf', ['jpn'], 1, { soft: true })

  add({
    id: 'g2-ocr-ndl-japanese-handwritten',
    tool: 'ocr',
    op: 'ocr2',
    files: ['derived/sub-ndl-konoye-p1.pdf'],
    params: { langs: ['jpn', 'eng'] },
    timeout: 10 * MIN,
    async validate(ctx) {
      const p = await checkPdf(ctx, 'ocr.pdf', { pages: 1 })
      if (!p?.pdfjs.ok) return
      const cjk = (allText(p).match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length
      ctx.check('Japanese characters recognised', cjk >= 5, `${cjk} CJK characters`, { soft: true })
      ctx.metric(`${ctx.meta.totalWords} words, ${cjk} CJK characters`)
    },
  })

  add({
    id: 'g2-ocr-skip-text-pages',
    tool: 'ocr',
    op: 'ocr2',
    files: ['derived/sub-darwin-p10-11.pdf'],
    params: { textPages: 'skip' },
    quick: true,
    timeout: 10 * MIN,
    async validate(ctx) {
      const f = await inputFacts('derived/sub-darwin-p10-11.pdf')
      const p = await checkPdf(ctx, 'ocr.pdf', { pages: f.pdfjs.pages })
      ctx.check('page with a text layer skipped', (ctx.meta.skippedPages ?? []).includes(2), `skipped ${ctx.meta.skippedPages}`, { audit: 11 })
      ctx.check('page without text read', (ctx.meta.ocrPages ?? []).includes(1), `read ${ctx.meta.ocrPages}`)
      if (p?.pdfjs.ok) {
        const before = (f.pdfjs.texts?.[1] ?? '').replace(/\s+/g, ' ').trim()
        const after = (p.pdfjs.texts?.[1] ?? '').replace(/\s+/g, ' ').trim()
        ctx.check('text layer not duplicated', before === after, `${before.length} chars before, ${after.length} after`, { audit: 11 })
      }
      ctx.metric(`read ${ctx.meta.ocrPages}, skipped ${ctx.meta.skippedPages}`)
    },
  })

  add({
    id: 'g2-ocr-force-text-pages',
    tool: 'ocr',
    op: 'ocr2',
    files: ['invoices/oyo.pdf'],
    params: { textPages: 'force' },
    timeout: 10 * MIN,
    async validate(ctx) {
      const p = await checkPdf(ctx, 'ocr.pdf', { pages: 1 })
      ctx.check('force reads the page anyway', (ctx.meta.ocrPages ?? []).includes(1) && ctx.meta.totalWords > 20, `${ctx.meta.totalWords} words`)
      if (p) ctx.metric(`${ctx.meta.totalWords} words`)
    },
  })

  add({
    id: 'g2-ocr-cancel',
    tool: 'ocr',
    op: 'ocrCancel',
    files: ['scanned/fax-jean-schmidt-doe.pdf'],
    params: { after: 3000 },
    quick: true,
    timeout: 10 * MIN,
    async validate(ctx) {
      ctx.check('cancel stops the run', ctx.meta.cancelled === true, JSON.stringify(ctx.meta))
      ctx.check('stops within 2 s of cancel', ctx.meta.stopMs < 3000 + 2000, `${ctx.meta.stopMs} ms after start (cancel at 3000)`)
      ctx.check('a later run still works', ctx.meta.againWords > 20, `${ctx.meta.againWords} words`)
      ctx.metric(`stopped at ${ctx.meta.stopMs} ms during "${ctx.meta.stage}", next run ${ctx.meta.againWords} words`)
    },
  })

  // ----- auto rotate -----
  // Each scan as is (nothing may turn) and fed in 90 / 180 / 270 degrees off
  // (every page must come back to its own rotation). A wrong turn fails; a
  // page OSD cannot read (too little text) is only a warning.
  const SCANS = {
    fax: 'scanned/fax-jean-schmidt-doe.pdf',
    lincoln: 'scanned/lincoln-ellsworth-letter-1861.pdf',
    konoye: 'derived/sub-ndl-konoye-p1.pdf',
  }
  for (const [tag, rel] of Object.entries(SCANS)) {
    for (const turn of [0, 90, 180, 270]) {
      add({
        id: `g2-autorotate-${tag}-${turn}`,
        tool: 'autorotate',
        op: 'autoRotate',
        files: [rel],
        params: { turn },
        quick: turn === 90,
        timeout: 10 * MIN,
        async validate(ctx) {
          const m = ctx.meta
          const p = await checkPdf(ctx, 'rotated.pdf', { pages: m.before.length })
          if (!p) return
          const back = m.after.map((a, i) => a === m.before[i] % 360)
          const wrong = m.after.map((a, i) => i).filter((i) => !back[i] && m.after[i] !== (m.before[i] + turn) % 360)
          const missed = m.after.map((a, i) => i).filter((i) => !back[i] && m.after[i] === (m.before[i] + turn) % 360)
          ctx.check('no page turned the wrong way', wrong.length === 0, wrong.map((i) => `p${i + 1} ${m.after[i]}`).join(', '))
          if (turn === 0) ctx.check('upright scan left as it is', m.turned.length === 0, `turned ${m.turned.join(',')}`)
          else ctx.check('every page back upright', missed.length === 0, missed.length ? `not detected: ${missed.map((i) => `p${i + 1}`).join(', ')}` : '', { soft: tag !== 'fax' })
          const conf = m.pages.map((x) => `${x.degrees}/${x.confidence.toFixed(1)}`).join(' ')
          ctx.metric(`${m.ms} ms, turned ${m.turned.length} of ${m.before.length}, osd ${conf}`)
        },
      })
    }
  }

  // ----- protect -----
  const PERMS = ['print', 'copy', 'edit', 'annotate', 'form', 'assemble', 'print-hq']
  const perms = (doc) => Object.fromEntries(PERMS.map((k) => [k, doc.hasPermission(k)]))
  add({
    id: 'g2-protect-permissions-only',
    tool: 'protect',
    op: 'protect2',
    files: ['reports/pdfjs-tracemonkey.pdf'],
    params: { user: '', owner: 'Perm-9x', deny: ['print', 'copy'] },
    quick: true,
    async validate(ctx) {
      const out = ctx.out('protected.pdf')
      const m = openMupdf(out)
      ctx.check('opens without a password', !m.needsPassword)
      const p = perms(m.doc)
      ctx.check('printing and copying blocked', !p.print && !p.copy, JSON.stringify(p), { audit: 22 })
      ctx.check('other permissions kept', p.form && p.annotate && p.assemble && p.edit, JSON.stringify(p), { audit: 22 })
      ctx.check('owner password lifts them', (openMupdf(out).doc.authenticatePassword('Perm-9x') & 4) === 4)
      ctx.check('AES-256', /256-bit AES/.test(m.doc.getMetaData('encryption') ?? ''), m.doc.getMetaData('encryption'))
      await checkPdf(ctx, 'protected.pdf', { pages: (await inputFacts('reports/pdfjs-tracemonkey.pdf')).pdfjs.pages })
      ctx.metric(`${m.doc.getMetaData('encryption')}, ${JSON.stringify(p)}`)
    },
  })
  add({
    id: 'g2-protect-open-and-owner',
    tool: 'protect',
    op: 'protect2',
    files: ['forms/irs-fw9.pdf'],
    params: { user: 'Open-1a', owner: 'Perm=2b', deny: ['edit', 'assemble'] },
    async validate(ctx) {
      const out = ctx.out('protected.pdf')
      const u = openMupdf(out, 'Open-1a')
      ctx.check('needs the open password', u.needsPassword && u.authOk === true)
      const pu = perms(u.doc)
      ctx.check('open password gets the restricted rights', !pu.edit && !pu.assemble && pu.print && pu.form, JSON.stringify(pu), { audit: 22 })
      const o = openMupdf(out)
      ctx.check('permissions password (with "=") opens with full rights', (o.doc.authenticatePassword('Perm=2b') & 4) === 4)
      ctx.check('wrong password refused', openMupdf(out, 'nope').authOk === false)
      ctx.metric(JSON.stringify(pu))
    },
  })

  // key lengths 128 (AES) and 40 (RC4), open + permissions password
  const keyCase = (id, rel, keyLength, cipher, deny) =>
    add({
      id,
      tool: 'protect',
      op: 'protect2',
      files: [rel],
      params: { user: 'Open-1a', owner: 'Perm-2b', deny, keyLength },
      async validate(ctx) {
        const out = ctx.out('protected.pdf')
        const u = openMupdf(out, 'Open-1a')
        const enc = u.doc.getMetaData('encryption') ?? ''
        ctx.check(`${keyLength}-bit ${cipher}`, new RegExp(`${keyLength}-bit.*${cipher}|${cipher}.*${keyLength}`, 'i').test(enc), enc)
        ctx.check('needs the open password', u.needsPassword && u.authOk === true)
        const pu = perms(u.doc)
        ctx.check('restrictions applied', deny.every((k) => !pu[k]), JSON.stringify(pu), { audit: 22 })
        ctx.check('permissions password opens with full rights', (openMupdf(out).doc.authenticatePassword('Perm-2b') & 4) === 4)
        await checkPdf(ctx, 'protected.pdf', { pages: (await inputFacts(rel)).pdfjs.pages, password: 'Open-1a' })
        ctx.metric(`${enc}, ${JSON.stringify(pu)}`)
      },
    })
  keyCase('g2-protect-aes128-tracemonkey', 'reports/pdfjs-tracemonkey.pdf', 128, 'AES', ['print', 'copy', 'form'])
  keyCase('g2-protect-rc4-40-invoice', 'invoices/aws-invoice.pdf', 40, 'RC4', ['print', 'edit'])
  keyCase('g2-protect-aes256-fw9', 'forms/irs-fw9.pdf', 256, 'AES', ['print-hq', 'form', 'assemble'])

  // non-ASCII passwords: AES-256 takes any text that SASLprep leaves alone
  // and must open in pdf.js with exactly what was typed; the older ciphers
  // and SASLprep-sensitive text are refused before anything is written
  const U = (...codes) => String.fromCodePoint(...codes)
  add({
    id: 'g2-protect-aes256-unicode-pdfjs',
    tool: 'protect',
    op: 'protect2',
    files: ['invoices/aws-invoice.pdf'],
    params: { user: `p${U(0xe4)}ss-${U(0x65e5, 0x672c)}-${U(0x1f512)}`, owner: null, keyLength: 256 },
    async validate(ctx) {
      const pw = `p${U(0xe4)}ss-${U(0x65e5, 0x672c)}-${U(0x1f512)}`
      const p = await checkPdf(ctx, 'protected.pdf', { pages: 1, password: pw })
      ctx.check('pdf.js opens it with the typed password', !!p?.pdfjs.ok, p?.pdfjs.error ?? '')
      ctx.check('MuPDF opens it with the typed password', openMupdf(ctx.out('protected.pdf'), pw).authOk === true)
      ctx.check('a shorter password does not open it', openMupdf(ctx.out('protected.pdf'), `p${U(0xe4)}ss--`).authOk === false)
    },
  })
  const refused = (id, keyLength, user, what) =>
    add({
      id,
      tool: 'protect',
      op: 'protect2',
      files: ['reports/pdfjs-TAMReview.pdf'],
      params: { user, owner: null, keyLength },
      allowError: true,
      async validate(ctx) {
        ctx.check(`${what} refused with a clear message`, !!ctx.error && /(only takes|different ways)/.test(ctx.error), ctx.error ?? 'no error, file written')
      },
    })
  refused('g2-protect-aes128-emoji-refused', 128, `key${U(0x1f512)}`, 'emoji in AES 128')
  refused('g2-protect-rc4-nbsp-refused', 40, `a${U(0xa0)}b-123`, 'non-breaking space in RC4 40')
  refused('g2-protect-aes128-cjk-refused', 128, U(0x5bc6, 0x7801, 0x6d4b, 0x8bd5), 'CJK in AES 128')
  refused('g2-protect-aes256-softhyphen-refused', 256, `pass${U(0xad)}word`, 'soft hyphen in AES 256')
  refused('g2-protect-aes256-fullwidth-refused', 256, `${U(0xff21)}bc-123`, 'full-width letter in AES 256')

  // ----- unlock -----
  add({
    id: 'g2-unlock-owner-only-fast',
    tool: 'unlock',
    op: 'unlock2',
    files: ['derived/a-owner-only-us-budget.pdf'],
    params: { password: '' },
    quick: true,
    timeout: 5 * MIN,
    async validate(ctx) {
      const out = ctx.out('unlocked.pdf')
      const m = openMupdf(out)
      ctx.check('output not encrypted', !m.needsPassword && (m.doc.getMetaData('encryption') ?? 'None') === 'None', m.doc.getMetaData('encryption'))
      const p = await checkPdf(ctx, 'unlocked.pdf', { pages: 184 })
      if (p) ctx.check('outlines kept', (await outlineCount(out)) >= 20, `${await outlineCount(out)} outlines`)
      ctx.check('owner-only unlock is quick', ctx.meta.ms < 15000, `${ctx.meta.ms} ms`, { soft: true })
      ctx.metric(`${ctx.meta.ms} ms, removed: ${(ctx.meta.removed ?? []).join(', ')}`)
    },
  })

  // ----- repair -----
  add({
    id: 'g2-repair-keeps-structure',
    tool: 'repair',
    op: 'repair2',
    files: ['reports/us-budget-2024.pdf'],
    timeout: 5 * MIN,
    async validate(ctx) {
      const p = await checkPdf(ctx, 'repaired.pdf', { pages: 184 })
      if (!p) return
      const inOl = await outlineCount(readRel('reports/us-budget-2024.pdf'))
      const outOl = await outlineCount(ctx.out('repaired.pdf'))
      ctx.check('plain rewrite used', ctx.meta.method === 'rewrite', ctx.meta.method, { audit: 26 })
      ctx.check('bookmarks kept', outOl >= inOl, `${outOl} of ${inOl}`, { audit: 26 })
      ctx.metric(`${ctx.meta.method}, ${outOl} of ${inOl} bookmarks`)
    },
  })
  add({
    id: 'g2-repair-keeps-fields',
    tool: 'repair',
    op: 'repair2',
    files: ['forms/irs-fw9.pdf'],
    quick: true,
    async validate(ctx) {
      const p = await checkPdf(ctx, 'repaired.pdf', { pages: 6 })
      if (!p) return
      const inF = (await formFacts(readRel('forms/irs-fw9.pdf'))).count
      const outF = (await formFacts(ctx.out('repaired.pdf'))).count
      ctx.check('form fields kept', outF >= inF, `${outF} of ${inF}`, { audit: 26 })
      ctx.metric(`${ctx.meta.method}, ${outF} of ${inF} fields`)
    },
  })

  add({
    id: 'g2-repair-truncated-bookmarks',
    tool: 'repair',
    op: 'repairTruncated',
    files: ['reports/us-budget-2024.pdf'],
    params: { cut: 2000 },
    timeout: 5 * MIN,
    async validate(ctx) {
      const m = ctx.meta
      const out = ctx.out('repaired.pdf')
      const pages = openMupdf(out).doc.countPages()
      const inOl = await outlineCount(readRel('reports/us-budget-2024.pdf'))
      const outOl = await outlineCount(out)
      ctx.check('bookmarks kept after the rebuild', outOl >= inOl, `${outOl} of ${inOl} (${m.method})`, { audit: 26 })
      ctx.check('every page MuPDF reads is kept or reported', pages + m.lost === m.pageCount, `${pages} kept + ${m.lost} lost of ${m.pageCount}`)
      const said = (m.intakeNotices ?? []).join('. ')
      ctx.check('intake does not hide a missing page', m.intakePages === m.pageCount || /could not be recovered/.test(said), `intake ${m.intakePages} of ${m.pageCount} pages: ${said}`)
      ctx.metric(`${m.method}, ${pages} pages, ${outOl}/${inOl} bookmarks, intake: ${said}`)
    },
  })

  // ----- compare -----
  const removedPage = (id, rel, page, extra = {}) =>
    add({
      id,
      tool: 'compare',
      op: 'compare2',
      files: [rel],
      params: { removePage: page },
      timeout: 10 * MIN,
      ...extra,
      async validate(ctx) {
        if (ctx.error) return ctx.check('compare runs', false, ctx.error)
        const m = ctx.meta
        ctx.check('only the removed page differs', m.changedPages.length === 1 && m.onlyInA.length === 1 && m.onlyInA[0] === page, `changed ${m.changedPages.join(',')}, only in original ${m.onlyInA}`, { audit: 27 })
        ctx.check('nothing added', m.added === 0, `+${m.added}`)
        ctx.metric(`${m.ms} ms, -${m.removed} words, changed pairs ${m.changedPages.slice(0, 6).join(',')}`)
      },
    })
  // two files, text and pixel overlay on every paired page
  const pairCase = (id, a, b, expect, extra = {}) =>
    add({
      id,
      tool: 'compare',
      op: 'compare2',
      files: [a, b],
      params: { overlay: true },
      timeout: 10 * MIN,
      ...extra,
      async validate(ctx) {
        if (ctx.error) return ctx.check('compare runs', false, ctx.error)
        const m = ctx.meta
        expect(ctx, m)
        const worst = Math.max(0, ...(m.overlay ?? []))
        ctx.metric(`${m.ms} ms, +${m.added} -${m.removed}, changed ${m.changedPages.slice(0, 6).join(',') || 'none'}, overlay max ${(worst * 100).toFixed(2)}%`)
      },
    })
  pairCase('g2-compare-inserted-overlay', 'derived/compare-tracemonkey-base.pdf', 'derived/compare-tracemonkey-inserted.pdf', (ctx, m) => {
    ctx.check('one inserted page, nothing else changed', m.onlyInB.length === 1 && m.changedPages.length === 1 && m.removed === 0, `only in changed ${m.onlyInB}, changed pairs ${m.changedPages.join(',')}, -${m.removed}`, { audit: 27 })
    ctx.check('paired pages look the same', (m.overlay ?? []).every((s) => s < 0.001), `overlay ${m.overlay?.join(' ')}`)
  }, { quick: true })
  pairCase('g2-compare-tamreview-self', 'reports/pdfjs-TAMReview.pdf', 'reports/pdfjs-TAMReview.pdf', (ctx, m) => {
    ctx.check('identical', m.identical === true, `+${m.added} -${m.removed}`)
    ctx.check('overlay shows no pixels', (m.overlay ?? []).every((s) => s === 0), `overlay ${m.overlay?.join(' ')}`)
  })
  pairCase('g2-compare-origin-shift', 'invoices/aws-invoice.pdf', 'derived/origin-shift-aws-invoice.pdf', (ctx, m) => {
    ctx.check('same text', m.identical === true, `+${m.added} -${m.removed}`)
    ctx.check('moved origin draws the same page', (m.overlay ?? []).every((s) => s < 0.002), `overlay ${m.overlay?.join(' ')}`)
  })
  removedPage('g2-compare-removed-page', 'reports/pdfjs-tracemonkey.pdf', 4, { quick: true })
  removedPage('g2-compare-dense-removed-page', 'reports/us-economic-report-president-2024.pdf', 10)
}

export default registerG2
