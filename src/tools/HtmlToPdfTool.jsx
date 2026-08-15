import { useState } from 'react'
import { assertValidOutput } from '../lib/pdfOps.js'
import { downloadBytes, formatBytes } from '../lib/download.js'

const SAMPLE = `<h1>Invoice 2026-114</h1>
<p>Prepared for <b>Acme Ltd</b></p>
<table border="1" cellpadding="6" style="border-collapse:collapse">
  <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
  <tr><td>Consulting</td><td>12</td><td>1,440.00</td></tr>
</table>`

export default function HtmlToPdfTool() {
  const [html, setHtml] = useState('')
  const [pageSize, setPageSize] = useState('a4')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)

  const loadFile = async (file) => {
    setHtml(await file.text())
    setStatus(null)
  }

  const convert = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { htmlToPdf } = await import('../lib/htmlOps.js')
      const bytes = await htmlToPdf(html, {
        pageSize,
        onProgress: (m) => setStatus({ kind: 'ok', text: m }),
      })
      const { pageCount } = await assertValidOutput(bytes)
      downloadBytes(bytes, 'page.pdf')
      setStatus({
        kind: 'ok',
        text: `Created page.pdf (${pageCount} page${pageCount === 1 ? '' : 's'}, ${formatBytes(bytes.length)}) — download started.`,
      })
    } catch (err) {
      setStatus({ kind: 'error', text: `Convert failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool-body">
      <p className="option-help">
        Paste HTML or load an .html file. Scripts are stripped before rendering.
      </p>

      <div className="options-panel">
        <div className="option-row">
          <span>Page size</span>
          {[
            ['a4', 'A4 portrait'],
            ['a4-landscape', 'A4 landscape'],
          ].map(([v, label]) => (
            <label key={v} className="option-inline">
              <input type="radio" name="html-size" checked={pageSize === v} onChange={() => setPageSize(v)} />
              <span>{label}</span>
            </label>
          ))}
          <span style={{ flex: 1 }} />
          <input
            type="file"
            accept=".html,.htm"
            onChange={(e) => e.target.files[0] && loadFile(e.target.files[0])}
          />
          <button className="link-btn" onClick={() => setHtml(SAMPLE)}>
            Use example
          </button>
        </div>
      </div>

      <textarea
        className="text-input html-input"
        data-testid="html-input"
        placeholder="<h1>Hello</h1><p>Paste your HTML here…</p>"
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        rows={14}
      />

      <div className="action-bar">
        <button className="primary-btn" data-testid="html2pdf-btn" onClick={convert} disabled={busy || !html.trim()}>
          {busy ? 'Converting…' : 'Convert to PDF'}
        </button>
      </div>

      {status && (
        <p className={`status status-${status.kind}`} data-testid="status">
          {status.text}
        </p>
      )}
    </div>
  )
}
