import { useState } from 'react'
import { Field, Segmented } from '../../app/controls.jsx'
import Icon from '../../components/Icon.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { passwordProblem } from '../../lib/cryptoOps.js'
import './g2.css'

// 40-bit RC4 (revision 2) can only carry these restrictions
const RC4_KEYS = ['print', 'edit', 'copy', 'annotate']

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Restrictions in the Advanced mode, as PDF permission keys (cryptoOps.js).
const RESTRICTIONS = [
  ['print', 'Block printing'],
  ['print-hq', 'Block high-quality printing (draft prints only)'],
  ['edit', 'Block changes to the content'],
  ['copy', 'Block copying text and images'],
  ['annotate', 'Block comments'],
  ['form', 'Block form filling'],
  ['accessibility', 'Block text for accessibility tools'],
  ['assemble', 'Block page assembly (insert, rotate, delete pages)'],
]

export function strengthChecks(pw, repeat) {
  return [
    ['Lowercase and uppercase letters', /[a-z]/.test(pw) && /[A-Z]/.test(pw)],
    ['A number', /\d/.test(pw)],
    ['A special character', /[^A-Za-z0-9]/.test(pw)],
    ['8 or more characters', [...pw].length >= 8],
    ['Both passwords match', pw.length > 0 && pw === repeat],
  ]
}

function Checklist({ pw, repeat }) {
  return (
    <ul className="g2-checklist" aria-label="Password checks" data-testid="pw-checklist">
      {strengthChecks(pw, repeat).map(([label, ok]) => (
        <li key={label} className={ok ? 'is-ok' : ''}>
          <span className="g2-tick" aria-hidden="true">
            {ok ? <Icon name="check" size={12} /> : null}
          </span>
          <span>{label}</span>
          <span className="sr-only">{ok ? ', done' : ', not yet'}</span>
        </li>
      ))}
    </ul>
  )
}

