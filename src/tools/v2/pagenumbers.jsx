import { Field, OptionCards, PositionGrid, Segmented } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { parseRangeSpec } from '../../lib/pageRanges.js'
import { MARGINS, pageLabel } from '../../lib/stampOps.js'
import { PageStage, plural } from './g3-canvas.jsx'

const PRESETS = {
  n: '{n}',
  'page-n': 'Page {n}',
  'n-of-p': 'Page {n} of {p}',
}

const templateOf = (o) => (o.preset === 'custom' ? o.template : PRESETS[o.preset] ?? '{n}')
const batesOf = (o) => (o.style === 'bates' ? { prefix: o.batesPrefix, digits: o.batesDigits } : null)

const mirror = (pos) => (pos.endsWith('-left') ? pos.replace('-left', '-right') : pos.endsWith('-right') ? pos.replace('-right', '-left') : pos)

// Number shown on page `page` (1-based) of a file, or null when skipped.
function numberFor(o, page, pageCount) {
  const targets = o.pages.trim() ? new Set(parseRangeSpec(o.pages, pageCount).pages) : null
  const list = []
  for (let i = 1; i <= pageCount; i++) if (i > o.skip && (!targets || targets.has(i))) list.push(i)
  const k = list.indexOf(page)
  if (k < 0) return null
  const first = Number(o.start) || 1
  return { n: first + k, last: first + list.length - 1 }
}

function Canvas({ files, options: o, setOptions, target, onTarget }) {
  return (
    <PageStage
      files={files}
      target={target}
      onTarget={onTarget}
      testId="pn-stage"
      cursor="pointer"
      hint="Preview of the number on this page. Click a part of the page to move it there."
      onDown={(p) => {
        const v = p.fy < 1 / 3 ? 'top' : p.fy > 2 / 3 ? 'bottom' : 'middle'
        const h = p.fx < 1 / 3 ? 'left' : p.fx > 2 / 3 ? 'right' : 'center'
        setOptions((x) => ({ ...x, position: `${v}-${h}` }))
      }}
    >
      {({ file, page, size }) => {
        let num = null
        try {
          num = numberFor(o, page, file.pageCount)
        } catch {
          /* bad range: no preview */
        }
        if (!num) return null
        const label = pageLabel({ template: templateOf(o), bates: batesOf(o) }, num.n, num.last)
        const pos = o.facing && page % 2 === 0 ? mirror(o.position) : o.position
        const [v, h] = pos.split('-')
        const m = MARGINS[o.margin] ?? MARGINS.recommended
        const style = {
          '--size': o.fontSize,
          '--num-color': o.color,
          ...(h === 'left' ? { left: `${(m / size.width) * 100}%` } : h === 'right' ? { right: `${(m / size.width) * 100}%` } : { left: '50%', transform: 'translateX(-50%)' }),
          ...(v === 'top' ? { top: `${(m / size.height) * 100}%` } : v === 'bottom' ? { bottom: `${(m / size.height) * 100}%` } : { top: '50%', transform: `${h === 'center' ? 'translate(-50%, -50%)' : 'translateY(-50%)'}` }),
        }
        return (
          <span className="g3-ov g3-number" style={style} data-testid="pn-preview">
            {label}
          </span>
        )
      }}
    </PageStage>
  )
}

