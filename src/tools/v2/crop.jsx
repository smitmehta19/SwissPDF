import { useRef, useState } from 'react'
import { Field, Segmented } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { parseRangeSpec } from '../../lib/pageRanges.js'
import { PageStage, dragRect, fracStyle, plural } from './g3-canvas.jsx'

const MIN = 0.02 // smallest crop side, as a fraction of the page

// Margins in % of the page <-> crop rectangle in fractions.
const toMargins = (r) => ({
  top: Math.round(r.fy * 100),
  left: Math.round(r.fx * 100),
  right: Math.round((1 - r.fx - r.fw) * 100),
  bottom: Math.round((1 - r.fy - r.fh) * 100),
})
function fromMargins(m) {
  const c = (v) => Math.min(95, Math.max(0, Number(v) || 0)) / 100
  const fx = c(m.left)
  const fy = c(m.top)
  return { fx, fy, fw: Math.max(MIN, 1 - fx - c(m.right)), fh: Math.max(MIN, 1 - fy - c(m.bottom)) }
}

function Canvas({ files, options, setOptions, target, onTarget }) {
  const start = useRef(null)
  const [draft, setDraft] = useState(null)
  const rect = draft ?? options.rect
  return (
    <PageStage
      files={files}
      target={target}
      onTarget={onTarget}
      testId="crop-stage"
      hint="Drag over the area to keep. Everything outside it is hidden on every page you crop."
      onDown={(p) => {
        start.current = p
        setDraft(null)
      }}
      onMove={(p) => start.current && setDraft(dragRect(start.current, p))}
      onUp={(p, _e, ctx) => {
        const r = start.current && dragRect(start.current, p)
        start.current = null
        setDraft(null)
        if (r && r.fw > MIN && r.fh > MIN) {
          setOptions((o) => ({ ...o, rect: { fx: r.fx, fy: r.fy, fw: r.fw, fh: r.fh, page: ctx.page } }))
        }
      }}
    >
      {() => rect && <span className={`g3-ov ${draft ? 'g3-draft' : 'g3-crop'}`} style={fracStyle(rect)} data-testid="crop-rect" />}
    </PageStage>
  )
}

function Options({ options, setOptions }) {
  const set = (fields) => setOptions({ ...options, ...fields })
  const m = options.rect ? toMargins(options.rect) : null
  return (
    <>
      <p className="field-help">Drag on the page in the viewer, or set the margins to trim.</p>
      <div className="field">
        <span className="field-label">Trim from each side (% of the page)</span>
        <div className="g3-margins">
          {['top', 'right', 'bottom', 'left'].map((side) => (
            <Field key={side} label={side[0].toUpperCase() + side.slice(1)}>
              {(id) => (
                <input
                  id={id}
                  className="input input-small mono"
                  type="number"
                  min="0"
                  max="95"
                  value={m ? m[side] : 0}
                  data-testid={`crop-${side}`}
                  onChange={(e) => {
                    const base = m ?? { top: 0, right: 0, bottom: 0, left: 0 }
                    set({ rect: { ...fromMargins({ ...base, [side]: e.target.value }), page: options.rect?.page ?? 1 } })
                  }}
                />
              )}
            </Field>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Apply to</span>
        <Segmented
          label="Apply to"
          value={options.scope}
          onChange={(scope) => set({ scope })}
          options={[
            { value: 'all', title: 'All pages' },
            { value: 'current', title: `Page ${options.rect?.page ?? 1}` },
            { value: 'ranges', title: 'Pages' },
          ]}
        />
      </div>
      {options.scope === 'ranges' && (
        <Field label="Pages" help="Ranges like 1-3, 8.">
          {(id) => <input id={id} className="input" data-testid="range-input" value={options.pages} onChange={(e) => set({ pages: e.target.value })} />}
        </Field>
      )}
      {options.rect && (
        <div className="btn-row">
          <button type="button" className="btn btn-quiet btn-small" onClick={() => set({ rect: null })}>
            Reset
          </button>
        </div>
      )}
      <p className="g3-note">Crop hides the outside of the page, it does not delete it. To remove private content for good, use Redact.</p>
    </>
  )
}

export default {
  id: 'crop',
  name: 'Crop',
  io: 'PDF → PDF',
  description: 'Drag the area to keep.',
  category: 'Edit',
  icon: 'crop',
  accepts: { min: 1 },
  defaults: { rect: null, scope: 'all', pages: '' },
  next: ['compress', 'pagenumbers', 'merge'],
  Canvas,
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Crop' }
    if (!o.rect) return { ready: false, line: 'Drag on the page to choose the area to keep.', runLabel: 'Crop' }
    if (o.scope === 'ranges' && !o.pages.trim()) return { ready: false, line: 'Type the pages to crop.', runLabel: 'Crop' }
    const n = files.length
    const where = o.scope === 'all' ? 'every page' : o.scope === 'current' ? `page ${o.rect.page}` : `pages ${o.pages}`
    return { ready: true, line: `${plural(n, 'cropped PDF')} will be created, ${where}.`, runLabel: `Crop ${plural(n, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const { cropPdf } = await import('../../lib/stampOps.js')
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Cropping ${f.name}`)
      let pages = null
      if (o.scope === 'current') pages = [o.rect.page].filter((p) => p <= f.pageCount)
      else if (o.scope === 'ranges') pages = parseRangeSpec(o.pages, f.pageCount).pages
      if (pages && pages.length === 0) continue
      const { fx, fy, fw, fh } = o.rect
      const bytes = await cropPdf(f.bytes, { fx, fy, fw, fh }, pages)
      outputs.push({ name: `${baseName(f.name)}-cropped.pdf`, bytes, parentIds: [f.id] })
    }
    if (outputs.length === 0) throw new Error('None of the selected files has those pages.')
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
