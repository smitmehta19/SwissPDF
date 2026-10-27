// Workbench "Pages" mode: every selected file is a track of page tiles.
// Select tiles (click, Shift-click, or a range like 1-3, 8), then rotate,
// duplicate, delete, move, insert blank pages or mark split points. Each
// tile also has its own view, rotate, duplicate and delete buttons. Edits
// stay in memory with undo and redo until Save writes a new version of each
// changed file (a file with split points becomes several files).
import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { useThumbs, LoadMoreThumbsButton } from '../components/PagePreview.jsx'
import { parseRangeSpec, sortPreset } from '../lib/pageRanges.js'
import { assertValidOutput } from '../lib/pdfOps.js'
import { downloadBytes } from '../lib/download.js'
import { saveZip } from '../lib/deliver.js'
import { addVersions, filesForRun, getBytes, getRecord } from './fileStore.js'
import { keepRestrictions, prepareRestricted } from '../lib/intake.js'
import { callOp } from './jobs.js'

let keySeq = 1
const identity = (n) => Array.from({ length: n }, (_, i) => ({ key: `p${i}`, src: i, rotate: 0 }))
const isIdentity = (tiles, n) => tiles.length === n && tiles.every((t, i) => t.src === i && t.rotate % 360 === 0)
const baseName = (name) => name.replace(/\.pdf$/i, '')
const planOf = (tiles) => tiles.map(({ src, rotate }) => ({ src, rotate }))

// Split points that still cut somewhere: not after the last tile.
function cutsOf(tiles, marks) {
  if (!marks?.length) return []
  return tiles.slice(0, -1).filter((t) => marks.includes(t.key)).map((t) => t.key)
}

// Tiles in parts, cut after each marked tile.
function partsOf(tiles, marks) {
  const parts = [[]]
  for (const t of tiles) {
    parts[parts.length - 1].push(t)
    if (marks.includes(t.key)) parts.push([])
  }
  return parts.filter((p) => p.length)
}

