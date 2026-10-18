import { baseName } from '../../components/usePdfFiles.js'
import { formatPages } from '../../lib/pageRanges.js'
import { PagePicker, picksFor, plural } from './pagePicks.jsx'

function Options(props) {
  const { options, setOptions } = props
  return (
    <>
      <PagePicker {...props} label="Pages to extract" />
      <label className="check-line">
        <input type="checkbox" checked={options.separate} onChange={(e) => setOptions({ ...options, separate: e.target.checked })} data-testid="extract-separate" />
        Save each page as its own PDF
      </label>
    </>
  )
}

const label = (pages) => {
  const spec = formatPages(pages).replace(/, /g, '_')
  return spec.length <= 40 ? spec : 'extracted'
}

export default {
  id: 'extract',
  name: 'Extract pages',
  io: 'PDF → PDF',
  description: 'Keep only the pages you pick.',
  category: 'Organize',
  icon: 'extract',
  workbench: 'pages',
  accepts: { min: 1 },
  defaults: { separate: false, picks: {} },
  next: ['merge', 'rotate', 'compress', 'split'],
  Options,
  summary(files, o) {
    const used = files.filter((f) => picksFor(o, f).length)
    const pages = used.reduce((n, f) => n + picksFor(o, f).length, 0)
    if (files.length === 0) return { ready: false, line: 'Select a PDF to extract pages from.', runLabel: 'Extract pages' }
    if (pages === 0) return { ready: false, line: 'Pick the pages to keep.', runLabel: 'Extract pages' }
    const outs = o.separate ? pages : used.length
    const from = used.length > 1 ? ` from ${plural(used.length, 'file')}` : ''
    return { ready: true, line: `${plural(pages, 'page')}${from} will be extracted into ${plural(outs, 'PDF')}.`, runLabel: `Extract ${plural(pages, 'page')}` }
  },
  async run(files, o, ctx) {
    const used = files.filter((f) => picksFor(o, f).length)
    const outputs = []
    for (const [i, f] of used.entries()) {
      ctx.check()
      ctx.progress(i, used.length, `Extracting from ${f.name}`)
      const pages = picksFor(o, f)
      const base = baseName(f.name)
      if (o.separate) {
        const parts = await ctx.call('split', f.bytes, pages.map((n) => ({ from: n, to: n })))
        parts.forEach((p) => outputs.push({ name: `${base}_${p.from}.pdf`, bytes: p.bytes, parentIds: [f.id] }))
      } else {
        outputs.push({ name: `${base}_${label(pages)}.pdf`, bytes: await ctx.call('extract', f.bytes, pages), parentIds: [f.id] })
      }
    }
    ctx.progress(used.length, used.length, 'Done')
    return outputs
  },
}
