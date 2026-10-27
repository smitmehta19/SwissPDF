// Shared bits of the U5-B structure tools: cached reads of a workspace file
// (outline, metadata, attachments, info) in their own worker lane, and the
// file picker for option panels that edit one file at a time.
import { useEffect, useState } from 'react'
import { getBytes } from '../../app/fileStore.js'
import { callOp } from '../../app/jobs.js'
import { formatBytes } from '../../lib/download.js'
import './structure.css'

export { formatBytes }

// One read per file id and op; a new version is a new id, so no staleness.
const reads = new Map()
export function readFile(op, id, ...args) {
  const key = `${op}:${id}:${JSON.stringify(args)}`
  if (!reads.has(key)) {
    const p = (async () => callOp('doc', [op, await getBytes(id), ...args], { lane: 'structure' }))()
    p.catch(() => reads.delete(key))
    reads.set(key, p)
  }
  return reads.get(key)
}

export function useRead(op, id, ...args) {
  const key = id ? `${op}:${id}:${JSON.stringify(args)}` : null
  const [state, setState] = useState({ key: null, data: null, error: null })
  useEffect(() => {
    if (!id) return undefined
    let active = true
    readFile(op, id, ...args).then(
      (data) => active && setState({ key, data, error: null }),
      (err) => active && setState({ key, data: null, error: err.message }),
    )
    return () => {
      active = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return state.key === key ? { ...state, loading: false } : { key, data: null, error: null, loading: !!id }
}

// Names of the selected files that are dynamic XFA forms (the form exists
// only as XFA), for a warning in the panel.
export function useDynamicXfa(files) {
  const key = files.map((f) => f.id).join(',')
  const [names, setNames] = useState([])
  useEffect(() => {
    let active = true
    Promise.all(files.map((f) => readFile('pdfInfo', f.id).then((i) => (i.forms.xfa === 'dynamic' ? f.name : null), () => null))).then((list) => active && setNames(list.filter(Boolean)))
    return () => {
      active = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return names
}

// The file an option panel edits: o.fileId if still selected, else the first.
export const currentFile = (files, id) => files.find((f) => f.id === id) ?? files[0] ?? null

export function FilePick({ files, value, onChange, label = 'File' }) {
  if (files.length < 2) return null
  return (
    <div className="field">
      <label className="field-label" htmlFor="st-file">
        {label}
      </label>
      <select id="st-file" className="input" data-testid="st-file" value={value?.id ?? ''} onChange={(e) => onChange(e.target.value)}>
        {files.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  )
}

// Label: value rows for read-only facts.
export function Facts({ rows, testId }) {
  return (
    <dl className="st-facts" data-testid={testId}>
      {rows
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v, mono]) => (
          <div key={k} className="st-fact">
            <dt>{k}</dt>
            <dd className={mono ? 'mono' : ''}>{v}</dd>
          </div>
        ))}
    </dl>
  )
}

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
