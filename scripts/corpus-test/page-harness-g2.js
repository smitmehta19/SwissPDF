// G2 (optimize + security) ops for the corpus runner. Loaded by page-harness.js
// when an op is not in its own table. Same rules: runs in the app page, calls
// the real ops from /src/lib, uploads outputs, returns small JSON facts.

const CHUNK = 8 * 1024 * 1024
async function save(caseId, name, bytes) {
  const url = `/__corpus/out/${encodeURIComponent(caseId)}/${encodeURIComponent(name)}`
  for (let at = 0, part = 0; at < bytes.length || part === 0; at += CHUNK, part++) {
    const res = await fetch(`${url}?part=${part}`, { method: 'POST', body: bytes.subarray(at, at + CHUNK) })
    if (!res.ok) throw new Error(`upload ${name}: ${res.status}`)
  }
  return { name, size: bytes.length }
}

const lib = (name) => import(/* @vite-ignore */ `/src/lib/${name}.js`)

async function canvasPng(canvas) {
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

// Page 1 of a born-digital file as image-only scans in four frames:
//   upright    the scan as is
//   turned     scan lying on its side (90 clockwise), no /Rotate: needs OSD
//   rot90crop  sideways MediaBox + offset CropBox + /Rotate 90 that shows it upright
//   skew       scan tilted by 2.5 degrees: needs deskew
// Returns the bytes per variant and the view size of the source page.
async function scanVariants(src, skewDeg = 2.5) {
  const { renderPageToImage } = await lib('pdfText')
  const { PDFDocument, degrees } = await import('pdf-lib')
  const { pageFrame, placeBox } = await lib('pageFrame')
  const srcDoc = await PDFDocument.load(src, { updateMetadata: false })
  const f0 = pageFrame(srcDoc.getPage(0))
  const W = f0.width
  const H = f0.height
  const img = await renderPageToImage(src, 1, { width: Math.round((W / 72) * 200), format: 'image/png' })
  const bmp = await createImageBitmap(new Blob([img.bytes], { type: 'image/png' }))
  const draw = (cw, w, h, rot = 0) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, w, h)
    g.translate(w / 2, h / 2)
    g.rotate(((cw + rot) * Math.PI) / 180)
    g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2)
    return canvasPng(c)
  }
  const out = {}
  {
    const d = await PDFDocument.create()
    const p = d.addPage([W, H])
    const im = await d.embedPng(img.bytes)
    p.drawImage(im, { x: 0, y: 0, width: W, height: H })
    out.upright = await d.save()
  }
  {
    const d = await PDFDocument.create()
    const p = d.addPage([H, W])
    const im = await d.embedPng(await draw(90, bmp.height, bmp.width))
    p.drawImage(im, { x: 0, y: 0, width: H, height: W })
    out.turned = await d.save()
  }
  {
    const d = await PDFDocument.create()
    const p = d.addPage([H + 80, W + 50])
    p.setCropBox(30, 20, H, W)
    p.setRotation(degrees(90))
    const frame = pageFrame(p)
    const im = await d.embedPng(img.bytes)
    const at = placeBox(frame, 0, 0, W, H)
    p.drawImage(im, { x: at.x, y: at.y, width: W, height: H, rotate: at.rotate })
    out.rot90crop = await d.save()
  }
  {
    const d = await PDFDocument.create()
    const p = d.addPage([W, H])
    const im = await d.embedPng(await draw(0, bmp.width, bmp.height, skewDeg))
    p.drawImage(im, { x: 0, y: 0, width: W, height: H })
    out.skew = await d.save()
  }
  bmp.close?.()
  return { variants: out, W, H, skewDeg }
}

