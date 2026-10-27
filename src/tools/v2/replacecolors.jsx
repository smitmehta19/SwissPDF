import { Field, OptionCards, Segmented } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { plural } from './layoutShared.jsx'

const PRESETS = [
  { value: 'white-on-black', title: 'White on black' },
  { value: 'black-on-white', title: 'Black on white' },
  { value: 'yellow-on-black', title: 'Yellow on black' },
  { value: 'green-on-black', title: 'Green on black' },
]

const MODES = {
  'high-contrast': 'high contrast',
  custom: 'new text and background colours',
  invert: 'inverted colours',
  grayscale: 'shades of grey',
}

function Options({ options: o, setOptions }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  return (
    <>
      <div className="field">
        <span className="field-label">Change</span>
        <OptionCards
          label="Change"
          testId="replace-mode"
          value={o.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'high-contrast', title: 'High contrast', caption: 'Text and background in two strong colours, for easier reading.' },
            { value: 'custom', title: 'Custom colours', caption: 'Pick the text and background colours.' },
            { value: 'invert', title: 'Invert', caption: 'Every colour turns into its opposite, like a negative.' },
            { value: 'grayscale', title: 'Grayscale', caption: 'Remove all colour.' },
          ]}
        />
      </div>
      {o.mode === 'high-contrast' && (
        <div className="field">
          <span className="field-label">Colours</span>
          <Segmented label="Colours" testId="replace-preset" value={o.preset} onChange={(preset) => set({ preset })} options={PRESETS} />
        </div>
      )}
      {o.mode === 'custom' && (
        <div className="field-pair">
          <Field label="Text">
            {(id) => <input id={id} type="color" data-testid="replace-text" value={o.text} onChange={(e) => set({ text: e.target.value })} />}
          </Field>
          <Field label="Background">
            {(id) => <input id={id} type="color" data-testid="replace-background" value={o.background} onChange={(e) => set({ background: e.target.value })} />}
          </Field>
        </div>
      )}
      <p className="field-help">Works on text, drawings and scanned pages alike. Text stays selectable. Comments and form fields keep their colours.</p>
    </>
  )
}

export default {
  id: 'replacecolors',
  name: 'Replace colours',
  io: 'PDF → PDF, new colours',
  description: 'High contrast, custom text and background colours, invert, grayscale.',
  category: 'Edit',
  icon: 'moon',
  accepts: { min: 1 },
  defaults: { mode: 'high-contrast', preset: 'white-on-black', text: '#000000', background: '#ffffff' },
  next: ['compress', 'adjustcolors'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Replace colours' }
    if (o.mode === 'custom' && o.text.toLowerCase() === o.background.toLowerCase()) return { ready: false, line: 'Pick different text and background colours.', runLabel: 'Replace colours' }
    return { ready: true, line: `${plural(files.length, 'PDF')} will get ${MODES[o.mode]}.`, runLabel: `Recolour ${plural(files.length, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Recolouring ${f.name}`)
      const res = await ctx.call('color', 'replaceColors', f.bytes, { mode: o.mode, preset: o.preset, text: o.text, background: o.background })
      outputs.push({ name: `${baseName(f.name)}-${o.mode}.pdf`, bytes: res.bytes, parentIds: [f.id] })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
