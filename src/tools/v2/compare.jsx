import { useEffect, useMemo, useRef, useState } from 'react'
import { OptionCards, Segmented } from '../../app/controls.jsx'
import Icon from '../../components/Icon.jsx'
import { baseName } from '../../components/usePdfFiles.js'
import { renderPageImage } from '../../lib/pdfText.js'
import { diffPixels } from '../../lib/compareOps.js'
import './g2.css'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const isChanged = (p) => p.added + p.removed > 0 || p.onlyInA || p.onlyInB
const clip = (s, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}...` : s)

function order(files, o) {
  const two = files.slice(0, 2)
  return o.swap ? [two[1], two[0]] : two
}

function Options({ options: o, setOptions, files }) {
  const set = (fields) => setOptions({ ...o, ...fields })
  const [a, b] = files.length === 2 ? order(files, o) : []
  return (
    <>
      {a && b ? (
        <div className="field">
          <span className="field-label">Files</span>
          <ul className="g2-filelist">
            <li>
              <span className="g2-tag g2-tag-removed">Original</span>
              <span className="g2-filename" title={a.name}>
                {a.name}
              </span>
            </li>
            <li>
              <span className="g2-tag g2-tag-added">Changed</span>
              <span className="g2-filename" title={b.name}>
                {b.name}
              </span>
            </li>
          </ul>
          <div className="btn-row">
            <button type="button" className="btn btn-quiet btn-small" onClick={() => set({ swap: !o.swap })} data-testid="compare-swap">
              Swap original and changed
            </button>
          </div>
        </div>
      ) : (
        <p className="field-help">Select two PDFs in Files: the original and the changed version.</p>
      )}
      <OptionCards
        label="View"
        testId="compare-mode"
        value={o.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'text', title: 'Text changes', caption: 'Every added and removed word, side by side, with a list of changes.' },
          { value: 'overlay', title: 'Visual overlay', caption: 'Pixel differences in colour, for drawings, images and layout.' },
        ]}
      />
      <p className="field-help">The whole document is compared at once, so an inserted or removed page does not mark the pages after it as changed. Both files stay in your workspace; a report PDF is added.</p>
    </>
  )
}

// ---------- report ----------
// The changed version with added words highlighted, after a summary page.
async function buildReport(a, b, res) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const { fontForText } = await import('../../lib/fonts.js')
  const { pageFrame, viewRectToUser } = await import('../../lib/pageFrame.js')
  const src = await PDFDocument.load(b.bytes, { updateMetadata: false })
  const doc = await PDFDocument.create()
  const pages = await doc.copyPages(src, src.getPageIndices())
  pages.forEach((p) => doc.addPage(p))
  const green = rgb(0.32, 0.81, 0.4)
  for (const p of res.pages) {
    if (!p.bPage) continue
    const page = doc.getPage(p.bPage - 1)
    const frame = pageFrame(page)
    if (p.onlyInB) {
      const r = viewRectToUser(frame, 0, 0, frame.width, frame.height)
      page.drawRectangle({ ...r, borderColor: green, borderWidth: 6, opacity: 0, borderOpacity: 0.8 })
      continue
    }
    for (const w of p.addedBoxes) {
      const r = viewRectToUser(frame, w.x, w.y, w.w, w.h)
      page.drawRectangle({ ...r, color: green, opacity: 0.35 })
    }
  }

  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ascii = (s) => s.replace(/[^ -~]/g, '?')
  const write = async (page, text, x, y, size, font = null) => {
    let f = font ?? helv
    let t = text
    if (!font) {
      try {
        f = await fontForText(doc, text)
      } catch {
        f = helv
        t = ascii(text)
      }
    }
    try {
      page.drawText(t, { x, y, size, font: f })
    } catch {
      page.drawText(ascii(text), { x, y, size, font: helv })
    }
  }
  const W = 612
  const H = 792
  let page = doc.insertPage(0, [W, H])
  let y = H - 64
  await write(page, 'Comparison report', 48, y, 20, bold)
  y -= 28
  await write(page, `Original: ${clip(a.name, 70)}`, 48, y, 10)
  y -= 15
  await write(page, `Changed: ${clip(b.name, 70)}`, 48, y, 10)
  y -= 22
  const changedPages = res.pages.filter(isChanged)
  const head = res.identical
    ? 'No differences in the text.'
    : `${plural(res.added, 'word')} added, ${plural(res.removed, 'word')} removed, ${plural(changedPages.length, 'page')} with changes.`
  await write(page, head, 48, y, 11, bold)
  y -= 16
  if (!res.identical) await write(page, 'Added words are highlighted in green on the pages that follow.', 48, y, 10)
  y -= 26
  let page2 = 1
  for (const c of res.changes.slice(0, 400)) {
    if (y < 60) {
      page = doc.insertPage(page2++, [W, H])
      y = H - 64
    }
    const where = c.bPage ? `p. ${c.bPage}` : c.aPage ? `orig. p. ${c.aPage}` : ''
    const what =
      c.kind === 'changed' ? `"${clip(c.removed, 40)}" changed to "${clip(c.added, 40)}"` : c.kind === 'added' ? `added "${clip(c.added, 80)}"` : `removed "${clip(c.removed, 80)}"`
    await write(page, `${where}: ${what}`, 48, y, 9)
    y -= 13
  }
  if (res.changes.length > 400) await write(page, `${res.changes.length - 400} more changes not listed.`, 48, Math.max(40, y), 9)
  return doc.save()
}

export default {
  id: 'compare',
  name: 'Compare',
  io: '2 PDF → differences',
  description: 'Word-level changes, side by side.',
  category: 'Optimize',
  icon: 'compare',
  accepts: { min: 2, max: 2 },
  keepInputs: true,
  defaults: { mode: 'text', swap: false },
  next: ['merge', 'protect'],
  Options,
  summary(files) {
    if (files.length < 2) return { ready: false, line: files.length === 1 ? 'Select one more PDF to compare.' : 'Select 2 PDFs to compare.', runLabel: 'Compare' }
    if (files.length > 2) return { ready: false, line: `Select only 2 PDFs, ${files.length} are selected.`, runLabel: 'Compare' }
    return { ready: true, line: 'A report PDF will be created. Both files stay as they are.', runLabel: 'Compare 2 PDFs' }
  },
  async run(files, o, ctx) {
    const [a, b] = order(files, o)
    const { extractWords } = await import('../../lib/compareOps.js')
    // text extraction needs pdf.js (this page); the diff runs in the worker
    const read = (bytes, what, offset) =>
      extractWords(bytes, (n, t) => {
        ctx.check()
        ctx.progress(offset * t + n, t * 2, `Reading the ${what}, page ${n} of ${t}`)
      })
    const pagesA = await read(a.bytes, 'original', 0)
    const pagesB = await read(b.bytes, 'changed version', 1)
    ctx.progress(1, 1, 'Comparing words')
    const res = await ctx.call('compareDiff', pagesA, pagesB, {})
    ctx.check()
    ctx.progress(1, 1, 'Writing the report')
    const bytes = await buildReport(a, b, res)
    const note = res.identical ? 'No differences in the text.' : `${plural(res.added, 'word')} added, ${plural(res.removed, 'word')} removed.`
    return {
      outputs: [{ name: `${baseName(b.name)}-compared.pdf`, bytes, parentIds: [], note }],
      view: { mode: o.mode, a: { name: a.name, bytes: a.bytes }, b: { name: b.name, bytes: b.bytes }, res },
    }
  },
  Result: CompareView,
}

// ---------- result view ----------
function usePageImage(bytes, page, width) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    setUrl(null)
    if (!bytes || !page) return undefined
    let live = true
    renderPageImage(bytes, page, width).then((u) => live && setUrl(u), () => {})
    return () => {
      live = false
    }
  }, [bytes, page, width])
  return url
}

function Boxes({ boxes, size, kind }) {
  return boxes.slice(0, 3000).map((w, i) => (
    <span
      key={i}
      className={`g2-diff g2-diff-${kind}`}
      style={{ left: `${(w.x / size.w) * 100}%`, top: `${(w.y / size.h) * 100}%`, width: `${(w.w / size.w) * 100}%`, height: `${(w.h / size.h) * 100}%` }}
      title={w.text}
    />
  ))
}

function Side({ label, kind, url, size, boxes, empty }) {
  return (
    <figure className="g2-side">
      <figcaption className="g2-side-label">
        <span className={`g2-swatch g2-swatch-${kind}`} aria-hidden="true" />
        {label}
      </figcaption>
      {size ? (
        <div className="g2-stage" style={{ aspectRatio: `${size.w} / ${size.h}` }}>
          {url ? <img src={url} alt={label} /> : <span className="fc-blank is-loading">PDF</span>}
          {url && <Boxes boxes={boxes} size={size} kind={kind} />}
        </div>
      ) : (
        <p className="g2-empty">{empty}</p>
      )}
    </figure>
  )
}

// Red where the two renders differ, the changed page faded underneath.
function Overlay({ urlA, urlB }) {
  const ref = useRef(null)
  const [share, setShare] = useState(null)
  useEffect(() => {
    if (!urlA || !urlB) return undefined
    let live = true
    const load = (u) =>
      new Promise((res, rej) => {
        const im = new Image()
        im.onload = () => res(im)
        im.onerror = rej
        im.src = u
      })
    Promise.all([load(urlA), load(urlB)]).then(([ia, ib]) => {
      if (!live || !ref.current) return
      const w = ib.naturalWidth
      const h = ib.naturalHeight
      const grab = (im) => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const g = c.getContext('2d', { willReadFrequently: true })
        g.fillStyle = '#fff'
        g.fillRect(0, 0, w, h)
        g.drawImage(im, 0, 0, w, h)
        return g.getImageData(0, 0, w, h)
      }
      const out = grab(ib)
      const share = diffPixels(grab(ia).data, out.data, out.data)
      const c = ref.current
      c.width = w
      c.height = h
      c.getContext('2d').putImageData(out, 0, 0)
      setShare(share)
    }, () => {})
    return () => {
      live = false
    }
  }, [urlA, urlB])
  return (
    <figure className="g2-side g2-overlay">
      <figcaption className="g2-side-label">
        <span className="g2-swatch g2-swatch-removed" aria-hidden="true" />
        Pixels that differ{share != null && <span className="mono"> {(share * 100).toFixed(2)}%</span>}
      </figcaption>
      <div className="g2-stage">
        <canvas ref={ref} data-testid="compare-overlay" aria-label="Overlay of both pages, differences in red" />
      </div>
    </figure>
  )
}

function CompareView({ view }) {
  const { res, a, b } = view
  const [mode, setMode] = useState(view.mode)
  const [onlyChanged, setOnlyChanged] = useState(true)
  const list = useMemo(() => (onlyChanged ? res.pages.filter(isChanged) : res.pages), [res, onlyChanged])
  const [at, setAt] = useState(0)
  const pair = list[Math.min(at, list.length - 1)]
  const urlA = usePageImage(a.bytes, pair?.aPage, 700)
  const urlB = usePageImage(b.bytes, pair?.bPage, 700)
  const changedCount = res.pages.filter(isChanged).length

  const jump = (c) => {
    const i = list.findIndex((p) => (c.bPage && p.bPage === c.bPage) || (!c.bPage && p.aPage === c.aPage))
    if (i >= 0) setAt(i)
  }

  return (
    <section className="g2-compare" aria-label="Differences" data-testid="compare-view">
      <p className="g2-compare-sum" data-testid="compare-summary">
        {res.identical ? (
          'The text of both documents is the same.'
        ) : (
          <>
            <span className="mono">{res.added}</span> words added, <span className="mono">{res.removed}</span> removed, on{' '}
            <span className="mono">{changedCount}</span> of <span className="mono">{res.pages.length}</span> page pairs.
          </>
        )}
        {res.approximate && ' The documents differ a lot, so part of the result is a rough match.'}
      </p>
      <div className="g2-compare-bar">
        <Segmented
          label="View"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'text', title: 'Side by side' },
            { value: 'overlay', title: 'Overlay' },
          ]}
        />
        <label className="check-line">
          <input type="checkbox" checked={onlyChanged} onChange={(e) => (setOnlyChanged(e.target.checked), setAt(0))} />
          Changed pages only
        </label>
      </div>
      {pair ? (
        <>
          <div className="g2-pager">
            <button type="button" className="icon-btn" onClick={() => setAt((i) => Math.max(0, i - 1))} disabled={at === 0} aria-label="Previous page pair">
              <Icon name="left" size={16} />
            </button>
            <span data-testid="compare-page-label">
              {pair.aPage ? `Original p. ${pair.aPage}` : 'Not in the original'}, {pair.bPage ? `changed p. ${pair.bPage}` : 'removed in the changed version'}
              <span className="g2-muted">
                {' '}
                ({at + 1} of {list.length}
                {pair.onlyInB ? ', new page' : pair.onlyInA ? ', page removed' : `, +${pair.added} -${pair.removed}`})
              </span>
            </span>
            <button type="button" className="icon-btn" onClick={() => setAt((i) => Math.min(list.length - 1, i + 1))} disabled={at >= list.length - 1} aria-label="Next page pair">
              <Icon name="right" size={16} />
            </button>
          </div>
          {mode === 'overlay' && pair.aPage && pair.bPage ? (
            <div className="g2-sides g2-sides-one">
              <Overlay urlA={urlA} urlB={urlB} />
            </div>
          ) : (
            <div className="g2-sides">
              <Side label={`Original, ${pair.removed} removed`} kind="removed" url={urlA} size={pair.sizeA} boxes={pair.removedBoxes} empty="This page is not in the original." />
              <Side label={`Changed, ${pair.added} added`} kind="added" url={urlB} size={pair.sizeB} boxes={pair.addedBoxes} empty="This page was removed in the changed version." />
            </div>
          )}
        </>
      ) : (
        <p className="g2-empty">No page has changes.</p>
      )}
      {res.changes.length > 0 && (
        <div className="g2-changes">
          <h3 className="result-next-title">Changes</h3>
          <ol className="g2-change-list" data-testid="compare-changes">
            {res.changes.slice(0, 200).map((c, i) => (
              <li key={i}>
                <button type="button" className="g2-change" onClick={() => jump(c)}>
                  <span className="mono g2-muted">p. {c.bPage ?? c.aPage}</span>
                  {c.removed && <del>{clip(c.removed, 120)}</del>}
                  {c.added && <ins>{clip(c.added, 120)}</ins>}
                </button>
              </li>
            ))}
          </ol>
          {res.changes.length > 200 && <p className="field-help">{res.changes.length - 200} more changes are listed in the report PDF.</p>}
        </div>
      )}
    </section>
  )
}
