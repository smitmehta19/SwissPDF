// S3 Automate ops for the corpus runner (op names "automate:<name>"). Runs in
// the app page: the real Automate tool's run() through the job runner, then
// the shell's output check, timed as "Run to result" (store write excluded).
// Node checks the outputs in cases-automate.mjs.

const lib = (name) => import(/* @vite-ignore */ `/src/lib/${name}.js`)

const CHUNK = 8 * 1024 * 1024
async function save(caseId, name, bytes) {
  const url = `/__corpus/out/${encodeURIComponent(caseId)}/${encodeURIComponent(name)}`
  for (let at = 0, part = 0; at < bytes.length || part === 0; at += CHUNK, part++) {
    const res = await fetch(`${url}?part=${part}`, { method: 'POST', body: bytes.subarray(at, at + CHUNK) })
    if (!res.ok) throw new Error(`upload ${name}: ${res.status}`)
  }
  return { name, size: bytes.length }
}

// Workspace-like records after intake, as the shell has them. Ids unique per case.
async function records(s, files) {
  const { normalizePdf } = await lib('intake')
  const out = []
  for (const [i, raw] of files.entries()) {
    const { bytes, pageCount, notices } = await normalizePdf(raw, {})
    out.push({ id: `${s.id}-${i}`, name: s.files[i].split('/').pop(), size: bytes.byteLength, pageCount, type: 'application/pdf', bytes, notices: notices ?? [] })
  }
  return out
}

// Automate options for a template, with step option overrides by index
// (passwords are never part of a template).
async function optionsFor(s) {
  const { TEMPLATES } = await lib('automate')
  const t = TEMPLATES.find((x) => x.id === s.params.template)
  if (!t) throw new Error(`no template ${s.params.template}`)
  const over = s.params.overrides ?? {}
  const steps = t.steps.map((st, i) => (over[i] ? { ...st, options: { ...st.options, ...over[i] } } : st))
  return { pick: t.id, mine: [], drafts: { [t.id]: steps }, open: null }
}

async function runOnce(tool, files, options, { cancelAfterMs } = {}) {
  const { runJob } = await import('/src/app/jobs.js')
  const { assertValidOutput } = await lib('pdfOps')
  const sum = tool.summary(files, options)
  if (!sum.ready) throw new Error(`not ready: ${sum.line}`)
  const t0 = performance.now()
  const labels = []
  const job = runJob(tool, files, options, { onProgress: (p) => labels.push(p.label) })
  if (cancelAfterMs != null) setTimeout(job.cancel, cancelAfterMs)
  const res = await job.promise
  for (const o of res.outputs) if (!o.locked) await assertValidOutput(o.bytes)
  return { res, runMs: Math.round(performance.now() - t0), labels: [...new Set(labels)], summary: sum }
}

export const OPS = {
  // params: { template, overrides, batch }. Without batch each file runs on
  // its own (one Run to result time per file); with batch all files in one run.
  async run(s, raw) {
    const tool = (await import('/src/tools/v2/automate.jsx')).default
    const recs = await records(s, raw)
    const options = await optionsFor(s)
    const outputs = []
    const runs = []
    const groups = s.params.batch ? [recs] : recs.map((r) => [r])
    for (const group of groups) {
      let one
      try {
        one = await runOnce(tool, group, options)
      } catch (err) {
        runs.push({ files: group.map((r) => r.name), error: err.message })
        continue
      }
      for (const o of one.res.outputs) {
        const i = recs.findIndex((r) => r.id === o.parentIds[0])
        outputs.push(await save(s.id, `out-${i}.pdf`, o.bytes))
      }
      runs.push({
        files: group.map((r) => r.name),
        runMs: one.runMs,
        labels: one.labels.slice(0, 40),
        line: one.summary.line,
        outputs: one.res.outputs.map((o) => ({ index: recs.findIndex((r) => r.id === o.parentIds[0]), name: o.name, note: o.note, locked: !!o.locked, pageCount: o.pageCount ?? null })),
        report: one.res.view.files,
      })
    }
    return { outputs, meta: { runs, inputs: recs.map((r) => ({ name: r.name, pageCount: r.pageCount, size: r.size })) } }
  },

  // Cancel mid-run: params { template, overrides, afterMs, whenLabel }. With
  // whenLabel the clock starts once a progress label contains it (e.g. "OCR").
  // The job must end with a cancel, not a result or a step failure; msAfter is
  // the time from Cancel to the end.
  async cancel(s, raw) {
    const tool = (await import('/src/tools/v2/automate.jsx')).default
    const { runJob } = await import('/src/app/jobs.js')
    const recs = await records(s, raw)
    const options = await optionsFor(s)
    const labels = new Set()
    let cancelAt = null
    let armed = false
    let job
    const arm = () => {
      armed = true
      setTimeout(() => {
        cancelAt = performance.now()
        job.cancel()
      }, s.params.afterMs ?? 1500)
    }
    job = runJob(tool, recs, options, {
      onProgress: (p) => {
        labels.add(p.label)
        if (!armed && s.params.whenLabel && p.label.includes(s.params.whenLabel)) arm()
      },
    })
    if (!s.params.whenLabel) arm()
    try {
      const res = await job.promise
      return { outputs: [], meta: { cancelled: false, outputs: res.outputs.length, labels: [...labels] } }
    } catch (err) {
      const msAfter = cancelAt == null ? null : Math.round(performance.now() - cancelAt)
      return { outputs: [], meta: { cancelled: !!(err.cancelled || err.name === 'AbortError'), error: err.message, msAfter, labels: [...labels] } }
    }
  },
}
