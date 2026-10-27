import { useEffect } from 'react'
import { Segmented } from '../../app/controls.jsx'
import Icon from '../../components/Icon.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { FilePick, currentFile, plural, useRead } from './structure-shared.jsx'

const TEXT = [
  ['Title', 'Title'],
  ['Author', 'Author'],
  ['Subject', 'Subject'],
  ['Keywords', 'Keywords'],
  ['Creator', 'Created with'],
  ['Producer', 'PDF producer'],
]

// ISO date with offset <-> value of <input type="datetime-local" step="1"> (local time)
const toLocal = (iso) => {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function editOf(data) {
  const info = { ...data.info, CreationDate: toLocal(data.info.CreationDate), ModDate: toLocal(data.info.ModDate) }
  return { info, custom: data.custom.map((c) => ({ ...c })), deleteAll: false }
}

function Options({ options: o, setOptions, files }) {
  const file = currentFile(files, o.fileId)
  const { data, error } = useRead('readMetadata', file?.id)
  useEffect(() => {
    if (!file || !data || o.edits[file.id]) return
    setOptions((x) => (x.edits[file.id] ? x : { ...x, edits: { ...x.edits, [file.id]: editOf(data) } }))
  }, [file?.id, data]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!file) return <p className="field-help">Select a PDF in Files.</p>
  if (error) return <p className="field-error">{error}</p>
  const e = o.edits[file.id]
  if (!e) return <p className="field-help">Reading metadata…</p>
  const set = (fields) =>
    setOptions((x) => ({ ...x, dirty: { ...x.dirty, [file.id]: true }, edits: { ...x.edits, [file.id]: { ...x.edits[file.id], ...fields } } }))
  const setInfo = (k, v) => set({ info: { ...e.info, [k]: v } })
  const setCustom = (i, fields) => set({ custom: e.custom.map((c, k) => (k === i ? { ...c, ...fields } : c)) })

  return (
    <>
      <FilePick files={files} value={file} onChange={(id) => setOptions((x) => ({ ...x, fileId: id }))} />
      <label className="check-line">
        <input type="checkbox" checked={e.deleteAll} data-testid="meta-delete-all" onChange={(ev) => set({ deleteAll: ev.target.checked })} />
        Delete the document info and the document XMP
      </label>
      {!e.deleteAll && (
        <>
          {TEXT.map(([k, label]) => (
            <div className="field" key={k}>
              <label className="field-label" htmlFor={`meta-${k}`}>
                {label}
              </label>
              <input id={`meta-${k}`} className="input" data-testid={`meta-${k}`} value={e.info[k] ?? ''} onChange={(ev) => setInfo(k, ev.target.value)} />
            </div>
          ))}
          <div className="st-pair">
            <div className="field">
              <label className="field-label" htmlFor="meta-created">
                Created
              </label>
              <input id="meta-created" className="input mono" type="datetime-local" step="1" data-testid="meta-CreationDate" value={e.info.CreationDate ?? ''} onChange={(ev) => setInfo('CreationDate', ev.target.value)} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="meta-modified">
                Modified
              </label>
              <input id="meta-modified" className="input mono" type="datetime-local" step="1" data-testid="meta-ModDate" value={e.info.ModDate ?? ''} onChange={(ev) => setInfo('ModDate', ev.target.value)} />
            </div>
          </div>
          <div className="field">
            <span className="field-label">Trapped</span>
            <Segmented
              label="Trapped"
              value={e.info.Trapped || ''}
              onChange={(v) => setInfo('Trapped', v)}
              options={[
                { value: '', title: 'Not set' },
                { value: 'True', title: 'Yes' },
                { value: 'False', title: 'No' },
                { value: 'Unknown', title: 'Unknown' },
              ]}
            />
          </div>
          <div className="field">
            <span className="field-label">Custom fields</span>
            {e.custom.map((c, i) => (
              <div className="st-pair" key={i}>
                <input className="input" aria-label={`Custom field ${i + 1} name`} placeholder="Name" value={c.key} onChange={(ev) => setCustom(i, { key: ev.target.value })} />
                <div className="btn-row" style={{ flexWrap: 'nowrap' }}>
                  <input className="input" aria-label={`Custom field ${i + 1} value`} placeholder="Value" value={c.value} onChange={(ev) => setCustom(i, { value: ev.target.value })} />
                  <button type="button" className="icon-btn" aria-label={`Remove custom field ${c.key || i + 1}`} onClick={() => set({ custom: e.custom.filter((_, k) => k !== i) })}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
              </div>
            ))}
            <div className="btn-row">
              <button type="button" className="btn btn-quiet btn-small" data-testid="meta-add-custom" onClick={() => set({ custom: [...e.custom, { key: '', value: '' }] })}>
                Add field
              </button>
            </div>
            <p className="field-help">Spaces and the characters ( ) &lt; &gt; [ ] {'{'} {'}'} / % # are left out of names.</p>
          </div>
          <p className="field-help" data-testid="meta-xmp">
            {data?.xmp?.present ? 'The XMP copy is rewritten to match.' : 'An XMP copy is added to match.'}
            {data?.pdfa ? ` PDF/A ${data.pdfa} claim kept.` : ''}
          </p>
        </>
      )}
      {o.dirty[file.id] && (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => setOptions((x) => ({ ...x, dirty: { ...x.dirty, [file.id]: false }, edits: { ...x.edits, [file.id]: editOf(data) } }))}
          >
            Reset
          </button>
        </div>
      )}
    </>
  )
}

export default {
  id: 'metadata',
  name: 'Metadata',
  io: 'PDF → PDF with new properties',
  description: 'Title, author, dates and custom fields, or wipe them.',
  category: 'Edit',
  icon: 'tag',
  accepts: { min: 1 },
  defaults: { edits: {}, dirty: {}, fileId: null },
  next: ['autorename', 'sanitize', 'compress'],
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Save metadata' }
    const edited = files.filter((f) => o.dirty[f.id] && o.edits[f.id])
    if (!edited.length) return { ready: false, line: 'Change a field first.', runLabel: 'Save metadata' }
    const wipe = edited.filter((f) => o.edits[f.id].deleteAll).length
    return {
      ready: true,
      line: wipe === edited.length ? `Document info and XMP will be removed from ${plural(wipe, 'PDF')}.` : `${plural(edited.length, 'PDF')} will get new metadata.`,
      runLabel: `Save metadata${edited.length > 1 ? ` of ${edited.length} PDFs` : ''}`,
    }
  },
  async run(files, o, ctx) {
    const edited = files.filter((f) => o.dirty[f.id] && o.edits[f.id])
    const outputs = []
    for (const [k, f] of edited.entries()) {
      ctx.check()
      ctx.progress(k, edited.length, `Writing ${f.name}`)
      const e = o.edits[f.id]
      const bytes = await ctx.call('doc', 'writeMetadata', f.bytes, e)
      outputs.push({ name: `${baseName(f.name)}-metadata.pdf`, bytes, parentIds: [f.id], note: e.deleteAll ? 'Document info and XMP removed.' : 'Info and XMP updated.' })
    }
    ctx.progress(edited.length, edited.length, 'Done')
    return outputs
  },
}
