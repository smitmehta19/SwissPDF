// Automate: saved chains of PDF tools, run file by file on this device. Each
// step is a registered tool's own run() on one file; its output feeds the next
// step. Tools are passed in by id (this file never imports tool modules).

export const STORE_KEY = 'swiss-automations'
const STORE_VERSION = 1

// Tools that can be a step: one PDF in, one PDF out, set up in the options
// panel only (no page canvas, no Pages view, no second input).
export const STEP_IDS = [
  'sanitize',
  'flatten',
  'removeannots',
  'removeimages',
  'unlockforms',
  'metadata',
  'compress',
  'repair',
  'ocr',
  'autorotate',
  'rotate',
  'removeblank',
  'pagenumbers',
  'watermark',
  'stamp',
  'nup',
  'booklet',
  'scale',
  'singlepage',
  'adjustcolors',
  'replacecolors',
  'linearize',
  'permissions',
  'protect',
]

// Steps that only make sense at the end: a later step would undo them.
export const LAST_ONLY = {
  protect: 'it locks the file, so no later step can open it',
  permissions: 'a later step would drop the restrictions',
  linearize: 'a later step would undo fast web view',
}

// Option keys never written to storage: passwords and picked images are typed
// or picked again each session.
const SECRET = {
  protect: ['password', 'repeat', 'openPassword', 'openRepeat', 'ownerPassword'],
  permissions: ['owner', 'confirm'],
  watermark: ['logo', 'logoName'],
  stamp: ['image', 'imageName'],
}

// Option keys tied to workspace file ids: meaningless in a saved chain.
const PER_FILE = {
  rotate: ['perFile'],
  removeblank: ['found', 'keep', 'saveRemoved'],
}

// "Nothing to do" errors that skip the step instead of stopping the file.
const NOTHING = {
  ocr: /already has a text layer/i,
  removeblank: /^No blank pages found/i,
  rotate: /nothing to rotate/i,
}

// Automate's own options for the metadata step (the tool keys its options by
// file id): clear everything, or set some fields and keep the rest.
export const METADATA_STEP = { mode: 'clear', info: { Title: '', Author: '', Subject: '', Keywords: '' } }

// Built-in starting points. Our own names and step lists.
export const TEMPLATES = [
  {
    id: 'tpl-share',
    name: 'Clean copy to share',
    blurb: 'Drops scripts and attached files, bakes in form values, removes comments and document properties, then shrinks the file. Links stay.',
    steps: [
      { tool: 'sanitize', options: { javascript: true, embeddedFiles: true, xmp: false, metadata: false, links: false, fonts: false } },
      { tool: 'flatten', options: { mode: 'forms' } },
      { tool: 'removeannots', options: { mode: 'pick', widgets: false, groups: ['comments', 'markup', 'drawings', 'stamps', 'files', 'media', 'other'] } },
      { tool: 'metadata', options: { mode: 'clear' } },
      { tool: 'compress', options: { mode: 'clean', preset: 'good' } },
    ],
  },
  {
    id: 'tpl-mail',
    name: 'Small and locked',
    blurb: 'Shrinks the file, then locks it with a password you type before each run.',
    steps: [
      { tool: 'compress', options: { mode: 'clean', preset: 'good' } },
      { tool: 'protect', options: { mode: 'basic', keyLength: 256 } },
    ],
  },
  {
    id: 'tpl-scan',
    name: 'Scan to searchable',
    blurb: 'Turns sideways pages upright, reads the text so it can be searched and copied, then shrinks the file.',
    steps: [
      { tool: 'autorotate', options: { threshold: 2, infer: true } },
      { tool: 'ocr', options: { langs: ['eng'], textPages: 'skip', autoRotate: false, deskew: true } },
      { tool: 'compress', options: { mode: 'clean', preset: 'good' } },
    ],
  },
  {
    id: 'tpl-draft',
    name: 'Numbered draft',
    blurb: 'Adds "Page 1 of 9" at the bottom and a light DRAFT mark across every page.',
    steps: [
      { tool: 'pagenumbers', options: { style: 'page', preset: 'n-of-p', position: 'bottom-center' } },
      { tool: 'watermark', options: { kind: 'text', text: 'DRAFT', fontSize: 72, color: '#8a86a0', opacity: 0.2, rotate: 45, position: 'middle-center' } },
    ],
  },
  {
    id: 'tpl-archive',
    name: 'Long-term copy',
    blurb: 'Rebuilds the file structure, then sets it up so page 1 opens first on the web.',
    steps: [
      { tool: 'repair', options: {} },
      { tool: 'linearize', options: {} },
    ],
  },
].map((t) => ({ ...t, template: true, steps: t.steps.map((s, i) => ({ ...s, uid: `${t.id}-${i}` })) }))

