// Workbench "Viewer" mode: one page at a time with a side panel (page
// thumbnails, bookmarks, search), view rotation, and a bottom bar with page
// navigation and zoom. Arrow keys page through while the page has focus.
// Pages render through pdf.js with intent 'print' (renderPageImage), so a
// background tab never stalls.
import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { LoadMoreThumbsButton, useThumbs } from '../components/PagePreview.jsx'
import { renderPageImage } from '../lib/pdfText.js'
import { getBytes } from './fileStore.js'
import { matchBoxes, outline as readOutline, pageSize, pageText, searchDocument } from './viewerData.js'

const PX = 96 / 72 // CSS px per point at 100%
const ZOOM_MIN = 25
const ZOOM_MAX = 400
const RENDER_MAX = 2400 // widest bitmap we ask pdf.js for; beyond that CSS scales
const wide = () => window.matchMedia('(min-width: 1100px)').matches

export function useFileBytes(id) {
  const [state, setState] = useState({ id: null, bytes: null })
  useEffect(() => {
    if (!id) return undefined
    let active = true
    getBytes(id).then((b) => active && setState({ id, bytes: b }), () => {})
    return () => {
      active = false
    }
  }, [id])
  return state.id === id ? state.bytes : null
}

function Thumbs({ file, bytes, page, onPage }) {
  const thumbState = useThumbs(file.id, bytes, file.pageCount)
  const listRef = useRef(null)
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
  }, [page])
  const shown = Math.min(file.pageCount, thumbState.target || Math.min(100, file.pageCount))
  return (
    <div className="vs-thumbs" data-testid="viewer-thumbs">
      <ol ref={listRef}>
        {Array.from({ length: shown }, (_, i) => (
          <li key={i}>
            <button type="button" className="vs-thumb" aria-current={page === i + 1 ? 'page' : undefined} aria-label={`Page ${i + 1}`} onClick={() => onPage(i + 1)}>
              <span className="vs-thumb-paper">{thumbState.thumbs[i] ? <img src={thumbState.thumbs[i]} alt="" /> : <span className="tile-blank mono">{i + 1}</span>}</span>
              <span className="mono vs-thumb-num">{i + 1}</span>
            </button>
          </li>
        ))}
      </ol>
      <LoadMoreThumbsButton fileId={file.id} thumbState={thumbState} />
    </div>
  )
}

