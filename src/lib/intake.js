// Shared intake for every PDF the app accepts. pdf-lib is the fast path; when
// it refuses a file (encryption, damage) MuPDF unlocks or repairs it so the
// tools can work on it, and the user gets a short notice instead of a reject.
import { PDFDocument } from 'pdf-lib'
import { inspectPdf, unlockPdf } from './cryptoOps.js'
import { repairPdf, rewriteOk } from './mupdfOps.js'

export const NOTICE_RESTRICTED = 'Restrictions removed so the file can be edited; results keep them'
export const NOTICE_UNLOCKED = 'Password removed so the file can be edited'
export const NOTICE_REPAIRED = 'File was damaged and has been repaired'
// "2 of 184 pages could not be recovered", "1 page rebuilt as an image"
const lostNotice = (lost, total) => `${lost} of ${total} pages could not be recovered`
const rasterNotice = (n) => `${n} page${n === 1 ? '' : 's'} rebuilt as an image`

let mupdfPromise = null
function getMupdf() {
  if (!mupdfPromise) mupdfPromise = import('mupdf')
  return mupdfPromise
}

function intakeError(code, message, details) {
  const err = new Error(message)
  err.code = code
  err.details = details || message
  return err
}

function causeOf(err) {
  return err?.message || String(err)
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  throw intakeError('UNREADABLE', 'Not a valid PDF', 'Input is not binary data')
}

// The parse every tool does later. A file with no pages counts as a failure.
async function tryPdfLib(bytes) {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    const pageCount = doc.getPageCount()
    if (pageCount < 1) return { error: new Error('No pages found') }
    return { pageCount }
  } catch (error) {
    return { error }
  }
}

// PDF 2.0 (AES-256 R6) passwords go through SASLprep; MuPDF wants the prepared
// form. Map non-ASCII spaces to space, drop "mapped to nothing" chars, NFKC.
function saslPrep(pw) {
  return pw
    .replace(/[   -   　]/g, ' ')
    .replace(/[­͏᠆᠋-᠍​-‍⁠︀-️﻿]/g, '')
    .normalize('NFKC')
}

async function unlockWithPassword(bytes, password) {
  const tries = [...new Set([password, saslPrep(password)])]
  let lastErr = null
  for (const pw of tries) {
    try {
      return (await unlockPdf(bytes, pw, { fast: true })).bytes
    } catch (err) {
      lastErr = err
      if (!/wrong password/i.test(causeOf(err))) break
    }
  }
  if (/wrong password/i.test(causeOf(lastErr))) {
    throw intakeError('WRONG_PASSWORD', 'Wrong password, try again', causeOf(lastErr))
  }
  throw intakeError('UNREADABLE', 'Could not unlock this PDF', causeOf(lastErr))
}

// Plain MuPDF open + save: MuPDF rebuilds a broken xref on open and the
// rewrite keeps outlines, forms and metadata (unlike the per-page graft).
// Returns the bytes and the page count MuPDF saw.
async function mupdfRewrite(bytes) {
  const mupdf = await getMupdf()
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  try {
    if (doc.needsPassword()) throw new Error('File needs a password')
    const pageCount = doc.countPages()
    if (pageCount < 1) throw new Error('No readable pages')
    return { bytes: doc.saveToBuffer('garbage,encrypt=none').asUint8Array().slice(), pageCount }
  } finally {
    doc.destroy?.()
  }
}

