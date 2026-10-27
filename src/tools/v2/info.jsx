import { baseName } from '../../components/usePdfFiles.js'
import { Facts, FilePick, currentFile, formatBytes, plural, useRead } from './structure-shared.jsx'

const yesNo = (v) => (v ? 'Yes' : 'No')

// The key facts of a pdfInfo report as label / value rows.
export function infoRows(i) {
  const m = i.metadata ?? {}
  const kinds = Object.entries(i.images.kinds)
    .map(([k, n]) => `${n} ${k === 'none' ? 'raw' : k.replace(/Decode/g, '')}`)
    .join(', ')
  const js = i.javascript
  const jsLine = js.documentScripts + js.actions + js.triggers + js.launch === 0 ? 'None' : [js.documentScripts && plural(js.documentScripts, 'document script'), js.actions && plural(js.actions, 'action'), js.triggers && plural(js.triggers, 'trigger'), js.launch && plural(js.launch, 'launch action')].filter(Boolean).join(', ')
  const blocked = Object.entries(i.encryption.permissions)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  return [
    ['Title', m.Title],
    ['Author', m.Author],
    ['Producer', m.Producer],
    ['Created with', m.Creator],
    ['PDF version', i.file.version, true],
    ['File size', formatBytes(i.file.size), true],
    ['Pages', String(i.pages.count), true],
    ['Page sizes', i.pages.sizes.map((s) => `${s.size} pt${i.pages.sizes.length > 1 ? ` (${s.count})` : ''}`).join('; '), true],
    ['Fonts', i.fonts.count ? `${i.fonts.count}, ${i.fonts.notEmbedded ? `${i.fonts.notEmbedded} not embedded` : 'all embedded'}` : 'None'],
    ['Images', i.images.count ? `${i.images.count}: ${kinds}` : 'None'],
    ['Form', i.forms.fields ? `${plural(i.forms.fields, 'fillable field')}${i.forms.widgets > i.forms.fields ? ` (${i.forms.widgets} boxes on the pages)` : ''}${i.forms.xfa !== 'none' ? `, ${i.forms.xfa} XFA` : ''}${i.forms.signatures ? `, ${i.forms.signed} of ${plural(i.forms.signatures, 'signature field')} signed` : ''}` : i.forms.xfa !== 'none' ? `${i.forms.xfa} XFA only` : 'None'],
    ['Annotations', String(i.annotations), true],
    ['Bookmarks', String(i.outline.items), true],
    ['Attachments', i.attachments.count ? i.attachments.list.map((a) => a.name).join(', ') : 'None'],
    ['JavaScript', jsLine],
    ['Encryption', i.encryption.encrypted ? `${i.encryption.method}${blocked.length ? `, blocks ${blocked.join(', ')}` : ''}` : 'None'],
    ['Tagged', yesNo(i.structure.tagged)],
    ['PDF/A', m.pdfa ? m.pdfa.toUpperCase() : null],
    ['Fast web view', yesNo(i.file.linearized)],
  ]
}

function Options({ options: o, setOptions, files }) {
  const file = currentFile(files, o.fileId)
  const { data, error } = useRead('pdfInfo', file?.id)
  return (
    <>
      <FilePick files={files} value={file} onChange={(id) => setOptions((x) => ({ ...x, fileId: id }))} />
      {!file && <p className="field-help">Select a PDF in Files.</p>}
      {error && <p className="field-error">{error}</p>}
      {file && !data && !error && <p className="field-help">Reading {file.name}…</p>}
      {data && <Facts rows={infoRows(data)} testId="info-facts" />}
      {data?.fonts.list.length > 0 && (
        <details className="field">
          <summary className="field-label">Font list</summary>
          <ul className="st-list" data-testid="info-fonts">
            {data.fonts.list.slice(0, 200).map((f, k) => (
              <li key={k}>
                <span className="st-name">{f.name}</span>
                <span className="st-meta">
                  {f.type}
                  {f.embedded ? (f.subset ? ', subset' : ', embedded') : ', not embedded'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="field-help">The full report, with every page, font and image, is saved as JSON.</p>
    </>
  )
}

export default {
  id: 'info',
  name: 'PDF info',
  io: 'PDF → report (JSON)',
  description: 'Pages, fonts, images, forms, security and scripts.',
  category: 'Optimize',
  icon: 'info',
  accepts: { min: 1 },
  keepInputs: true,
  defaults: { fileId: null },
  next: ['sanitize', 'metadata', 'compress'],
  Options,
  summary(files) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Export report' }
    return { ready: true, line: `${plural(files.length, 'JSON report')} will be saved.`, runLabel: files.length > 1 ? `Export ${files.length} reports` : 'Export report' }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [k, f] of files.entries()) {
      ctx.check()
      ctx.progress(k, files.length, f.name)
      const info = await ctx.call('doc', 'pdfInfo', f.bytes)
      const json = JSON.stringify({ name: f.name, ...info }, null, 2)
      outputs.push({ name: `${baseName(f.name)}-info.json`, bytes: new TextEncoder().encode(json), type: 'application/json', parentIds: [f.id], note: `${plural(info.pages.count, 'page')}, ${plural(info.fonts.count, 'font')}, ${plural(info.images.count, 'image')}.` })
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