function OutlineList({ items, onPage, depth = 0 }) {
  return (
    <ul className="vs-outline-list" role={depth === 0 ? undefined : 'group'}>
      {items.map((it, i) => (
        <li key={i}>
          <button type="button" className="vs-outline-item" disabled={!it.page} onClick={() => it.page && onPage(it.page)} style={{ paddingLeft: `${8 + depth * 14}px` }}>
            <span className="vs-outline-title">{it.title}</span>
            {it.page && <span className="mono vs-outline-page">{it.page}</span>}
          </button>
          {it.items.length > 0 && <OutlineList items={it.items} onPage={onPage} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  )
}

function Outline({ bytes, onPage }) {
  const [state, setState] = useState({ bytes: null, items: null, error: null })
  useEffect(() => {
    if (!bytes) return undefined
    let active = true
    readOutline(bytes).then(
      (items) => active && setState({ bytes, items, error: null }),
      (err) => active && setState({ bytes, items: [], error: err.message }),
    )
    return () => {
      active = false
    }
  }, [bytes])
  const items = state.bytes === bytes ? state.items : null
  return (
    <div className="vs-outline" data-testid="viewer-outline">
      {!items ? (
        <p className="vs-empty">Reading bookmarks...</p>
      ) : items.length === 0 ? (
        <p className="vs-empty">{state.error ? `Could not read bookmarks: ${state.error}` : 'This file has no bookmarks.'}</p>
      ) : (
        <OutlineList items={items} onPage={onPage} />
      )}
    </div>
  )
}

function Search({ query, setQuery, search, page, onPage, inputRef }) {
  const { hits, running } = search
  const total = hits.reduce((n, h) => n + h.count, 0)
  return (
    <div className="vs-search">
      <form
        className="vs-search-form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          if (!hits.length) return
          const next = hits.find((h) => h.page > page) ?? hits[0]
          onPage(next.page)
        }}
      >
        <label className="sr-only" htmlFor="viewer-search">
          Search in this file
        </label>
        <input
          ref={inputRef}
          id="viewer-search"
          className="input input-small"
          type="search"
          placeholder="Search in this file"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="viewer-search-input"
        />
      </form>
      <p className="vs-search-count" role="status" data-testid="viewer-search-count">
        {!query.trim()
          ? 'Type a word, then Enter for the next page with a match.'
          : running
            ? 'Searching...'
            : total
              ? `${total} match${total === 1 ? '' : 'es'} on ${hits.length} page${hits.length === 1 ? '' : 's'}`
              : 'No matches.'}
      </p>
      <ul className="vs-hits">
        {hits.map((h) => (
          <li key={h.page}>
            <button type="button" className="vs-hit" aria-current={h.page === page ? 'true' : undefined} onClick={() => onPage(h.page)} data-testid="viewer-hit">
              <span className="vs-hit-head">
                <span className="vs-hit-page">Page {h.page}</span>{' '}
                <span className="mono">
                  {h.count}
                  <span className="sr-only"> match{h.count === 1 ? '' : 'es'}</span>
                </span>
              </span>
              {h.snippet && <span className="vs-hit-text">{h.snippet}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Viewer({ files, target, onTarget, onReader }) {
  const ready = files.filter((f) => f.status === 'ready')
  const file = ready.find((f) => f.id === target?.id) ?? ready[0]
  const page = file ? Math.min(Math.max(1, target?.id === file.id ? target.page : 1), file.pageCount) : 1
  const bytes = useFileBytes(file?.id)
  const [side, setSide] = useState(() => (wide() ? 'thumbs' : null))
  const [rot, setRot] = useState(0)
  const [zoom, setZoom] = useState({ fit: true, value: 100 })
  const [stageW, setStageW] = useState(0)
  const [size, setSize] = useState(null)
  const [img, setImg] = useState(null) // { key, url }
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState({ hits: [], running: false, done: 0 })
  const [boxes, setBoxes] = useState([])
  const [pageInput, setPageInput] = useState(String(page))
  const stageRef = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => setPageInput(String(page)), [page, file?.id])

  // the stage width drives "fit width"
  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => setStageW(el.clientWidth))
    ro.observe(el)
    setStageW(el.clientWidth)
    return () => ro.disconnect()
  }, [file?.id])

  useEffect(() => {
    if (!bytes) return undefined
    let active = true
    pageSize(bytes, page).then((s) => active && setSize(s), () => {})
    return () => {
      active = false
    }
  }, [bytes, page])

  const turned = rot % 180 !== 0
  const pageW = size ? (turned ? size.height : size.width) : 612
  const pageH = size ? (turned ? size.width : size.height) : 792
  const fitScale = stageW > 0 ? Math.max(0.1, (stageW - 32) / pageW) : 1
  const scale = zoom.fit ? fitScale : (zoom.value / 100) * PX
  const pct = Math.round((scale / PX) * 100)
  const dispW = Math.round(pageW * scale)
  const dispH = Math.round(pageH * scale)
  // bitmap width of the unturned page, in steps of 200 px so zooming does not re-render on every step
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const want = Math.round((size ? size.width : 612) * scale * dpr)
  const renderW = Math.min(RENDER_MAX, Math.max(400, Math.ceil(want / 200) * 200))
  const imgKey = file && size ? `${file.id}:${page}:${renderW}` : null

  useEffect(() => {
    if (!bytes || !imgKey) return undefined
    let active = true
    setError(null)
    const t = setTimeout(() => {
      renderPageImage(bytes, page, renderW).then(
        (url) => active && setImg({ key: imgKey, page, fileId: file.id, url }),
        (err) => active && setError(err.message),
      )
    }, img?.fileId === file.id && img?.page === page ? 180 : 0)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [imgKey, bytes]) // eslint-disable-line react-hooks/exhaustive-deps

  // search the whole file; results stay until the query or the file changes
  useEffect(() => {
    const q = query.trim()
    if (!bytes || !q) {
      setSearch({ hits: [], running: false, done: 0 })
      return undefined
    }
    const ctl = new AbortController()
    const t = setTimeout(() => {
      setSearch({ hits: [], running: true, done: 0 })
      searchDocument(bytes, file.pageCount, q, {
        signal: ctl.signal,
        onPage: (p, hits) => !ctl.signal.aborted && setSearch({ hits: [...hits], running: p < file.pageCount, done: p }),
      }).then(
        (hits) => !ctl.signal.aborted && setSearch({ hits, running: false, done: file.pageCount }),
        () => !ctl.signal.aborted && setSearch((s) => ({ ...s, running: false })),
      )
    }, 250)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [query, bytes]) // eslint-disable-line react-hooks/exhaustive-deps

  // highlight boxes on the page shown
  useEffect(() => {
    const q = query.trim()
    if (!bytes || !q || !search.hits.some((h) => h.page === page)) {
      setBoxes([])
      return undefined
    }
    let active = true
    pageText(bytes, page).then((entry) => active && setBoxes(matchBoxes(entry, q)), () => {})
    return () => {
      active = false
    }
  }, [bytes, page, query, search.hits])

  const hitPages = useMemo(() => new Set(search.hits.map((h) => h.page)), [search.hits])

  if (!file) return <p className="empty-line">Add a PDF to view it here.</p>
  const n = file.pageCount
  const go = (p) => onTarget({ id: file.id, page: Math.min(Math.max(1, p), n) })
  const setPct = (v) => setZoom({ fit: false, value: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v))) })
  const toggleSide = (s) => {
    setSide((cur) => (cur === s ? null : s))
    if (s === 'search') requestAnimationFrame(() => searchRef.current?.focus())
  }
  const shown = img && img.fileId === file.id && img.page === page ? img : null

  return (
    <section className={`viewer ${side ? 'has-side' : ''}`} aria-label="Viewer" data-testid="viewer">
      <div className="viewer-bar" role="toolbar" aria-label="Viewer tools">
        <select
          className="input input-small viewer-file"
          aria-label="File"
          value={file.id}
          onChange={(e) => {
            setQuery('')
            onTarget({ id: e.target.value, page: 1 })
          }}
          data-testid="viewer-file"
        >
          {ready.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.version > 1 ? ` (v${f.version})` : ''}
            </option>
          ))}
        </select>
        <div className="viewer-tools">
          <button type="button" className="icon-btn" aria-pressed={side === 'thumbs'} onClick={() => toggleSide('thumbs')} aria-label="Page thumbnails" title="Page thumbnails" data-testid="viewer-thumbs-btn">
            <Icon name="thumbs" size={17} />
          </button>
          <button type="button" className="icon-btn" aria-pressed={side === 'outline'} onClick={() => toggleSide('outline')} aria-label="Bookmarks" title="Bookmarks" data-testid="viewer-outline-btn">
            <Icon name="bookmark" size={17} />
          </button>
          <button type="button" className="icon-btn" aria-pressed={side === 'search'} onClick={() => toggleSide('search')} aria-label="Search in this file" title="Search in this file" data-testid="viewer-search-btn">
            <Icon name="search" size={17} />
          </button>
          <span className="pe-sep" aria-hidden="true" />
          <button type="button" className="icon-btn" onClick={() => setRot((r) => (r + 270) % 360)} aria-label="Rotate view left" title="Rotate view left" data-testid="viewer-rotate-left">
            <Icon name="rotate" size={17} className="flip-x" />
          </button>
          <button type="button" className="icon-btn" onClick={() => setRot((r) => (r + 90) % 360)} aria-label="Rotate view right" title="Rotate view right (the file is not changed)" data-testid="viewer-rotate-right">
            <Icon name="rotate" size={17} />
          </button>
          {onReader && (
            <button type="button" className="btn btn-quiet btn-small viewer-reader-btn" onClick={() => onReader({ id: file.id, page })} data-testid="viewer-reader-btn">
              <Icon name="reader" size={16} />
              Reader
            </button>
          )}
        </div>
      </div>
      <div className="viewer-body">
        {side && (
          <aside className="viewer-side" aria-label={side === 'thumbs' ? 'Page thumbnails' : side === 'outline' ? 'Bookmarks' : 'Search'}>
            {side === 'thumbs' && bytes && <Thumbs file={file} bytes={bytes} page={page} onPage={go} />}
            {side === 'outline' && <Outline bytes={bytes} onPage={go} />}
            {side === 'search' && <Search query={query} setQuery={setQuery} search={search} page={page} onPage={go} inputRef={searchRef} />}
          </aside>
        )}
        <div
          className="viewer-stage"
          ref={stageRef}
          tabIndex={0}
          role="region"
          aria-label={`Page ${page} of ${n}. Arrow keys change the page.`}
          data-testid="viewer-stage"
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return
            if (e.key === 'ArrowRight' || e.key === 'PageDown') go(page + 1)
            else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(page - 1)
            else if (e.key === 'Home') go(1)
            else if (e.key === 'End') go(n)
            else if (e.key === '+' || e.key === '=') setPct(pct + 10)
            else if (e.key === '-') setPct(pct - 10)
            else return
            e.preventDefault()
          }}
        >
          {error && <p className="field-error">{error}</p>}
          <div className="viewer-sheet" style={{ width: dispW, height: dispH }}>
            <div
              className="viewer-turn"
              style={{
                width: turned ? dispH : dispW,
                height: turned ? dispW : dispH,
                transform: `translate(-50%, -50%) rotate(${rot}deg)`,
              }}
            >
              {shown ? (
                <img src={shown.url} alt={`Page ${page} of ${file.name}`} data-testid="viewer-image" draggable="false" />
              ) : (
                !error && <p className="viewer-loading">Rendering page {page}...</p>
              )}
              {shown &&
                boxes.map((b, i) => (
                  <span
                    key={i}
                    className="viewer-hl"
                    data-testid="viewer-hl"
                    style={{
                      left: `${b.x * 100}%`,
                      top: `${b.y * 100}%`,
                      width: `${b.w * 100}%`,
                      height: `${b.h * 100}%`,
                      transform: b.angle ? `rotate(${b.angle}rad)` : undefined,
                    }}
                  />
                ))}
            </div>
          </div>
        </div>
      </div>
      <div className="viewer-pill" role="toolbar" aria-label="Page and zoom">
        <div className="viewer-nav">
          <button type="button" className="icon-btn" onClick={() => go(1)} disabled={page <= 1} aria-label="First page" data-testid="viewer-first">
            <Icon name="first" size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page" data-testid="viewer-prev">
            <Icon name="left" size={16} />
          </button>
          <form
            className="viewer-page"
            onSubmit={(e) => {
              e.preventDefault()
              go(Number(pageInput) || page)
            }}
          >
            <label className="sr-only" htmlFor="viewer-page-input">
              Page
            </label>
            <input
              id="viewer-page-input"
              className="input input-small mono"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
              onBlur={() => go(Number(pageInput) || page)}
              data-testid="viewer-page-input"
            />
            <span className="mono" data-testid="viewer-page-count">
              / {n}
            </span>
          </form>
          <button type="button" className="icon-btn" onClick={() => go(page + 1)} disabled={page >= n} aria-label="Next page" data-testid="viewer-next">
            <Icon name="right" size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={() => go(n)} disabled={page >= n} aria-label="Last page" data-testid="viewer-last">
            <Icon name="last" size={16} />
          </button>
          {hitPages.has(page) && <span className="viewer-hit-dot" title="This page has matches" aria-hidden="true" />}
        </div>
        <div className="viewer-zoom">
          <button type="button" className="icon-btn" onClick={() => setPct(pct - 10)} disabled={pct <= ZOOM_MIN} aria-label="Zoom out">
            <Icon name="zoomout" size={16} />
          </button>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step="5"
            value={Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pct))}
            onChange={(e) => setPct(Number(e.target.value))}
            aria-label="Zoom"
            aria-valuetext={`${pct}%`}
            data-testid="viewer-zoom"
          />
          <button type="button" className="icon-btn" onClick={() => setPct(pct + 10)} disabled={pct >= ZOOM_MAX} aria-label="Zoom in">
            <Icon name="zoomin" size={16} />
          </button>
          <span className="mono viewer-pct" data-testid="viewer-pct">
            {pct}%
          </span>
          <button type="button" className={`btn btn-quiet btn-small ${zoom.fit ? 'is-on' : ''}`} aria-pressed={zoom.fit} onClick={() => setZoom((z) => ({ ...z, fit: true }))} data-testid="viewer-fit">
            <Icon name="fitwidth" size={15} />
            Fit width
          </button>
        </div>
      </div>
    </section>
  )
}
