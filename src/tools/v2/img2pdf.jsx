import { OptionCards, Segmented } from '../../app/controls.jsx'
import { plural, stem } from './convertShared.js'

const TYPES = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.heic', '.heif', '.tif', '.tiff']
const MARGINS = { none: 0, small: 20, big: 40 }
const DPI = 150

function Options({ options, setOptions }) {
  const set = (fields) => setOptions({ ...options, ...fields })
  const fit = options.pageSize === 'fit'
  return (
    <>
      <div className="field">
        <span className="field-label">Page size</span>
        <OptionCards
          label="Page size"
          testId="img-page-size"
          columns={3}
          value={options.pageSize}
          onChange={(pageSize) => set({ pageSize })}
          options={[
            { value: 'a4', title: 'A4' },
            { value: 'letter', title: 'US Letter' },
            { value: 'fit', title: 'Fit image' },
          ]}
        />
        {fit && <p className="field-help">Each page takes the size of its image at {DPI} dpi.</p>}
      </div>
      {!fit && (
        <div className="field">
          <span className="field-label">Orientation</span>
          <Segmented
            label="Orientation"
            testId="img-orientation"
            value={options.orientation}
            onChange={(orientation) => set({ orientation })}
            options={[
              { value: 'portrait', title: 'Portrait' },
              { value: 'landscape', title: 'Landscape' },
            ]}
          />
        </div>
      )}
      <div className="field">
        <span className="field-label">Margin</span>
        <Segmented
          label="Margin"
          testId="img-margin"
          value={options.margin}
          onChange={(margin) => set({ margin })}
          options={[
            { value: 'none', title: 'None' },
            { value: 'small', title: 'Small' },
            { value: 'big', title: 'Big' },
          ]}
        />
      </div>
      <div className="field">
        <span className="field-label">Output</span>
        <OptionCards
          label="Output"
          testId="img-output"
          value={options.merge ? 'merge' : 'each'}
          onChange={(v) => set({ merge: v === 'merge' })}
          options={[
            { value: 'merge', title: 'One PDF', caption: 'All images, in the order shown in Files.' },
            { value: 'each', title: 'One PDF per image' },
          ]}
        />
      </div>
      <div className="field">
        <span className="field-label">Image quality</span>
        <Segmented
          label="Image quality"
          testId="img-quality"
          value={options.quality}
          onChange={(quality) => set({ quality })}
          options={[
            { value: 'original', title: 'Original' },
            { value: 'small', title: 'Smaller file' },
          ]}
        />
        <p className="field-help">
          {options.quality === 'small'
            ? 'Images are saved again as JPEG, at most 2400 px on the long side.'
            : 'JPEG and PNG go in without re-encoding. Phone photos are turned upright. HEIC, TIFF and WebP are converted.'}
        </p>
      </div>
      <label className="check-line">
        <input type="checkbox" checked={!!options.keepMetadata} onChange={(e) => set({ keepMetadata: e.target.checked })} data-testid="img-keep-metadata" />
        Keep photo metadata
      </label>
      <p className="field-help">
        {options.keepMetadata
          ? 'Camera details, date and location (GPS) stay in the PDF.'
          : 'Camera details, date and location (GPS) are removed from the photos.'}
      </p>
    </>
  )
}

export default {
  id: 'img2pdf',
  name: 'Images to PDF',
  io: 'JPG/PNG/HEIC/TIFF → PDF',
  description: 'One page per image, in your order.',
  category: 'Convert',
  icon: 'image',
  accepts: { min: 1, types: TYPES, noun: 'images' },
  defaults: { pageSize: 'a4', orientation: 'portrait', margin: 'none', merge: true, quality: 'original', keepMetadata: false },
  next: ['compress', 'merge', 'ocr', 'pdf2word'],
  Options,
  summary(files, options) {
    const n = files.length
    if (n === 0) return { ready: false, line: 'Select at least 1 image. JPG, PNG, HEIC, TIFF, WebP, GIF and BMP work.', runLabel: 'Convert to PDF' }
    return {
      ready: true,
      line: options.merge || n === 1 ? `1 PDF will be created from ${plural(n, 'image')}.` : `${n} PDFs will be created, one per image.`,
      runLabel: `Convert ${plural(n, 'image')}`,
    }
  },
  async run(files, options, ctx) {
    const { decodeImages, imagesToPdf } = await import('../../lib/imageOps.js')
    const layout = { pageSize: options.pageSize, orientation: options.orientation, margin: MARGINS[options.margin] ?? 0, dpi: DPI }
    const total = files.length + 1
    const decoded = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, total, `Reading ${f.name}`)
      try {
        decoded.push({ file: f, frames: await decodeImages(f.bytes, { quality: options.quality, keepMetadata: !!options.keepMetadata }) })
      } catch (err) {
        throw new Error(`${f.name}: ${err.message}`)
      }
    }
    ctx.check()
    ctx.progress(files.length, total, 'Building the PDF')
    if (options.merge || files.length === 1) {
      const bytes = await imagesToPdf(decoded.flatMap((d) => d.frames), layout)
      const name = files.length === 1 ? `${stem(files[0].name)}.pdf` : 'images.pdf'
      ctx.progress(total, total, 'Done')
      return [{ name, bytes, parentIds: files.map((f) => f.id) }]
    }
    const outputs = []
    for (const d of decoded) {
      ctx.check()
      outputs.push({ name: `${stem(d.file.name)}.pdf`, bytes: await imagesToPdf(d.frames, layout), parentIds: [d.file.id] })
    }
    ctx.progress(total, total, 'Done')
    return outputs
  },
}
