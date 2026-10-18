import { useEffect, useRef, useState } from 'react'
import { Field, Segmented } from '../../app/controls.jsx'
import Icon from '../../components/Icon.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { PageStage, ItemList, plural } from './g3-canvas.jsx'

// Script fonts for typed signatures (self-hosted, OFL, Latin subset).
const FONTS = [
  { id: 'allura', family: 'SwissSig Allura', file: 'Allura.woff2', label: 'Formal' },
  { id: 'greatvibes', family: 'SwissSig Great Vibes', file: 'GreatVibes.woff2', label: 'Flowing' },
  { id: 'caveat', family: 'SwissSig Caveat', file: 'Caveat.woff2', label: 'Handwritten' },
]
const INKS = { black: '#101828', blue: '#1d3fbf', red: '#b42318' }

const fontLoads = new Map()
function loadFont(f) {
  if (!fontLoads.has(f.id)) {
    const url = `${import.meta.env.BASE_URL}fonts/script/${f.file}`
    const face = new FontFace(f.family, `url(${url})`)
    const p = face.load().then((loaded) => {
      document.fonts.add(loaded)
      return loaded
    })
    p.catch(() => fontLoads.delete(f.id))
    fontLoads.set(f.id, p)
  }
  return fontLoads.get(f.id)
}

const canvasPng = (canvas) =>
  new Promise((res) => canvas.toBlob(async (b) => res(new Uint8Array(await b.arrayBuffer())), 'image/png'))

// Typed name -> transparent PNG in a script font, cropped to the ink.
async function typedPng(text, fontId, ink) {
  const f = FONTS.find((x) => x.id === fontId) ?? FONTS[0]
  await loadFont(f)
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  const size = 120
  ctx.font = `${size}px "${f.family}"`
  const m = ctx.measureText(text)
  const pad = 24
  c.width = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + pad * 2
  c.height = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + pad * 2
  ctx.font = `${size}px "${f.family}"`
  ctx.fillStyle = ink
  ctx.fillText(text, pad + m.actualBoundingBoxLeft, pad + m.actualBoundingBoxAscent)
  return { png: await canvasPng(c), width: c.width, height: c.height }
}

const initialsOf = (name) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => [...w][0].toUpperCase())
    .join('')
    .slice(0, 4)