export const newId = (prefix = 'a') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const omit = (obj, keys) => {
  const out = { ...obj }
  for (const k of keys ?? []) delete out[k]
  return out
}

// A step as it is stored: no secrets, nothing tied to workspace files.
export function storableStep(step) {
  return { uid: step.uid, tool: step.tool, options: omit(omit(step.options ?? {}, SECRET[step.tool]), PER_FILE[step.tool]) }
}

const storable = (a) => ({ id: a.id, name: a.name, steps: a.steps.map(storableStep) })
const sameStored = (a, b) => JSON.stringify(storable(a)) === JSON.stringify(storable(b))

// Saved option values reach a tool's own code: keep only keys the tool knows,
// with the type of its default (a null where text belongs crashed the panel).
export function cleanOptions(tool, options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return {}
  if (tool === 'metadata') {
    const info = {}
    for (const k of Object.keys(METADATA_STEP.info)) if (typeof options.info?.[k] === 'string') info[k] = options.info[k]
    return { mode: options.mode === 'set' ? 'set' : 'clear', info: { ...METADATA_STEP.info, ...info } }
  }
  const defaults = tool?.defaults ?? {}
  const out = {}
  for (const [k, v] of Object.entries(options)) {
    if (!(k in defaults) || defaults[k] === null) continue
    const d = defaults[k]
    const ok = Array.isArray(d) ? Array.isArray(v) : v !== null && typeof v === typeof d && !Array.isArray(v) && (typeof d !== 'number' || Number.isFinite(v))
    if (ok) out[k] = v
  }
  return out
}

// The stored list: { list } when it can be used, else { reason }:
// 'blocked' (no storage), 'newer' (written by a newer version: never touched),
// 'corrupt' (unreadable: kept as `raw`). With `tools`, step options are
// cleaned against their tool. Unknown tools stay in the list so the user
// decides; duplicate step ids get new ones.
export function readStore(storage, tools = null) {
  let text
  try {
    text = (storage ?? globalThis.localStorage).getItem(STORE_KEY)
  } catch {
    return { reason: 'blocked' }
  }
  if (text == null) return { list: [] }
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    return { reason: 'corrupt', raw: text }
  }
  if (raw && typeof raw.v === 'number' && raw.v > STORE_VERSION) return { reason: 'newer' }
  if (!raw || raw.v !== STORE_VERSION || !Array.isArray(raw.list)) return { reason: 'corrupt', raw: text }
  const list = raw.list
    .filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string' && Array.isArray(a.steps))
    .map((a) => {
      const seen = new Set()
      const steps = a.steps
        .filter((s) => s && typeof s.tool === 'string')
        .map((s) => {
          let uid = typeof s.uid === 'string' && s.uid ? s.uid : newId('s')
          if (seen.has(uid)) uid = newId('s')
          seen.add(uid)
          const known = tools && (s.tool === 'metadata' || tools[s.tool])
          const options = known ? cleanOptions(s.tool === 'metadata' ? 'metadata' : tools[s.tool], s.options) : s.options && typeof s.options === 'object' ? s.options : {}
          return { uid, tool: s.tool, options }
        })
      return { id: a.id, name: a.name.slice(0, 80), steps }
    })
  return { list }
}

export const loadSaved = (storage, tools = null) => readStore(storage, tools).list ?? []

// Writes what changed in this tab (prev -> next) onto what is stored now, by
// id, so two tabs never wipe each other: automations this tab did not touch
// keep their stored copy. Returns { ok, reason }.
export function saveChanges(prev, next, storage) {
  try {
    const store = storage ?? globalThis.localStorage
    const cur = readStore(store)
    if (cur.reason === 'blocked' || cur.reason === 'newer') return { ok: false, reason: cur.reason }
    if (cur.reason === 'corrupt') store.setItem(`${STORE_KEY}-unreadable`, cur.raw)
    const before = new Map(prev.map((a) => [a.id, a]))
    const kept = new Set(next.map((a) => a.id))
    const list = (cur.list ?? []).filter((a) => kept.has(a.id) || !before.has(a.id))
    for (const a of next) {
      if (before.has(a.id) && sameStored(before.get(a.id), a)) continue
      const i = list.findIndex((x) => x.id === a.id)
      if (i >= 0) list[i] = storable(a)
      else list.push(storable(a))
    }
    store.setItem(STORE_KEY, JSON.stringify({ v: STORE_VERSION, list: list.map(storable) }))
    return { ok: true }
  } catch {
    return { ok: false, reason: 'blocked' }
  }
}

// The stored list wins; a step that stores the same keeps this tab's copy
// (it may hold a typed password).
export function mergeStored(mine, stored) {
  return stored.map((s) => {
    const m = mine.find((x) => x.id === s.id)
    if (!m) return s
    const steps = s.steps.map((st) => {
      const ms = m.steps.find((x) => x.uid === st.uid)
      return ms && JSON.stringify(storableStep(ms)) === JSON.stringify(storableStep(st)) ? ms : st
    })
    return { ...s, steps }
  })
}

