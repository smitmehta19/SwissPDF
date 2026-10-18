// Organize runs on the shell's page editor: each selected file is a track in
// the Pages view, where pages are moved, rotated, duplicated, deleted or get
// a blank page after them. The presets here reorder every track at once.
// Run writes the edited tracks (options.plans mirrors the editor).
import { useEffect } from 'react'
import { baseName } from '../../components/usePdfFiles.js'
import './organize.css'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const PRESETS = [
  ['reverse', 'Reverse', 'Last page first'],
  ['oddEven', 'Odd, then even', '1, 3, 5, then 2, 4, 6'],
  ['duplex', 'Duplex scan', 'Fronts, then backs in reverse'],
  ['booklet', 'Booklet', 'Fold-and-staple print order'],
]

function plansOf(files, editor) {
  const out = {}
  if (!editor) return out
  for (const f of files) {
    const tiles = editor.tilesOf(f)
    const same = tiles.length === f.pageCount && tiles.every((t, i) => t.src === i && t.rotate % 360 === 0)
    if (!same) out[f.id] = tiles.map(({ src, rotate }) => ({ src, rotate }))
  }
  return out
}

function Options({ options, setOptions, files, editor }) {
  const plans = plansOf(files, editor)
  const key = JSON.stringify(plans)
  useEffect(() => {
    if (JSON.stringify(options.plans ?? {}) !== key) setOptions({ ...options, plans })
  }) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="field">
        <span className="field-label">Page order</span>
        <div className="preset-grid" data-testid="organize-presets">
          {PRESETS.map(([kind, title, caption]) => (
            <button key={kind} type="button" className="btn btn-quiet opt-card" onClick={() => editor?.actions.arrange(kind)} disabled={!files.length} data-preset={kind}>
              <span className="opt-card-title">{title}</span>
              <span className="opt-card-caption">{caption}</span>
            </button>
          ))}
        </div>
        <p className="field-help">Applies to every file in the Pages view. Booklets get blank pages to fill the last sheet. Undo with Ctrl+Z.</p>
      </div>
      <p className="field-help">
        In the Pages view, drag pages or use the toolbar to rotate, duplicate, delete or add a blank page after the selected pages.
      </p>
      <label className="check-line">
        <input type="checkbox" checked={options.combine} onChange={(e) => setOptions({ ...options, combine: e.target.checked })} data-testid="organize-combine" />
        Combine all files into one PDF
      </label>
      {editor?.dirty && (
        <button type="button" className="link" onClick={() => editor.actions.reset()}>
          Reset all
        </button>
      )}
    </>
  )
}

export default {
  id: 'organize',
  name: 'Organize',
  io: 'PDF → PDF',
  description: 'Reorder, rotate, delete and add pages.',
  category: 'Organize',
  icon: 'organize',
  workbench: 'pages',
  accepts: { min: 1 },
  defaults: { combine: false, plans: {} },
  next: ['merge', 'compress', 'pagenumbers', 'split'],
  Options,
  summary(files, o) {
    const none = { ready: false, runLabel: 'Save changes' }
    if (files.length === 0) return { ...none, line: 'Select a PDF to organize.' }
    const changed = files.filter((f) => o.plans?.[f.id])
    const pages = (f) => o.plans?.[f.id]?.length ?? f.pageCount
    if (changed.some((f) => pages(f) === 0)) return { ...none, line: 'Every page of a file was deleted. Keep at least one.' }
    if (o.combine && files.length > 1) {
      const total = files.reduce((n, f) => n + pages(f), 0)
      return { ready: true, line: `1 PDF will be created from ${plural(files.length, 'file')}, ${plural(total, 'page')}.`, runLabel: 'Save as one PDF' }
    }
    if (changed.length === 0) return { ...none, line: 'Move, rotate or delete pages in the Pages view, or pick an order.' }
    return { ready: true, line: `${plural(changed.length, 'organized PDF')} will be created.`, runLabel: `Save ${plural(changed.length, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const edited = []
    const total = files.length + (o.combine ? 1 : 0)
    for (const [i, f] of files.entries()) {
      ctx.check()
      const plan = o.plans?.[f.id]
      if (!plan && !o.combine) continue
      ctx.progress(i, total, `Organizing ${f.name}`)
      edited.push({ f, bytes: plan ? await ctx.call('pageEdit', f.bytes, plan) : f.bytes })
    }
    if (o.combine && edited.length > 1) {
      ctx.progress(files.length, total, 'Combining')
      const bytes = await ctx.call('merge', edited.map((e) => ({ bytes: e.bytes, name: baseName(e.f.name) })))
      return [{ name: 'organized.pdf', bytes, parentIds: edited.map((e) => e.f.id) }]
    }
    ctx.progress(total, total, 'Done')
    return edited.map((e) => ({ name: `${baseName(e.f.name)}-organized.pdf`, bytes: e.bytes, parentIds: [e.f.id] }))
  },
}
