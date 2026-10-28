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
  // params: { pageNum, runId, wordIndex, old, edits: [{ name, text, fit }] }.
  // One output per edit, each made from the original file.
  async edit(s, [src]) {
    const meta = { ...(await modelFacts(src, s)), edits: [] }
    const outputs = []
    for (const ed of s.params.edits) {
      const edit = { pageNum: s.params.pageNum, runId: s.params.runId, wordIndex: s.params.wordIndex, text: ed.text, old: s.params.old }
      // the UI flow: fast interactive edit, then one finalize before output
      const [res, ms] = await call('editText', src, [edit], { fit: !!ed.fit })
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
    return { outputs: [await save(s.id, 'batch.pdf', res.bytes)], meta: { ms, report: res.report, signatureRemoved: res.signatureRemoved } }
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

  // A refusal: the model marks the run, the edit is refused, the bytes stay.
  async refuse(s, [src]) {
    const meta = await modelFacts(src, s)
    const edit = { pageNum: s.params.pageNum, runId: s.params.runId, wordIndex: null, text: 'Edited' }
    const [res, ms] = await call('editText', src, [edit], {})
    const same = res.bytes.length === src.length && res.bytes.every((b, i) => b === src[i])
    return { outputs: [], meta: { ...meta, ms, report: res.report[0], unchanged: same } }
  },
}
