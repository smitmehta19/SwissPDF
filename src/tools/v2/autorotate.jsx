import { Field } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { OSD_THRESHOLD } from '../../lib/ocrOps.js'
import './g2.css'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function Options({ options: o, setOptions }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  return (
    <>
      <Field label="Confidence threshold" help="How sure the text direction must be before a page is turned. Lower turns more pages, higher only the clear cases.">
        {(id) => (
          <div className="g2-range">
            <input
              id={id}
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={o.threshold}
              data-testid="autorotate-threshold"
              onChange={(e) => set({ threshold: Number(e.target.value) })}
            />
            <span className="mono">{o.threshold.toFixed(1)}</span>
          </div>
        )}
      </Field>
      <label className="check-line">
        <input type="checkbox" checked={o.infer} onChange={(e) => set({ infer: e.target.checked })} data-testid="autorotate-infer" />
        Turn unclear pages like the rest
      </label>
      <p className="field-help">
        For pages with too little text to tell, such as a blank back page in a batch scanned upside down. Only the page rotation changes, the content stays as
        it is.
      </p>
    </>
  )
}

export default {
  id: 'autorotate',
  name: 'Auto rotate',
  io: 'scan → upright PDF',
  description: 'Find sideways and upside-down pages, turn them upright.',
  category: 'Organize',
  icon: 'rotate',
  accepts: { min: 1 },
  defaults: { threshold: OSD_THRESHOLD, infer: true },
  next: ['ocr', 'compress', 'merge'],
  Options,
  summary(files) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Auto rotate' }
    const n = files.length
    const pages = files.reduce((k, f) => k + (f.pageCount ?? 0), 0)
    return { ready: true, line: `${plural(pages, 'page')} checked, sideways ones turned upright.`, runLabel: `Auto rotate ${plural(n, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const { autoRotatePdf } = await import('../../lib/ocrOps.js')
    const total = files.reduce((k, f) => k + (f.pageCount || 1), 0)
    const outputs = []
    let before = 0
    for (const f of files) {
      ctx.check()
      const share = f.pageCount || 1
      const res = await autoRotatePdf(f.bytes, {
        threshold: o.threshold,
        infer: o.infer,
        signal: ctx.signal,
        onProgress: (done, count, label) => ctx.progress(Math.min(99, Math.floor((100 * (before + (count ? (done / count) * share : share))) / total)), 100, `${f.name}: ${label}`),
      })
      before += share
      const unclear = res.pages.filter((p) => p.confidence < o.threshold && !p.inferred).length
      const parts = [res.turned.length ? `${plural(res.turned.length, 'page')} turned upright (${pagesList(res.turned)}).` : 'Every page was already upright.']
      if (unclear) parts.push(`${plural(unclear, 'page')} had too little text to tell and stayed as ${unclear === 1 ? 'it was' : 'they were'}.`)
      outputs.push({ name: `${baseName(f.name)}-rotated.pdf`, bytes: res.bytes, parentIds: [f.id], note: parts.join(' ') })
    }
    ctx.progress(100, 100, 'Done')
    return outputs
  },
}

// "1, 3-5, 9"
function pagesList(list) {
  const parts = []
  for (let i = 0; i < list.length; i++) {
    let j = i
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++
    parts.push(j > i ? `p. ${list[i]}-${list[j]}` : `p. ${list[i]}`)
    i = j
  }
  return parts.join(', ')
}
