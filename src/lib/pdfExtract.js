// Layout analysis for PDF -> Office conversion.
//   - text items with font info (bold/italic detection, size)
//   - vector ruling lines from the operator list (real table borders)
//   - lattice table detection (grid from ruling lines, text assigned to cells)
//   - column detection for line-less ("stream") layouts
import { pdfjsLib, serializedPdfOp } from './pdfText.js'

// ---------- matrix helpers ----------
const IDENTITY = [1, 0, 0, 1, 0, 0]
const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
]
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

// ---------- vector line + image extraction ----------
// Walks the operator list, tracking the transform, and collects (a) horizontal
// and vertical segments from paths (table borders) and (b) image placements
// with their true page positions (images draw into a transformed unit square).
function walkOperators(opList) {
  const OPS = pdfjsLib.OPS
  const segments = []
  const imagePlacements = []
  let ctm = IDENTITY
  const stack = []

  const recordImage = (objId, inlineObj = null) => {
    const pts = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ].map(([x, y]) => apply(ctm, x, y))
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const rect = {
      x: Math.min(...xs),
      yTop: Math.max(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    }
    if (rect.w < 6 || rect.h < 6) return // decorative specks
    imagePlacements.push({ objId, inlineObj, rect })
  }

  const addSegment = (x1, y1, x2, y2) => {
    const [ax, ay] = apply(ctm, x1, y1)
    const [bx, by] = apply(ctm, x2, y2)
    if (Math.abs(ax - bx) < 0.6 && Math.abs(ay - by) < 0.6) return
    if (Math.abs(ay - by) < 0.6) {
      segments.push({ dir: 'h', y: (ay + by) / 2, a: Math.min(ax, bx), b: Math.max(ax, bx) })
    } else if (Math.abs(ax - bx) < 0.6) {
      segments.push({ dir: 'v', x: (ax + bx) / 2, a: Math.min(ay, by), b: Math.max(ay, by) })
    }
  }

  const addRect = (x, y, w, h) => {
    // thin filled rects are drawn as lines; real rects contribute their borders
    addSegment(x, y, x + w, y)
    addSegment(x, y + h, x + w, y + h)
    addSegment(x, y, x, y + h)
    addSegment(x + w, y, x + w, y + h)
  }

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i]
    const args = opList.argsArray[i]
    if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() ?? IDENTITY
    else if (fn === OPS.transform) ctm = mul(ctm, args)
    else if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
      recordImage(args[0])
    } else if (fn === OPS.paintInlineImageXObject) {
      recordImage(null, args[0])
    } else if (fn === OPS.constructPath) {
      // pdf.js v5 shape: args = [paintOp, [Float32Array pathData], minMax]
      // pathData is flat [drawOp, coords...]: 0=moveTo(x,y), 1=lineTo(x,y),
      // 2=curveTo(6 coords), 3=closePath.
      const pathHolder = args?.[1]
      const pathData = Array.isArray(pathHolder) ? pathHolder[0] : pathHolder
      if (!pathData || typeof pathData.length !== 'number') continue
      let pi = 0
      let cx = 0
      let cy = 0
      let startX = 0
      let startY = 0
      while (pi < pathData.length) {
        const op = pathData[pi++]
        if (op === 0) {
          cx = pathData[pi++]
          cy = pathData[pi++]
          startX = cx
          startY = cy
        } else if (op === 1) {
          const nx = pathData[pi++]
          const ny = pathData[pi++]
          addSegment(cx, cy, nx, ny)
          cx = nx
          cy = ny
        } else if (op === 2) {
          pi += 6
          cx = pathData[pi - 2]
          cy = pathData[pi - 1]
        } else if (op === 3) {
          addSegment(cx, cy, startX, startY)
          cx = startX
          cy = startY
        } else {
          break // unknown encoding — skip the rest of this path safely
        }
      }
    }
  }
  return { segments, imagePlacements }
}

// Convert a pdf.js image object (ImageBitmap wrapper or raw pixel buffer) to
// PNG bytes for embedding in Office documents.
async function imageObjToPng(img) {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const bitmap = img instanceof ImageBitmap ? img : img?.bitmap
    if (bitmap) {
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      ctx.drawImage(bitmap, 0, 0)
    } else if (img?.data && img.width && img.height) {
      canvas.width = img.width
      canvas.height = img.height
      const imageData = ctx.createImageData(img.width, img.height)
      const src = img.data
      const dst = imageData.data
      if (img.kind === 3 /* RGBA_32BPP */) {
        dst.set(src.subarray(0, dst.length))
      } else if (img.kind === 2 /* RGB_24BPP */) {
        for (let i = 0, j = 0; j < dst.length - 3; i += 3, j += 4) {
          dst[j] = src[i]
          dst[j + 1] = src[i + 1]
          dst[j + 2] = src[i + 2]
          dst[j + 3] = 255
        }
      } else if (img.kind === 1 /* GRAYSCALE_1BPP */) {
        const rowBytes = Math.ceil(img.width / 8)
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const bit = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1
            const j = (y * img.width + x) * 4
            const v = bit ? 255 : 0
            dst[j] = dst[j + 1] = dst[j + 2] = v
            dst[j + 3] = 255
          }
        }
      } else {
        return null
      }
      ctx.putImageData(imageData, 0, 0)
    } else {
      return null
    }
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) return null
    return new Uint8Array(await blob.arrayBuffer())
  } catch {
    return null
  }
}

