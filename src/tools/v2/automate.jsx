// Automate: run a saved chain of tools on every selected PDF, one file at a
// time, each step through the tool's own run(). Chains live in this browser
// (src/lib/automate.js); passwords and picked images are never stored.
import { Component, useEffect, useRef, useState } from 'react'
import { Field, OptionCards } from '../../app/controls.jsx'
import Icon from '../../components/Icon.jsx'
import {
  METADATA_STEP,
  PAGE_CHANGING,
  STEP_IDS,
  STORE_KEY,
  TEMPLATES,
  lastOnlyProblem,
  loadSaved,
  mergeStored,
  newId,
  readStore,
  runAutomation,
  saveChanges,
  toolOptions,
} from '../../lib/automate.js'
import sanitize from './sanitize.jsx'
import flatten from './flatten.jsx'
import removeannots from './removeannots.jsx'
import removeimages from './removeimages.jsx'
import unlockforms from './unlockforms.jsx'
import metadata from './metadata.jsx'
import compress from './compress.jsx'
import repair from './repair.jsx'
import ocr from './ocr.jsx'
import autorotate from './autorotate.jsx'
import rotate from './rotate.jsx'
import removeblank from './removeblank.jsx'
import pagenumbers from './pagenumbers.jsx'
import watermark from './watermark.jsx'
import stamp from './stamp.jsx'
import nup from './nup.jsx'
import booklet from './booklet.jsx'
import scale from './scale.jsx'
import singlepage from './singlepage.jsx'
import adjustcolors from './adjustcolors.jsx'
import replacecolors from './replacecolors.jsx'
import linearize from './linearize.jsx'
import permissions from './permissions.jsx'
import protect from './protect.jsx'
import './automate.css'

// Imported directly, not from the registry (the registry imports this file).
const LIST = [sanitize, flatten, removeannots, removeimages, unlockforms, metadata, compress, repair, ocr, autorotate, rotate, removeblank, pagenumbers, watermark, stamp, nup, booklet, scale, singlepage, adjustcolors, replacecolors, linearize, permissions, protect]
export const STEP_TOOLS = Object.fromEntries(LIST.filter((t) => STEP_IDS.includes(t.id)).map((t) => [t.id, t]))
const CATEGORY_ORDER = ['Organize', 'Optimize', 'Edit', 'Security']

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const chain = (a) => a.steps.map((s) => STEP_TOOLS[s.tool]?.name ?? s.tool).join(', ') || 'No steps yet'

// The chosen automation: a saved one, or a template with this session's option edits.
export function currentOf(o) {
  const mine = o.mine?.find((a) => a.id === o.pick)
  if (mine) return mine
  const t = TEMPLATES.find((x) => x.id === o.pick) ?? TEMPLATES[0]
  return o.drafts?.[t.id] ? { ...t, steps: o.drafts[t.id] } : t
}

// Applies fn to the steps of the chosen automation.
function withSteps(x, fn) {
  const a = currentOf(x)
  if (a.template) return { ...x, drafts: { ...x.drafts, [a.id]: fn(a.steps) } }
  return { ...x, mine: x.mine.map((m) => (m.id === a.id ? { ...m, steps: fn(m.steps) } : m)) }
}

const DAMAGED = 'The settings of this step are damaged. Reset the step or remove it.'
// Page count used for checks after a page-changing step: big enough that any
// well-formed range passes; the real fit is checked when the chain runs.
const LATER = 100000

// Per-step readiness against the selected files: uid -> problem line. Steps
// after a page-changing one get a hint instead of a range check (uid -> hint).
function problemsOf(steps, files) {
  const out = {}
  const hints = {}
  let changer = null
  for (const [i, s] of steps.entries()) {
    const tool = STEP_TOOLS[s.tool]
    if (!tool) {
      out[s.uid] = 'This tool is not available as a step here. Remove it to run this automation.'
      continue
    }
    const last = lastOnlyProblem(steps, i)
    if (last) {
      out[s.uid] = last
      continue
    }
    if (s.tool === 'metadata' && s.options?.mode === 'set' && !Object.values(s.options.info ?? {}).some((v) => String(v).trim())) {
      out[s.uid] = 'Type at least one field.'
      continue
    }
    if (files.length) {
      const at = changer ? files.map((f) => ({ ...f, pageCount: LATER })) : files
      try {
        const sum = tool.summary(at, toolOptions(tool, s, at))
        if (!sum.ready) out[s.uid] = sum.line
      } catch {
        out[s.uid] = DAMAGED
      }
      if (changer && typeof s.options?.pages === 'string' && s.options.pages.trim()) {
        hints[s.uid] = `Pages ${s.options.pages.trim()} are checked when it runs: step ${changer.n}, ${changer.name}, changes the page count.`
      }
    }
    if (!out[s.uid] && s.reset?.length) hints[s.uid] = `Some saved settings could not be read and are back to their defaults: ${s.reset.join(', ')}.`
    if (PAGE_CHANGING.includes(s.tool) && !changer) changer = { n: i + 1, name: tool.name }
  }
  return { problems: out, hints }
}

