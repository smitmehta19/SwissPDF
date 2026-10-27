// Password protection + restriction handling via MuPDF (real AES, in-browser).
let mupdfPromise = null
function getMupdf() {
  if (!mupdfPromise) mupdfPromise = import('mupdf')
  return mupdfPromise
}

const PERMS = ['print', 'print-hq', 'copy', 'edit', 'annotate', 'form', 'assemble']
const PERM_LABEL = {
  print: 'printing',
  'print-hq': 'high-quality printing',
  copy: 'copying text',
  edit: 'editing',
  annotate: 'annotating',
  form: 'filling forms',
  assemble: 'reordering pages',
  accessibility: 'text for accessibility tools',
}

// PDF /P bits (ISO 32000 table 22). Bits 1-2 must be 0, the rest default to 1.
export const PERMISSION_BITS = {
  print: 1 << 2,
  edit: 1 << 3,
  copy: 1 << 4,
  annotate: 1 << 5,
  form: 1 << 8,
  accessibility: 1 << 9,
  assemble: 1 << 10,
  'print-hq': 1 << 11,
}

// /P value with the given permissions taken away, as a signed 32-bit int.
export function permissionValue(deny = []) {
  let p = -4
  for (const k of deny) {
    if (!(k in PERMISSION_BITS)) throw new Error(`Unknown permission ${k}`)
    p &= ~PERMISSION_BITS[k]
  }
  // no printing also means no high-quality printing
  if (deny.includes('print')) p &= ~PERMISSION_BITS['print-hq']
  return p
}

