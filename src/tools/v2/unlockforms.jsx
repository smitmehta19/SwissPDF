import { baseName } from '../../components/usePdfFiles.js'
import { plural } from './structure-shared.jsx'

function Options() {
  return (
    <>
      <p className="field-help">Every form field that is set to read-only can be filled in again. Values stay as they are.</p>
      <p className="st-warn">Fields that a script locks while you type stay locked in viewers that run scripts. A signed form loses its valid signature once changed.</p>
    </>
  )
}

export default {
  id: 'unlockforms',
  name: 'Unlock forms',
  io: 'PDF form → fillable form',
  description: 'Make read-only form fields editable again.',
  category: 'Security',
  icon: 'formunlock',
  accepts: { min: 1 },
  defaults: {},
  next: ['forms', 'flatten'],
  Options,
  summary(files) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Unlock forms' }
    return { ready: true, line: `Read-only fields of ${plural(files.length, 'PDF')} will be made editable.`, runLabel: `Unlock ${plural(files.length, 'form')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [k, f] of files.entries()) {
      ctx.check()
      ctx.progress(k, files.length, f.name)
      const res = await ctx.call('doc', 'unlockForms', f.bytes)
      const parts = [res.fields && plural(res.fields, 'field'), res.widgets && plural(res.widgets, 'widget'), res.xfa && plural(res.xfa, 'XFA lock')].filter(Boolean)
      outputs.push({ name: `${baseName(f.name)}-unlocked.pdf`, bytes: res.bytes, parentIds: [f.id], note: parts.length ? `Unlocked ${parts.join(', ')}.` : 'No read-only fields, the file is unchanged.' })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
