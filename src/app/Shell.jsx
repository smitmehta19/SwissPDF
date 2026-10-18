// The app shell: top bar, tool panel, workbench (files / viewer / pages),
// options panel with Run, result screen. Tools that follow the tool contract
// (docs/design/tool-contract.md) work on the shared workspace; older tools
// render their own page inside the workbench until they are migrated.
import { useEffect, useMemo, useRef, useState } from 'react'
import { TOOLS, CATEGORIES } from '../tools/registry.js'
import Icon from '../components/Icon.jsx'
import { assertValidOutput } from '../lib/pdfOps.js'
import * as store from './fileStore.js'
import { useWorkspace } from './fileStore.js'
import { callOp, runJob } from './jobs.js'
import { Dialog, ProgressBar } from './controls.jsx'
import FileGrid, { AddFilesInput } from './FileGrid.jsx'
import Viewer from './Viewer.jsx'
import PageEditor, { usePageEditor } from './PageEditor.jsx'
import ResultScreen from './ResultScreen.jsx'
import ToolPanel from './ToolPanel.jsx'
import './shell.css'

const isV2 = (tool) => typeof tool?.run === 'function'
// Non-PDF inputs a tool takes (accepts.types, e.g. ['.jpg', '.png']). Tools
// without types take PDFs only. A file in the workspace is shown to a tool
// only when it matches.
const extOf = (name) => (/\.[^.]+$/.exec(name)?.[0] ?? '').toLowerCase()
const OTHER_TYPES = new Set(TOOLS.flatMap((t) => t.accepts?.types ?? []).filter((e) => e !== '.pdf'))
const takesFile = (tool, f) => (tool?.accepts?.types ? tool.accepts.types.includes(extOf(f.name)) : store.isPdfRecord(f))
const idFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '')
  return TOOLS.some((t) => t.id === id) ? id : null
}

const THEMES = ['system', 'light', 'dark']
const THEME_ICON = { system: 'auto', light: 'sun', dark: 'moon' }
const THEME_LABEL = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' }

function readList(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function writeList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* storage blocked: keep it for this session */
  }
}

const narrow = () => window.matchMedia('(max-width: 1099px)').matches
const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

function StartArea({ onAdd, tool }) {
  const noun = tool?.accepts?.noun
  return (
    <div className="start" data-testid="start-area">
      <button type="button" className="start-drop" onClick={onAdd} data-testid="dropzone">
        <Icon name="files" size={30} />
        <span className="start-title">{noun ? `Add ${noun} to start` : tool ? `Add PDFs to ${tool.name.toLowerCase()}` : 'Add PDFs to start'}</span>
        <span className="start-sub">Drop them anywhere here, or choose files. They are processed in this browser and never uploaded.</span>
        <span className="btn btn-primary">{noun ? 'Choose files' : 'Choose PDF files'}</span>
      </button>
    </div>
  )
}

