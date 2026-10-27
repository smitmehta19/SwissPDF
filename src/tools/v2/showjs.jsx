import { baseName } from '../../components/usePdfFiles.js'
import { FilePick, currentFile, plural, useRead } from './structure-shared.jsx'

const WHERE = {
  document: 'Document script',
  open: 'Runs on open',
  'document-event': 'Document event',
  field: 'Form field',
  page: 'Page event',
  annotation: 'Annotation',
  xfa: 'XFA form',
}

const label = (s) => [WHERE[s.where] ?? s.where, s.name, s.event, s.page && `page ${s.page}`].filter(Boolean).join(' · ')

// One text file per PDF: every script under a comment that says where it
// sits. The scripts are only listed, never run.
export function scriptReport(name, scripts) {
  const head = `// JavaScript found in ${name}: ${plural(scripts.length, 'script')}\n// Listed only, not run.\n`
  return head + scripts.map((s, i) => `\n// ---- ${i + 1}. ${label(s).replace(/[\r\n]+/g, ' ')}\n${s.code}\n`).join('')
}

function Options({ options: o, setOptions, files }) {
  const file = currentFile(files, o.fileId)
  const { data, error } = useRead('listJavaScript', file?.id)
  return (
    <>
      <FilePick files={files} value={file} onChange={(id) => setOptions((x) => ({ ...x, fileId: id }))} />
      {!file && <p className="field-help">Select a PDF in Files.</p>}
      {error && <p className="field-error">{error}</p>}
      {file && !data && !error && <p className="field-help">Reading {file.name}…</p>}
      {data && (
        <div className="field">
          <span className="field-label">
            Scripts <span className="mono st-count">{data.length}</span>
          </span>
          {data.length === 0 ? (
            <p className="field-help" data-testid="js-empty">
              No JavaScript in this PDF.
            </p>
          ) : (
            <div className="st-scripts" data-testid="js-list">
              {data.slice(0, 300).map((s, i) => (
                <details key={i} className="st-script">
                  <summary>
                    <span className="st-name">{label(s)}</span>
                  </summary>
                  <pre className="mono">{s.code.length > 20000 ? `${s.code.slice(0, 20000)}\n…` : s.code}</pre>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="field-help">Scripts are shown as text and never run. Export saves them all in one .js file.</p>
    </>
  )
}

export default {
  id: 'showjs',
  name: 'Show JavaScript',
  io: 'PDF → scripts (.js)',
  description: 'List every script inside a PDF, without running it.',
  category: 'Security',
  icon: 'script',
  accepts: { min: 1 },
  keepInputs: true,
  defaults: { fileId: null },
  next: ['sanitize', 'info'],
  Options,
  summary(files) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Export scripts' }
    return { ready: true, line: `The scripts of ${plural(files.length, 'PDF')} will be saved as .js text.`, runLabel: 'Export scripts' }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [k, f] of files.entries()) {
      ctx.check()
      ctx.progress(k, files.length, f.name)
      const scripts = await ctx.call('doc', 'listJavaScript', f.bytes)
      if (!scripts.length) continue
      const text = scriptReport(f.name, scripts)
      outputs.push({ name: `${baseName(f.name)}-javascript.js`, bytes: new TextEncoder().encode(text), type: 'text/javascript', parentIds: [f.id], note: `${plural(scripts.length, 'script')}.` })
    }
    if (!outputs.length) throw new Error(`No JavaScript found in ${files.length === 1 ? files[0].name : 'the selected PDFs'}.`)
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
