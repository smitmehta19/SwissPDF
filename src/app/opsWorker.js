// Worker side of jobs.js: runs one op per message and posts the result back,
// moving output buffers instead of copying them.
import { OPS } from './ops.js'

function buffersIn(value, out = new Set()) {
  if (value instanceof Uint8Array) {
    if (value.buffer instanceof ArrayBuffer) out.add(value.buffer)
  } else if (Array.isArray(value)) {
    value.forEach((v) => buffersIn(v, out))
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => buffersIn(v, out))
  }
  return out
}

self.onmessage = async (e) => {
  const { id, op, args } = e.data
  try {
    if (!OPS[op]) throw new Error(`Unknown op ${op}`)
    const result = await OPS[op](...args)
    self.postMessage({ id, ok: true, result }, [...buffersIn(result)])
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: { message: err?.message ?? String(err), code: err?.code ?? null, details: err?.details ?? null },
    })
  }
}
