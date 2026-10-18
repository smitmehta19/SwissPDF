import { OptionCards, Segmented } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import './organize.css'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const TURNS = [
  { value: 90, title: 'Right' },
  { value: 270, title: 'Left' },
  { value: 180, title: '180°' },
]
const angleOf = (o, f) => o.perFile?.[f.id] ?? o.angle

function Options({ options: o, setOptions, files }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  return (
    <>
      <OptionCards
        label="Pages to rotate"
        columns={3}
        testId="rotate-which"
        value={o.which}
        onChange={(which) => set({ which })}
        options={[
          { value: 'all', title: 'All' },
          { value: 'portrait', title: 'Portrait' },
          { value: 'landscape', title: 'Landscape' },
        ]}
      />
      <div className="field">
        <span className="field-label">Rotation</span>
        <Segmented label="Rotation" testId="rotate-angle" value={o.angle} onChange={(angle) => set({ angle, perFile: {} })} options={TURNS} />
      </div>
      {files.length > 1 && (
        <div className="field">
          <span className="field-label">Per file</span>
          <ul className="pick-rows" data-testid="rotate-files">
            {files.map((f) => (
              <li key={f.id} className="pick-row">
                <span className="file-name" title={f.name}>
                  {f.name}
                </span>
                <Segmented
                  label={`Rotation for ${f.name}`}
                  value={angleOf(o, f)}
                  onChange={(a) => set({ perFile: { ...o.perFile, [f.id]: a } })}
                  options={TURNS}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="field-help">Portrait and landscape go by how the page looks, so a page already turned sideways counts as landscape. The rotate button on a file card turns one file right.</p>
    </>
  )
}

export default {
  id: 'rotate',
  name: 'Rotate',
  io: 'PDF → PDF',
  description: 'Turn all pages, or only portrait or landscape ones.',
  category: 'Organize',
  icon: 'rotate',
  accepts: { min: 1 },
  defaults: { which: 'all', angle: 90, perFile: {} },
  next: ['merge', 'compress', 'split', 'pagenumbers'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select a PDF to rotate.', runLabel: 'Rotate' }
    const what = o.which === 'all' ? 'all pages' : `${o.which} pages only`
    return {
      ready: true,
      line: `${plural(files.length, 'rotated PDF')} will be created, ${what}.`,
      runLabel: `Rotate ${plural(files.length, 'PDF')}`,
    }
  },
  async run(files, o, ctx) {
    const outputs = []
    let skipped = 0
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Rotating ${f.name}`)
      let pages = null
      if (o.which !== 'all') {
        const seen = await ctx.call('orientations', f.bytes)
        pages = seen.flatMap((s, j) => (s === o.which ? [j + 1] : []))
        if (pages.length === 0) {
          skipped++
          continue
        }
      }
      const bytes = await ctx.call('rotate', f.bytes, angleOf(o, f), pages)
      const note = pages ? `${plural(pages.length, `${o.which} page`)} of ${f.pageCount} turned.` : null
      outputs.push({ name: `${baseName(f.name)}-rotated.pdf`, bytes, parentIds: [f.id], note })
    }
    if (outputs.length === 0) throw new Error(`No ${o.which} pages in ${files.length === 1 ? files[0].name : 'the selected files'}, nothing to rotate.`)
    if (skipped) outputs[0].note = `${outputs[0].note ?? ''} ${plural(skipped, 'file')} had no ${o.which} pages and stayed as it was.`.trim()
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
