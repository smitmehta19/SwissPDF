import { baseName } from '../../components/usePdfFiles.js'
import { MIME, pageProgress, plural } from './convertShared.js'

function Options({ options, setOptions }) {
  return (
    <>
      <p className="field-help">Headings, tables, lists, bold and italic are kept. Scanned pages have no text to convert: run OCR first.</p>
      <label className="check-line">
        <input type="checkbox" data-testid="md-page-rule" checked={options.pageRule} onChange={(e) => setOptions({ ...options, pageRule: e.target.checked })} />
        Separate pages with a horizontal rule (---)
      </label>
    </>
  )
}

export default {
  id: 'pdf2md',
  name: 'PDF to Markdown',
  io: 'PDF → MD',
  description: 'Headings, tables and lists preserved.',
  category: 'Convert',
  icon: 'markdown',
  accepts: { min: 1 },
  keepInputs: true,
  defaults: { pageRule: true },
  next: ['pdf2word', 'ocr'],
  Options,
  summary(files) {
    const n = files.length
    if (n === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Convert to Markdown' }
    return { ready: true, line: `${plural(n, 'Markdown file')} will be created. The PDF stays as it is.`, runLabel: `Convert ${plural(n, 'PDF')}` }
  },
  async run(files, options, ctx) {
    const { pdfToMarkdown } = await import('../../lib/markdownOps.js')
    const total = files.reduce((s, f) => s + (f.pageCount ?? 1), 0)
    const outputs = []
    let before = 0
    for (const f of files) {
      ctx.check()
      const res = await pdfToMarkdown(f.bytes, { pageRule: options.pageRule, onProgress: pageProgress(ctx, before, total, f.name) })
      const note = [res.headings ? plural(res.headings, 'heading') : null, res.tables ? plural(res.tables, 'table') : null].filter(Boolean).join(', ')
      outputs.push({
        name: `${baseName(f.name)}.md`,
        bytes: new TextEncoder().encode(res.text),
        type: MIME.md,
        parentIds: [f.id],
        note: res.text.trim() ? note || null : 'No text found. If this is a scan, run OCR first.',
      })
      before += f.pageCount ?? 1
    }
    ctx.progress(total, total, 'Done')
    return outputs
  },
}