export function dateText(format, d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  if (format === 'iso') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (format === 'us') return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

// Draw pad: black (or chosen) ink on transparent, trimmed to the strokes.
function DrawPad({ ink, onDone, testId }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const bounds = useRef(null)
  useEffect(() => {
    const c = ref.current
    const ratio = window.devicePixelRatio || 1
    c.width = c.clientWidth * ratio
    c.height = c.clientHeight * ratio
  }, [])
  const pos = (e) => {
    const r = ref.current.getBoundingClientRect()
    const ratio = ref.current.width / r.width
    return { x: (e.clientX - r.left) * ratio, y: (e.clientY - r.top) * ratio }
  }
  const grow = (p) => {
    const b = bounds.current ?? { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
    bounds.current = { x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }
  }
  const end = async () => {
    if (!drawing.current) return
    drawing.current = false
    const b = bounds.current
    if (!b) return
    const pad = 8
    const w = Math.max(1, Math.ceil(b.x1 - b.x0) + pad * 2)
    const h = Math.max(1, Math.ceil(b.y1 - b.y0) + pad * 2)
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    out.getContext('2d').drawImage(ref.current, b.x0 - pad, b.y0 - pad, w, h, 0, 0, w, h)
    onDone({ png: await canvasPng(out), width: w, height: h })
  }
  return (
    <div className="field">
      <canvas
        ref={ref}
        className="g3-pad"
        data-testid={testId}
        aria-label="Signature pad: draw with the mouse, a pen or a finger"
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          drawing.current = true
          const ctx = ref.current.getContext('2d')
          ctx.lineWidth = 2.6 * (window.devicePixelRatio || 1)
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.strokeStyle = ink
          const p = pos(e)
          grow(p)
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = ref.current.getContext('2d')
          const p = pos(e)
          grow(p)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
        }}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-quiet btn-small"
          onClick={() => {
            const c = ref.current
            c.getContext('2d').clearRect(0, 0, c.width, c.height)
            bounds.current = null
            onDone(null)
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )
}

// Creates a signature or initials image: type, draw or upload.
function MarkMaker({ kind, mark, onChange, ink, name, setName }) {
  const [mode, setMode] = useState(mark?.source ?? 'type')
  const [font, setFont] = useState(mark?.font ?? 'allura')
  const [error, setError] = useState(null)
  const text = kind === 'initials' ? initialsOf(name) : name.trim()

  // typed marks re-render when the name, font or ink changes
  useEffect(() => {
    if (mode !== 'type') return undefined
    let active = true
    if (!text) {
      onChange(null)
      return undefined
    }
    typedPng(text, font, ink).then(
      (img) => active && onChange({ ...img, source: 'type', font }),
      (err) => active && setError(`Could not load the signature font: ${err.message}`),
    )
    return () => {
      active = false
    }
  }, [mode, text, font, ink]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Segmented
        label={`${kind} source`}
        testId={`sig-${kind}-mode`}
        value={mode}
        onChange={(m) => {
          setMode(m)
          setError(null)
          if (m !== 'type') onChange(null)
        }}
        options={[
          { value: 'type', title: 'Type' },
          { value: 'draw', title: 'Draw' },
          { value: 'upload', title: 'Upload' },
        ]}
      />
      {mode === 'type' && (
        <>
          <Field label="Your name" help={kind === 'initials' ? 'Initials are taken from your name.' : null}>
            {(id) => <input id={id} className="input" data-testid="sig-name" value={name} placeholder="Full name" onChange={(e) => setName(e.target.value)} />}
          </Field>
          <div className="g3-typed" role="radiogroup" aria-label="Signature style">
            {FONTS.map((f) => (
              <FontButton key={f.id} f={f} on={font === f.id} text={text || (kind === 'initials' ? 'AB' : 'Your name')} ink={ink} onPick={() => setFont(f.id)} />
            ))}
          </div>
        </>
      )}
      {mode === 'draw' && <DrawPad ink={ink} testId={`sig-pad-${kind}`} onDone={(img) => onChange(img && { ...img, source: 'draw' })} />}
      {mode === 'upload' && (
        <Field label="Image" help="PNG with a transparent background works best. JPG and WebP are converted.">
          {(id) => (
            <input
              id={id}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              data-testid={`sig-upload-${kind}`}
              onChange={async (e) => {
                const file = e.target.files[0]
                if (!file) return
                try {
                  const bmp = await createImageBitmap(file)
                  const c = document.createElement('canvas')
                  c.width = bmp.width
                  c.height = bmp.height
                  c.getContext('2d').drawImage(bmp, 0, 0)
                  setError(null)
                  onChange({ png: await canvasPng(c), width: c.width, height: c.height, source: 'upload' })
                } catch {
                  setError('That file is not an image this browser can read.')
                }
              }}
            />
          )}
        </Field>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
    </>
  )
}

function FontButton({ f, on, text, ink, onPick }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    loadFont(f).then(() => setReady(true), () => setReady(true))
  }, [f])
  return (
    <button type="button" role="radio" aria-checked={on} className={on ? 'is-on' : ''} onClick={onPick} title={f.label} data-testid={`sig-font-${f.id}`}>
      <span style={{ fontFamily: ready ? `"${f.family}", cursive` : 'cursive', color: ink }}>{text}</span>
    </button>
  )
}

// Object URLs for the mark previews, revoked when they change.
function useUrl(png) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!png) return setUrl(null)
    const u = URL.createObjectURL(new Blob([png], { type: 'image/png' }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [png])
  return url
}

let seq = 1

function Canvas({ files, options: o, setOptions, target, onTarget }) {
  const sigUrl = useUrl(o.signature?.png)
  const iniUrl = useUrl(o.initials?.png)
  const move = useRef(null)
  const urls = { signature: sigUrl, initials: iniUrl }
  const ready = o.place === 'date' || o[o.place]
  return (
    <PageStage
      files={files}
      target={target}
      onTarget={onTarget}
      testId="sign-stage"
      cursor={ready ? 'copy' : 'not-allowed'}
      hint={ready ? `Click where the ${o.place} should go. Drag a placed one to move it.` : `Create your ${o.place} in the options first.`}
      onDown={(p, e, ctx) => {
        const hit = e.target.closest('[data-stamp]')
        if (hit) {
          move.current = hit.dataset.stamp
          return
        }
        if (!ready) return
        const item = { id: seq++, kind: o.place, page: ctx.page, fx: p.fx, fy: p.fy, widthPct: o.place === 'signature' ? o.sigWidth : o.place === 'initials' ? o.iniWidth : 0, all: false }
        setOptions((x) => ({ ...x, placements: [...x.placements, item] }))
      }}
      onMove={(p) => {
        const id = Number(move.current)
        if (!id) return
        setOptions((x) => ({ ...x, placements: x.placements.map((it) => (it.id === id ? { ...it, fx: p.fx, fy: p.fy } : it)) }))
      }}
      onUp={() => {
        move.current = null
      }}
    >
      {({ page }) =>
        o.placements
          .filter((it) => it.page === page || it.all)
          .map((it) => (
            <span
              key={it.id}
              className="g3-ov g3-stamp"
              data-stamp={it.id}
              data-testid="sign-ghost"
              style={{ left: `${it.fx * 100}%`, top: `${it.fy * 100}%`, width: it.kind === 'date' ? 'auto' : `${it.widthPct}%` }}
            >
              {it.kind === 'date' ? (
                <span className="g3-stamp-text" style={{ color: INKS[o.ink] }}>
                  {dateText(o.dateFormat)}
                </span>
              ) : urls[it.kind] ? (
                <img src={urls[it.kind]} alt={it.kind} />
              ) : (
                <span className="g3-stamp-text">{it.kind}</span>
              )}
              {it.all && <span className="g3-stamp-all">every page</span>}
              <button
                type="button"
                className="g3-remove"
                data-g3-control
                aria-label={`Remove ${it.kind}`}
                onClick={() => setOptions((x) => ({ ...x, placements: x.placements.filter((q) => q.id !== it.id) }))}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          ))
      }
    </PageStage>
  )
}

function Options({ options: o, setOptions }) {
  const set = (fields) => setOptions((x) => ({ ...x, ...fields }))
  const kinds = { signature: 'Signature', initials: 'Initials', date: 'Date' }
  return (
    <>
      <p className="g3-note">A visual signature, like ink on paper. It is not a certificate-based digital signature.</p>
      <div className="field">
        <span className="field-label">Ink</span>
        <Segmented label="Ink" value={o.ink} onChange={(ink) => set({ ink })} options={Object.keys(INKS).map((k) => ({ value: k, title: k[0].toUpperCase() + k.slice(1) }))} />
      </div>
      <Segmented
        label="Create"
        testId="sig-tab"
        value={o.tab}
        onChange={(tab) => set({ tab })}
        options={[
          { value: 'signature', title: 'Signature' },
          { value: 'initials', title: 'Initials' },
        ]}
      />
      {o.tab === 'signature' ? (
        <MarkMaker key="signature" kind="signature" mark={o.signature} ink={INKS[o.ink]} name={o.name} setName={(name) => set({ name })} onChange={(signature) => set({ signature })} />
      ) : (
        <MarkMaker key="initials" kind="initials" mark={o.initials} ink={INKS[o.ink]} name={o.name} setName={(name) => set({ name })} onChange={(initials) => set({ initials })} />
      )}
      <div className="field">
        <span className="field-label">Click on the page to place</span>
        <Segmented label="Place" testId="sig-place" value={o.place} onChange={(place) => set({ place })} options={Object.entries(kinds).map(([value, title]) => ({ value, title }))} />
      </div>
      {o.place === 'date' && (
        <Field label="Date format">
          {(id) => (
            <select id={id} className="input" value={o.dateFormat} onChange={(e) => set({ dateFormat: e.target.value })}>
              {['iso', 'eu', 'us'].map((f) => (
                <option key={f} value={f}>
                  {dateText(f)}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {o.place !== 'date' && (
        <Field label={`Width ${o.place === 'signature' ? o.sigWidth : o.iniWidth}% of the page`}>
          {(id) => (
            <input
              id={id}
              type="range"
              min="5"
              max="60"
              value={o.place === 'signature' ? o.sigWidth : o.iniWidth}
              onChange={(e) => {
                const v = Number(e.target.value)
                setOptions((x) => ({
                  ...x,
                  [x.place === 'signature' ? 'sigWidth' : 'iniWidth']: v,
                  placements: x.placements.map((it) => (it.kind === x.place ? { ...it, widthPct: v } : it)),
                }))
              }}
            />
          )}
        </Field>
      )}
      <div className="field">
        <span className="field-label">Placed</span>
        <ItemList
          testId="sign-list"
          items={o.placements.map((it) => ({ key: it.id, label: `${kinds[it.kind]}`, meta: it.all ? 'every page' : `page ${it.page}` }))}
          onRemove={(id) => set({ placements: o.placements.filter((it) => it.id !== id) })}
          empty="Nothing placed yet."
        />
        {o.placements.length > 0 && (
          <div className="btn-row">
            {o.placements.some((it) => !it.all) && (
              <button type="button" className="btn btn-quiet btn-small" data-testid="sig-all-pages" onClick={() => set({ placements: o.placements.map((it) => (it.kind === 'signature' ? it : { ...it, all: true })) })}>
                Initials and dates on every page
              </button>
            )}
            <button type="button" className="btn btn-quiet btn-small" onClick={() => set({ placements: o.placements.map((it) => ({ ...it, all: !o.placements.every((q) => q.all) })) })}>
              {o.placements.every((q) => q.all) ? 'Only on their own page' : 'Everything on every page'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

export default {
  id: 'sign',
  name: 'Sign',
  io: 'PDF → signed PDF',
  description: 'Type, draw or upload a signature. Initials and dates too.',
  category: 'Security',
  icon: 'sign',
  accepts: { min: 1 },
  defaults: {
    tab: 'signature',
    name: '',
    ink: 'black',
    signature: null,
    initials: null,
    place: 'signature',
    dateFormat: 'iso',
    sigWidth: 25,
    iniWidth: 8,
    placements: [],
  },
  next: ['protect', 'compress', 'merge'],
  Canvas,
  Options,
  summary(files, o) {
    if (files.length === 0) return { ready: false, line: 'Select at least 1 PDF.', runLabel: 'Sign' }
    if (o.placements.length === 0) return { ready: false, line: 'Click on the page to place your signature.', runLabel: 'Sign' }
    const missing = o.placements.find((it) => it.kind !== 'date' && !o[it.kind])
    if (missing) return { ready: false, line: `Create your ${missing.kind} first.`, runLabel: 'Sign' }
    const n = files.length
    return {
      ready: true,
      line: `${plural(n, 'signed PDF')} will be created with ${plural(o.placements.length, 'mark')}.`,
      runLabel: `Sign ${plural(n, 'PDF')}`,
    }
  },
  async run(files, o, ctx) {
    const { stampItems } = await import('../../lib/stampOps.js')
    const date = dateText(o.dateFormat)
    const outputs = []
    for (const [i, f] of files.entries()) {
      ctx.check()
      ctx.progress(i, files.length, `Signing ${f.name}`)
      const items = o.placements
        .filter((it) => it.all || it.page <= f.pageCount)
        .map((it) => {
          const pages = it.all ? 'all' : [it.page]
          if (it.kind === 'date') return { text: date, size: 12, color: INKS[o.ink], pages, fx: it.fx, fy: it.fy }
          return { png: o[it.kind].png, pages, fx: it.fx, fy: it.fy, widthPct: it.widthPct }
        })
      if (items.length === 0) continue
      const bytes = await stampItems(f.bytes, items, { check: ctx.check })
      outputs.push({ name: `${baseName(f.name)}-signed.pdf`, bytes, parentIds: [f.id] })
    }
    if (outputs.length === 0) throw new Error('The placed marks are on pages these files do not have.')
    ctx.progress(files.length, files.length, 'Done')
    return outputs
  },
}
