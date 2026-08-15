import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import FileDropZone from '../components/FileDropZone.jsx'
import { baseName } from '../components/usePdfFiles.js'
import { assertValidOutput } from '../lib/pdfOps.js'
import { deliverOutputs } from '../lib/deliver.js'
import { formatBytes } from '../lib/download.js'

let nextId = 1

// Unlock handles two distinct cases:
//   - restriction-only: opens fine but blocks printing/copying — removable with
//     NO password (the "prints with an error" case)
//   - open-password: won't open without the correct password
export default function UnlockTool() {
  const [items, setItems] = useState([]) // { id, file, bytes, info, result }
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)

  const addFiles = async (files) => {
    const { inspectPdf } = await import('../lib/cryptoOps.js')
    for (const file of files) {
      const bytes = await file.arrayBuffer()
      const info = await inspectPdf(bytes)
      setItems((prev) => [...prev, { id: nextId++, file, bytes, info, result: null }])
    }
  }

  const remove = (id) => setItems((prev) => prev.filter((it) => it.id !== id))

  // The password field only appears when a file genuinely needs one to open.
  const needsPassword = items.some((it) => it.info?.needsUserPassword && !it.result?.ok)

  const describe = (it) => {
    if (it.result) {
      if (!it.result.ok) return it.result.error
      if (it.result.hadUserPassword) return 'Unlocked'
      return it.result.removedRestrictions.length
        ? `Restrictions removed — ${it.result.removedRestrictions.join(', ')}`
        : 'Restrictions removed'
    }
    const info = it.info
    if (!info?.valid) return 'Not a valid PDF'
    if (info.needsUserPassword) return 'Password required to open'
    if (info.restrictedOnly) {
      const what = info.deniedLabels?.length ? info.deniedLabels.join(', ') : 'restricted'
      return `Restricted: ${what} — no password needed`
    }
    return `Not protected · ${formatBytes(it.file.size)}`
  }

  const unlock = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { unlockPdf } = await import('../lib/cryptoOps.js')
      const outputs = []
      const updated = []
      for (const item of items) {
        if (item.info?.valid && !item.info.needsUserPassword && !item.info.restrictedOnly) {
          updated.push({ ...item, result: { ok: false, error: 'Already open — nothing to remove.' } })
          continue
        }
        try {
          const res = await unlockPdf(item.bytes, password)
          await assertValidOutput(res.bytes)
          outputs.push({ name: `${baseName(item.file.name)}-unlocked.pdf`, bytes: res.bytes })
          updated.push({ ...item, result: { ok: true, ...res } })
        } catch (err) {
          updated.push({ ...item, result: { ok: false, error: err.message } })
        }
      }
      setItems(updated)
      const okCount = updated.filter((it) => it.result?.ok).length
      if (outputs.length > 0) {
        setStatus({
          kind: 'ok',
          text: `${okCount} of ${updated.length} unlocked. ${await deliverOutputs(outputs, 'swisspdf-unlocked.zip')}`,
        })
      } else {
        setStatus({ kind: 'error', text: 'Nothing unlocked — check the per-file notes.' })
      }
    } catch (err) {
      setStatus({ kind: 'error', text: `Unlock failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool-body">
      <FileDropZone onFiles={addFiles} accept={['.pdf']} multiple />
      <p className="option-help">
        Removes open-passwords (if you know them) and printing/copying restrictions (no password
        needed) — so the file prints and copies normally.
      </p>

      {needsPassword && (
        <div className="options-panel">
          <div className="option-row">
            <input
              className="text-input"
              style={{ flex: 1 }}
              type={show ? 'text' : 'password'}
              data-testid="unlock-pw"
              placeholder="Open-password (only for files that won’t open without one)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label className="option-inline">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              <span>Show</span>
            </label>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <ul className="file-list">
          {items.map((item) => {
            const badge = item.result?.ok
              ? 'unlock'
              : item.info?.needsUserPassword
                ? 'lock'
                : item.info?.restrictedOnly
                  ? 'shield'
                  : 'unlock'
            return (
              <li
                key={item.id}
                className={`file-row ${item.result && !item.result.ok ? 'file-row-error' : ''}`}
              >
                <span className="lock-badge" aria-hidden="true">
                  <Icon name={badge} size={15} />
                </span>
                <span className="file-name" title={item.file.name}>
                  {item.file.name}
                </span>
                <span className="file-meta" data-testid="unlock-result">
                  {describe(item)}
                </span>
                <span className="file-actions">
                  <button onClick={() => remove(item.id)} title="Remove file" aria-label="Remove file">
                    <Icon name="close" size={13} />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {items.length > 0 && (
        <div className="action-bar">
          <button className="primary-btn" data-testid="unlock-btn" onClick={unlock} disabled={busy || items.length === 0}>
            {busy ? 'Unlocking…' : `Unlock ${items.length} PDF${items.length === 1 ? '' : 's'}`}
          </button>
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
