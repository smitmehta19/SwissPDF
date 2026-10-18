import { useEffect, useRef } from 'react'
import Icon from '../../components/Icon.jsx'
import { Field, OptionCards, Segmented } from '../../app/controls.jsx'
import { getBytes } from '../../app/fileStore.js'
import { callOp } from '../../app/jobs.js'
import { baseName } from '../../components/usePdfFiles.js'
import { formatBytes } from '../../lib/download.js'
import { everyNRanges, parseRangeSpec, rangeLabel } from '../../lib/pageRanges.js'
import { bookmarkRanges, splitBySize } from '../../lib/splitOps.js'
import './organize.css'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const UNIT = { KB: 1024, MB: 1024 * 1024 }

// Bookmarks per file id, read once in the worker: { items, pageCount } | { error }
const outlines = new Map()

function customRanges(rows, f) {
  return rows.map((row, i) => {
    const from = row.from === '' ? 1 : Number(row.from)
    const to = row.to === '' ? f.pageCount : Number(row.to)
    const label = `Range ${i + 1}`
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1) throw new Error(`${label}: pages are whole numbers from 1.`)
    if (from > to) throw new Error(`${label} is reversed: ${from} is after ${to}.`)
    if (to > f.pageCount) throw new Error(`${label} goes past the end: ${f.name} has ${plural(f.pageCount, 'page')}.`)
    return { from, to }
  })
}

// What one file turns into: { ranges, merge } or throws with a message that
// names the problem. Size mode is planned while it runs.
function planFile(f, o) {
  if (o.tab === 'range') {
    if (o.rangeMode === 'fixed') return { ranges: everyNRanges(o.every, f.pageCount), merge: false }
    return { ranges: customRanges(o.rows, f), merge: o.mergeRanges }
  }
  if (o.tab === 'pages') {
    if (o.pagesMode === 'all') return { ranges: everyNRanges(1, f.pageCount), merge: false }
    const { pages } = parseRangeSpec(o.pageSpec, f.pageCount)
    return { ranges: pages.map((n) => ({ from: n, to: n })), merge: o.mergePages }
  }
  if (o.tab === 'bookmarks') {
    const ol = outlines.get(f.id)
    if (!ol) throw new Error(`Reading the bookmarks of ${f.name}.`)
    if (ol.error) throw new Error(`Could not read the bookmarks of ${f.name}: ${ol.error}`)
    const ranges = bookmarkRanges(ol.items, o.level, f.pageCount)
    if (ranges.length === 0) throw new Error(`${f.name} has no bookmarks${ol.items.length ? ` at level ${o.level}` : ''}.`)
    return { ranges, merge: false }
  }
  throw new Error('Pick how to split.')
}

const maxBytes = (o) => Number(o.maxSize) * UNIT[o.unit]

// Part name by bookmark: zero-padded index and the title, safe on any disk
// (report_01_Contents.pdf), 60 characters at most.
export function bookmarkPartName(base, index, count, title) {
  const n = String(index + 1).padStart(Math.max(2, String(count).length), '0')
  const safe = (title || 'Before the first bookmark')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const room = 60 - '.pdf'.length - n.length - 2
  const head = base.length > room - 12 ? base.slice(0, Math.max(8, room - 12)).trim() : base
  const tail = safe.slice(0, Math.max(0, room - head.length)).replace(/[. ]+$/, '').trim()
  return `${head}_${n}${tail ? `_${tail.replace(/ /g, '_')}` : ''}.pdf`
}

function useOutlines(files, options, setOptions, active) {
  const latest = useRef(options)
  latest.current = options
  const ids = files.map((f) => f.id).join(',')
  useEffect(() => {
    if (!active) return undefined
    let live = true
    ;(async () => {
      for (const f of files) {
        if (outlines.has(f.id)) continue
        try {
          outlines.set(f.id, await callOp('outline', [await getBytes(f.id)], { lane: 'outline' }))
        } catch (err) {
          outlines.set(f.id, { error: err.message })
        }
        // re-render the shell so the live line picks the bookmarks up
        if (live) setOptions({ ...latest.current, outlineTick: (latest.current.outlineTick ?? 0) + 1 })
      }
    })()
    return () => {
      live = false
    }
  }, [ids, active]) // eslint-disable-line react-hooks/exhaustive-deps
}

