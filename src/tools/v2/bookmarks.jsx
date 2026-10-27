import { useEffect, useState } from 'react'
import { getBytes } from '../../app/fileStore.js'
import { baseName } from '../../components/usePdfFiles.js'
import { PageStage, currentOf } from './g3-canvas.jsx'
import { currentFile, plural, useRead } from './structure-shared.jsx'

// Bookmarks are a flat list in reading order with a level (1 = top); a
// bookmark's subtree is the run of deeper items after it.
let seq = 1
const keyed = (items) => items.map((it) => ({ ...it, key: seq++ }))
const end = (items, i) => {
  let j = i + 1
  while (j < items.length && items[j].level > items[i].level) j++
  return j
}
const prevSibling = (items, i) => {
  for (let k = i - 1; k >= 0; k--) {
    if (items[k].level === items[i].level) return k
    if (items[k].level < items[i].level) return -1
  }
  return -1
}

function moveUp(items, i) {
  const p = prevSibling(items, i)
  if (p < 0) return null
  const e = end(items, i)
  return [...items.slice(0, p), ...items.slice(i, e), ...items.slice(p, i), ...items.slice(e)]
}
function moveDown(items, i) {
  const e = end(items, i)
  if (items[e]?.level !== items[i].level) return null
  const e2 = end(items, e)
  return [...items.slice(0, i), ...items.slice(e, e2), ...items.slice(i, e), ...items.slice(e2)]
}
const shift = (items, i, by) => {
  const e = end(items, i)
  return items.map((it, k) => (k >= i && k < e ? { ...it, level: it.level + by } : it))
}

// The bookmark list of a file: the edited copy, else the one in the file.
function useTree(file, o, setOptions) {
  const { data, error } = useRead('readBookmarks', file?.id)
  useEffect(() => {
    if (!file || !data || o.trees[file.id]) return
    setOptions((x) => (x.trees[file.id] ? x : { ...x, trees: { ...x.trees, [file.id]: keyed(data.items) } }))
  }, [file?.id, data]) // eslint-disable-line react-hooks/exhaustive-deps
  return { items: file ? o.trees[file.id] : null, error }
}

function Canvas({ files, options: o, setOptions, target, onTarget }) {
  const { file, page } = currentOf(files, target)
  const { items } = useTree(file, o, setOptions)
  // the options panel adds bookmarks on the page shown here
  useEffect(() => {
    if (!file) return
    setOptions((x) => (x.at?.id === file.id && x.at.page === page ? x : { ...x, at: { id: file.id, page } }))
  }, [file?.id, page]) // eslint-disable-line react-hooks/exhaustive-deps
  const selected = items?.find((it) => it.key === o.sel)
  return (
    <PageStage
      files={files}
      target={target}
      onTarget={onTarget}
      testId="bm-canvas"
      cursor={selected ? 'crosshair' : 'default'}
      hint={selected ? `Click on the page to point "${selected.title}" here.` : 'Select a bookmark on the right, then click where it should jump to.'}
      onDown={(p, _e, ctx) => {
        if (!selected) return
        setOptions((x) => ({
          ...x,
          dirty: { ...x.dirty, [file.id]: true },
          trees: { ...x.trees, [file.id]: x.trees[file.id].map((it) => (it.key === x.sel ? { ...it, page: ctx.page, y: Math.round(p.y), fit: null, uri: null } : it)) },
        }))
      }}
    >
      {({ page: n, size }) =>
        (items ?? [])
          .filter((it) => it.page === n && it.y != null)
          .map((it) => (
            <span key={it.key} className={`st-mark ${it.key === o.sel ? 'is-on' : ''}`} style={{ top: `${(it.y / size.height) * 100}%` }} data-testid="bm-mark">
              <span>{it.title}</span>
            </span>
          ))
      }
    </PageStage>
  )
}

