// One test run at a time on this machine. Every run starts browsers plus the
// PDF engines (1 to 2 GB each), so runs from several agents at once overload
// it and tests time out for no real reason. The lock lives in the OS temp
// folder, so it also covers worktrees. CORPUS_LOCK=off skips it.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

export const LOCK_FILE = join(os.tmpdir(), 'swisspdf-test-run.lock')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

export function lockHolder() {
  try {
    const h = JSON.parse(readFileSync(LOCK_FILE, 'utf8'))
    return alive(h.pid) ? h : null
  } catch {
    return null
  }
}

let held = false
export async function acquireRunLock(label, { maxWaitMin = Number(process.env.CORPUS_LOCK_WAIT_MIN ?? 45) } = {}) {
  if (process.env.CORPUS_LOCK === 'off' || held) return
  const t0 = Date.now()
  let told = 0
  for (;;) {
    const h = lockHolder()
    if (!h) rmSync(LOCK_FILE, { force: true })
    try {
      writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, label, cwd: process.cwd(), started: new Date().toISOString() }), { flag: 'wx' })
      held = true
      break
    } catch {
      /* someone else got it first */
    }
    const waited = (Date.now() - t0) / 60_000
    if (waited > maxWaitMin) throw new Error(`Another test run still holds ${LOCK_FILE} after ${maxWaitMin} min: ${JSON.stringify(h)}. Run \`npm run test:clean\` if it is a leftover.`)
    if (Date.now() - told > 60_000) {
      told = Date.now()
      console.log(`waiting for another test run to finish: ${h?.label ?? '?'} (pid ${h?.pid ?? '?'}, since ${h?.started ?? '?'})`)
    }
    await sleep(5000)
  }
  const release = () => {
    if (!held) return
    held = false
    try {
      if (JSON.parse(readFileSync(LOCK_FILE, 'utf8')).pid === process.pid) rmSync(LOCK_FILE, { force: true })
    } catch {
      /* already gone */
    }
  }
  process.on('exit', release)
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => (release(), process.exit(130)))
}

// Parallel browser contexts the free memory allows (about 2 GB each, 2 GB spare).
export function safeShards(requested) {
  const freeGb = os.freemem() / 2 ** 30
  const fit = Math.max(1, Math.floor((freeGb - 2) / 2))
  const n = Math.max(1, Math.min(requested, fit, 4))
  if (n < requested) console.log(`shards ${requested} -> ${n} (free memory ${freeGb.toFixed(1)} GB)`)
  return n
}
