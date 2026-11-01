// Edit existing text ops for the corpus runner (op names "edittext:<op>").
// Runs in the app page and calls the engine through the ops worker (the
// app's path), times each call, uploads outputs. Node checks them in
// cases-edittext.mjs.

const CHUNK = 8 * 1024 * 1024
async function save(caseId, name, bytes) {
  const url = `/__corpus/out/${encodeURIComponent(caseId)}/${encodeURIComponent(name)}`
  for (let at = 0, part = 0; at < bytes.length || part === 0; at += CHUNK, part++) {
    const res = await fetch(`${url}?part=${part}`, { method: 'POST', body: bytes.subarray(at, at + CHUNK) })
    if (!res.ok) throw new Error(`upload ${name}: ${res.status}`)
  }
  return { name, size: bytes.length }
}

async function call(op, ...args) {
  const { callOp } = await import('/src/app/jobs.js')
  const t0 = performance.now()
  const res = await callOp(op, args)
  return [res, Math.round(performance.now() - t0)]
}

// The browser model must agree with the one Node picked from.
async function modelFacts(src, s) {
  const [model, ms] = await call('editTextModel', src, s.params.pageNum)
  const run = model.runs.find((r) => r.id === s.params.runId)
  const word = s.params.wordIndex == null ? run?.text : run?.words[s.params.wordIndex]?.text
  return { modelMs: ms, runs: model.runs.length, scanned: model.page.scanned, signed: model.signed, why: run?.why ?? null, word: word ?? null }
}

