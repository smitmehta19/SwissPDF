import { Field, Segmented } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { ImposeHelp, keptNote, plural, SheetSelect, Slider } from './layoutShared.jsx'

const PER_SHEET = [2, 4, 6, 9, 16]
const custom = (o) => o.perSheet === 'custom'
const perSheetOf = (o) => (custom(o) ? o.cols * o.rows : o.perSheet)
const count = (v) => Math.min(10, Math.max(1, Math.round(Number(v)) || 1))

function Options({ options: o, setOptions }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  return (
    <>
      <div className="field">
        <span className="field-label">Pages per sheet</span>
        <Segmented label="Pages per sheet" testId="nup-per" value={o.perSheet} onChange={(perSheet) => set({ perSheet })} options={[...PER_SHEET.map((n) => ({ value: n, title: String(n) })), { value: 'custom', title: 'Custom' }]} />
      </div>
      {custom(o) && (
        <div className="field-pair">
          <Field label="Columns">
            {(id) => <input id={id} className="input" type="number" min="1" max="10" data-testid="nup-cols" value={o.cols} onChange={(e) => set({ cols: count(e.target.value) })} />}
          </Field>
          <Field label="Rows">
            {(id) => <input id={id} className="input" type="number" min="1" max="10" data-testid="nup-rows" value={o.rows} onChange={(e) => set({ rows: count(e.target.value) })} />}
          </Field>
        </div>
      )}
      <div className="field">
        <span className="field-label">Order</span>
        <Segmented
          label="Order"
          testId="nup-order"
          value={o.order}
          onChange={(order) => set({ order })}
          options={[
            { value: 'rows', title: 'Across, then down' },
            { value: 'cols', title: 'Down, then across' },
          ]}
        />
      </div>
      <div className="field">
        <span className="field-label">Reading direction</span>
        <Segmented
          label="Reading direction"
          testId="nup-direction"
          value={o.direction}
          onChange={(direction) => set({ direction })}
          options={[
            { value: 'ltr', title: 'Left to right' },
            { value: 'rtl', title: 'Right to left' },
          ]}
        />
      </div>
      <SheetSelect value={o.sheet} onChange={(sheet) => set({ sheet })} testId="nup-sheet" />
      <div className="field">
        <span className="field-label">Orientation</span>
        <Segmented
          label="Orientation"
          value={o.orientation}
          onChange={(orientation) => set({ orientation })}
          options={[
            { value: 'auto', title: 'Best fit' },
            { value: 'portrait', title: 'Portrait' },
            { value: 'landscape', title: 'Landscape' },
          ]}
        />
      </div>
      <Slider label="Outer margin" value={o.margin} min={0} max={72} onChange={(margin) => set({ margin })} />
      <Slider label="Space between pages" value={o.gap} min={0} max={48} onChange={(gap) => set({ gap })} />
      <Field label="Border">
        {(id) => (
          <label className="check-line">
            <input id={id} type="checkbox" data-testid="nup-border" checked={o.border} onChange={(e) => set({ border: e.target.checked })} />
            Draw a thin line around each page
          </label>
        )}
      </Field>
      <ImposeHelp />
      {o.border && <Slider label="Line width" value={o.borderWidth} min={0.5} max={6} step={0.5} onChange={(borderWidth) => set({ borderWidth })} />}
    </>
  )
}

export default {
  id: 'nup',
  name: 'N-up',
  io: 'PDF → PDF, N pages per sheet',
  description: 'Put 2, 4, 6, 9 or 16 pages on one sheet.',
  category: 'Organize',
  icon: 'organize',
  accepts: { min: 1 },
  defaults: { perSheet: 4, cols: 3, rows: 2, order: 'rows', direction: 'ltr', sheet: 'auto', orientation: 'auto', margin: 18, gap: 12, border: false, borderWidth: 1 },
  next: ['compress', 'pagenumbers', 'merge'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Make N-up' }
    const per = perSheetOf(o)
    const sheets = files.reduce((s, f) => s + Math.ceil((f.pageCount ?? 0) / per), 0)
    const pages = files.reduce((s, f) => s + (f.pageCount ?? 0), 0)
    return {
      ready: true,
      line: `${plural(pages, 'page')} go on ${plural(sheets, 'sheet')}, ${per} per sheet.`,
      runLabel: `Make ${plural(files.length, 'N-up PDF')}`,
    }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Laying out ${f.name}`)
      const grid = custom(o) ? { cols: o.cols, rows: o.rows } : { perSheet: o.perSheet }
      const { bytes, report } = await ctx.call('layout', 'nUp', f.bytes, { ...grid, order: o.order, direction: o.direction, sheet: o.sheet, orientation: o.orientation, margin: o.margin, gap: o.gap, border: o.border, borderWidth: o.borderWidth })
      outputs.push({ name: `${baseName(f.name)}-${perSheetOf(o)}up.pdf`, bytes, parentIds: [f.id], note: keptNote(report) })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
