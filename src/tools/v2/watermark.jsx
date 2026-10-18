import { useState } from 'react'
import { Field, PositionGrid, Segmented } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { normalizeImage } from '../../lib/imageOps.js'
import { parseRangeSpec } from '../../lib/pageRanges.js'

function Options({ options, setOptions }) {
  const set = (fields) => setOptions({ ...options, ...fields })
  const [logoError, setLogoError] = useState(null)
  const tiled = options.position === 'tile'
  return (
    <>
      <Segmented
        label="Watermark type"
        value={options.kind}
        onChange={(kind) => set({ kind })}
        options={[
          { value: 'text', title: 'Text' },
          { value: 'image', title: 'Image' },
        ]}
      />
      {options.kind === 'text' ? (
        <>
          <Field label="Text">
            {(id) => (
              <input id={id} className="input" data-testid="wm-text" value={options.text} onChange={(e) => set({ text: e.target.value })} />
            )}
          </Field>
          <div className="field-pair">
            <Field label={`Size ${options.fontSize} pt`}>
              {(id) => (
                <input id={id} type="range" min="12" max="150" value={options.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
              )}
            </Field>
            <Field label="Colour">
              {(id) => <input id={id} type="color" value={options.color} onChange={(e) => set({ color: e.target.value })} />}
            </Field>
          </div>
          <div className="field">
            <span className="field-label">Rotation</span>
            <Segmented
              label="Rotation"
              value={options.rotate}
              onChange={(rotate) => set({ rotate })}
              options={[0, 45, 90, 180, 270].map((a) => ({ value: a, title: `${a}°` }))}
            />
          </div>
        </>
      ) : (
        <>
          <Field label="Image" help={options.logoName ? `Using ${options.logoName}` : 'JPG, PNG or WebP'}>
            {(id) => (
              <input
                id={id}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                data-testid="wm-image-input"
                onChange={async (e) => {
                  const f = e.target.files[0]
                  if (!f) return
                  try {
                    const logo = await normalizeImage(await f.arrayBuffer())
                    setLogoError(null)
                    set({ logo, logoName: f.name })
                  } catch (err) {
                    setLogoError(err.message)
                  }
                }}
              />
            )}
          </Field>
          {logoError && <p className="field-error" role="alert">{logoError}</p>}
          <Field label={`Width ${options.widthPct}% of the page`}>
            {(id) => (
              <input id={id} type="range" min="10" max="80" value={options.widthPct} onChange={(e) => set({ widthPct: Number(e.target.value) })} />
            )}
          </Field>
        </>
      )}
      <Field label={`Opacity ${Math.round(options.opacity * 100)}%`}>
        {(id) => (
          <input id={id} type="range" min="0.05" max="1" step="0.05" value={options.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />
        )}
      </Field>
      <div className="field">
        <span className="field-label">Position</span>
        <PositionGrid value={tiled ? options.lastCell : options.position} onChange={(position) => set({ position, lastCell: position })} disabled={tiled} />
        {options.kind === 'text' && (
          <label className="check-line">
            <input type="checkbox" checked={tiled} onChange={(e) => set({ position: e.target.checked ? 'tile' : options.lastCell })} />
            Repeat across the whole page
          </label>
        )}
      </div>
      <Field label="Pages" help="Leave empty for every page, or type ranges like 1-3, 8.">
        {(id) => (
          <input id={id} className="input" data-testid="range-input" placeholder="All pages" value={options.pages} onChange={(e) => set({ pages: e.target.value })} />
        )}
      </Field>
    </>
  )
}

export default {
  id: 'watermark',
  name: 'Watermark',
  io: 'PDF → PDF',
  description: 'Stamp text or a logo on every page.',
  category: 'Edit',
  icon: 'watermark',
  accepts: { min: 1 },
  defaults: {
    kind: 'text',
    text: 'CONFIDENTIAL',
    fontSize: 48,
    color: '#d92d20',
    opacity: 0.25,
    rotate: 45,
    position: 'middle-center',
    lastCell: 'middle-center',
    logo: null,
    logoName: '',
    widthPct: 30,
    pages: '',
  },
  next: ['compress', 'protect', 'pagenumbers'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Add watermark' }
    if (o.kind === 'text' && !o.text.trim()) return { ready: false, line: 'Type the watermark text.', runLabel: 'Add watermark' }
    if (o.kind === 'image' && !o.logo) return { ready: false, line: 'Choose an image for the watermark.', runLabel: 'Add watermark' }
    const n = files.length
    return { ready: true, line: `${n} watermarked PDF${n === 1 ? '' : 's'} will be created.`, runLabel: `Watermark ${n} PDF${n === 1 ? '' : 's'}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.progress(i, files.length, `Stamping ${f.name}`)
      const pages = o.pages.trim() ? parseRangeSpec(o.pages, f.pageCount).pages : null
      const bytes =
        o.kind === 'text'
          ? await ctx.call('watermarkText', f.bytes, {
              text: o.text,
              fontSize: o.fontSize,
              color: o.color,
              opacity: o.opacity,
              rotate: o.rotate,
              position: o.position,
              pages,
            })
          : await ctx.call('watermarkImage', f.bytes, o.logo.bytes, o.logo.type, {
              opacity: o.opacity,
              widthPct: o.widthPct,
              position: o.position === 'tile' ? o.lastCell : o.position,
              pages,
            })
      outputs.push({ name: `${baseName(f.name)}-watermarked.pdf`, bytes, parentIds: [f.id] })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