export const OPS = {
  // params: { pageNum, runId, wordIndex, old, edits: [{ name, text, fit, spill }] }.
  // One output per edit, each made from the original file.
  async edit(s, [src]) {
    const meta = { ...(await modelFacts(src, s)), edits: [] }
    const outputs = []
    for (const ed of s.params.edits) {
      const edit = { pageNum: s.params.pageNum, runId: s.params.runId, wordIndex: s.params.wordIndex, text: ed.text, old: s.params.old }
      // the UI flow: fast interactive edit, then one finalize before output
      // spill: false keeps a long line on its line (the old behaviour)
      const [res, ms] = await call('editText', src, [edit], { fit: !!ed.fit, ...(ed.spill === false ? { spill: false } : {}) })
      const [fin, finalizeMs] = await call('editTextFinalize', res.bytes)
      outputs.push(await save(s.id, `${ed.name}.pdf`, fin.bytes))
      meta.edits.push({ name: ed.name, text: ed.text, ms, finalizeMs, engineMs: res.ms ?? null, report: res.report[0], signatureRemoved: res.signatureRemoved, unchanged: res.bytes.length === src.length && res.bytes.every((b, i) => b === src[i]) })
    }
    return { outputs, meta }
  },

  // Several edits in one call (params.batch: [{ runId, wordIndex, old, text }]).
  async batch(s, [src]) {
    const edits = s.params.batch.map((e) => ({ pageNum: s.params.pageNum, ...e }))
    const [res, ms] = await call('editText', src, edits, { final: true })
    return { outputs: [await save(s.id, 'batch.pdf', res.bytes)], meta: { ms, report: res.report, signatureRemoved: res.signatureRemoved, xfaRemoved: res.xfaRemoved } }
  },

  // The same word edited again and again (params.texts), re-reading the
  // model each time like the UI, then one finalize. Also one direct edit to
  // the last text, finalized, for the size comparison.
  async repeat(s, [src]) {
    let bytes = src
    let prev = s.params.old
    const steps = []
    for (const text of s.params.texts) {
      const [model] = await call('editTextModel', bytes, s.params.pageNum)
      const run = model.runs.find((r) => r.words.some((w) => w.text === prev))
      if (!run) {
        steps.push({ text, lost: prev })
        break
      }
      const wordIndex = run.words.find((w) => w.text === prev).i
      const [res, ms] = await call('editText', bytes, [{ pageNum: s.params.pageNum, runId: run.id, wordIndex, text, old: prev }], {})
      steps.push({ text, ms, report: res.report[0] })
      if (res.report[0].refused) break
      bytes = res.bytes
      prev = text
    }
    const [fin, finalizeMs] = await call('editTextFinalize', bytes)
    const last = s.params.texts[s.params.texts.length - 1]
    const [one] = await call('editText', src, [{ pageNum: s.params.pageNum, runId: s.params.runId, wordIndex: s.params.wordIndex, text: last }], {})
    const [oneFin] = await call('editTextFinalize', one.bytes)
    return { outputs: [await save(s.id, 'repeat.pdf', fin.bytes)], meta: { steps, finalizeMs, size: fin.bytes.length, oneSize: oneFin.bytes.length } }
  },

  // Redact (remove mode) on a page with inline images: params.boxes view space.
  async redact(s, [src]) {
    const { redactPdf } = await import('/src/lib/redactOps.js')
    const t0 = performance.now()
    const res = await redactPdf(src, s.params.boxes, { method: 'remove', report: true })
    return { outputs: [await save(s.id, 'redacted.pdf', res.bytes)], meta: { rasterPages: res.rasterPages, ms: Math.round(performance.now() - t0) } }
  },

  // Paragraph edits: params { pageNum, paragraphId, old, edits: [{ name, text, fit }] },
  // each from the original file, edit + finalize like the UI. Optional
  // params.after: a word edit on the paragraph's first line after the edit.
  async para(s, [src]) {
    const [model, modelMs] = await call('editTextModel', src, s.params.pageNum, { paragraphs: true })
    const g = model.paragraphs?.find((x) => x.id === s.params.paragraphId)
    const meta = { modelMs, para: g ? { text: g.text, align: g.align, dir: g.dir, lines: g.lines, editable: g.editable, why: g.why } : null, edits: [] }
    const outputs = []
    for (const ed of s.params.edits) {
      const edit = { pageNum: s.params.pageNum, paragraphId: s.params.paragraphId, text: ed.text, old: s.params.old }
      const [res, ms] = await call('editText', src, [edit], { fit: !!ed.fit })
      const unchanged = res.bytes.length === src.length && res.bytes.every((b, i) => b === src[i])
      const rec = { name: ed.name, ms, engineMs: res.ms ?? null, report: res.report[0], unchanged }
      if (!res.report[0].refused) {
        const [fin, finalizeMs] = await call('editTextFinalize', res.bytes)
        rec.finalizeMs = finalizeMs
        outputs.push(await save(s.id, `${ed.name}.pdf`, fin.bytes))
        // the model of the edited file, as the UI reads it next
        const [m2] = await call('editTextModel', fin.bytes, s.params.pageNum, { paragraphs: true })
        rec.after = m2.paragraphs.map((x) => ({ id: x.id, text: x.text, align: x.align, lines: x.lines, editable: x.editable, bbox: x.bbox }))
      }
      meta.edits.push(rec)
    }
    return { outputs, meta }
  },

  // A word edit, then a paragraph edit on the same paragraph (the UI flow):
  // params { pageNum, runId, wordIndex, old, text, paraText(old para text) -> via meta }.
  async wordpara(s, [src]) {
    const p = s.params
    const [w] = await call('editText', src, [{ pageNum: p.pageNum, runId: p.runId, wordIndex: p.wordIndex, text: p.text, old: p.old }], {})
    const [m] = await call('editTextModel', w.bytes, p.pageNum, { paragraphs: true })
    const g = m.paragraphs.find((x) => x.text.includes(p.text) && x.lines > 1)
    const meta = { word: w.report[0], para: g ? { id: g.id, text: g.text, lines: g.lines, align: g.align, bbox: g.bbox } : null, paragraphs: m.paragraphs.map((x) => x.text) }
    const outputs = [await save(s.id, 'word.pdf', (await call('editTextFinalize', w.bytes))[0].bytes)]
    if (g) {
      const text = g.text.replace(p.text, `${p.text} again`)
      const [r, ms] = await call('editText', w.bytes, [{ pageNum: p.pageNum, paragraphId: g.id, text, old: g.text }], {})
      meta.edit = { text, ms, report: r.report[0] }
      if (!r.report[0].refused) {
        outputs.push(await save(s.id, 'para.pdf', (await call('editTextFinalize', r.bytes))[0].bytes))
        const [m2] = await call('editTextModel', r.bytes, p.pageNum, { paragraphs: true })
        meta.after = m2.paragraphs.map((x) => x.text)
      }
    }
    return { outputs, meta }
  },

  // Paragraph edits one after another on the edited bytes, re-reading the
  // model each time like the UI. params { pageNum, prefix, steps: [{ dropLast } | { remove }] }
  async parachain(s, [src]) {
    const p = s.params
    let bytes = src
    const steps = []
    for (const st of p.steps) {
      const [m] = await call('editTextModel', bytes, p.pageNum, { paragraphs: true })
      // a word or line edit step: { word: [old, new] } or { line: [starts, text] }
      if (st.word || st.line) {
        const run = st.word ? m.runs.find((r) => r.words.some((w) => w.text === st.word[0])) : m.runs.find((r) => r.text.startsWith(st.line[0]))
        const wi = st.word ? run?.words.find((w) => w.text === st.word[0]).i : null
        if (!run) {
          steps.push({ lost: true })
          break
        }
        const [r, ms] = await call('editText', bytes, [{ pageNum: p.pageNum, runId: run.id, wordIndex: wi, text: st.word ? st.word[1] : st.line[1] }], {})
        steps.push({ kind: 'word', ms, report: r.report[0] })
        if (r.report[0].refused) break
        bytes = r.bytes
        continue
      }
      const g = m.paragraphs.find((x) => x.text.startsWith(p.prefix))
      if (!g) {
        steps.push({ lost: true })
        break
      }
      const sents = g.text.split(/(?<=\.)\s+/)
      const text = st.dropLast ? sents.slice(0, -st.dropLast).join(' ') : st.append ? `${g.text} ${st.append}` : st.replace ? g.text.replace(st.replace[0], st.replace[1]) : g.text.replace(`${st.remove} `, '').replace(st.remove, '')
      const [r, ms] = await call('editText', bytes, [{ pageNum: p.pageNum, paragraphId: g.id, text, old: g.text }], {})
      steps.push({ before: { text: g.text, editable: g.editable, why: g.why, bbox: g.bbox, lines: g.lines, align: g.align }, text, ms, report: r.report[0] })
      if (r.report[0].refused) break
      bytes = r.bytes
    }
    const [fin] = await call('editTextFinalize', bytes)
    const [m] = await call('editTextModel', fin.bytes, p.pageNum, { paragraphs: true })
    const g = m.paragraphs.find((x) => x.text.startsWith(p.prefix))
    return { outputs: [await save(s.id, 'chain.pdf', fin.bytes)], meta: { steps, final: g ? { text: g.text, editable: g.editable, why: g.why, bbox: g.bbox, lines: g.lines, align: g.align } : null } }
  },

  // A refusal: the model marks the run, the edit is refused, the bytes stay.
  async refuse(s, [src]) {
    const meta = await modelFacts(src, s)
    const edit = { pageNum: s.params.pageNum, runId: s.params.runId, wordIndex: null, text: 'Edited' }
    const [res, ms] = await call('editText', src, [edit], {})
    const same = res.bytes.length === src.length && res.bytes.every((b, i) => b === src[i])
    return { outputs: [], meta: { ...meta, ms, report: res.report[0], unchanged: same } }
  },
}