function Options({ options: o, setOptions, files }) {
  const file = currentFile(files, o.at?.id)
  const { items, error } = useTree(file, o, setOptions)
  const [finding, setFinding] = useState(null)
  const [undo, setUndo] = useState(null)
  if (!file) return <p className="field-help">Select a PDF in Files.</p>
  if (error) return <p className="field-error">{error}</p>
  if (!items) return <p className="field-help">Reading bookmarks…</p>

  const i = items.findIndex((it) => it.key === o.sel)
  const sel = items[i]
  const put = (next, extra = {}) =>
    setOptions((x) => ({ ...x, ...extra, dirty: { ...x.dirty, [file.id]: true }, trees: { ...x.trees, [file.id]: next } }))
  const edit = (key, fields) => put(items.map((it) => (it.key === key ? { ...it, ...fields } : it)))
  const add = () => {
    const level = sel ? sel.level : 1
    const at = sel ? end(items, i) : items.length
    const page = o.at?.id === file.id ? o.at.page : 1
    const item = { key: seq++, title: `Page ${page}`, level, page, y: null, open: true, uri: null }
    put([...items.slice(0, at), item, ...items.slice(at)], { sel: item.key })
  }
  const find = async () => {
    setFinding('Reading the text for headings…')
    try {
      const { headingBookmarks } = await import('../../lib/docOps.js')
      const found = await headingBookmarks(await getBytes(file.id), { levels: o.levels, onPage: (n, t) => setFinding(`Reading page ${n} of ${t}…`) })
      if (!found.length) {
        setFinding('No headings found: the text has no bigger lines than the body text.')
        return
      }
      setUndo(items)
      put(keyed(found), { sel: null })
      setFinding(`${plural(found.length, 'heading')} found. Check the list, then save.`)
    } catch (err) {
      setFinding(err.message)
    }
  }
  const act = (next) => next && put(next)

  return (
    <>
      <div className="field">
        <span className="field-label">
          Bookmarks <span className="mono st-count">{items.length}</span>
        </span>
        {items.length === 0 ? (
          <p className="field-help" data-testid="bm-empty">
            This PDF has no bookmarks yet. Add one, or find them from the headings.
          </p>
        ) : (
          <ul className="st-tree" data-testid="bm-tree" aria-label="Bookmarks">
            {items.map((it) => (
              <li key={it.key} className={`st-row ${it.key === o.sel ? 'is-on' : ''}`} style={{ '--lvl': Math.min(it.level, 6) }} data-testid="bm-row" data-level={it.level}>
                <input
                  className="input"
                  aria-label={`Bookmark title, level ${it.level}`}
                  value={it.title}
                  onFocus={() => o.sel !== it.key && setOptions((x) => ({ ...x, sel: it.key }))}
                  onChange={(e) => edit(it.key, { title: e.target.value })}
                />
                <button type="button" className="st-row-page mono" aria-label={`Select, page ${it.page ?? 'none'}`} onClick={() => setOptions((x) => ({ ...x, sel: x.sel === it.key ? null : it.key }))}>
                  {it.uri ? 'link' : it.page ? `p. ${it.page}` : '-'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="st-tools" role="group" aria-label="Edit the selected bookmark">
        <button type="button" className="btn btn-quiet btn-small" data-testid="bm-add" onClick={add}>
          Add
        </button>
        <button type="button" className="btn btn-quiet btn-small" disabled={!sel || prevSibling(items, i) < 0} onClick={() => act(moveUp(items, i))}>
          Up
        </button>
        <button type="button" className="btn btn-quiet btn-small" disabled={!sel || items[end(items, i)]?.level !== sel?.level} onClick={() => act(moveDown(items, i))}>
          Down
        </button>
        <button type="button" className="btn btn-quiet btn-small" data-testid="bm-nest" disabled={!sel || prevSibling(items, i) < 0} onClick={() => act(shift(items, i, 1))}>
          Nest
        </button>
        <button type="button" className="btn btn-quiet btn-small" disabled={!sel || sel.level < 2} onClick={() => act(shift(items, i, -1))}>
          Unnest
        </button>
        <button type="button" className="btn btn-quiet btn-small" data-testid="bm-delete" disabled={!sel} onClick={() => put([...items.slice(0, i), ...items.slice(end(items, i))], { sel: null })}>
          Delete
        </button>
      </div>
      {sel && (
        <div className="field">
          <label className="field-label" htmlFor="bm-page">
            Jumps to page
          </label>
          <input
            id="bm-page"
            className="input mono"
            type="number"
            min="1"
            max={file.pageCount}
            value={sel.page ?? ''}
            data-testid="bm-page"
            onChange={(e) => edit(sel.key, { page: Math.min(file.pageCount, Math.max(1, Number(e.target.value) || 1)), y: null, fit: null, uri: null })}
          />
          <p className="field-help">Or click on the page in the viewer to pick the exact spot.</p>
        </div>
      )}
      <div className="field">
        <span className="field-label">From headings</span>
        <div className="btn-row">
          <select className="input input-small" aria-label="Heading levels" value={o.levels} onChange={(e) => setOptions((x) => ({ ...x, levels: Number(e.target.value) }))}>
            <option value={1}>1 level</option>
            <option value={2}>2 levels</option>
            <option value={3}>3 levels</option>
          </select>
          <button type="button" className="btn btn-quiet btn-small" data-testid="bm-find" onClick={find}>
            Find headings
          </button>
          {undo && (
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={() => {
                put(undo, { sel: null })
                setUndo(null)
                setFinding(null)
              }}
            >
              Undo
            </button>
          )}
        </div>
        <p className="field-help" role="status" data-testid="bm-find-status">
          {finding ?? 'Replaces the list with the lines set bigger than the body text.'}
        </p>
      </div>
      {items.length > 0 && (
        <div className="btn-row">
          <button type="button" className="link link-danger" onClick={() => put([], { sel: null })}>
            Remove all bookmarks
          </button>
        </div>
      )}
    </>
  )
}

const strip = (items) => items.map(({ key, ...it }) => it)

export default {
  id: 'bookmarks',
  name: 'Bookmarks',
  io: 'PDF → PDF with bookmarks',
  description: 'Edit the table of contents, or build it from headings.',
  category: 'Organize',
  icon: 'bookmark',
  accepts: { min: 1 },
  defaults: { trees: {}, dirty: {}, sel: null, at: null, levels: 2 },
  next: ['split', 'metadata', 'compress'],
  Canvas,
  Options,
  summary(files, o) {
    const edited = files.filter((f) => o.dirty[f.id] && o.trees[f.id])
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Save bookmarks' }
    if (!edited.length) return { ready: false, line: 'Add, edit or find bookmarks first.', runLabel: 'Save bookmarks' }
    const n = edited.reduce((s, f) => s + o.trees[f.id].length, 0)
    return { ready: true, line: `${plural(edited.length, 'PDF')} will get ${plural(n, 'bookmark')}.`, runLabel: `Save bookmarks${edited.length > 1 ? ` in ${edited.length} PDFs` : ''}` }
  },
  async run(files, o, ctx) {
    const edited = files.filter((f) => o.dirty[f.id] && o.trees[f.id])
    const outputs = []
    for (const [k, f] of edited.entries()) {
      ctx.check()
      ctx.progress(k, edited.length, `Writing bookmarks of ${f.name}`)
      const items = strip(o.trees[f.id])
      const bytes = await ctx.call('doc', 'writeBookmarks', f.bytes, items)
      outputs.push({ name: `${baseName(f.name)}-bookmarks.pdf`, bytes, parentIds: [f.id], note: items.length ? `${plural(items.length, 'bookmark')}.` : 'All bookmarks removed.' })
    }
    ctx.progress(edited.length, edited.length, 'Done')
    return outputs
  },
}
