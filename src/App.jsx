import { useEffect, useMemo, useRef, useState } from 'react'
import { TOOLS, CATEGORIES } from './tools/registry.js'
import Icon from './components/Icon.jsx'

const idFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '')
  return TOOLS.some((t) => t.id === id) ? id : null
}

const THEMES = ['system', 'light', 'dark']
const THEME_ICON = { system: 'auto', light: 'sun', dark: 'moon' }
const THEME_LABEL = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }

export default function App() {
  const [activeToolId, setActiveToolId] = useState(() => idFromHash())
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('swiss-theme') || 'system')
  const searchRef = useRef(null)
  const activeTool = TOOLS.find((t) => t.id === activeToolId)

  // Hash-based history: opening a tool pushes an entry so the browser Back
  // button returns to the index instead of leaving the site. Deep links get a
  // synthetic home entry beneath them so Back still lands on home.
  useEffect(() => {
    const initial = idFromHash()
    if (initial) {
      history.replaceState({}, '', location.pathname + location.search)
      history.pushState({ toolId: initial }, '', '#/' + initial)
    }
    const onPop = () => setActiveToolId(idFromHash())
    window.addEventListener('popstate', onPop)
    window.addEventListener('hashchange', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onPop)
    }
  }, [])

  // Apply the theme choice: data-theme wins over the OS preference in CSS.
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    localStorage.setItem('swiss-theme', theme)
  }, [theme])

  const openTool = (id) => {
    setActiveToolId(id)
    history.pushState({ toolId: id }, '', '#/' + id)
    window.scrollTo({ top: 0 })
  }

  const goHome = () => {
    if (idFromHash()) history.back() // pops the tool entry → index
    else setActiveToolId(null)
  }

  // "/" focuses search; Escape clears; on a tool page Escape/Backspace goes home.
  useEffect(() => {
    const onKey = (e) => {
      if (activeTool) {
        if (e.key === 'Escape') goHome()
        return
      }
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('')
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTool]) // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOOLS
    return TOOLS.filter((t) =>
      [t.name, t.description, t.io, t.category].join(' ').toLowerCase().includes(q),
    )
  }, [query])

  const cycleTheme = () => setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length])

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={goHome}>
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          SwissPDF
        </button>
        <div className="topbar-right">
          <span className="local-chip" title="Every tool runs in this browser">
            <i className="pulse" />
            Local only
          </span>
          <button className="theme-btn" onClick={cycleTheme} title={THEME_LABEL[theme]} aria-label={THEME_LABEL[theme]}>
            <Icon name={THEME_ICON[theme]} size={17} />
          </button>
        </div>
      </header>

      {activeTool ? (
        <main className="tool-page" key={activeTool.id}>
          <nav className="crumbs">
            <button className="crumb" onClick={goHome}>
              <Icon name="home" size={14} />
              All tools
            </button>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">{activeTool.category}</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-active">{activeTool.name}</span>
          </nav>
          <div className="tool-head">
            <span className="tool-head-icon">
              <Icon name={activeTool.icon} size={26} />
            </span>
            <div>
              <h1>{activeTool.name}</h1>
              <p className="tool-sub">
                <code className="io">{activeTool.io}</code>
                <span>{activeTool.description}</span>
              </p>
            </div>
          </div>
          <activeTool.component />
        </main>
      ) : (
        <main className="home">
          <section className="hero">
            <span className="hero-eyebrow">{TOOLS.length} tools · works offline · no account</span>
            <h1>
              Every PDF tool.
              <br />
              <em>Nothing leaves your device.</em>
            </h1>
            <div className="search">
              <Icon name="search" size={18} />
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder="Search tools"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && matches.length > 0) openTool(matches[0].id)
                }}
                aria-label="Search tools"
              />
              <kbd>/</kbd>
            </div>
          </section>

          {query.trim() && matches.length === 0 && (
            <p className="empty">
              No tool matches “{query.trim()}”. Try <button onClick={() => setQuery('split')}>split</button>,{' '}
              <button onClick={() => setQuery('sign')}>sign</button> or{' '}
              <button onClick={() => setQuery('compress')}>compress</button>.
            </p>
          )}

          {CATEGORIES.map((cat) => {
            const tools = matches.filter((t) => t.category === cat)
            if (tools.length === 0) return null
            return (
              <section className="group" key={cat}>
                <h2>
                  {cat}
                  <span className="rule" />
                  <span className="count">{tools.length}</span>
                </h2>
                <div className="grid">
                  {tools.map((tool, i) => (
                    <button
                      key={tool.id}
                      className="card"
                      style={{ '--i': i }}
                      onClick={() => openTool(tool.id)}
                    >
                      <span className="card-rail" />
                      <span className="card-icon">
                        <Icon name={tool.icon} />
                      </span>
                      <span className="card-name">{tool.name}</span>
                      <span className="card-desc">{tool.description}</span>
                      <code className="io">{tool.io}</code>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}

          <footer className="foot">
            <span>SwissPDF</span>
            <span>Runs entirely in your browser — files never uploaded.</span>
          </footer>
        </main>
      )}
    </div>
  )
}