// A step editor that throws (damaged saved settings) must not take the panel down.
class StepBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="au-step-damaged" role="alert">
        <p className="field-error">{DAMAGED}</p>
        <button
          type="button"
          className="btn btn-small"
          data-testid="auto-step-reset"
          onClick={() => {
            this.props.onReset()
            this.setState({ failed: false })
          }}
        >
          Reset this step
        </button>
      </div>
    )
  }
}

// Metadata as a step: clear it, or set a few fields and keep the rest.
function MetadataStep({ options, setOptions }) {
  const o = { ...METADATA_STEP, ...options, info: { ...METADATA_STEP.info, ...(options.info ?? {}) } }
  return (
    <>
      <OptionCards
        label="Metadata"
        testId="auto-meta-mode"
        value={o.mode}
        onChange={(mode) => setOptions({ ...o, mode })}
        options={[
          { value: 'clear', title: 'Clear all', caption: 'Removes title, author, dates and the XMP copy.' },
          { value: 'set', title: 'Set fields', caption: 'Fields left empty keep what the file has.' },
        ]}
      />
      {o.mode === 'set' &&
        Object.keys(METADATA_STEP.info).map((k) => (
          <Field key={k} label={k}>
            {(id) => <input id={id} className="input" data-testid={`auto-meta-${k}`} value={o.info[k]} onChange={(e) => setOptions({ ...o, info: { ...o.info, [k]: e.target.value } })} />}
          </Field>
        ))}
    </>
  )
}

// Remove blank pages as a step: no page list to check, the found pages go.
function BlankStep({ options: o, setOptions }) {
  return (
    <>
      <Field label={`Ink threshold ${o.threshold}`} help="How much darker than the paper a mark must be to count as ink (0-255). Lower it to keep pages with very faint marks.">
        {(id) => <input id={id} type="range" min="5" max="120" value={o.threshold} onChange={(e) => setOptions({ ...o, threshold: Number(e.target.value) })} />}
      </Field>
      <p className="field-help">Every page found blank is removed. A file with no blank pages goes on unchanged.</p>
    </>
  )
}

function StepEditor({ step, setStepOptions, files }) {
  const tool = STEP_TOOLS[step.tool]
  const options = { ...(tool.defaults ?? {}), ...(step.options ?? {}) }
  if (step.tool === 'metadata') return <MetadataStep options={step.options ?? {}} setOptions={setStepOptions} />
  if (step.tool === 'removeblank') return <BlankStep options={options} setOptions={setStepOptions} />
  // per-file choices (rotate angles per file) do not apply to a saved chain
  return <tool.Options options={options} setOptions={setStepOptions} files={step.tool === 'rotate' ? [] : files} />
}

const STORE_NOTE = {
  ok: 'Your automations are saved in this browser, without passwords or images.',
  blocked: 'This browser blocks saving: your automations last until the tab closes.',
  newer: 'These automations were saved by a newer SwissPDF. Changes made here are not saved.',
}