// SASLprep (RFC 4013) as PDF 2.0 asks for AES-256 R6 passwords: non-ASCII
// spaces become a space, "mapped to nothing" characters go, then NFKC.
export function saslPrep(pw) {
  return String(pw ?? '')
    .replace(/[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/[\u00ad\u034f\u1806\u180b-\u180d\u200c\u200d\u2060\ufe00-\ufe0f\ufeff]/g, '')
    .normalize('NFKC')
}

// The forms of a typed password worth trying, most literal first.
export function passwordCandidates(pw) {
  const raw = String(pw ?? '')
  return [...new Set([raw, saslPrep(raw), raw.normalize('NFC'), raw.normalize('NFKC')])]
}

// A character for an error message: invisible and look-alike ones by name
// and code ("soft hyphen (U+00AD)"), others quoted with their code.
const CHAR_NAMES = {
  '\u00a0': 'non-breaking space',
  '\u00ad': 'soft hyphen',
  '\u034f': 'combining grapheme joiner',
  '\u200b': 'zero-width space',
  '\u200c': 'zero-width non-joiner',
  '\u200d': 'zero-width joiner',
  '\u2060': 'word joiner',
  '\ufeff': 'zero-width no-break space',
}
export function charLabel(c) {
  const code = `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`
  if (CHAR_NAMES[c]) return `${CHAR_NAMES[c]} (${code})`
  if (/\p{M}/u.test(c)) return `combining mark (${code})`
  if (/\p{Z}/u.test(c)) return `special space (${code})`
  if (/[\p{Cf}\p{Cc}]/u.test(c)) return `hidden character (${code})`
  return `"${c}" (${code})`
}

// MuPDF splits its option string on commas, so a comma would silently change
// the password. Returns an error message or null.
//
// AES-128 and RC4-40 store the password in PDFDocEncoding: MuPDF silently
// drops anything else, so the file would open with a shorter password and
// pdf.js would refuse the typed one. Only printable Latin-1 is safe there.
// AES-256 (PDF 2.0) readers SASLprep the typed password (pypdf, Acrobat) and
// pdf.js does not, so a password that SASLprep changes only opens in some
// readers: refuse it too.
const LATIN1_SAFE = /^[\x20-\x7e\xa1-\xac\xae-\xff]*$/
export function passwordProblem(pw, keyLength = 256) {
  if (!pw) return null
  if (pw.includes(',')) return 'Passwords cannot contain a comma.'
  if (keyLength !== 256 && !LATIN1_SAFE.test(pw)) {
    const bad = [...pw].find((c) => !LATIN1_SAFE.test(c))
    return `${keyLength === 40 ? 'RC4 40-bit' : 'AES 128-bit'} only takes Latin letters, digits and common symbols, not this one: ${charLabel(bad)}. Choose AES 256-bit for this password.`
  }
  if (keyLength === 256 && saslPrep(pw) !== pw) {
    // the first character SASLprep changes; an accent typed as its own mark
    // only changes together with its letter
    const chars = [...pw]
    const bad = chars.find((c) => saslPrep(c) !== c) ?? chars.find((c) => /\p{M}/u.test(c)) ?? chars.find((c) => c > '\x7e')
    return `This password has a character PDF apps read in different ways${bad ? `: ${charLabel(bad)}` : ''}. Type it with plain characters.`
  }
  return null
}

function open(mupdf, bytes) {
  return mupdf.Document.openDocument(new Uint8Array(bytes.slice(0)), 'application/pdf')
}

// Key length -> MuPDF encryption method. 128 is AES like PDFBox does it; 40
// is the old RC4 for very old readers.
export const KEY_METHODS = { 256: 'aes-256', 128: 'aes-128', 40: 'rc4-40' }

// Encrypts (AES-256 unless keyLength says otherwise). The user password opens
// the file (may be empty for a file that opens freely but keeps its
// restrictions); the owner password (same as the user one unless given) lifts
// the restrictions. `deny` lists permissions to take away (keys of
// PERMISSION_BITS). The result is re-opened and checked with the typed
// passwords before it is returned.
export async function protectPdf(bytes, userPassword, ownerPassword = null, { deny = [], keyLength = 256 } = {}) {
  const method = KEY_METHODS[keyLength]
  if (!method) throw new Error(`Unknown key length ${keyLength}`)
  const user = userPassword ?? ''
  const owner = ownerPassword || user
  if (!user && !owner) throw new Error('A password is required.')
  if (!user && deny.length === 0) throw new Error('Set an open password, or choose at least one restriction.')
  for (const p of [user, owner]) {
    const problem = passwordProblem(p, keyLength)
    if (problem) throw new Error(problem)
  }
  const mupdf = await getMupdf()
  const doc = open(mupdf, bytes)
  let out
  try {
    if (doc.needsPassword()) throw new Error('Unlock this file first, it already has a password.')
    const opts = [`encrypt=${method}`, `user-password=${user}`, `owner-password=${owner}`]
    if (deny.length) opts.push(`permissions=${permissionValue(deny)}`)
    out = doc.saveToBuffer(opts.join(',')).asUint8Array().slice()
  } finally {
    doc.destroy?.()
  }
  verifyProtected(mupdf, out, { user, owner, deny, cipher: method.startsWith('rc4') ? /RC4/i : /AES/i })
  return out
}

function verifyProtected(mupdf, out, { user, owner, deny, cipher }) {
  const check = open(mupdf, out)
  try {
    const enc = check.getMetaData('encryption') ?? 'None'
    if (!cipher.test(enc)) throw new Error(`the file is not encrypted as asked (${enc})`)
    if (user) {
      if (!check.needsPassword()) throw new Error('it opens without the password')
      if (!(check.authenticatePassword(user) > 0)) throw new Error('the password does not open it')
    } else if (check.needsPassword()) {
      throw new Error('it asks for a password it should not need')
    }
    // 40-bit RC4 (revision 2) only knows print, edit, copy and annotate
    const known = cipher.source === 'RC4' ? ['print', 'edit', 'copy', 'annotate'] : PERMS
    for (const p of deny) {
      if (p !== 'accessibility' && known.includes(p) && check.hasPermission(p) && !(user && user === owner)) {
        throw new Error(`${PERM_LABEL[p]} is still allowed`)
      }
    }
  } catch (err) {
    throw new Error(`Could not verify the protected file: ${err.message}.`)
  } finally {
    check.destroy?.()
  }
  // the owner password must also open it
  if (owner !== user) {
    const o = open(mupdf, out)
    try {
      if (!(o.authenticatePassword(owner) & 4)) throw new Error('Could not verify the protected file: the owner password does not work.')
    } finally {
      o.destroy?.()
    }
  }
}

// Inspects a PDF's security WITHOUT modifying it. Distinguishes the two very
// different cases:
//   - needsUserPassword: won't even open without a password (must know it)
//   - restrictedOnly: opens fine but blocks printing/copying/editing, the
//     "prints with an error" case, removable with NO password
export async function inspectPdf(bytes) {
  const mupdf = await getMupdf()
  let doc
  try {
    doc = open(mupdf, bytes)
  } catch {
    return { valid: false }
  }
  try {
    if (doc.needsPassword()) {
      return { valid: true, needsUserPassword: true, restrictedOnly: false, denied: [], encryption: null }
    }
    const encryption = doc.getMetaData('encryption') ?? 'None'
    const denied = deniedPerms(doc)
    const encrypted = encryption && encryption !== 'None'
    return {
      valid: true,
      needsUserPassword: false,
      restrictedOnly: encrypted || denied.length > 0,
      denied,
      deniedLabels: denied.map((p) => PERM_LABEL[p] ?? p),
      encryption: encrypted ? encryption : null,
    }
  } finally {
    doc.destroy?.()
  }
}

function deniedPerms(doc) {
  return PERMS.filter((p) => {
    try {
      return !doc.hasPermission(p)
    } catch {
      return false
    }
  })
}

// Removes protection/restrictions. For open-password files the correct password
// is required (tried as typed, then SASLprep / NFC / NFKC forms); for
// restriction-only files no password is needed. `fast` skips garbage collection
// and recompression (intake only needs the decrypted file). An owner-only file
// with no open password also takes the fast path: decrypting is all it needs.
export async function unlockPdf(bytes, password = '', { fast = false } = {}) {
  const mupdf = await getMupdf()
  const doc = open(mupdf, bytes)
  try {
    const neededPassword = doc.needsPassword()
    if (neededPassword) {
      const ok = passwordCandidates(password).some((pw) => doc.authenticatePassword(pw) > 0)
      if (!ok) throw new Error('Wrong password, the file stays locked.')
    }
    const before = deniedPerms(doc)
    const quick = fast || !neededPassword
    const out = doc.saveToBuffer(quick ? 'encrypt=none' : 'encrypt=none,garbage,compress').asUint8Array().slice()
    return {
      bytes: out,
      hadUserPassword: neededPassword,
      removedRestrictions: before.map((p) => PERM_LABEL[p] ?? p),
    }
  } finally {
    doc.destroy?.()
  }
}

// Back-compat helper used by the shared file intake.
export async function isPasswordProtected(bytes) {
  const mupdf = await getMupdf()
  let doc
  try {
    doc = open(mupdf, bytes)
    return doc.needsPassword()
  } catch {
    return false
  } finally {
    doc?.destroy?.()
  }
}
