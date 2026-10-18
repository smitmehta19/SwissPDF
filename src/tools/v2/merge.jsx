import { sortBy } from '../../app/fileStore.js'
import { baseName } from '../../components/usePdfFiles.js'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function Options() {
  return (
    <>
      <div className="field">
        <span className="field-label">Order</span>
        <div className="btn-row">
          <button type="button" className="btn btn-quiet" onClick={() => sortBy('name', 'asc')}>
            Name A to Z
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => sortBy('name', 'desc')}>
            Name Z to A
          </button>
        </div>
        <p className="field-help">Files merge in the order shown. Drag cards in Files to change it, or drop and reorder pages in Pages first.</p>
      </div>
    </>
  )
}

export default {
  id: 'merge',
  name: 'Merge',
  io: '2+ PDF → 1 PDF',
  description: 'Combine files in the order you set.',
  category: 'Organize',
  icon: 'merge',
  accepts: { min: 2 },
  defaults: {},
  next: ['compress', 'watermark', 'pagenumbers', 'protect'],
  Options,
  summary(files) {
    const pages = files.reduce((n, f) => n + (f.pageCount ?? 0), 0)
    if (files.length < 2) {
      return { ready: false, line: files.length === 1 ? 'Select one more PDF to merge.' : 'Select at least 2 PDFs to merge.', runLabel: 'Merge PDFs' }
    }
    return {
      ready: true,
      line: `1 PDF will be created from ${plural(files.length, 'file')}, ${plural(pages, 'page')}.`,
      runLabel: `Merge ${files.length} PDFs`,
    }
  },
  async run(files, _options, ctx) {
    ctx.progress(0, 1, 'Merging')
    const bytes = await ctx.call(
      'merge',
      files.map((f) => ({ bytes: f.bytes, name: baseName(f.name) })),
    )
    ctx.progress(1, 1, 'Merged')
    return [{ name: 'merged.pdf', bytes, parentIds: files.map((f) => f.id) }]
  },
}
