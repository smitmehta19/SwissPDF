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
import CommandPalette from './CommandPalette.jsx'
import Reader from './Reader.jsx'
import { POPULAR, scopedRunLabel, suggestNext } from './nextTools.js'
import { metaLine } from './FileGrid.jsx'
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

const MODES = [
  ['files', 'Files', 'files'],
  ['viewer', 'Viewer', 'viewer'],
  ['pages', 'Pages', 'pages'],
]
// Multi-file tools (merge, compare, the converters) open on the Files view.
const opensOnFiles = (t) => !!t && !t.Canvas && !t.workbench && ((t.accepts?.min ?? 0) >= 2 || t.category === 'Convert')
// Options steps in the panel. A tool may set its own order and titles with
// steps: [{ id: 'options', title: 'Automation' }, { id: 'files' }]; Run is always last.
const STEP_TITLES = { files: 'Files', options: 'Options' }
function stepsOf(t) {
  const own = (Array.isArray(t?.steps) ? t.steps : []).filter((st) => STEP_TITLES[st?.id])
  const list = [...own, ...['files', 'options'].filter((id) => !own.some((st) => st.id === id)).map((id) => ({ id }))]
  return list.map((st) => ({ id: st.id, title: st.title || STEP_TITLES[st.id] }))
}
// Tool messages that mean "nothing needed doing", not a failure
const NEUTRAL = /^(No |Nothing |Every page (already|was already))/
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

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

