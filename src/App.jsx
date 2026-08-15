import { useEffect, useMemo, useRef, useState } from 'react'
import { TOOLS, CATEGORIES } from './tools/registry.js'
import Icon from './components/Icon.jsx'

export default function App() {
  const [activeToolId, setActiveToolId] = useState(null)
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)
  const activeTool = TOOLS.find((t) => t.id === activeToolId)

  // "/" jumps to search from anywhere on the index.
  useEffect(() => {
    const onKey = (e) => {
      if (activeTool) return
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
  }, [activeTool])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOOLS
    return TOOLS.filter((t) =>
      [t.name, t.description, t.io, t.category].join(' ').toLowerCase().includes(q),
    )
  }, [query])

  const openTool = (id) => {
    setActiveToolId(id)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setActiveToolId(null)}>
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          SwissPDF
        </button>
        <span className="local-chip" title="Every tool runs in this browser">
          <i className="pulse" />
          Local only
        </span>
      </header>

      {activeTool ? (
        <main className="tool-page" key={activeTool.id}>
          <button className="back" onClick={() => setActiveToolId(null)}>
            <Icon name="back" size={16} />
            All tools
          </button>
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
            <p className="hero-meta">
              <span>{TOOLS.length} tools</span>
              <span>works offline</span>
              <span>no account</span>
            </p>
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
        </main>
      )}
    </div>
  )
}
