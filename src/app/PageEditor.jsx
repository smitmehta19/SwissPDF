// Workbench "Pages" mode: every selected file is a track of page tiles.
// Select tiles (click, Shift-click, or a range like 1-3, 8), then rotate,
// duplicate, delete, move or insert blank pages. Edits stay in memory with
// undo until "Apply changes" writes a new version of each changed file.
import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { useThumbs, LoadMoreThumbsButton } from '../components/PagePreview.jsx'
import { parseRangeSpec, sortPreset } from '../lib/pageRanges.js'
import { assertValidOutput } from '../lib/pdfOps.js'
import { addVersions, getBytes } from './fileStore.js'
import { callOp } from './jobs.js'

let keySeq = 1
const identity = (n) => Array.from({ length: n }, (_, i) => ({ key: `p${i}`, src: i, rotate: 0 }))
const isIdentity = (tiles, n) => tiles.length === n && tiles.every((t, i) => t.src === i && t.rotate % 360 === 0)

export function usePageEditor(files) {
  const [edits, setEdits] = useState({}) // fileId -> tiles
  const [sel, setSel] = useState(() => new Set()) // `${fileId}|${key}`
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const anchor = useRef(null)

  const tilesOf = (f) => edits[f.id] ?? identity(f.pageCount)
  const dirtyIds = files.filter((f) => edits[f.id] && !isIdentity(edits[f.id], f.pageCount)).map((f) => f.id)

  // forget edits of files that left the workspace
  useEffect(() => {
    const ids = new Set(files.map((f) => f.id))
    if (Object.keys(edits).some((id) => !ids.has(id))) {
      setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id))))
    }
  }, [files]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next) => {
    setHistory((h) => [...h.slice(-49), edits])
    setEdits(next)
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
    selectRange(spec) {
      const nextSel = new Set()
      try {
        for (const f of files) {
          const tiles = tilesOf(f)
          const { pages } = parseRangeSpec(spec, tiles.length)
          for (const n of pages) if (tiles[n - 1]) nextSel.add(`${f.id}|${tiles[n - 1].key}`)
        }
      } catch (err) {
        setMessage({ kind: 'error', text: err.message })
        return
      }
      setSel(nextSel)
    },
    selectAll() {
      setSel(new Set(files.flatMap((f) => tilesOf(f).map((t) => `${f.id}|${t.key}`))))
    },
    clear: () => setSel(new Set()),
    rotate(delta) {
      change((tiles, keys) => tiles.map((t) => (keys.has(t.key) ? { ...t, rotate: (t.rotate + delta + 360) % 360 } : t)))
    },
    remove() {
      change((tiles, keys) => tiles.filter((t) => !keys.has(t.key)))
      setSel(new Set())
    },
    duplicate() {
      change((tiles, keys) => tiles.flatMap((t) => (keys.has(t.key) ? [t, { ...t, key: `d${keySeq++}` }] : [t])))
    },
    blank() {
      change((tiles, keys) => tiles.flatMap((t) => (keys.has(t.key) ? [t, { key: `b${keySeq++}`, src: null, rotate: 0 }] : [t])))
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
      if (!history.length) return
      setEdits(history[history.length - 1])
      setHistory((h) => h.slice(0, -1))
    },
    reset() {
      commit({})
      setSel(new Set())
    },
    async apply() {
      setBusy(true)
      setMessage(null)
      try {
        let n = 0
        for (const f of files.filter((x) => dirtyIds.includes(x.id))) {
          const plan = tilesOf(f).map(({ src, rotate }) => ({ src, rotate }))
          const bytes = await callOp('pageEdit', [await getBytes(f.id), plan])
          const { pageCount } = await assertValidOutput(bytes)
          await addVersions([{ name: f.name, bytes, pageCount, parentIds: [f.id] }], { tool: 'page-editor', consumedIds: [f.id] })
          n++
        }
        setEdits({})
        setHistory([])
        setSel(new Set())
        setMessage({ kind: 'ok', text: `Saved a new version of ${n} file${n === 1 ? '' : 's'}. Use the undo button on a file card to step back.` })
      } catch (err) {
        setMessage({ kind: 'error', text: `Could not apply the changes: ${err.message}` })
      } finally {
        setBusy(false)
      }
    },
  }
  return { tilesOf, sel, dirty: dirtyIds.length > 0, canUndo: history.length > 0, busy, message, actions }
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

