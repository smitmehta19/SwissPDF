import { useRef, useState } from 'react'
import { Field, Segmented } from '../../app/controls.jsx'
import Icon from '../../components/Icon.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { PageStage, currentOf, dragRect, plural, ptStyle } from './g3-canvas.jsx'
import { TextPanel, fallbackFontsIn, markSaved, signatureRemovedIn, textBytesOf, textEditCount, useTextEdit } from './edittext.jsx'

const TOOLS = [
  ['text', 'Text', 'edit', 'Click where the text should start.'],
  ['highlight', 'Highlight', 'redact', 'Drag across what you want highlighted.'],
  ['rect', 'Box', 'organize', 'Drag to draw a box.'],
  ['ellipse', 'Ellipse', 'auto', 'Drag to draw an ellipse.'],
  ['line', 'Line', 'remove', 'Drag from start to end.'],
  ['ink', 'Draw', 'sign', 'Draw freehand.'],
  ['image', 'Image', 'image', 'Drag to place the chosen image.'],
  ['erase', 'White-out', 'blank', 'Drag over anything to cover it in white.'],
]

const MODES = [
  { value: 'text', title: 'Edit text' },
  { value: 'add', title: 'Add' },
]

// 'auto' follows the page (Edit text when it has text to edit) until the
// user picks a mode.
const modeOf = (o) => (o.mode === 'auto' ? (o.autoMode ?? 'text') : o.mode)

let seq = 1

