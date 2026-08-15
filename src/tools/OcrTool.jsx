import { useEffect, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import FileGroups from '../components/FileGroups.jsx'
import Inspector, { useInspector } from '../components/Inspector.jsx'
import PagePreview from '../components/PagePreview.jsx'
import { usePdfFiles, baseName } from '../components/usePdfFiles.js'
import { deliverOutputs } from '../lib/deliver.js'
import { assertValidOutput } from '../lib/pdfOps.js'

export default function OcrTool() {
  const { items, validItems, addFiles, reorder, remove } = usePdfFiles()
  const [alsoText, setAlsoText] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [status, setStatus] = useState(null)
  const inspector = useInspector()

  useEffect(() => {
    if (!inspector.target && validItems.length > 0) inspector.inspect(validItems[0], 1)
  }, [validItems.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { ocrPdf } = await import('../lib/ocrOps.js')
      const outputs = []
      let words = 0
      for (const item of validItems) {
        const base = baseName(item.file.name)
        const res = await ocrPdf(item.bytes, {
          onProgress: (n, total, stage) =>
            setProgress(`${item.file.name} — page ${n}/${total} (${stage})`),
        })
        await assertValidOutput(res.bytes)
        words += res.totalWords
        outputs.push({ name: `${base}-searchable.pdf`, bytes: res.bytes })
        if (alsoText) {
          outputs.push({
            name: `${base}.txt`,
            bytes: new TextEncoder().encode(res.text),
            mime: 'text/plain',
          })
        }
      }
      const summary = await deliverOutputs(outputs, 'swisspdf-ocr.zip', { kind: 'binary' })
      setStatus({
        kind: 'ok',
        text: `Recognized ${words} words. The pages look identical but the text is now selectable and searchable. ${summary}`,
      })
    } catch (err) {
      setStatus({ kind: 'error', text: `OCR failed: ${err.message}` })
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />
      <p className="option-help">
        Adds an invisible text layer over scanned pages — same look, now searchable. First run
        downloads the English engine (~15 MB, cached).
      </p>

      {items.length > 0 && (
        <div className="options-panel">
          <label className="option-row">
            <input type="checkbox" checked={alsoText} onChange={(e) => setAlsoText(e.target.checked)} />
            <span>Also download the recognized text as a .txt file</span>
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
              <button
                className="primary-btn"
                data-testid="ocr-btn"
                onClick={run}
                disabled={busy || validItems.length === 0}
              >
                {busy
                  ? `Recognizing… ${progress}`
                  : `Make ${validItems.length} PDF${validItems.length === 1 ? '' : 's'} searchable`}
              </button>
            </div>
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
