import { OptionCards } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { plural, useDynamicXfa } from './structure-shared.jsx'

function Options({ options: o, setOptions, files }) {
  const xfa = useDynamicXfa(files)
  return (
    <>
      {xfa.length > 0 && (
        <p className="st-warn" data-testid="flatten-xfa-warning">
          {xfa.join(', ')}: a dynamic XFA form. Its fields exist only as XFA, so it cannot be flattened here.
        </p>
      )}
      <OptionCards
        label="Flatten"
        testId="flatten-mode"
        value={o.mode}
        onChange={(mode) => setOptions((x) => ({ ...x, mode }))}
        options={[
          { value: 'forms', title: 'Form fields only', caption: 'Values become part of the page and can no longer be changed. Comments stay editable.' },
          { value: 'full', title: 'Everything', caption: 'Form fields, comments, highlights, stamps and drawings are drawn into the page. Links keep working.' },
        ]}
      />
      <p className="field-help">Text stays selectable. Forms with an XFA copy lose it, so every viewer shows the same values.</p>
    </>
  )
}

export default {
  id: 'flatten',
  name: 'Flatten',
  io: 'PDF → flat PDF',
  description: 'Bake form values and annotations into the page.',
  category: 'Edit',
  icon: 'flatten',
  accepts: { min: 1 },
  defaults: { mode: 'forms' },
  next: ['protect', 'compress', 'merge'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Flatten' }
    return { ready: true, line: `${plural(files.length, 'flattened PDF')} will be created.`, runLabel: `Flatten ${plural(files.length, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [k, f] of files.entries()) {
      ctx.check()
      ctx.progress(k, files.length, f.name)
      // formOps.flattenForm uses pdf-lib only, so the whole op runs in the worker
      const res = await ctx.call('doc', 'flattenPdf', f.bytes, { mode: o.mode })
      const parts = [res.fields && plural(res.fields, 'field'), res.annots && plural(res.annots, 'annotation')].filter(Boolean)
      outputs.push({ name: `${baseName(f.name)}-flat.pdf`, bytes: res.bytes, parentIds: [f.id], note: parts.length ? `${parts.join(' and ')} flattened.` : 'Nothing to flatten, the file is unchanged.', unchanged: !parts.length })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
