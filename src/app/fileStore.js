// App-level workspace: every file the user added and every version a tool
// made, kept in IndexedDB so it survives a reload. Files are stored as Blobs
// (by reference, the browser keeps them on disk), bytes are read only when a
// file is shown or processed. Without IndexedDB (private mode, blocked
// storage, full quota) the store keeps working in memory for the session.
//
// Record: { id, name, size, type, addedAt, order, blob, status
//   ('reading' | 'ready' | 'locked' | 'error'), pageCount, notices, error,
//   errorDetails, parentIds, version, toolHistory: [{ tool, at }], isLeaf }
// The workspace shows leaf records only; older versions stay for undo.
import { useSyncExternalStore } from 'react'
import { callOp } from './jobs.js'
import { releasePdf } from '../lib/pdfText.js'

const DB_NAME = 'swisspdf'
const DB_VERSION = 1
const STORE = 'files'

// Bytes of recently used files, least recently used first. Bounded by size:
// an evicted file is read back from its Blob on the next getBytes.
const CACHE_LIMIT = 512 * 1024 * 1024

const records = new Map() // id -> record
const bytesCache = new Map() // id -> Uint8Array (LRU, see CACHE_LIMIT)
const reading = new Map() // id -> Promise<Uint8Array> while a Blob is read
const evicted = new Map() // id -> WeakRef of bytes pdf.js may still hold
let cachedSize = 0
const locked = new Map() // id -> original bytes waiting for a password
const listeners = new Set()
let db = null
let persistent = false
let storageNote = null
let initPromise = null
let snapshot = null
// Bumped by wipeAll: outputs of a job started before a wipe are dropped.
let generation = 0
export const getGeneration = () => generation

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

function emit() {
  snapshot = null
  listeners.forEach((l) => l())
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'))
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'))
  })
}

// One transaction: all of fn's writes land, or none (a throw aborts it).
function tx(mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    let result
    let failed = null
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(failed ?? t.error)
    t.onabort = () => reject(failed ?? t.error ?? new Error('transaction aborted'))
    try {
      Promise.resolve(fn(store)).then((r) => (result = r))
    } catch (err) {
      failed = err
      try {
        t.abort()
      } catch {
        reject(err)
      }
    }
  })
}

function reqResult(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Writes are best effort: a full disk or a closed database only downgrades
// the session to memory, it never loses the file the user is working on.
async function persist(rec) {
  if (!db || !rec || rec.status === 'reading') return
  try {
    await tx('readwrite', (s) => s.put(rec))
  } catch (err) {
    downgrade(err)
  }
}

// Writes several records in one transaction, in the given order (new
// versions before the flags that hide their inputs). Returns false when
// nothing was written; the session then keeps the change in memory only.
async function persistAll(recs) {
  const list = recs.filter((r) => r && r.status !== 'reading')
  if (!db || list.length === 0) return !!db
  try {
    await tx('readwrite', (s) => list.forEach((r) => s.put(r)))
    return true
  } catch (err) {
    downgrade(err)
    return false
  }
}

async function unpersist(ids) {
  if (!db || ids.length === 0) return
  try {
    await tx('readwrite', (s) => ids.forEach((id) => s.delete(id)))
  } catch (err) {
    downgrade(err)
  }
}

// Stops writing for the rest of the session, so later changes never land in
// a database that missed one.
function downgrade(err) {
  const quota = err?.name === 'QuotaExceededError' || /quota/i.test(String(err?.message))
  storageNote = quota
    ? 'Browser storage is full. New files are kept for this session only.'
    : 'Browser storage is not available. Files are kept for this session only.'
  persistent = false
  try {
    db?.close()
  } catch {
    /* already closed */
  }
  db = null
  emit()
}

// Records hidden as older versions with no current file on top of them (a
// change that was cut off half way, from older builds): the newest of each
// chain becomes a current file again. Returns the records it changed.
function recoverOrphans() {
  const reach = new Set()
  const walk = (id) => {
    if (reach.has(id)) return
    reach.add(id)
    records.get(id)?.parentIds?.forEach(walk)
  }
  for (const r of records.values()) if (r.isLeaf) walk(r.id)
  const lost = [...records.values()].filter((r) => !reach.has(r.id))
  const parentOfLost = new Set(lost.flatMap((r) => r.parentIds ?? []))
  const fixed = []
  for (const r of lost) {
    if (parentOfLost.has(r.id)) continue
    const next = { ...r, isLeaf: true }
    records.set(r.id, next)
    fixed.push(next)
  }
  return fixed
}

export function init() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      db = await openDb()
      // Another tab upgrading the schema: step aside instead of blocking it.
      db.onversionchange = () => {
        db.close()
        db = null
        persistent = false
        storageNote = 'SwissPDF was opened in another tab. Files here are kept for this session only.'
        emit()
      }
      const all = await tx('readonly', (s) => reqResult(s.getAll()))
      for (const rec of all) records.set(rec.id, rec)
      persistent = true
      const fixed = recoverOrphans()
      if (fixed.length) await persistAll(fixed)
      navigator.storage?.persist?.().catch(() => {})
    } catch {
      db = null
      persistent = false
      storageNote = 'Browser storage is not available. Files are kept for this session only.'
    }
    emit()
  })()
  return initPromise
}

