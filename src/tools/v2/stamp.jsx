import { useState } from 'react'
import { Field, PositionGrid, Segmented } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { normalizeImage } from '../../lib/imageOps.js'
import { PagesField, pagesOf, plural, rangeError } from './layoutShared.jsx'

function Options({ options: o, setOptions, files }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  const [imageError, setImageError] = useState(null)
  return (
    <>
      <Segmented
        label="Stamp type"
        testId="stamp-kind"
        value={o.kind}
        onChange={(kind) => set({ kind })}
        options={[
          { value: 'text', title: 'Text' },
          { value: 'image', title: 'Image' },
        ]}
      />
      {o.kind === 'text' ? (
        <>
          <Field label="Text" help="Any language. {n} = page number, {p} = page count, {date} = today.">
            {(id) => <input id={id} className="input" data-testid="stamp-text" value={o.text} onChange={(e) => set({ text: e.target.value })} />}
          </Field>
          <div className="field-pair">
            <Field label={`Size ${o.fontSize} pt`}>
              {(id) => <input id={id} type="range" min="6" max="120" value={o.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />}
            </Field>
            <Field label="Colour">
              {(id) => <input id={id} type="color" value={o.color} onChange={(e) => set({ color: e.target.value })} />}
            </Field>
          </div>
        </>
      ) : (
        <>
          <Field label="Image" help={o.imageName ? `Using ${o.imageName}` : 'JPG, PNG or WebP'}>
            {(id) => (
              <input
                id={id}
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                data-testid="stamp-image-input"
                onChange={async (e) => {
                  const f = e.target.files[0]
                  if (!f) return
                  try {
                    const image = await normalizeImage(await f.arrayBuffer())
                    setImageError(null)
                    set({ image, imageName: f.name })
                  } catch (err) {
                    setImageError(err.message)
                  }
                }}
              />
            )}
          </Field>
          {imageError && (
            <p className="field-error" role="alert">
              {imageError}
            </p>
          )}
          <Field label={`Width ${o.widthPct}% of the page`}>
            {(id) => <input id={id} type="range" min="5" max="80" value={o.widthPct} onChange={(e) => set({ widthPct: Number(e.target.value) })} />}
          </Field>
        </>
      )}
      <div className="field">
        <span className="field-label">Position</span>
        <PositionGrid value={o.position} onChange={(position) => set({ position })} />
      </div>
      <div className="field">
        <span className="field-label">Margin</span>
        <Segmented
          label="Margin"
          value={o.margin}
          onChange={(margin) => set({ margin })}
          options={[
            { value: 'small', title: 'Small' },
            { value: 'medium', title: 'Medium' },
            { value: 'large', title: 'Large' },
          ]}
        />
      </div>
      <Field label={`Rotation ${o.rotate}°`}>
        {(id) => <input id={id} type="range" data-testid="stamp-rotate" min="-180" max="180" step="5" value={o.rotate} onChange={(e) => set({ rotate: Number(e.target.value) })} />}
      </Field>
      <Field label={`Opacity ${Math.round(o.opacity * 100)}%`}>
        {(id) => <input id={id} type="range" min="0.1" max="1" step="0.05" value={o.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />}
      </Field>
      <PagesField value={o.pages} onChange={(pages) => set({ pages })} files={files} />
    </>
  )
}

export default {
  id: 'stamp',
  name: 'Stamp',
  io: 'PDF → PDF',
  description: 'Add a text or image stamp at a corner, edge or centre.',
  category: 'Edit',
  icon: 'sign',
  accepts: { min: 1 },
  defaults: {
    kind: 'text',
    text: 'APPROVED {date}',
    fontSize: 24,
    color: '#d92d20',
    image: null,
    imageName: '',
    widthPct: 20,
    position: 'top-right',
    margin: 'medium',
    rotate: 0,
    opacity: 1,
    pages: '',
  },
  next: ['compress', 'protect', 'merge'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Add stamp' }
    if (o.kind === 'text' && !o.text.trim()) return { ready: false, line: 'Type the stamp text.', runLabel: 'Add stamp' }
    if (o.kind === 'image' && !o.image) return { ready: false, line: 'Choose an image for the stamp.', runLabel: 'Add stamp' }
    if (rangeError(o.pages, files)) return { ready: false, line: 'Fix the page ranges first.', runLabel: 'Add stamp' }
    const n = files.length
    return { ready: true, line: `${plural(n, 'stamped PDF')} will be created.`, runLabel: `Stamp ${plural(n, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Stamping ${f.name}`)
      const { bytes, report } = await ctx.call('layout', 'stampPdf', f.bytes, {
        kind: o.kind,
        text: o.text,
        image: o.image,
        position: o.position,
        margin: o.margin,
        fontSize: o.fontSize,
        widthPct: o.widthPct,
        rotate: o.rotate,
        opacity: o.opacity,
        color: o.color,
        pages: pagesOf(o.pages, f.pageCount),
      })
      const note = report.shrunk ? `Text made smaller on ${plural(report.shrunk, 'page')} to fit between the margins.` : null
      outputs.push({ name: `${baseName(f.name)}-stamped.pdf`, bytes, parentIds: [f.id], note })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
