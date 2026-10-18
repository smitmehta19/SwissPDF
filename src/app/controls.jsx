// Shared option controls for tool Options panels and shell dialogs.
import { useEffect, useId, useRef } from 'react'
import Icon from '../components/Icon.jsx'

// Captioned option cards, one choice. options: [{ value, title, caption }]
export function OptionCards({ label, value, onChange, options, columns = 1, testId }) {
  const refs = useRef([])
  const idx = Math.max(0, options.findIndex((o) => o.value === value))
  const move = (e) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
    if (!step) return
    e.preventDefault()
    const next = (idx + step + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div
      className="opt-cards"
      role="radiogroup"
      aria-label={label}
      style={{ '--cols': columns }}
      data-testid={testId}
      onKeyDown={move}
    >
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={`opt-card ${on ? 'is-on' : ''}`}
            onClick={() => onChange(o.value)}
            data-value={o.value}
          >
            <span className="opt-card-title">{o.title}</span>
            {o.caption && <span className="opt-card-caption">{o.caption}</span>}
            <span className="opt-card-check" aria-hidden="true">
              <Icon name="check" size={14} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Small segmented choice (rotation angles, tabs inside a panel).
export function Segmented({ label, value, onChange, options, testId }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.title}
        </button>
      ))}
    </div>
  )
}

const CELLS = [
  ['top-left', 'Top left'],
  ['top-center', 'Top centre'],
  ['top-right', 'Top right'],
  ['middle-left', 'Middle left'],
  ['middle-center', 'Centre'],
  ['middle-right', 'Middle right'],
  ['bottom-left', 'Bottom left'],
  ['bottom-center', 'Bottom centre'],
  ['bottom-right', 'Bottom right'],
]

// 3x3 position picker. Arrow keys move within the grid.
export function PositionGrid({ label = 'Position', value, onChange, disabled = false }) {
  const refs = useRef([])
  const idx = Math.max(0, CELLS.findIndex(([v]) => v === value))
  const move = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key]
    if (step === undefined) return
    e.preventDefault()
    const next = idx + step
    if (next < 0 || next > 8) return
    onChange(CELLS[next][0])
    refs.current[next]?.focus()
  }
  return (
    <div className={`pos-grid ${disabled ? 'is-disabled' : ''}`} role="radiogroup" aria-label={label} onKeyDown={move}>
      {CELLS.map(([v, name], i) => (
        <button
          key={v}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          aria-checked={v === value}
          aria-label={name}
          title={name}
          tabIndex={v === value ? 0 : -1}
          disabled={disabled}
          className={v === value ? 'is-on' : ''}
          onClick={() => onChange(v)}
        >
          <span />
        </button>
      ))}
    </div>
  )
}

// Label + control + optional help line, all wired for screen readers.
export function Field({ label, help, children, inline = false }) {
  const id = useId()
  return (
    <div className={`field ${inline ? 'field-inline' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {help && <p className="field-help">{help}</p>}
    </div>
  )
}

export function ProgressBar({ done, total, label }) {
  const pct = total > 0 ? Math.min(1, done / total) : 0
  return (
    <div className="progress" data-testid="job-progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total || 1}
        aria-valuenow={done}
        aria-label="Progress"
      >
        <span className="progress-fill" style={{ transform: `scaleX(${pct})` }} />
      </div>
      <p className="progress-label">
        <span className="mono">
          {done} / {total}
        </span>{' '}
        {label}
      </p>
    </div>
  )
}

// Modal dialog: Esc and the backdrop close it, focus stays inside and goes
// back to the opener when it closes.
export function Dialog({ title, children, actions, onClose, testId = 'dialog' }) {
  const boxRef = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const opener = document.activeElement
    const box = boxRef.current
    const focusables = () => [...box.querySelectorAll('button, [href], input, select, textarea')].filter((el) => !el.disabled)
    ;(focusables()[0] ?? box).focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Tab') {
        const list = focusables()
        if (list.length === 0) return
        const first = list[0]
        const last = list[list.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    box.addEventListener('keydown', onKey)
    return () => {
      box.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="dialog-layer">
      <div className="scrim" onClick={onClose} />
      <div ref={boxRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testId}>
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  )
}
