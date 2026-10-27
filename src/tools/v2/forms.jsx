import { useEffect, useRef, useState } from 'react'
import { Field } from '../../app/controls.jsx'
import Icon from '../../components/Icon.jsx'
import { getBytes } from '../../app/fileStore.js'
import { baseName } from '../../components/usePdfFiles.js'
import { PageStage, currentOf, dragRect, plural, ptStyle } from './g3-canvas.jsx'

// Field scan per file id, shared by the canvas and the options panel.
const scans = new Map()
function scanOf(id) {
  if (!scans.has(id)) {
    const p = (async () => {
      const { inspectForm } = await import('../../lib/formOps.js')
      return inspectForm(await getBytes(id))
    })()
    p.catch(() => scans.delete(id))
    scans.set(id, p)
  }
  return scans.get(id)
}

function useScan(id) {
  const [state, setState] = useState({ id: null, scan: null, error: null })
  useEffect(() => {
    if (!id) return undefined
    let active = true
    scanOf(id).then(
      (scan) => active && setState({ id, scan, error: null }),
      (err) => active && setState({ id, scan: null, error: err.message }),
    )
    return () => {
      active = false
    }
  }, [id])
  return state.id === id ? state : { id, scan: null, error: null }
}

// Human names for fields: the tooltip (/TU) the form author wrote, read from
// pdf.js annotations, so a screen reader hears "First name" and not
// "topmostSubform[0].Page1[0].f1_01[0]".
const labelScans = new Map()
function useLabels(id) {
  const [labels, setLabels] = useState({ id: null, map: {} })
  useEffect(() => {
    if (!id) return undefined
    let active = true
    if (!labelScans.has(id)) {
      labelScans.set(
        id,
        (async () => {
          const { openPdfDocument, serializedPdfOp } = await import('../../lib/pdfText.js')
          const bytes = await getBytes(id)
          return serializedPdfOp(async () => {
            const doc = await openPdfDocument(bytes)
            const map = {}
            for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
              const page = await doc.getPage(i)
              for (const a of await page.getAnnotations()) if (a.fieldName && a.alternativeText && !map[a.fieldName]) map[a.fieldName] = a.alternativeText.trim()
            }
            return map
          })
        })().catch(() => ({})),
      )
    }
    labelScans.get(id).then((map) => active && setLabels({ id, map }))
    return () => {
      active = false
    }
  }, [id])
  return labels.id === id ? labels.map : {}
}

// The tooltip when there is one, else the last readable part of the field name.
const labelFor = (labels, name) => labels[name] || name.split('.').pop().replace(/\[\d+\]$/, '')

const MODES = [
  ['fill', 'Fill', 'forms'],
  ['text', 'Text', 'edit'],
  ['checkbox', 'Checkbox', 'check'],
  ['dropdown', 'Dropdown', 'menu'],
  ['radio', 'Radio', 'auto'],
]

let seq = 1

