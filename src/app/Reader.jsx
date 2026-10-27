// Reader mode: one file, pages one under the other at reading width, no
// panels. A small rail on the right has page, rotate and close. Esc closes.
// Only the pages near the one being read stay rendered.
import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { renderPageImage } from '../lib/pdfText.js'
import { useFileBytes } from './Viewer.jsx'
import { pageSize } from './viewerData.js'

const KEEP = 3 // pages rendered on each side of the current one

export default function Reader({ file, page: startPage = 1, onClose }) {
  const bytes = useFileBytes(file.id)
  const n = file.pageCount
  const [current, setCurrent] = useState(startPage)
  const [ratio, setRatio] = useState(1.294) // height / width of page 1, until known
  const [ratios, setRatios] = useState({}) // page -> height / width once rendered
  const [images, setImages] = useState({}) // page -> data URL
  const [rot, setRot] = useState(0)
  const [width, setWidth] = useState(() => Math.min(window.innerWidth - 120, 1000))
  const layerRef = useRef(null)
  const scrollRef = useRef(null)
  const pageRefs = useRef([])
  const currentRef = useRef(startPage)

  // focus in, and back to the Reader button when it closes
  useEffect(() => {
    const opener = document.activeElement
    layerRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      opener?.focus?.()
    }
  }, [])

  useEffect(() => {
    const onResize = () => setWidth(Math.min(window.innerWidth - (window.innerWidth < 760 ? 24 : 120), 1000))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!bytes) return
    pageSize(bytes, 1).then((s) => setRatio(s.height / s.width), () => {})
  }, [bytes])

  // start on the page the viewer showed
  useEffect(() => {
    if (startPage > 1) requestAnimationFrame(() => pageRefs.current[startPage - 1]?.scrollIntoView({ block: 'start' }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // render the pages around the current one, drop the rest
  useEffect(() => {
    if (!bytes) return undefined
    let active = true
    const lo = Math.max(1, current - KEEP)
    const hi = Math.min(n, current + KEEP)
    setImages((prev) => Object.fromEntries(Object.entries(prev).filter(([p]) => p >= lo && p <= hi)))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.min(2000, Math.round(width * dpr))
    // start once paging settles, so fast paging does not queue renders of
    // pages already left behind in front of the one on screen
    const timer = setTimeout(async () => {
      // the current page first, then outwards
      const order = [current, ...Array.from({ length: KEEP }, (_, i) => [current + i + 1, current - i - 1]).flat()].filter((p) => p >= lo && p <= hi)
      for (const p of order) {
        if (!active) return
        if (images[p]) continue
        try {
          const [url, size] = await Promise.all([renderPageImage(bytes, p, w), pageSize(bytes, p)])
          if (!active) return
          setImages((prev) => ({ ...prev, [p]: url }))
          setRatios((prev) => (prev[p] ? prev : { ...prev, [p]: size.height / size.width }))
        } catch {
          /* leave the placeholder */
        }
      }
    }, images[current] ? 0 : 160)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [bytes, current, width]) // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const box = scrollRef.current
    if (!box) return
    const mark = box.scrollTop + box.clientHeight / 3
    let p = 1
    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i]
      if (el && el.offsetTop <= mark) p = i + 1
    }
    if (p !== currentRef.current) {
      currentRef.current = p
      setCurrent(p)
    }
  }

  const go = (p) => {
    const to = Math.min(Math.max(1, p), n)
    pageRefs.current[to - 1]?.scrollIntoView({ block: 'start' })
  }

  const close = () => onClose(currentRef.current)
  const turned = rot % 180 !== 0

  return (
    <div
      ref={layerRef}
      className="reader"
      role="dialog"
      aria-modal="true"
      aria-label={`Reading ${file.name}`}
      tabIndex={-1}
      data-testid="reader"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          close()
        } else if (e.key === 'Tab') {
          // focus stays in the reader
          const list = [...e.currentTarget.querySelectorAll('button:not(:disabled)')]
          const i = list.indexOf(document.activeElement)
          e.preventDefault()
          list[e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i + 1) % list.length]?.focus()
        } else if ((e.key === 'PageDown' || e.key === 'ArrowRight') && e.target === e.currentTarget) {
          e.preventDefault()
          go(current + 1)
        } else if ((e.key === 'PageUp' || e.key === 'ArrowLeft') && e.target === e.currentTarget) {
          e.preventDefault()
          go(current - 1)
        }
      }}
    >
      <div className="reader-scroll" ref={scrollRef} onScroll={onScroll} data-testid="reader-scroll">
        <h1 className="sr-only">{file.name}</h1>
        {Array.from({ length: n }, (_, i) => {
          const p = i + 1
          const r = ratios[p] ?? ratio
          const w = turned ? Math.min(width, Math.round(width / r)) : width
          const h = Math.round(w * r)
          return (
            <div
              key={p}
              ref={(el) => (pageRefs.current[i] = el)}
              className="reader-page"
              style={{ width: turned ? h : w, height: turned ? w : h }}
              data-page={p}
            >
              <div className="reader-turn" style={{ width: w, height: h, transform: `translate(-50%, -50%) rotate(${rot}deg)` }}>
                {images[p] ? <img src={images[p]} alt={`Page ${p}`} data-testid="reader-image" draggable="false" /> : <span className="reader-wait mono">{p}</span>}
              </div>
            </div>
          )
        })}
      </div>
      <nav className="reader-rail" aria-label="Reader">
        <button type="button" className="icon-btn" onClick={close} aria-label="Close reader (Esc)" title="Close reader (Esc)" data-testid="reader-close">
          <Icon name="close" size={18} />
        </button>
        <span className="reader-sep" aria-hidden="true" />
        <button type="button" className="icon-btn" onClick={() => go(current - 1)} disabled={current <= 1} aria-label="Previous page">
          <Icon name="left" size={18} className="reader-up" />
        </button>
        <span className="reader-count mono" aria-live="polite" data-testid="reader-count">
          {current}
          <span className="reader-of">/{n}</span>
        </span>
        <button type="button" className="icon-btn" onClick={() => go(current + 1)} disabled={current >= n} aria-label="Next page">
          <Icon name="right" size={18} className="reader-up" />
        </button>
        <span className="reader-sep" aria-hidden="true" />
        <button type="button" className="icon-btn" onClick={() => setRot((x) => (x + 90) % 360)} aria-label="Rotate view" title="Rotate view">
          <Icon name="rotate" size={18} />
        </button>
      </nav>
    </div>
  )
}
