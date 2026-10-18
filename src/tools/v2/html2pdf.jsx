import { Field, OptionCards, Segmented } from '../../app/controls.jsx'
import { ENGINE_BUILD, engineAvailable } from '../../lib/libreOffice.js'
import { loadOfficeEngine, plural, stem } from './convertShared.js'
import { EngineDownload, QUICK_TITLE, engineReady, useEngineReady } from './office2pdf.jsx'

const SAMPLE = `<style>h1 { color: #5b4be6 } td, th { border: 1px solid #999; padding: 6px }</style>
<h1>Invoice 2026-114</h1>
<p>Prepared for <b>Acme Ltd</b></p>
<table style="border-collapse: collapse">
  <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
  <tr><td>Consulting</td><td>12</td><td>1,440.00</td></tr>
</table>`

function Options({ options, setOptions }) {
  useEngineReady(options, setOptions)
  const set = (fields) => setOptions({ ...options, ...fields })
  return (
    <>
      <OptionCards
        label="Engine"
        testId="html-engine"
        value={options.engine}
        onChange={(engine) => set({ engine })}
        options={[
          { value: 'hifi', title: 'Selectable text', caption: 'Through the Office engine. Simple layouts: headings, lists, tables, colours.' },
          { value: 'quick', title: QUICK_TITLE, caption: 'No download. The page is captured exactly as a browser shows it.' },
        ]}
      />
      <EngineDownload options={options} setOptions={setOptions} />
      <div className="field">
        <span className="field-label">Page size</span>
        <Segmented
          label="Page size"
          testId="html-page-size"
          value={options.pageSize}
          onChange={(pageSize) => set({ pageSize })}
          options={[
            { value: 'a4', title: 'A4' },
            { value: 'letter', title: 'US Letter' },
          ]}
        />
      </div>
      <Field label="Paste HTML" help="Optional. Selected .html files are converted too.">
        {(id) => (
          <textarea
            id={id}
            className="input html-paste"
            data-testid="html-input"
            rows={8}
            spellCheck={false}
            placeholder="<h1>Hello</h1>"
            value={options.html}
            onChange={(e) => set({ html: e.target.value })}
          />
        )}
      </Field>
      <div className="btn-row">
        <button type="button" className="btn btn-quiet btn-small" onClick={() => set({ html: SAMPLE })}>
          Use example
        </button>
        {options.html && (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => set({ html: '' })}>
            Clear
          </button>
        )}
      </div>
      <p className="field-help">
        Only what is inside the HTML is used: styles in &lt;style&gt; tags and style attributes, and images embedded as data: URLs. Linked images,
        stylesheets and scripts are not loaded; nothing is fetched.
      </p>
      <p className="field-help">
        Text stays selectable through the Office engine (about {ENGINE_BUILD.downloadMB} MB the first time, cached after). If it cannot run, pages are
        captured as images instead.
      </p>
    </>
  )
}

export default {
  id: 'html2pdf',
  name: 'HTML to PDF',
  io: 'HTML → PDF',
  description: 'Pasted markup or .html files, with their styles.',
  category: 'Convert',
  icon: 'html',
  accepts: { min: 0, types: ['.html', '.htm'], noun: 'HTML files' },
  defaults: { pageSize: 'a4', html: '', engine: 'hifi' },
  next: ['compress', 'merge', 'watermark', 'protect'],
  Options,
  summary(files, options) {
    const n = files.length + (options.html.trim() ? 1 : 0)
    if (n === 0) return { ready: false, line: 'Select an .html file or paste HTML.', runLabel: 'Convert to PDF' }
    const download = options.engine !== 'quick' && engineAvailable() && !engineReady(options)
    const line = `${plural(n, 'PDF')} will be created.${download ? ` The Office engine downloads first, once (about ${ENGINE_BUILD.downloadMB} MB).` : ''}`
    const label = n === 1 ? 'Convert to PDF' : `Convert ${n} pages to PDF`
    return { ready: true, line, runLabel: download ? `Download engine (${ENGINE_BUILD.downloadMB} MB) and convert` : label }
  },
  async run(files, options, ctx) {
    const { htmlToPdf, htmlToPdfHiFi } = await import('../../lib/htmlOps.js')
    const jobs = files.map((f) => ({ name: `${stem(f.name)}.pdf`, html: new TextDecoder().decode(f.bytes), parentIds: [f.id], label: f.name }))
    if (options.html.trim()) jobs.push({ name: 'pasted-html.pdf', html: options.html, parentIds: [], label: 'pasted HTML' })
    // load the engine up front for a real download bar; if it fails, use image mode
    const quick = options.engine === 'quick'
    let engineError = quick ? null : engineAvailable() ? null : 'this tab is not cross-origin isolated'
    if (!quick && !engineError) {
      try {
        await loadOfficeEngine(ctx)
      } catch (err) {
        if (err?.cancelled) throw err
        engineError = err.message
      }
    }
    const outputs = []
    for (const [i, job] of jobs.entries()) {
      ctx.check()
      ctx.progress(i, jobs.length, `Converting ${job.label}`)
      const onProgress = (msg) => {
        ctx.check()
        if (typeof msg === 'string') ctx.progress(i, jobs.length, `${job.label}: ${msg}`)
      }
      let reason = engineError
      const bytes = quick || engineError
        ? await htmlToPdf(job.html, { pageSize: options.pageSize, onProgress })
        : await htmlToPdfHiFi(job.html, {
            pageSize: options.pageSize,
            onProgress,
            signal: ctx.signal,
            onEngine: (engine, why) => {
              if (engine === 'quick') reason = why ?? 'the Office engine failed'
            },
          })
      const note = quick ? 'Quick mode: pages are pictures, text is not selectable.' : reason ? `Image mode (${reason}): the text in this PDF is not selectable.` : null
      outputs.push({ name: job.name, bytes, parentIds: job.parentIds, note })
    }
    ctx.progress(jobs.length, jobs.length, 'Done')
    return outputs
  },
}