// Returns { bytes, pageCount, notices }. Throws Error with err.code
// NEEDS_PASSWORD | WRONG_PASSWORD | UNREADABLE and err.details = real cause.
// A file pdf-lib already accepts comes back as the same bytes, no notice.
export async function normalizePdf(input, { password } = {}) {
  const original = toBytes(input)
  const first = await tryPdfLib(original)
  if (first.pageCount) return { bytes: original, pageCount: first.pageCount, notices: [] }

  const causes = [`pdf-lib: ${causeOf(first.error)}`]
  const notices = []
  let current = original
  // owner-only file: its permission flags, kept for the outputs
  let restrictions = null
  const withRestrictions = (res) => (restrictions ? { ...res, restrictions } : res)

  // pdf-lib may fail on encryption with an unrelated parse error (xref
  // streams), so ask MuPDF whether the file is encrypted at all.
  const info = await inspectPdf(original)
  if (!info.valid) causes.push('MuPDF: cannot open the file')
  if (info.needsUserPassword) {
    if (!password) throw intakeError('NEEDS_PASSWORD', 'This PDF needs a password', 'User password required to open')
    current = await unlockWithPassword(original, password)
    notices.push(NOTICE_UNLOCKED)
  } else if (info.restrictedOnly) {
    try {
      restrictions = await readRestrictions(original)
      current = (await unlockPdf(original, '', { fast: true })).bytes
    } catch (err) {
      throw intakeError('UNREADABLE', 'Could not unlock this PDF', [...causes, `MuPDF: ${causeOf(err)}`].join('; '))
    }
    notices.push(NOTICE_RESTRICTED)
  }
  if (notices.length) {
    const unlocked = await tryPdfLib(current)
    if (unlocked.pageCount) return withRestrictions({ bytes: current, pageCount: unlocked.pageCount, notices })
    causes.push(`pdf-lib after unlock: ${causeOf(unlocked.error)}`)
  }

  // Damaged file: first a plain MuPDF rewrite, then the page-by-page repair.
  let repaired = null
  try {
    repaired = await mupdfRewrite(current)
  } catch (err) {
    causes.push(`MuPDF rewrite: ${causeOf(err)}`)
  }
  // the rewrite counts only when pdf-lib sees every page MuPDF sees (a
  // truncated file can lose a page in it); else the page rebuild below
  if (repaired) {
    if (await rewriteOk(repaired.bytes, repaired.pageCount)) {
      return withRestrictions({ bytes: repaired.bytes, pageCount: repaired.pageCount, notices: [...notices, NOTICE_REPAIRED] })
    }
    const check = await tryPdfLib(repaired.bytes)
    causes.push(`pdf-lib after rewrite: ${check.pageCount ? `${check.pageCount} of ${repaired.pageCount} pages` : causeOf(check.error)}`)
  }

  try {
    const result = await repairPdf(current)
    const out = result.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result.bytes)
    const check = await tryPdfLib(out)
    if (check.pageCount) {
      const more = []
      if (result.lost) more.push(lostNotice(result.lost, result.pageCount))
      if (result.rasterized) more.push(rasterNotice(result.rasterized))
      return withRestrictions({ bytes: out, pageCount: check.pageCount, notices: [...notices, NOTICE_REPAIRED, ...more] })
    }
    causes.push(`pdf-lib after repair: ${causeOf(check.error)}`)
  } catch (err) {
    causes.push(`MuPDF repair: ${causeOf(err)}`)
  }

  throw intakeError('UNREADABLE', 'Not a valid PDF', causes.join('; '))
}

// Restricted (owner-only) inputs keep their restrictions on the results. The
// tools work on the decrypted file; after the run every PDF made from it is
// encrypted again with the same permission flags, no open password and a
// random owner password nobody knows (decision 2026-10-27).
export const NOTE_KEPT_RESTRICTIONS = 'Kept the original restrictions.'
// these set or lift restrictions themselves
const OWN_RESTRICTIONS = new Set(['protect', 'unlock', 'permissions'])
const PRINT = 1 << 2
const PRINT_HQ = 1 << 11
// fill forms, accessibility, assemble: only defined from revision 3 on
const R3_BITS = (1 << 8) | (1 << 9) | (1 << 10)
// every permission bit of /P (print, edit, copy, annotate, forms,
// accessibility, assemble, high-quality print)
const PERMISSION_MASK = 0xf3c

// MuPDF reads numbers as 32-bit floats: parse the text instead
const intOf = (obj) => (obj && !obj.isNull() ? parseInt(obj.toString(), 10) : NaN)

// Steps of the chain an Automate run uses (same rule as currentOf in
// automate.jsx): the picked saved chain, else the picked template with this
// session's edits.
async function automateSteps(o = {}) {
  const mine = o.mine?.find((a) => a.id === o.pick)
  if (mine) return mine.steps ?? []
  const { TEMPLATES } = await import('./automate.js')
  const t = TEMPLATES.find((x) => x.id === o.pick) ?? TEMPLATES[0]
  return o.drafts?.[t?.id] ?? t?.steps ?? []
}

// Standalone Protect / Unlock / Permissions get their input as it is and set
// the flags themselves.
const ownsRestrictions = (toolId) => OWN_RESTRICTIONS.has(toolId)

// No restrictions put back: those tools, or an Automate chain that has one of
// them as a step (its steps always get the decrypted file).
async function dropsRestrictions(toolId, options) {
  if (ownsRestrictions(toolId)) return true
  if (toolId !== 'automate') return false
  return (await automateSteps(options)).some((s) => OWN_RESTRICTIONS.has(s.tool))
}

// Cheap test before MuPDF: an encrypted file names /Encrypt in its trailer
// (never inside a compressed object).
const ENCRYPT = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]
function mentionsEncrypt(b) {
  for (let i = b.indexOf(0x2f); i >= 0 && i <= b.length - 8; i = b.indexOf(0x2f, i + 1)) {
    let k = 1
    while (k < 8 && b[i + k] === ENCRYPT[k]) k++
    if (k === 8) return true
  }
  return false
}

