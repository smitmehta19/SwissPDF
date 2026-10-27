import { OptionCards } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { plural } from './structure-shared.jsx'

function Options({ options: o, setOptions }) {
  const set = (fields) => setOptions((x) => ({ ...x, ...fields }))
  return (
    <>
      <OptionCards
        label="Save images as"
        testId="ximg-format"
        columns={2}
        value={o.format}
        onChange={(format) => set({ format })}
        options={[
          { value: 'png', title: 'PNG', caption: 'Lossless, keeps transparency.' },
          { value: 'jpg', title: 'JPG', caption: 'Smaller, transparency on white.' },
        ]}
      />
      <label className="check-line">
        <input type="checkbox" checked={o.keepJpeg} data-testid="ximg-keep" onChange={(e) => set({ keepJpeg: e.target.checked })} />
        Keep photos stored as JPEG exactly as they are (no quality loss)
      </label>
      <p className="field-help">Each image is saved once, even when it repeats on many pages. Images are named by the page they first appear on, in one ZIP per PDF.</p>
    </>
  )
}

export default {
  id: 'extractimages',
  name: 'Extract images',
  io: 'PDF → images (ZIP)',
  description: 'Save every picture in a PDF at its original size.',
  category: 'Convert',
  icon: 'images',
  accepts: { min: 1 },
  keepInputs: true,
  defaults: { format: 'png', keepJpeg: true },
  next: ['removeimages', 'compress'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Extract images' }
    return { ready: true, line: `The images of ${plural(files.length, 'PDF')} will be saved as ${o.format.toUpperCase()} in a ZIP.`, runLabel: 'Extract images' }
  },
  async run(files, o, ctx) {
    const { makeZip } = await import('../../lib/zip.js')
    const outputs = []
    for (const [k, f] of files.entries()) {
      ctx.check()
      ctx.progress(k, files.length, f.name)
      const res = await ctx.call('doc', 'extractImages', f.bytes, { format: o.format, keepJpeg: o.keepJpeg })
      if (!res.images.length) continue
      ctx.check()
      const zip = await makeZip(res.images.map((im) => ({ name: im.name, bytes: im.bytes })))
      const kept = res.images.filter((im) => im.kept).length
      const note = [plural(res.images.length, 'image'), kept && `${kept} kept as JPEG`, res.failed && `${res.failed} could not be read`].filter(Boolean).join(', ')
      outputs.push({ name: `${baseName(f.name)}-images.zip`, bytes: zip, type: 'application/zip', parentIds: [f.id], note: `${note}.` })
    }
    if (!outputs.length) throw new Error(`No images found in ${files.length === 1 ? files[0].name : 'the selected PDFs'}.`)
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
