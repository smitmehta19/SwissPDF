import { baseName } from '../../components/usePdfFiles.js'
import { plural } from './layoutShared.jsx'

function Options() {
  return (
    <>
      <p className="field-help">
        Rewrites the file so a browser or viewer can show page 1 before the whole file has downloaded (also called fast web view). Pages, text, links and forms stay the same.
      </p>
      <p className="field-help">Best as the last step: any later change undoes it.</p>
    </>
  )
}

export default {
  id: 'linearize',
  name: 'Fast web view',
  io: 'PDF → linearized PDF',
  description: 'Page 1 opens while the rest is still loading.',
  category: 'Optimize',
  icon: 'viewer',
  accepts: { min: 1 },
  defaults: {},
  next: ['protect', 'merge'],
  Options,
  summary(files) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Linearize' }
    return { ready: true, line: `${plural(files.length, 'PDF')} will be set up for fast web view.`, runLabel: `Linearize ${plural(files.length, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Linearizing ${f.name}`)
      const bytes = await ctx.call('layout', 'linearizePdf', f.bytes)
      const before = f.bytes.byteLength
      const grow = bytes.length / before
      const mb = (n) => `${(n / 1048576).toFixed(1)} MB`
      if (grow > 2 && bytes.length - before > 1048576) throw new Error(`Fast web view would make ${f.name} grow from ${mb(before)} to ${mb(bytes.length)}. It was left as it is.`)
      // pages and what they use stay unpacked so page 1 can load first
      const note = grow > 1.2 && bytes.length - before > 20480 ? `${Math.round((grow - 1) * 100)}% larger than before: page objects are stored unpacked so page 1 can load first.` : null
      outputs.push({ name: `${baseName(f.name)}-web.pdf`, bytes, parentIds: [f.id], note })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
