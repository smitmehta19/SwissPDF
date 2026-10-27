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
      const [res, ms] = await call('editText', src, [edit], { fit: !!ed.fit })
      outputs.push(await save(s.id, `${ed.name}.pdf`, res.bytes))
      meta.edits.push({ name: ed.name, text: ed.text, ms, report: res.report[0], signatureRemoved: res.signatureRemoved })
    }
    return { outputs, meta }
  },

  // Several edits in one call (params.batch: [{ runId, wordIndex, old, text }]).
  async batch(s, [src]) {
    const edits = s.params.batch.map((e) => ({ pageNum: s.params.pageNum, ...e }))
    const [res, ms] = await call('editText', src, edits, {})
    return { outputs: [await save(s.id, 'batch.pdf', res.bytes)], meta: { ms, report: res.report, signatureRemoved: res.signatureRemoved } }
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
