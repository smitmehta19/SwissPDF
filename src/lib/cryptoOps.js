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
  const mupdf = await getMupdf()
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes.slice(0)), 'application/pdf')
  const opts = [
    'encrypt=aes-256',
    `user-password=${userPassword}`,
    `owner-password=${ownerPassword || userPassword}`,
  ].join(',')
  return doc.saveToBuffer(opts).asUint8Array().slice()
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
  const needsUserPassword = doc.needsPassword()
  if (needsUserPassword) {
    return { valid: true, needsUserPassword: true, restrictedOnly: false, denied: [], encryption: null }
  }
  const encryption = doc.getMetaData('encryption') ?? 'None'
  const denied = PERMS.filter((p) => {
    try {
      return !doc.hasPermission(p)
    } catch {
      return false
    }
  })
  const encrypted = encryption && encryption !== 'None'
  return {
    valid: true,
    needsUserPassword: false,
    restrictedOnly: encrypted || denied.length > 0,
    denied,
    deniedLabels: denied.map((p) => PERM_LABEL[p] ?? p),
    encryption: encrypted ? encryption : null,
  }
}

// Removes protection/restrictions. For open-password files the correct password
// is required; for restriction-only files no password is needed.
export async function unlockPdf(bytes, password = '') {
  const mupdf = await getMupdf()
  const doc = mupdf.Document.openDocument(new Uint8Array(bytes.slice(0)), 'application/pdf')
  const neededPassword = doc.needsPassword()
  if (neededPassword) {
    const ok = doc.authenticatePassword(password ?? '')
    if (!ok) throw new Error('Wrong password — the file stays locked.')
  }
  const before = PERMS.filter((p) => {
    try {
      return !doc.hasPermission(p)
    } catch {
      return false
    }
  })
  const out = doc.saveToBuffer('encrypt=none,garbage,compress').asUint8Array().slice()
  return {
    bytes: out,
    hadUserPassword: neededPassword,
    removedRestrictions: before.map((p) => PERM_LABEL[p] ?? p),
  }
}

// Back-compat helper used by the shared file intake.
export async function isPasswordProtected(bytes) {
  const mupdf = await getMupdf()
  try {
    const doc = mupdf.Document.openDocument(new Uint8Array(bytes.slice(0)), 'application/pdf')
    return doc.needsPassword()
  } catch {
    return false
  }
}
