import { useEffect, useRef, useState } from 'react'
import FileDropZone from '../components/FileDropZone.jsx'
import { baseName } from '../components/usePdfFiles.js'
import { loadPdf, assertValidOutput } from '../lib/pdfOps.js'
import { signPdf } from '../lib/stampOps.js'
import { renderPageImage } from '../lib/pdfText.js'
import { downloadBytes, formatBytes } from '../lib/download.js'

// Draw-a-signature pad: black ink on a transparent canvas.
function SignaturePad({ onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  const pos = (e) => {
    const box = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  const start = (e) => {
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#101828'
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  const move = (e) => {
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    dirty.current = true
  }
  const end = async () => {
    if (!drawing.current) return
    drawing.current = false
    if (dirty.current) {
      const blob = await new Promise((res) => canvasRef.current.toBlob(res, 'image/png'))
      onChange(new Uint8Array(await blob.arrayBuffer()))
    }
  }
  const clear = () => {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    dirty.current = false
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={420}
        height={140}
        className="sign-pad"
        data-testid="sign-pad"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
      />
      <button className="link-btn" onClick={clear}>
        Clear signature
      </button>
    </div>
  )
}

function typedSignaturePng(name) {
  const canvas = document.createElement('canvas')
  canvas.width = 560
  canvas.height = 140
  const ctx = canvas.getContext('2d')
  ctx.font = 'italic 64px "Segoe Script", "Brush Script MT", cursive'
  ctx.fillStyle = '#101828'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, 16, 74)
  return new Promise((res) =>
    canvas.toBlob(async (b) => res(new Uint8Array(await b.arrayBuffer())), 'image/png'),
  )
}

export default function SignTool() {
  const [file, setFile] = useState(null) // { name, bytes, pageCount }
  const [pageNum, setPageNum] = useState(1)
  const [pageImg, setPageImg] = useState(null)
  const [mode, setMode] = useState('draw') // 'draw' | 'type' | 'upload'
  const [typedName, setTypedName] = useState('')
  const [sigPng, setSigPng] = useState(null)
  const [sigPreviewUrl, setSigPreviewUrl] = useState(null)
  const [spot, setSpot] = useState(null) // { fx, fy }
  const [widthPct, setWidthPct] = useState(25)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const imgBoxRef = useRef(null)

  useEffect(() => {
    if (!sigPng) {
      setSigPreviewUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(new Blob([sigPng], { type: 'image/png' }))
    setSigPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [sigPng])

  const onFiles = async ([f]) => {
    setStatus(null)
    setSpot(null)
    try {
      const bytes = await f.arrayBuffer()
      const doc = await loadPdf(bytes)
      setFile({ name: f.name, bytes, pageCount: doc.getPageCount() })
      setPageNum(1)
      setPageImg(await renderPageImage(bytes, 1, 900))
    } catch (err) {
      setFile(null)
      setStatus({ kind: 'error', text: err.message })
    }
  }

  const gotoPage = async (n) => {
    if (!file || n < 1 || n > file.pageCount) return
    setPageNum(n)
    setSpot(null)
    setPageImg(null)
    setPageImg(await renderPageImage(file.bytes, n, 900))
  }

  const useTyped = async () => {
    if (!typedName.trim()) return
    setSigPng(await typedSignaturePng(typedName.trim()))
  }

  const placeAt = (e) => {
    const box = imgBoxRef.current.getBoundingClientRect()
    setSpot({
      fx: (e.clientX - box.left) / box.width,
      fy: (e.clientY - box.top) / box.height,
    })
  }

  const apply = async () => {
    setBusy(true)
    setStatus(null)
    try {
      if (!sigPng) throw new Error('Create your signature first (draw, type, or upload).')
      if (!spot) throw new Error('Click on the page where the signature should go.')
      const bytes = await signPdf(file.bytes, sigPng, { pageNum, fx: spot.fx, fy: spot.fy, widthPct })
      await assertValidOutput(bytes)
      const name = `${baseName(file.name)}-signed.pdf`
      downloadBytes(bytes, name)
      setStatus({ kind: 'ok', text: `Created ${name} (${formatBytes(bytes.length)}) — download started.` })
    } catch (err) {
      setStatus({ kind: 'error', text: `Sign failed: ${err.message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tool-body">
      {!file && <FileDropZone onFiles={onFiles} accept={['.pdf']} multiple={false} />}
      {!file && (
        <p className="option-help">
          A visual signature, like signing on paper — not a cryptographic certificate.
        </p>
      )}

      {file && (
        <div className="workspace">
          <div className="workspace-main">
            <div className="options-panel">
              <div className="option-row">
                <strong>{file.name}</strong>
                <button className="back-link" onClick={() => { setFile(null); setSigPng(null); setStatus(null) }}>
                  Choose a different file
                </button>
                <span style={{ flex: 1 }} />
                <button className="toggle-btn" onClick={() => gotoPage(pageNum - 1)} disabled={pageNum <= 1}>
                  ← Prev
                </button>
                <span className="option-help">
                  Page {pageNum} of {file.pageCount}
                </span>
                <button className="toggle-btn" onClick={() => gotoPage(pageNum + 1)} disabled={pageNum >= file.pageCount}>
                  Next →
                </button>
              </div>
              <div className="option-row">
                {[
                  ['draw', 'Draw'],
                  ['type', 'Type'],
                  ['upload', 'Upload image'],
                ].map(([v, label]) => (
                  <label key={v} className="option-inline">
                    <input type="radio" name="sig-mode" checked={mode === v} onChange={() => setMode(v)} />
                    <span>{label}</span>
                  </label>
                ))}
                <span>Size</span>
                <input type="range" min="10" max="60" value={widthPct} onChange={(e) => setWidthPct(Number(e.target.value))} />
                <span className="option-help">{widthPct}% of page width</span>
              </div>
              {mode === 'draw' && <SignaturePad onChange={setSigPng} />}
              {mode === 'type' && (
                <div className="option-row">
                  <input
                    className="text-input"
                    style={{ flex: 1 }}
                    data-testid="sig-name"
                    placeholder="Type your full name"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    onBlur={useTyped}
                  />
                  <button className="toggle-btn" onClick={useTyped}>
                    Use this
                  </button>
                </div>
              )}
              {mode === 'upload' && (
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  onChange={async (e) => {
                    const f = e.target.files[0]
                    if (!f) return
                    const { normalizeImage } = await import('../lib/imageOps.js')
                    try {
                      const norm = await normalizeImage(await f.arrayBuffer())
                      // ensure PNG bytes for embedding with transparency support
                      setSigPng(
                        norm.type === 'png'
                          ? norm.bytes
                          : await (async () => {
                              const bmp = await createImageBitmap(new Blob([norm.bytes]))
                              const c = document.createElement('canvas')
                              c.width = bmp.width
                              c.height = bmp.height
                              c.getContext('2d').drawImage(bmp, 0, 0)
                              const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
                              return new Uint8Array(await blob.arrayBuffer())
                            })(),
                      )
                      setStatus(null)
                    } catch (err) {
                      setStatus({ kind: 'error', text: err.message })
                    }
                  }}
                />
              )}
            </div>

            <p className="option-help">
              {spot
                ? 'Signature placed — click elsewhere to move it, then download.'
                : 'Click on the page where the signature should go.'}
            </p>

            {!pageImg ? (
              <p className="preview-loading">Rendering page…</p>
            ) : (
              <div ref={imgBoxRef} className="crop-stage" data-testid="sign-stage" onClick={placeAt}>
                <img src={pageImg} alt={`Page ${pageNum}`} draggable={false} />
                {spot && sigPreviewUrl && (
                  <img
                    src={sigPreviewUrl}
                    alt="signature preview"
                    className="sign-ghost"
                    data-testid="sign-ghost"
                    style={{
                      left: `${spot.fx * 100}%`,
                      top: `${spot.fy * 100}%`,
                      width: `${widthPct}%`,
                    }}
                  />
                )}
              </div>
            )}

            <div className="action-bar">
              <button className="primary-btn" data-testid="sign-btn" onClick={apply} disabled={busy || !sigPng || !spot}>
                {busy ? 'Signing…' : 'Sign & download'}
              </button>
            </div>

            {status && (
              <p className={`status status-${status.kind}`} data-testid="status">
                {status.text}
              </p>
            )}
          </div>
        </div>
      )}

      {!file && status && (
        <p className={`status status-${status.kind}`} data-testid="status">
          {status.text}
        </p>
      )}
    </div>
  )
}
