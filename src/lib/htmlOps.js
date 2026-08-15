// HTML → PDF, in-browser. Pasted HTML/markup or an uploaded .html file is
// rendered in a sandboxed offscreen frame and captured to PDF pages.
// (Fetching arbitrary URLs is blocked by browser CORS — the user pastes the
// page source instead, which also keeps everything local.)
import { imagesToPdf, normalizeImage } from './imageOps.js'

const A4_W = 794 // px at 96dpi
const A4_H = 1123

export async function htmlToPdf(html, { pageSize = 'a4', onProgress = () => {} } = {}) {
  if (!html.trim()) throw new Error('Nothing to convert — paste some HTML first.')
  const html2canvas = (await import('html2canvas')).default
  const width = pageSize === 'a4-landscape' ? A4_H : A4_W
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;background:#fff;`
  const holder = document.createElement('div')
  holder.style.cssText = 'padding:40px;font-family:Segoe UI,Arial,sans-serif;color:#111;background:#fff;'
  // Strip scripts: we render markup, never execute it.
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,iframe,object,embed').forEach((el) => el.remove())
  holder.innerHTML = doc.body ? doc.body.innerHTML : html
  host.appendChild(holder)
  document.body.appendChild(host)
  try {
    onProgress('rendering page')
    const canvas = await html2canvas(holder, { scale: 2, backgroundColor: '#ffffff' })
    // slice the tall canvas into page-height chunks
    const pageHeightPx = pageSize === 'a4-landscape' ? A4_W * 2 : A4_H * 2
    const images = []
    const total = Math.max(1, Math.ceil(canvas.height / pageHeightPx))
    for (let i = 0; i < total; i++) {
      onProgress(`building page ${i + 1} of ${total}`)
      const sliceH = Math.min(pageHeightPx, canvas.height - i * pageHeightPx)
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceH
      const ctx = slice.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, slice.width, slice.height)
      ctx.drawImage(canvas, 0, i * pageHeightPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
      const blob = await new Promise((res) => slice.toBlob(res, 'image/png'))
      images.push(await normalizeImage(new Uint8Array(await blob.arrayBuffer())))
    }
    return imagesToPdf(images, { pageSize: pageSize === 'fit' ? 'fit' : pageSize, margin: 0 })
  } finally {
    host.remove()
  }
}