export const OPS = {
  // OCR with the tool's options (langs, textPages, autoRotate, deskew).
  async ocr2(s, [src]) {
    const { ocrPdf } = await lib('ocrOps')
    const res = await ocrPdf(src, s.params)
    const { bytes, text, ...meta } = res
    return { outputs: [await save(s.id, 'ocr.pdf', bytes)], meta: { ...meta, sample: text.slice(0, 300) } }
  },
  // Scans of page 1 in four frames, each OCRed; Node compares word positions
  // with the born-digital source.
  async ocrGeometry(s, [src]) {
    const { ocrPdf } = await lib('ocrOps')
    const { variants, W, H, skewDeg } = await scanVariants(src, s.params.skewDeg)
    const meta = { W, H, skewDeg, variants: {} }
    const outputs = []
    for (const [name, bytes] of Object.entries(variants)) {
      if (s.params.only && !s.params.only.includes(name)) continue
      const res = await ocrPdf(bytes, { textPages: 'force', autoRotate: true, deskew: true, langs: ['eng'] })
      outputs.push(await save(s.id, `scan-${name}.pdf`, bytes))
      outputs.push(await save(s.id, `ocr-${name}.pdf`, res.bytes))
      meta.variants[name] = { totalWords: res.totalWords, rotatedPages: res.rotatedPages }
    }
    return { outputs, meta }
  },
  // Page 1 of a born-digital file as an image-only scan, OCRed in the given
  // languages. Node compares the text with the source.
  async ocrScan(s, [src]) {
    const { ocrPdf } = await lib('ocrOps')
    const { variants } = await scanVariants(src)
    const res = await ocrPdf(variants.upright, { textPages: 'force', langs: s.params.langs })
    return {
      outputs: [await save(s.id, 'scan.pdf', variants.upright), await save(s.id, 'ocr.pdf', res.bytes)],
      meta: { totalWords: res.totalWords, skippedWords: res.skippedWords, sample: res.text.slice(0, 200) },
    }
  },
  // Cancel half way: the op must stop and a later run must still work.
  async ocrCancel(s, [src]) {
    const { ocrPdf } = await lib('ocrOps')
    const ctl = new AbortController()
    const t0 = performance.now()
    let stage = ''
    const p = ocrPdf(src, { textPages: 'force', signal: ctl.signal, onProgress: (d, t, label) => (stage = label) })
    setTimeout(() => ctl.abort(), s.params.after ?? 4000)
    let cancelled = false
    try {
      await p
    } catch (err) {
      cancelled = !!err.cancelled
    }
    const stopMs = Math.round(performance.now() - t0)
    const again = await ocrPdf(src, { textPages: 'force', pages: [1] })
    return { outputs: [await save(s.id, 'ocr.pdf', again.bytes)], meta: { cancelled, stopMs, stage, againWords: again.totalWords } }
  },
  // Auto rotate on a real scan. { turn } first adds that many degrees to every
  // page's /Rotate (the scan as fed in the wrong way round); the tool must
  // bring each page back to its original rotation.
  async autoRotate(s, [src]) {
    const { autoRotatePdf } = await lib('ocrOps')
    const { PDFDocument, degrees } = await import('pdf-lib')
    const d = await PDFDocument.load(src, { updateMetadata: false })
    const before = d.getPages().map((p) => p.getRotation().angle)
    let input = src
    if (s.params.turn) {
      d.getPages().forEach((p, i) => p.setRotation(degrees((before[i] + s.params.turn) % 360)))
      input = await d.save()
    }
    const t0 = performance.now()
    const res = await autoRotatePdf(input, s.params.options ?? {})
    const ms = Math.round(performance.now() - t0)
    const out = await PDFDocument.load(res.bytes, { updateMetadata: false })
    const after = out.getPages().map((p) => ((p.getRotation().angle % 360) + 360) % 360)
    return {
      outputs: [await save(s.id, 'input.pdf', input), await save(s.id, 'rotated.pdf', res.bytes)],
      meta: { ms, before, after, turned: res.turned, pages: res.pages },
    }
  },
  async protect2(s, [src]) {
    const { protectPdf } = await lib('cryptoOps')
    const { user = '', owner = null, deny = [], keyLength = 256 } = s.params
    const bytes = await protectPdf(src, user, owner, { deny, keyLength })
    return { outputs: [await save(s.id, 'protected.pdf', bytes)] }
  },
  async unlock2(s, [src]) {
    const { unlockPdf } = await lib('cryptoOps')
    const t0 = performance.now()
    const res = await unlockPdf(src, s.params.password ?? '')
    const ms = Math.round(performance.now() - t0)
    return { outputs: [await save(s.id, 'unlocked.pdf', res.bytes)], meta: { ms, hadUserPassword: res.hadUserPassword, removed: res.removedRestrictions } }
  },
  // A truncated download: the file minus its last `cut` bytes, through
  // Repair and through intake (what adding the file does).
  async repairTruncated(s, [src]) {
    const { repairPdf } = await lib('mupdfOps')
    const { normalizePdf } = await lib('intake')
    const cut = src.slice(0, src.length - (s.params.cut ?? 2000))
    const { bytes, ...meta } = await repairPdf(cut)
    const intake = await normalizePdf(cut.slice())
    return {
      outputs: [await save(s.id, 'truncated.pdf', cut), await save(s.id, 'repaired.pdf', bytes), await save(s.id, 'intake.pdf', intake.bytes)],
      meta: { ...meta, intakePages: intake.pageCount, intakeNotices: intake.notices },
    }
  },
  async repair2(s, [src]) {
    const { repairPdf } = await lib('mupdfOps')
    const { bytes, ...meta } = await repairPdf(src)
    return { outputs: [await save(s.id, 'repaired.pdf', bytes)], meta }
  },
  async compare2(s, [a, b]) {
    const { comparePdfs } = await lib('compareOps')
    // { removePage: n } compares the file with a copy that lacks page n
    if (s.params.removePage && !b) {
      const { PDFDocument } = await import('pdf-lib')
      const d = await PDFDocument.load(a, { updateMetadata: false })
      d.removePage(s.params.removePage - 1)
      b = await d.save()
    }
    const t0 = performance.now()
    const res = await comparePdfs(a, b)
    const ms = Math.round(performance.now() - t0)
    // { overlay: true } also runs the pixel overlay on every paired page
    let overlay = null
    if (s.params.overlay) {
      const { diffPixels } = await lib('compareOps')
      const { renderPageToImage } = await lib('pdfText')
      const pixels = async (bytes, n, w, h) => {
        const img = await renderPageToImage(bytes, n, { width: 700, format: 'image/png' })
        const bmp = await createImageBitmap(new Blob([img.bytes], { type: 'image/png' }))
        const c = new OffscreenCanvas(w ?? bmp.width, h ?? bmp.height)
        const g = c.getContext('2d')
        g.fillStyle = '#fff'
        g.fillRect(0, 0, c.width, c.height)
        g.drawImage(bmp, 0, 0, c.width, c.height)
        bmp.close()
        return g.getImageData(0, 0, c.width, c.height)
      }
      overlay = []
      for (const p of res.pages) {
        if (!p.aPage || !p.bPage) continue
        const ib = await pixels(b, p.bPage)
        const ia = await pixels(a, p.aPage, ib.width, ib.height)
        overlay.push(Math.round(diffPixels(ia.data, ib.data) * 1e5) / 1e5)
      }
    }
    return {
      outputs: [],
      meta: {
        identical: res.identical,
        added: res.added,
        removed: res.removed,
        changedPages: res.pages.filter((p) => p.added + p.removed > 0 || p.onlyInA || p.onlyInB).map((p) => p.index + 1),
        pairs: res.pairs?.slice(0, 40),
        onlyInA: res.pages.filter((p) => p.onlyInA).map((p) => p.aPage),
        onlyInB: res.pages.filter((p) => p.onlyInB).map((p) => p.bPage),
        approximate: res.approximate,
        overlay,
        ms,
      },
    }
  },
}
