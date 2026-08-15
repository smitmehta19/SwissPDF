import { useRef, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import PageCanvas, { pctBox } from '../components/PageCanvas.jsx'
import { baseName } from '../components/usePdfFiles.js'
import { loadPdf, assertValidOutput } from '../lib/pdfOps.js'
import { downloadBytes, formatBytes } from '../lib/download.js'

// Fields are edited directly on the page: existing checkboxes, text boxes and
// dropdowns render as live controls at their real positions. A PDF with no
// fields can have them auto-detected or drawn by hand.
export default function FormsTool() {
  const [file, setFile] = useState(null) // { name, bytes, pageCount, sizes }
  const [fields, setFields] = useState([]) // detected, with a stable uid
  const [values, setValues] = useState({}) // fieldName -> value
  const [newFields, setNewFields] = useState([]) // manually added
  const [pageIdx, setPageIdx] = useState(0)
  const [mode, setMode] = useState('fill') // 'fill' | 'text' | 'checkbox' | 'radio' | 'dropdown'
  const [optionsText, setOptionsText] = useState('Yes, No')
  const [flatten, setFlatten] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const dragRef = useRef(null)
  const draftRef = useRef(null)
  const [draft, setDraftState] = useState(null)
  const setDraft = (v) => {
    draftRef.current = v
    setDraftState(v)
  }

  const load = async (bytes, name) => {
    const doc = await loadPdf(bytes)
    const sizes = doc.getPages().map((p) => p.getSize())
    const { listFields } = await import('../lib/formOps.js')
    const found = (await listFields(bytes)).map((f, i) => ({ ...f, uid: `${f.name}#${i}` }))
    setFile({ name, bytes, pageCount: doc.getPageCount(), sizes })
    setFields(found)
    setValues(
      Object.fromEntries(found.map((f) => [f.name, f.type === 'checkbox' ? f.value === 'on' : f.value])),
    )
    setNewFields([])
    setPageIdx(0)
    setMode('fill')
    setStatus(
      found.length === 0
        ? { kind: 'ok', text: 'No fields here. Detect fill-in areas, or draw fields by hand.' }
        : { kind: 'ok', text: `${found.length} field${found.length === 1 ? '' : 's'} — edit them on the page.` },
    )
  }

  const onFiles = async ([f]) => {
    setStatus(null)
    try {
      await load(await f.arrayBuffer(), f.name)
    } catch (err) {
      setFile(null)
      setStatus({ kind: 'error', text: err.message })
    }
  }

  const detectAreas = async () => {
    setStatus(null)
    try {
      const { detectFillAreas } = await import('../lib/formOps.js')
      const areas = await detectFillAreas(file.bytes)
      if (areas.length === 0) {
        setStatus({ kind: 'error', text: 'No blank lines or underscores detected on this form.' })
        return
      }
      setNewFields((prev) => [
        ...prev,
        ...areas.map((a, i) => ({ ...a, type: 'text', name: `text_${prev.length + i + 1}` })),
      ])
      setStatus({
        kind: 'ok',
        text: `Added ${areas.length} text field${areas.length === 1 ? '' : 's'} on detected fill-in areas — type into them.`,
      })
    } catch (err) {
      setStatus({ kind: 'error', text: err.message })
    }
  }

  const size = file?.sizes[pageIdx]
  const pageFields = fields.filter((f) => f.pageIndex === pageIdx)
  const pageNewFields = newFields.map((f, i) => ({ ...f, _idx: i })).filter((f) => f.pageIndex === pageIdx)

  const save = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { fillFields, addFields } = await import('../lib/formOps.js')
      let bytes = file.bytes
      let added = 0
      if (newFields.length > 0) {
        const res = await addFields(bytes, newFields)
        bytes = res.bytes
        added = res.added
        // pick up manual field values (keyed by generated names)
      }
      const allValues = { ...values }
      newFields.forEach((f) => {
        if (f.value != null) allValues[f.name] = f.value
      })
      const res = await fillFields(bytes, allValues, { flatten })
      await assertValidOutput(res.bytes)
      const name = `${baseName(file.name)}-filled.pdf`
      downloadBytes(res.bytes, name)
      setStatus({
        kind: 'ok',
        text: `Created ${name} — ${res.filled} field${res.filled === 1 ? '' : 's'} filled${added ? `, ${added} added` : ''}${flatten ? ', flattened' : ''} · ${formatBytes(res.bytes.length)}.`,
      })
    } catch (err) {
      setStatus({ kind: 'error', text: `Save failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  // Live control rendered at a field's real position on the page.
  const fieldControl = (f) => {
    const style = pctBox(f, size)
    if (f.type === 'checkbox') {
      return (
        <label key={f.uid} className="pdf-field pdf-field-check" style={style} title={f.name}>
          <input
            type="checkbox"
            data-testid="pdf-field"
            checked={!!values[f.name]}
            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))}
          />
        </label>
      )
    }
    // one radio widget per option — a real radio button
    if (f.type === 'radio') {
      return (
        <label key={f.uid} className="pdf-field pdf-field-check" style={style} title={`${f.name}: ${f.widgetOption}`}>
          <input
            type="radio"
            data-testid="pdf-field"
            name={`radio-${f.name}`}
            checked={values[f.name] === f.widgetOption}
            onChange={() => setValues((v) => ({ ...v, [f.name]: f.widgetOption }))}
          />
        </label>
      )
    }
    // dropdown / list box
    if (f.options) {
      return (
        <select
          key={f.uid}
          className="pdf-field pdf-field-input"
          data-testid="pdf-field"
          style={style}
          value={values[f.name] ?? ''}
          onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
        >
          <option value="">—</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    }
    return (
      <input
        key={f.uid}
        className="pdf-field pdf-field-input"
        data-testid="pdf-field"
        style={style}
        value={values[f.name] ?? ''}
        placeholder={f.name}
        onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
      />
    )
  }

  const delButton = (idx) => (
    <button
      className="field-del"
      title="Remove field"
      onClick={(e) => {
        e.preventDefault()
        setNewFields((prev) => prev.filter((_, i) => i !== idx))
      }}
    >
      ×
    </button>
  )

  const newFieldControl = (f) => {
    const style = pctBox(f, size)
    if (f.type === 'checkbox') {
      return (
        <label key={`n${f._idx}`} className="pdf-field pdf-field-check pdf-field-new" style={style}>
          <input
            type="checkbox"
            checked={!!f.value}
            onChange={(e) =>
              setNewFields((prev) => prev.map((x, i) => (i === f._idx ? { ...x, value: e.target.checked } : x)))
            }
          />
          {delButton(f._idx)}
        </label>
      )
    }
    // radio group preview: one circle per option across the width
    if (f.type === 'radio') {
      return (
        <span key={`n${f._idx}`} className="pdf-field pdf-radio-preview pdf-field-new" style={style} title={`radio: ${(f.options ?? []).join(', ')}`}>
          {(f.options ?? []).map((opt, oi) => (
            <span key={oi} className="pdf-radio-dot" title={opt} />
          ))}
          {delButton(f._idx)}
        </span>
      )
    }
    if (f.type === 'dropdown') {
      return (
        <span key={`n${f._idx}`} className="pdf-field pdf-field-input pdf-field-new pdf-dropdown-preview" style={style} title={`dropdown: ${(f.options ?? []).join(', ')}`}>
          {(f.options ?? [])[0] ?? 'options'} ▾{delButton(f._idx)}
        </span>
      )
    }
    return (
      <span key={`n${f._idx}`} className="pdf-field pdf-field-wrap pdf-field-new" style={style}>
        <input
          className="pdf-field-input"
          data-testid="new-field-input"
          value={f.value ?? ''}
          placeholder="type here"
          onChange={(e) =>
            setNewFields((prev) => prev.map((x, i) => (i === f._idx ? { ...x, value: e.target.value } : x)))
          }
        />
        {delButton(f._idx)}
      </span>
    )
  }

  const fieldCount = fields.length + newFields.length

  return (
    <div className="tool-body">
      {!file && <FileDropZone onFiles={onFiles} accept={['.pdf']} multiple={false} />}
      {!file && (
        <p className="option-help">
          Fills existing fields directly on the page. No fields? Detect fill-in areas or draw your own.
        </p>
      )}

      {file && size && (
        <>
          <div className="options-panel">
            <div className="option-row">
              <strong>{file.name}</strong>
              <button className="back-link" onClick={() => { setFile(null); setStatus(null) }}>
                Choose another file
              </button>
              <span style={{ flex: 1 }} />
              <button className="toggle-btn" onClick={() => setPageIdx((i) => Math.max(0, i - 1))} disabled={pageIdx === 0}>
                ← Prev
              </button>
              <span className="option-help">Page {pageIdx + 1} of {file.pageCount}</span>
              <button
                className="toggle-btn"
                onClick={() => setPageIdx((i) => Math.min(file.pageCount - 1, i + 1))}
                disabled={pageIdx >= file.pageCount - 1}
              >
                Next →
              </button>
            </div>
            <div className="option-row">
              <span>Add</span>
              {[
                ['fill', 'Fill'],
                ['text', 'Text'],
                ['checkbox', 'Checkbox'],
                ['radio', 'Radio'],
                ['dropdown', 'Dropdown'],
              ].map(([v, label]) => (
                <button
                  key={v}
                  className={`tool-chip ${mode === v ? 'tool-chip-active' : ''}`}
                  data-testid={`form-mode-${v}`}
                  onClick={() => setMode(v)}
                >
                  {label}
                </button>
              ))}
              <button className="toggle-btn" data-testid="detect-btn" onClick={detectAreas}>
                Detect fill-in areas
              </button>
              <label className="option-inline">
                <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
                <span>Flatten</span>
              </label>
              <span className="option-help" data-testid="form-field-count">
                {fieldCount} field{fieldCount === 1 ? '' : 's'}
              </span>
            </div>
            {(mode === 'radio' || mode === 'dropdown') && (
              <div className="option-row">
                <span>Options</span>
                <input
                  className="text-input"
                  style={{ flex: 1 }}
                  data-testid="form-options"
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder="Comma-separated, e.g. Yes, No, Maybe"
                />
              </div>
            )}
          </div>

          <p className="option-help">
            {mode === 'fill'
              ? 'Type into the highlighted fields on the page.'
              : mode === 'radio'
                ? 'Drag a wide box — one radio button per option is placed across it.'
                : 'Drag on the page to draw the field.'}
          </p>

          <PageCanvas
            bytes={file.bytes}
            pageNum={pageIdx + 1}
            pageSize={size}
            testId="form-canvas"
            cursor={mode === 'fill' ? 'default' : 'crosshair'}
            onPointerDown={mode === 'fill' ? undefined : (p) => { dragRef.current = p; setDraft(null) }}
            onPointerMove={(p) => {
              if (!dragRef.current) return
              const s = dragRef.current
              setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
            }}
            onPointerUp={() => {
              const d = draftRef.current
              if (dragRef.current && d && d.w > 8 && d.h > 6) {
                const options = optionsText.split(',').map((o) => o.trim()).filter(Boolean)
                setNewFields((prev) => [
                  ...prev,
                  {
                    ...d,
                    pageIndex: pageIdx,
                    type: mode,
                    name: `${mode}_${prev.length + 1}`,
                    ...(mode === 'radio' || mode === 'dropdown' ? { options } : {}),
                  },
                ])
              }
              dragRef.current = null
              setDraft(null)
            }}
          >
            {pageFields.map(fieldControl)}
            {pageNewFields.map(newFieldControl)}
            {draft && <span className="form-field-box form-field-draft" style={pctBox(draft, size)} />}
          </PageCanvas>

          <div className="action-bar">
            <button className="primary-btn" data-testid="form-save-btn" onClick={save} disabled={busy || fieldCount === 0}>
              {busy ? 'Saving…' : 'Save filled PDF'}
            </button>
            {newFields.length > 0 && (
              <button className="link-btn" onClick={() => setNewFields([])}>
                Remove {newFields.length} added field{newFields.length === 1 ? '' : 's'}
              </button>
            )}
          </div>

          {status && (
            <p className={`status status-${status.kind}`} data-testid="status">
              {status.text}
            </p>
          )}
        </>
      )}

      {!file && status && (
        <p className={`status status-${status.kind}`} data-testid="status">
          {status.text}
        </p>
      )}
    </div>
  )
}
