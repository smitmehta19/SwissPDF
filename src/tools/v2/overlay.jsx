import { Field, OptionCards, Segmented } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { PagesField, pagesOf, plural, rangeError } from './layoutShared.jsx'

// The base file: the chosen one if still selected, else the first.
function baseOf(files, o) {
  return files.find((f) => f.id === o.baseId) ?? files[0]
}

function Options({ options: o, setOptions, files }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  const base = baseOf(files, o)
  return (
    <>
      {files.length > 1 && (
        <Field label="Base file" help="The other selected files are laid over it, in workspace order.">
          {(id) => (
            <select id={id} className="input" data-testid="overlay-base" value={base?.id ?? ''} onChange={(e) => set({ baseId: e.target.value })}>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <div className="field">
        <span className="field-label">Overlay pages</span>
        <OptionCards
          label="Overlay pages"
          testId="overlay-mode"
          value={o.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'sequential', title: 'In order', caption: 'Overlay page 1 on page 1, 2 on 2, until the overlay runs out.' },
            { value: 'interleaved', title: 'Repeat the overlay', caption: 'Start the overlay again when it runs out, to the last page.' },
            { value: 'repeat', title: 'Each overlay page several times', caption: 'Overlay page 1 on the first N pages, page 2 on the next N, and so on.' },
          ]}
        />
      </div>
      {o.mode === 'repeat' && (
        <Field label="Pages per overlay page">
          {(id) => <input id={id} className="input" type="number" min="1" max="999" value={o.repeat} onChange={(e) => set({ repeat: Math.max(1, Number(e.target.value) || 1) })} />}
        </Field>
      )}
      <div className="field">
        <span className="field-label">Layer</span>
        <Segmented
          label="Layer"
          testId="overlay-position"
          value={o.position}
          onChange={(position) => set({ position })}
          options={[
            { value: 'foreground', title: 'On top' },
            { value: 'background', title: 'Behind' },
          ]}
        />
        {o.position === 'background' && <p className="field-help">Scanned pages are opaque images: anything behind them stays hidden.</p>}
      </div>
      <Field label={`Opacity ${Math.round(o.opacity * 100)}%`}>
        {(id) => <input id={id} type="range" min="0.1" max="1" step="0.05" value={o.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />}
      </Field>
      <PagesField value={o.pages} onChange={(pages) => set({ pages })} files={base ? [base] : []} />
      <p className="field-help">Each overlay page is fitted to the base page as shown, so letterheads and forms of the same size line up exactly. The base file keeps its fields, links and bookmarks; fields and comments of the overlay pages are drawn in, their links are not kept.</p>
    </>
  )
}

export default {
  id: 'overlay',
  name: 'Overlay PDFs',
  io: '2+ PDF → 1 PDF, layered',
  description: 'Lay a letterhead, form or stamp PDF over or under every page.',
  category: 'Edit',
  icon: 'duplicate',
  accepts: { min: 2 },
  defaults: { baseId: null, mode: 'sequential', repeat: 1, position: 'foreground', opacity: 1, pages: '' },
  next: ['compress', 'pagenumbers'],
  Options,
  summary(files, o) {
    if (files.length < 2) return { ready: false, line: 'Select the base PDF and at least 1 PDF to lay over it.', runLabel: 'Overlay PDFs' }
    const base = baseOf(files, o)
    if (rangeError(o.pages, [base])) return { ready: false, line: 'Fix the page ranges first.', runLabel: 'Overlay PDFs' }
    const over = files.filter((f) => f !== base)
    const where = o.position === 'background' ? 'behind' : 'on'
    return {
      ready: true,
      line: `${plural(over.length, 'file')} will go ${where} the pages of ${base.name}.`,
      runLabel: 'Overlay PDFs',
    }
  },
  async run(files, o, ctx) {
    const base = baseOf(files, o)
    const over = files.filter((f) => f !== base)
    ctx.progress(0, 1, `Layering ${base.name}`)
    const { bytes, report } = await ctx.call(
      'layout',
      'overlayPdfs',
      base.bytes,
      over.map((f) => f.bytes),
      { mode: o.mode, repeat: o.repeat, position: o.position, opacity: o.opacity, pages: pagesOf(o.pages, base.pageCount) },
    )
    ctx.progress(1, 1, 'Done')
    const note = report.links ? `Links on the overlay pages are not kept (${plural(report.links, 'link')}).` : null
    return [{ name: `${baseName(base.name)}-overlay.pdf`, bytes, parentIds: [base.id], note }]
  },
}