// Home without files: the most used tools as large tiles.
function PopularTiles({ onOpen }) {
  const list = POPULAR.map((id) => TOOLS.find((t) => t.id === id)).filter(Boolean)
  return (
    <section className="popular" aria-labelledby="popular-title" data-testid="popular-tiles">
      <h2 id="popular-title" className="directory-title">
        Popular tools
      </h2>
      <div className="popular-grid">
        {list.map((t) => (
          <button key={t.id} type="button" className="popular-tile" onClick={() => onOpen(t.id)} data-testid={`popular-${t.id}`}>
            <span className="next-icon">
              <Icon name={t.icon} size={20} />
            </span>
            <span className="popular-name">{t.name}</span>
            <span className="popular-desc">{t.description}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

// Home with files and no tool: what to do next, with tools that fit the files.
function HomeHint({ files, onOpen }) {
  const exts = [...new Set(files.map((f) => extOf(f.name)).filter((e) => e && e !== '.pdf'))]
  const pdfs = files.filter((f) => store.isPdfRecord(f)).length
  const byType = exts.flatMap((e) => TOOLS.filter((t) => t.accepts?.types?.includes(e)).map((t) => t.id))
  const ids = [...new Set([...byType, ...(pdfs > 1 ? ['merge', 'compress', 'organize'] : ['compress', 'split', 'protect'])])].slice(0, 3)
  const list = ids.map((id) => TOOLS.find((t) => t.id === id)).filter(Boolean)
  return (
    <div className="home-hint" data-testid="home-hint">
      <p>
        <span className="hint-wide">
          Pick a tool on the left, or press <kbd>{isMac() ? 'Cmd' : 'Ctrl'}+K</kbd>.
        </span>
        <span className="hint-narrow">Open the tool list with the menu button.</span> Suggested:
      </p>
      <div className="chip-row">
        {list.map((t) => (
          <button key={t.id} type="button" className="chip" onClick={() => onOpen(t.id)} data-testid={`hint-${t.id}`}>
            <Icon name={t.icon} size={15} />
            {t.name}
          </button>
        ))}
      </div>
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
  const [palette, setPalette] = useState(false)
  const [reader, setReader] = useState(null) // { id, page } while reading
  const [filesOpen, setFilesOpen] = useState(null) // options step 1 list; null = open for 3 files or fewer
  const searchRef = useRef(null)
  const tabRefs = useRef({})
  const onlyNewRef = useRef(false) // next added files replace the selection
  const mountedAt = useRef(Date.now()) // files from an earlier visit are not selected
  const [status, setStatus] = useState(null) // short confirmation (undo)
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

  // New files join the selection; files that left drop out of it. When the
  // user adds files while a tool is open, results of earlier runs leave the
  // selection, so they do not join the next run unless selected again.
  useEffect(() => {
    const ids = new Set(files.map((f) => f.id))
    const unseen = files.filter((f) => !seenRef.current.has(f.id))
    for (const f of unseen) seenRef.current.add(f.id)
    // files kept from an earlier visit come back unselected: nothing runs on them by surprise
    const fresh = unseen.filter((f) => f.addedAt >= mountedAt.current).map((f) => f.id)
    const onlyNew = onlyNewRef.current && fresh.length > 0
    if (onlyNew) onlyNewRef.current = false
    setSelection((prev) => {
      // results of earlier runs (made from another file) leave the selection;
      // files the user added stay, so adding one more file to Compare works
      const userAdded = (id) => !files.find((f) => f.id === id)?.parentIds?.length
      const next = new Set([...(onlyNew ? [...prev].filter(userAdded) : prev), ...fresh].filter((id) => ids.has(id)))
      return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next
    })
  }, [files])

  // tools with accepts.locked (Unlock) also get files that still need a password
  const takesLocked = v2 && !!tool?.accepts?.locked
  const chosen = files.filter((f) => (f.status === 'ready' || (takesLocked && f.status === 'locked')) && selection.has(f.id))
  const selected = chosen.filter((f) => takesFile(v2 ? tool : null, f))
  // the Pages view only shows files that open
  const editor = usePageEditor(chosen.filter((f) => f.status === 'ready' && store.isPdfRecord(f)))

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
    // only when the Run bar can appear or go: not on every render
  }, [activeToolId, !!result, files.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Ctrl+K / Cmd+K opens the command palette. "/" focuses search. Esc closes
  // the drawer; dialogs, the palette and the reader handle their own Esc.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        if (dialog) return
        e.preventDefault()
        setPalette((p) => !p)
        setDrawer(false)
      } else if (e.key === '/' && !typing(document.activeElement) && !document.querySelector('[data-testid=reader]')) {
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
    const target = TOOLS.find((t) => t.id === id)
    setActiveToolId(id)
    setResult(null)
    // tools with an on-page canvas (sign, redact, ...) open on it; tools that
    // take several files (merge, compare, convert) open on Files
    if (target?.Canvas) {
      setMode('viewer')
      // on the newest selected file, the one the user most likely means
      const newest = files.filter((f) => selection.has(f.id) && f.status === 'ready').sort((a, b) => b.addedAt - a.addedAt)[0]
      if (newest) setViewerTarget({ id: newest.id, page: 1 })
    } else if (opensOnFiles(target)) setMode('files')
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
    // same name and size as a file already here: say so, add it anyway
    const dupes = kept.filter((f) => files.some((x) => x.name === f.name && x.size === f.size))
    if (dupes.length) setNotice(`${dupes.map((f) => f.name).join(', ')} ${dupes.length === 1 ? 'is' : 'are'} already in your files. Added again.`)
    if (!kept.length) return
    if (tool && files.length > 0) onlyNewRef.current = true
    const ids = await store.addFiles(kept, { keepOther })
    // canvas tools (redact, sign...) open on the file just added
    if (tool?.Canvas && ids?.length) setViewerTarget({ id: ids[0], page: 1 })
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
  // a tool that uses no files (Health) has no Files step
  const steps = stepsOf(tool).filter((st) => !(st.id === 'files' && tool?.accepts?.min === 0 && !tool?.accepts?.types))
  const filesShown = filesOpen ?? selected.length <= 3

  const run = async () => {
    if (!summary?.ready || running || startingRef.current) return
    startingRef.current = true
    const t = tool
    const t0 = performance.now()
    // a wipe while this job runs bumps the generation: its outputs are dropped
    const generation = store.getGeneration()
    let handle
    let inputs
    try {
      inputs = await store.filesForRun(selected.map((f) => f.id), { locked: !!t.accepts?.locked })
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
      // run returns outputs, or { outputs, view } when the tool also shows a
      // result view (compare, health)
      const res = await handle.promise
      const outs = Array.isArray(res) ? res : (res?.outputs ?? [])
      const view = Array.isArray(res) ? null : (res?.view ?? null)
      const stats = { ms: null, beforeSize: inputs.reduce((n, f) => n + (f.size ?? 0), 0) }
      if (outs.length === 0 && view) {
        setJob(null)
        setResult({ toolId: t.id, outputs: [], change: { outputIds: [], consumedIds: [] }, view, stats: { ...stats, ms: performance.now() - t0 } })
        return
      }
      const checked = []
      for (const out of outs) {
        if (store.getGeneration() !== generation) break
        // a locked output (Protect with an open password) cannot be opened here;
        // the tool checked it by reopening it with the password
        const { pageCount } = out.type ? { pageCount: null } : out.locked ? { pageCount: out.pageCount ?? null } : await assertValidOutput(out.bytes)
        checked.push({ ...out, pageCount })
      }
      // keepInputs: the inputs stay as they are (PDF to images, to Word...)
      const keep = typeof t.keepInputs === 'function' ? t.keepInputs(options) : !!t.keepInputs
      const consumed = keep ? [] : [...new Set(checked.flatMap((o) => o.parentIds ?? []))]
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
      setSelection(new Set([...change.outputIds, ...(keep ? inputs.map((f) => f.id) : [])]))
      setJob(null)
      // size before: only the inputs the stored outputs were made from (a file
      // that stopped in an Automate batch is not counted)
      const parents = new Set(change.outputIndex.flatMap((i) => checked[i]?.parentIds ?? []))
      const beforeSize = parents.size ? inputs.filter((f) => parents.has(f.id)).reduce((n, f) => n + (f.size ?? 0), 0) : stats.beforeSize
      setResult({ toolId: t.id, outputs, change, view, stats: { ms: performance.now() - t0, beforeSize }, inputIds: inputs.map((f) => f.id) })
    } catch (err) {
      if (err?.cancelled || err?.name === 'AbortError') setJob(null)
      else setJob({ toolId: t.id, error: err?.message ?? String(err) })
    }
  }

  // a short confirmation that clears itself
  const flashTimer = useRef(null)
  const flash = (text) => {
    setStatus(text)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setStatus(null), 6000)
  }

  const undoResult = async () => {
    if (!result) return
    await store.undoChange(result.change)
    // the files the run started with (kept inputs included)
    setSelection(new Set(result.inputIds ?? result.change.consumedIds))
    setResult(null)
    flash(`Undid ${TOOLS.find((t) => t.id === result.toolId)?.name ?? 'the change'}. Your files are back as they were.`)
  }

  // the tool's own next list first, padded from its category (nextTools.js)
  // a locked output (Protect) only goes on in a tool that takes locked files
  const lockedResult = !!result?.outputs?.some((o) => store.getRecord(o.id)?.status === 'locked')
  const nextTools = !result ? [] : lockedResult ? TOOLS.filter((t) => isV2(t) && t.accepts?.locked) : suggestNext(TOOLS.find((t) => t.id === result.toolId), TOOLS)

  const openFile = (id, page = 1) => {
    setViewerTarget({ id, page })
    setResult(null)
    setMode('viewer')
  }

  const pickMode = (m) => {
    setMode(m)
    requestAnimationFrame(() => tabRefs.current[m]?.focus())
  }
  // Tab pattern: arrows, Home and End move between the enabled views.
  const onTabKey = (e) => {
    const enabled = MODES.map(([m]) => m).filter((m) => m === 'files' || readyCount > 0)
    const i = enabled.indexOf(mode)
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: enabled.length - 1 }[e.key]
    if (to === undefined) return
    e.preventDefault()
    pickMode(enabled[(to + enabled.length) % enabled.length])
  }
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
          <div className="modes" role="tablist" aria-label="Workbench view" onKeyDown={onTabKey}>
            {MODES.map(([m, label, icon]) => (
              <button
                key={m}
                ref={(el) => (tabRefs.current[m] = el)}
                id={`wb-tab-${m}`}
                type="button"
                role="tab"
                aria-selected={mode === m}
                aria-controls="wb-panel"
                tabIndex={mode === m ? 0 : -1}
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
      {status && (
        <p className="notice notice-ok" role="status" data-testid="status-flash">
          {status}
        </p>
      )}
      {!tool && files.length > 0 && <HomeHint files={files} onOpen={openTool} />}
      {files.length === 0 ? (
        <>
          <StartArea onAdd={() => pickerRef.current?.click()} tool={v2 ? tool : null} />
          {!tool && <PopularTiles onOpen={openTool} />}
        </>
      ) : (
        <div role="tabpanel" id="wb-panel" aria-labelledby={`wb-tab-${mode}`} className="wb-panel">
          {mode === 'viewer' && v2 && tool.Canvas ? (
            <tool.Canvas files={selected} options={options} setOptions={setOptions} target={viewerTarget} onTarget={setViewerTarget} />
          ) : mode === 'viewer' ? (
            <Viewer files={files.filter(store.isPdfRecord)} target={viewerTarget} onTarget={setViewerTarget} onReader={setReader} />
          ) : mode === 'pages' ? (
            <PageEditor files={selected.filter((f) => f.status === 'ready')} editor={editor} onView={openFile} />
          ) : (
            <FileGrid
              files={files}
              selection={selection}
              onToggle={toggleSelect}
              onSelectAll={(all) => setSelection(all ? new Set(files.filter((f) => f.status === 'ready' && (!v2 || takesFile(tool, f))).map((f) => f.id)) : new Set())}
              onOpen={(id) => openFile(id)}
              onRotate={rotateFile}
              onAdd={() => pickerRef.current?.click()}
              onWipe={() => setDialog({ kind: 'wipe' })}
              scope={v2 ? { name: tool.name, count: selected.length, uses: (f) => (f.status === 'ready' || (takesLocked && f.status === 'locked')) && takesFile(tool, f) } : null}
              onStatus={flash}
              onRestored={(ids) => setSelection((prev) => new Set([...prev, ...ids]))}
              onOpenTool={openTool}
            />
          )}
        </div>
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
            className="icon-btn palette-btn"
            onClick={() => setPalette(true)}
            aria-label={`Search tools, files and settings (${isMac() ? 'Cmd' : 'Ctrl'}+K)`}
            aria-keyshortcuts="Control+K Meta+K"
            aria-haspopup="dialog"
            title={`Search everything (${isMac() ? 'Cmd' : 'Ctrl'}+K)`}
            data-testid="palette-btn"
          >
            <Icon name="command" size={18} />
          </button>
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
          <ol className="steps" data-testid="option-steps">
            {steps.map((step, i) => {
              const n = i + 1
              return step.id === 'files' ? (
                <li key="files" className="step" data-testid="step-files">
                  <h2 className="step-head">
                    <button
                      type="button"
                      className="step-toggle"
                      aria-expanded={filesShown}
                      aria-controls="step-files-list"
                      onClick={() => setFilesOpen(!filesShown)}
                    >
                      <span className="step-num mono" aria-hidden="true">
                        {n}
                      </span>
                      <span className="step-title">{step.title}</span>
                      <span className="step-meta" data-testid="step-files-count">
                        <span className="mono">{selected.length}</span> selected
                      </span>
                      <Icon name="right" size={14} className={`step-chevron ${filesShown ? 'is-open' : ''}`} />
                    </button>
                  </h2>
                  {filesShown && (
                    <div className="step-body" id="step-files-list">
                      {selected.length ? (
                        <ul className="step-files">
                          {selected.map((f) => (
                            <li key={f.id}>
                              <span className="file-name" title={f.name}>
                                {f.name}
                              </span>
                              <span className="mono step-file-meta">
                                {metaLine(f)}
                                {f.version > 1 ? `, v${f.version}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="field-help">No file selected for this tool yet.</p>
                      )}
                      {files.length > 0 && mode !== 'files' && (
                        <button type="button" className="link step-link" onClick={() => setMode('files')}>
                          Change files
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ) : (
                <li key="options" className="step" data-testid="step-options">
                  <h2 className="step-head step-head-static">
                    <span className="step-num mono" aria-hidden="true">
                      {n}
                    </span>
                    <span className="step-title">{step.title}</span>
                  </h2>
                  <div className="options-body">
                    <tool.Options options={options} setOptions={setOptions} files={selected} editor={editor} />
                  </div>
                </li>
              )
            })}
          </ol>
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
            <h2 className="step-head step-head-static step-head-run">
              <span className="step-num mono" aria-hidden="true">
                {steps.length + 1}
              </span>
              <span className="step-title">Run</span>
            </h2>
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
                  NEUTRAL.test(job.error) ? (
                    <p className="notice notice-ok" role="status" data-testid="run-error">
                      Nothing to do: {job.error}
                    </p>
                  ) : (
                    <p className="field-error" role="alert" data-testid="run-error">
                      {tool.name} failed: {job.error}
                    </p>
                  )
                )}
                <p className="live-line" aria-live="polite" data-testid="live-line">
                  {summary.line}
                </p>
                {editor.dirty && !tool.workbench && <p className="field-help">Pages has unsaved edits. Save them first to include them.</p>}
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
                    {scopedRunLabel(summary.runLabel, summary.ready, selected.length)}
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
          <p>Your workspace is kept in this browser&apos;s storage until you remove it. Remove all deletes it. A file you open with its password is decrypted in memory only: after a reload it asks for the password again.</p>
          <p>Word, Excel and PowerPoint to PDF use an office engine that is downloaded once from cdn.zetaoffice.net. It is checked against a fixed fingerprint before it runs, and no document data is sent.</p>
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
      {palette && (
        <CommandPalette
          tools={TOOLS}
          files={files}
          theme={theme}
          onClose={() => setPalette(false)}
          onOpenTool={(id) => {
            setPalette(false)
            setReader(null)
            openTool(id)
          }}
          onOpenFile={(id) => {
            setPalette(false)
            setReader(null)
            openFile(id)
          }}
          onTheme={(t) => {
            setPalette(false)
            setTheme(t)
          }}
          onHome={() => {
            setPalette(false)
            goHome()
          }}
        />
      )}
      {reader && store.getRecord(reader.id)?.status === 'ready' && (
        <Reader
          file={store.getRecord(reader.id)}
          page={reader.page}
          onClose={(page) => {
            setViewerTarget({ id: reader.id, page })
            setReader(null)
          }}
        />
      )}
    </div>
  )
}