// Image data arrives from the pdf.js worker asynchronously — the callback form
// of objs.get waits for it (with a timeout so a broken object can't hang us).
function getObjWhenReady(store, objId, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs)
    try {
      store.get(objId, (obj) => {
        clearTimeout(timer)
        resolve(obj)
      })
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
}

async function resolveImages(page, placements) {
  const out = []
  const pngCache = new Map() // objId -> png (same image drawn repeatedly)
  for (const p of placements) {
    let png = null
    if (p.objId && pngCache.has(p.objId)) {
      png = pngCache.get(p.objId)
    } else {
      let obj = p.inlineObj
      if (!obj && p.objId) {
        obj =
          (await getObjWhenReady(page.objs, p.objId)) ??
          (await getObjWhenReady(page.commonObjs, p.objId, 1000))
      }
      png = obj ? await imageObjToPng(obj) : null
      if (p.objId) pngCache.set(p.objId, png)
    }
    if (png) out.push({ ...p.rect, png })
  }
  return out
}

// Merge collinear segments and drop tiny fragments.
function consolidate(segments) {
  const H = []
  const V = []
  for (const s of segments) (s.dir === 'h' ? H : V).push({ ...s })
  const mergeAxis = (list, posKey) => {
    list.sort((s1, s2) => s1[posKey] - s2[posKey] || s1.a - s2.a)
    const out = []
    for (const s of list) {
      const prev = out[out.length - 1]
      if (prev && Math.abs(prev[posKey] - s[posKey]) < 2 && s.a <= prev.b + 3) {
        prev.b = Math.max(prev.b, s.b)
        prev[posKey] = (prev[posKey] + s[posKey]) / 2
      } else {
        out.push(s)
      }
    }
    return out.filter((s) => s.b - s.a > 6)
  }
  return { hLines: mergeAxis(H, 'y'), vLines: mergeAxis(V, 'x') }
}

// ---------- text extraction ----------
function isBoldFont(fontName = '') {
  return /bold|black|heavy|[-+]b$/i.test(fontName)
}
function isItalicFont(fontName = '') {
  return /italic|oblique/i.test(fontName)
}

async function pageData(page) {
  // getOperatorList first: it loads fonts + images into the object stores AND
  // yields the vector paths for table detection.
  const opList = await page.getOperatorList()
  const { segments, imagePlacements } = walkOperators(opList)
  const { hLines, vLines } = consolidate(segments)
  const images = await resolveImages(page, imagePlacements)
  const content = await page.getTextContent()
  const realFontName = (internalName) => {
    try {
      return page.commonObjs.get(internalName)?.name ?? ''
    } catch {
      return ''
    }
  }
  const fontCache = new Map()
  const items = content.items
    .filter((it) => it.str && it.str.trim())
    .map((it) => {
      if (!fontCache.has(it.fontName)) fontCache.set(it.fontName, realFontName(it.fontName))
      const realName = fontCache.get(it.fontName)
      return {
        text: it.str,
        x: it.transform[4],
        y: it.transform[5],
        size: Math.hypot(it.transform[2], it.transform[3]),
        width: it.width,
        bold: isBoldFont(realName),
        italic: isItalicFont(realName),
      }
    })
  const viewport = page.getViewport({ scale: 1 })
  return { items, hLines, vLines, images, width: viewport.width, height: viewport.height }
}

// Interactive form fields (AcroForm widgets) are annotations, not page
// content — text extraction never sees them. Surface them with their boxes.
async function extractFormFields(page) {
  try {
    const annots = await page.getAnnotations()
    return annots
      .filter((a) => a.subtype === 'Widget' && a.rect)
      .map((a) => {
        const [x1, y1, x2, y2] = a.rect
        return {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.abs(x2 - x1),
          h: Math.abs(y2 - y1),
          value:
            typeof a.fieldValue === 'string'
              ? a.fieldValue
              : Array.isArray(a.fieldValue)
                ? a.fieldValue.join(', ')
                : '',
          name: a.fieldName ?? '',
          type: a.fieldType ?? '',
        }
      })
  } catch {
    return []
  }
}

export function extractDocument(bytes) {
  return serializedPdfOp(async () => {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise
    const pages = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const data = await pageData(page)
      data.formFields = await extractFormFields(page)
      pages.push(data)
    }
    await doc.destroy()
    return pages
  })
}

// ---------- lattice tables (from ruling lines) ----------
function cluster(values, tol) {
  const sorted = [...values].sort((a, b) => a - b)
  const out = []
  for (const v of sorted) {
    if (out.length && v - out[out.length - 1].max < tol) {
      const c = out[out.length - 1]
      c.max = v
      c.sum += v
      c.n++
    } else {
      out.push({ min: v, max: v, sum: v, n: 1 })
    }
  }
  return out.map((c) => c.sum / c.n)
}

