import { OptionCards } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { OCR_LANGUAGES } from '../../lib/ocrOps.js'
import './g2.css'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const MAX_LANGS = 3

function Options({ options: o, setOptions }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  const toggle = (code) => {
    const on = o.langs.includes(code)
    if (on && o.langs.length === 1) return
    set({ langs: on ? o.langs.filter((c) => c !== code) : [...o.langs, code].slice(-MAX_LANGS) })
  }
  return (
    <>
      <fieldset className="g2-fieldset">
        <legend className="field-label">Document languages</legend>
        <div className="g2-langs" data-testid="ocr-langs">
          {OCR_LANGUAGES.map((l) => (
            <label key={l.code} className={`g2-lang ${o.langs.includes(l.code) ? 'is-on' : ''}`}>
              <input type="checkbox" checked={o.langs.includes(l.code)} onChange={() => toggle(l.code)} data-lang={l.code} />
              {l.name}
            </label>
          ))}
        </div>
        <p className="field-help">Pick up to {MAX_LANGS}. Each language loads once from this site (about 1 to 3 MB), then comes from this browser's storage.</p>
      </fieldset>
      <OptionCards
        label="Pages that already have text"
        testId="ocr-text-pages"
        value={o.textPages}
        onChange={(textPages) => set({ textPages })}
        options={[
          { value: 'skip', title: 'Skip them', caption: 'Only scanned pages are read. No duplicate text.' },
          { value: 'force', title: 'Read every page', caption: 'Also pages with text. An old hidden OCR layer is replaced; visible text stays.' },
        ]}
      />
      <div className="field">
        <span className="field-label">Clean-up</span>
        <label className="check-line">
          <input type="checkbox" checked={o.autoRotate} onChange={(e) => set({ autoRotate: e.target.checked })} />
          Turn sideways and upside-down pages
        </label>
        <label className="check-line">
          <input type="checkbox" checked={o.deskew} onChange={(e) => set({ deskew: e.target.checked })} />
          Straighten tilted scans
        </label>
        <p className="field-help">Pages are read at 300 dpi. The page itself is not changed: the text layer is added on top, invisible, and lines up with the scan.</p>
      </div>
    </>
  )
}

export default {
  id: 'ocr',
  name: 'OCR',
  io: 'scan → searchable PDF',
  description: 'Read text off scans, keep the look.',
  category: 'Optimize',
  icon: 'ocr',
  accepts: { min: 1 },
  defaults: { langs: ['eng'], textPages: 'skip', autoRotate: true, deskew: true },
  next: ['compress', 'pdf2word', 'protect', 'merge'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Make searchable' }
    const n = files.length
    const pages = files.reduce((k, f) => k + (f.pageCount ?? 0), 0)
    const skip = o.textPages === 'skip' ? ' Pages that already have text are skipped.' : ''
    return {
      ready: true,
      line: `${n} searchable PDF${n === 1 ? '' : 's'} will be created from ${plural(pages, 'page')}.${skip}`,
      runLabel: `Make ${plural(n, 'PDF')} searchable`,
    }
  },
  async run(files, o, ctx) {
    const { ocrPdf } = await import('../../lib/ocrOps.js')
    const total = files.reduce((k, f) => k + (f.pageCount || 1), 0)
    const outputs = []
    let before = 0
    const nothing = []
    for (const f of files) {
      ctx.check()
      const share = f.pageCount || 1
      const res = await ocrPdf(f.bytes, {
        langs: o.langs,
        textPages: o.textPages,
        autoRotate: o.autoRotate,
        deskew: o.deskew,
        signal: ctx.signal,
        onProgress: (done, count, label) => {
          const pct = Math.floor((100 * (before + (count ? (done / count) * share : share))) / total)
          ctx.progress(Math.min(99, pct), 100, `${f.name}: ${label}`)
        },
      })
      before += share
      if (res.ocrPages.length === 0) {
        nothing.push(f.name)
        continue
      }
      const parts = [`${plural(res.totalWords, 'word')} recognised on ${plural(res.ocrPages.length, 'page')}.`]
      if (res.replacedPages?.length) parts.push(`The old invisible text layer was replaced on ${plural(res.replacedPages.length, 'page')}.`)
      if (res.visibleTextPages?.length) parts.push(`${plural(res.visibleTextPages.length, 'page')} with visible text kept it, so words there can be found twice.`)
      if (res.skippedPages.length) parts.push(`${plural(res.skippedPages.length, 'page')} already had text and stayed as they were.`)
      if (res.rotatedPages.length) parts.push(`${plural(res.rotatedPages.length, 'page')} read after turning.`)
      if (res.skippedWords) parts.push(`${plural(res.skippedWords, 'word')} left out (no font for them).`)
      outputs.push({ name: `${baseName(f.name)}-ocr.pdf`, bytes: res.bytes, parentIds: [f.id], note: parts.join(' ') })
    }
    if (outputs.length === 0) {
      throw new Error(`${nothing.length === 1 ? 'Every page' : 'Every page of every file'} already has a text layer. Choose "Read every page" to OCR them anyway.`)
    }
    // files whose pages all had text are not in the outputs: say so
    if (nothing.length) outputs[outputs.length - 1].note += ` Already searchable, left as ${nothing.length === 1 ? 'it was' : 'they were'}: ${nothing.join(', ')}.`
    ctx.progress(100, 100, 'Done')
    return outputs
  },
}