// The options a tool's own run() and summary() get for a step.
export function toolOptions(tool, step, files) {
  const o = { ...(tool.defaults ?? {}), ...(step.options ?? {}) }
  if (step.tool === 'rotate') return { ...o, perFile: {} }
  if (step.tool === 'removeblank') return { ...o, found: {}, keep: {}, saveRemoved: false }
  if (step.tool === 'metadata') {
    const m = { ...METADATA_STEP, ...(step.options ?? {}) }
    const edits = {}
    const dirty = {}
    for (const f of files) {
      edits[f.id] = m.mode === 'set' ? { info: { ...m.info }, custom: [], deleteAll: false } : { info: {}, custom: [], deleteAll: true }
      dirty[f.id] = true
    }
    return { edits, dirty, fileId: null }
  }
  return o
}

const named = (fields) => Object.fromEntries(Object.entries(fields ?? {}).filter(([, v]) => String(v ?? '').trim()))

// Metadata "set" keeps the fields it does not change: read them first.
async function prepareOptions(tool, step, file, ctx) {
  const o = toolOptions(tool, step, [file])
  if (step.tool !== 'metadata' || o.edits[file.id].deleteAll) return o
  const before = await ctx.call('doc', 'readMetadata', file.bytes)
  o.edits[file.id] = { info: { ...before.info, ...named(step.options?.info) }, custom: before.custom ?? [], deleteAll: false }
  return o
}

// First problem that stops a run, as one line, or null.
export function stepProblem(steps, files, tools) {
  if (!steps.length) return 'Add at least one step.'
  for (const [i, step] of steps.entries()) {
    const tool = tools[step.tool]
    const at = `Step ${i + 1}`
    if (!tool || !STEP_IDS.includes(step.tool)) return `${at} uses a tool that is not available here. Remove it.`
    const last = lastOnlyProblem(steps, i)
    if (last) return `${at}, ${tool.name}: ${last}`
    if (step.tool === 'metadata' && step.options?.mode === 'set' && !Object.keys(named(step.options.info)).length) {
      return `${at}, ${tool.name}: type at least one field.`
    }
    if (files.length) {
      const s = tool.summary(files, toolOptions(tool, step, files))
      if (!s.ready) return `${at}, ${tool.name}: ${s.line}`
    }
  }
  return null
}

// Steps that change the page count: page ranges in later steps are only
// known when the chain runs.
export const PAGE_CHANGING = ['nup', 'booklet', 'singlepage', 'removeblank']

// Why a last-only step cannot sit at index i, or null.
export function lastOnlyProblem(steps, i) {
  const id = steps[i].tool
  if (!LAST_ONLY[id] || i === steps.length - 1) return null
  if (id === 'permissions' && steps.slice(i + 1).some((s) => s.tool === 'protect')) {
    return 'Protect after it replaces these restrictions. Remove this step and set the restrictions in Protect, Advanced mode.'
  }
  return `Move it to the end: ${LAST_ONLY[id]}.`
}

// A step's output that is the same file: a "kept the original" or byte-equal copy.
const NO_CHANGE = /unchanged|nothing (found )?to (remove|flatten|change)|kept the original|already optimized|already smaller/i
function sameBytes(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export const isCancel = (err) => !!(err?.cancelled || err?.name === 'AbortError')

const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '') || 'automated'

const baseOf = (name) => String(name ?? 'file').replace(/\.pdf$/i, '')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const short = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s)

