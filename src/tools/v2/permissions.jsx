import { baseName } from '../../components/usePdfFiles.js'
import { MAX_PASSWORD_BYTES, PERMISSIONS } from '../../lib/docOps.js'
import { plural } from './structure-shared.jsx'

const pwProblem = (o) => {
  if (!o.owner) return 'Enter an owner password.'
  if (o.owner.includes(',')) return 'The password cannot contain a comma.'
  if (new TextEncoder().encode(o.owner).length > MAX_PASSWORD_BYTES) return `Use at most ${MAX_PASSWORD_BYTES} bytes (about ${MAX_PASSWORD_BYTES} plain letters): longer passwords are cut by the encryption.`
  if (o.owner !== o.confirm) return 'The two passwords do not match.'
  return null
}

function Options({ options: o, setOptions }) {
  const set = (fields) => setOptions((x) => ({ ...x, ...fields }))
  const setAllow = (k, v) => setOptions((x) => ({ ...x, allow: { ...x.allow, [k]: v, ...(k === 'print' && !v ? { 'print-hq': false } : {}) } }))
  const problem = o.owner || o.confirm ? pwProblem(o) : null
  return (
    <>
      <div className="field">
        <span className="field-label">Allowed</span>
        <div className="st-checks" role="group" aria-label="Allowed">
          {PERMISSIONS.map((p) => (
            <label key={p.key} className="check-line">
              <input type="checkbox" checked={!!o.allow[p.key]} disabled={p.key === 'print-hq' && !o.allow.print} data-testid={`perm-${p.key}`} onChange={(e) => setAllow(p.key, e.target.checked)} />
              {p.label}
            </label>
          ))}
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-quiet btn-small" onClick={() => set({ allow: Object.fromEntries(PERMISSIONS.map((p) => [p.key, true])) })}>
            Allow all
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => set({ allow: {} })}>
            Allow none
          </button>
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="perm-owner">
          Owner password
        </label>
        <input id="perm-owner" className="input" type="password" autoComplete="new-password" data-testid="perm-owner" value={o.owner} onChange={(e) => set({ owner: e.target.value })} />
        <label className="field-label" htmlFor="perm-confirm">
          Repeat it
        </label>
        <input id="perm-confirm" className="input" type="password" autoComplete="new-password" data-testid="perm-confirm" value={o.confirm} onChange={(e) => set({ confirm: e.target.value })} />
        {problem ? (
          <p className="field-error" role="alert">
            {problem}
          </p>
        ) : (
          <p className="field-help">Anyone can open the file. The owner password is needed to lift the restrictions.</p>
        )}
      </div>
      <p className="st-warn" data-testid="perm-warning">
        Restrictions are a request to the viewer app. Most apps follow them, but some ignore them and the restrictions can be removed without the password. To keep a file private, use Protect with an open password.
      </p>
    </>
  )
}

export default {
  id: 'permissions',
  name: 'Change permissions',
  io: 'PDF → restricted PDF',
  description: 'Allow or block printing, copying and editing.',
  category: 'Security',
  icon: 'key',
  accepts: { min: 1 },
  // like Stirling: everything allowed until a box is cleared
  defaults: { allow: Object.fromEntries(PERMISSIONS.map((p) => [p.key, true])), owner: '', confirm: '' },
  next: ['merge', 'compress'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Apply permissions' }
    const problem = pwProblem(o)
    if (problem) return { ready: false, line: problem, runLabel: 'Apply permissions' }
    const n = PERMISSIONS.filter((p) => o.allow[p.key]).length
    return { ready: true, line: `${plural(files.length, 'PDF')} will allow ${n} of ${PERMISSIONS.length} actions.`, runLabel: `Restrict ${plural(files.length, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [k, f] of files.entries()) {
      ctx.check()
      ctx.progress(k, files.length, f.name)
      const res = await ctx.call('doc', 'setPermissions', f.bytes, { ownerPassword: o.owner, allow: o.allow })
      const blocked = PERMISSIONS.filter((p) => !res.allow[p.key]).map((p) => p.label.toLowerCase())
      outputs.push({ name: `${baseName(f.name)}-restricted.pdf`, bytes: res.bytes, parentIds: [f.id], note: blocked.length ? `Blocked: ${blocked.join(', ')}.` : 'Everything allowed, owner password set.' })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
