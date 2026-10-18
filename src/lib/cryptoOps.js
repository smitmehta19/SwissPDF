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
}

// AES-256 encrypt. The user password opens the file; the owner password (same
// one unless provided) also lifts edit/print restrictions.
export async function protectPdf(bytes, userPassword, ownerPassword = null) {
  if (!userPassword) throw new Error('A password is required.')
  // MuPDF splits its option string on commas, so a comma would silently change the password.
  if ([userPassword, ownerPassword].some((p) => p && p.includes(',')))
    throw new Error('Passwords cannot contain a comma.')
  const mupdf = await getMupdf()
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes.slice(0)), 'application/pdf')
  let out
  try {
    const opts = [
      'encrypt=aes-256',
      `user-password=${userPassword}`,
      `owner-password=${ownerPassword || userPassword}`,
    ].join(',')
    out = doc.saveToBuffer(opts).asUint8Array().slice()
  } finally {
    doc.destroy?.()
  }
  // Re-open with the typed password before handing the file over.
  const check = mupdf.Document.openDocument(out.slice(0), 'application/pdf')
  let ok
  try {
    ok = !check.needsPassword() || check.authenticatePassword(userPassword) > 0
  } finally {
    check.destroy?.()
  }
  if (!ok) throw new Error('Could not verify the password on the protected file.')
  return out
}

// Inspects a PDF's security WITHOUT modifying it. Distinguishes the two very
// different cases:
//   - needsUserPassword: won't even open without a password (must know it)
//   - restrictedOnly: opens fine but blocks printing/copying/editing — the
//     "prints with an error" case, removable with NO password
export async function inspectPdf(bytes) {
  const mupdf = await getMupdf()
  let doc
  try {
    doc = mupdf.Document.openDocument(new Uint8Array(bytes.slice(0)), 'application/pdf')
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
// is required; for restriction-only files no password is needed. `fast` skips
// garbage collection and recompression (intake only needs the decrypted file).
export async function unlockPdf(bytes, password = '', { fast = false } = {}) {
  const mupdf = await getMupdf()
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes.slice(0)), 'application/pdf')
  try {
    const neededPassword = doc.needsPassword()
    if (neededPassword) {
      const ok = doc.authenticatePassword(password ?? '')
      if (!ok) throw new Error('Wrong password, the file stays locked.')
    }
    const before = deniedPerms(doc)
    const out = doc.saveToBuffer(fast ? 'encrypt=none' : 'encrypt=none,garbage,compress').asUint8Array().slice()
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
    doc = mupdf.Document.openDocument(new Uint8Array(bytes.slice(0)), 'application/pdf')
    return doc.needsPassword()
  } catch {
    return false
  } finally {
    doc?.destroy?.()
  }
}