function RangeRows({ rows, onChange, last }) {
  const set = (i, field, value) => onChange(rows.map((r, j) => (j === i ? { ...r, [field]: value.replace(/\D/g, '') } : r)))
  return (
    <>
      <ol className="range-rows" data-testid="split-range-rows">
        {rows.map((r, i) => (
          <li key={i} className="range-row">
            <span className="range-row-num">{i + 1}</span>
            <input className="input" inputMode="numeric" aria-label={`Range ${i + 1} from page`} placeholder="1" value={r.from} onChange={(e) => set(i, 'from', e.target.value)} data-testid="split-from" />
            <span>to</span>
            <input className="input" inputMode="numeric" aria-label={`Range ${i + 1} to page`} placeholder={last ? String(last) : 'last'} value={r.to} onChange={(e) => set(i, 'to', e.target.value)} data-testid="split-to" />
            <button type="button" className="icon-btn" onClick={() => onChange(rows.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label={`Remove range ${i + 1}`} title="Remove range">
              <Icon name="close" size={15} />
            </button>
          </li>
        ))}
      </ol>
      <div className="btn-row">
        <button type="button" className="btn btn-quiet btn-small" onClick={() => onChange([...rows, { from: '', to: '' }])} data-testid="split-add-range">
          <Icon name="plus" size={15} />
          Add range
        </button>
      </div>
    </>
  )
}

function Options({ options: o, setOptions, files }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  useOutlines(files, o, setOptions, o.tab === 'bookmarks')
  const last = files.length === 1 ? files[0].pageCount : null
  const maxLevel = Math.max(1, ...files.map((f) => Math.max(0, ...(outlines.get(f.id)?.items ?? []).map((it) => it.level))))
  const atLevel = (lvl) => files.reduce((n, f) => n + (outlines.get(f.id)?.items ?? []).filter((it) => it.level === lvl && it.page).length, 0)
  return (
    <>
      <Segmented
        label="Split mode"
        testId="split-tab"
        value={o.tab}
        onChange={(tab) => set({ tab })}
        options={[
          { value: 'range', title: 'Range' },
          { value: 'pages', title: 'Pages' },
          { value: 'size', title: 'Size' },
          { value: 'bookmarks', title: 'Bookmarks' },
        ]}
      />
      {o.tab === 'range' && (
        <>
          <OptionCards
            label="Range mode"
            columns={2}
            testId="split-range-mode"
            value={o.rangeMode}
            onChange={(rangeMode) => set({ rangeMode })}
            options={[
              { value: 'custom', title: 'Custom', caption: 'Your own ranges' },
              { value: 'fixed', title: 'Fixed', caption: 'Every N pages' },
            ]}
          />
          {o.rangeMode === 'custom' ? (
            <>
              <div className="field">
                <span className="field-label">Ranges</span>
                <RangeRows rows={o.rows} onChange={(rows) => set({ rows })} last={last} />
              </div>
              <label className="check-line">
                <input type="checkbox" checked={o.mergeRanges} onChange={(e) => set({ mergeRanges: e.target.checked })} data-testid="split-merge-ranges" />
                Merge all ranges into one PDF
              </label>
            </>
          ) : (
            <Field label="Pages per file">
              {(id) => (
                <div className="inline-num">
                  Split into files of
                  <input id={id} className="input" type="number" min="1" value={o.every} onChange={(e) => set({ every: e.target.value })} data-testid="every-n-input" />
                  pages
                </div>
              )}
            </Field>
          )}
        </>
      )}
      {o.tab === 'pages' && (
        <>
          <OptionCards
            label="Pages mode"
            columns={2}
            testId="split-pages-mode"
            value={o.pagesMode}
            onChange={(pagesMode) => set({ pagesMode })}
            options={[
              { value: 'all', title: 'Extract all', caption: 'One PDF per page' },
              { value: 'select', title: 'Select pages', caption: 'Only the pages you list' },
            ]}
          />
          {o.pagesMode === 'select' && (
            <>
              <Field label="Pages to extract" help="Pages and ranges, for example 1,5-8.">
                {(id) => <input id={id} className="input" placeholder="1,5-8" value={o.pageSpec} onChange={(e) => set({ pageSpec: e.target.value })} data-testid="range-input" />}
              </Field>
              <label className="check-line">
                <input type="checkbox" checked={o.mergePages} onChange={(e) => set({ mergePages: e.target.checked })} />
                Merge extracted pages into one PDF
              </label>
            </>
          )}
        </>
      )}
      {o.tab === 'size' && (
        <Field label="Maximum size per file" help={files.length === 1 ? `${files[0].name}: ${formatBytes(files[0].size)}, ${plural(files[0].pageCount, 'page')}.` : 'Pages stay in order. A single page bigger than the limit gets a file of its own.'}>
          {(id) => (
            <div className="inline-num">
              <input id={id} className="input" type="number" min="1" step="any" value={o.maxSize} onChange={(e) => set({ maxSize: e.target.value })} data-testid="split-max-size" />
              <Segmented label="Unit" value={o.unit} onChange={(unit) => set({ unit })} options={[{ value: 'KB', title: 'KB' }, { value: 'MB', title: 'MB' }]} />
            </div>
          )}
        </Field>
      )}
      {o.tab === 'bookmarks' && (
        <div className="field">
          <span className="field-label">Split at bookmarks of</span>
          <Segmented
            label="Bookmark level"
            testId="split-level"
            value={Math.min(o.level, maxLevel)}
            onChange={(level) => set({ level })}
            options={Array.from({ length: Math.min(maxLevel, 6) }, (_, i) => ({ value: i + 1, title: i === 0 ? 'Top level' : `Level ${i + 1}` }))}
          />
          <p className="field-help">
            {files.some((f) => !outlines.has(f.id))
              ? 'Reading bookmarks...'
              : `${plural(atLevel(1), 'top-level bookmark')}${maxLevel > 1 ? `, ${atLevel(2)} at level 2` : ''}. Each part keeps its own bookmarks.`}
          </p>
        </div>
      )}
    </>
  )
}

function summary(files, o) {
  const none = { ready: false, runLabel: 'Split PDF' }
  if (files.length === 0) return { ...none, line: 'Select a PDF to split.' }
  const from = files.length > 1 ? ` from ${plural(files.length, 'file')}` : ''
  if (o.tab === 'size') {
    const max = maxBytes(o)
    if (!(max > 0)) return { ...none, line: 'Enter a maximum size above 0.' }
    const est = files.reduce((n, f) => n + Math.max(1, Math.ceil(f.size / max)), 0)
    return { ready: true, line: `Each PDF up to ${o.maxSize} ${o.unit}. At least ${plural(est, 'PDF')} will be created${from}.`, runLabel: 'Split by size' }
  }
  let count = 0
  try {
    for (const f of files) {
      const plan = planFile(f, o)
      count += plan.merge ? 1 : plan.ranges.length
    }
  } catch (err) {
    return { ...none, line: err.message }
  }
  const lead = o.tab === 'range' && o.rangeMode === 'fixed' ? `This PDF will be split into files of ${plural(Math.floor(Number(o.every)), 'page')}. ` : ''
  return { ready: true, line: `${lead}${plural(count, 'PDF')} will be created${from}.`, runLabel: `Split into ${plural(count, 'PDF')}` }
}

export default {
  id: 'split',
  name: 'Split',
  io: 'PDF → many PDF',
  description: 'Cut by ranges, single pages, file size or bookmarks.',
  category: 'Organize',
  icon: 'split',
  accepts: { min: 1 },
  defaults: {
    tab: 'range',
    rangeMode: 'custom',
    rows: [{ from: '', to: '' }],
    mergeRanges: false,
    every: '2',
    pagesMode: 'all',
    pageSpec: '',
    mergePages: false,
    maxSize: '5',
    unit: 'MB',
    level: 1,
  },
  next: ['merge', 'rotate', 'compress', 'extract'],
  Options,
  summary,
  async run(files, o, ctx) {
    const outputs = []
    const total = files.reduce((n, f) => n + f.pageCount, 0)
    let done = 0
    for (const f of files) {
      const base = baseName(f.name)
      const push = (part, extra = {}) => outputs.push({ name: `${base}_${rangeLabel(part)}.pdf`, bytes: part.bytes, parentIds: [f.id], ...extra })
      if (o.tab === 'size') {
        ctx.progress(done, total, `Measuring parts of ${f.name}`)
        await splitBySize(f.bytes, maxBytes(o), f.pageCount, {
          split: (ranges) => ctx.call('split', f.bytes, ranges),
          onPart: (part) => {
            push(part, part.oversize ? { note: `One page is already over ${o.maxSize} ${o.unit}.` } : {})
            ctx.progress(done + part.to, total, `${f.name}: part ${outputs.length}, pages ${rangeLabel(part)}`)
          },
        })
      } else {
        if (o.tab === 'bookmarks' && !outlines.has(f.id)) outlines.set(f.id, await ctx.call('outline', f.bytes))
        const { ranges, merge } = planFile(f, o)
        if (merge) {
          ctx.progress(done, total, `Collecting pages of ${f.name}`)
          const pages = [...new Set(ranges.flatMap((r) => Array.from({ length: r.to - r.from + 1 }, (_, i) => r.from + i)))]
          const labels = ranges.map(rangeLabel)
          const name = labels.length <= 4 ? `${base}_${labels.join('_')}.pdf` : `${base}_selected.pdf`
          outputs.push({ name, bytes: await ctx.call('extract', f.bytes, pages), parentIds: [f.id] })
        } else {
          // a few big worker calls: each one parses the source once
          const chunk = Math.max(20, Math.ceil(ranges.length / 10))
          for (let i = 0; i < ranges.length; i += chunk) {
            ctx.check()
            const part = ranges.slice(i, i + chunk)
            ctx.progress(done + part[0].from - 1, total, `${f.name}: parts ${i + 1} to ${i + part.length} of ${ranges.length}`)
            const outs = await ctx.call('split', f.bytes, part)
            outs.forEach((out, j) => {
              const r = part[j]
              if (o.tab !== 'bookmarks') return push(out)
              // bookmark parts carry the title in the name, the range in the note
              outputs.push({
                name: bookmarkPartName(base, i + j, ranges.length, r.title),
                bytes: out.bytes,
                parentIds: [f.id],
                note: `${r.title || 'Before the first bookmark'}, pages ${rangeLabel(r)}`,
              })
            })
          }
        }
      }
      done += f.pageCount
    }
    ctx.progress(total, total, 'Done')
    return outputs
  },
}
