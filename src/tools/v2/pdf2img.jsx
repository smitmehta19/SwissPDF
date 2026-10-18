import { Field, OptionCards, Segmented } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { parseRangeSpec } from '../../lib/pageRanges.js'
import { MIME, plural } from './convertShared.js'

// Pages to export from one file; empty spec = every page. Throws on a bad spec.
function pagesOf(spec, pageCount) {
  if (!String(spec ?? '').trim()) return Array.from({ length: pageCount }, (_, i) => i + 1)
  return [...new Set(parseRangeSpec(spec, pageCount).pages.filter((n) => n >= 1 && n <= pageCount))]
}

function countPages(files, spec) {
  try {
    return { n: files.reduce((s, f) => s + pagesOf(spec, f.pageCount ?? 0).length, 0), error: null }
  } catch (err) {
    return { n: 0, error: err.message }
  }
}

function Options({ options, setOptions, files }) {
  const set = (fields) => setOptions({ ...options, ...fields })
  const { error } = countPages(files, options.pages)
  return (
    <>
      <OptionCards
        label="Mode"
        testId="pdf2img-mode"
        value={options.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'pages', title: 'Page to image', caption: 'Every page becomes one image.' },
          { value: 'extract', title: 'Extract images', caption: 'Save the pictures inside the PDF at their own resolution.' },
        ]}
      />
      <div className="field">
        <span className="field-label">Format</span>
        <Segmented
          label="Format"
          testId="pdf2img-format"
          value={options.format}
          onChange={(format) => set({ format })}
          options={[
            { value: 'jpg', title: 'JPG' },
            { value: 'png', title: 'PNG' },
          ]}
        />
        {options.mode === 'extract' && <p className="field-help">Images with transparency are always saved as PNG.</p>}
      </div>
      {options.mode === 'pages' && (
        <div className="field">
          <span className="field-label">Image quality</span>
          <OptionCards
            label="Image quality"
            testId="pdf2img-dpi"
            columns={2}
            value={options.dpi}
            onChange={(dpi) => set({ dpi })}
            options={[
              { value: 150, title: 'Normal', caption: '150 dpi' },
              { value: 300, title: 'High', caption: '300 dpi' },
            ]}
          />
        </div>
      )}
      <Field label="Pages" help="All pages when empty, or ranges like 1-3, 8.">
        {(id) => (
          <input id={id} className="input" data-testid="range-input" placeholder="All pages" value={options.pages} onChange={(e) => set({ pages: e.target.value })} />
        )}
      </Field>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

export default {
  id: 'pdf2img',
  name: 'PDF to images',
  io: 'PDF → JPG/PNG',
  description: 'Every page as an image, or the pictures inside.',
  category: 'Convert',
  icon: 'camera',
  accepts: { min: 1 },
  keepInputs: true,
  defaults: { mode: 'pages', format: 'jpg', dpi: 150, pages: '' },
  next: ['img2pdf'],
  Options,
  summary(files, options) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Convert to images' }
    const { n, error } = countPages(files, options.pages)
    if (error) return { ready: false, line: 'Fix the page ranges first.', runLabel: 'Convert to images' }
    if (n === 0) return { ready: false, line: 'No pages in the range.', runLabel: 'Convert to images' }
    const fmt = options.format.toUpperCase()
    if (options.mode === 'extract') {
      return { ready: true, line: `Every image on ${plural(n, 'page')} will be saved as ${fmt}, repeats once.`, runLabel: 'Extract images' }
    }
    return { ready: true, line: `${plural(n, `${fmt} image`)} will be created.`, runLabel: `Create ${plural(n, 'image')}` }
  },
  async run(files, options, ctx) {
    const { closeMupdf, extractImages, renderPageForExport } = await import('../../lib/mupdfRender.js')
    const format = options.format === 'png' ? 'image/png' : 'image/jpeg'
    const jobs = files.map((f) => ({ f, pages: pagesOf(options.pages, f.pageCount) }))
    const total = jobs.reduce((s, j) => s + j.pages.length, 0)
    const outputs = []
    let done = 0
    try {
      for (const { f, pages } of jobs) {
        const base = baseName(f.name)
        const pad = (n) => String(n).padStart(String(f.pageCount).length, '0')
        if (options.mode === 'extract') {
          const images = await extractImages(f.bytes, pages, {
            format,
            check: ctx.check,
            onPage: (i, n) => ctx.progress(done + i, total, `${f.name}, page ${i} of ${n}`),
          })
          images.forEach((img, i) =>
            outputs.push({ name: `${base}-image${String(i + 1).padStart(3, '0')}.${img.type}`, bytes: img.bytes, type: MIME[img.type], parentIds: [f.id] }),
          )
          done += pages.length
          continue
        }
        for (const n of pages) {
          ctx.check()
          ctx.progress(done, total, `${f.name}, page ${n}`)
          const img = await renderPageForExport(f.bytes, n, { dpi: options.dpi, format, quality: 0.9 })
          outputs.push({
            name: `${base}-page${pad(n)}.${options.format}`,
            bytes: img.bytes,
            type: format,
            parentIds: [f.id],
            note: img.engine === 'mupdf' ? 'Drawn with the second engine: the first one showed this page blank.' : null,
          })
          done++
        }
      }
    } finally {
      closeMupdf()
    }
    if (outputs.length === 0) throw new Error('No images found in the selected pages.')
    ctx.progress(total, total, 'Done')
    return outputs
  },
}
