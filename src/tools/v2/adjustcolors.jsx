import { baseName } from '../../components/usePdfFiles.js'
import { plural, Slider } from './layoutShared.jsx'

// 100 = unchanged (same as NEUTRAL in colorOps.js, kept here so the tool list
// does not load pdf-lib)
const NEUTRAL = { contrast: 100, brightness: 100, saturation: 100, red: 100, green: 100, blue: 100 }

const SLIDERS = [
  ['contrast', 'Contrast'],
  ['brightness', 'Brightness'],
  ['saturation', 'Saturation'],
  ['red', 'Red'],
  ['green', 'Green'],
  ['blue', 'Blue'],
]

const changed = (o) => SLIDERS.some(([k]) => o[k] !== NEUTRAL[k])
// Saturation above 100 can only be done on rendered pages.
const asImages = (o) => o.saturation > 100

function Options({ options: o, setOptions }) {
  const set = (fields) => setOptions((prev) => ({ ...prev, ...fields }))
  return (
    <>
      {SLIDERS.map(([k, label]) => (
        <Slider key={k} label={label} unit="" value={o[k]} min={0} max={200} onChange={(v) => set({ [k]: v })} testId={`colors-${k}`} />
      ))}
      <p className="field-help">100 leaves a setting as it is.</p>
      {asImages(o) ? (
        <p className="field-help" role="status">
          Saturation above 100 turns pages into images at 150 dpi: text will no longer be selectable or searchable. Run OCR afterwards to get it back.
        </p>
      ) : (
        <p className="field-help">Text, links and vector graphics stay as they are. Comments and form fields keep their colours.</p>
      )}
      <div className="btn-row">
        <button type="button" className="btn btn-small" disabled={!changed(o)} onClick={() => set({ ...NEUTRAL })}>
          Reset
        </button>
      </div>
    </>
  )
}

export default {
  id: 'adjustcolors',
  name: 'Adjust colours',
  io: 'PDF → PDF, new colours',
  description: 'Contrast, brightness, saturation and red, green, blue.',
  category: 'Edit',
  icon: 'sun',
  accepts: { min: 1 },
  defaults: { ...NEUTRAL },
  next: ['compress', 'ocr'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Adjust colours' }
    if (!changed(o)) return { ready: false, line: 'Move a slider away from 100 to change the colours.', runLabel: 'Adjust colours' }
    const how = asImages(o) ? ' Pages become images: text will not be selectable.' : ' Text stays selectable.'
    return { ready: true, line: `${plural(files.length, 'PDF')} will get new colours.${how}`, runLabel: `Adjust ${plural(files.length, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const { adjustSteps, adjustMap, rasterMap } = await import('../../lib/colorOps.js')
    const settings = Object.fromEntries(SLIDERS.map(([k]) => [k, o[k]]))
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Adjusting ${f.name}`)
      // layers run in the worker; image pages need the page's renderer
      const steps = adjustSteps(settings)
      const bytes = steps
        ? await ctx.call('color', 'applyBlendSteps', f.bytes, steps)
        : await rasterMap(f.bytes, adjustMap(settings), {
            check: ctx.check,
            onPage: (n, total) => ctx.progress(i + n / total, files.length, `${f.name}: page ${n} of ${total}`),
          })
      const note = steps ? null : 'Pages are images now: text is not selectable.'
      outputs.push({ name: `${baseName(f.name)}-colours.pdf`, bytes, parentIds: [f.id], note })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
