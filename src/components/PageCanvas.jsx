import { useEffect, useRef, useState } from 'react'
import { renderPageImage } from '../lib/pdfText.js'

// Renders one PDF page and maps pointer events to points on the visible page
// (y from top). pageSize must be the visible size (pageFrame.js viewSizes),
// which is what pdf.js renders. Children are overlays in the same space.
export default function PageCanvas({
  bytes,
  pageNum,
  pageSize,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  cursor = 'crosshair',
  children,
  testId = 'page-canvas',
}) {
  const [img, setImg] = useState(null)
  // Displayed pixels per PDF point — overlays use it to size themselves.
  const [scale, setScale] = useState(1)
  const boxRef = useRef(null)

  useEffect(() => {
    let active = true
    setImg(null)
    renderPageImage(bytes, pageNum, 950).then(
      (i) => active && setImg(i),
      () => active && setImg(null),
    )
    return () => {
      active = false
    }
  }, [bytes, pageNum])

  useEffect(() => {
    if (!img || !boxRef.current) return undefined
    const measure = () => {
      const w = boxRef.current?.clientWidth
      if (w) setScale(w / pageSize.width)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(boxRef.current)
    return () => ro.disconnect()
  }, [img, pageSize.width])

  const toPoints = (e) => {
    const rect = boxRef.current.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * pageSize.width,
      y: ((e.clientY - rect.top) / rect.height) * pageSize.height,
    }
  }

  if (!img) return <p className="preview-loading">Rendering page…</p>

  return (
    <div
      ref={boxRef}
      className="crop-stage page-canvas"
      data-testid={testId}
      style={{ cursor, '--page-scale': scale }}
      onMouseDown={(e) => {
        if (onPointerDown) {
          e.preventDefault()
          onPointerDown(toPoints(e), e)
        }
      }}
      onMouseMove={(e) => onPointerMove?.(toPoints(e), e)}
      onMouseUp={(e) => onPointerUp?.(toPoints(e), e)}
      onMouseLeave={(e) => onPointerUp?.(toPoints(e), e)}
    >
      <img src={img} alt={`Page ${pageNum}`} draggable={false} />
      {children}
    </div>
  )
}

// Convert PDF-point geometry into CSS percentages for overlays.
export function pctBox(el, pageSize) {
  return {
    left: `${(el.x / pageSize.width) * 100}%`,
    top: `${(el.y / pageSize.height) * 100}%`,
    width: `${((el.w ?? 0) / pageSize.width) * 100}%`,
    height: `${((el.h ?? 0) / pageSize.height) * 100}%`,
  }
}