function Canvas({ files, options: o, setOptions, target, onTarget }) {
  const { file } = currentOf(files, target)
  const { scan, error } = useScan(file?.id)
  const labels = useLabels(file?.id)
  const start = useRef(null)
  const [draft, setDraft] = useState(null)
  const [detecting, setDetecting] = useState(null)
  const values = o.values[file?.id] ?? {}
  const added = o.added[file?.id] ?? []
  const setValue = (name, v) => setOptions((x) => ({ ...x, values: { ...x.values, [file.id]: { ...(x.values[file.id] ?? {}), [name]: v } } }))
  const setAdded = (fn) => setOptions((x) => ({ ...x, added: { ...x.added, [file.id]: fn(x.added[file.id] ?? []) } }))
  const valueOf = (f) => (f.name in values ? values[f.name] : f.type === 'checkbox' ? f.value === 'on' : f.value)

  const detect = async () => {
    setDetecting('Looking for blank lines and underscores…')
    try {
      const { detectFillAreas } = await import('../../lib/formOps.js')
      const areas = await detectFillAreas(await getBytes(file.id))
      setAdded((list) => [...list, ...areas.map((a) => ({ id: seq++, type: 'text', name: `text_${seq}`, pageIndex: a.pageIndex, x: a.x, y: a.y, w: a.w, h: a.h, value: '' }))])
      setDetecting(areas.length ? `Added ${plural(areas.length, 'text field')}.` : 'No blank lines or underscores found.')
    } catch (err) {
      setDetecting(err.message)
    }
  }

  const xfaNote =
    scan?.xfa === 'dynamic'
      ? 'This is a dynamic XFA form: its fields only exist in Adobe Reader and cannot be filled here. You can still add your own fields.'
      : scan?.xfa === 'static'
        ? 'This form also carries an XFA copy. It is removed when you save, so every viewer shows the values you type.'
        : null

  return (
    <PageStage
      files={files}
      target={target}
      onTarget={onTarget}
      testId="form-canvas"
      zoom
      cursor={o.mode === 'fill' ? 'default' : 'crosshair'}
      hint={error ?? xfaNote ?? (o.mode === 'fill' ? 'Type into the fields on the page.' : o.mode === 'radio' ? 'Drag a wide box: one button per option is placed across it.' : 'Drag on the page to draw the field.')}
      toolbar={
        <>
          {scan && (
            <span className="field-help mono" data-testid="form-field-count">
              {plural(scan.count, 'field')}
              {added.length ? `, ${added.length} new` : ''}
            </span>
          )}
          {scan && scan.count === 0 && (
            <button type="button" className="btn btn-quiet btn-small" data-testid="detect-btn" onClick={detect}>
              Detect fill-in areas
            </button>
          )}
          {detecting && <span className="field-help">{detecting}</span>}
        </>
      }
      onDown={
        o.mode === 'fill'
          ? undefined
          : (p) => {
              start.current = p
              setDraft(null)
            }
      }
      onMove={(p) => start.current && setDraft(dragRect(start.current, p))}
      onUp={(p, _e, ctx) => {
        const r = start.current && dragRect(start.current, p)
        start.current = null
        setDraft(null)
        if (!r || r.w < 8 || r.h < 6) return
        const options = o.choices
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
        setAdded((list) => [
          ...list,
          { id: seq++, type: o.mode, name: `${o.mode}_${seq}`, pageIndex: ctx.page - 1, x: r.x, y: r.y, w: r.w, h: r.h, value: o.mode === 'checkbox' ? false : '', ...(o.mode === 'radio' || o.mode === 'dropdown' ? { options } : {}) },
        ])
      }}
    >
      {({ page, size }) => (
        <>
          {(scan?.fields ?? [])
            .filter((f) => f.pageIndex === page - 1 && f.w > 2 && f.h > 2)
            .map((f, i) => {
              const v = valueOf(f)
              const label = labelFor(labels, f.name)
              const common = { 'data-g3-control': true, 'data-testid': 'pdf-field', title: label, disabled: f.readOnly }
              // the label sits on the widget box; in fill mode its halo makes
              // the click target at least 24 px without moving the field
              const hit = (key, control) => (
                <label key={key} className={`g3-ov g3-slot ${o.mode === 'fill' ? 'g3-hit' : ''}`} style={{ ...ptStyle(f, size), '--fh': f.h }}>
                  {control}
                </label>
              )
              if (f.type === 'checkbox')
                return hit(
                  i,
                  <span className="g3-field g3-field-check">
                    <input type="checkbox" {...common} aria-label={label} checked={!!v} onChange={(e) => setValue(f.name, e.target.checked)} />
                  </span>,
                )
              if (f.type === 'radio')
                return hit(
                  i,
                  <span className="g3-field g3-field-check">
                    <input type="radio" {...common} aria-label={`${label}: ${f.widgetOption}`} name={`r-${file.id}-${f.name}`} checked={v === f.widgetOption} onChange={() => setValue(f.name, f.widgetOption)} />
                  </span>,
                )
              if (f.options)
                return hit(
                  i,
                  <select className="g3-field" {...common} aria-label={label} value={v ?? ''} onChange={(e) => setValue(f.name, e.target.value)}>
                    <option value="" />
                    {f.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>,
                )
              if (f.type !== 'text') return null
              return hit(i, <input className="g3-field" {...common} aria-label={label} maxLength={f.maxLength || undefined} value={v ?? ''} onChange={(e) => setValue(f.name, e.target.value)} />)
            })}
          {added
            .filter((f) => f.pageIndex === page - 1)
            .map((f) => (
              <span key={f.id} className="g3-ov g3-field g3-field-new" style={ptStyle(f, size)}>
                {f.type === 'text' && <input className="g3-fill" data-g3-control data-testid="new-field-input" aria-label="New text field" value={f.value} onChange={(e) => setAdded((list) => list.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))} />}
                {f.type === 'checkbox' && <input type="checkbox" data-g3-control aria-label="New checkbox" checked={!!f.value} onChange={(e) => setAdded((list) => list.map((x) => (x.id === f.id ? { ...x, value: e.target.checked } : x)))} />}
                {(f.type === 'dropdown' || f.type === 'radio') && <span className="g3-field-tag">{f.type}: {(f.options ?? []).join(', ')}</span>}
                <button type="button" className="g3-remove" data-g3-control aria-label="Remove this field" onClick={() => setAdded((list) => list.filter((x) => x.id !== f.id))}>
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          {draft && <span className="g3-ov g3-draft" style={ptStyle(draft, size)} />}
        </>
      )}
    </PageStage>
  )
}

function Options({ options: o, setOptions, files }) {
  const set = (fields) => setOptions((x) => ({ ...x, ...fields }))
  const edits = files.reduce((n, f) => n + Object.keys(o.values[f.id] ?? {}).length, 0)
  const added = files.reduce((n, f) => n + (o.added[f.id]?.length ?? 0), 0)
  return (
    <>
      <div className="field">
        <span className="field-label">On the page</span>
        <div className="g3-tools" role="radiogroup" aria-label="Form mode">
          {MODES.map(([id, label, icon]) => (
            <button key={id} type="button" role="radio" aria-checked={o.mode === id} className={o.mode === id ? 'is-on' : ''} data-testid={`form-mode-${id}`} onClick={() => set({ mode: id })}>
              <Icon name={icon} size={18} />
              {label}
            </button>
          ))}
        </div>
      </div>
      {(o.mode === 'radio' || o.mode === 'dropdown') && (
        <Field label="Choices" help="Separate them with commas.">
          {(id) => <input id={id} className="input" data-testid="form-options" value={o.choices} onChange={(e) => set({ choices: e.target.value })} />}
        </Field>
      )}
      <label className="check-line">
        <input type="checkbox" checked={o.flatten} data-testid="form-flatten" onChange={(e) => set({ flatten: e.target.checked })} />
        Flatten: bake the values into the page so they can no longer be changed
      </label>
      <p className="field-help" data-testid="form-edits">
        {plural(edits, 'value')} changed, {plural(added, 'new field')}.
      </p>
      {(edits > 0 || added > 0) && (
        <div className="btn-row">
          <button type="button" className="btn btn-quiet btn-small" onClick={() => set({ values: {}, added: {} })}>
            Reset all
          </button>
        </div>
      )}
    </>
  )
}

export default {
  id: 'forms',
  name: 'Forms',
  io: 'PDF → filled PDF',
  description: 'Fill fields on the page, or draw new ones.',
  category: 'Edit',
  icon: 'forms',
  accepts: { min: 1 },
  defaults: { mode: 'fill', choices: 'Yes, No', flatten: false, values: {}, added: {} },
  next: ['sign', 'pagenumbers', 'protect', 'merge'],
  Canvas,
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Save form' }
    const touched = files.filter((f) => Object.keys(o.values[f.id] ?? {}).length || o.added[f.id]?.length)
    if (touched.length === 0 && !o.flatten) return { ready: false, line: 'Fill in a field or draw a new one on the page.', runLabel: 'Save form' }
    const n = o.flatten ? files.length : touched.length
    return { ready: true, line: `${plural(n, o.flatten ? 'flattened PDF' : 'filled PDF')} will be created.`, runLabel: o.flatten ? `Fill and flatten ${plural(n, 'PDF')}` : `Save ${plural(n, 'form')}` }
  },
  async run(files, o, ctx) {
    const { addFields, fillFields } = await import('../../lib/formOps.js')
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      const values = { ...(o.values[f.id] ?? {}) }
      const added = o.added[f.id] ?? []
      if (!o.flatten && !added.length && !Object.keys(values).length) continue
      ctx.progress(i, files.length, `Saving ${f.name}`)
      let bytes = f.bytes
      let note = []
      if (added.length) {
        const res = await addFields(bytes, added.map(({ id, value, ...rest }) => ({ ...rest, value: rest.type === 'checkbox' ? !!value : value })))
        bytes = res.bytes
        note.push(`${plural(res.added, 'field')} added`)
      }
      ctx.check()
      const res = await fillFields(bytes, values, { flatten: o.flatten })
      note.unshift(`${plural(res.filled, 'value')} filled`)
      if (o.flatten) note.push('flattened')
      if (res.xfaRemoved) note.push('XFA copy removed')
      outputs.push({ name: `${baseName(f.name)}-filled.pdf`, bytes: res.bytes, parentIds: [f.id], note: `${note.join(', ')}.` })
      // the new version gets its own scan
      scans.delete(f.id)
    }
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