function Options({ options: o, setOptions, files }) {
  const a = currentOf(o)
  const custom = !a.template
  const { problems, hints } = problemsOf(a.steps, files)
  const firstProblem = a.steps.find((s) => problems[s.uid])?.uid ?? null
  const openUid = o.open === undefined || o.open === null ? firstProblem : o.open
  const [addTool, setAddTool] = useState('compress')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [stored, setStored] = useState('ok')
  const [said, setSaid] = useState('')
  const [focusTo, setFocusTo] = useState(null) // { uid, dir } after a move
  const listRef = useRef(null)

  // Saved automations: this tab writes only what it changed, merged by id
  // onto what is stored, and picks up changes from other tabs.
  const latest = useRef(o)
  latest.current = o
  const prevMine = useRef(o.mine)
  const adopted = useRef(null)
  useEffect(() => {
    if (o.mine === prevMine.current) return
    const own = o.mine !== adopted.current
    const before = prevMine.current
    prevMine.current = o.mine
    if (!own) return
    const res = saveChanges(before ?? [], o.mine ?? [])
    setStored(res.ok ? 'ok' : res.reason)
  }, [o.mine])
  useEffect(() => {
    const refresh = () => {
      const r = readStore(undefined, STEP_TOOLS)
      if (r.reason) {
        if (r.reason !== 'corrupt') setStored(r.reason)
        return
      }
      let mine = mergeStored(latest.current.mine ?? [], r.list)
      // while the name is being typed here, another tab's copy of it is not taken
      const cur = currentOf(latest.current)
      if (document.activeElement?.dataset?.testid === 'auto-name' && !cur.template) mine = mine.map((m) => (m.id === cur.id ? { ...m, name: cur.name } : m))
      adopted.current = mine
      setOptions((x) => ({ ...x, mine }))
    }
    refresh()
    const onStorage = (e) => {
      if (e.key === STORE_KEY || e.key === null) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setConfirmDelete(false), [o.pick])

  // keyboard reorder: focus stays on the moved step's arrow
  useEffect(() => {
    if (!focusTo || !listRef.current) return
    const row = [...listRef.current.querySelectorAll('[data-uid]')].find((el) => el.dataset.uid === focusTo.uid)
    const want = row?.querySelector(`[data-testid=auto-step-${focusTo.dir}]`)
    const other = row?.querySelector(`[data-testid=auto-step-${focusTo.dir === 'up' ? 'down' : 'up'}]`)
    const target = want && !want.disabled ? want : (other ?? row?.querySelector('[data-testid=auto-step-toggle]'))
    target?.focus()
    setFocusTo(null)
  }, [focusTo])

  const pick = (id) => setOptions((x) => ({ ...x, pick: id, open: null }))
  const toggle = (uid) => setOptions((x) => ({ ...x, open: (x.open ?? firstProblem) === uid ? false : uid }))
  const setStepOptions = (uid) => (next) =>
    setOptions((x) =>
      withSteps(x, (steps) =>
        steps.map((s) => {
          if (s.uid !== uid) return s
          const tool = STEP_TOOLS[s.tool]
          const prev = s.tool === 'metadata' ? { ...METADATA_STEP, ...s.options } : { ...(tool?.defaults ?? {}), ...s.options }
          // an edit settles the step: no "settings were reset" hint any more
          return { uid: s.uid, tool: s.tool, options: typeof next === 'function' ? next(prev) : next }
        }),
      ),
    )
  const nameOf = (s) => STEP_TOOLS[s.tool]?.name ?? s.tool
  const move = (i, by) => {
    const s = a.steps[i]
    setOptions((x) =>
      withSteps(x, (steps) => {
        const next = [...steps]
        const [m] = next.splice(i, 1)
        next.splice(i + by, 0, m)
        return next
      }),
    )
    setSaid(`${nameOf(s)} moved to step ${i + by + 1} of ${a.steps.length}.`)
    setFocusTo({ uid: s.uid, dir: by < 0 ? 'up' : 'down' })
  }
  const removeStep = (s) => {
    setOptions((x) => withSteps(x, (steps) => steps.filter((t) => t.uid !== s.uid)))
    setSaid(`${nameOf(s)} removed. ${plural(a.steps.length - 1, 'step')} left.`)
  }
  const resetStep = (s) => setStepOptions(s.uid)(s.tool === 'metadata' ? { ...METADATA_STEP } : {})
  const addStep = () => {
    const uid = newId('s')
    const options = addTool === 'metadata' ? { ...METADATA_STEP } : {}
    setOptions((x) => ({ ...withSteps(x, (steps) => [...steps, { uid, tool: addTool, options }]), open: uid }))
  }
  const create = (from) => {
    const id = newId('a')
    const n = (o.mine?.length ?? 0) + 1
    const name = from ? `${from.name} (my copy)` : `My automation ${n}`
    const steps = from ? from.steps.map((s) => ({ ...s, uid: newId('s'), options: { ...s.options } })) : []
    setOptions((x) => ({ ...x, mine: [...(x.mine ?? []), { id, name, steps }], pick: id, open: null }))
  }
  const rename = (name) => setOptions((x) => ({ ...x, mine: x.mine.map((m) => (m.id === a.id ? { ...m, name } : m)) }))
  const removeAutomation = () => setOptions((x) => ({ ...x, mine: x.mine.filter((m) => m.id !== a.id), pick: TEMPLATES[0].id, open: null }))

  const byCategory = CATEGORY_ORDER.map((c) => [c, Object.values(STEP_TOOLS).filter((t) => t.category === c)]).filter(([, l]) => l.length)

  return (
    <div className="au">
      <fieldset className="au-pick" data-testid="auto-pick">
        <legend className="field-label">Automation</legend>
        <p className="au-group">Built in</p>
        {TEMPLATES.map((t) => (
          <PickRow key={t.id} a={t} on={a.id === t.id} onPick={pick} />
        ))}
        <p className="au-group">Yours</p>
        {(o.mine ?? []).map((m) => (
          <PickRow key={m.id} a={m} on={a.id === m.id} onPick={pick} />
        ))}
        {!o.mine?.length && <p className="field-help">None saved yet. Start a new one, or copy a built-in one to change its steps.</p>}
        <div className="btn-row">
          <button type="button" className="btn btn-quiet btn-small" data-testid="auto-new" onClick={() => create(null)}>
            <Icon name="plus" size={14} />
            New automation
          </button>
        </div>
      </fieldset>

      <section className="au-detail" aria-label={`Steps of ${a.name}`} data-testid="auto-detail">
        <p className="sr-only" aria-live="polite" data-testid="auto-said">
          {said}
        </p>
        {custom ? (
          <Field label="Name">
            {(id) => <input id={id} className="input" data-testid="auto-name" maxLength={80} value={a.name} onChange={(e) => rename(e.target.value)} />}
          </Field>
        ) : (
          <p className="field-help au-blurb">{a.blurb}</p>
        )}

        <span className="field-label" id="au-steps-label">
          Steps, in order
        </span>
        {a.steps.length ? (
          <ol className="au-steps" aria-labelledby="au-steps-label" data-testid="auto-steps" ref={listRef}>
            {a.steps.map((s, i) => {
              const tool = STEP_TOOLS[s.tool]
              const open = openUid === s.uid && !!tool
              const problem = problems[s.uid]
              return (
                <li key={s.uid} className={`au-step ${open ? 'is-open' : ''}`} data-testid="auto-step" data-tool={s.tool} data-uid={s.uid}>
                  <div className="au-step-head">
                    <span className="au-step-num mono" aria-hidden="true">
                      {i + 1}
                    </span>
                    <button type="button" className="au-step-toggle" aria-expanded={open} onClick={() => toggle(s.uid)} data-testid="auto-step-toggle" disabled={!tool}>
                      <span className="au-step-name">{tool?.name ?? s.tool}</span>
                      <Icon name="right" size={14} className={`au-chevron ${open ? 'is-open' : ''}`} />
                    </button>
                    {custom && (
                      <span className="au-step-tools">
                        <button type="button" className="icon-btn" aria-label={`Move step ${i + 1}, ${nameOf(s)}, up`} disabled={i === 0} onClick={() => move(i, -1)} data-testid="auto-step-up">
                          <Icon name="right" size={14} className="au-up" />
                        </button>
                        <button type="button" className="icon-btn" aria-label={`Move step ${i + 1}, ${nameOf(s)}, down`} disabled={i === a.steps.length - 1} onClick={() => move(i, 1)} data-testid="auto-step-down">
                          <Icon name="right" size={14} className="au-down" />
                        </button>
                        <button type="button" className="icon-btn icon-btn-danger" aria-label={`Remove step ${i + 1}, ${nameOf(s)}`} onClick={() => removeStep(s)} data-testid="auto-step-remove">
                          <Icon name="trash" size={14} />
                        </button>
                      </span>
                    )}
                  </div>
                  {!problem && hints[s.uid] && (
                    <p className="au-step-hint" data-testid="auto-step-hint">
                      {hints[s.uid]}
                    </p>
                  )}
                  {problem && (
                    <p className="au-step-problem" data-testid="auto-step-problem">
                      {problem}
                    </p>
                  )}
                  {open && (
                    <div className="au-step-body" data-testid="auto-step-body">
                      <StepBoundary onReset={() => resetStep(s)}>
                        <StepEditor step={s} setStepOptions={setStepOptions(s.uid)} files={files} />
                      </StepBoundary>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="field-help" data-testid="auto-empty">
            No steps yet. Add the first one below.
          </p>
        )}

        {custom ? (
          <>
            <div className="au-add">
              <label className="sr-only" htmlFor="au-add-tool">
                Tool to add
              </label>
              <select id="au-add-tool" className="input" value={addTool} onChange={(e) => setAddTool(e.target.value)} data-testid="auto-add-tool">
                {byCategory.map(([c, list]) => (
                  <optgroup key={c} label={c}>
                    {list.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button type="button" className="btn btn-small" onClick={addStep} data-testid="auto-add">
                <Icon name="plus" size={14} />
                Add step
              </button>
            </div>
            <div className="btn-row au-danger-row">
              {confirmDelete ? (
                <>
                  <span className="field-help">Delete {a.name}?</span>
                  <button type="button" className="btn btn-danger btn-small" onClick={removeAutomation} data-testid="auto-delete-yes">
                    Delete
                  </button>
                  <button type="button" className="btn btn-quiet btn-small" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <button type="button" className="link link-danger" onClick={() => setConfirmDelete(true)} data-testid="auto-delete">
                  Delete this automation
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="btn-row">
            <button type="button" className="btn btn-quiet btn-small" onClick={() => create(a)} data-testid="auto-copy">
              <Icon name="duplicate" size={14} />
              Copy to change steps
            </button>
          </div>
        )}
        <p className="field-help">
          Each file goes through the steps in order. If a step fails on a file, that file stops and the others go on.{' '}
          {STORE_NOTE[stored] ?? STORE_NOTE.blocked}
        </p>
      </section>
    </div>
  )
}

function PickRow({ a, on, onPick }) {
  return (
    <label className={`au-pick-row ${on ? 'is-on' : ''}`} data-testid="auto-pick-row" data-id={a.id}>
      <input type="radio" name="au-pick" checked={on} onChange={() => onPick(a.id)} />
      <span className="au-pick-text">
        <span className="au-pick-name">{a.name || 'Untitled'}</span>
        <span className="au-pick-chain">{chain(a)}</span>
      </span>
    </label>
  )
}

const STATUS = { done: 'Done', unchanged: 'No step changed it', failed: 'Stopped' }
const STEP_STATUS = { failed: 'Failed', skipped: 'Skipped', nochange: 'No change' }

// Per-file outcome under the result: which steps ran, which one stopped a file.
function Report({ view }) {
  return (
    <section className="au-report" aria-label={`${view.name} report`} data-testid="auto-report">
      <h3 className="au-report-title">{view.name}</h3>
      <ul className="au-report-files">
        {view.files.map((f, i) => (
          <li key={i} className={`au-report-file is-${f.status}`} data-testid="auto-report-file" data-status={f.status}>
            <details open={f.status === 'failed'}>
              <summary>
                <span className="file-name" title={f.name}>
                  {f.name}
                </span>
                <span className="au-report-status">{f.status === 'failed' ? `${STATUS.failed} at step ${f.failed.step}, ${f.failed.tool}` : STATUS[f.status]}</span>
              </summary>
              <ol className="au-report-steps">
                {f.log.map((l, k) => (
                  <li key={k} className={`is-${l.status}`}>
                    <span className="au-report-step">{l.tool}</span>
                    <span className="au-report-note">
                      {STEP_STATUS[l.status] ? `${STEP_STATUS[l.status]}: ${l.note}` : (l.note ?? 'Done')}
                    </span>
                    <span className="mono au-report-ms">{(l.ms / 1000).toFixed(1)} s</span>
                  </li>
                ))}
              </ol>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default {
  id: 'automate',
  name: 'Automate',
  io: 'PDFs → PDFs, step by step',
  description: 'Run a saved chain of tools on every selected file.',
  category: 'Optimize',
  icon: 'automate',
  accepts: { min: 1 },
  // options stepper: pick the automation first, then the files
  steps: [{ id: 'options', title: 'Automation' }, { id: 'files', title: 'Files' }],
  defaults: { pick: TEMPLATES[0].id, mine: loadSaved(undefined, STEP_TOOLS), drafts: {}, open: null },
  next: ['merge', 'protect', 'compress'],
  Options,
  summary(files, o) {
    const a = currentOf(o)
    const label = 'Run automation'
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: label }
    if (!a.steps.length) return { ready: false, line: 'Add at least one step.', runLabel: label }
    const { problems } = problemsOf(a.steps, files)
    const bad = a.steps.findIndex((s) => problems[s.uid])
    if (bad >= 0) return { ready: false, line: `Step ${bad + 1}, ${STEP_TOOLS[a.steps[bad].tool]?.name ?? a.steps[bad].tool}: ${problems[a.steps[bad].uid]}`, runLabel: label }
    const n = files.length
    const reset = a.steps.findIndex((s) => s.reset?.length)
    return {
      ready: true,
      line: `${plural(a.steps.length, 'step')} on each of ${plural(n, 'PDF')}: ${chain(a)}.${reset >= 0 ? ` Step ${reset + 1} has settings back at their defaults (${a.steps[reset].reset.join(', ')}): check it before you run.` : ''}`,
      runLabel: `Run on ${plural(n, 'PDF')}`,
    }
  },
  async run(files, o, ctx) {
    const { assertValidOutput } = await import('../../lib/pdfOps.js')
    return runAutomation(files, currentOf(o), ctx, { tools: STEP_TOOLS, assertValid: assertValidOutput })
  },
  Result: Report,
}
