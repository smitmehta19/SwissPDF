import { Field, OptionCards, Segmented } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { plural, SheetSelect } from './layoutShared.jsx'

function Options({ options: o, setOptions }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  return (
    <>
      <SheetSelect label="Page size" value={o.size} onChange={(size) => set({ size })} first="Keep each page's size" testId="scale-size" />
      {o.size !== 'auto' && (
        <div className="field">
          <span className="field-label">Orientation</span>
          <Segmented
            label="Orientation"
            value={o.orientation}
            onChange={(orientation) => set({ orientation })}
            options={[
              { value: 'auto', title: 'Like each page' },
              { value: 'portrait', title: 'Portrait' },
              { value: 'landscape', title: 'Landscape' },
            ]}
          />
        </div>
      )}
      <div className="field">
        <span className="field-label">Content</span>
        <OptionCards
          label="Content"
          testId="scale-mode"
          columns={2}
          value={o.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'fit', title: 'Fit to page', caption: 'As large as fits, nothing cut.' },
            { value: 'factor', title: 'Scale by', caption: o.size === 'auto' ? 'Page and content together.' : 'Content only, centred.' },
          ]}
        />
      </div>
      {o.mode === 'factor' && (
        <Field label={`Scale ${o.percent}%`}>
          {(id) => <input id={id} type="range" data-testid="scale-percent" min="10" max="400" step="5" value={o.percent} onChange={(e) => set({ percent: Number(e.target.value) })} />}
        </Field>
      )}
    </>
  )
}

function describe(o) {
  const size = o.size === 'auto' ? null : o.size === 'letter' || o.size === 'legal' ? o.size[0].toUpperCase() + o.size.slice(1) : o.size.toUpperCase()
  if (!size) return o.mode === 'factor' ? `scaled to ${o.percent}%` : 'kept at their size'
  return o.mode === 'factor' ? `made ${size}, content at ${o.percent}%` : `made ${size}, content fitted`
}

export default {
  id: 'scale',
  name: 'Page size',
  io: 'PDF → PDF, new page size',
  description: 'Change to A4, Letter and more, or scale pages up or down.',
  category: 'Organize',
  icon: 'crop',
  accepts: { min: 1 },
  defaults: { size: 'a4', orientation: 'auto', mode: 'fit', percent: 100 },
  next: ['nup', 'compress'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Change page size' }
    if (o.size === 'auto' && (o.mode === 'fit' || o.percent === 100)) return { ready: false, line: 'Pick a page size or a scale other than 100%.', runLabel: 'Change page size' }
    const pages = files.reduce((s, f) => s + (f.pageCount ?? 0), 0)
    return { ready: true, line: `${plural(pages, 'page')} will be ${describe(o)}.`, runLabel: `Resize ${plural(files.length, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Resizing ${f.name}`)
      const { bytes } = await ctx.call('layout', 'scalePages', f.bytes, {
        size: o.size === 'auto' ? 'keep' : o.size,
        orientation: o.size === 'auto' ? 'auto' : o.orientation,
        mode: o.mode,
        factor: o.percent / 100,
      })
      outputs.push({ name: `${baseName(f.name)}-${o.size === 'auto' ? `${o.percent}pc` : o.size}.pdf`, bytes, parentIds: [f.id] })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
