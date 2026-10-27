import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { NOTICE_RESTRICTED, NOTICE_UNLOCKED } from '../../lib/intake.js'
import './g2.css'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const isLocked = (f) => f.status === 'locked' || f.locked
// The workspace already took the protection off when the file was added.
const unlockedOnAdd = (f) => (f.notices ?? []).some((n) => n === NOTICE_UNLOCKED || n === NOTICE_RESTRICTED)

function passwordFor(o, f) {
  return o.same ? o.shared : (o.passwords[f.id] ?? '')
}

function Options({ options: o, setOptions, files }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  const [show, setShow] = useState(false)
  const locked = files.filter(isLocked)
  const type = show ? 'text' : 'password'
  return (
    <>
      {locked.length > 1 && (
        <label className="check-line">
          <input type="checkbox" data-testid="unlock-same" checked={o.same} onChange={(e) => set({ same: e.target.checked })} />
          Same password for all files
        </label>
      )}
      {locked.length > 0 && o.same && locked.length > 1 && (
        <div className="field">
          <label className="field-label" htmlFor="unlock-shared">
            Password for {plural(locked.length, 'file')}
          </label>
          <input
            id="unlock-shared"
            className="input"
            type={type}
            autoComplete="off"
            spellCheck={false}
            data-testid="unlock-pw"
            value={o.shared}
            onChange={(e) => set({ shared: e.target.value })}
          />
        </div>
      )}
      {files.length > 0 && (
        <ul className="g2-filelist" aria-label="Selected files">
          {files.map((f) => {
            const needs = isLocked(f)
            return (
              <li key={f.id} data-testid="unlock-file">
                <span className="g2-fileicon" aria-hidden="true">
                  <Icon name={needs ? 'lock' : 'unlock'} size={15} />
                </span>
                <span className="g2-filename" title={f.name}>
                  {f.name}
                </span>
                {needs && !(o.same && locked.length > 1) ? (
                  <input
                    className="input input-small"
                    type={type}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={`Password for ${f.name}`}
                    placeholder="Password"
                    data-testid="unlock-file-pw"
                    value={o.passwords[f.id] ?? ''}
                    onChange={(e) => set({ passwords: { ...o.passwords, [f.id]: e.target.value } })}
                  />
                ) : (
                  <span className="g2-filestate">
                    {needs ? 'Uses the password above' : unlockedOnAdd(f) ? 'Already unlocked when added' : 'No password needed'}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {locked.length > 0 && (
        <label className="check-line">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show passwords
        </label>
      )}
      <p className="field-help">Removes the open password you type and any printing, copying or editing restrictions. Restrictions need no password.</p>
    </>
  )
}

export default {
  id: 'unlock',
  name: 'Unlock',
  io: 'locked PDF → PDF',
  description: 'Remove a password you know, or restrictions.',
  category: 'Security',
  icon: 'unlock',
  accepts: { min: 1, locked: true },
  defaults: { same: true, shared: '', passwords: {} },
  next: ['compress', 'merge', 'edit', 'protect'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Unlock' }
    const locked = files.filter(isLocked)
    const missing = locked.filter((f) => !passwordFor({ ...o, same: o.same && locked.length > 1 }, f))
    if (missing.length) {
      return { ready: false, line: `Type the password for ${missing.length === 1 ? missing[0].name : plural(missing.length, 'file')}.`, runLabel: 'Unlock' }
    }
    const n = files.length
    return { ready: true, line: `${n} unlocked PDF${n === 1 ? '' : 's'} will be created. Files that are not protected are left out.`, runLabel: `Unlock ${plural(n, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const locked = files.filter(isLocked)
    const opts = { ...o, same: o.same && locked.length > 1 }
    const outputs = []
    const plain = []
    const wrong = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Unlocking ${f.name}`)
      const name = `${baseName(f.name)}-unlocked.pdf`
      if (isLocked(f)) {
        let res
        try {
          res = await ctx.call('unlock', f.bytes, passwordFor(opts, f))
        } catch (err) {
          // a wrong password stops only that file
          if (/wrong password/i.test(err.message)) {
            wrong.push(f.name)
            continue
          }
          throw err
        }
        const removed = res.removedRestrictions.length ? ` Also lifted: ${res.removedRestrictions.join(', ')}.` : ''
        outputs.push({ name, bytes: res.bytes, parentIds: [f.id], note: `Password removed.${removed}` })
        continue
      }
      const info = await ctx.call('inspect', f.bytes)
      if (info.valid && (info.restrictedOnly || info.encryption)) {
        const res = await ctx.call('unlock', f.bytes, '')
        const what = res.removedRestrictions.length ? `Restrictions removed: ${res.removedRestrictions.join(', ')}.` : 'Encryption removed.'
        outputs.push({ name, bytes: res.bytes, parentIds: [f.id], note: what })
      } else if (unlockedOnAdd(f)) {
        outputs.push({ name, bytes: f.bytes.slice(), parentIds: [f.id], note: 'Its protection was already removed when it was added.' })
      } else {
        plain.push(f.name)
      }
    }
    const wrongLine = wrong.length ? `Wrong password for ${wrong.join(', ')}: ${wrong.length === 1 ? 'it stays' : 'they stay'} locked.` : ''
    if (outputs.length === 0) {
      if (wrong.length) throw new Error(`${wrongLine} Nothing was changed.`)
      throw new Error(files.length === 1 ? `${files[0].name} is not protected, there is nothing to unlock.` : 'None of the selected files is protected.')
    }
    if (plain.length) outputs[outputs.length - 1].note += ` Not protected, left out: ${plain.join(', ')}.`
    if (wrongLine) outputs[outputs.length - 1].note += ` ${wrongLine}`
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