export function usePageEditor(files) {
  const [edits, setEdits] = useState({}) // fileId -> tiles
  const [splits, setSplits] = useState({}) // fileId -> tile keys to split after
  const [sel, setSel] = useState(() => new Set()) // `${fileId}|${key}`
  const [history, setHistory] = useState([]) // [{ edits, splits }]
  const [future, setFuture] = useState([])
  const [busy, setBusyState] = useState(false)
  // read at once, so no edit slips in between Save starting and the re-render
  const busyRef = useRef(false)
  const setBusy = (v) => {
    busyRef.current = v
    setBusyState(v)
  }
  const [message, setMessage] = useState(null)
  const anchor = useRef(null)

  const tilesOf = (f) => edits[f.id] ?? identity(f.pageCount)
  const splitsOf = (f) => cutsOf(tilesOf(f), splits[f.id])
  // Edits belong to workspace files, not to the selection: a file that is
  // deselected keeps its unsaved edits (and the unsaved dot) until it is saved,
  // discarded or leaves the workspace.
  const live = (id) => {
    const r = getRecord(id)
    return r?.isLeaf && r.status === 'ready' ? r : null
  }
  const dirtyIds = [...new Set([...Object.keys(edits), ...Object.keys(splits)])].filter((id) => {
    const r = live(id)
    if (!r) return false
    const tiles = edits[id] ?? identity(r.pageCount)
    return !isIdentity(tiles, r.pageCount) || cutsOf(tiles, splits[id]).length > 0
  })

  // forget edits of files that left the workspace
  useEffect(() => {
    if (Object.keys(edits).some((id) => !live(id))) {
      setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => live(id))))
    }
    if (Object.keys(splits).some((id) => !live(id))) {
      setSplits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => live(id))))
    }
  }, [files]) // eslint-disable-line react-hooks/exhaustive-deps

  // no edits while Save runs: they would be wiped when it ends
  const commit = (next, nextSplits = splits) => {
    if (busyRef.current) return
    setHistory((h) => [...h.slice(-49), { edits, splits }])
    setFuture([])
    setEdits(next)
    setSplits(nextSplits)
    setMessage(null)
  }

  // Applies fn(tiles, selectedKeys) to every file that has selected tiles.
  const change = (fn) => {
    const next = { ...edits }
    let touched = false
    for (const f of files) {
      const keys = new Set([...sel].filter((s) => s.startsWith(`${f.id}|`)).map((s) => s.slice(f.id.length + 1)))
      if (keys.size === 0) continue
      next[f.id] = fn(tilesOf(f), keys)
      touched = true
    }
    if (touched) commit(next)
  }

  // Same, for one tile of one file (the buttons on a tile).
  const changeOne = (f, key, fn) => commit({ ...edits, [f.id]: fn(tilesOf(f), new Set([key])) })

  const rotateFn = (delta) => (tiles, keys) => tiles.map((t) => (keys.has(t.key) ? { ...t, rotate: (t.rotate + delta + 360) % 360 } : t))
  const duplicateFn = (tiles, keys) => tiles.flatMap((t) => (keys.has(t.key) ? [t, { ...t, key: `d${keySeq++}` }] : [t]))
  const removeFn = (tiles, keys) => tiles.filter((t) => !keys.has(t.key))

  // Selected tiles per file, in track order.
  const selectedByFile = () =>
    files
      .map((f) => ({ f, tiles: tilesOf(f).filter((t) => sel.has(`${f.id}|${t.key}`)) }))
      .filter((x) => x.tiles.length)

  const actions = {
    toggle(f, tile, shift) {
      const id = `${f.id}|${tile.key}`
      const tiles = tilesOf(f)
      const from = anchor.current // read now: the updater runs after the anchor moves
      setSel((prev) => {
        const nextSel = new Set(prev)
        if (shift && from?.fileId === f.id) {
          const a = tiles.findIndex((t) => t.key === from.key)
          const b = tiles.findIndex((t) => t.key === tile.key)
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) nextSel.add(`${f.id}|${tiles[i].key}`)
        } else if (nextSel.has(id)) nextSel.delete(id)
        else nextSel.add(id)
        return nextSel
      })
      anchor.current = { fileId: f.id, key: tile.key }
    },
    // "1,3,5-8" on every track; a shorter file gets the pages it has
    selectRange(spec) {
      const nextSel = new Set()
      const longest = Math.max(1, ...files.map((f) => tilesOf(f).length))
      const short = []
      try {
        const { pages } = parseRangeSpec(spec, longest)
        for (const f of files) {
          const tiles = tilesOf(f)
          const own = pages.filter((n) => n <= tiles.length)
          if (own.length < pages.length) short.push(f.name)
          for (const n of own) nextSel.add(`${f.id}|${tiles[n - 1].key}`)
        }
      } catch (err) {
        setMessage({ kind: 'error', text: err.message })
        return
      }
      setMessage(short.length ? { kind: 'warn', text: `Some pages are past the end of ${short.join(', ')}: selected the pages that exist.` } : null)
      setSel(nextSel)
    },
    selectAll() {
      setSel(new Set(files.flatMap((f) => tilesOf(f).map((t) => `${f.id}|${t.key}`))))
    },
    clear: () => setSel(new Set()),
    rotate(delta) {
      change(rotateFn(delta))
    },
    remove() {
      change(removeFn)
      setSel(new Set())
    },
    duplicate() {
      change(duplicateFn)
    },
    blank() {
      change((tiles, keys) => tiles.flatMap((t) => (keys.has(t.key) ? [t, { key: `b${keySeq++}`, src: null, rotate: 0 }] : [t])))
    },
    // Split after each selected tile; selecting only marked tiles removes the marks.
    splitAfter() {
      const next = { ...splits }
      let touched = false
      for (const { f, tiles } of selectedByFile()) {
        const keys = tiles.map((t) => t.key)
        const cur = new Set(splits[f.id] ?? [])
        const allOn = keys.every((k) => cur.has(k))
        for (const k of keys) {
          if (allOn) cur.delete(k)
          else cur.add(k)
        }
        next[f.id] = [...cur]
        touched = true
      }
      if (touched) commit(edits, next)
    },
    rotateOne: (f, key, delta) => changeOne(f, key, rotateFn(delta)),
    duplicateOne: (f, key) => changeOne(f, key, duplicateFn),
    removeOne(f, key) {
      changeOne(f, key, removeFn)
      setSel((prev) => {
        const next = new Set(prev)
        next.delete(`${f.id}|${key}`)
        return next
      })
    },
    move(delta) {
      change((tiles, keys) => {
        const next = tiles.slice()
        const order = delta < 0 ? next.map((_, i) => i) : next.map((_, i) => next.length - 1 - i)
        for (const i of order) {
          const j = i + delta
          if (keys.has(next[i].key) && j >= 0 && j < next.length && !keys.has(next[j].key)) [next[i], next[j]] = [next[j], next[i]]
        }
        return next
      })
    },
    dragMove(f, from, to) {
      if (from === to) return
      const next = tilesOf(f).slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      commit({ ...edits, [f.id]: next })
    },
    // Page order preset (reverse, oddEven, duplex, booklet) on every track.
    arrange(kind) {
      const next = { ...edits }
      for (const f of files) {
        const tiles = tilesOf(f)
        next[f.id] = sortPreset(kind, tiles.length).map((i) => (i === null ? { key: `b${keySeq++}`, src: null, rotate: 0 } : tiles[i]))
      }
      commit(next)
    },
    undo() {
      if (!history.length || busyRef.current) return
      const prev = history[history.length - 1]
      setFuture((fu) => [...fu, { edits, splits }])
      setEdits(prev.edits)
      setSplits(prev.splits)
      setHistory((h) => h.slice(0, -1))
    },
    redo() {
      if (!future.length || busyRef.current) return
      const next = future[future.length - 1]
      setHistory((h) => [...h, { edits, splits }])
      setEdits(next.edits)
      setSplits(next.splits)
      setFuture((fu) => fu.slice(0, -1))
    },
    reset() {
      commit({}, {})
      setSel(new Set())
    },
    // The selected pages as a new PDF (one per file, zipped when several),
    // straight to a download. Nothing is added to the workspace.
    async downloadSelected() {
      const picked = selectedByFile()
      if (!picked.length) return
      setBusy(true)
      setMessage(null)
      try {
        const outs = []
        for (const { f, tiles } of picked) {
          // owner-only (restricted) files: the pages keep the restrictions, as on Save
          const inputs = await prepareRestricted('organize', await filesForRun([f.id]))
          const src = inputs[0]?.bytes ?? (await getBytes(f.id))
          const out = { name: `${baseName(f.name)}-pages.pdf`, bytes: await callOp('pageEdit', [src, planOf(tiles)]), parentIds: [f.id] }
          await keepRestrictions('organize', [out], inputs)
          outs.push({ name: out.name, bytes: out.bytes })
        }
        if (outs.length === 1) downloadBytes(outs[0].bytes, outs[0].name)
        else await saveZip(outs, 'swisspdf-pages.zip', { size: outs.reduce((n, o) => n + o.bytes.byteLength, 0) })
        const count = picked.reduce((n, x) => n + x.tiles.length, 0)
        setMessage({ kind: 'ok', text: `Downloaded ${count} page${count === 1 ? '' : 's'}.` })
      } catch (err) {
        setMessage({ kind: 'error', text: `Could not download the pages: ${err.message}` })
      } finally {
        setBusy(false)
      }
    },
    async apply() {
      if (busyRef.current) return
      setBusy(true)
      setMessage(null)
      try {
        let n = 0
        let parts = 0
        const todo = dirtyIds.map(live).filter(Boolean)
        // a file with every page deleted would write nothing: say so first
        const empty = todo.find((f) => tilesOf(f).length === 0)
        if (empty) {
          setMessage({ kind: 'error', text: `Every page of ${empty.name} is deleted. Keep at least one page, or Discard.` })
          return
        }
        for (const f of todo) {
          const tiles = tilesOf(f)
          const groups = partsOf(tiles, splitsOf(f))
          // owner-only (restricted) files: edit the open copy, the result keeps the restrictions
          const inputs = await prepareRestricted('organize', await filesForRun([f.id]))
          const src = inputs[0]?.bytes ?? (await getBytes(f.id))
          const outputs = []
          for (const [i, group] of groups.entries()) {
            const bytes = await callOp('pageEdit', [src, planOf(group)])
            const { pageCount } = await assertValidOutput(bytes)
            const name = groups.length > 1 ? `${baseName(f.name)}-part${i + 1}.pdf` : f.name
            outputs.push({ name, bytes, pageCount, parentIds: [f.id] })
          }
          await keepRestrictions('organize', outputs, inputs)
          // one change per file, so one undo brings the whole file back
          const change = await addVersions(outputs, { tool: 'page-editor', consumedIds: [f.id] })
          if (!change) continue
          n++
          if (groups.length > 1) parts += groups.length
        }
        setEdits({})
        setSplits({})
        setHistory([])
        setFuture([])
        setSel(new Set())
        const split = parts ? ` Split into ${parts} files.` : ''
        setMessage({ kind: 'ok', text: `Saved a new version of ${n} file${n === 1 ? '' : 's'}.${split} Use the undo button on a file card to step back.` })
      } catch (err) {
        setMessage({ kind: 'error', text: `Could not apply the changes: ${err.message}` })
      } finally {
        setBusy(false)
      }
    },
  }
  return {
    tilesOf,
    splitsOf,
    sel,
    dirty: dirtyIds.length > 0,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    busy,
    message,
    actions,
  }
}

