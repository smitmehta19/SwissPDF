// Left tool panel: favourites, recently used, popular, then every category.
// The top bar search filters it (one search for the whole app). Categories
// start folded; the ones the user opens are remembered, the current tool's
// category always shows.
import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { CATEGORIES } from '../tools/registry.js'
import { POPULAR } from './nextTools.js'

// Tools without run() still render their own page with their own picker.
export const isLegacy = (tool) => typeof tool?.run !== 'function'

const OPEN_KEY = 'swiss-open-groups'
function readOpen() {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function ToolRow({ tool, current, favourite, onOpen, onFavourite }) {
  const legacy = isLegacy(tool)
  return (
    <li className={`tool-row ${current ? 'is-current' : ''}`}>
      <button
        type="button"
        className="tool-row-main"
        onClick={() => onOpen(tool.id)}
        aria-current={current ? 'page' : undefined}
        aria-description={`${tool.io}${legacy ? '. Opens on its own page' : ''}`}
        title={`${tool.name}: ${tool.io}`}
        data-testid={`tool-${tool.id}`}
      >
        <Icon name={tool.icon} size={18} />
        <span className="tool-row-name">{tool.name}</span>
        {legacy ? <span className="tool-badge">Own page</span> : <span className="tool-row-io mono" aria-hidden="true">{tool.io}</span>}
      </button>
      <button
        type="button"
        className={`tool-star ${favourite ? 'is-on' : ''}`}
        aria-pressed={favourite}
        aria-label={favourite ? `Remove ${tool.name} from favourites` : `Add ${tool.name} to favourites`}
        title={favourite ? 'Remove from favourites' : 'Add to favourites'}
        onClick={() => onFavourite(tool.id)}
      >
        <Icon name="star" size={15} filled={favourite} />
      </button>
    </li>
  )
}

export default function ToolPanel({ tools, matches, query, currentId, favourites, recent, onOpen, onFavourite, onHome, onSuggest }) {
  const [opened, setOpened] = useState(readOpen)
  const byId = new Map(tools.map((t) => [t.id, t]))
  const row = (t) => (
    <ToolRow
      key={t.id}
      tool={t}
      current={t.id === currentId}
      favourite={favourites.includes(t.id)}
      onOpen={onOpen}
      onFavourite={onFavourite}
    />
  )
  const saveOpened = (next) => {
    setOpened(next)
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next))
    } catch {
      /* storage blocked: keep it for this session */
    }
  }
  // updater form: several quick toggles before a render must all count
  const toggleFold = (cat) =>
    setOpened((prev) => {
      const next = prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next))
      } catch {
        /* storage blocked: keep it for this session */
      }
      return next
    })
  const searching = query.trim().length > 0
  const favTools = favourites.map((id) => byId.get(id)).filter(Boolean)
  const recentTools = recent.map((id) => byId.get(id)).filter((t) => t && !favourites.includes(t.id)).slice(0, 4)
  const currentCat = byId.get(currentId)?.category
  const popular = POPULAR.map((id) => byId.get(id)).filter(Boolean)
  // opening a tool unfolds its category
  useEffect(() => {
    if (currentCat && !opened.includes(currentCat)) saveOpened([...opened, currentCat])
  }, [currentCat]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <nav className="tool-panel" aria-label="Tools" data-testid="tool-panel">
      <button type="button" className={`tool-home ${currentId ? '' : 'is-current'}`} onClick={onHome} aria-current={currentId ? undefined : 'page'}>
        <Icon name="home" size={17} />
        Workspace
      </button>
      {searching ? (
        <section className="tool-section">
          <h2 className="tool-section-title">
            {matches.length} match{matches.length === 1 ? '' : 'es'}
          </h2>
          {matches.length ? (
            <ul className="tool-list">{matches.map(row)}</ul>
          ) : (
            <p className="tool-empty">
              No tool matches “{query.trim()}”. Try{' '}
              <button type="button" className="link" onClick={() => onSuggest('split')}>
                split
              </button>
              ,{' '}
              <button type="button" className="link" onClick={() => onSuggest('sign')}>
                sign
              </button>{' '}
              or{' '}
              <button type="button" className="link" onClick={() => onSuggest('compress')}>
                compress
              </button>
              .
            </p>
          )}
        </section>
      ) : (
        <>
          {favTools.length > 0 && (
            <section className="tool-section">
              <h2 className="tool-section-title">Favourites</h2>
              <ul className="tool-list">{favTools.map(row)}</ul>
            </section>
          )}
          {recentTools.length > 0 && (
            <section className="tool-section">
              <h2 className="tool-section-title">Recent</h2>
              <ul className="tool-list">{recentTools.map(row)}</ul>
            </section>
          )}
          <section className="tool-section">
            <h2 className="tool-section-title">Popular</h2>
            <ul className="tool-list" data-testid="tools-popular">
              {popular.map(row)}
            </ul>
          </section>
          {CATEGORIES.map((cat) => {
            const list = tools.filter((t) => t.category === cat)
            if (!list.length) return null
            const open = opened.includes(cat)
            const listId = `tools-${cat.toLowerCase()}`
            return (
              <section className="tool-section" key={cat}>
                <h2 className="tool-section-title">
                  <button
                    type="button"
                    className="tool-fold"
                    aria-expanded={open}
                    aria-controls={listId}
                    onClick={() => toggleFold(cat)}
                    data-testid={`fold-${cat.toLowerCase()}`}
                  >
                    <Icon name="right" size={13} className={open ? 'fold-open' : ''} />
                    {cat}
                    <span className="tool-fold-count mono">{list.length}</span>
                  </button>
                </h2>
                {open && (
                  <ul className="tool-list" id={listId}>
                    {list.map(row)}
                  </ul>
                )}
              </section>
            )
          })}
        </>
      )}
    </nav>
  )
}
