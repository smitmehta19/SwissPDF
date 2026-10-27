import { baseName } from '../../components/usePdfFiles.js'
import { NOTICE_REPAIRED } from '../../lib/intake.js'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function Options() {
  return (
    <>
      <p className="field-help">
        The file structure is rebuilt with the MuPDF engine. Bookmarks, links and form fields are kept when the damage allows it; otherwise every page that
        can be read is recovered, and pages that cannot be read as they are come back as images.
      </p>
      <p className="field-help">Files that could not be opened at all show their error in Files. Damage found when a file is added is already repaired there.</p>
    </>
  )
}

function describe(res, repairedOnAdd) {
  const parts = []
  if (res.method === 'rewrite') {
    parts.push(`Rebuilt the file structure. All ${plural(res.pageCount, 'page')} kept as they were, with any bookmarks, links and form fields.`)
  } else {
    parts.push(`${res.recovered} of ${plural(res.pageCount, 'page')} recovered intact.`)
    if (res.rasterized) parts.push(`${plural(res.rasterized, 'page')} rebuilt as images.`)
    if (res.lost) parts.push(`${plural(res.lost, 'page')} beyond saving.`)
    parts.push(res.outlines ? `${plural(res.outlines, 'bookmark')} kept; form fields could not be kept.` : 'Bookmarks and form fields could not be kept.')
  }
  if (repairedOnAdd) parts.push('Damage was also found and fixed when the file was added.')
  return parts.join(' ')
}

export default {
  id: 'repair',
  name: 'Repair',
  io: 'broken PDF → PDF',
  description: 'Rebuild damaged files, keep what can be kept.',
  category: 'Optimize',
  icon: 'repair',
  accepts: { min: 1 },
  defaults: {},
  next: ['compress', 'ocr', 'merge'],
  Options,
  summary(files) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Repair' }
    const n = files.length
    return { ready: true, line: `${n} repaired PDF${n === 1 ? '' : 's'} will be created.`, runLabel: `Repair ${plural(n, 'PDF')}` }
  },
  async run(files, _o, ctx) {
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Repairing ${f.name}`)
      const res = await ctx.call('repair', f.bytes)
      outputs.push({
        name: `${baseName(f.name)}-repaired.pdf`,
        bytes: res.bytes,
        parentIds: [f.id],
        note: describe(res, (f.notices ?? []).includes(NOTICE_REPAIRED)),
      })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