// Finds grid-shaped regions: >=2 h-lines and >=2 v-lines that mutually span.
export function detectTables(page) {
  const tables = []
  const used = new Set()
  const { hLines, vLines } = page
  if (hLines.length < 2 || vLines.length < 2) return { tables, usedItems: used }

  // group v-lines by overlapping vertical extent to isolate one table region
  const regions = []
  for (const v of vLines) {
    const region = regions.find((r) => Math.min(r.yMax, v.b) - Math.max(r.yMin, v.a) > 5)
    if (region) {
      region.vs.push(v)
      region.yMin = Math.min(region.yMin, v.a)
      region.yMax = Math.max(region.yMax, v.b)
    } else {
      regions.push({ vs: [v], yMin: v.a, yMax: v.b })
    }
  }

  for (const region of regions) {
    if (region.vs.length < 2) continue
    const xs = cluster(region.vs.map((v) => v.x), 4)
    const relevantH = hLines.filter(
      (h) => h.y > region.yMin - 4 && h.y < region.yMax + 4 && h.b > Math.min(...xs) - 4 && h.a < Math.max(...xs) + 4,
    )
    if (relevantH.length < 2) continue
    const ys = cluster(relevantH.map((h) => h.y), 3).sort((a, b) => b - a) // top first
    if (xs.length < 2 || ys.length < 2) continue

    const colBounds = xs.sort((a, b) => a - b)
    const rows = []
    for (let r = 0; r < ys.length - 1; r++) {
      const rowTop = ys[r]
      const rowBottom = ys[r + 1]
      const cells = []
      for (let c = 0; c < colBounds.length - 1; c++) {
        const cellItems = page.items.filter(
          (it) =>
            !used.has(it) &&
            it.y < rowTop &&
            it.y > rowBottom &&
            it.x + it.width / 2 >= colBounds[c] &&
            it.x + it.width / 2 < colBounds[c + 1],
        )
        cellItems.forEach((it) => used.add(it))
        cellItems.sort((a, b) => b.y - a.y || a.x - b.x)
        cells.push(cellItems.map((it) => it.text).join(' ').trim())
      }
      rows.push(cells)
    }
    if (rows.some((row) => row.some((c) => c))) {
      tables.push({ top: ys[0], bottom: ys[ys.length - 1], left: colBounds[0], right: colBounds[colBounds.length - 1], rows })
    }
  }
  tables.sort((t1, t2) => t2.top - t1.top)
  return { tables, usedItems: used }
}

// ---------- stream layout (no ruling lines) ----------
// Groups remaining items into lines, then detects page-wide column boundaries
// from x-histogram valleys so multi-column cells split consistently.
export function buildLines(items) {
  const lines = []
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(3, it.size * 0.4))
    if (line) {
      line.items.push(it)
      line.size = Math.max(line.size, it.size)
      line.y = (line.y + it.y) / 2
    } else {
      lines.push({ y: it.y, size: it.size, items: [it] })
    }
  }
  lines.forEach((l) => l.items.sort((a, b) => a.x - b.x))
  return lines
}

// Column boundaries shared by most lines: x-positions where a gap appears in
// the majority of multi-item lines.
export function detectColumns(lines, pageWidth) {
  const gapVotes = []
  let multiLines = 0
  for (const line of lines) {
    if (line.items.length < 2) continue
    multiLines++
    for (let i = 1; i < line.items.length; i++) {
      const prev = line.items[i - 1]
      const gapStart = prev.x + prev.width
      const gapEnd = line.items[i].x
      if (gapEnd - gapStart > Math.max(10, line.size * 1.1)) {
        gapVotes.push((gapStart + gapEnd) / 2)
      }
    }
  }
  if (multiLines < 2) return []
  const clustered = cluster(gapVotes, Math.max(14, pageWidth * 0.02))
  // keep boundaries voted for by at least 60% of multi-item lines
  return clustered.filter(
    (cx) =>
      gapVotes.filter((v) => Math.abs(v - cx) < Math.max(14, pageWidth * 0.02)).length >=
      Math.max(2, Math.ceil(multiLines * 0.6)),
  )
}

// Split a line's items into cells using shared column boundaries (or per-line
// gaps when no shared boundaries exist).
export function lineCells(line, columnBounds) {
  if (columnBounds.length > 0) {
    const cells = Array.from({ length: columnBounds.length + 1 }, () => [])
    for (const it of line.items) {
      const center = it.x + it.width / 2
      let col = 0
      while (col < columnBounds.length && center > columnBounds[col]) col++
      cells[col].push(it)
    }
    return cells.map((cellItems) => cellItems.map((i) => i.text).join(' ').trim())
  }
  const cells = []
  let current = null
  for (const it of line.items) {
    if (current && it.x - current.endX < Math.max(8, line.size * 1.2)) {
      current.texts.push(it.text)
      current.endX = it.x + it.width
    } else {
      current = { texts: [it.text], endX: it.x + it.width }
      cells.push(current)
    }
  }
  return cells.map((c) => c.texts.join(' ').trim())
}
