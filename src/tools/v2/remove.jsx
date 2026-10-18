import { baseName } from '../../components/usePdfFiles.js'
import { PagePicker, picksFor, plural } from './pagePicks.jsx'

function Options(props) {
  return <PagePicker {...props} label="Pages to remove" />
}

export default {
  id: 'remove',
  name: 'Remove pages',
  io: 'PDF → PDF',
  description: 'Delete the pages you pick.',
  category: 'Organize',
  icon: 'remove',
  workbench: 'pages',
  accepts: { min: 1 },
  defaults: { picks: {} },
  next: ['merge', 'compress', 'pagenumbers', 'split'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select a PDF to remove pages from.', runLabel: 'Remove pages' }
    const used = files.filter((f) => picksFor(o, f).length)
    if (used.length === 0) return { ready: false, line: 'Pick the pages to remove.', runLabel: 'Remove pages' }
    const all = used.find((f) => picksFor(o, f).length >= f.pageCount)
    if (all) return { ready: false, line: `Every page of ${all.name} is picked. Leave at least one.`, runLabel: 'Remove pages' }
    const pages = used.reduce((n, f) => n + picksFor(o, f).length, 0)
    const left = used.reduce((n, f) => n + f.pageCount - picksFor(o, f).length, 0)
    const where = used.length === 1 ? used[0].name : plural(used.length, 'file')
    return { ready: true, line: `${plural(pages, 'page')} will be removed from ${where}, ${left} left.`, runLabel: `Remove ${plural(pages, 'page')}` }
  },
  async run(files, o, ctx) {
    const used = files.filter((f) => picksFor(o, f).length)
    const outputs = []
    for (const [i, f] of used.entries()) {
      ctx.check()
      ctx.progress(i, used.length, `Removing pages from ${f.name}`)
      outputs.push({ name: `${baseName(f.name)}-removed.pdf`, bytes: await ctx.call('remove', f.bytes, picksFor(o, f)), parentIds: [f.id] })
    }
    ctx.progress(used.length, used.length, 'Done')
    return outputs
  },
}
