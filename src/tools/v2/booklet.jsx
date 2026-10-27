import { OptionCards, Segmented } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { ImposeHelp, keptNote, plural, SheetSelect, Slider } from './layoutShared.jsx'

function Options({ options: o, setOptions }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  return (
    <>
      <div className="field">
        <span className="field-label">Binding</span>
        <OptionCards
          label="Binding"
          testId="booklet-spine"
          columns={2}
          value={o.spine}
          onChange={(spine) => set({ spine })}
          options={[
            { value: 'left', title: 'Spine left', caption: 'Opens like most books.' },
            { value: 'right', title: 'Spine right', caption: 'Arabic, Hebrew, manga.' },
          ]}
        />
      </div>
      <div className="field">
        <span className="field-label">Print</span>
        <Segmented
          label="Print"
          testId="booklet-sides"
          value={o.sides}
          onChange={(sides) => set({ sides })}
          options={[
            { value: 'both', title: 'Both sides' },
            { value: 'front', title: 'Fronts only' },
            { value: 'back', title: 'Backs only' },
          ]}
        />
        <p className="field-help">For a printer without duplex: print the fronts, put the stack back in, then print the backs.</p>
      </div>
      <SheetSelect value={o.sheet} onChange={(sheet) => set({ sheet })} first="Two pages at their own size" />
      <Slider label="Gutter" value={o.gutter} min={0} max={72} onChange={(gutter) => set({ gutter })} />
      <div className="field">
        <label className="check-line">
          <input type="checkbox" data-testid="booklet-long-edge" checked={o.longEdge} onChange={(e) => set({ longEdge: e.target.checked })} />
          My printer only flips on the long edge (turns the backs)
        </label>
        <label className="check-line">
          <input type="checkbox" checked={o.border} onChange={(e) => set({ border: e.target.checked })} />
          Draw a thin line around each page
        </label>
        <p className="field-help">Print double-sided and flip on the short edge. Tick the first box only if your printer can flip on the long edge alone.</p>
      </div>
      <ImposeHelp />
    </>
  )
}

const sheetsOf = (n) => Math.max(1, Math.ceil(n / 4))

export default {
  id: 'booklet',
  name: 'Booklet',
  io: 'PDF → folded booklet PDF',
  description: 'Print, fold in half, staple: pages come out in order.',
  category: 'Organize',
  icon: 'pages',
  accepts: { min: 1 },
  defaults: { spine: 'left', sides: 'both', sheet: 'auto', gutter: 0, longEdge: false, border: false },
  next: ['compress', 'pagenumbers'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Make booklet' }
    const sheets = files.reduce((s, f) => s + sheetsOf(f.pageCount ?? 0), 0)
    const pad = files.reduce((s, f) => s + (sheetsOf(f.pageCount ?? 0) * 4 - (f.pageCount ?? 0)), 0)
    const sides = o.sides === 'both' ? `${plural(sheets, 'sheet')}, printed on both sides` : `${plural(sheets, o.sides === 'front' ? 'front' : 'back')}`
    return {
      ready: true,
      line: `${sides}${pad ? `, ${plural(pad, 'blank page')} added at the end` : ''}.`,
      runLabel: `Make ${plural(files.length, 'booklet')}`,
    }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Imposing ${f.name}`)
      const { bytes, report } = await ctx.call('layout', 'booklet', f.bytes, { spine: o.spine, sides: o.sides, sheet: o.sheet, gutter: o.gutter, longEdge: o.longEdge, border: o.border })
      const tag = o.sides === 'both' ? 'booklet' : `booklet-${o.sides}s`
      outputs.push({ name: `${baseName(f.name)}-${tag}.pdf`, bytes, parentIds: [f.id], note: keptNote(report) })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