function Element({ el, size, onRemove }) {
  const remove = (
    <button type="button" className="g3-remove" data-g3-control aria-label={`Remove ${el.type}`} onClick={onRemove}>
      <Icon name="close" size={12} />
    </button>
  )
  if (el.type === 'text') {
    return (
      <span className="g3-ov g3-el g3-el-text" data-testid="edit-element" style={{ left: `${(el.x / size.width) * 100}%`, top: `${(el.y / size.height) * 100}%`, color: el.color, fontSize: `calc(var(--pt) * ${el.size})` }}>
        {el.text}
        {remove}
      </span>
    )
  }
  if (el.type === 'line' || el.type === 'ink') {
    const pts = el.type === 'line' ? [{ x: el.x, y: el.y }, { x: el.x2, y: el.y2 }] : el.points
    return (
      <svg className="g3-ov g3-el-svg" data-testid="edit-element" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={el.color} strokeWidth={el.borderWidth} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (el.type === 'image') {
    return (
      <span className="g3-ov g3-el" data-testid="edit-element" style={ptStyle(el, size)}>
        <img className="g3-el-img" src={el.url} alt="" width="100%" height="100%" />
        {remove}
      </span>
    )
  }
  const style = {
    ...ptStyle(el, size),
    borderColor: el.color,
    borderWidth: el.borderWidth ? `calc(var(--pt) * ${el.borderWidth})` : 0,
    background: el.type === 'highlight' ? el.color : el.fill ?? 'transparent',
    opacity: el.type === 'highlight' ? 0.45 : 1,
    borderRadius: el.type === 'ellipse' ? '50%' : 0,
  }
  return (
    <span className="g3-ov g3-el g3-el-box" data-testid="edit-element" style={style}>
      {remove}
    </span>
  )
}

function Canvas({ files, options: o, setOptions, target, onTarget }) {
  const { file, page } = currentOf(files, target)
  const start = useRef(null)
  const [draft, setDraft] = useState(null)
  const mode = modeOf(o)
  const te = useTextEdit({ file, page, options: o, setOptions, active: mode === 'text' })
  const els = o.elements[file?.id] ?? []
  const setEls = (fn) => setOptions((x) => ({ ...x, elements: { ...x.elements, [file.id]: fn(x.elements[file.id] ?? []) } }))
  const add = (el) => setEls((list) => [...list, { ...el, id: seq++ }])
  const tool = TOOLS.find(([id]) => id === o.tool)
  const editing = mode === 'text'

  const toolbar = (
    <div className="et-bar">
      <Segmented label="Edit mode" value={mode} onChange={(m) => setOptions((x) => ({ ...x, mode: m }))} options={MODES} testId="edit-mode" />
      {editing && (
        <>
          <button type="button" className="icon-btn" onClick={te.undo} disabled={!te.canUndo || te.busy} aria-label="Undo text edit" title="Undo (Ctrl+Z)" data-testid="et-undo">
            <Icon name="undo" size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={te.redo} disabled={!te.canRedo || te.busy} aria-label="Redo text edit" title="Redo (Ctrl+Y)" data-testid="et-redo">
            <Icon name="redo" size={16} />
          </button>
          {te.busy && <span className="et-status">Applying…</span>}
        </>
      )}
    </div>
  )

  return (
    <>
      <PageStage
        files={files}
        target={target}
        onTarget={onTarget}
        testId="edit-canvas"
        zoom
        fitNarrow={editing}
        bytes={te.bytes}
        onRendered={te.onRendered}
        toolbar={toolbar}
        banner={editing ? te.banner : null}
        cursor={editing ? 'default' : 'crosshair'}
        hint={editing ? (te.model && !te.banner ? 'Click a word to change it. Double-click for the whole line.' : null) : tool?.[3]}
        onDown={
          editing
            ? undefined
            : (p, _e, ctx) => {
                if (o.tool === 'text') {
                  if (o.text.trim()) add({ type: 'text', pageIndex: ctx.page - 1, x: p.x, y: p.y, text: o.text, size: o.size, color: o.color, font: 'helvetica' })
                  return
                }
                if (o.tool === 'image' && !o.image) return
                start.current = p
                setDraft(o.tool === 'ink' ? { points: [p] } : null)
              }
        }
        onMove={(p) => {
          if (!start.current) return
          if (o.tool === 'ink') setDraft((d) => ({ points: [...(d?.points ?? []), p] }))
          else setDraft({ ...dragRect(start.current, p), x1: start.current.x, y1: start.current.y, x2: p.x, y2: p.y })
        }}
        onUp={(p, _e, ctx) => {
          const s = start.current
          start.current = null
          const d = draft
          setDraft(null)
          if (!s) return
          const pageIndex = ctx.page - 1
          if (o.tool === 'ink') {
            if (d?.points?.length > 2) add({ type: 'ink', pageIndex, points: d.points.map(({ x, y }) => ({ x, y })), color: o.color, borderWidth: o.thickness })
            return
          }
          const r = dragRect(s, p)
          if (o.tool === 'line') {
            if (r.w > 2 || r.h > 2) add({ type: 'line', pageIndex, x: s.x, y: s.y, x2: p.x, y2: p.y, color: o.color, borderWidth: o.thickness })
            return
          }
          if (r.w < 4 || r.h < 4) return
          const box = { pageIndex, x: r.x, y: r.y, w: r.w, h: r.h }
          if (o.tool === 'highlight') add({ type: 'highlight', ...box, color: '#ffe066', opacity: 0.4 })
          else if (o.tool === 'erase') add({ type: 'rect', ...box, color: '#ffffff', fill: '#ffffff', borderWidth: 0 })
          else if (o.tool === 'image') add({ type: 'image', ...box, bytes: o.image.bytes, imgType: o.image.type, url: o.image.url })
          else add({ type: o.tool, ...box, color: o.color, borderWidth: o.thickness })
        }}
      >
        {(ctx) => (
          <>
            {els
              .filter((el) => el.pageIndex === ctx.page - 1)
              .map((el) => (
                <Element key={el.id} el={el} size={ctx.size} onRemove={() => setEls((list) => list.filter((x) => x.id !== el.id))} />
              ))}
            {editing && te.layer(ctx)}
            {draft?.points && (
              <svg className="g3-ov g3-el-svg" viewBox={`0 0 ${ctx.size.width} ${ctx.size.height}`} preserveAspectRatio="none">
                <polyline points={draft.points.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={o.color} strokeWidth={o.thickness} />
              </svg>
            )}
            {draft && !draft.points && <span className="g3-ov g3-draft" style={ptStyle(draft, ctx.size)} />}
          </>
        )}
      </PageStage>
      {te.dialog}
    </>
  )
}

function Options({ options: o, setOptions, files }) {
  const set = (fields) => setOptions((x) => ({ ...x, ...fields }))
  // any Add control picks Add mode
  const setAdd = (fields) => setOptions((x) => ({ ...x, ...fields, mode: 'add' }))
  const mode = modeOf(o)
  const count = files.reduce((n, f) => n + (o.elements[f.id]?.length ?? 0), 0)
  const addTool = mode === 'add' ? o.tool : null
  return (
    <>
      <div className="field">
        <span className="field-label">Mode</span>
        <Segmented label="Edit mode" value={mode} onChange={(m) => set({ mode: m })} options={MODES} testId="edit-mode-panel" />
      </div>
      {mode === 'text' && <TextPanel options={o} setOptions={setOptions} files={files} />}
      {mode === 'text' && <span className="field-label et-add-label">Add to the page</span>}
      <div className="g3-tools" role="radiogroup" aria-label="Add tool">
        {TOOLS.map(([id, label, icon]) => (
          <button key={id} type="button" role="radio" aria-checked={addTool === id} className={addTool === id ? 'is-on' : ''} data-testid={`edit-tool-${id}`} onClick={() => setAdd({ tool: id })}>
            <Icon name={icon} size={18} />
            {label}
          </button>
        ))}
      </div>
      {(o.tool === 'text' || mode === 'text') && (
        <>
          <Field label={mode === 'text' ? 'New text' : 'Text'} help={mode === 'text' ? 'Typing here switches to Add: then click the page to place it.' : undefined}>
            {(id) => <input id={id} className="input" data-testid="edit-text-input" value={o.text} onChange={(e) => setAdd({ text: e.target.value, tool: 'text' })} />}
          </Field>
          {mode === 'add' && (
            <Field label={`Size ${o.size} pt`}>
              {(id) => <input id={id} type="range" min="6" max="72" value={o.size} onChange={(e) => set({ size: Number(e.target.value) })} />}
            </Field>
          )}
        </>
      )}
      {mode === 'add' && o.tool === 'image' && (
        <Field label="Image" help={o.image ? `Using ${o.image.name}` : 'JPG, PNG or WebP'}>
          {(id) => (
            <input
              id={id}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              data-testid="edit-image-input"
              onChange={async (e) => {
                const f = e.target.files[0]
                if (!f) return
                const { normalizeImage } = await import('../../lib/imageOps.js')
                const norm = await normalizeImage(await f.arrayBuffer())
                set({ image: { bytes: norm.bytes, type: norm.type, name: f.name, url: URL.createObjectURL(new Blob([norm.bytes])) } })
              }}
            />
          )}
        </Field>
      )}
      {mode === 'add' && ['rect', 'ellipse', 'line', 'ink'].includes(o.tool) && (
        <Field label={`Thickness ${o.thickness} pt`}>
          {(id) => <input id={id} type="range" min="1" max="12" value={o.thickness} onChange={(e) => set({ thickness: Number(e.target.value) })} />}
        </Field>
      )}
      {mode === 'add' && !['erase', 'highlight', 'image'].includes(o.tool) && (
        <Field label="Colour">
          {(id) => <input id={id} type="color" value={o.color} onChange={(e) => set({ color: e.target.value })} />}
        </Field>
      )}
      {mode === 'add' && (
        <p className="g3-note" data-testid="edit-scope-note">
          Add puts new text, shapes, highlights and images on top of the page. White-out only covers; to delete content for good, use Redact.
        </p>
      )}
      <p className="field-help" data-testid="edit-count">
        {plural(count, 'added item')} so far.
      </p>
      {count > 0 && (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => {
              // undo the newest added item across the selected files
              let best = null
              for (const f of files) for (const el of o.elements[f.id] ?? []) if (!best || el.id > best.el.id) best = { id: f.id, el }
              if (best) set({ elements: { ...o.elements, [best.id]: o.elements[best.id].filter((x) => x !== best.el) } })
            }}
          >
            <Icon name="undo" size={15} />
            Undo last
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => set({ elements: {} })}>
            Clear all
          </button>
        </div>
      )}
    </>
  )
}

const editsOf = (o, f) => (o.elements[f.id]?.length ?? 0) + textEditCount(o, f.id)

export default {
  id: 'edit',
  name: 'Edit',
  io: 'PDF → PDF',
  description: 'Change the text already on the page, or add text, shapes, highlights, drawing and images.',
  category: 'Edit',
  icon: 'edit',
  accepts: { min: 1 },
  defaults: { mode: 'auto', autoMode: null, tool: 'text', text: 'Your text here', size: 16, color: '#d92d20', thickness: 2, image: null, elements: {}, versions: {} },
  next: ['sign', 'compress', 'pagenumbers'],
  Canvas,
  Options,
  // the files a run changes (the Shell's "Replaces ..." line names only these)
  changes(files, o) {
    return files.filter((f) => editsOf(o, f))
  },
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Apply edits' }
    const touched = files.filter((f) => editsOf(o, f))
    if (touched.length === 0) {
      const line = modeOf(o) !== 'text' ? 'Pick a tool and click or drag on the page.' : o.pageKind === 'scanned' ? 'Scanned page: run OCR first to edit its text.' : 'Click a word on the page to change it.'
      return { ready: false, line, runLabel: 'Apply edits' }
    }
    const count = touched.reduce((n, f) => n + editsOf(o, f), 0)
    return { ready: true, line: `${plural(touched.length, 'edited PDF')} will be created with ${plural(count, 'edit')}.`, runLabel: `Apply ${plural(count, 'edit')}` }
  },
  async run(files, o, ctx) {
    const outputs = []
    const touched = files.filter((f) => editsOf(o, f))
    for (const [i, f] of touched.entries()) {
      ctx.check()
      ctx.progress(i, touched.length, `Editing ${f.name}`)
      // text edits are already applied: start from a copy of the newest
      // version (the canvas releases its own buffers from pdf.js later)
      let bytes = textBytesOf(o, f.id)?.slice() ?? f.bytes
      const els = o.elements[f.id] ?? []
      if (els.length) {
        const { applyEdits } = await import('../../lib/editOps.js')
        bytes = await applyEdits(bytes, els.map(({ id, url, ...el }) => el))
      }
      const n = textEditCount(o, f.id)
      // text edits were saved fast (old text still in the bytes): the final
      // garbage-collected save drops it; it runs last so nothing re-adds it
      if (n) bytes = (await ctx.call('editTextFinalize', bytes)).bytes
      const note = []
      if (n) note.push(`${plural(n, 'text edit')}`)
      const fonts = fallbackFontsIn(o, f.id)
      if (fonts.length) note.push(`closest font match: ${fonts.join(', ')}`)
      if (els.length) note.push(`${plural(els.length, 'added item')}`)
      let line = note.join(', ')
      line = line ? `${line[0].toUpperCase()}${line.slice(1)}.` : ''
      if (signatureRemovedIn(o, f.id)) line = `${line} Digital signature removed.`.trim()
      outputs.push({ name: `${baseName(f.name)}-edited.pdf`, bytes, parentIds: [f.id], ...(line ? { note: line } : {}) })
    }
    for (const f of touched) markSaved(f.id)
    ctx.progress(touched.length, touched.length, 'Done')
    return outputs
  },
}
