// Ctrl+K / Cmd+K command palette: one search over tools, workspace files and
// settings, with filter chips. Arrow keys move, Enter opens, Esc closes.
// Opening a file shows it in the Viewer; opening a tool opens it.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { isPdfRecord } from './fileStore.js'
import { metaLine } from './FileGrid.jsx'
import { matchesAll, searchText } from './toolSearch.js'

const FILTERS = [
  ['all', 'All'],
  ['files', 'Files'],
  ['tools', 'Tools'],
  ['settings', 'Settings'],
]
const THEME_NAMES = { system: 'Theme: match the system', light: 'Theme: light', dark: 'Theme: dark' }
const PER_GROUP = 8 // "All" with an empty query shows a short list per group

// 3 = name starts with the query, 2 = a word in the name does, 1 = found
// anywhere in the extra text, 0 = no match.
function score(q, name, extra = '') {
  if (!q) return 1
  const n = name.toLowerCase()
  if (n.startsWith(q)) return 3
  if (n.split(/[\s_.-]+/).some((w) => w.startsWith(q)) || n.includes(q)) return 2
  return matchesAll(extra.toLowerCase(), q) ? 1 : 0
}

export default function CommandPalette({ tools, files, theme, onClose, onOpenTool, onOpenFile, onTheme, onHome }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const uid = useId()

  // focus goes back to whatever opened the palette
  useEffect(() => {
    const opener = document.activeElement
    inputRef.current?.focus()
    return () => opener?.focus?.()
  }, [])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rank = (list) =>
      list
        .map((item) => ({ item, s: score(q, item.label, item.extra) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.item)
    const cap = (list) => (filter === 'all' && !q ? list.slice(0, PER_GROUP) : list)
    const out = []
    if (filter === 'all' || filter === 'files') {
      const list = files
        .filter((f) => f.status === 'ready' && isPdfRecord(f))
        .map((f) => ({
          key: `file-${f.id}`,
          kind: 'file',
          label: f.name,
          hint: `${metaLine(f)}${f.version > 1 ? `, v${f.version}` : ''}`,
          icon: 'files',
          run: () => onOpenFile(f.id),
        }))
      out.push({ name: 'Files', items: cap(rank(list)), empty: files.length ? 'No file matches.' : 'No files in the workspace yet.' })
    }
    if (filter === 'all' || filter === 'tools') {
      const list = tools.map((t) => ({
        key: `tool-${t.id}`,
        kind: 'tool',
        label: t.name,
        extra: searchText(t),
        hint: t.category,
        icon: t.icon,
        run: () => onOpenTool(t.id),
      }))
      out.push({ name: 'Tools', items: cap(rank(list)), empty: 'No tool matches.' })
    }
    if (filter === 'all' || filter === 'settings') {
      const list = [
        ...['system', 'light', 'dark'].map((t) => ({
          key: `theme-${t}`,
          kind: 'setting',
          label: THEME_NAMES[t],
          extra: 'appearance colour mode dark light',
          hint: theme === t ? 'Current' : '',
          icon: t === 'system' ? 'auto' : t === 'light' ? 'sun' : 'moon',
          run: () => onTheme(t),
        })),
        { key: 'home', kind: 'setting', label: 'Go to workspace', extra: 'home start', hint: '', icon: 'home', run: onHome },
      ]
      out.push({ name: 'Settings', items: cap(rank(list)), empty: 'No setting matches.' })
    }
    // a group with nothing in it is only worth showing when it is the filter
    return out.filter((g) => g.items.length || filter !== 'all')
  }, [query, filter, files, tools, theme]) // eslint-disable-line react-hooks/exhaustive-deps

  const flat = groups.flatMap((g) => g.items)
  const current = Math.min(active, Math.max(0, flat.length - 1))
  const optionId = (i) => `${uid}-opt-${i}`

  useEffect(() => setActive(0), [query, filter])
  useEffect(() => {
    listRef.current?.querySelector(`[id="${optionId(current)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [current]) // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!flat.length) return
      setActive((current + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length)
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault()
      setActive(e.key === 'PageDown' ? flat.length - 1 : 0)
    } else if (e.key === 'Enter' && e.target === inputRef.current) {
      e.preventDefault()
      flat[current]?.run()
    } else if (e.key === 'Tab') {
      // focus stays in the palette
      const list = [...boxRef.current.querySelectorAll('input, button')]
      const i = list.indexOf(document.activeElement)
      const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i + 1) % list.length
      e.preventDefault()
      list[next]?.focus()
    }
  }

  let index = -1
  return (
    <div className="palette-layer">
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={boxRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search tools, files and settings"
        onKeyDown={onKeyDown}
        data-testid="palette"
      >
        <div className="palette-search">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${uid}-list`}
            aria-autocomplete="list"
            aria-activedescendant={flat.length ? optionId(current) : undefined}
            aria-label="Search tools, files and settings"
            placeholder="Search tools, files and settings"
            autoComplete="off"
            spellCheck="false"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="palette-input"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-chips" role="group" aria-label="Show">
          {FILTERS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`palette-chip ${filter === k ? 'is-on' : ''}`}
              aria-pressed={filter === k}
              onClick={() => {
                setFilter(k)
                inputRef.current?.focus()
              }}
              data-testid={`palette-chip-${k}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="palette-list" id={`${uid}-list`} role="listbox" aria-label="Results" ref={listRef} data-testid="palette-list">
          {groups.map((g) => (
            <div key={g.name} role="group" aria-labelledby={`${uid}-${g.name}`} className="palette-group">
              <div className="palette-group-title" id={`${uid}-${g.name}`} role="presentation">
                {g.name}
              </div>
              {g.items.length === 0 && <p className="palette-empty">{g.empty}</p>}
              {g.items.map((item) => {
                index++
                const i = index
                return (
                  <div
                    key={item.key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === current}
                    className={`palette-item ${i === current ? 'is-active' : ''}`}
                    data-kind={item.kind}
                    data-testid="palette-item"
                    onMouseMove={() => i !== current && setActive(i)}
                    onClick={() => item.run()}
                  >
                    <Icon name={item.icon} size={17} />
                    <span className="palette-label">{item.label}</span>
                    {item.hint && <span className={`palette-hint ${item.kind === 'file' ? 'mono' : ''}`}>{item.hint}</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <p className="palette-foot" aria-hidden="true">
          <span>
            <kbd>Up</kbd> <kbd>Down</kbd> move
          </span>
          <span>
            <kbd>Enter</kbd> open
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </p>
      </div>
    </div>
  )
}
