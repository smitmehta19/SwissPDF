import { OptionCards } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'

const RASTER = {
  good: { width: 1300, quality: 0.8 },
  smaller: { width: 1000, quality: 0.7 },
  smallest: { width: 800, quality: 0.6 },
}

function Options({ options, setOptions }) {
  return (
    <>
      <OptionCards
        label="Compression"
        testId="compress-mode"
        value={options.mode}
        onChange={(mode) => setOptions({ ...options, mode })}
        options={[
          { value: 'clean', title: 'Smart clean', caption: 'Text stays selectable. Best for most documents.' },
          { value: 'raster', title: 'Maximum', caption: 'Pages become images. Much smaller, text is no longer selectable.' },
        ]}
      />
      {options.mode === 'raster' && (
        <div className="field">
          <span className="field-label">Image quality</span>
          <OptionCards
            label="Image quality"
            columns={3}
            value={options.preset}
            onChange={(preset) => setOptions({ ...options, preset })}
            options={[
              { value: 'good', title: 'Good' },
              { value: 'smaller', title: 'Smaller' },
              { value: 'smallest', title: 'Smallest' },
            ]}
          />
        </div>
      )}
      {options.mode === 'clean' && <p className="field-help">The first run loads the PDF engine once (about 10 MB, then cached).</p>}
    </>
  )
}

export default {
  id: 'compress',
  name: 'Compress',
  io: 'PDF → smaller PDF',
  description: 'Keep text sharp, or go for the smallest file.',
  category: 'Optimize',
  icon: 'compress',
  accepts: { min: 1 },
  defaults: { mode: 'clean', preset: 'good' },
  next: ['protect', 'watermark', 'merge', 'split'],
  Options,
  summary(files) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Compress' }
    const n = files.length
    return {
      ready: true,
      line: `${n} compressed PDF${n === 1 ? '' : 's'} will be created. Never larger than the original.`,
      runLabel: `Compress ${n} PDF${n === 1 ? '' : 's'}`,
    }
  },
  async run(files, options, ctx) {
    const outputs = []
    const total = files.reduce((n, f) => n + (options.mode === 'raster' ? f.pageCount : 1), 0)
    let done = 0
    for (const f of files) {
      const before = f.bytes.byteLength
      let bytes
      let note = null
      if (options.mode === 'clean') {
        ctx.progress(done, total, `Cleaning ${f.name}`)
        const res = await ctx.call('clean', f.bytes)
        bytes = res.bytes
        note = res.note
        done++
      } else {
        const { width, quality } = RASTER[options.preset] ?? RASTER.good
        const { renderPageToImage } = await import('../../lib/pdfText.js')
        const { imagesToPdf, normalizeImage } = await import('../../lib/imageOps.js')
        const images = []
        for (let n = 1; n <= f.pageCount; n++) {
          ctx.check()
          ctx.progress(done, total, `${f.name}, page ${n} of ${f.pageCount}`)
          const img = await renderPageToImage(f.bytes, n, { width, format: 'image/jpeg', quality })
          images.push(await normalizeImage(img.bytes))
          done++
        }
        ctx.check()
        bytes = await imagesToPdf(images, { pageSize: 'fit' })
        if (bytes.length >= before) {
          bytes = f.bytes.slice()
          note = 'Already smaller than the image version, kept the original.'
        }
      }
      if (bytes.length > before) {
        bytes = f.bytes.slice()
        note = 'Already optimized, kept the original.'
      }
      outputs.push({ name: `${baseName(f.name)}-compressed.pdf`, bytes, parentIds: [f.id], before, note })
    }
    ctx.progress(total, total, 'Done')
    return outputs
  },
}
