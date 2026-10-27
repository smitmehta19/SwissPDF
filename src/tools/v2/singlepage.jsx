import { baseName } from '../../components/usePdfFiles.js'
import { ImposeHelp, keptNote, plural } from './layoutShared.jsx'

function Options() {
  return (
    <>
      <p className="field-help">Every page is stacked top to bottom on one tall page, for scrolling or a long print roll.</p>
      <ImposeHelp />
    </>
  )
}

export default {
  id: 'singlepage',
  name: 'Single large page',
  io: 'PDF → 1 tall page',
  description: 'Stack all pages into one long page.',
  category: 'Organize',
  icon: 'files',
  accepts: { min: 1 },
  defaults: {},
  next: ['pdf2img', 'compress'],
  Options,
  summary(files) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Make one page' }
    const pages = files.reduce((s, f) => s + (f.pageCount ?? 0), 0)
    // a Letter page is 11 in tall; a PDF page can be 200 in
    const tall = files.some((f) => (f.pageCount ?? 0) > 18)
    return {
      ready: true,
      line: `${plural(pages, 'page')} will become ${plural(files.length, 'single page')}.${tall ? ' Past 200 inches the result is scaled down to fit the PDF page limit.' : ''}`,
      runLabel: `Make ${plural(files.length, 'single-page PDF')}`,
    }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Stacking ${f.name}`)
      const { bytes, scale, report } = await ctx.call('layout', 'singleLargePage', f.bytes)
      const note = [scale < 1 ? `Scaled to ${Math.round(scale * 100)}% to stay within the 200 inch page limit.` : null, keptNote(report)].filter(Boolean).join(' ') || null
      outputs.push({ name: `${baseName(f.name)}-single-page.pdf`, bytes, parentIds: [f.id], note })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
