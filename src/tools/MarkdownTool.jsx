import { useEffect, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import FileGroups from '../components/FileGroups.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import PagePreview from '../components/PagePreview.jsx'
import { usePdfFiles, baseName } from '../components/usePdfFiles.js'
import { deliverOutputs } from '../lib/deliver.js'

export default function MarkdownTool() {
  const { items, validItems, addFiles, reorder, remove } = usePdfFiles()
  const [pageRule, setPageRule] = useState(true)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [status, setStatus] = useState(null)
  const inspector = useInspector()

  useEffect(() => {
    if (!inspector.target && validItems.length > 0) inspector.inspect(validItems[0], 1)
  }, [validItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (previewOnly) => {
    setBusy(true)
    setStatus(null)
    try {
      const { pdfToMarkdown } = await import('../lib/markdownOps.js')
      const outputs = []
      let first = ''
      let totals = { tables: 0, headings: 0 }
      for (const item of validItems) {
        const res = await pdfToMarkdown(item.bytes, {
          pageRule,
          onProgress: (m) => setProgress(`${item.file.name} — ${m}`),
        })
        if (!first) first = res.text
        totals.tables += res.tables
        totals.headings += res.headings
        outputs.push({
          name: `${baseName(item.file.name)}.md`,
          bytes: new TextEncoder().encode(res.text),
          mime: 'text/markdown',
        })
        if (previewOnly) break
      }
      setPreview(first)
      if (!previewOnly) {
        const summary = await deliverOutputs(outputs, 'swisspdf-markdown.zip', { kind: 'binary' })
        setStatus({
          kind: 'ok',
          text: `${totals.headings} heading${totals.headings === 1 ? '' : 's'}, ${totals.tables} table${totals.tables === 1 ? '' : 's'} converted. ${summary}`,
        })
      }
    } catch (err) {
      setStatus({ kind: 'error', text: `Convert failed: ${err.message}` })
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />
      <p className="option-help">
        Headings, tables, lists, bold and italic preserved.
      </p>

      {items.length > 0 && (
        <div className="options-panel">
          <label className="option-row">
            <input type="checkbox" checked={pageRule} onChange={(e) => setPageRule(e.target.checked)} />
            <span>Separate pages with a horizontal rule (---)</span>
          </label>
        </div>
      )}

      <div className="workspace">
        <div className="workspace-main">
          <FileGroups
            items={items}
            onReorder={reorder}
            onRemove={remove}
            onInspectFile={(item) => inspector.inspect(item, 1)}
            cardMeta={() => null}
            renderExpanded={(item) => (
              <PagePreview
                fileId={item.id}
                bytes={item.bytes}
                pageCount={item.pageCount}
                onPageClick={(i) => inspector.inspect(item, i + 1)}
              />
            )}
          />

          {items.length > 0 && (
            <div className="action-bar">
              <button className="toggle-btn" data-testid="md-preview-btn" onClick={() => run(true)} disabled={busy || validItems.length === 0}>
                Preview markdown
              </button>
              <button className="primary-btn" data-testid="md-btn" onClick={() => run(false)} disabled={busy || validItems.length === 0}>
                {busy ? `Converting… ${progress}` : `Convert ${validItems.length} PDF${validItems.length === 1 ? '' : 's'} to Markdown`}
              </button>
            </div>
          )}

          {preview && (
            <pre className="md-preview" data-testid="md-preview">
              {preview.slice(0, 4000)}
              {preview.length > 4000 ? '\n…' : ''}
            </pre>
          )}

          {status && (
            <p className={`status status-${status.kind}`} data-testid="status">
              {status.text}
            </p>
          )}
        </div>

        {items.length > 0 && (
          <Inspector target={inspector.target} onNavigate={inspector.navigate} onClose={inspector.close} />
        )}
      </div>
    </div>
  )
}
