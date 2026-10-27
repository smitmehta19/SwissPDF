import { useEffect, useState } from 'react'
import { OptionCards } from '../../app/controls.jsx'
import { getBytes } from '../../app/fileStore.js'
import { plural } from './structure-shared.jsx'

// Suggested names per file id and preference (pdf.js text, so on the page).
// run passes the bytes it has; the options panel reads them from the store.
const names = new Map()
function nameOf(id, prefer, bytes = null) {
  const key = `${id}:${prefer}`
  if (!names.has(key)) {
    const p = (async () => {
      const { autoName } = await import('../../lib/docOps.js')
      return autoName(bytes ?? (await getBytes(id)), { prefer })
    })()
    p.catch(() => names.delete(key))
    names.set(key, p)
  }
  return names.get(key)
}

function Options({ options: o, setOptions, files }) {
  const [preview, setPreview] = useState({})
  const key = files.map((f) => f.id).join(',') + o.prefer
  useEffect(() => {
    let active = true
    setPreview({})
    for (const f of files.slice(0, 20)) {
      nameOf(f.id, o.prefer).then(
        (r) => active && setPreview((p) => ({ ...p, [f.id]: r })),
        (err) => active && setPreview((p) => ({ ...p, [f.id]: { error: err.message } })),
      )
    }
    return () => {
      active = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <OptionCards
        label="Name from"
        testId="rename-prefer"
        value={o.prefer}
        onChange={(prefer) => setOptions((x) => ({ ...x, prefer }))}
        options={[
          { value: 'title', title: 'Title, else first heading', caption: 'The title stored in the file, when it has a real one.' },
          { value: 'heading', title: 'First heading, else title', caption: 'The biggest text at the top of page 1.' },
        ]}
      />
      {files.length > 0 && (
        <div className="field">
          <span className="field-label">New names</span>
          <ul className="st-list" data-testid="rename-preview">
            {files.slice(0, 20).map((f) => {
              const r = preview[f.id]
              return (
                <li key={f.id}>
                  <span className="st-name">{!r ? 'Reading…' : r.error ? r.error : (r.name ?? 'No title or heading, keeps its name')}</span>
                  <span className="st-meta">{r?.from === 'title' ? 'title' : r?.from === 'heading' ? 'heading' : ''}</span>
                </li>
              )
            })}
          </ul>
          {files.length > 20 && <p className="field-help">And {files.length - 20} more.</p>}
        </div>
      )}
      <p className="field-help">Characters that file systems refuse are dropped, and names stop at 80 characters.</p>
    </>
  )
}

export default {
  id: 'autorename',
  name: 'Auto rename',
  io: 'PDF → PDF with a real name',
  description: 'Name files after their title or first heading.',
  category: 'Organize',
  icon: 'rename',
  accepts: { min: 1 },
  defaults: { prefer: 'title' },
  next: ['merge', 'metadata'],
  Options,
  summary(files) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Rename' }
    return { ready: true, line: `${plural(files.length, 'PDF')} will be renamed where a title or heading is found.`, runLabel: `Rename ${plural(files.length, 'PDF')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    const used = new Set()
    for (const [k, f] of files.entries()) {
      ctx.check()
      ctx.progress(k, files.length, f.name)
      const r = await nameOf(f.id, o.prefer, f.bytes)
      if (!r.name || r.name === f.name) continue
      let name = r.name
      for (let n = 2; used.has(name.toLowerCase()); n++) name = r.name.replace(/\.pdf$/, ` (${n}).pdf`)
      used.add(name.toLowerCase())
      // same bytes, new name: a copy, since the input buffer is pdf.js's cache key
      outputs.push({ name, bytes: f.bytes.slice(), parentIds: [f.id], unchanged: false, note: `Named after its ${r.from}. Was ${f.name}.` })
    }
    if (!outputs.length) throw new Error('No title or heading found to name the files after.')
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