// { permissions } (/P as a signed 32-bit int) of a file that opens without a
// password but restricts something; null otherwise.
export async function readRestrictions(bytes) {
  try {
    const mupdf = await getMupdf()
    const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
    try {
      if (doc.needsPassword()) return null
      const enc = doc.getTrailer().get('Encrypt')
      if (!enc || enc.isNull()) return null
      let p = intOf(enc.get('P'))
      if (!Number.isFinite(p)) return null
      p |= 0
      // revision 2 only knows print, edit, copy and annotate
      if (!(intOf(enc.get('R')) >= 3)) {
        p |= R3_BITS
        p = p & PRINT ? p | PRINT_HQ : p & ~PRINT_HQ
      }
      if ((p & PERMISSION_MASK) === PERMISSION_MASK) return null
      return { permissions: p }
    } finally {
      doc.destroy?.()
    }
  } catch {
    return null
  }
}

function randomPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Encrypts with the given /P (AES-256, no open password, random owner
// password). Checked by reopening: opens freely, same pages, same flags.
export async function applyRestrictions(bytes, permissions) {
  const mupdf = await getMupdf()
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  let out
  let pages
  try {
    if (doc.needsPassword()) throw new Error('the result needs a password')
    pages = doc.countPages()
    const opts = ['encrypt=aes-256', 'user-password=', `owner-password=${randomPassword()}`, `permissions=${permissions | 0}`]
    // as compact as the tool's own save (Split sized its parts on that):
    // object streams, no loose objects. Fresh document, nothing resolved,
    // so compact is safe here. A plain save if MuPDF refuses.
    try {
      out = doc.saveToBuffer(['garbage=compact', 'compress', 'objstms', ...opts].join(',')).asUint8Array().slice()
    } catch {
      out = doc.saveToBuffer(opts.join(',')).asUint8Array().slice()
    }
  } finally {
    doc.destroy?.()
  }
  const check = mupdf.Document.openDocument(out, 'application/pdf')
  try {
    if (check.needsPassword()) throw new Error('it asks for a password')
    if (check.countPages() !== pages) throw new Error('pages changed')
    const enc = check.getTrailer().get('Encrypt')
    const got = enc && !enc.isNull() ? intOf(enc.get('P')) | 0 : NaN
    if ((got & PERMISSION_MASK) !== (permissions & PERMISSION_MASK)) throw new Error('the permissions differ')
  } catch (err) {
    throw new Error(`Could not keep the original restrictions: ${err.message}.`)
  } finally {
    check.destroy?.()
  }
  return out
}

// Before a run. inputs: the shell's run files ({ id, bytes, type, locked,
// restrictions? }). An input still encrypted owner-only (a restriction-only
// Protect result, or a result that kept its restrictions) is decrypted for
// the tool and gets its restrictions attached. Returns a new list.
export async function prepareRestricted(toolId, inputs, options = {}) {
  if (ownsRestrictions(toolId)) return inputs
  const out = []
  for (const f of inputs) {
    const pdf = !f.type || f.type === 'application/pdf'
    if (!pdf || f.locked || f.restrictions || !(f.bytes instanceof Uint8Array) || !mentionsEncrypt(f.bytes)) {
      out.push(f)
      continue
    }
    const restrictions = await readRestrictions(f.bytes)
    out.push(restrictions ? { ...f, bytes: (await unlockPdf(f.bytes, '', { fast: true })).bytes, restrictions } : f)
  }
  return out
}

// After a run. outputs: the tool's outputs ({ bytes, parentIds, type?,
// locked?, note? }), changed in place: a PDF made from a restricted input
// gets its flags back (made from several: every restriction of any of them)
// and the note says so. Returns how many outputs were restricted.
export async function keepRestrictions(toolId, outputs, inputs, options = {}) {
  if (await dropsRestrictions(toolId, options)) return 0
  const perms = new Map(inputs.filter((f) => f.restrictions).map((f) => [f.id, f.restrictions.permissions]))
  if (!perms.size) return 0
  let n = 0
  for (const out of outputs) {
    if (out.type || out.locked || !out.bytes) continue
    const parents = out.parentIds?.length ? out.parentIds : inputs.map((f) => f.id)
    const own = parents.filter((id) => perms.has(id)).map((id) => perms.get(id))
    if (!own.length) continue
    out.bytes = await applyRestrictions(out.bytes, own.reduce((a, b) => a & b))
    out.note = [out.note, NOTE_KEPT_RESTRICTIONS].filter(Boolean).join(' ')
    n++
  }
  return n
}
