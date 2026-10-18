// Shared intake for every PDF the app accepts. pdf-lib is the fast path; when
// it refuses a file (encryption, damage) MuPDF unlocks or repairs it so the
// tools can work on it, and the user gets a short notice instead of a reject.
import { PDFDocument } from 'pdf-lib'
import { inspectPdf, unlockPdf } from './cryptoOps.js'
import { repairPdf } from './mupdfOps.js'

export const NOTICE_RESTRICTED = 'Restrictions removed so the file can be edited'
export const NOTICE_UNLOCKED = 'Password removed so the file can be edited'
export const NOTICE_REPAIRED = 'File was damaged and has been repaired'

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
async function mupdfRewrite(bytes) {
  const mupdf = await getMupdf()
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes), 'application/pdf')
  try {
    if (doc.needsPassword()) throw new Error('File needs a password')
    if (doc.countPages() < 1) throw new Error('No readable pages')
    return doc.saveToBuffer('garbage,encrypt=none').asUint8Array().slice()
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
      current = (await unlockPdf(original, '', { fast: true })).bytes
    } catch (err) {
      throw intakeError('UNREADABLE', 'Could not unlock this PDF', [...causes, `MuPDF: ${causeOf(err)}`].join('; '))
    }
    notices.push(NOTICE_RESTRICTED)
  }
  if (notices.length) {
    const unlocked = await tryPdfLib(current)
    if (unlocked.pageCount) return { bytes: current, pageCount: unlocked.pageCount, notices }
    causes.push(`pdf-lib after unlock: ${causeOf(unlocked.error)}`)
  }

  // Damaged file: first a plain MuPDF rewrite, then the page-by-page repair.
  let repaired = null
  try {
    repaired = await mupdfRewrite(current)
  } catch (err) {
    causes.push(`MuPDF rewrite: ${causeOf(err)}`)
  }
  if (repaired) {
    const check = await tryPdfLib(repaired)
    if (check.pageCount) {
      return { bytes: repaired, pageCount: check.pageCount, notices: [...notices, NOTICE_REPAIRED] }
    }
    causes.push(`pdf-lib after rewrite: ${causeOf(check.error)}`)
  }

  try {
    const result = await repairPdf(current)
    const out = result.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result.bytes)
    const check = await tryPdfLib(out)
    if (check.pageCount) {
      return { bytes: out, pageCount: check.pageCount, notices: [...notices, NOTICE_REPAIRED] }
    }
    causes.push(`pdf-lib after repair: ${causeOf(check.error)}`)
  } catch (err) {
    causes.push(`MuPDF repair: ${causeOf(err)}`)
  }

  throw intakeError('UNREADABLE', 'Not a valid PDF', causes.join('; '))
}
