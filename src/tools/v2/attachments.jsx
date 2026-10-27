import { useState } from 'react'
import { OptionCards } from '../../app/controls.jsx'
import Icon from '../../components/Icon.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { FilePick, currentFile, formatBytes, plural, useRead } from './structure-shared.jsx'

const MAX_ADD = 200 * 1024 * 1024

function Options({ options: o, setOptions, files }) {
  const file = currentFile(files, o.fileId)
  const { data: list, error } = useRead('listAttachments', file?.id)
  const [addError, setAddError] = useState(null)
  const set = (fields) => setOptions((x) => ({ ...x, ...fields }))
  const removing = new Set(o.remove[file?.id] ?? [])
  const toggle = (id) =>
    setOptions((x) => {
      const cur = new Set(x.remove[file.id] ?? [])
      if (cur.has(id)) cur.delete(id)
      else cur.add(id)
      return { ...x, remove: { ...x.remove, [file.id]: [...cur] } }
    })

  return (
    <>
      <OptionCards
        label="What to do"
        testId="att-mode"
        value={o.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'manage', title: 'Add or remove', caption: 'Saves a new version of the PDF.' },
          { value: 'extract', title: 'Extract files', caption: 'Saves the attached files next to the PDF.' },
        ]}
      />
      <FilePick files={files} value={file} onChange={(id) => set({ fileId: id })} />
      {error && <p className="field-error">{error}</p>}
      {file && !list && !error && <p className="field-help">Reading attachments…</p>}
      {list && (
        <div className="field">
          <span className="field-label">
            In this PDF <span className="mono st-count">{list.length}</span>
          </span>
          {list.length === 0 ? (
            <p className="field-help" data-testid="att-empty">
              No attached files.
            </p>
          ) : (
            <ul className="st-list" data-testid="att-list">
              {list.map((a) => (
                <li key={a.id} className={o.mode === 'manage' && removing.has(a.id) ? 'is-off' : ''}>
                  <span className="st-name">
                    {a.name}
                    {a.source === 'page' && <span className="st-meta"> on page {a.page}</span>}
                    {a.source === 'af' && <span className="st-meta"> associated with {a.page ? `page ${a.page}` : 'the document'}</span>}
                  </span>
                  <span className="st-meta mono">{a.size == null ? 'unreadable' : formatBytes(a.size)}</span>
                  {o.mode === 'manage' && (
                    <button type="button" className="icon-btn" aria-label={removing.has(a.id) ? `Keep ${a.name}` : `Remove ${a.name}`} aria-pressed={removing.has(a.id)} data-testid="att-remove" onClick={() => toggle(a.id)}>
                      <Icon name={removing.has(a.id) ? 'undo' : 'trash'} size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {o.mode === 'manage' && (
        <div className="field">
          <label className="field-label" htmlFor="att-add">
            Attach files
          </label>
          <input
            id="att-add"
            type="file"
            multiple
            data-testid="att-add-input"
            onChange={async (e) => {
              const picked = [...e.target.files]
              e.target.value = ''
              const big = picked.find((f) => f.size > MAX_ADD)
              if (big) {
                setAddError(`${big.name} is over 200 MB.`)
                return
              }
              setAddError(null)
              const add = await Promise.all(picked.map(async (f) => ({ name: f.name, mime: f.type || 'application/octet-stream', bytes: new Uint8Array(await f.arrayBuffer()) })))
              setOptions((x) => ({ ...x, add: [...x.add, ...add] }))
            }}
          />
          {addError && (
            <p className="field-error" role="alert">
              {addError}
            </p>
          )}
          {o.add.length > 0 && (
            <ul className="st-list" data-testid="att-new">
              {o.add.map((a, i) => (
                <li key={i}>
                  <span className="st-name">{a.name}</span>
                  <span className="st-meta mono">{formatBytes(a.bytes.byteLength)}</span>
                  <button type="button" className="icon-btn" aria-label={`Do not attach ${a.name}`} onClick={() => setOptions((x) => ({ ...x, add: x.add.filter((_, k) => k !== i) }))}>
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="field-help">New files are attached to every selected PDF.</p>
        </div>
      )}
    </>
  )
}

const removals = (o, f) => o.remove[f.id] ?? []

export default {
  id: 'attachments',
  name: 'Attachments',
  io: 'PDF ↔ attached files',
  description: 'Attach files to a PDF, list, extract or remove them.',
  category: 'Organize',
  icon: 'attach',
  accepts: { min: 1 },
  // extracting keeps the PDF as it is
  keepInputs: (o) => o.mode === 'extract',
  defaults: { mode: 'manage', fileId: null, add: [], remove: {} },
  next: ['sanitize', 'merge'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Save attachments' }
    if (o.mode === 'extract') return { ready: true, line: `Every attached file of ${plural(files.length, 'PDF')} will be saved.`, runLabel: 'Extract files' }
    const changed = files.filter((f) => o.add.length || removals(o, f).length)
    if (!changed.length) return { ready: false, line: 'Attach a file or mark one to remove.', runLabel: 'Save attachments' }
    return { ready: true, line: `${plural(changed.length, 'PDF')} will be saved with the new attachments.`, runLabel: `Save ${plural(changed.length, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    for (const [k, f] of files.entries()) {
      ctx.check()
      ctx.progress(k, files.length, f.name)
      if (o.mode === 'extract') {
        const got = await ctx.call('doc', 'extractAttachments', f.bytes, null)
        for (const a of got) {
          // an attached PDF becomes a normal workspace PDF
          const pdf = /\.pdf$/i.test(a.name) && String.fromCharCode(...a.bytes.subarray(0, 5)) === '%PDF-'
          const type = pdf ? undefined : a.mime && a.mime !== 'application/pdf' ? a.mime : 'application/octet-stream'
          outputs.push({ name: a.name, bytes: a.bytes, type, parentIds: [f.id], note: `From ${f.name}.` })
        }
        continue
      }
      const remove = removals(o, f)
      if (!o.add.length && !remove.length) continue
      const res = await ctx.call('doc', 'editAttachments', f.bytes, { add: o.add, remove })
      const note = [res.added.length && `${plural(res.added.length, 'file')} attached`, res.removed && `${plural(res.removed, 'file')} removed`].filter(Boolean).join(', ')
      outputs.push({ name: `${baseName(f.name)}-attachments.pdf`, bytes: res.bytes, parentIds: [f.id], note: `${note}.` })
    }
    if (o.mode === 'extract' && !outputs.length) throw new Error('No attached files found in the selected PDFs.')
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