function Directory({ onOpen }) {
  return (
    <section className="directory" aria-labelledby="dir-title">
      <h2 id="dir-title" className="directory-title">
        Pick a tool
      </h2>
      <div className="directory-cols">
        {CATEGORIES.map((cat) => (
          <div key={cat} className="directory-col">
            <h3>{cat}</h3>
            <ul>
              {TOOLS.filter((t) => t.category === cat).map((t) => (
                <li key={t.id}>
                  <button type="button" className="dir-link" onClick={() => onOpen(t.id)}>
                    <Icon name={t.icon} size={16} />
                    <span>{t.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function LegacyTool({ tool }) {
  const Component = tool.component
  return (
    <div className="legacy">
      <div className="legacy-head">
        <span className="legacy-icon">
          <Icon name={tool.icon} size={22} />
        </span>
        <div>
          <h1 className="legacy-title">{tool.name}</h1>
          <p className="legacy-sub">
            <code className="io">{tool.io}</code> {tool.description}
          </p>
        </div>
      </div>
      <p className="legacy-note">Opens on its own page. Add your file again there.</p>
      <Component />
    </div>
  )
}

export default function Shell() {
  const [activeToolId, setActiveToolId] = useState(() => idFromHash())
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('swiss-theme') || 'system'
    } catch {
      return 'system'
    }
  })
  const [favourites, setFavourites] = useState(() => readList('swiss-favourites'))
  const [recent, setRecent] = useState(() => readList('swiss-recent'))
  const [drawer, setDrawer] = useState(false)
  const [mode, setMode] = useState(() => (TOOLS.find((t) => t.id === idFromHash())?.Canvas ? 'viewer' : 'files'))
  const [viewerTarget, setViewerTarget] = useState(null)
  const [selection, setSelection] = useState(() => new Set())
  const [optionsByTool, setOptionsByTool] = useState({})
  const [job, setJob] = useState(null) // { toolId, progress, cancel } | { toolId, error }
  const [result, setResult] = useState(null) // { toolId, outputs, change }
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState(null)
  const [sheet, setSheet] = useState(false) // phone: options as a bottom sheet
  const searchRef = useRef(null)
  const pickerRef = useRef(null)
  const seenRef = useRef(new Set())
  const startingRef = useRef(false) // Run pressed, job not set up yet
  const footRef = useRef(null)
  const sheetBtnRef = useRef(null)

  const ws = useWorkspace()
  const files = ws.files
  const tool = TOOLS.find((t) => t.id === activeToolId) ?? null
  const v2 = isV2(tool)
  const running = !!job?.cancel

  useEffect(() => {
    store.init()
  }, [])

  // New files join the selection; files that left drop out of it.
  useEffect(() => {
    const ids = new Set(files.map((f) => f.id))
    const fresh = files.filter((f) => !seenRef.current.has(f.id)).map((f) => f.id)
    for (const id of fresh) seenRef.current.add(id)
    setSelection((prev) => {
      const next = new Set([...prev, ...fresh].filter((id) => ids.has(id)))
      return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next
    })
  }, [files])

  const chosen = files.filter((f) => f.status === 'ready' && selection.has(f.id))
  const selected = chosen.filter((f) => takesFile(v2 ? tool : null, f))
  const editor = usePageEditor(chosen.filter(store.isPdfRecord))

  // Tools that work on pages (extract, remove, organize) open the Pages view.
  useEffect(() => {
    if (tool?.workbench) setMode(tool.workbench)
  }, [activeToolId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hash history: opening a tool pushes an entry so Back returns home. Deep
  // links get a synthetic home entry beneath them.
  useEffect(() => {
    const initial = idFromHash()
    if (initial) {
      history.replaceState({}, '', location.pathname + location.search)
      history.pushState({ toolId: initial }, '', '#/' + initial)
    }
    const onPop = () => {
      setActiveToolId(idFromHash())
      setResult(null)
      setDrawer(false)
    }
    window.addEventListener('popstate', onPop)
    window.addEventListener('hashchange', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onPop)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('swiss-theme', theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  useEffect(() => {
    document.title = tool ? `${tool.name} | SwissPDF` : 'SwissPDF: private PDF tools'
    setSheet(false)
  }, [tool])

  // Phone: the Run bar is fixed to the bottom; the page keeps room for it.
  useEffect(() => {
    const el = footRef.current
    const root = document.documentElement
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => root.style.setProperty('--run-bar-h', `${Math.ceil(el.getBoundingClientRect().height)}px`))
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--run-bar-h')
    }
  })

  useEffect(() => {
    if (!sheet) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !dialog) {
        setSheet(false)
        sheetBtnRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    document.getElementById('options-sheet')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, dialog])

  // Leaving with a running job or unapplied page edits asks first.
  useEffect(() => {
    if (!running && !editor.dirty) return undefined
    const onBefore = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBefore)
    return () => window.removeEventListener('beforeunload', onBefore)
  }, [running, editor.dirty])

  // "/" focuses search. Esc closes the drawer; dialogs handle their own Esc.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !typing(document.activeElement)) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape' && drawer && !dialog) {
        setDrawer(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer, dialog])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOOLS
    return TOOLS.filter((t) => [t.name, t.description, t.io, t.category].join(' ').toLowerCase().includes(q))
  }, [query])

  const navigate = (id) => {
    setActiveToolId(id)
    setResult(null)
    // tools with an on-page canvas (sign, redact, ...) open on it
    if (TOOLS.find((t) => t.id === id)?.Canvas) setMode('viewer')
    setDrawer(false)
    setJob((j) => (j?.cancel ? j : null))
    if (id) {
      history.pushState({ toolId: id }, '', '#/' + id)
      setRecent((prev) => {
        const next = [id, ...prev.filter((x) => x !== id)].slice(0, 6)
        writeList('swiss-recent', next)
        return next
      })
    }
    window.scrollTo({ top: 0 })
  }

  const openTool = (id) => {
    if (id === activeToolId && !result) return setDrawer(false)
    const target = TOOLS.find((t) => t.id === id)
    // a legacy tool unmounts the page editor: ask before dropping edits
    if (editor.dirty && !isV2(target)) return setDialog({ kind: 'leave', toolId: id })
    navigate(id)
  }

  const goHome = () => {
    setDrawer(false)
    setResult(null)
    if (idFromHash()) history.back()
    else setActiveToolId(null)
  }

  const toggleFavourite = (id) =>
    setFavourites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      writeList('swiss-favourites', next)
      return next
    })

  const addFiles = async (list) => {
    const all = Array.from(list ?? [])
    const keepOther = (f) => OTHER_TYPES.has(extOf(f.name))
    const kept = all.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf' || keepOther(f))
    if (kept.length < all.length) {
      setNotice(`${all.length - kept.length} file${all.length - kept.length === 1 ? ' is' : 's are'} not a type SwissPDF can open.`)
    } else setNotice(null)
    if (kept.length) await store.addFiles(kept, { keepOther })
  }

  const toggleSelect = (id) =>
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const rotateFile = async (id) => {
    try {
      const bytes = await callOp('rotate', [await store.getBytes(id), 90, null])
      const { pageCount } = await assertValidOutput(bytes)
      const rec = store.getRecord(id)
      if (!rec) return
      const change = await store.addVersions([{ name: rec.name, bytes, pageCount, parentIds: [id] }], { tool: 'rotate', consumedIds: [id] })
      if (change) setSelection((prev) => (prev.has(id) ? new Set([...prev, ...change.outputIds]) : prev))
    } catch (err) {
      setNotice(`Could not rotate: ${err.message}`)
    }
  }

  const options = tool && v2 ? (optionsByTool[tool.id] ?? tool.defaults ?? {}) : {}
  // accepts a value or an updater, like setState (canvas drags update often)
  const setOptions = (o) =>
    setOptionsByTool((prev) => ({ ...prev, [tool.id]: typeof o === 'function' ? o(prev[tool.id] ?? tool.defaults ?? {}) : o }))
  const summary = tool && v2 ? tool.summary(selected, options) : null

  const run = async () => {
    if (!summary?.ready || running || startingRef.current) return
    startingRef.current = true
    const t = tool
    // a wipe while this job runs bumps the generation: its outputs are dropped
    const generation = store.getGeneration()
    let handle
    let inputs
    try {
      inputs = await store.filesForRun(selected.map((f) => f.id))
      handle = runJob(t, inputs, options, {
        onProgress: (progress) => setJob((j) => (j?.cancel ? { ...j, progress } : j)),
      })
      setSheet(false)
      setJob({ toolId: t.id, progress: { done: 0, total: 1, label: 'Starting' }, cancel: handle.cancel })
    } catch (err) {
      setJob({ toolId: t.id, error: err?.message ?? String(err) })
      return
    } finally {
      startingRef.current = false
    }
    try {
      const outs = await handle.promise
      const checked = []
      for (const out of outs) {
        if (store.getGeneration() !== generation) break
        const { pageCount } = out.type ? { pageCount: null } : await assertValidOutput(out.bytes)
        checked.push({ ...out, pageCount })
      }
      // keepInputs: the inputs stay as they are (PDF to images, to Word...)
      const consumed = t.keepInputs ? [] : [...new Set(checked.flatMap((o) => o.parentIds ?? []))]
      const change = await store.addVersions(checked, { tool: t.id, consumedIds: consumed, generation })
      if (!change || store.getGeneration() !== generation) {
        setJob(null)
        return
      }
      const outputs = change.outputIds.map((id, i) => {
        const rec = store.getRecord(id)
        const src = checked[change.outputIndex[i]]
        return { id, name: rec?.name, size: rec?.size, pageCount: rec?.pageCount, before: src.before ?? null, note: src.note ?? null }
      })
      // kept inputs stay selected too, so a PDF tool can continue on them
      setSelection(new Set([...change.outputIds, ...(t.keepInputs ? inputs.map((f) => f.id) : [])]))
      setJob(null)
      setResult({ toolId: t.id, outputs, change })
    } catch (err) {
      if (err?.cancelled || err?.name === 'AbortError') setJob(null)
      else setJob({ toolId: t.id, error: err?.message ?? String(err) })
    }
  }

  const undoResult = async () => {
    if (!result) return
    await store.undoChange(result.change)
    setSelection(new Set(result.change.consumedIds))
    setResult(null)
  }

  // legacy tools cannot take the result (own file picker): no chip for them
  const nextTools = result
    ? (TOOLS.find((t) => t.id === result.toolId)?.next ?? []).map((id) => TOOLS.find((t) => t.id === id)).filter((t) => isV2(t))
    : []
  const showResult = result && result.toolId === activeToolId
  const showOptions = !!tool && v2 && !showResult
  const legacy = !!tool && !v2
  const readyCount = files.filter((f) => f.status === 'ready').length

  const onDrop = (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }

  // Skip links move focus, not just the scroll position.
  const skipTo = (id, before) => (e) => {
    e.preventDefault()
    before?.()
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  const workbench = (
    <>
      {files.length > 0 && (
        <div className="wb-bar">
          <div className="modes" role="tablist" aria-label="Workbench view">
            {[
              ['files', 'Files', 'files'],
              ['viewer', 'Viewer', 'viewer'],
              ['pages', 'Pages', 'pages'],
            ].map(([m, label, icon]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? 'is-on' : ''}
                onClick={() => setMode(m)}
                disabled={m !== 'files' && readyCount === 0}
                data-testid={`mode-${m}`}
              >
                <Icon name={icon} size={16} />
                {label}
                {m === 'pages' && editor.dirty && <span className="dot" aria-label="unsaved edits" />}
              </button>
            ))}
          </div>
          <span className="wb-meta">
            <span className="mono">{files.length}</span> file{files.length === 1 ? '' : 's'}
            {ws.persistent && ', saved on this device'}
          </span>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => pickerRef.current?.click()}>
            <Icon name="plus" size={15} />
            Add
          </button>
        </div>
      )}
      {ws.storageNote && files.length > 0 && <p className="notice notice-warn">{ws.storageNote}</p>}
      {notice && (
        <p className="notice notice-warn" role="status">
          {notice}
        </p>
      )}
      {files.length === 0 ? (
        <StartArea onAdd={() => pickerRef.current?.click()} tool={v2 ? tool : null} />
      ) : mode === 'viewer' && v2 && tool.Canvas ? (
        <tool.Canvas files={selected} options={options} setOptions={setOptions} target={viewerTarget} onTarget={setViewerTarget} />
      ) : mode === 'viewer' ? (
        <Viewer files={files.filter(store.isPdfRecord)} target={viewerTarget} onTarget={setViewerTarget} />
      ) : mode === 'pages' ? (
        <PageEditor files={selected} editor={editor} />
      ) : (
        <FileGrid
          files={files}
          selection={selection}
          onToggle={toggleSelect}
          onSelectAll={(all) => setSelection(all ? new Set(files.filter((f) => f.status === 'ready').map((f) => f.id)) : new Set())}
          onOpen={(id) => {
            setViewerTarget({ id, page: 1 })
            setMode('viewer')
          }}
          onRotate={rotateFile}
          onAdd={() => pickerRef.current?.click()}
          onWipe={() => setDialog({ kind: 'wipe' })}
        />
      )}
    </>
  )

  return (
    <div className={`shell ${showOptions ? 'has-options' : ''} ${drawer ? 'drawer-open' : ''} ${sheet ? 'sheet-open' : ''}`}>
      <nav className="skip-links" aria-label="Skip links">
        <a href="#workbench" className="skip-link" onClick={skipTo('workbench')}>
          Skip to files
        </a>
        {showOptions && (
          <a href="#options-sheet" className="skip-link" onClick={skipTo('options-sheet', () => setSheet(true))}>
            Skip to options
          </a>
        )}
      </nav>
      <header className="bar">
        <button type="button" className="icon-btn bar-menu" onClick={() => setDrawer((d) => !d)} aria-label="Tools" aria-expanded={drawer}>
          <Icon name="menu" size={20} />
        </button>
        <button type="button" className="brand" onClick={goHome}>
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          SwissPDF
        </button>
        <div className="bar-search">
          <Icon name="search" size={17} />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Search tools"
            aria-label="Search tools"
            data-testid="tool-search"
            onFocus={() => narrow() && setDrawer(true)}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches.length > 0) {
                openTool(matches[0].id)
                setQuery('')
                e.currentTarget.blur()
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                setQuery('')
                e.currentTarget.blur()
              }
            }}
          />
          <kbd>/</kbd>
        </div>
        <div className="bar-right">
          <button
            type="button"
            className="local-chip"
            onClick={() => setDialog({ kind: 'privacy' })}
            aria-label="Local only: files stay on this device"
            data-testid="privacy-chip"
          >
            <i className="pulse" aria-hidden="true" />
            <Icon name="shield" size={16} className="local-chip-icon" />
            <span className="local-chip-text" aria-hidden="true">
              Local only
            </span>
          </button>
          <button type="button" className="icon-btn" onClick={() => setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length])} title={THEME_LABEL[theme]} aria-label={THEME_LABEL[theme]}>
            <Icon name={THEME_ICON[theme]} size={18} />
          </button>
        </div>
      </header>

      <div className="scrim drawer-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />
      <aside className="side" aria-label="Tool list">
        <ToolPanel
          tools={TOOLS}
          matches={matches}
          query={query}
          currentId={activeToolId}
          favourites={favourites}
          recent={recent}
          onOpen={(id) => {
            openTool(id)
            setQuery('')
          }}
          onFavourite={toggleFavourite}
          onHome={goHome}
          onSuggest={setQuery}
        />
      </aside>

      <main className="main" id="workbench" tabIndex={-1} onDragOver={(e) => e.dataTransfer?.types?.includes('Files') && e.preventDefault()} onDrop={onDrop} key={legacy ? tool.id : 'workbench'}>
        {!legacy && <AddFilesInput inputRef={pickerRef} onFiles={addFiles} accept={(v2 ? (tool.accepts?.types ?? ['.pdf']) : ['.pdf', ...OTHER_TYPES]).join(',')} />}
        {legacy ? (
          <LegacyTool tool={tool} />
        ) : showResult ? (
          <ResultScreen
            tool={tool}
            result={result}
            nextTools={nextTools}
            onOpenTool={openTool}
            onBack={() => {
              setResult(null)
              setMode('files')
            }}
            onUndo={undoResult}
            onStartOver={() => setDialog({ kind: 'wipe' })}
          />
        ) : (
          <>
            {!tool && files.length > 0 && <h1 className="sr-only">Workspace</h1>}
            {workbench}
            {!tool && <Directory onOpen={openTool} />}
          </>
        )}
      </main>

      {showOptions && (
        <aside className="options" aria-label={`${tool.name} options`} data-testid="options-panel">
          <div className="scrim sheet-scrim" onClick={() => setSheet(false)} aria-hidden="true" />
          <div className="options-sheet" id="options-sheet" tabIndex={-1} aria-label={`${tool.name} options`} role="region">
          <div className="options-head">
            <span className="options-icon">
              <Icon name={tool.icon} size={20} />
            </span>
            <div>
              <h1 className="options-title">{tool.name}</h1>
              <p className="options-sub">
                <code className="io">{tool.io}</code>
              </p>
            </div>
          </div>
          <p className="options-desc">{tool.description}</p>
          <div className="options-body">
            <tool.Options options={options} setOptions={setOptions} files={selected} editor={editor} />
          </div>
          <button
            type="button"
            className="btn btn-quiet btn-block sheet-done"
            onClick={() => {
              setSheet(false)
              sheetBtnRef.current?.focus()
            }}
          >
            Done
          </button>
          </div>
          <div className="options-foot" ref={footRef} data-testid="run-bar">
            {job?.cancel && job.toolId === tool.id ? (
              <>
                <ProgressBar {...job.progress} />
                <button type="button" className="btn btn-quiet btn-block" onClick={job.cancel} data-testid="cancel-btn">
                  Cancel
                </button>
              </>
            ) : (
              <>
                {job?.error && job.toolId === tool.id && (
                  <p className="field-error" role="alert" data-testid="run-error">
                    {tool.name} failed: {job.error}
                  </p>
                )}
                <p className="live-line" aria-live="polite" data-testid="live-line">
                  {summary.line}
                </p>
                {editor.dirty && !tool.workbench && <p className="field-help">Pages has unapplied edits. Apply them first to include them.</p>}
                <div className="run-row">
                  <button
                    type="button"
                    ref={sheetBtnRef}
                    className="btn btn-quiet sheet-btn"
                    aria-expanded={sheet}
                    aria-controls="options-sheet"
                    onClick={() => setSheet((v) => !v)}
                    data-testid="options-btn"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                      <path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4" />
                    </svg>
                    Options
                  </button>
                  <button type="button" className="btn btn-primary btn-block btn-large" onClick={run} disabled={!summary.ready || running} data-testid="run-btn">
                    {summary.runLabel}
                  </button>
                </div>
                <p className="run-local">Runs on this device. Nothing is uploaded.</p>
              </>
            )}
          </div>
        </aside>
      )}

      {dialog?.kind === 'wipe' && (
        <Dialog
          title="Remove all files?"
          onClose={() => setDialog(null)}
          actions={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setDialog(null)}>
                Keep files
              </button>
              <button
                type="button"
                className="btn btn-danger"
                data-testid="confirm-ok"
                onClick={async () => {
                  setDialog(null)
                  setResult(null)
                  job?.cancel?.()
                  setJob(null)
                  editor.actions.reset()
                  await store.wipeAll()
                }}
              >
                Remove all
              </button>
            </>
          }
        >
          <p>
            Every file and every earlier version is deleted from this browser. This cannot be undone.
            {running && ' The tool that is running now is stopped.'}
          </p>
        </Dialog>
      )}
      {dialog?.kind === 'privacy' && (
        <Dialog
          title="Your files stay on this device"
          onClose={() => setDialog(null)}
          testId="privacy-dialog"
          actions={
            <button type="button" className="btn btn-primary" onClick={() => setDialog(null)}>
              Got it
            </button>
          }
        >
          <p>Every tool runs in this browser. Files are read, changed and saved here and are never uploaded to a server.</p>
          <p>Your workspace is kept in this browser&apos;s storage until you remove it. Remove all deletes it.</p>
        </Dialog>
      )}
      {dialog?.kind === 'leave' && (
        <Dialog
          title="Discard page edits?"
          onClose={() => setDialog(null)}
          actions={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setDialog(null)}>
                Keep editing
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  const id = dialog.toolId
                  setDialog(null)
                  editor.actions.reset()
                  navigate(id)
                }}
              >
                Discard edits
              </button>
            </>
          }
        >
          <p>Pages has edits you have not applied. They are lost if you open this tool.</p>
        </Dialog>
      )}
    </div>
  )
}
