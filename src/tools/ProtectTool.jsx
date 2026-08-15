import { useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import FileGroups from '../components/FileGroups.jsx'
import { usePdfFiles, baseName } from '../components/usePdfFiles.js'
import { deliverOutputs } from '../lib/deliver.js'

export default function ProtectTool() {
  const { items, validItems, addFiles, reorder, remove } = usePdfFiles()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)

  const mismatch = confirm.length > 0 && password !== confirm

  const apply = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { protectPdf } = await import('../lib/cryptoOps.js')
      const outputs = []
      for (const item of validItems) {
        outputs.push({
          name: `${baseName(item.file.name)}-protected.pdf`,
          bytes: await protectPdf(item.bytes, password),
        })
      }
      // Encrypted files can't pass normal PDF validation on purpose.
      setStatus({
        kind: 'ok',
        text: `${await deliverOutputs(outputs, 'swisspdf-protected.zip', { kind: 'binary' })} Keep the password safe — without it the files cannot be opened.`,
      })
    } catch (err) {
      setStatus({ kind: 'error', text: `Protect failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />
      <p className="option-help">
        AES-256 encryption. If you forget the password, the file cannot be recovered — by anyone.
      </p>

      {items.length > 0 && (
        <div className="options-panel">
          <div className="option-row">
            <input
              className="text-input"
              style={{ flex: 1 }}
              type={show ? 'text' : 'password'}
              data-testid="pw-input"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              className="text-input"
              style={{ flex: 1 }}
              type={show ? 'text' : 'password'}
              data-testid="pw-confirm"
              placeholder="Repeat password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <label className="option-inline">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              <span>Show</span>
            </label>
          </div>
          {mismatch && <p className="status status-error">The passwords don't match.</p>}
        </div>
      )}

      <FileGroups
        items={items}
        onReorder={reorder}
        onRemove={remove}
        cardMeta={() => null}
        renderExpanded={() => null}
      />

      {items.length > 0 && (
        <div className="action-bar">
          <button
            className="primary-btn"
            data-testid="protect-btn"
            onClick={apply}
            disabled={busy || validItems.length === 0 || password.length === 0 || password !== confirm}
          >
            {busy ? 'Encrypting…' : `Protect ${validItems.length} PDF${validItems.length === 1 ? '' : 's'}`}
          </button>
          {password.length > 0 && password.length < 6 && (
            <span className="action-hint">Short passwords are easy to guess — 6+ characters recommended.</span>
          )}
        </div>
      )}

      {status && (
        <p className={`status status-${status.kind}`} data-testid="status">
          {status.text}
        </p>
      )}
    </div>
  )
}