function Options({ options: o, setOptions }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  return (
    <>
      <Segmented
        label="Numbering style"
        testId="pn-style"
        value={o.style}
        onChange={(style) => set({ style })}
        options={[
          { value: 'page', title: 'Page numbers' },
          { value: 'bates', title: 'Bates' },
        ]}
      />
      {o.style === 'page' ? (
        <>
          <OptionCards
            label="Text"
            testId="pn-preset"
            columns={2}
            value={o.preset}
            onChange={(preset) => set({ preset })}
            options={[
              { value: 'n', title: '1' },
              { value: 'page-n', title: 'Page 1' },
              { value: 'n-of-p', title: 'Page 1 of 9' },
              { value: 'custom', title: 'Custom' },
            ]}
          />
          {o.preset === 'custom' && (
            <Field label="Custom text" help="{n} is the page number, {p} the last number. Any language works, e.g. Seite {n} von {p}.">
              {(id) => <input id={id} className="input" data-testid="pn-template" value={o.template} onChange={(e) => set({ template: e.target.value })} />}
            </Field>
          )}
        </>
      ) : (
        <>
          <div className="g3-pair">
            <Field label="Prefix">
              {(id) => <input id={id} className="input" data-testid="pn-bates-prefix" value={o.batesPrefix} onChange={(e) => set({ batesPrefix: e.target.value })} />}
            </Field>
            <Field label="Digits">
              {(id) => (
                <input id={id} className="input input-small mono" type="number" min="1" max="12" value={o.batesDigits} onChange={(e) => set({ batesDigits: Math.min(12, Math.max(1, Number(e.target.value) || 6)) })} />
              )}
            </Field>
          </div>
          <label className="check-line">
            <input type="checkbox" checked={o.continueAcross} onChange={(e) => set({ continueAcross: e.target.checked })} />
            Continue the numbers across all selected files
          </label>
        </>
      )}
      <div className="field">
        <span className="field-label">Position</span>
        <PositionGrid value={o.position} onChange={(position) => set({ position })} />
        <label className="check-line">
          <input type="checkbox" checked={o.facing} onChange={(e) => set({ facing: e.target.checked })} data-testid="pn-facing" />
          Facing pages (mirror left and right on even pages)
        </label>
      </div>
      <div className="field">
        <span className="field-label">Margin</span>
        <Segmented
          label="Margin"
          value={o.margin}
          onChange={(margin) => set({ margin })}
          options={[
            { value: 'small', title: 'Small' },
            { value: 'recommended', title: 'Recommended' },
            { value: 'big', title: 'Big' },
          ]}
        />
      </div>
      <div className="g3-pair">
        <Field label="First number">
          {(id) => <input id={id} className="input input-small mono" type="number" min="0" value={o.start} data-testid="pn-start" onChange={(e) => set({ start: e.target.value })} />}
        </Field>
        <Field label="Skip first pages">
          {(id) => <input id={id} className="input input-small mono" type="number" min="0" value={o.skip} data-testid="pn-skip" onChange={(e) => set({ skip: Math.max(0, Number(e.target.value) || 0) })} />}
        </Field>
      </div>
      <p className="field-help">Skipped pages (a cover, a contents page) get no number; numbering starts on the next page.</p>
      <div className="field-pair">
        <Field label={`Size ${o.fontSize} pt`}>
          {(id) => <input id={id} type="range" min="6" max="36" value={o.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />}
        </Field>
        <Field label="Colour">
          {(id) => <input id={id} type="color" value={o.color} onChange={(e) => set({ color: e.target.value })} />}
        </Field>
      </div>
      <Field label="Pages" help="Leave empty for every page, or type ranges like 3-12.">
        {(id) => <input id={id} className="input" data-testid="range-input" placeholder="All pages" value={o.pages} onChange={(e) => set({ pages: e.target.value })} />}
      </Field>
    </>
  )
}

export default {
  id: 'pagenumbers',
  name: 'Page numbers',
  io: 'PDF → PDF',
  description: 'Numbers, custom text or Bates, where you want them.',
  category: 'Edit',
  icon: 'numbers',
  accepts: { min: 1 },
  defaults: {
    style: 'page',
    preset: 'n',
    template: 'Page {n} of {p}',
    position: 'bottom-center',
    margin: 'recommended',
    facing: false,
    start: 1,
    skip: 0,
    fontSize: 11,
    color: '#1c2333',
    pages: '',
    batesPrefix: 'DOC',
    batesDigits: 6,
    continueAcross: true,
  },
  next: ['compress', 'protect', 'redact', 'merge'],
  Canvas,
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Add page numbers' }
    if (o.style === 'page' && o.preset === 'custom' && !o.template.includes('{n}')) {
      return { ready: false, line: 'Put {n} in the custom text where the number goes.', runLabel: 'Add page numbers' }
    }
    const n = files.length
    const skip = o.skip > 0 ? `, first ${plural(o.skip, 'page')} skipped` : ''
    return { ready: true, line: `${plural(n, 'numbered PDF')} will be created${skip}.`, runLabel: `Number ${plural(n, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const { addPageNumbers } = await import('../../lib/stampOps.js')
    const outputs = []
    let next = Number(o.start) || 1
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Numbering ${f.name}`)
      const pages = o.pages.trim() ? parseRangeSpec(o.pages, f.pageCount).pages : null
      const bates = batesOf(o)
      const start = bates && o.continueAcross ? next : Number(o.start) || 1
      const bytes = await addPageNumbers(f.bytes, {
        template: templateOf(o),
        bates,
        position: o.position,
        margin: o.margin,
        facing: o.facing,
        start,
        skip: o.skip,
        fontSize: o.fontSize,
        color: o.color,
        pages,
        check: ctx.check,
      })
      const counted = (pages ?? Array.from({ length: f.pageCount }, (_, k) => k + 1)).filter((p) => p > o.skip).length
      next = start + counted
      const note = bates ? `${bates.prefix}${String(start).padStart(bates.digits, '0')} to ${bates.prefix}${String(next - 1).padStart(bates.digits, '0')}` : null
      outputs.push({ name: `${baseName(f.name)}-numbered.pdf`, bytes, parentIds: [f.id], note })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
