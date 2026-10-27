// Job runner. Pure ops (ops.js) run in a module Web Worker so a big merge or
// MuPDF clean never freezes the page. Each lane is its own worker, so intake
// and a running job do not queue behind each other. Cancel terminates the
// lane's worker (the only way to stop a WASM call mid-way); the next call
// starts a fresh one. If a worker cannot start, ops run inline.

const lanes = new Map() // lane -> { worker, pending: Map<id, {resolve, reject}>, jobs }
// Lanes whose worker is replaced after this many calls: MuPDF keeps memory
// it never gives back (redaction), a fresh worker starts clean.
const RECYCLE = { redact: 10 }
let seq = 1
let workerBroken = typeof Worker === 'undefined'

export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'AbortError'
    this.cancelled = true
  }
}

function rebuildError(e) {
  const err = new Error(e.message)
  if (e.code) err.code = e.code
  if (e.details) err.details = e.details
  return err
}

function getLane(name) {
  let lane = lanes.get(name)
  if (lane) return lane
  const worker = new Worker(new URL('./opsWorker.js', import.meta.url), { type: 'module' })
  lane = { worker, pending: new Map(), jobs: 0 }
  worker.onmessage = (e) => {
    const p = lane.pending.get(e.data.id)
    if (!p) return
    lane.pending.delete(e.data.id)
    if (e.data.ok) p.resolve(e.data.result)
    else p.reject(rebuildError(e.data.error))
  }
  // A worker that fails to load: retry everything in flight inline.
  worker.onerror = (e) => {
    e.preventDefault?.()
    workerBroken = true
    killLane(name, null)
  }
  lanes.set(name, lane)
  return lane
}

function killLane(name, reason) {
  const lane = lanes.get(name)
  if (!lane) return
  lanes.delete(name)
  lane.worker.terminate()
  for (const p of lane.pending.values()) {
    if (reason) p.reject(reason)
    else p.retryInline()
  }
}

async function runInline(op, args) {
  const { OPS } = await import('./ops.js')
  return OPS[op](...args)
}

// Runs one op. Arguments are copied into the worker (never moved), so the
// page's own buffers stay valid for pdf.js caches.
export function callOp(op, args, { lane = 'jobs', signal } = {}) {
  if (signal?.aborted) return Promise.reject(new CancelledError())
  if (workerBroken) return runInline(op, args)
  return new Promise((resolve, reject) => {
    let l
    try {
      l = getLane(lane)
    } catch {
      workerBroken = true
      runInline(op, args).then(resolve, reject)
      return
    }
    const id = seq++
    const onAbort = () => killLane(lane, new CancelledError())
    const done = (fn) => (v) => {
      signal?.removeEventListener('abort', onAbort)
      fn(v)
      // an idle lane that did its share of work starts over with a new worker
      l.jobs++
      if (RECYCLE[lane] && l.jobs >= RECYCLE[lane] && l.pending.size === 0 && lanes.get(lane) === l) killLane(lane, null)
    }
    l.pending.set(id, {
      resolve: done(resolve),
      reject: done(reject),
      retryInline: () => runInline(op, args).then(done(resolve), done(reject)),
    })
    signal?.addEventListener('abort', onAbort, { once: true })
    l.worker.postMessage({ id, op, args })
  })
}

// Runs a tool: run(files, options, ctx) with
//   ctx.progress(done, total, label)  progress for the bar
//   ctx.signal                        AbortSignal, check it per page
//   ctx.check()                       throws CancelledError once cancelled
//   ctx.call(op, ...args)             worker op that cancels with the job
//   ctx.callIn(lane, op, ...args)     same, in a worker lane of its own ('redact')
// Returns { promise, cancel }.
export function runJob(tool, files, options, { onProgress } = {}) {
  const controller = new AbortController()
  const { signal } = controller
  const ctx = {
    signal,
    check() {
      if (signal.aborted) throw new CancelledError()
    },
    progress(done, total, label = '') {
      if (!signal.aborted) onProgress?.({ done, total, label })
    },
    call: (op, ...args) => callOp(op, args, { signal }),
    callIn: (lane, op, ...args) => callOp(op, args, { signal, lane }),
  }
  const promise = (async () => {
    const outputs = await tool.run(files, options, ctx)
    ctx.check()
    return outputs
  })()
  return { promise, cancel: () => controller.abort() }
}
