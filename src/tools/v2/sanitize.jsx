import { baseName } from '../../components/usePdfFiles.js'
import { plural } from './structure-shared.jsx'

const ITEMS = [
  ['javascript', 'JavaScript and actions', 'Document scripts, open actions, field and page triggers, launch actions. An XFA copy of a form is dropped; a form that exists only as XFA keeps its form and loses its scripts.'],
  ['embeddedFiles', 'Attached files', 'Embedded files, associated files (e-invoice XML) and file attachment notes.'],
  ['xmp', 'XMP metadata', 'The XML metadata packets of the document and its parts.'],
  ['metadata', 'Document info', 'Title, author, dates and the rest of the info dictionary.'],
  ['links', 'Links out', 'Web links, links to other files and form submit targets. Links inside the PDF stay.'],
  ['fonts', 'Embedded fonts', 'Viewers fall back to their own fonts, so text may look different or break.'],
]

// "24 scripts, 32 triggers, 1 attached file" from the sanitize report.
const NOTHING = 'Nothing found to remove.'

export function reportLine(r) {
  const parts = [
    [r.scripts, 'script'],
    [r.openAction, 'open action'],
    [r.triggers, 'trigger'],
    [r.xfa, 'XFA form'],
    [r.xfaScripts, 'XFA script'],
    [r.attachments, 'attached file'],
    [r.xmp, 'XMP packet'],
    [r.info, 'info dictionary', 'info dictionaries'],
    [r.links, 'link'],
    [r.fonts, 'embedded font'],
  ]
    .filter(([n]) => n > 0)
    .map(([n, w, many]) => plural(n, w, many))
  if (r.earlier) parts.push('what earlier versions of the file left behind')
  return parts.length ? `Removed ${parts.join(', ')}.` : NOTHING
}

function Options({ options: o, setOptions }) {
  return (
    <>
      <div className="st-checks" role="group" aria-label="Remove">
        {ITEMS.map(([k, label, help]) => (
          <label key={k} className="check-line">
            <input type="checkbox" checked={o[k]} data-testid={`san-${k}`} onChange={(e) => setOptions((x) => ({ ...x, [k]: e.target.checked }))} />
            <span>
              {label}
              <span className="field-help" style={{ display: 'block' }}>
                {help}
              </span>
            </span>
          </label>
        ))}
      </div>
      <p className="field-help">Each output lists what was removed.</p>
    </>
  )
}

export default {
  id: 'sanitize',
  name: 'Sanitize',
  io: 'PDF → safe PDF',
  description: 'Remove scripts, hidden files and metadata.',
  category: 'Security',
  icon: 'sanitize',
  accepts: { min: 1 },
  defaults: { javascript: true, embeddedFiles: true, xmp: false, metadata: false, links: false, fonts: false },
  next: ['protect', 'flatten', 'compress'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Sanitize' }
    if (!ITEMS.some(([k]) => o[k])) return { ready: false, line: 'Pick at least one thing to remove.', runLabel: 'Sanitize' }
    return { ready: true, line: `${plural(files.length, 'sanitized PDF')} will be created.`, runLabel: `Sanitize ${plural(files.length, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [k, f] of files.entries()) {
      ctx.check()
      ctx.progress(k, files.length, f.name)
      const res = await ctx.call('doc', 'sanitizePdf', f.bytes, o)
      outputs.push({ name: `${baseName(f.name)}-sanitized.pdf`, bytes: res.bytes, parentIds: [f.id], note: reportLine(res.report), unchanged: reportLine(res.report) === NOTHING })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