function PasswordField({ label, value, onChange, show, testId, help, autoFocus }) {
  return (
    <Field label={label} help={help}>
      {(id) => (
        <input
          id={id}
          className="input"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          spellCheck={false}
          data-testid={testId}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

// First problem with the typed passwords for the chosen cipher, or null.
const pwProblem = (o) => {
  const pws = o.mode === 'basic' ? [o.password] : [o.openPassword, o.ownerPassword]
  for (const pw of pws) {
    const problem = passwordProblem(pw, o.keyLength ?? 256)
    if (problem) return problem
  }
  return null
}
// Restrictions the chosen cipher can carry.
const denyFor = (o) => ((o.keyLength ?? 256) === 40 ? o.deny.filter((k) => RC4_KEYS.includes(k)) : o.deny)

function Options({ options: o, setOptions }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  const [show, setShow] = useState(false)
  return (
    <>
      <Segmented
        label="Protection mode"
        testId="protect-mode"
        value={o.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'basic', title: 'Basic' },
          { value: 'advanced', title: 'Advanced' },
        ]}
      />
      {o.mode === 'basic' ? (
        <>
          <PasswordField label="Password" value={o.password} onChange={(password) => set({ password })} show={show} testId="pw-input" />
          <PasswordField label="Repeat password" value={o.repeat} onChange={(repeat) => set({ repeat })} show={show} testId="pw-confirm" />
          <Checklist pw={o.password} repeat={o.repeat} />
        </>
      ) : (
        <>
          <PasswordField
            label="Open password (optional)"
            help="Needed to open the file. Leave empty to let anyone open it, with the restrictions below."
            value={o.openPassword}
            onChange={(openPassword) => set({ openPassword })}
            show={show}
            testId="pw-open"
          />
          {o.openPassword && (
            <PasswordField label="Repeat open password" value={o.openRepeat} onChange={(openRepeat) => set({ openRepeat })} show={show} testId="pw-open-confirm" />
          )}
          <PasswordField
            label="Permissions password"
            help="Lifts the restrictions. Keep it different from the open password."
            value={o.ownerPassword}
            onChange={(ownerPassword) => set({ ownerPassword })}
            show={show}
            testId="pw-owner"
          />
          <fieldset className="g2-fieldset">
            <legend className="field-label">Restrictions</legend>
            {RESTRICTIONS.map(([key, label]) => (
              <label key={key} className="check-line">
                <input
                  type="checkbox"
                  data-testid={`deny-${key}`}
                  disabled={o.keyLength === 40 && !RC4_KEYS.includes(key)}
                  checked={o.deny.includes(key) && !(o.keyLength === 40 && !RC4_KEYS.includes(key))}
                  onChange={(e) => set({ deny: e.target.checked ? [...o.deny, key] : o.deny.filter((k) => k !== key) })}
                />
                {label}
              </label>
            ))}
            <p className="field-help">Some PDF apps do not honour these restrictions.</p>
          </fieldset>
        </>
      )}
      <div className="field">
        <span className="field-label">Encryption</span>
        <Segmented
          label="Encryption"
          testId="protect-key"
          value={o.keyLength}
          onChange={(keyLength) => set({ keyLength })}
          options={KEYS.map(([value, title]) => ({ value, title }))}
        />
        <p className="field-help">{KEYS.find(([k]) => k === o.keyLength)?.[2]}</p>
      </div>
      <label className="check-line">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show passwords
      </label>
      {pwProblem(o) && (
        <p className="field-error" role="alert" data-testid="pw-problem">
          {pwProblem(o)}
        </p>
      )}
      <p className="field-help">Without the password nobody can open the file, not even SwissPDF.</p>
    </>
  )
}

// Key lengths as Stirling offers them: [bits, label, help]
const KEYS = [
  [256, 'AES 256-bit', 'Strongest. Opens in every current PDF app.'],
  [128, 'AES 128-bit', 'For older PDF apps, such as Acrobat 7 and 8.'],
  [40, 'RC4 40-bit', 'Weak, for very old PDF apps only. Blocks only printing, changes, copying and comments.'],
]

// Opens the protected bytes in pdf.js: refused without a password, opened
// with the typed one.
async function checkInPdfjs(bytes, password, name) {
  const { pdfjsLib, serializedPdfOp } = await import('../../lib/pdfText.js')
  const open = (pw) =>
    serializedPdfOp(async () => {
      const task = pdfjsLib.getDocument({ data: bytes.slice(), password: pw })
      try {
        await task.promise
        return true
      } catch (err) {
        if (err?.name === 'PasswordException') return false
        throw err
      } finally {
        await task.destroy()
      }
    })
  if (await open(undefined)) throw new Error(`Could not verify ${name}: it opens without the password.`)
  if (!(await open(password))) throw new Error(`Could not verify ${name}: the password does not open it in pdf.js. Choose AES 256-bit.`)
}

// What the run will use, or the reason it cannot run yet.
function plan(o) {
  if (o.mode === 'basic') {
    if (!o.password) return { error: 'Type a password.' }
    if (o.password !== o.repeat) return { error: o.repeat ? 'The passwords do not match.' : 'Repeat the password.' }
    if (pwProblem(o)) return { error: pwProblem(o) }
    return { user: o.password, owner: null, deny: [] }
  }
  if (o.openPassword && o.openPassword !== o.openRepeat) return { error: o.openRepeat ? 'The open passwords do not match.' : 'Repeat the open password.' }
  if (!o.ownerPassword) return { error: 'Type a permissions password.' }
  if (o.ownerPassword === o.openPassword) return { error: 'Use a permissions password that differs from the open password.' }
  if (!o.openPassword && denyFor(o).length === 0) return { error: 'Choose at least one restriction, or set an open password.' }
  if (pwProblem(o)) return { error: pwProblem(o) }
  return { user: o.openPassword, owner: o.ownerPassword, deny: denyFor(o) }
}

export default {
  id: 'protect',
  name: 'Protect',
  io: 'PDF → locked PDF',
  description: 'Password and permissions, up to AES-256.',
  category: 'Security',
  icon: 'lock',
  accepts: { min: 1 },
  defaults: { mode: 'basic', password: '', repeat: '', openPassword: '', openRepeat: '', ownerPassword: '', deny: ['print', 'edit', 'copy'], keyLength: 256 },
  next: ['unlock', 'compress', 'merge'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Protect' }
    const p = plan(o)
    if (p.error) return { ready: false, line: p.error, runLabel: 'Protect' }
    const n = files.length
    const what = p.user ? 'password-protected' : 'restricted'
    return { ready: true, line: `${n} ${what} PDF${n === 1 ? '' : 's'} will be created.`, runLabel: `Protect ${plural(n, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const p = plan(o)
    if (p.error) throw new Error(p.error)
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Encrypting ${f.name}`)
      const bytes = await ctx.call('protect', f.bytes, p.user, p.owner, { deny: p.deny, keyLength: o.keyLength ?? 256 })
      // MuPDF checked it in the worker; pdf.js (Firefox, many viewers) must
      // also open it with exactly the typed password
      if (p.user) await checkInPdfjs(bytes, p.user, f.name)
      const blocked = p.deny.length ? `Blocked: ${RESTRICTIONS.filter(([k]) => p.deny.includes(k)).map(([, l]) => l.replace(/^Block /, '')).join(', ')}.` : ''
      outputs.push({
        name: `${baseName(f.name)}-protected.pdf`,
        bytes,
        parentIds: [f.id],
        // with an open password the workspace keeps it locked, like any locked PDF
        locked: !!p.user,
        pageCount: f.pageCount,
        before: null,
        note: p.user ? `Opens only with the password. Checked by reopening it. ${blocked}`.trim() : `Opens without a password. ${blocked}`,
      })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