function Track({ file, editor }) {
  const bytes = useFileBytes(file.id)
  const thumbState = useThumbs(file.id, bytes, file.pageCount)
  const tiles = editor.tilesOf(file)
  const fromRef = useRef(null)
  const [over, setOver] = useState(null)
  return (
    <section className="track" aria-label={file.name} data-testid="page-track">
      <h3 className="track-title">
        <span className="file-name">{file.name}</span>
        <span className="mono track-count">{tiles.length} pages</span>
      </h3>
      <ol className="tiles">
        {tiles.map((t, i) => {
          const on = editor.sel.has(`${file.id}|${t.key}`)
          const thumb = t.src !== null ? thumbState.thumbs[t.src] : null
          return (
            <li
              key={t.key}
              className={`tile ${on ? 'is-selected' : ''} ${over === i ? 'is-over' : ''}`}
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
                if (fromRef.current !== null) editor.actions.dragMove(file, fromRef.current, i)
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
                onClick={(e) => editor.actions.toggle(file, t, e.shiftKey)}
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
            </li>
          )
        })}
      </ol>
      <LoadMoreThumbsButton fileId={file.id} thumbState={thumbState} />
    </section>
  )
}

export default function PageEditor({ files, editor }) {
  const [range, setRange] = useState('')
  const a = editor.actions
  const none = editor.sel.size === 0
  if (files.length === 0) return <p className="empty-line">Select files in Files to edit their pages.</p>
  return (
    <section className="page-editor" aria-label="Page editor" data-testid="page-editor">
      <div className="pe-bar" role="toolbar" aria-label="Page actions">
        <form
          className="pe-range"
          onSubmit={(e) => {
            e.preventDefault()
            if (range.trim()) a.selectRange(range)
          }}
        >
          <label className="sr-only" htmlFor="pe-range">
            Select pages
          </label>
          <input id="pe-range" className="input input-small" placeholder="Select pages, e.g. 1-3, 8" value={range} onChange={(e) => setRange(e.target.value)} />
          <button type="submit" className="btn btn-quiet btn-small">
            Select
          </button>
        </form>
        <button type="button" className="btn btn-quiet btn-small" onClick={none ? a.selectAll : a.clear}>
          {none ? 'Select all' : 'Clear'}
        </button>
        <span className="pe-sep" />
        <button type="button" className="icon-btn" onClick={() => a.rotate(-90)} disabled={none} aria-label="Rotate left" title="Rotate left">
          <Icon name="rotate" size={16} className="flip-x" />
        </button>
        <button type="button" className="icon-btn" onClick={() => a.rotate(90)} disabled={none} aria-label="Rotate right" title="Rotate right">
          <Icon name="rotate" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={a.duplicate} disabled={none} aria-label="Duplicate" title="Duplicate">
          <Icon name="duplicate" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={a.blank} disabled={none} aria-label="Insert blank page after" title="Insert blank page after">
          <Icon name="blank" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={() => a.move(-1)} disabled={none} aria-label="Move earlier" title="Move earlier">
          <Icon name="left" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={() => a.move(1)} disabled={none} aria-label="Move later" title="Move later">
          <Icon name="right" size={16} />
        </button>
        <button type="button" className="icon-btn icon-btn-danger" onClick={a.remove} disabled={none} aria-label="Delete" title="Delete">
          <Icon name="trash" size={16} />
        </button>
        <span className="pe-sep" />
        <button type="button" className="icon-btn" onClick={a.undo} disabled={!editor.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
          <Icon name="undo" size={16} />
        </button>
        <span className="pe-grow" />
        {editor.dirty && (
          <button type="button" className="link" onClick={a.reset}>
            Discard
          </button>
        )}
        <button type="button" className="btn btn-primary btn-small" onClick={a.apply} disabled={!editor.dirty || editor.busy} data-testid="pe-apply">
          {editor.busy ? 'Applying…' : 'Apply changes'}
        </button>
      </div>
      {editor.message && (
        <p className={`notice notice-${editor.message.kind}`} role="status">
          {editor.message.text}
        </p>
      )}
      <div
        className="tracks"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault()
            a.undo()
          }
          if (e.key === 'Delete' && !none) a.remove()
        }}
      >
        {files.map((f) => (
          <Track key={f.id} file={f} editor={editor} />
        ))}
      </div>
    </section>
  )
}