// Runs `automation` on every file. ctx is the shell's job ctx. tools: id ->
// tool. assertValid(bytes) -> { pageCount } checks each step's output, so a
// broken file is blamed on the step that made it.
// Returns { outputs, view }; throws when no file came through.
export async function runAutomation(files, automation, ctx, { tools, assertValid }) {
  const steps = automation.steps
  const problem = stepProblem(steps, [], tools)
  if (problem) throw new Error(problem)
  const F = files.length
  const S = steps.length
  const outputs = []
  const report = []

  for (const [fi, f] of files.entries()) {
    ctx.check()
    let cur = f
    const log = []
    let failed = null
    for (const [si, step] of steps.entries()) {
      ctx.check()
      const tool = tools[step.tool]
      const label = `File ${fi + 1} of ${F}, step ${si + 1} of ${S}: ${tool.name}`
      // percent of all file steps, like OCR's own bar
      const at = (frac) => ctx.progress(Math.floor((100 * (fi * S + si + Math.min(Math.max(frac, 0), 0.99))) / (F * S)), 100, label)
      at(0)
      const t0 = performance.now()
      try {
        const opts = await prepareOptions(tool, step, cur, ctx)
        const ready = tool.summary([cur], opts)
        if (!ready.ready) {
          // ranges set for the original file may not fit after an earlier step
          const now = cur.pageCount !== f.pageCount ? ` After the earlier steps ${f.name} has ${plural(cur.pageCount, 'page')}, not ${f.pageCount}.` : ''
          throw new Error(`${ready.line}${now}`)
        }
        const sub = {
          signal: ctx.signal,
          check: ctx.check,
          call: ctx.call,
          progress: (done, all) => at(all ? done / all : 0),
        }
        const res = await tool.run([cur], opts, sub)
        const outs = Array.isArray(res) ? res : (res?.outputs ?? [])
        const ms = Math.round(performance.now() - t0)
        if (outs.length === 0) {
          log.push({ tool: tool.name, status: 'skipped', note: 'Nothing to change.', ms })
          continue
        }
        if (outs.length > 1) throw new Error(`made ${outs.length} files, a step must make one.`)
        const out = outs[0]
        if (out.type && out.type !== 'application/pdf') throw new Error('did not make a PDF.')
        const bytes = out.bytes instanceof Uint8Array ? out.bytes : new Uint8Array(out.bytes)
        if (!out.locked && (sameBytes(bytes, cur.bytes) || NO_CHANGE.test(out.note ?? ''))) {
          log.push({ tool: tool.name, status: 'nochange', note: out.note ?? 'The file stayed the same.', ms })
          if (!sameBytes(bytes, cur.bytes)) cur = { ...cur, id: `${f.id}~${si + 1}`, size: bytes.length, bytes, notices: [] }
          continue
        }
        // a locked output (Protect) cannot be opened here; Protect checked it
        const pageCount = out.locked ? (out.pageCount ?? cur.pageCount) : (await assertValid(bytes)).pageCount
        cur = { id: `${f.id}~${si + 1}`, name: f.name, size: bytes.length, pageCount, type: 'application/pdf', bytes, notices: [], locked: !!out.locked }
        log.push({ tool: tool.name, status: 'done', note: out.note ?? null, ms: Math.round(performance.now() - t0) })
      } catch (err) {
        if (isCancel(err) || ctx.signal?.aborted) throw err
        const message = String(err?.message ?? err)
        const ms = Math.round(performance.now() - t0)
        if (NOTHING[step.tool]?.test(message)) {
          log.push({ tool: tool.name, status: 'skipped', note: message, ms })
          continue
        }
        failed = { step: si + 1, tool: tool.name, message }
        log.push({ tool: tool.name, status: 'failed', note: message, ms })
        break
      }
    }
    const done = log.filter((l) => l.status === 'done').length
    if (failed) {
      report.push({ name: f.name, status: 'failed', failed, log })
      continue
    }
    if (cur === f || done === 0) {
      report.push({ name: f.name, status: 'unchanged', log })
      continue
    }
    const skipped = log.filter((l) => l.status === 'skipped')
    const same = log.filter((l) => l.status === 'nochange')
    const parts = [done === S ? `All ${plural(S, 'step')} changed the file.` : `${done} of ${plural(S, 'step')} changed the file.`]
    if (same.length) parts.push(`No change: ${same.map((l) => l.tool).join(', ')}.`)
    if (skipped.length) parts.push(`Skipped: ${skipped.map((l) => `${l.tool} (${short(l.note, 60)})`).join(', ')}.`)
    const note = parts.join(' ')
    outputs.push({
      name: `${baseOf(f.name)}-${slug(automation.name)}.pdf`,
      bytes: cur.bytes,
      parentIds: [f.id],
      before: f.bytes.byteLength,
      note,
      ...(cur.locked ? { locked: true, pageCount: cur.pageCount } : {}),
    })
    report.push({ name: f.name, status: 'done', log })
  }
  ctx.progress(100, 100, 'Done')

  const failures = report.filter((r) => r.status === 'failed')
  if (outputs.length === 0 && failures.length) {
    const line = (r) => `${r.name}: step ${r.failed.step} of ${S}, ${r.failed.tool}: ${r.failed.message}`
    throw new Error(failures.length === 1 && F === 1 ? line(failures[0]) : `No file came through. ${failures.map(line).join(' ')}`)
  }
  // the report sits below the result: name the stopped files where they are seen first
  if (failures.length && outputs.length) {
    const who = failures.length === 1 ? `${failures[0].name} stopped at step ${failures[0].failed.step}, ${failures[0].failed.tool}` : `${failures.length} files stopped`
    outputs[0].note = `${outputs[0].note} Not done: ${who}. See the report below.`
  }
  return { outputs, view: { name: automation.name, steps: steps.map((s) => tools[s.tool].name), files: report } }
}
