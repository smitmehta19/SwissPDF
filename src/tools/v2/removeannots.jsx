import { useEffect, useState } from 'react'
import { OptionCards } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { plural, readFile, useDynamicXfa } from './structure-shared.jsx'

const GROUPS = [
  ['links', 'Links'],
  ['comments', 'Comments and notes'],
  ['markup', 'Highlights, underlines, strike-outs'],
  ['drawings', 'Drawings and shapes'],
  ['stamps', 'Stamps'],
  ['files', 'File attachments'],
  ['media', 'Sound, video, 3D'],
  ['other', 'Other'],
  ['widgets', 'Form fields'],
]

// Annotation counts over all selected files.
function useCounts(files) {
  const key = files.map((f) => f.id).join(',')
  const [counts, setCounts] = useState(null)
  useEffect(() => {
    let active = true
    setCounts(null)
    Promise.all(files.map((f) => readFile('annotationSummary', f.id))).then(
      (list) => {
        if (!active) return
        const sum = {}
        for (const c of list) for (const [k, v] of Object.entries(c)) sum[k] = (sum[k] ?? 0) + v
        setCounts(sum)
      },
      () => active && setCounts({}),
    )
    return () => {
      active = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return counts
}

const groupsOf = (o) => (o.mode === 'all' ? GROUPS.map(([g]) => g).filter((g) => g !== 'widgets' || o.widgets) : o.groups)

function Options({ options: o, setOptions, files }) {
  const counts = useCounts(files)
  const xfa = useDynamicXfa(files)
  const set = (fields) => setOptions((x) => ({ ...x, ...fields }))
  return (
    <>
      <OptionCards
        label="Remove"
        testId="annots-mode"
        value={o.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'all', title: 'All annotations', caption: 'Comments, highlights, links, stamps and drawings.' },
          { value: 'pick', title: 'Choose types', caption: 'Keep the rest as it is.' },
        ]}
      />
      {o.mode === 'pick' ? (
        <div className="st-checks" role="group" aria-label="Annotation types">
          {GROUPS.map(([g, label]) => (
            <label key={g} className="check-line">
              <input
                type="checkbox"
                data-testid={`annots-${g}`}
                checked={o.groups.includes(g)}
                onChange={(e) => set({ groups: e.target.checked ? [...o.groups, g] : o.groups.filter((x) => x !== g) })}
              />
              {label}
              <span className="mono st-count">{counts ? (counts[g] ?? 0) : ''}</span>
            </label>
          ))}
        </div>
      ) : (
        <label className="check-line">
          <input type="checkbox" checked={o.widgets} data-testid="annots-widgets-all" onChange={(e) => set({ widgets: e.target.checked })} />
          Also remove form fields{counts?.widgets ? ` (${counts.widgets})` : ''}
        </label>
      )}
      {groupsOf(o).includes('widgets') && <p className="field-help">Form fields and their values are deleted. To keep the values on the page, use Flatten instead.</p>}
      {groupsOf(o).includes('widgets') && xfa.length > 0 && (
        <p className="st-warn" data-testid="annots-xfa-warning">
          {xfa.join(', ')}: a dynamic XFA form. Its form exists only as XFA, so form fields cannot be removed from it.
        </p>
      )}
      <p className="field-help" data-testid="annots-found">
        {counts == null ? 'Counting annotations…' : foundLine(counts, groupsOf(o))}
      </p>
    </>
  )
}

// What Run will remove, with form fields named apart (they need their own tick).
function foundLine(counts, groups) {
  const fields = counts.widgets ?? 0
  const annots = Object.entries(counts).reduce((a, [g, n]) => a + (g === 'widgets' ? 0 : n), 0)
  const gone = Object.entries(counts).reduce((a, [g, n]) => a + (g !== 'widgets' && groups.includes(g) ? n : 0), 0)
  if (!annots && !fields) return 'No annotations or form fields in the selected files.'
  const fieldsGo = groups.includes('widgets') ? fields : 0
  const parts = [gone && plural(gone, 'annotation'), fieldsGo && plural(fieldsGo, 'form field')].filter(Boolean)
  const removed = parts.length ? `${parts.join(' and ')} will be removed.` : 'Nothing of the chosen types to remove.'
  const kept = fields && !fieldsGo ? ` ${plural(fields, 'form field')} will be kept.` : ''
  return `${removed}${kept}`
}

export default {
  id: 'removeannots',
  name: 'Remove annotations',
  io: 'PDF → clean PDF',
  description: 'Strip comments, highlights, links or form fields.',
  category: 'Edit',
  icon: 'annotoff',
  accepts: { min: 1 },
  defaults: { mode: 'all', widgets: false, groups: ['comments', 'markup'] },
  next: ['flatten', 'compress', 'sanitize'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Remove annotations' }
    if (!groupsOf(o).length) return { ready: false, line: 'Pick at least one type to remove.', runLabel: 'Remove annotations' }
    return { ready: true, line: `${plural(files.length, 'PDF')} will be saved without them.`, runLabel: `Remove from ${plural(files.length, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [k, f] of files.entries()) {
      ctx.check()
      ctx.progress(k, files.length, f.name)
      const res = await ctx.call('doc', 'removeAnnotations', f.bytes, { groups: groupsOf(o) })
      outputs.push({ name: `${baseName(f.name)}-clean.pdf`, bytes: res.bytes, parentIds: [f.id], note: res.total ? `${plural(res.total, 'annotation')} removed.` : 'Nothing to remove, the file is unchanged.', unchanged: !res.total })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
