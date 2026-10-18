// PDF to Word, Excel and PowerPoint (officeOps). Outputs join the workspace
// next to the PDF, which stays as it is.
import { OptionCards } from '../../app/controls.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { MIME, pageProgress, plural, useScannedNames } from './convertShared.js'

function ScanWarning({ files }) {
  const names = useScannedNames(files)
  if (names.length === 0) return null
  const list = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ')
  return (
    <p className="notice notice-warn" role="status" data-testid="ocr-warning">
      OCR is needed: {list} {names.length === 1 ? 'looks' : 'look'} scanned. The text is read from the page images, which is slower and less exact. The first run downloads the OCR engine.
    </p>
  )
}

function WordOptions({ options, setOptions, files }) {
  return (
    <>
      <OptionCards
        label="Layout"
        testId="docx-layout"
        value={options.layout}
        onChange={(layout) => setOptions({ ...options, layout })}
        options={[
          { value: 'flow', title: 'Flowing text', caption: 'Paragraphs and tables reflow as you type. Reports, letters.' },
          { value: 'exact', title: 'Exact layout', caption: 'Every block stays where it was. Invoices, forms, payslips.' },
        ]}
      />
      <ScanWarning files={files} />
    </>
  )
}

function ExcelOptions({ options, setOptions, files }) {
  return (
    <>
      <p className="field-help">Ruled tables become real rows and columns, numbers stay numbers.</p>
      <label className="check-line">
        <input type="checkbox" data-testid="xlsx-join-pages" checked={!!options.joinPages} onChange={(e) => setOptions({ ...options, joinPages: e.target.checked })} />
        Join pages into one sheet (a table that runs over a page break continues)
      </label>
      <ScanWarning files={files} />
    </>
  )
}

function PptOptions() {
  return <p className="field-help">Each page becomes one slide. Text stays editable in text boxes; pictures and drawings keep their place.</p>
}

const details = (res) =>
  [
    res.tables ? plural(res.tables, 'table') : null,
    res.images ? plural(res.images, 'image') : null,
    res.fields ? plural(res.fields, 'form field') : null,
    res.cells ? plural(res.cells, 'cell') : null,
    res.ocrPages ? `${plural(res.ocrPages, 'page')} read with OCR` : null,
  ]
    .filter(Boolean)
    .join(', ') || null

function makeTool({ id, name, io, description, icon, ext, Options, defaults = {}, convert, next }) {
  return {
    id,
    name,
    io,
    description,
    category: 'Convert',
    icon,
    accepts: { min: 1 },
    keepInputs: true,
    defaults,
    next,
    Options,
    summary(files) {
      const n = files.length
      if (n === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: `Convert to ${ext.toUpperCase()}` }
      return { ready: true, line: `${plural(n, `${ext.toUpperCase()} file`)} will be created. The PDF stays as it is.`, runLabel: `Convert ${plural(n, 'PDF')}` }
    },
    async run(files, options, ctx) {
      const total = files.reduce((s, f) => s + (f.pageCount ?? 1), 0)
      const outputs = []
      let before = 0
      for (const f of files) {
        ctx.check()
        ctx.progress(before, total, `Reading ${f.name}`)
        const res = await convert(f, options, pageProgress(ctx, before, total, f.name))
        outputs.push({ name: `${baseName(f.name)}.${ext}`, bytes: res.bytes, type: MIME[ext], parentIds: [f.id], note: details(res) })
        before += f.pageCount ?? 1
      }
      ctx.progress(total, total, 'Done')
      return outputs
    },
  }
}

export const pdf2word = makeTool({
  id: 'pdf2word',
  name: 'PDF to Word',
  io: 'PDF → DOCX',
  description: 'Editable text, flowing or in exact layout.',
  icon: 'word',
  ext: 'docx',
  Options: WordOptions,
  defaults: { layout: 'flow' },
  next: ['word2pdf', 'pdf2excel', 'pdf2md'],
  async convert(f, options, onProgress) {
    const { pdfToDocx } = await import('../../lib/officeOps.js')
    return pdfToDocx(f.bytes, onProgress, options.layout)
  },
})

export const pdf2excel = makeTool({
  id: 'pdf2excel',
  name: 'PDF to Excel',
  io: 'PDF → XLSX',
  description: 'Tables into real rows and columns.',
  icon: 'excel',
  ext: 'xlsx',
  Options: ExcelOptions,
  defaults: { joinPages: false },
  next: ['excel2pdf', 'pdf2word'],
  async convert(f, options, onProgress) {
    const { pdfToXlsx } = await import('../../lib/officeOps.js')
    return pdfToXlsx(f.bytes, onProgress, { joinPages: !!options.joinPages })
  },
})

export const pdf2ppt = makeTool({
  id: 'pdf2ppt',
  name: 'PDF to PowerPoint',
  io: 'PDF → PPTX',
  description: 'One slide per page.',
  icon: 'ppt',
  ext: 'pptx',
  Options: PptOptions,
  next: ['ppt2pdf', 'pdf2img'],
  async convert(f, _options, onProgress) {
    const { pdfToPptx } = await import('../../lib/officeOps.js')
    return { bytes: await pdfToPptx(f.bytes, f.pageCount, onProgress) }
  },
})