function useFileBytes(id) {
  const [bytes, setBytes] = useState(null)
  useEffect(() => {
    let active = true
    getBytes(id).then((b) => active && setBytes(b), () => {})
    return () => {
      active = false
    }
  }, [id])
  return bytes
}

function Track({ file, editor, onView }) {
  const bytes = useFileBytes(file.id)
  const thumbState = useThumbs(file.id, bytes, file.pageCount)
  const tiles = editor.tilesOf(file)
  const cuts = new Set(editor.splitsOf(file))
  const fromRef = useRef(null)
  const [over, setOver] = useState(null)
  const a = editor.actions
  const parts = cuts.size + 1
  return (
    <section className="track" aria-label={file.name} data-testid="page-track">
      <h3 className="track-title">
        <span className="file-name">{file.name}</span>
        <span className="fc-version mono track-version" title={`Version ${file.version ?? 1}`} data-testid="track-version">
          v{file.version ?? 1}
        </span>
        <span className="mono track-count">
          {tiles.length} page{tiles.length === 1 ? '' : 's'}{parts > 1 ? `, ${parts} parts on save` : ''}
        </span>
      </h3>
      <ol className="tiles">
        {tiles.map((t, i) => {
          const on = editor.sel.has(`${file.id}|${t.key}`)
          const thumb = t.src !== null ? thumbState.thumbs[t.src] : null
          const name = t.src === null ? `blank page at position ${i + 1}` : `page ${t.src + 1} (position ${i + 1})`
          return (
            <li
              key={t.key}
              className={`tile ${on ? 'is-selected' : ''} ${over === i ? 'is-over' : ''} ${cuts.has(t.key) ? 'is-cut' : ''}`}
              draggable
              onDragStart={(e) => {
                fromRef.current = i
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(i)
              }}
              onDragLeave={() => setOver((v) => (v === i ? null : v))}
              onDrop={(e) => {
                e.preventDefault()
                if (fromRef.current !== null) a.dragMove(file, fromRef.current, i)
                fromRef.current = null
                setOver(null)
              }}
              onDragEnd={() => {
                fromRef.current = null
                setOver(null)
              }}
            >
              <button
                type="button"
                className="tile-btn"
                aria-pressed={on}
                aria-label={t.src === null ? `Blank page, position ${i + 1}` : `Page ${t.src + 1}, position ${i + 1}`}
                onClick={(e) => a.toggle(file, t, e.shiftKey)}
                data-page={t.src === null ? 'blank' : t.src + 1}
              >
                <span className="tile-paper">
                  {t.src === null ? (
                    <span className="tile-blank">Blank</span>
                  ) : thumb ? (
                    <img src={thumb} alt="" style={t.rotate ? { transform: `rotate(${t.rotate}deg)` } : undefined} />
                  ) : (
                    <span className="tile-blank mono">{t.src + 1}</span>
                  )}
                </span>
                <span className="tile-num mono">
                  {i + 1}
                  {t.src !== null && t.src !== i && <span className="tile-was"> was {t.src + 1}</span>}
                </span>
              </button>
              <div className="tile-actions" data-testid="tile-actions">
                {t.src !== null && onView && (
                  <button type="button" tabIndex={-1} className="tile-act" onClick={() => onView(file.id, t.src + 1)} aria-label={`View ${name}`} title="View">
                    <Icon name="viewer" size={14} />
                  </button>
                )}
                <button type="button" tabIndex={-1} className="tile-act" onClick={() => a.rotateOne(file, t.key, 90)} aria-label={`Rotate ${name} right`} title="Rotate right">
                  <Icon name="rotate" size={14} />
                </button>
                <button type="button" tabIndex={-1} className="tile-act" onClick={() => a.duplicateOne(file, t.key)} aria-label={`Duplicate ${name}`} title="Duplicate">
                  <Icon name="duplicate" size={14} />
                </button>
                <button type="button" tabIndex={-1} className="tile-act tile-act-danger" onClick={() => a.removeOne(file, t.key)} aria-label={`Delete ${name}`} title="Delete">
                  <Icon name="trash" size={14} />
                </button>
              </div>
              {cuts.has(t.key) && (
                <span className="tile-cut" aria-label={`Split after position ${i + 1}`} role="img">
                  <Icon name="cut" size={14} />
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <LoadMoreThumbsButton fileId={file.id} thumbState={thumbState} />
    </section>
  )
}

// toolOwnsRun: a page tool is open (Extract, Remove, Organize). Its own
// page field and Run button do the job, so the bar drops its page box and Save.
export default function PageEditor({ files, editor, onView, toolOwnsRun = false }) {
  const [range, setRange] = useState('')
  const a = editor.actions
  // nothing to act on, or a save is running (its result would drop new edits)
  const none = editor.sel.size === 0 || editor.busy
  if (files.length === 0) return <p className="empty-line">Select files in Files to edit their pages.</p>
  return (
    <section className={`page-editor ${editor.busy ? 'is-busy' : ''}`} aria-label="Page editor" aria-busy={editor.busy} data-testid="page-editor">
      <div className="pe-bar" role="toolbar" aria-label="Page actions">
        {!toolOwnsRun && (
        <form
          className="pe-range"
          onSubmit={(e) => {
            e.preventDefault()
            if (range.trim()) a.selectRange(range)
          }}
        >
          <label className="sr-only" htmlFor="pe-range">
            Select pages by number
          </label>
          <input id="pe-range" className="input input-small" placeholder="Pages, e.g. 1,3,5-8" value={range} onChange={(e) => setRange(e.target.value)} data-testid="pe-range" />
          <button type="submit" className="btn btn-quiet btn-small" data-testid="pe-range-btn">
            Select
          </button>
        </form>
        )}
        <button type="button" className="btn btn-quiet btn-small" onClick={none ? a.selectAll : a.clear} data-testid="pe-select-all">
          {none ? 'Select all' : `Clear (${editor.sel.size})`}
        </button>
        <span className="pe-sep" />
        <button type="button" className="icon-btn" onClick={() => a.rotate(-90)} disabled={none} aria-label="Rotate left" title="Rotate left">
          <Icon name="rotate" size={16} className="flip-x" />
        </button>
        <button type="button" className="icon-btn" onClick={() => a.rotate(90)} disabled={none} aria-label="Rotate right" title="Rotate right">
          <Icon name="rotate" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={a.blank} disabled={none} aria-label="Insert blank page after" title="Insert blank page after">
          <Icon name="blank" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={a.splitAfter} disabled={none} aria-label="Split after" title="Split after (the file becomes several files on Save)" data-testid="pe-split">
          <Icon name="cut" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={a.duplicate} disabled={none} aria-label="Duplicate" title="Duplicate">
          <Icon name="duplicate" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={() => a.move(-1)} disabled={none} aria-label="Move earlier" title="Move earlier">
          <Icon name="left" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={() => a.move(1)} disabled={none} aria-label="Move later" title="Move later">
          <Icon name="right" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={a.downloadSelected} disabled={none || editor.busy} aria-label="Download selected pages" title="Download selected pages" data-testid="pe-download">
          <Icon name="download" size={16} />
        </button>
        <button type="button" className="icon-btn icon-btn-danger" onClick={a.remove} disabled={none} aria-label="Delete" title="Delete">
          <Icon name="trash" size={16} />
        </button>
        <span className="pe-sep" />
        <button type="button" className="icon-btn" onClick={a.undo} disabled={!editor.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
          <Icon name="undo" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={a.redo} disabled={!editor.canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" data-testid="pe-redo">
          <Icon name="redo" size={16} />
        </button>
        <span className="pe-grow" />
        {!toolOwnsRun && editor.dirty && (
          <button type="button" className="link" onClick={a.reset}>
            Discard
          </button>
        )}
        {!toolOwnsRun && (
          <button type="button" className="btn btn-primary btn-small" onClick={a.apply} disabled={!editor.dirty || editor.busy} data-testid="pe-apply" title="Save a new version of each changed file">
            <Icon name="save" size={15} />
            {editor.busy ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
      {editor.message && (
        <p className={`notice notice-${editor.message.kind}`} role="status">
          {editor.message.text}
        </p>
      )}
      <div
        className="tracks"
        onKeyDown={(e) => {
          const k = e.key.toLowerCase()
          if ((e.ctrlKey || e.metaKey) && ((k === 'z' && e.shiftKey) || k === 'y')) {
            e.preventDefault()
            a.redo()
          } else if ((e.ctrlKey || e.metaKey) && k === 'z') {
            e.preventDefault()
            a.undo()
          }
          if (e.key === 'Delete' && !none) a.remove()
        }}
      >
        {files.map((f) => (
          <Track key={f.id} file={f} editor={editor} onView={onView} />
        ))}
      </div>
    </section>
  )
}