const byOrder = (a, b) => a.order - b.order || a.addedAt - b.addedAt
const getSnapshotFiles = () => [...records.values()].filter((r) => r.isLeaf).sort(byOrder)
function nextOrder() {
  let max = 0
  for (const r of records.values()) if (r.isLeaf) max = Math.max(max, r.order)
  return max + 1
}

function getSnapshot() {
  if (!snapshot) {
    const files = [...records.values()].filter((r) => r.isLeaf).sort(byOrder)
    snapshot = { files, persistent, storageNote, ready: !!initPromise && (persistent || storageNote !== null) }
  }
  return snapshot
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useWorkspace() {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export const getFiles = () => getSnapshot().files
export const getRecord = (id) => records.get(id) ?? null

function update(id, fields) {
  const rec = records.get(id)
  if (!rec) return null
  const next = { ...rec, ...fields }
  records.set(id, next)
  emit()
  return next
}

function cacheBytes(id, bytes) {
  const old = bytesCache.get(id)
  if (old) cachedSize -= old.byteLength
  bytesCache.delete(id)
  bytesCache.set(id, bytes)
  cachedSize += bytes.byteLength
  // oldest first; the file just used always stays
  for (const [k, b] of bytesCache) {
    if (cachedSize <= CACHE_LIMIT || k === id) break
    bytesCache.delete(k)
    cachedSize -= b.byteLength
    if (typeof WeakRef === 'function') evicted.set(k, new WeakRef(b))
  }
}

// Bytes for processing and rendering. Cached so pdf.js reuses one parse;
// two callers asking at once get the same buffer.
export async function getBytes(id) {
  const hit = bytesCache.get(id)
  if (hit) {
    cacheBytes(id, hit)
    return hit
  }
  if (reading.has(id)) return reading.get(id)
  const rec = records.get(id)
  if (!rec?.blob) throw new Error('File is no longer available')
  const p = rec.blob
    .arrayBuffer()
    .then((buf) => {
      const bytes = new Uint8Array(buf)
      if (records.has(id)) cacheBytes(id, bytes)
      return bytes
    })
    .finally(() => reading.delete(id))
  reading.set(id, p)
  return p
}

export const peekBytes = (id) => bytesCache.get(id) ?? null

function dropBytes(id) {
  const bytes = bytesCache.get(id)
  if (bytes) {
    releasePdf(bytes)
    cachedSize -= bytes.byteLength
  }
  bytesCache.delete(id)
  const old = evicted.get(id)?.deref()
  if (old && old !== bytes) releasePdf(old)
  evicted.delete(id)
  locked.delete(id)
}

const isPdfName = (name) => /\.pdf$/i.test(name)
const PDF = 'application/pdf'
// Records without a type are PDFs (older workspaces).
export const isPdfRecord = (rec) => (rec?.type ?? PDF) === PDF

// Adds files to the workspace. PDFs run intake (unlock / repair / count) in
// the worker. Other files are kept only when keepOther(file) says so (inputs
// of the convert tools); they are ready at once, with no page count.
// Returns the new ids.
export async function addFiles(fileList, { keepOther = () => false } = {}) {
  await init()
  const isPdf = (f) => isPdfName(f.name) || f.type === PDF
  const files = Array.from(fileList).filter((f) => isPdf(f) || keepOther(f))
  let order = nextOrder()
  const recs = files.map((file) => ({
    id: newId(),
    name: file.name,
    size: file.size,
    type: isPdf(file) ? PDF : file.type || 'application/octet-stream',
    addedAt: Date.now(),
    order: order++,
    blob: file,
    status: isPdf(file) ? 'reading' : 'ready',
    pageCount: null,
    notices: [],
    error: null,
    errorDetails: null,
    parentIds: [],
    version: 1,
    toolHistory: [],
    isLeaf: true,
  }))
  for (const r of recs) records.set(r.id, r)
  emit()
  for (const r of recs) {
    if (isPdfRecord(r)) await intake(r.id)
    else await persist(r)
  }
  return recs.map((r) => r.id)
}

async function intake(id, password) {
  const rec = records.get(id)
  if (!rec) return
  let raw = locked.get(id)
  try {
    if (!raw) raw = new Uint8Array(await rec.blob.arrayBuffer())
    const res = await callOp('normalize', [raw, password ? { password } : {}], { lane: 'intake' })
    if (!records.has(id)) return
    locked.delete(id)
    const same = res.bytes.byteLength === raw.byteLength && !res.notices.length
    const bytes = same ? raw : res.bytes
    cacheBytes(id, bytes)
    const next = update(id, {
      status: 'ready',
      blob: same ? rec.blob : new Blob([bytes], { type: 'application/pdf' }),
      size: bytes.byteLength,
      pageCount: res.pageCount,
      notices: res.notices ?? [],
      error: null,
      errorDetails: null,
      passwordError: null,
      unlocking: false,
    })
    await persist(next)
    if (!same) await adoptStoredBlobs([id])
  } catch (err) {
    if (!records.has(id)) return
    if (err.code === 'NEEDS_PASSWORD' || (password && err.code === 'WRONG_PASSWORD')) {
      locked.set(id, raw)
      const next = update(id, {
        status: 'locked',
        unlocking: false,
        passwordError: password ? 'Wrong password, try again.' : null,
      })
      await persist(next)
    } else {
      const next = update(id, {
        status: 'error',
        unlocking: false,
        error: err.message || 'Not a valid PDF',
        errorDetails: err.details ?? String(err),
      })
      await persist(next)
    }
  }
}

export async function submitPassword(id, password) {
  if (!password || !records.has(id)) return
  update(id, { unlocking: true, passwordError: null })
  await intake(id, password)
}

// Tool outputs become new leaf versions. Every input listed in consumedIds
// stops being a leaf (merge consumes all its inputs, compress replaces each).
// outputs: [{ name, bytes, pageCount, parentIds, type? }], type is the MIME
// type of a non-PDF output. Returns the change, which undoChange() reverses,
// or null when the outputs were dropped: the workspace was wiped since the
// job started (generation is the getGeneration() value from its start), or
// every input of an output is gone.
export async function addVersions(outputs, { tool, consumedIds = [], generation: gen = generation }) {
  if (gen !== generation) return null
  const live = outputs.filter((o) => !o.parentIds?.length || o.parentIds.some((id) => records.has(id)))
  if (live.length === 0) return null
  const outputIds = []
  const consumed = consumedIds.filter((id) => records.get(id)?.isLeaf)
  for (const [k, out] of live.entries()) {
    const parents = (out.parentIds ?? []).map((id) => records.get(id)).filter(Boolean)
    const first = parents[0]
    const type = out.type ?? PDF
    const rec = {
      id: newId(),
      name: out.name,
      size: out.bytes.byteLength,
      type,
      addedAt: Date.now(),
      // in the parent's place, in output order (split parts stay 1, 2, 3)
      order: first ? first.order - 1 + (k + 1) / (live.length + 1) : nextOrder() + k,
      // the Blob is the only copy kept; bytes are read back on demand
      blob: new Blob([out.bytes], { type }),
      status: 'ready',
      pageCount: out.pageCount ?? null,
      notices: [],
      error: null,
      errorDetails: null,
      parentIds: parents.map((p) => p.id),
      version: Math.max(0, ...parents.map((p) => p.version)) + 1,
      toolHistory: [...(first?.toolHistory ?? []), { tool, at: Date.now() }],
      isLeaf: true,
    }
    records.set(rec.id, rec)
    outputIds.push(rec.id)
  }
  for (const id of consumed) {
    records.set(id, { ...records.get(id), isLeaf: false })
    dropBytes(id)
  }
  // back to whole numbers so the next tool's outputs fit in between again
  const moved = []
  getSnapshotFiles().forEach((r, i) => {
    if (r.order !== i + 1) {
      records.set(r.id, { ...r, order: i + 1 })
      moved.push(r.id)
    }
  })
  emit()
  // one transaction, outputs first: a failed write (quota) leaves the
  // database as it was, never inputs hidden behind outputs that are missing
  const flags = [...new Set([...consumed, ...moved])].filter((id) => !outputIds.includes(id))
  const saved = await persistAll([...outputIds, ...flags].map((id) => records.get(id)))
  if (saved) await adoptStoredBlobs(outputIds)
  // outputIndex: position in `outputs` of each kept output
  return { outputIds, consumedIds: consumed, outputIndex: live.map((o) => outputs.indexOf(o)) }
}

// After a write, point records at the Blobs IndexedDB returns: those live on
// disk, so the in-memory copy made from the tool's bytes can be freed.
async function adoptStoredBlobs(ids) {
  if (!db || ids.length === 0) return
  try {
    const stored = await tx('readonly', (s) => Promise.all(ids.map((id) => reqResult(s.get(id)))))
    let changed = false
    for (const r of stored ?? []) {
      const cur = r && records.get(r.id)
      if (cur && r.blob && r.blob !== cur.blob && r.blob.size === cur.blob?.size) {
        records.set(r.id, { ...cur, blob: r.blob })
        changed = true
      }
    }
    if (changed) emit()
  } catch {
    /* keep the memory copies */
  }
}

// Reverses one addVersions change: outputs go away, inputs come back.
export async function undoChange({ outputIds, consumedIds }) {
  const gone = outputIds.filter((id) => records.has(id))
  for (const id of gone) {
    records.delete(id)
    dropBytes(id)
  }
  const back = consumedIds.filter((id) => records.has(id))
  for (const id of back) records.set(id, { ...records.get(id), isLeaf: true })
  emit()
  if (!db) return
  // inputs come back and outputs go in one transaction
  try {
    await tx('readwrite', (s) => {
      back.forEach((id) => s.put(records.get(id)))
      gone.forEach((id) => s.delete(id))
    })
  } catch (err) {
    downgrade(err)
  }
}

// Steps one file back to the version(s) it was made from.
export async function revertVersion(id) {
  const rec = records.get(id)
  if (!rec?.parentIds.length) return
  await undoChange({ outputIds: [id], consumedIds: rec.parentIds })
}

// Chain of versions behind a file, newest first (follows the first parent).
export function historyOf(id) {
  const out = []
  let rec = records.get(id)
  while (rec) {
    out.push(rec)
    rec = rec.parentIds.length ? records.get(rec.parentIds[0]) : null
  }
  return out
}

// Removes a file from the workspace together with the old versions that
// only it still needs.
export async function remove(id) {
  if (!records.get(id)?.isLeaf) return
  const keep = new Set()
  const walk = (rid) => {
    if (keep.has(rid)) return
    keep.add(rid)
    records.get(rid)?.parentIds.forEach(walk)
  }
  for (const r of records.values()) if (r.isLeaf && r.id !== id) walk(r.id)
  const gone = [...records.keys()].filter((rid) => !keep.has(rid))
  for (const rid of gone) {
    records.delete(rid)
    dropBytes(rid)
  }
  emit()
  await unpersist(gone)
}

async function saveOrder(list) {
  list.forEach((r, i) => records.set(r.id, { ...records.get(r.id), order: i + 1 }))
  emit()
  await persistAll(list.map((r) => records.get(r.id)))
}

// Moves the leaf at index `from` to index `to` (workspace order).
export function reorder(from, to) {
  const list = getFiles().slice()
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  return saveOrder(list)
}

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  size: (a, b) => a.size - b.size,
  date: (a, b) => a.addedAt - b.addedAt,
}
export function sortBy(key, dir = 'asc') {
  const list = getFiles().slice().sort(SORTS[key] ?? SORTS.name)
  if (dir === 'desc') list.reverse()
  return saveOrder(list)
}

// Wipe everything: memory, caches and the database.
// Bumps the generation, so a job still running drops its outputs.
export async function wipeAll() {
  generation++
  for (const id of records.keys()) dropBytes(id)
  records.clear()
  reading.clear()
  emit()
  if (db) {
    try {
      await tx('readwrite', (s) => s.clear())
    } catch (err) {
      downgrade(err)
    }
    return
  }
  // a session that stopped writing still clears what an earlier write left
  try {
    const d = await openDb()
    await new Promise((resolve, reject) => {
      const t = d.transaction(STORE, 'readwrite')
      t.objectStore(STORE).clear()
      t.oncomplete = resolve
      t.onerror = t.onabort = () => reject(t.error)
    })
    d.close()
  } catch {
    /* no database to clear */
  }
}

// Ready files only, with their bytes, for a tool run.
export async function filesForRun(ids) {
  const out = []
  for (const id of ids) {
    const rec = records.get(id)
    if (!rec || rec.status !== 'ready') continue
    out.push({ id, name: rec.name, size: rec.size, pageCount: rec.pageCount, type: rec.type ?? PDF, bytes: await getBytes(id) })
  }
  return out
}
